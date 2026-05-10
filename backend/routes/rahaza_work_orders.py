"""
PT Rahaza — Work Orders (Fase 5c)

Endpoints (prefix /api/rahaza):
  - GET    /work-orders                         : List (filters: status, order_id, model_id)
  - GET    /work-orders/{wid}                   : Detail + progress
  - POST   /work-orders                         : Create manually
  - PUT    /work-orders/{wid}                   : Edit (draft only)
  - POST   /work-orders/{wid}/status            : Status transition
  - DELETE /work-orders/{wid}                   : Delete (draft/cancelled only)
  - POST   /orders/{oid}/generate-work-orders   : Auto-generate WO for all eligible items
                                                  (body optional: { item_ids: [..], priority, target_start_date, target_end_date })

Schema (rahaza_work_orders):
  {
    id, wo_number, order_id, order_number_snapshot,
    order_item_id, model_id, size_id, qty,
    customer_snapshot, is_internal,
    priority,   # normal | high | urgent
    target_start_date, target_end_date,
    bom_snapshot: { yarn_materials, accessory_materials, total_yarn_kg_per_pcs },
    total_yarn_kg_required,
    status,      # draft | released | in_production | completed | cancelled
    completed_qty, # derived from WIP events of final process
    notes, created_at, updated_at, released_at, started_at, completed_at, cancelled_at,
    created_by, created_by_name,
  }
"""
from fastapi import APIRouter, Request, HTTPException
from database import get_db
from auth import require_auth, serialize_doc, log_activity
from routes.rahaza_audit import log_audit
import uuid
from datetime import datetime, timezone, date
from typing import Optional

router = APIRouter(prefix="/api/rahaza", tags=["rahaza-work-orders"])


def _uid(): return str(uuid.uuid4())
def _now(): return datetime.now(timezone.utc)


WO_STATUSES = ["draft", "released", "in_production", "completed", "cancelled"]
WO_TRANSITIONS = {
    "draft":          ["released", "cancelled"],
    "released":       ["in_production", "cancelled"],
    "in_production":  ["completed", "cancelled"],
    "completed":      [],
    "cancelled":      [],
}


def _normalize_process_rates(rates_raw: list) -> list:
    """Normalize and validate process_rates array for WO.

    - Skips invalid entries (missing pid/rate, non-numeric, negative).
    - Deduplicates by process_id (last entry wins) — protects against UI bugs
      that submit the same process twice. (Audit fix M1, 2026-05-07)
    """
    by_pid: dict = {}
    for r in (rates_raw or []):
        pid = (r.get("process_id") or "").strip()
        rate = r.get("rate")
        if not pid or rate is None:
            continue
        try:
            rate_float = float(rate)
        except (TypeError, ValueError):
            continue
        if rate_float < 0:
            continue
        # last entry wins (dedup by process_id)
        by_pid[pid] = {
            "process_id":   pid,
            "process_code": (r.get("process_code") or "").upper().strip(),
            "process_name": (r.get("process_name") or "").strip(),
            "rate":         rate_float,
            "unit":         (r.get("unit") or "pcs").lower().strip(),
        }
    return list(by_pid.values())


async def _require_admin(request: Request):
    user = await require_auth(request)
    role = (user.get("role") or "").lower()
    if role in ("superadmin", "admin"):
        return user
    perms = user.get("_permissions") or []
    if "*" in perms or "wo.manage" in perms or "order.manage" in perms:
        return user
    raise HTTPException(403, "Forbidden: butuh permission Work Order / Order.")



# ─── Phase 22A: Material Reservation Helpers ────────────────────────────────
async def _auto_reserve_materials_for_wo(db, wo_id: str, wo: dict, user: dict):
    """
    Auto-reserve materials when WO is released.
    Calculate material needs from BOM, then call reserve API.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    bom = wo.get("bom_snapshot")
    if not bom:
        logger.info(f"WO {wo_id} has no BOM snapshot, skipping material reservation")
        return
    
    yarn_materials = bom.get("yarn_materials", [])
    accessory_materials = bom.get("accessory_materials", [])
    wo_qty = wo.get("qty", 0)
    
    if wo_qty <= 0:
        logger.warning(f"WO {wo_id} has qty=0, skipping material reservation")
        return
    
    materials_to_reserve = []
    
    # Calculate yarn materials
    for yarn in yarn_materials:
        material_id = yarn.get("material_id")
        qty_per_pcs = yarn.get("qty_per_pcs", 0)
        if material_id and qty_per_pcs > 0:
            required_qty = qty_per_pcs * wo_qty
            materials_to_reserve.append({
                "material_id": material_id,
                "required_qty": required_qty,
            })
    
    # Calculate accessory materials
    for acc in accessory_materials:
        material_id = acc.get("material_id")
        qty_per_pcs = acc.get("qty_per_pcs", 0)
        if material_id and qty_per_pcs > 0:
            required_qty = qty_per_pcs * wo_qty
            materials_to_reserve.append({
                "material_id": material_id,
                "required_qty": required_qty,
            })
    
    if not materials_to_reserve:
        logger.info(f"WO {wo_id} has no materials in BOM, skipping reservation")
        return
    
    # Check availability and reserve
    insufficient_materials = []
    reserved_count = 0
    
    for mat in materials_to_reserve:
        material_id = mat["material_id"]
        required_qty = mat["required_qty"]
        
        # Get material and check availability
        material = await db.rahaza_materials.find_one({"id": material_id}, {"_id": 0})
        if not material:
            logger.warning(f"Material {material_id} not found, skipping")
            continue
        
        # B1 Fix: Query rahaza_material_stock for canonical stock (not stale stock_qty from materials doc)
        stock_rows = await db.rahaza_material_stock.find(
            {"material_id": material_id}, {"_id": 0, "qty": 1}
        ).to_list(None)
        stock_qty = sum(float(s.get("qty") or 0) for s in stock_rows)

        # Calculate reserved qty
        pipeline = [
            {"$match": {"material_id": material_id, "status": "active"}},
            {"$group": {"_id": None, "total_reserved": {"$sum": "$reserved_qty"}}}
        ]
        result = await db.rahaza_material_reservations.aggregate(pipeline).to_list(1)
        reserved_qty = result[0].get("total_reserved", 0) if result else 0
        available_qty = max(0, stock_qty - reserved_qty)
        
        if available_qty < required_qty:
            insufficient_materials.append({
                "code": material.get("code"),
                "name": material.get("name"),
                "required": required_qty,
                "available": available_qty,
            })
            logger.warning(f"Insufficient material {material.get('code')}: need {required_qty}, available {available_qty}")
            continue
        
        # Create reservation
        reservation = {
            "id": _uid(),
            "material_id": material_id,
            "wo_id": wo_id,
            "wo_order_id": wo.get("wo_number"),
            "reserved_qty": required_qty,
            "status": "active",
            "created_at": _now().isoformat(),
            "created_by": user.get("id"),
            "created_by_name": user.get("name", user.get("email")),
        }
        await db.rahaza_material_reservations.insert_one(reservation)
        reserved_count += 1
    
    if insufficient_materials:
        logger.warning(f"WO {wo_id} released with {len(insufficient_materials)} insufficient materials: {insufficient_materials}")
        # Store warning in WO for visibility
        await db.rahaza_work_orders.update_one(
            {"id": wo_id},
            {"$set": {"material_reservation_warnings": insufficient_materials}}
        )
    
    logger.info(f"WO {wo_id} released: {reserved_count} materials reserved, {len(insufficient_materials)} insufficient")


async def _auto_release_reservations_for_wo(db, wo_id: str, user: dict):
    """
    Auto-release material reservations when WO is completed or cancelled.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    result = await db.rahaza_material_reservations.update_many(
        {"wo_id": wo_id, "status": "active"},
        {
            "$set": {
                "status": "released",
                "released_at": _now().isoformat(),
                "released_by": user.get("id"),
                "released_by_name": user.get("name", user.get("email")),
            }
        }
    )
    
    if result.modified_count > 0:
        logger.info(f"WO {wo_id} reservations released: {result.modified_count} materials")



async def _auto_increment_fg_inventory(db, wo_id: str, wo: dict, user: dict):
    """
    Auto-increment Finished Goods inventory when WO is completed.
    Creates FG material if not exists, then adds completed_qty to stock.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # Compute actual completed qty from PACKING output
    completed_qty, breakdown = await _compute_progress(db, wo)
    
    if completed_qty <= 0:
        return  # Nothing to add
    
    model_id = wo.get("model_id")
    if not model_id:
        logger.warning(f"WO {wo_id} has no model_id, cannot increment FG inventory")
        return
    
    # Get or create FG material for this model
    model = await db.rahaza_models.find_one({"id": model_id}, {"_id": 0, "code": 1, "name": 1})
    if not model:
        logger.warning(f"Model {model_id} not found for WO {wo_id}")
        return
    
    # FG material naming: FG-{MODEL_CODE}-{SIZE_CODE}
    size_id = wo.get("size_id")
    size_code = ""
    if size_id:
        size_doc = await db.rahaza_sizes.find_one({"id": size_id}, {"_id": 0, "code": 1})
        size_code = size_doc.get("code", "") if size_doc else ""
    
    fg_code = f"FG-{model.get('code', 'UNKNOWN')}"
    if size_code:
        fg_code = f"{fg_code}-{size_code}"
    
    # Check if FG material already exists
    fg_material = await db.rahaza_materials.find_one({"code": fg_code}, {"_id": 0})
    
    if not fg_material:
        # Create new FG material
        fg_material = {
            "id": _uid(),
            "code": fg_code,
            "name": f"{model.get('name', 'Unknown Model')} - {size_code if size_code else 'All Sizes'}",
            "type": "fg",  # finished goods
            "unit": "pcs",
            "min_stock": 0,
            "is_active": True,
            "model_id": model_id,
            "size_id": size_id if size_id else None,
            "created_at": _now(),
            "updated_at": _now(),
        }
        await db.rahaza_materials.insert_one(fg_material)
        logger.info(f"Created FG material: {fg_code} for WO {wo_id}")
    
    fg_material_id = fg_material.get("id")
    
    # Default FG warehouse location
    fg_location = await db.rahaza_locations.find_one({"code": "FG-WH"}, {"_id": 0})
    if not fg_location:
        # Create default FG warehouse if not exists
        fg_location = {
            "id": _uid(),
            "code": "FG-WH",
            "name": "Finished Goods Warehouse",
            "type": "warehouse",
            "is_active": True,
            "created_at": _now(),
        }
        await db.rahaza_locations.insert_one(fg_location)
    
    fg_location_id = fg_location.get("id")
    
    # Ensure stock row exists
    stock_row = await db.rahaza_material_stock.find_one({
        "material_id": fg_material_id,
        "location_id": fg_location_id,
    })
    
    if not stock_row:
        stock_row = {
            "id": _uid(),
            "material_id": fg_material_id,
            "location_id": fg_location_id,
            "qty": 0,
            "qty_reserved": 0,
            "updated_at": _now(),
        }
        await db.rahaza_material_stock.insert_one(stock_row)
    
    # Increment FG stock
    await db.rahaza_material_stock.update_one(
        {"material_id": fg_material_id, "location_id": fg_location_id},
        {"$inc": {"qty": completed_qty}, "$set": {"updated_at": _now()}},
    )
    
    # Log FG movement
    await db.rahaza_fg_movements.insert_one({
        "id": _uid(),
        "fg_code": fg_code,
        "fg_material_id": fg_material_id,
        "work_order_id": wo_id,
        "work_order_number": wo.get("wo_number", ""),
        "event_type": "production_completion",
        "qty": completed_qty,
        "location_id": fg_location_id,
        "location_name": fg_location.get("name", ""),
        "timestamp": _now(),
        "created_by": user.get("id"),
        "created_by_name": user.get("name", ""),
        "notes": f"Auto-increment from WO {wo.get('wo_number', '')} completion",
    })
    
    logger.info(f"Auto-incremented FG inventory: {fg_code} +{completed_qty} pcs from WO {wo_id}")
    
    return {
        "fg_material_id": fg_material_id,
        "fg_code": fg_code,
        "qty_added": completed_qty,
        "location": fg_location.get("name", ""),
    }



async def _gen_wo_number(db):
    today = date.today().strftime("%Y%m%d")
    prefix = f"WO-{today}"
    count = await db.rahaza_work_orders.count_documents({"wo_number": {"$regex": f"^{prefix}"}})
    return f"{prefix}-{count+1:03d}"


async def _get_bom_snapshot(db, model_id: str, size_id: str):
    """Return frozen BOM snapshot for WO, or None if no BOM.
    
    Priority: is_active=True → has materials → latest by updated_at
    """
    # Try is_active=True first (canonical active version)
    bom = await db.rahaza_boms.find_one(
        {"model_id": model_id, "size_id": size_id, "active": True, "is_active": True},
        {"_id": 0}
    )
    # Fallback: find any active BOM that actually has materials (handles legacy is_active=None data)
    if not bom or (not bom.get("yarn_materials") and not bom.get("accessory_materials")):
        fallback = await db.rahaza_boms.find_one(
            {"model_id": model_id, "size_id": size_id, "active": True,
             "$or": [{"yarn_materials.0": {"$exists": True}}, {"accessory_materials.0": {"$exists": True}}]},
            {"_id": 0},
            sort=[("updated_at", -1)]
        )
        if fallback:
            bom = fallback
    if not bom:
        return None
    yarns = bom.get("yarn_materials") or []
    accs  = bom.get("accessory_materials") or []
    total = round(sum(float(y.get("qty_kg") or 0) for y in yarns), 4)
    return {
        "bom_id": bom["id"],
        "yarn_materials": yarns,
        "accessory_materials": accs,
        "total_yarn_kg_per_pcs": total,
    }


async def _compute_progress(db, wo: dict):
    """
    Compute completed_qty: sum of WIP events (event_type='output') on the *last*
    non-rework process for this work_order_id.
    Also returns per-process breakdown.
    """
    wo_id = wo["id"]
    procs = await db.rahaza_processes.find({"active": True, "is_rework": False}, {"_id": 0}).sort("order_seq", 1).to_list(None)
    if not procs:
        return 0, []
    last_proc = procs[-1]
    pipe_all = [
        {"$match": {"event_type": "output", "work_order_id": wo_id}},
        {"$group": {"_id": "$process_id", "total": {"$sum": "$qty"}}},
    ]
    raw = await db.rahaza_wip_events.aggregate(pipe_all).to_list(None)
    by_proc = {r["_id"]: r["total"] for r in raw}
    breakdown = [
        {"process_id": p["id"], "process_code": p["code"], "process_name": p["name"],
         "order_seq": p["order_seq"], "total_output": by_proc.get(p["id"], 0)}
        for p in procs
    ]
    completed = by_proc.get(last_proc["id"], 0)
    return completed, breakdown


async def _enrich_wo(db, wo: dict, with_progress: bool = False):
    if not wo:
        return wo
    mod = await db.rahaza_models.find_one({"id": wo.get("model_id")}, {"_id": 0})
    sz  = await db.rahaza_sizes.find_one({"id": wo.get("size_id")},  {"_id": 0})
    wo["model_code"] = mod["code"] if mod else None
    wo["model_name"] = mod["name"] if mod else None
    wo["size_code"]  = sz["code"]  if sz else None
    qty = int(wo.get("qty") or 0)
    snap = wo.get("bom_snapshot") or {}
    yarn_per_pcs = float(snap.get("total_yarn_kg_per_pcs") or 0)
    wo["total_yarn_kg_required"] = round(qty * yarn_per_pcs, 4)
    # Phase 17A: bundle count for this WO
    try:
        bc = await db.rahaza_bundles.count_documents({"work_order_id": wo["id"]})
        wo["bundle_count"] = bc
        wo["bundles_generated"] = bc > 0
    except Exception:
        wo["bundle_count"] = 0
        wo["bundles_generated"] = False
    if with_progress:
        completed, breakdown = await _compute_progress(db, wo)
        wo["completed_qty"] = completed
        wo["progress_pct"] = round((completed / qty) * 100, 1) if qty > 0 else 0
        wo["progress_breakdown"] = breakdown
    return wo


# ── LIST / DETAIL ──────────────────────────────────────────────
@router.get("/work-orders")
async def list_work_orders(
    request: Request,
    status: Optional[str] = None,
    order_id: Optional[str] = None,
    model_id: Optional[str] = None,
    limit: int = 100,
    skip: int = 0,
):
    await require_auth(request)
    db = get_db()
    q = {}
    if status:   q["status"]   = status
    if order_id: q["order_id"] = order_id
    if model_id: q["model_id"] = model_id
    rows = await db.rahaza_work_orders.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(None)
    for wo in rows:
        await _enrich_wo(db, wo, with_progress=False)
    # Batch progress for list
    wo_ids = [w["id"] for w in rows]
    if wo_ids:
        procs = await db.rahaza_processes.find({"active": True, "is_rework": False}, {"_id": 0}).sort("order_seq", 1).to_list(None)
        last_pid = procs[-1]["id"] if procs else None
        if last_pid:
            pipe = [
                {"$match": {"event_type": "output", "work_order_id": {"$in": wo_ids}, "process_id": last_pid}},
                {"$group": {"_id": "$work_order_id", "total": {"$sum": "$qty"}}},
            ]
            done_raw = await db.rahaza_wip_events.aggregate(pipe).to_list(None)
            done_map = {r["_id"]: r["total"] for r in done_raw}
            for w in rows:
                q_  = int(w.get("qty") or 0)
                c_  = int(done_map.get(w["id"], 0))
                w["completed_qty"] = c_
                w["progress_pct"]  = round((c_ / q_) * 100, 1) if q_ > 0 else 0
    return serialize_doc(rows)


@router.get("/work-orders/traceability")
async def work_orders_traceability_v2(
    request: Request,
    status: Optional[str] = None,
    has_pending_rework: Optional[bool] = None,
    urgent: Optional[bool] = None,
    q: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
):
    """
    WO Traceability list — FIXED version moved before {wid} route.
    Uses correct WO field names: order_number, due_date, start_date.
    Enriches model_name/size_name from master data.
    """
    await require_auth(request)
    db = get_db()
    from collections import defaultdict

    query = {}
    if status:
        query["status"] = status

    if urgent:
        from datetime import timedelta as _td
        urgent_threshold = (date.today() + _td(days=3)).isoformat()
        query["due_date"] = {"$lte": urgent_threshold}

    if q:
        q_clean = q.strip()
        query["$or"] = [
            {"wo_number":     {"$regex": q_clean, "$options": "i"}},
            {"order_number":  {"$regex": q_clean, "$options": "i"}},
            {"model_name":    {"$regex": q_clean, "$options": "i"}},
            {"model_code":    {"$regex": q_clean, "$options": "i"}},
        ]

    total = await db.rahaza_work_orders.count_documents(query)

    wos = await db.rahaza_work_orders.find(
        query, {"_id": 0}
    ).sort([("created_at", -1)]).skip(offset).limit(limit).to_list(None)

    if not wos:
        return {"items": [], "total": total, "limit": limit, "offset": offset}

    # Enrich size_name from sizes master
    size_ids = list({w.get("size_id") for w in wos if w.get("size_id")})
    size_map = {}
    if size_ids:
        sizes = await db.rahaza_sizes.find({"id": {"$in": size_ids}}, {"_id": 0, "id": 1, "name": 1, "code": 1}).to_list(None)
        size_map = {s["id"]: s for s in sizes}

    # Enrich model_name from models master
    model_ids = list({w.get("model_id") for w in wos if w.get("model_id")})
    model_map = {}
    if model_ids:
        models = await db.rahaza_models.find({"id": {"$in": model_ids}}, {"_id": 0, "id": 1, "name": 1, "code": 1}).to_list(None)
        model_map = {m["id"]: m for m in models}

    wo_ids = [w["id"] for w in wos]

    # Load WIP events for progress calculation
    events = await db.rahaza_wip_events.find(
        {"work_order_id": {"$in": wo_ids}},
        {"_id": 0, "work_order_id": 1, "process_code": 1, "event_type": 1, "qty": 1}
    ).to_list(None)

    wo_events = defaultdict(list)
    for ev in events:
        wo_events[ev["work_order_id"]].append(ev)

    PROCESS_FLOW = ["RAJUT", "LINKING", "SEWING_S1", "SEWING_S2", "SEWING_S3", "STEAM", "QC", "PACKING"]

    result_items = []
    for wo in wos:
        wo_id = wo["id"]
        evs = wo_events.get(wo_id, [])

        process_progress = {}
        qc_fail_qty = 0
        rework_pass_qty = 0
        rework_fail_qty = 0

        for ev in evs:
            pcode = (ev.get("process_code") or "").upper()
            etype = (ev.get("event_type") or "output").lower()
            qty = float(ev.get("qty") or 0)
            if pcode == "SEWING":
                pcode = "SEWING_S1"
            if etype == "output" and pcode in PROCESS_FLOW:
                process_progress[pcode] = process_progress.get(pcode, 0) + qty
            elif etype == "qc_pass":
                process_progress["QC"] = process_progress.get("QC", 0) + qty
            elif etype == "qc_fail":
                qc_fail_qty += qty
            elif etype == "rework_pass":
                rework_pass_qty += qty
            elif etype == "rework_fail":
                rework_fail_qty += qty

        pending_rework_pcs = max(0, qc_fail_qty - rework_pass_qty - rework_fail_qty)
        packing_output = process_progress.get("PACKING", 0)
        wo_qty = float(wo.get("qty", 0))
        progress_pct = round((packing_output / wo_qty * 100), 1) if wo_qty > 0 else 0

        current_process = None
        for pcode in PROCESS_FLOW:
            if process_progress.get(pcode, 0) < wo_qty:
                current_process = pcode
                break
        if not current_process and pending_rework_pcs > 0:
            current_process = "REWORK"
        elif not current_process:
            current_process = "COMPLETED" if wo.get("status") == "completed" else "PACKING"

        # Enrich names
        size_info = size_map.get(wo.get("size_id"), {})
        model_info = model_map.get(wo.get("model_id"), {})

        result_items.append({
            "id": wo["id"],
            "wo_number": wo.get("wo_number", ""),
            "order_id": wo.get("order_id"),
            "order_number": wo.get("order_number") or wo.get("order_number_snapshot", ""),
            "model_id": wo.get("model_id"),
            "model_name": wo.get("model_name") or model_info.get("name", ""),
            "model_code": wo.get("model_code") or model_info.get("code", ""),
            "size_id": wo.get("size_id"),
            "size_name": wo.get("size_name") or size_info.get("name", "") or size_info.get("code", ""),
            "qty": int(wo_qty),
            "status": wo.get("status", "draft"),
            "priority": wo.get("priority", "normal"),
            "start_date": wo.get("start_date") or wo.get("target_start_date"),
            "due_date": wo.get("due_date") or wo.get("target_end_date"),
            "customer_snapshot": wo.get("customer_snapshot", ""),
            "progress_pct": progress_pct,
            "current_process": current_process,
            "process_progress": process_progress,
            "pending_rework_pcs": int(pending_rework_pcs),
            "created_at": wo.get("created_at"),
            "updated_at": wo.get("updated_at"),
        })

    if has_pending_rework:
        result_items = [it for it in result_items if it["pending_rework_pcs"] > 0]
        total = len(result_items)

    return {
        "items": serialize_doc(result_items),
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/work-orders/{wid}/detail-trace")
async def work_order_detail_trace_v2(wid: str, request: Request):
    """
    WO detail trace — FIXED version moved before {wid} route.
    """
    await require_auth(request)
    db = get_db()
    from collections import defaultdict

    wo = await db.rahaza_work_orders.find_one({"id": wid}, {"_id": 0})
    if not wo:
        raise HTTPException(404, "Work Order tidak ditemukan")

    events = await db.rahaza_wip_events.find(
        {"work_order_id": wid}, {"_id": 0}
    ).sort("timestamp", 1).to_list(None)

    PROCESS_FLOW = ["RAJUT", "LINKING", "SEWING_S1", "SEWING_S2", "SEWING_S3", "STEAM", "QC", "PACKING"]
    process_totals = defaultdict(float)
    qc_pass_total = qc_fail_total = rework_pass_total = rework_fail_total = 0.0

    for ev in events:
        pcode = (ev.get("process_code") or "").upper()
        etype = (ev.get("event_type") or "output").lower()
        qty = float(ev.get("qty") or 0)
        if pcode == "SEWING":
            pcode = "SEWING_S1"
        if etype == "output" and pcode in PROCESS_FLOW:
            process_totals[pcode] += qty
        elif etype == "qc_pass":
            qc_pass_total += qty
            process_totals["QC"] += qty
        elif etype == "qc_fail":
            qc_fail_total += qty
        elif etype == "rework_pass":
            rework_pass_total += qty
        elif etype == "rework_fail":
            rework_fail_total += qty

    wo_qty = float(wo.get("qty", 0))
    process_timeline = []
    for pcode in PROCESS_FLOW:
        output_qty = process_totals.get(pcode, 0)
        pct = round((output_qty / wo_qty * 100), 1) if wo_qty > 0 else 0
        process_timeline.append({
            "process_code": pcode,
            "process_name": pcode.replace("_", " ").title(),
            "output_qty": int(output_qty),
            "progress_pct": pct,
            "status": "completed" if output_qty >= wo_qty else ("in_progress" if output_qty > 0 else "pending"),
        })

    pending_rework = max(0, qc_fail_total - rework_pass_total - rework_fail_total)
    qc_rework_summary = {
        "qc_pass": int(qc_pass_total),
        "qc_fail": int(qc_fail_total),
        "rework_pass": int(rework_pass_total),
        "rework_fail": int(rework_fail_total),
        "pending_rework_pcs": int(pending_rework),
    }

    reservations = await db.rahaza_material_reservations.find({"wo_id": wid}, {"_id": 0}).to_list(None)
    assignments = await db.rahaza_process_assignments.find({"order_id": wo.get("order_id")}, {"_id": 0}).to_list(None)

    return serialize_doc({
        "wo": wo,
        "process_timeline": process_timeline,
        "qc_rework_summary": qc_rework_summary,
        "events": events,
        "material_reservations": reservations,
        "employee_assignments": assignments,
    })


@router.get("/work-orders/{wid}")
async def get_work_order(wid: str, request: Request):
    await require_auth(request)
    db = get_db()
    wo = await db.rahaza_work_orders.find_one({"id": wid}, {"_id": 0})
    if not wo:
        raise HTTPException(404, "Work Order tidak ditemukan")
    await _enrich_wo(db, wo, with_progress=True)
    return serialize_doc(wo)


# ── CREATE (manual) ───────────────────────────────────────────
@router.post("/work-orders")
async def create_wo(request: Request):
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    order_id = body.get("order_id") or None
    model_id = body.get("model_id")
    size_id  = body.get("size_id")
    qty      = int(body.get("qty") or 0)
    if not (model_id and size_id and qty > 0):
        raise HTTPException(400, "model_id, size_id, qty(>0) wajib diisi.")
    # Validate model & size
    if not await db.rahaza_models.find_one({"id": model_id}):
        raise HTTPException(404, "Model tidak ditemukan")
    if not await db.rahaza_sizes.find_one({"id": size_id}):
        raise HTTPException(404, "Size tidak ditemukan")
    order_number_snapshot = ""
    order_item_id = body.get("order_item_id") or None
    customer_snapshot = ""
    is_internal = False
    if order_id:
        order = await db.rahaza_orders.find_one({"id": order_id}, {"_id": 0})
        if not order:
            raise HTTPException(404, "Order tidak ditemukan")
        order_number_snapshot = order.get("order_number", "")
        customer_snapshot = order.get("customer_name_snapshot") or ""
        is_internal = bool(order.get("is_internal"))
    # BOM snapshot (optional — allow WO without BOM, will warn in UI)
    bom_snap = await _get_bom_snapshot(db, model_id, size_id)
    # Process rates (borongan per proses, optional — used for payroll calculation)
    process_rates = _normalize_process_rates(body.get("process_rates") or [])
    doc = {
        "id": _uid(),
        "wo_number": await _gen_wo_number(db),
        "order_id": order_id,
        "order_number_snapshot": order_number_snapshot,
        "order_item_id": order_item_id,
        "model_id": model_id,
        "size_id":  size_id,
        "qty": qty,
        "customer_snapshot": customer_snapshot,
        "is_internal": is_internal,
        "priority": (body.get("priority") or "normal").lower(),
        "target_start_date": body.get("target_start_date") or None,
        "target_end_date":   body.get("target_end_date") or None,
        "bom_snapshot": bom_snap,
        "process_rates": process_rates,
        "material_plan": None,
        "status": "draft",
        "notes": body.get("notes") or "",
        "created_by": user["id"],
        "created_by_name": user.get("name", ""),
        "created_at": _now(), "updated_at": _now(),
    }
    await db.rahaza_work_orders.insert_one(doc)
    await log_activity(user["id"], user.get("name", ""), "create", "rahaza.wo", doc["wo_number"])
    await log_audit(db, entity_type="rahaza_work_order", entity_id=doc["id"], action="create",
                    before=None, after={k: v for k, v in doc.items() if k != "_id"},
                    user=user, request=request)
    await _enrich_wo(db, doc, with_progress=False)
    doc["completed_qty"] = 0; doc["progress_pct"] = 0
    return serialize_doc(doc)


@router.put("/work-orders/{wid}")
async def update_wo(wid: str, request: Request):
    user = await _require_admin(request)
    db = get_db()
    wo = await db.rahaza_work_orders.find_one({"id": wid}, {"_id": 0})
    if not wo:
        raise HTTPException(404, "Work Order tidak ditemukan")
    if wo.get("status") != "draft":
        raise HTTPException(400, f"WO status '{wo.get('status')}' tidak bisa diedit.")
    body = await request.json()
    allowed = {}
    for k in ("qty", "priority", "target_start_date", "target_end_date", "notes"):
        if k in body: allowed[k] = body[k]
    if "qty" in allowed:
        try:
            allowed["qty"] = int(allowed["qty"])
        except Exception:
            raise HTTPException(400, "qty harus angka.")
        if allowed["qty"] <= 0:
            raise HTTPException(400, "qty harus > 0.")
    # Allow updating process_rates on draft WO
    if "process_rates" in body:
        allowed["process_rates"] = _normalize_process_rates(body["process_rates"] or [])
    allowed["updated_at"] = _now()
    await db.rahaza_work_orders.update_one({"id": wid}, {"$set": allowed})
    out = await db.rahaza_work_orders.find_one({"id": wid}, {"_id": 0})
    await _enrich_wo(db, out, with_progress=True)
    await log_activity(user["id"], user.get("name", ""), "update", "rahaza.wo", wid)
    return serialize_doc(out)


@router.post("/work-orders/{wid}/status")
async def transition_wo(wid: str, request: Request):
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    new_status = (body.get("status") or "").lower()
    if new_status not in WO_STATUSES:
        raise HTTPException(400, f"Status tidak valid. Pilih: {', '.join(WO_STATUSES)}")
    wo = await db.rahaza_work_orders.find_one({"id": wid}, {"_id": 0})
    if not wo:
        raise HTTPException(404, "WO tidak ditemukan")
    current = wo.get("status", "draft")
    if new_status not in WO_TRANSITIONS.get(current, []):
        raise HTTPException(400, f"Tidak bisa pindah dari '{current}' ke '{new_status}'. Valid: {WO_TRANSITIONS.get(current, [])}")

    # Phase 20B: Closed-loop rework enforcement — cannot complete if any child bundle still reworking
    # NEW (R3): Check WO rework guard (event-based, not bundle-based)
    if new_status == "completed":
        # Check pending rework: qc_fail - rework_pass - rework_fail
        events = await db.rahaza_wip_events.find(
            {"work_order_id": wid, "event_type": {"$in": ["qc_fail", "rework_pass", "rework_fail"]}},
            {"_id": 0, "event_type": 1, "qty": 1}
        ).to_list(None)
        qc_fail_total = sum(int(e.get("qty", 0)) for e in events if e.get("event_type") == "qc_fail")
        rework_pass_total = sum(int(e.get("qty", 0)) for e in events if e.get("event_type") == "rework_pass")
        rework_fail_total = sum(int(e.get("qty", 0)) for e in events if e.get("event_type") == "rework_fail")
        pending_rework = qc_fail_total - rework_pass_total - rework_fail_total
        
        if pending_rework > 0:
            raise HTTPException(
                409,
                f"Tidak bisa menyelesaikan WO: masih ada {pending_rework} pcs pending rework. "
                f"(QC Fail: {qc_fail_total}, Rework Pass: {rework_pass_total}, Rework Fail: {rework_fail_total}). "
                f"Selesaikan rework terlebih dahulu."
            )
        
        # Backward compat: Also check for old bundle-based rework (legacy)
        blocked = await db.rahaza_bundles.count_documents({"work_order_id": wid, "status": "reworking"})
        if blocked > 0:
            raise HTTPException(
                409,
                f"Tidak bisa menyelesaikan WO: masih ada {blocked} bundle dalam status rework (legacy). "
                f"Selesaikan rework atau gunakan close-manual di Rework Board terlebih dahulu."
            )

    upd = {"status": new_status, "updated_at": _now()}
    if new_status == "released":      
        upd["released_at"]  = _now()
        # Phase 22A: Auto-reserve materials from BOM
        await _auto_reserve_materials_for_wo(db, wid, wo, user)
    if new_status == "in_production": upd["started_at"]   = _now()
    if new_status == "completed":     
        upd["completed_at"] = _now()
        # Phase 22A: Auto-release material reservations
        await _auto_release_reservations_for_wo(db, wid, user)
        # Auto-increment FG Inventory
        await _auto_increment_fg_inventory(db, wid, wo, user)
    if new_status == "cancelled":     
        upd["cancelled_at"] = _now()
        # Phase 22A: Auto-release material reservations
        await _auto_release_reservations_for_wo(db, wid, user)
    await db.rahaza_work_orders.update_one({"id": wid}, {"$set": upd})
    # Sync parent order: if first WO enters in_production, move order to in_production too
    if new_status == "in_production" and wo.get("order_id"):
        order = await db.rahaza_orders.find_one({"id": wo["order_id"]}, {"_id": 0})
        if order and order.get("status") == "confirmed":
            await db.rahaza_orders.update_one(
                {"id": wo["order_id"]},
                {"$set": {"status": "in_production", "in_production_at": _now(), "updated_at": _now()}},
            )
    await log_activity(user["id"], user.get("name", ""), f"status:{new_status}", "rahaza.wo", wid)
    await log_audit(db, entity_type="rahaza_work_order", entity_id=wid, action="status_change",
                    before={"status": current}, after={"status": new_status},
                    user=user, request=request)

    response = {"status": new_status, "work_order_id": wid}
    # Include material reservation summary when WO is released
    if new_status == "released":
        updated_wo = await db.rahaza_work_orders.find_one({"id": wid}, {"_id": 0, "material_reservation_warnings": 1})
        warnings = (updated_wo or {}).get("material_reservation_warnings", [])
        reserved_count = await db.rahaza_material_reservations.count_documents({"wo_id": wid, "status": "active"})
        response["material_reservation"] = {
            "reserved_count": reserved_count,
            "warnings": warnings,
            "has_warnings": len(warnings) > 0,
        }
    return response


@router.put("/work-orders/{wid}/process-rates")
async def update_wo_process_rates(wid: str, request: Request):
    """Update process_rates (borongan per proses) for a WO — allowed on any status."""
    user = await _require_admin(request)
    db = get_db()
    wo = await db.rahaza_work_orders.find_one({"id": wid}, {"_id": 0})
    if not wo:
        raise HTTPException(404, "WO tidak ditemukan")
    body = await request.json()
    rates = _normalize_process_rates(body.get("process_rates") or [])
    await db.rahaza_work_orders.update_one(
        {"id": wid},
        {"$set": {"process_rates": rates, "updated_at": _now()}}
    )
    await log_activity(user["id"], user.get("name", ""), "update_rates", "rahaza.wo", wid)
    return {"ok": True, "process_rates": rates, "work_order_id": wid}


@router.put("/work-orders/{wid}/material-plan-initial")
async def set_material_plan_initial(wid: str, request: Request):
    """Set initial material plan when WO starts production."""
    user = await _require_admin(request)
    db = get_db()
    wo = await db.rahaza_work_orders.find_one({"id": wid}, {"_id": 0})
    if not wo:
        raise HTTPException(404, "WO tidak ditemukan")
    body = await request.json()
    materials = []
    for m in (body.get("materials") or []):
        if not m.get("material_name") or m.get("qty_prepared") is None:
            continue
        try:
            qty_prepared_f = float(m["qty_prepared"])
        except (TypeError, ValueError):
            raise HTTPException(400, f"qty_prepared untuk '{m.get('material_name','?')}' harus angka.")
        if qty_prepared_f < 0:
            raise HTTPException(400, f"qty_prepared tidak boleh negatif (material '{m.get('material_name','?')}').")
        materials.append({
            "material_id":   m.get("material_id") or "",
            "material_name": m.get("material_name", "").strip(),
            "qty_prepared":  qty_prepared_f,
            "unit":          m.get("unit", "kg"),
        })
    existing_plan = wo.get("material_plan") or {}
    new_plan = {
        **existing_plan,
        "status": "initial_set",
        "initial_materials": materials,
        "initial_set_at": _now(),
        "initial_set_by": user["id"],
    }
    await db.rahaza_work_orders.update_one({"id": wid}, {"$set": {"material_plan": new_plan, "updated_at": _now()}})
    return {"ok": True, "material_plan": new_plan}


@router.put("/work-orders/{wid}/material-plan-final")
async def set_material_plan_final(wid: str, request: Request):
    """Set final material actuals when WO is completed — derives BOM efficiency."""
    user = await _require_admin(request)
    db = get_db()
    wo = await db.rahaza_work_orders.find_one({"id": wid}, {"_id": 0})
    if not wo:
        raise HTTPException(404, "WO tidak ditemukan")
    body = await request.json()
    save_as_bom = bool(body.get("save_as_bom", False))
    materials = []
    for m in (body.get("materials") or []):
        try:
            qty_prepared = float(m.get("qty_prepared", 0))
            qty_remaining = float(m.get("qty_remaining", 0))
        except (TypeError, ValueError):
            raise HTTPException(400, f"qty_prepared / qty_remaining untuk '{m.get('material_name','?')}' harus angka.")
        if qty_prepared < 0 or qty_remaining < 0:
            raise HTTPException(400, f"qty_prepared / qty_remaining tidak boleh negatif (material '{m.get('material_name','?')}').")
        if qty_remaining > qty_prepared and qty_prepared > 0:
            # Allow but warn — could indicate user error or returned material
            pass
        qty_used = max(0, qty_prepared - qty_remaining)
        wo_qty = wo.get("qty", 1)
        eff_pct = round((qty_used / qty_prepared * 100), 1) if qty_prepared > 0 else 0
        materials.append({
            "material_id":   m.get("material_id") or "",
            "material_name": m.get("material_name", "").strip(),
            "qty_prepared":  qty_prepared,
            "qty_remaining": qty_remaining,
            "qty_used":      round(qty_used, 4),
            "qty_per_pcs":   round(qty_used / wo_qty, 6) if wo_qty > 0 else 0,
            "unit":          m.get("unit", "kg"),
            "efficiency_pct": eff_pct,
        })
    existing_plan = wo.get("material_plan") or {}
    new_plan = {
        **existing_plan,
        "status": "final_set",
        "final_materials": materials,
        "final_set_at": _now(),
        "final_set_by": user["id"],
    }
    await db.rahaza_work_orders.update_one({"id": wid}, {"$set": {"material_plan": new_plan, "updated_at": _now()}})
    # Optionally save derived BOM
    if save_as_bom and wo.get("model_id") and wo.get("size_id"):
        from routes.rahaza_bom import _derive_bom_from_material_plan
        await _derive_bom_from_material_plan(db, wo, materials, user)
    return {"ok": True, "material_plan": new_plan, "saved_as_bom": save_as_bom}
async def delete_wo(wid: str, request: Request):
    user = await _require_admin(request)
    db = get_db()
    wo = await db.rahaza_work_orders.find_one({"id": wid}, {"_id": 0})
    if not wo:
        raise HTTPException(404, "WO tidak ditemukan")
    if wo.get("status") not in ("draft", "cancelled"):
        raise HTTPException(400, "Hanya WO Draft atau Cancelled yang bisa dihapus.")
    await db.rahaza_work_orders.delete_one({"id": wid})
    await log_activity(user["id"], user.get("name", ""), "delete", "rahaza.wo", wid)
    return {"status": "deleted"}


# ── AUTO GENERATE FROM ORDER ─────────────────────────────────────
@router.post("/orders/{oid}/generate-work-orders")
async def generate_work_orders(oid: str, request: Request):
    user = await _require_admin(request)
    db = get_db()
    order = await db.rahaza_orders.find_one({"id": oid}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order tidak ditemukan")
    if order.get("status") in ("cancelled", "closed"):
        raise HTTPException(400, f"Order status '{order.get('status')}' tidak bisa generate WO.")
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    requested_item_ids = body.get("item_ids") or []
    priority = (body.get("priority") or "normal").lower()
    target_start_date = body.get("target_start_date") or None
    target_end_date   = body.get("target_end_date") or order.get("due_date") or None

    # ── Per-item process_rates from request body ─────────────────────────────
    # item_rates: [{item_id, process_rates: [{process_id, process_code, rate, unit}]}]
    item_rates_map: dict = {}
    for entry in (body.get("item_rates") or []):
        iid = entry.get("item_id") or entry.get("order_item_id")
        if iid:
            item_rates_map[iid] = entry.get("process_rates") or []

    items = order.get("items") or []
    if requested_item_ids:
        items = [i for i in items if i.get("id") in requested_item_ids]
    if not items:
        raise HTTPException(400, "Tidak ada item untuk di-generate.")

    # Skip items that already have a non-cancelled WO
    existing_wos = await db.rahaza_work_orders.find(
        {"order_id": oid, "status": {"$ne": "cancelled"}}, {"_id": 0, "order_item_id": 1}
    ).to_list(None)
    taken_item_ids = {w.get("order_item_id") for w in existing_wos if w.get("order_item_id")}

    # Pre-load model_name / size_name for all items
    model_ids = list({it["model_id"] for it in items if it.get("model_id")})
    size_ids  = list({it["size_id"]  for it in items if it.get("size_id")})
    model_map, size_map = {}, {}
    if model_ids:
        docs = await db.rahaza_models.find({"id": {"$in": model_ids}}, {"_id": 0, "id": 1, "name": 1, "code": 1}).to_list(None)
        model_map = {d["id"]: d.get("name") or d.get("code") or "" for d in docs}
    if size_ids:
        docs = await db.rahaza_sizes.find({"id": {"$in": size_ids}},   {"_id": 0, "id": 1, "name": 1, "code": 1}).to_list(None)
        size_map  = {d["id"]: d.get("code") or d.get("name") or "" for d in docs}

    created = []
    skipped = []
    for it in items:
        if it.get("id") in taken_item_ids:
            skipped.append({"item_id": it.get("id"), "reason": "sudah punya WO aktif"})
            continue
        bom_snap = await _get_bom_snapshot(db, it["model_id"], it["size_id"])

        # Resolve rates — prefer per-item rates from body, else empty (payroll will use profile)
        wo_process_rates = item_rates_map.get(it.get("id")) or []
        # Normalise: keep only entries with rate > 0
        wo_process_rates = [r for r in wo_process_rates if float(r.get("rate") or 0) > 0]

        doc = {
            "id": _uid(),
            "wo_number": await _gen_wo_number(db),
            "order_id": oid,
            "order_number_snapshot": order.get("order_number", ""),
            "order_item_id": it.get("id"),
            "model_id": it["model_id"],
            "size_id":  it["size_id"],
            "model_name": model_map.get(it["model_id"], ""),
            "size_name":  size_map.get(it["size_id"], ""),
            "qty":      int(it["qty"]),
            "customer_snapshot": order.get("customer_name_snapshot") or "",
            "is_internal": bool(order.get("is_internal")),
            "priority": priority,
            "target_start_date": target_start_date,
            "target_end_date":   target_end_date,
            "bom_snapshot": bom_snap,
            "process_rates": wo_process_rates,
            "status": "draft",
            "notes": it.get("notes") or "",
            "created_by": user["id"],
            "created_by_name": user.get("name", ""),
            "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_work_orders.insert_one(doc)
        created.append({"id": doc["id"], "wo_number": doc["wo_number"], "item_id": it.get("id")})

    # Auto-confirm order if it was draft and we just created WOs
    if created and order.get("status") == "draft":
        await db.rahaza_orders.update_one(
            {"id": oid},
            {"$set": {"status": "confirmed", "confirmed_at": _now(), "updated_at": _now()}},
        )

    await log_activity(user["id"], user.get("name", ""), f"generate:{len(created)}", "rahaza.wo", oid)
    return {"created": created, "skipped": skipped, "total_created": len(created)}


# ── STATUS HELPERS ──────────────────────────────────────────────
@router.get("/work-orders-statuses")
async def get_wo_statuses(request: Request):
    await require_auth(request)
    labels = {
        "draft":         "Draft",
        "released":      "Released",
        "in_production": "In Production",
        "completed":     "Completed",
        "cancelled":     "Cancelled",
    }
    return [{"value": s, "label": labels[s], "allowed_next": WO_TRANSITIONS[s]} for s in WO_STATUSES]



# ── WO TRACEABILITY (Replace Bundle Tracking) ──────────────────────────────
# NOTE: /work-orders/traceability and /work-orders/{wid}/detail-trace
# have been moved BEFORE /work-orders/{wid} to avoid FastAPI routing conflicts.
# See work_orders_traceability_v2 and work_order_detail_trace_v2 above.
