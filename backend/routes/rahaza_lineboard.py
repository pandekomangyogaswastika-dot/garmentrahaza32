"""
PT Rahaza — New Production Line Board (Per-PO/WO centric)

Endpoints (prefix /api/rahaza):
  GET  /lineboard/po-list                   — Active POs with WO summary + overall progress
  GET  /lineboard/board/{order_id}          — Full board for 1 PO: all WOs × all processes
  GET  /lineboard/sequential-check          — Available qty check for a WO+process
  POST /process-assignments                 — Assign employee to process (per PO)
  GET  /process-assignments                 — List assignments by order_id / process_id
  DELETE /process-assignments/{aid}         — Remove assignment

Sequential Flow:
  RAJUT(1) → LINKING(2) → SEWING_S1(3.1) → SEWING_S2(3.2) → SEWING_S3(3.3) → STEAM(4) → QC(5) → PACKING(6)

Available qty per process per WO:
  RAJUT      : wo.qty - Σ(wip_events[RAJUT, wo_id].qty)
  LINKING    : Σ(wip[RAJUT, wo]) - Σ(wip[LINKING, wo])
  SEWING_S1  : Σ(wip[LINKING, wo]) - Σ(wip[SEWING_S1, wo])
  SEWING_S2  : Σ(wip[SEWING_S1, wo]) - Σ(wip[SEWING_S2, wo])
  SEWING_S3  : Σ(wip[SEWING_S2, wo]) - Σ(wip[SEWING_S3, wo])
  STEAM      : Σ(wip[SEWING_S3, wo]) - Σ(wip[STEAM, wo])
  QC         : Σ(wip[STEAM, wo]) - Σ(wip[QC, wo])
  PACKING    : Σ(wip_qc_pass[wo]) - Σ(wip[PACKING, wo])
"""
from fastapi import APIRouter, Request, HTTPException, Query
from database import get_db
from auth import require_auth, serialize_doc, log_activity
import uuid
from datetime import datetime, timezone, date
from typing import Optional
from collections import defaultdict

router = APIRouter(prefix="/api/rahaza", tags=["rahaza-lineboard"])


def _uid(): return str(uuid.uuid4())
def _now(): return datetime.now(timezone.utc)


# ── Ordered process flow for sequential check ─────────────────────────────────
PROCESS_FLOW = ["RAJUT", "LINKING", "SEWING_S1", "SEWING_S2", "SEWING_S3", "STEAM", "QC", "PACKING"]

# Sewing group — shown as 1 card with sub-sections in the UI
SEWING_CODES = {"SEWING_S1", "SEWING_S2", "SEWING_S3"}

# For QC process, available qty comes from QC-pass events, not raw STEAM events
QC_PASS_EVENT_TYPE = "qc_pass"


async def _require_board_access(request: Request):
    user = await require_auth(request)
    role = (user.get("role") or "").lower()
    if role in ("superadmin", "admin", "owner", "supervisor", "operator"):
        return user
    perms = user.get("_permissions") or []
    if "*" in perms or any(p in perms for p in ["prod.process.input", "prod.line.manage", "prod.board.view"]):
        return user
    raise HTTPException(403, "Forbidden: butuh akses produksi board.")


async def _compute_wip_by_process_and_wo(db, order_id: str) -> dict:
    """
    Returns: {wo_id: {process_code: qty_total, 'qc_pass': X, 'qc_fail': Y, 'rework_pass': Z, 'rework_fail': W, 'pending_rework': P}}
    For QC events: counts qc_pass separately.
    Also handles legacy SEWING code by mapping to SEWING_S1.
    NEW (R4): Also aggregates QC and Rework event types for rework visibility.
    """
    # Get all WOs for this order
    wos = await db.rahaza_work_orders.find(
        {"order_id": order_id}, {"_id": 0, "id": 1}
    ).to_list(None)
    wo_ids = [w["id"] for w in wos]
    if not wo_ids:
        return {}

    # Get all WIP events for these WOs
    events = await db.rahaza_wip_events.find(
        {"work_order_id": {"$in": wo_ids}},
        {"_id": 0, "work_order_id": 1, "process_code": 1, "event_type": 1, "qty": 1}
    ).to_list(None)

    result = defaultdict(lambda: defaultdict(float))

    for ev in events:
        wo_id = ev.get("work_order_id")
        code = (ev.get("process_code") or "").upper()
        qty = float(ev.get("qty") or 0)
        etype = (ev.get("event_type") or "output").lower()

        if not wo_id or qty <= 0:
            continue

        # Map legacy SEWING to SEWING_S1
        if code == "SEWING":
            code = "SEWING_S1"

        # For QC: count qc_pass as QC-completed, and qc_fail separately
        if etype in ("qc_pass", "output") and code == "QC":
            result[wo_id]["QC_PASS"] += qty
        if etype == "output" and code in PROCESS_FLOW:
            result[wo_id][code] += qty
        elif etype == "qc_pass":
            result[wo_id]["QC_PASS"] += qty
            result[wo_id]["QC"] += qty
            result[wo_id]["qc_pass_qty"] += qty  # NEW (R4)
        elif etype == "qc_fail":
            result[wo_id]["qc_fail_qty"] += qty  # NEW (R4)
        elif etype == "rework_pass":
            result[wo_id]["rework_pass_qty"] += qty  # NEW (R4)
        elif etype == "rework_fail":
            result[wo_id]["rework_fail_qty"] += qty  # NEW (R4)
        elif etype in ("output",) and code in ("RAJUT", "LINKING", "SEWING_S1", "SEWING_S2", "SEWING_S3", "STEAM", "PACKING"):
            pass  # already counted above
    
    # NEW (R4): Compute pending rework per WO
    for wo_id in result:
        qc_fail = result[wo_id].get("qc_fail_qty", 0)
        rework_pass = result[wo_id].get("rework_pass_qty", 0)
        rework_fail = result[wo_id].get("rework_fail_qty", 0)
        result[wo_id]["pending_rework_pcs"] = max(0, qc_fail - rework_pass - rework_fail)

    return dict({k: dict(v) for k, v in result.items()})


def _compute_availability(process_code: str, wo_qty: int, wip: dict) -> dict:
    """
    Returns: {available, prev_output, this_input, locked}
    """
    flow = PROCESS_FLOW
    if process_code not in flow:
        return {"available": 0, "prev_output": 0, "this_input": 0, "locked": True, "reason": "unknown_process"}

    idx = flow.index(process_code)
    this_input = wip.get(process_code, 0)

    if idx == 0:  # RAJUT — first process, available = wo.qty
        prev_output = wo_qty
        available = max(0, wo_qty - this_input)
        return {"available": available, "prev_output": prev_output, "this_input": this_input,
                "locked": False, "reason": None}

    # For all subsequent processes: prev_output = output of previous flow step
    prev_code = flow[idx - 1]

    if process_code == "PACKING":
        # PACKING available from QC pass events
        prev_output = wip.get("QC_PASS", 0)
    else:
        prev_output = wip.get(prev_code, 0)

    available = max(0, prev_output - this_input)
    locked = prev_output <= 0

    reason = None
    if locked:
        reason = f"{prev_code} belum ada output"

    return {
        "available": available,
        "prev_output": prev_output,
        "this_input": this_input,
        "locked": locked,
        "reason": reason,
    }


# ── PO List ────────────────────────────────────────────────────────────────────
@router.get("/lineboard/po-list")
async def lineboard_po_list(request: Request):
    """Returns active POs with WO count + overall progress summary."""
    await _require_board_access(request)
    db = get_db()

    orders = await db.rahaza_orders.find(
        {"status": {"$in": ["confirmed", "in_production"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)

    result = []
    for o in orders:
        oid = o.get("id")
        wos = await db.rahaza_work_orders.find(
            {"order_id": oid, "status": {"$nin": ["cancelled"]}},
            {"_id": 0, "id": 1, "qty": 1, "status": 1}
        ).to_list(None)

        total_qty = sum(w.get("qty", 0) for w in wos)
        completed = sum(w.get("qty", 0) for w in wos if w.get("status") == "completed")
        wo_count = len(wos)

        # Overall packing output (as progress proxy)
        wo_ids = [w["id"] for w in wos]
        packing_out = 0
        if wo_ids:
            agg = await db.rahaza_wip_events.aggregate([
                {"$match": {"work_order_id": {"$in": wo_ids}, "process_code": "PACKING", "event_type": "output"}},
                {"$group": {"_id": None, "total": {"$sum": "$qty"}}}
            ]).to_list(None)
            packing_out = (agg[0]["total"] if agg else 0)

        progress_pct = round((packing_out / total_qty * 100), 1) if total_qty > 0 else 0

        result.append({
            "order_id": oid,
            "order_number": o.get("order_number", ""),
            "customer_name": o.get("customer_name_snapshot") or o.get("customer_name", ""),
            "status": o.get("status"),
            "delivery_date": o.get("delivery_date"),
            "total_qty": total_qty,
            "wo_count": wo_count,
            "packing_output": packing_out,
            "progress_pct": progress_pct,
        })

    return serialize_doc(result)


# ── Full Board for 1 PO ────────────────────────────────────────────────────────
@router.get("/lineboard/board/{order_id}")
async def lineboard_board(order_id: str, request: Request):
    """
    Returns complete board data for 1 PO:
    - PO header info
    - Process list (with sub-process structure for SEWING)
    - For each process × WO: availability, progress, assigned employees
    """
    await _require_board_access(request)
    db = get_db()

    # Load order
    order = await db.rahaza_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order tidak ditemukan")

    # Load WOs for this order (exclude cancelled)
    wos = await db.rahaza_work_orders.find(
        {"order_id": order_id, "status": {"$nin": ["cancelled"]}},
        {"_id": 0, "id": 1, "wo_number": 1, "model_id": 1, "size_id": 1,
         "model_name": 1, "size_name": 1, "qty": 1, "status": 1, "process_rates": 1}
    ).sort("wo_number", 1).to_list(None)

    if not wos:
        return serialize_doc({
            "order": order,
            "processes": [],
            "wos": [],
            "board": {},
            "employees_by_process": {},
        })

    # ── Enrich model_name / size_name + has_image via join if missing ────────
    missing_model_ids = list({w["model_id"] for w in wos if w.get("model_id") and not w.get("model_name")})
    all_model_ids = list({w["model_id"] for w in wos if w.get("model_id")})
    missing_size_ids  = list({w["size_id"]  for w in wos if w.get("size_id")  and not w.get("size_name")})
    model_join, size_join = {}, {}
    model_has_image = {}
    if missing_model_ids:
        docs = await db.rahaza_models.find({"id": {"$in": missing_model_ids}}, {"_id": 0, "id": 1, "name": 1, "code": 1}).to_list(None)
        model_join = {d["id"]: d.get("name") or d.get("code") or "" for d in docs}
    if all_model_ids:
        # Check which models have images
        docs = await db.rahaza_models.find(
            {"id": {"$in": all_model_ids}},
            {"_id": 0, "id": 1, "image_content_type": 1}
        ).to_list(None)
        model_has_image = {d["id"]: bool(d.get("image_content_type")) for d in docs}
    if missing_size_ids:
        docs = await db.rahaza_sizes.find({"id": {"$in": missing_size_ids}}, {"_id": 0, "id": 1, "name": 1, "code": 1}).to_list(None)
        size_join = {d["id"]: d.get("code") or d.get("name") or "" for d in docs}
    for w in wos:
        if not w.get("model_name") and w.get("model_id"):
            w["model_name"] = model_join.get(w["model_id"], "")
        if not w.get("size_name") and w.get("size_id"):
            w["size_name"] = size_join.get(w["size_id"], "")
        w["has_image"] = model_has_image.get(w.get("model_id", ""), False)

    wo_ids = [w["id"] for w in wos]
    wo_map = {w["id"]: w for w in wos}

    # Load processes (active, ordered)
    processes = await db.rahaza_processes.find(
        {"active": True, "is_rework": False},
        {"_id": 0}
    ).sort([("order_seq", 1), ("sub_order", 1)]).to_list(None)

    # Filter to only PROCESS_FLOW (not legacy SEWING)
    processes = [p for p in processes if p.get("code") in PROCESS_FLOW]

    # Load WIP totals per process per WO
    wip_by_wo = await _compute_wip_by_process_and_wo(db, order_id)

    # Load process assignments for this order
    assignments = await db.rahaza_process_assignments.find(
        {"order_id": order_id},
        {"_id": 0}
    ).to_list(None)

    # Get unique employee IDs and load employee info
    emp_ids = list({a.get("employee_id") for a in assignments if a.get("employee_id")})
    emp_map = {}
    if emp_ids:
        emps = await db.rahaza_employees.find(
            {"id": {"$in": emp_ids}},
            {"_id": 0, "id": 1, "name": 1, "employee_code": 1, "job_title": 1}
        ).to_list(None)
        emp_map = {e["id"]: e for e in emps}

    # Build process → [assignment_ids + employee info]
    emp_by_process = defaultdict(list)
    for a in assignments:
        pid = a.get("process_id")
        eid = a.get("employee_id")
        emp = emp_map.get(eid, {})
        emp_by_process[pid].append({
            "assignment_id": a.get("id"),
            "employee_id": eid,
            "employee_code": emp.get("employee_code", ""),
            "employee_name": emp.get("name", ""),
            "job_title": emp.get("job_title", ""),
        })

    # Build board: {process_id: [{wo row with availability}]}
    board = {}
    for proc in processes:
        proc_id = proc["id"]
        pcode = proc["code"]
        proc_rows = []
        for wo in wos:
            wo_id = wo["id"]
            wo_wip = wip_by_wo.get(wo_id, {})
            avail = _compute_availability(pcode, wo.get("qty", 0), wo_wip)
            this_input = wo_wip.get(pcode, 0)
            
            # NEW (R4): Include QC/Rework aggregates per WO
            qc_pass_qty = wo_wip.get("qc_pass_qty", 0)
            qc_fail_qty = wo_wip.get("qc_fail_qty", 0)
            rework_pass_qty = wo_wip.get("rework_pass_qty", 0)
            rework_fail_qty = wo_wip.get("rework_fail_qty", 0)
            pending_rework_pcs = wo_wip.get("pending_rework_pcs", 0)
            
            proc_rows.append({
                "wo_id": wo_id,
                "wo_number": wo.get("wo_number", ""),
                "model_name": wo.get("model_name", ""),
                "size_name": wo.get("size_name", ""),
                "wo_qty": wo.get("qty", 0),
                "wo_status": wo.get("status", ""),
                "this_process_input": this_input,
                "available": avail["available"],
                "prev_output": avail["prev_output"],
                "locked": avail["locked"],
                "lock_reason": avail.get("reason"),
                "progress_pct": round((this_input / wo.get("qty", 1) * 100), 1) if wo.get("qty", 0) > 0 else 0,
                # NEW (R4): QC/Rework data
                "qc_pass_qty": int(qc_pass_qty),
                "qc_fail_qty": int(qc_fail_qty),
                "rework_pass_qty": int(rework_pass_qty),
                "rework_fail_qty": int(rework_fail_qty),
                "pending_rework_pcs": int(pending_rework_pcs),
            })
        board[proc_id] = {
            "process": proc,
            "assigned_employees": emp_by_process.get(proc_id, []),
            "wo_rows": proc_rows,
        }

    # Overall summary
    total_qty = sum(w.get("qty", 0) for w in wos)
    packing_out = sum(wip_by_wo.get(w["id"], {}).get("PACKING", 0) for w in wos)
    overall_pct = round((packing_out / total_qty * 100), 1) if total_qty > 0 else 0

    return serialize_doc({
        "order": {
            "id": order.get("id"),
            "order_number": order.get("order_number", ""),
            "customer_name": order.get("customer_name_snapshot") or order.get("customer_name", ""),
            "delivery_date": order.get("delivery_date"),
            "status": order.get("status"),
            "total_qty": total_qty,
            "packing_output": packing_out,
            "overall_pct": overall_pct,
        },
        "processes": processes,
        "wos": wos,
        "board": board,
    })


# ── Sequential Availability Check ─────────────────────────────────────────────
@router.get("/lineboard/sequential-check")
async def sequential_check(
    request: Request,
    work_order_id: str = Query(...),
    process_code: str = Query(...),
):
    """Returns available qty for a specific WO + process."""
    await _require_board_access(request)
    db = get_db()
    pcode = process_code.upper().strip()

    wo = await db.rahaza_work_orders.find_one({"id": work_order_id}, {"_id": 0, "qty": 1, "order_id": 1})
    if not wo:
        raise HTTPException(404, "Work Order tidak ditemukan")

    # Load wip for this specific WO only
    events = await db.rahaza_wip_events.find(
        {"work_order_id": work_order_id},
        {"_id": 0, "process_code": 1, "event_type": 1, "qty": 1}
    ).to_list(None)

    wo_wip = defaultdict(float)
    for ev in events:
        code = (ev.get("process_code") or "").upper()
        qty = float(ev.get("qty") or 0)
        etype = (ev.get("event_type") or "output").lower()
        if code == "SEWING":
            code = "SEWING_S1"
        if etype == "output" and code in PROCESS_FLOW:
            wo_wip[code] += qty
        elif etype == "qc_pass":
            wo_wip["QC"] += qty
            wo_wip["QC_PASS"] += qty

    avail = _compute_availability(pcode, wo.get("qty", 0), dict(wo_wip))
    return serialize_doc({
        "work_order_id": work_order_id,
        "process_code": pcode,
        **avail,
    })


# ── Process Assignments CRUD ───────────────────────────────────────────────────
@router.get("/process-assignments")
async def list_process_assignments(
    request: Request,
    order_id: Optional[str] = Query(None),
    process_id: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
):
    await _require_board_access(request)
    db = get_db()
    q = {}
    if order_id:   q["order_id"] = order_id
    if process_id: q["process_id"] = process_id
    if employee_id: q["employee_id"] = employee_id
    rows = await db.rahaza_process_assignments.find(q, {"_id": 0}).to_list(None)
    return serialize_doc(rows)


@router.post("/process-assignments")
async def create_process_assignment(request: Request):
    """Assign an employee to a process for a specific PO."""
    user = await _require_board_access(request)
    db = get_db()
    body = await request.json()

    order_id = (body.get("order_id") or "").strip()
    process_id = (body.get("process_id") or "").strip()
    employee_id = (body.get("employee_id") or "").strip()

    if not (order_id and process_id and employee_id):
        raise HTTPException(400, "order_id, process_id, employee_id wajib diisi.")

    # Verify entities exist
    order = await db.rahaza_orders.find_one({"id": order_id}, {"_id": 0, "order_number": 1})
    if not order:
        raise HTTPException(404, "Order tidak ditemukan")
    proc = await db.rahaza_processes.find_one({"id": process_id}, {"_id": 0, "code": 1, "name": 1})
    if not proc:
        raise HTTPException(404, "Proses tidak ditemukan")
    # Verify employee has payroll profile
    emp = await db.rahaza_employees.find_one({"id": employee_id}, {"_id": 0, "id": 1, "name": 1})
    if not emp:
        raise HTTPException(404, "Karyawan tidak ditemukan")

    # Check duplicate
    existing = await db.rahaza_process_assignments.find_one({
        "order_id": order_id,
        "process_id": process_id,
        "employee_id": employee_id,
    })
    if existing:
        raise HTTPException(409, "Karyawan sudah di-assign ke proses ini untuk PO tersebut.")

    doc = {
        "id": _uid(),
        "order_id": order_id,
        "order_number": order.get("order_number", ""),
        "process_id": process_id,
        "process_code": proc.get("code", ""),
        "process_name": proc.get("name", ""),
        "employee_id": employee_id,
        "employee_name": emp.get("name", ""),
        "created_at": _now(),
        "created_by": user["id"],
    }
    await db.rahaza_process_assignments.insert_one(doc)
    await log_activity(user["id"], user.get("name", ""), "create", "rahaza.process_assignment", doc["id"])
    return serialize_doc(doc)


@router.delete("/process-assignments/{aid}")
async def delete_process_assignment(aid: str, request: Request):
    user = await _require_board_access(request)
    db = get_db()
    existing = await db.rahaza_process_assignments.find_one({"id": aid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Assignment tidak ditemukan")
    await db.rahaza_process_assignments.delete_one({"id": aid})
    await log_activity(user["id"], user.get("name", ""), "delete", "rahaza.process_assignment", aid)
    return {"status": "deleted"}


# ── Quick Output via New Board (with sequential validation) ────────────────────
@router.post("/lineboard/quick-output")
async def lineboard_quick_output(request: Request):
    """
    Input output via new lineboard with strict sequential validation.
    Body: {work_order_id, process_id, process_code, qty_pcs, lusin, pcs_extra, notes, operator_id}
    """
    user = await _require_board_access(request)
    db = get_db()
    body = await request.json()

    work_order_id = (body.get("work_order_id") or "").strip()
    process_code = (body.get("process_code") or "").upper().strip()
    process_id = (body.get("process_id") or "").strip()
    operator_id = body.get("operator_id") or user["id"]
    notes = body.get("notes") or ""

    # Calculate qty from lusin + pcs_extra
    lusin = int(body.get("lusin") or 0)
    pcs_extra = int(body.get("pcs_extra") or 0)
    qty_pcs_input = lusin * 12 + pcs_extra
    # Also accept direct qty_pcs for backward compat
    if qty_pcs_input == 0:
        qty_pcs_input = int(body.get("qty_pcs") or body.get("qty") or 0)

    if qty_pcs_input <= 0:
        raise HTTPException(400, "Qty harus lebih dari 0.")

    if not work_order_id or not process_code:
        raise HTTPException(400, "work_order_id dan process_code wajib diisi.")

    # Validate WO
    wo = await db.rahaza_work_orders.find_one({"id": work_order_id}, {"_id": 0})
    if not wo:
        raise HTTPException(404, "Work Order tidak ditemukan")
    if wo.get("status") not in ("in_production", "released"):
        raise HTTPException(400, f"WO status '{wo.get('status')}' tidak bisa menerima input produksi.")

    # Get process info
    if not process_id:
        proc = await db.rahaza_processes.find_one({"code": process_code, "active": True}, {"_id": 0})
        if proc:
            process_id = proc["id"]

    # Map legacy SEWING to SEWING_S1
    if process_code == "SEWING":
        process_code = "SEWING_S1"
        proc = await db.rahaza_processes.find_one({"code": "SEWING_S1", "active": True}, {"_id": 0})
        if proc:
            process_id = proc["id"]

    # Sequential validation — strict block
    events = await db.rahaza_wip_events.find(
        {"work_order_id": work_order_id},
        {"_id": 0, "process_code": 1, "event_type": 1, "qty": 1}
    ).to_list(None)

    wo_wip = defaultdict(float)
    for ev in events:
        code = (ev.get("process_code") or "").upper()
        qty = float(ev.get("qty") or 0)
        etype = (ev.get("event_type") or "output").lower()
        if code == "SEWING":
            code = "SEWING_S1"
        if etype == "output" and code in PROCESS_FLOW:
            wo_wip[code] += qty
        elif etype == "qc_pass":
            wo_wip["QC"] += qty
            wo_wip["QC_PASS"] += qty

    avail = _compute_availability(process_code, wo.get("qty", 0), dict(wo_wip))

    if avail["locked"]:
        raise HTTPException(400, f"Proses '{process_code}' terkunci. {avail.get('reason', 'Proses sebelumnya belum ada output.')}")

    if qty_pcs_input > avail["available"]:
        raise HTTPException(400,
            f"Qty melebihi kapasitas tersedia. Tersedia: {avail['available']} pcs "
            f"(dari {avail['prev_output']} output proses sebelumnya, sudah input {avail['this_input']})."
        )

    # Get process name
    proc_doc = await db.rahaza_processes.find_one({"code": process_code}, {"_id": 0, "name": 1}) or {}
    proc_name = proc_doc.get("name", process_code)

    # Get operator info
    op_doc = await db.rahaza_employees.find_one({"id": operator_id}, {"_id": 0, "name": 1, "employee_code": 1}) or {}

    now = _now()
    event_doc = {
        "id": _uid(),
        "work_order_id": work_order_id,
        "wo_number": wo.get("wo_number", ""),
        "order_id": wo.get("order_id"),
        "process_id": process_id,
        "process_code": process_code,
        "process_name": proc_name,
        "operator_id": operator_id,
        "operator_name": op_doc.get("name", ""),
        "operator_code": op_doc.get("employee_code", ""),
        "qty": qty_pcs_input,
        "qty_lusin": lusin,
        "qty_pcs_extra": pcs_extra,
        "event_type": "output",
        "event_date": now.date().isoformat(),
        "notes": notes,
        "line_id": None,  # no line concept in new board
        "source": "lineboard",
        "created_at": now,
        "created_by": user["id"],
    }
    await db.rahaza_wip_events.insert_one(event_doc)
    await log_activity(user["id"], user.get("name", ""), "wip_output", "rahaza.wip", event_doc["id"])

    # Auto-transition WO to in_production if still released
    if wo.get("status") == "released":
        await db.rahaza_work_orders.update_one(
            {"id": work_order_id},
            {"$set": {"status": "in_production", "started_at": now, "updated_at": now}}
        )

    return serialize_doc({
        "ok": True,
        "event_id": event_doc["id"],
        "qty_pcs": qty_pcs_input,
        "lusin": lusin,
        "pcs_extra": pcs_extra,
        "process_code": process_code,
        "available_after": avail["available"] - qty_pcs_input,
        "wo_number": wo.get("wo_number", ""),
    })
