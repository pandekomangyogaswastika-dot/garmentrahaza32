"""
PT Rahaza — Management Dashboard & Reports (Fase 10)

Endpoints (prefix /api/rahaza):
  - GET /management/overview         : KPI lengkap utk dashboard management
  - GET /management/daily-output     : output harian per proses (untuk chart 7 hari terakhir)
  - GET /management/top-models       : top model by output (30 hari)
  - GET /management/top-customers    : top customer by order value
  - GET /management/on-time-delivery : % WO completed tepat waktu
  - GET /management/payroll-summary  : ringkasan run payroll terakhir
"""
from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import StreamingResponse
from database import get_db
from auth import require_auth, serialize_doc
from datetime import datetime, timezone, date, timedelta
from typing import Optional
import io
import logging

# PDF generation
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# Charts
import matplotlib
matplotlib.use('Agg')  # Non-GUI backend
import matplotlib.pyplot as plt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/rahaza", tags=["rahaza-reports"])


def _today(): return date.today()


@router.get("/management/overview")
async def overview(request: Request):
    """
    KPI overview. Phase 13 — support date_from/date_to query params.
    Jika keduanya disupply, window analitis 7-hari akan direplace rentang
    custom. Semua metric tetap relatif (start7/start30 = from/to).
    """
    await require_auth(request)
    db = get_db()
    today = _today()
    t_iso = today.isoformat()

    # Phase 13.3 — custom period support
    sp = request.query_params
    date_from = sp.get("date_from") or None
    date_to = sp.get("date_to") or None
    if date_from and date_to:
        # Validate date format
        try:
            from datetime import datetime as _dt
            _dt.fromisoformat(date_from); _dt.fromisoformat(date_to)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Format tanggal tidak valid. Gunakan YYYY-MM-DD.")
        if date_to < date_from:
            raise HTTPException(status_code=400, detail="date_to tidak boleh lebih awal dari date_from.")
        start7 = date_from
        start30 = date_from
        t_iso = date_to
    else:
        start7 = (today - timedelta(days=7)).isoformat()
        start30 = (today - timedelta(days=30)).isoformat()

    # Produksi: total output pada window
    wip_7d = await db.rahaza_wip_events.aggregate([
        {"$match": {"event_type": "output", "event_date": {"$gte": start7, "$lte": t_iso}}},
        {"$group": {"_id": None, "total": {"$sum": "$qty"}, "count": {"$sum": 1}}}
    ]).to_list(None)
    output_7d = (wip_7d[0] if wip_7d else {}).get("total", 0) or 0

    # WO: active & completed counts
    wo_active = await db.rahaza_work_orders.count_documents({"status": {"$in": ["draft", "released", "in_production"]}})
    wo_completed = await db.rahaza_work_orders.count_documents({"status": "completed"})

    # Orders: in_production
    orders_active = await db.rahaza_orders.count_documents({"status": {"$in": ["confirmed", "in_production"]}})

    # Employees active
    emp_active = await db.rahaza_employees.count_documents({"active": True})

    # Attendance today
    att_today = await db.rahaza_attendance_events.aggregate([
        {"$match": {"date": t_iso}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]).to_list(None)
    att_summary = {a["_id"]: a["count"] for a in att_today}

    # QC stats (7d)
    qc_pass = await db.rahaza_wip_events.aggregate([
        {"$match": {"event_type": "qc_pass", "event_date": {"$gte": start7}}},
        {"$group": {"_id": None, "total": {"$sum": "$qty"}}}
    ]).to_list(None)
    qc_fail = await db.rahaza_wip_events.aggregate([
        {"$match": {"event_type": "qc_fail", "event_date": {"$gte": start7}}},
        {"$group": {"_id": None, "total": {"$sum": "$qty"}}}
    ]).to_list(None)
    qc_pass_qty = (qc_pass[0] if qc_pass else {}).get("total", 0) or 0
    qc_fail_qty = (qc_fail[0] if qc_fail else {}).get("total", 0) or 0
    qc_rate = (qc_pass_qty / (qc_pass_qty + qc_fail_qty) * 100) if (qc_pass_qty + qc_fail_qty) > 0 else 0

    # Finance
    ar = await db.rahaza_ar_invoices.aggregate([
        {"$match": {"status": {"$in": ["sent", "partial_paid", "overdue"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$balance"}}}
    ]).to_list(None)
    ap = await db.rahaza_ap_invoices.aggregate([
        {"$match": {"status": {"$in": ["sent", "partial_paid"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$balance"}}}
    ]).to_list(None)
    cash = await db.rahaza_cash_accounts.aggregate([
        {"$match": {"active": True}},
        {"$group": {"_id": None, "total": {"$sum": "$balance"}}}
    ]).to_list(None)

    # Low stock materials
    low_stock = await db.rahaza_material_stock.aggregate([
        {"$lookup": {"from": "rahaza_materials", "localField": "material_id", "foreignField": "id", "as": "m"}},
        {"$unwind": "$m"},
        {"$match": {"$expr": {"$lt": ["$qty_available", "$m.min_stock"]}}},
        {"$count": "n"}
    ]).to_list(None)
    low_count = (low_stock[0] if low_stock else {}).get("n", 0)

    return {
        "production": {
            "output_7d": output_7d,
            "wo_active": wo_active,
            "wo_completed": wo_completed,
            "orders_active": orders_active,
            "qc_pass_7d": qc_pass_qty,
            "qc_fail_7d": qc_fail_qty,
            "qc_rate_pct": round(qc_rate, 1),
        },
        "hr": {
            "employees_active": emp_active,
            "attendance_today": att_summary,
        },
        "finance": {
            "ar_outstanding": round((ar[0] if ar else {}).get("total", 0) or 0),
            "ap_outstanding": round((ap[0] if ap else {}).get("total", 0) or 0),
            "cash_balance": round((cash[0] if cash else {}).get("total", 0) or 0),
        },
        "warehouse": {
            "low_stock_materials": low_count,
        },
    }


@router.get("/management/daily-output")
async def daily_output(request: Request, days: int = 7):
    """
    Output per hari per proses. Phase 13 — accepts date_from/date_to
    to override the days window.
    """
    await require_auth(request)
    db = get_db()
    today = _today()
    sp = request.query_params
    date_from = sp.get("date_from") or None
    date_to = sp.get("date_to") or None
    if date_from and date_to:
        start = date_from
        end = date_to
    else:
        start = (today - timedelta(days=days-1)).isoformat()
        end = today.isoformat()
    rows = await db.rahaza_wip_events.aggregate([
        {"$match": {"event_type": "output", "event_date": {"$gte": start, "$lte": end}}},
        {"$group": {"_id": {"date": "$event_date", "process_code": "$process_code"}, "qty": {"$sum": "$qty"}}},
        {"$sort": {"_id.date": 1}}
    ]).to_list(None)
    # Build timeline per date from [start..end]
    from datetime import datetime as _dt
    try:
        sd = _dt.fromisoformat(start).date()
        ed = _dt.fromisoformat(end).date()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Format tanggal tidak valid. Gunakan YYYY-MM-DD.")
    if ed < sd:
        raise HTTPException(status_code=400, detail="date_to tidak boleh lebih awal dari date_from.")
    span = max(1, (ed - sd).days + 1)
    # Batas aman 365 hari untuk performa
    if span > 365:
        raise HTTPException(status_code=400, detail="Rentang maksimal 365 hari.")
    dates = [(sd + timedelta(days=i)).isoformat() for i in range(span)]
    timeline = {d: {"date": d, "total": 0, "by_process": {}} for d in dates}
    for r in rows:
        d = r["_id"]["date"]; p = r["_id"]["process_code"] or "UNK"; qty = r["qty"]
        if d in timeline:
            timeline[d]["total"] += qty
            timeline[d]["by_process"][p] = qty
    return {"days": span, "timeline": list(timeline.values()), "date_from": start, "date_to": end}


@router.get("/management/top-models")
async def top_models(request: Request, days: int = 30, limit: int = 10):
    await require_auth(request)
    db = get_db()
    start = (_today() - timedelta(days=days)).isoformat()
    rows = await db.rahaza_wip_events.aggregate([
        {"$match": {"event_type": "output", "event_date": {"$gte": start}}},
        {"$group": {"_id": "$model_id", "qty": {"$sum": "$qty"}}},
        {"$sort": {"qty": -1}}, {"$limit": limit},
    ]).to_list(None)
    mids = [r["_id"] for r in rows if r.get("_id")]
    models = await db.rahaza_models.find({"id": {"$in": mids}}, {"_id": 0}).to_list(None) if mids else []
    mmap = {m["id"]: m for m in models}
    out = []
    for r in rows:
        m = mmap.get(r["_id"]) or {}
        out.append({"model_id": r["_id"], "code": m.get("code"), "name": m.get("name"), "qty": r["qty"]})
    return {"days": days, "items": out}


@router.get("/management/top-customers")
async def top_customers(request: Request, limit: int = 10):
    await require_auth(request)
    db = get_db()
    rows = await db.rahaza_orders.aggregate([
        {"$match": {"status": {"$ne": "cancelled"}}},
        {"$group": {"_id": "$customer_id", "total_qty": {"$sum": "$total_qty"}, "orders": {"$sum": 1}}},
        {"$sort": {"total_qty": -1}}, {"$limit": limit},
    ]).to_list(None)
    cids = [r["_id"] for r in rows if r.get("_id")]
    cs = await db.rahaza_customers.find({"id": {"$in": cids}}, {"_id": 0}).to_list(None) if cids else []
    cmap = {c["id"]: c for c in cs}
    out = []
    for r in rows:
        c = cmap.get(r["_id"]) or {}
        out.append({"customer_id": r["_id"], "code": c.get("code"), "name": c.get("name"), "orders": r["orders"], "total_qty": r["total_qty"]})
    return {"items": out}


@router.get("/management/on-time-delivery")
async def on_time_delivery(request: Request, days: int = 30):
    await require_auth(request)
    db = get_db()
    start = (_today() - timedelta(days=days)).isoformat()
    rows = await db.rahaza_work_orders.find({"status": "completed", "end_date": {"$gte": start}}, {"_id": 0}).to_list(None)
    total = len(rows); on_time = 0
    for r in rows:
        due = r.get("target_date") or r.get("due_date")
        completed = r.get("end_date") or r.get("completed_at")
        if due and completed and completed <= due:
            on_time += 1
    rate = (on_time / total * 100) if total > 0 else 0
    return {"days": days, "total_wo": total, "on_time": on_time, "rate_pct": round(rate, 1)}


@router.get("/management/payroll-summary")
async def payroll_summary(request: Request):
    await require_auth(request)
    db = get_db()
    latest = await db.rahaza_payroll_runs.find_one({}, {"_id": 0}, sort=[("created_at", -1)])
    return {"latest_run": serialize_doc(latest) if latest else None}



# ─────────────────────────────────────────────────────────────────────────────
# LAPORAN BISNIS (Rahaza-based, digunakan oleh ReportsModule)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/reports/{report_type}")
async def get_rahaza_report(report_type: str, request: Request):
    """
    Endpoint laporan bisnis berbasis data Rahaza.
    Types: production | progress | financial | shipment | rework | material-issue
    """
    await require_auth(request)
    db = get_db()
    sp = request.query_params
    date_from = sp.get("date_from", "")
    date_to = sp.get("date_to", "")

    def _date_filter(field: str):
        f = {}
        if date_from:
            f["$gte"] = date_from
        if date_to:
            f["$lte"] = date_to
        return {field: f} if f else {}

    if report_type == "production":
        # Pesanan + Work Orders
        query = {}
        if date_from or date_to:
            query.update(_date_filter("order_date"))
        orders = await db.rahaza_orders.find(query, {"_id": 0}).sort("order_date", -1).to_list(None)
        # Pre-load model and size lookups
        model_cache = {m["id"]: m.get("name", m.get("code", "?")) for m in await db.rahaza_models.find({}, {"id": 1, "name": 1, "code": 1, "_id": 0}).to_list(None)}
        size_cache = {s["id"]: s.get("name", s.get("code", "?")) for s in await db.rahaza_sizes.find({}, {"id": 1, "name": 1, "code": 1, "_id": 0}).to_list(None)}
        rows = []
        for o in orders:
            # Ambil semua WO terkait
            wo_list = await db.rahaza_work_orders.find(
                {"order_id": o["id"]}, {"_id": 0}
            ).to_list(None)
            if wo_list:
                for wo in wo_list:
                    # Ambil progress WIP
                    qty_done = sum(ev.get("qty", 0) for ev in await db.rahaza_wip_events.find(
                        {"work_order_id": wo["id"], "process_code": "PACKING"}, {"qty": 1, "_id": 0}
                    ).to_list(None))
                    # QC pass
                    qc_pass = sum(ev.get("pass_qty", 0) for ev in await db.rahaza_qc_events.find(
                        {"work_order_id": wo["id"]}, {"pass_qty": 1, "_id": 0}
                    ).to_list(None))
                    model_name = model_cache.get(wo.get("model_id", ""), wo.get("model_snapshot", wo.get("model_id", "-")))
                    size_name = size_cache.get(wo.get("size_id", ""), wo.get("size_snapshot", wo.get("size_id", "-")))
                    rows.append({
                        "tanggal": o.get("order_date", ""),
                        "no_order": o.get("order_number", ""),
                        "no_wo": wo.get("wo_number", ""),
                        "pelanggan": o.get("customer_name_snapshot", wo.get("customer_snapshot", "")),
                        "model": model_name,
                        "ukuran": size_name,
                        "qty_order": wo.get("qty", 0),
                        "qty_selesai": qty_done,
                        "qty_qc_pass": qc_pass,
                        "pct_selesai": round((qty_done / wo["qty"] * 100) if wo.get("qty", 0) > 0 else 0, 1),
                        "status_wo": wo.get("status", ""),
                        "target_mulai": wo.get("target_start_date", ""),
                        "target_selesai": wo.get("target_end_date", ""),
                        "status_order": o.get("status", ""),
                    })
            else:
                rows.append({
                    "tanggal": o.get("order_date", ""),
                    "no_order": o.get("order_number", ""),
                    "no_wo": "-",
                    "pelanggan": o.get("customer_name_snapshot", ""),
                    "model": "",
                    "ukuran": "",
                    "qty_order": 0,
                    "qty_selesai": 0,
                    "qty_qc_pass": 0,
                    "pct_selesai": 0,
                    "status_wo": "-",
                    "target_mulai": "",
                    "target_selesai": "",
                    "status_order": o.get("status", ""),
                })
        return serialize_doc(rows)

    elif report_type == "progress":
        # Progress WIP events per hari per proses
        query = {}
        if date_from or date_to:
            query.update(_date_filter("event_date"))
        events = await db.rahaza_wip_events.find(query, {"_id": 0}).sort("event_date", -1).to_list(500)
        # Enrich dengan WO info
        wo_cache = {}
        rows = []
        for ev in events:
            wid = ev.get("work_order_id", "")
            if wid not in wo_cache:
                wo = await db.rahaza_work_orders.find_one({"id": wid}, {"_id": 0, "wo_number": 1, "status": 1, "qty": 1, "model_snapshot": 1, "customer_snapshot": 1})
                wo_cache[wid] = wo or {}
            wo = wo_cache[wid]
            rows.append({
                "tanggal": str(ev.get("event_date", str(ev.get("timestamp", ""))[:10] if ev.get("timestamp") else "")),
                "no_wo": wo.get("wo_number", (wid[:8] + "...") if wid else ""),
                "pelanggan": wo.get("customer_snapshot", ""),
                "model": wo.get("model_snapshot", ev.get("model_id", "")),
                "proses": ev.get("process_code", ev.get("process_id", "")),
                "qty": ev.get("qty", 0),
                "jenis": ev.get("event_type", "output"),
                "notes": ev.get("notes", ""),
            })
        return serialize_doc(rows)

    elif report_type == "financial":
        # AR Invoices
        query = {}
        if date_from or date_to:
            query.update(_date_filter("issue_date"))
        invoices = await db.rahaza_ar_invoices.find(query, {"_id": 0}).sort("issue_date", -1).to_list(None)
        rows = []
        for inv in invoices:
            # Cari nama pelanggan
            cust_id = inv.get("customer_id", "")
            cust = await db.rahaza_customers.find_one({"id": cust_id}, {"_id": 0, "name": 1}) if cust_id else None
            rows.append({
                "tanggal": inv.get("issue_date", ""),
                "no_invoice": inv.get("invoice_number", ""),
                "pelanggan": (cust["name"] if cust else inv.get("customer_snapshot", "")),
                "subtotal": inv.get("subtotal", 0),
                "pajak": inv.get("tax_amount", 0),
                "total": inv.get("total", 0),
                "terbayar": inv.get("paid_amount", 0),
                "sisa": inv.get("balance", inv.get("total", 0) - inv.get("paid_amount", 0)),
                "status": inv.get("status", ""),
                "jatuh_tempo": inv.get("due_date", ""),
            })
        return serialize_doc(rows)

    elif report_type == "shipment":
        # Pengiriman ke buyer
        query = {}
        if date_from or date_to:
            query.update(_date_filter("ship_date"))
        shipments = await db.rahaza_shipments.find(query, {"_id": 0}).sort("ship_date", -1).to_list(None)
        rows = []
        for s in shipments:
            rows.append({
                "tanggal": s.get("ship_date", ""),
                "no_pengiriman": s.get("shipment_number", ""),
                "no_wo": s.get("wo_number_snapshot", ""),
                "no_order": s.get("order_number_snapshot", ""),
                "pelanggan": s.get("customer_name_snapshot", ""),
                "qty": s.get("qty", 0),
                "status": s.get("status", ""),
                "notes": s.get("notes", ""),
            })
        return serialize_doc(rows)

    elif report_type == "rework":
        # QC events yang fail
        query = {"verdict": "fail"}
        if date_from or date_to:
            query.update(_date_filter("created_at"))
        qc_fails = await db.rahaza_qc_events.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)
        rows = []
        for ev in qc_fails:
            wid = ev.get("work_order_id", "")
            wo = await db.rahaza_work_orders.find_one({"id": wid}, {"_id": 0, "wo_number": 1, "model_snapshot": 1})
            rows.append({
                "tanggal": str(ev.get("created_at", ""))[:10],
                "no_wo": (wo["wo_number"] if wo else wid[:12]),
                "model": (wo["model_snapshot"] if wo else ""),
                "qty_periksa": ev.get("checked_qty", 0),
                "qty_pass": ev.get("pass_qty", 0),
                "qty_fail": ev.get("fail_qty", 0),
                "kode_defect": ", ".join([d.get("code", "") for d in ev.get("defect_details", [])]),
                "verdict": ev.get("verdict", ""),
                "notes": ev.get("notes", ""),
            })
        return serialize_doc(rows)

    elif report_type == "material-issue":
        # Material Issues
        query = {}
        if date_from or date_to:
            query.update(_date_filter("created_at"))
        mis = await db.rahaza_material_issues.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)


# ═══════════════════════════════════════════════════════════════════════════
# DAILY PRODUCTION REPORT (PDF Export)
# ═══════════════════════════════════════════════════════════════════════════

def _parse_date_report(date_str: Optional[str], default: Optional[date] = None) -> date:
    """Parse ISO date string or return default"""
    if not date_str:
        return default or date.today()
    try:
        return date.fromisoformat(date_str)
    except Exception:
        raise HTTPException(400, f"Format tanggal tidak valid: {date_str} (gunakan YYYY-MM-DD)")


async def _fetch_daily_production_data(db, target_date: date, wo_id: Optional[str] = None):
    """
    Fetch WIP events (output) untuk tanggal tertentu, optionally filtered by work_order_id.
    """
    # Build filter
    filt = {
        "event_date": target_date.isoformat(),
        "event_type": "output",
    }
    if wo_id:
        filt["work_order_id"] = wo_id

    # Fetch WIP events
    events = await db.rahaza_wip_events.find(filt, {"_id": 0}).to_list(None)

    # Enrich with employee info
    employee_ids = list(set(e.get("operator_id") for e in events if e.get("operator_id")))
    employees = await db.rahaza_employees.find(
        {"id": {"$in": employee_ids}},
        {"_id": 0, "id": 1, "name": 1, "employee_code": 1}
    ).to_list(None) if employee_ids else []
    emp_map = {e["id"]: e for e in employees}

    # Enrich with process info
    process_ids = list(set(e.get("process_id") for e in events if e.get("process_id")))
    processes = await db.rahaza_processes.find(
        {"id": {"$in": process_ids}},
        {"_id": 0, "id": 1, "code": 1, "name": 1}
    ).to_list(None) if process_ids else []
    proc_map = {p["id"]: p for p in processes}

    # Enrich with WO info (if filtered)
    wo_info = None
    if wo_id:
        wo = await db.rahaza_work_orders.find_one({"id": wo_id}, {"_id": 0})
        if wo:
            wo_info = {
                "wo_number": wo.get("wo_number"),
                "model_name": wo.get("model_name"),
                "size_name": wo.get("size_name"),
            }

    # Build enriched events list
    enriched_events = []
    for ev in events:
        emp = emp_map.get(ev.get("operator_id")) or {}
        proc = proc_map.get(ev.get("process_id")) or {}
        enriched_events.append({
            "id": ev.get("id"),
            "timestamp": ev.get("timestamp"),
            "operator_id": ev.get("operator_id"),
            "operator_name": emp.get("name", "-"),
            "operator_code": emp.get("employee_code", "-"),
            "process_id": ev.get("process_id"),
            "process_code": proc.get("code", "-"),
            "process_name": proc.get("name", "-"),
            "qty": ev.get("qty", 0),
            "notes": ev.get("notes", ""),
            "work_order_id": ev.get("work_order_id"),
        })

    # Summary by process
    summary_by_process = {}
    for ev in enriched_events:
        pcode = ev["process_code"]
        if pcode not in summary_by_process:
            summary_by_process[pcode] = {
                "process_name": ev["process_name"],
                "total_qty": 0,
                "operators": [],
            }
        summary_by_process[pcode]["total_qty"] += ev["qty"]

    # Count unique operators per process
    for ev in enriched_events:
        pcode = ev["process_code"]
        op_id = ev["operator_id"]
        existing = [o for o in summary_by_process[pcode]["operators"] if o["operator_id"] == op_id]
        if not existing:
            summary_by_process[pcode]["operators"].append({
                "operator_id": op_id,
                "operator_name": ev["operator_name"],
                "operator_code": ev["operator_code"],
                "qty": sum(e["qty"] for e in enriched_events if e["operator_id"] == op_id and e["process_code"] == pcode),
            })

    # Total output
    total_output = sum(ev["qty"] for ev in enriched_events)

    # Fetch target from line assignments for this date
    assignments = await db.rahaza_line_assignments.find(
        {"assign_date": target_date.isoformat()},
        {"_id": 0, "target_qty": 1, "actual_qty": 1}
    ).to_list(None)
    target_output = sum(a.get("target_qty", 0) for a in assignments)

    return {
        "date": target_date.isoformat(),
        "events": enriched_events,
        "summary_by_process": summary_by_process,
        "total_output": total_output,
        "target_output": target_output,
        "achievement_pct": round((total_output / target_output * 100), 1) if target_output > 0 else 0,
        "wo_info": wo_info,
    }


def _generate_charts(data: dict) -> dict:
    """
    Generate matplotlib charts and return as in-memory PNG buffers.
    Returns: {"pie_chart": BytesIO, "bar_chart": BytesIO}
    """
    summary = data["summary_by_process"]
    
    # Pie Chart: Output per Process
    pie_buffer = io.BytesIO()
    if summary:
        labels = [f"{p['process_name']}\n({p['total_qty']} pcs)" for k, p in summary.items()]
        sizes = [p["total_qty"] for p in summary.values()]
        colors_palette = ['#8B5CF6', '#3B82F6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#EF4444', '#6366F1']
        
        fig, ax = plt.subplots(figsize=(6, 4))
        ax.pie(sizes, labels=labels, autopct='%1.1f%%', startangle=90, colors=colors_palette[:len(sizes)])
        ax.set_title('Output per Proses', fontsize=12, fontweight='bold')
        plt.tight_layout()
        plt.savefig(pie_buffer, format='png', dpi=100, bbox_inches='tight')
        plt.close(fig)
        pie_buffer.seek(0)
    else:
        pie_buffer = None

    # Bar Chart: Top 5 Performers
    bar_buffer = io.BytesIO()
    all_operators = []
    for proc_data in summary.values():
        for op in proc_data["operators"]:
            all_operators.append((op["operator_name"], op["qty"]))
    
    if all_operators:
        # Aggregate by operator name (in case same operator works multiple processes)
        op_totals = {}
        for name, qty in all_operators:
            op_totals[name] = op_totals.get(name, 0) + qty
        
        # Sort and take top 5
        sorted_ops = sorted(op_totals.items(), key=lambda x: -x[1])[:5]
        names = [op[0] for op in sorted_ops]
        qtys = [op[1] for op in sorted_ops]
        
        fig, ax = plt.subplots(figsize=(7, 4))
        bars = ax.barh(names, qtys, color='#8B5CF6')
        ax.set_xlabel('Output (pcs)', fontsize=10)
        ax.set_title('Top 5 Operator Terbaik Hari Ini', fontsize=12, fontweight='bold')
        ax.invert_yaxis()
        
        # Add value labels on bars
        for i, (bar, qty) in enumerate(zip(bars, qtys)):
            ax.text(qty + 5, i, f'{qty} pcs', va='center', fontsize=9)
        
        plt.tight_layout()
        plt.savefig(bar_buffer, format='png', dpi=100, bbox_inches='tight')
        plt.close(fig)
        bar_buffer.seek(0)
    else:
        bar_buffer = None

    return {"pie_chart": pie_buffer, "bar_chart": bar_buffer}


def _generate_pdf(data: dict, charts: dict) -> io.BytesIO:
    """
    Generate PDF report dengan table, grouping, summary, dan charts.
    Returns BytesIO buffer containing the PDF.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=1.5*cm, bottomMargin=1.5*cm)
    story = []
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.HexColor('#1F2937'),
        spaceAfter=6,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold',
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=13,
        textColor=colors.HexColor('#374151'),
        spaceBefore=12,
        spaceAfter=8,
        fontName='Helvetica-Bold',
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#4B5563'),
    )

    # Title
    story.append(Paragraph("LAPORAN PRODUKSI HARIAN", title_style))
    story.append(Paragraph(f"PT RAHAZA GARMENT", ParagraphStyle('Subtitle', parent=normal_style, alignment=TA_CENTER, fontSize=10)))
    story.append(Spacer(1, 0.3*cm))
    
    # Date & Summary Info
    date_obj = datetime.fromisoformat(data["date"])
    date_str = date_obj.strftime("%d %B %Y")
    info_data = [
        ["Tanggal", ":", date_str],
        ["Total Output", ":", f"{data['total_output']} pcs"],
        ["Target", ":", f"{data['target_output']} pcs"],
        ["Pencapaian", ":", f"{data['achievement_pct']}%"],
    ]
    
    if data.get("wo_info"):
        info_data.append(["Filter WO", ":", f"{data['wo_info']['wo_number']} - {data['wo_info']['model_name']} {data['wo_info']['size_name']}"])
    
    info_table = Table(info_data, colWidths=[3.5*cm, 0.5*cm, 10*cm])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#6B7280')),
        ('TEXTCOLOR', (2, 0), (2, -1), colors.HexColor('#1F2937')),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.5*cm))

    # Charts (if available)
    if charts.get("pie_chart"):
        story.append(Paragraph("Distribusi Output per Proses", heading_style))
        story.append(Image(charts["pie_chart"], width=12*cm, height=8*cm))
        story.append(Spacer(1, 0.3*cm))
    
    if charts.get("bar_chart"):
        story.append(Paragraph("Top Performers Hari Ini", heading_style))
        story.append(Image(charts["bar_chart"], width=14*cm, height=8*cm))
        story.append(Spacer(1, 0.5*cm))

    # Detailed Table per Process
    story.append(Paragraph("Rincian Output per Proses", heading_style))
    
    summary = data["summary_by_process"]
    if not summary:
        story.append(Paragraph("Tidak ada data produksi untuk tanggal ini.", normal_style))
    else:
        for proc_code, proc_data in sorted(summary.items()):
            # Process header
            proc_header = f"{proc_data['process_name']} (Total: {proc_data['total_qty']} pcs)"
            story.append(Paragraph(proc_header, ParagraphStyle('ProcHeader', parent=heading_style, fontSize=11, textColor=colors.HexColor('#8B5CF6'))))
            
            # Table data
            table_data = [["No", "Nama Karyawan", "Kode", "Output (pcs)", "Catatan"]]
            for idx, op in enumerate(sorted(proc_data["operators"], key=lambda x: -x["qty"]), 1):
                # Find notes for this operator in this process
                op_events = [e for e in data["events"] if e["operator_id"] == op["operator_id"] and e["process_code"] == proc_code]
                notes = " | ".join(set(e["notes"] for e in op_events if e["notes"])) or "-"
                
                table_data.append([
                    str(idx),
                    op["operator_name"],
                    op["operator_code"],
                    str(op["qty"]),
                    notes[:50],  # Truncate long notes
                ])
            
            # Create table
            col_widths = [1*cm, 5*cm, 2.5*cm, 2.5*cm, 6*cm]
            t = Table(table_data, colWidths=col_widths, repeatRows=1)
            t.setStyle(TableStyle([
                # Header
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F3F4F6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#1F2937')),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                
                # Body
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('ALIGN', (0, 1), (0, -1), 'CENTER'),  # No
                ('ALIGN', (3, 1), (3, -1), 'RIGHT'),   # Output
                ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#374151')),
                
                # Grid
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                
                # Alternating row colors
                *[('BACKGROUND', (0, i), (-1, i), colors.HexColor('#F9FAFB')) for i in range(2, len(table_data), 2)]
            ]))
            story.append(t)
            story.append(Spacer(1, 0.4*cm))

    # Grand Total Summary
    story.append(Spacer(1, 0.3*cm))
    summary_box_data = [
        ["RINGKASAN TOTAL"],
        [f"Total Output Produksi: {data['total_output']} pcs"],
        [f"Target Hari Ini: {data['target_output']} pcs"],
        [f"Pencapaian: {data['achievement_pct']}% {'✓ TARGET TERCAPAI' if data['achievement_pct'] >= 100 else '⚠ DI BAWAH TARGET'}"],
    ]
    summary_table = Table(summary_box_data, colWidths=[17*cm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#8B5CF6')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F3F4F6')),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#1F2937')),
        ('ALIGN', (0, 1), (-1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#D1D5DB')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(summary_table)
    
    # Footer
    story.append(Spacer(1, 0.5*cm))
    footer_text = f"Dicetak pada: {datetime.now(timezone.utc).strftime('%d %B %Y %H:%M')} WIB | PT Rahaza Garment Manufacturing"
    story.append(Paragraph(footer_text, ParagraphStyle('Footer', parent=normal_style, fontSize=7, textColor=colors.HexColor('#9CA3AF'), alignment=TA_CENTER)))

    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer


@router.get("/daily-production/data")
async def get_daily_production_data(
    request: Request,
    date: Optional[str] = Query(None, description="YYYY-MM-DD format"),
    wo_id: Optional[str] = Query(None, description="Filter by Work Order ID"),
):
    """
    Get daily production data as JSON.
    """
    await require_auth(request)
    db = get_db()
    
    target_date = _parse_date_report(date, date.today())
    data = await _fetch_daily_production_data(db, target_date, wo_id)
    
    return serialize_doc(data)


@router.get("/daily-production/pdf")
async def get_daily_production_pdf(
    request: Request,
    date: Optional[str] = Query(None, description="YYYY-MM-DD format"),
    wo_id: Optional[str] = Query(None, description="Filter by Work Order ID"),
):
    """
    Generate and download daily production report as PDF.
    """
    await require_auth(request)
    db = get_db()
    
    target_date = _parse_date_report(date, date.today())
    logger.info(f"Generating daily production PDF for {target_date}")
    
    # Fetch data
    data = await _fetch_daily_production_data(db, target_date, wo_id)
    
    # Generate charts
    charts = _generate_charts(data)
    
    # Generate PDF
    pdf_buffer = _generate_pdf(data, charts)
    
    # Return as download
    filename = f"Laporan_Produksi_{target_date.isoformat()}.pdf"
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
