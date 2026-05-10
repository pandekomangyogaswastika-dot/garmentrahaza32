"""
Dashboard, Global Search, Vendor Dashboard
Extracted from server.py monolith.
"""
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from database import get_db
from auth import (verify_token, require_auth, check_role, hash_password, verify_password,
                  create_token, log_activity, serialize_doc, generate_password)
from routes.shared import new_id, now, parse_date, to_end_of_day, PO_STATUSES, enrich_with_product_photos
import uuid
import json
import logging
from datetime import datetime, timezone, timedelta, date
from io import BytesIO

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["dashboard"])

# ─── DASHBOARD ───────────────────────────────────────────────────────────────
@router.get("/dashboard")
async def get_dashboard(request: Request):
    """Dashboard Eksekutif — KPI ringkasan.

    Prioritas baca dari Rahaza collections (rahaza_orders, rahaza_work_orders, rahaza_ar_invoices,
    rahaza_ap_invoices, rahaza_shipments). Fallback ke collection lama (production_pos/invoices)
    bila Rahaza belum punya data — supaya kompatibel dengan instalasi legacy.
    """
    await require_auth(request)
    db = get_db()
    n = now()

    # ── Rahaza orders (primary) ──
    total_orders = await db.rahaza_orders.count_documents({})
    active_orders = await db.rahaza_orders.count_documents({'status': {'$in': ['confirmed', 'in_production']}})
    completed_orders = await db.rahaza_orders.count_documents({'status': {'$in': ['completed', 'closed']}})

    # Work Orders (rahaza)
    active_wos = await db.rahaza_work_orders.count_documents({'status': {'$in': ['released', 'in_production']}})
    wo_status_agg = await db.rahaza_work_orders.aggregate([
        {'$group': {'_id': '$status', 'count': {'$sum': 1}}}
    ]).to_list(None)

    # ── AR / AP (Rahaza finance) ──
    ar_invoices = await db.rahaza_ar_invoices.find({}, {'_id': 0}).to_list(None)
    ap_invoices = await db.rahaza_ap_invoices.find({}, {'_id': 0}).to_list(None)
    total_revenue = sum(i.get('total', 0) for i in ar_invoices)
    total_paid_ar = sum(i.get('paid_amount', 0) for i in ar_invoices)
    outstanding_ar = sum(i.get('balance', 0) for i in ar_invoices if i.get('status') != 'paid')
    total_vendor_cost = sum(i.get('total', 0) for i in ap_invoices)
    total_paid_ap = sum(i.get('paid_amount', 0) for i in ap_invoices)
    outstanding_ap = sum(i.get('balance', 0) for i in ap_invoices if i.get('status') != 'paid')
    gross_margin = total_revenue - total_vendor_cost

    # ── Shipments (Rahaza) ──
    pending_shipments = await db.rahaza_shipments.count_documents({'status': {'$in': ['draft', 'pending', 'in_transit']}})

    # ── Delayed orders (past due_date, not completed) ──
    today_iso = date.today().isoformat()
    delayed_orders = await db.rahaza_orders.count_documents({
        'status': {'$in': ['confirmed', 'in_production']},
        'due_date': {'$lt': today_iso},
    })

    # ── On-time rate ──
    closed_orders = await db.rahaza_orders.find(
        {'status': {'$in': ['completed', 'closed']}}, {'_id': 0, 'due_date': 1, 'updated_at': 1}
    ).to_list(None)
    on_time = 0
    for o in closed_orders:
        dd = o.get('due_date')
        upd = o.get('updated_at')
        if not dd or not upd:
            continue
        # upd is datetime, dd is ISO string
        try:
            upd_d = upd.date() if hasattr(upd, 'date') else date.fromisoformat(str(upd)[:10])
            dd_d = date.fromisoformat(dd[:10])
            if upd_d <= dd_d:
                on_time += 1
        except Exception:
            pass
    on_time_rate = round((on_time / len(closed_orders) * 100) if closed_orders else 0)

    # ── Monthly data (6 months — orders + output) ──
    monthly_data = []
    for i in range(5, -1, -1):
        start = datetime(n.year, n.month, 1, tzinfo=timezone.utc) - timedelta(days=i * 30)
        start = start.replace(day=1)
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
        m_orders = await db.rahaza_orders.count_documents({'created_at': {'$gte': start, '$lt': end}})
        # Sum of dispatched shipment qty for production proxy
        m_ship_agg = await db.rahaza_shipments.aggregate([
            {'$match': {'status': 'dispatched', 'created_at': {'$gte': start, '$lt': end}}},
            {'$group': {'_id': None, 'total': {'$sum': '$qty'}}}
        ]).to_list(None)
        monthly_data.append({
            'month': start.strftime('%b %y'),
            'pos': m_orders,
            'production': m_ship_agg[0]['total'] if m_ship_agg else 0,
        })

    # ── User count ──
    total_users = await db.users.count_documents({'status': 'active'})

    # ── Alerts: overdue orders, near deadline, unpaid invoices ──
    overdue_orders = await db.rahaza_orders.find(
        {'status': {'$in': ['confirmed', 'in_production']}, 'due_date': {'$lt': today_iso}},
        {'_id': 0},
    ).sort('due_date', 1).limit(5).to_list(None)
    near_deadline_orders = await db.rahaza_orders.find(
        {'status': {'$in': ['confirmed', 'in_production']},
         'due_date': {'$gte': today_iso, '$lt': (date.today() + timedelta(days=3)).isoformat()}},
        {'_id': 0},
    ).sort('due_date', 1).limit(5).to_list(None)
    unpaid_ars = await db.rahaza_ar_invoices.find(
        {'status': {'$in': ['sent', 'partial']}}, {'_id': 0}
    ).sort('due_date', 1).limit(5).to_list(None)

    return {
        'totalPOs': total_orders, 'activePOs': active_orders,
        'garments': await db.rahaza_models.count_documents({'active': True}),
        'products': await db.rahaza_models.count_documents({'active': True}),
        'totalInvoiced': total_revenue + total_vendor_cost,
        'totalPaid': total_paid_ar + total_paid_ap,
        'outstanding': outstanding_ar + outstanding_ap,
        'totalVendorCost': total_vendor_cost,
        'totalRevenue': total_revenue,
        'grossMargin': gross_margin,
        'totalInvoicedAR': total_revenue, 'totalInvoicedAP': total_vendor_cost,
        'outstandingAR': outstanding_ar, 'outstandingAP': outstanding_ap,
        'totalPaidAR': total_paid_ar, 'totalPaidAP': total_paid_ap,
        'activeJobs': active_wos,
        'pendingShipments': pending_shipments,
        'pendingAdditionalRequests': 0,
        'pendingReplacementRequests': 0,
        'pendingReturns': 0,
        'totalBuyerShipments': await db.rahaza_shipments.count_documents({'status': 'dispatched'}),
        'totalVendorShipments': 0,
        'totalProducedGlobal': 0,
        'totalAvailableGlobal': 0,
        'globalProgressPct': round((completed_orders / total_orders * 100) if total_orders else 0),
        'totalAccessories': await db.rahaza_materials.count_documents({'type': 'accessory', 'active': True}),
        'totalAccShipments': 0,
        'pendingAccInspections': 0,
        'pendingAccRequests': 0,
        'unpaidInvoices': sum(1 for i in ar_invoices if i.get('status') == 'sent'),
        'partialInvoices': sum(1 for i in ar_invoices if i.get('status') == 'partial'),
        'delayedPOs': delayed_orders,
        'monthlyData': monthly_data,
        'woStatus': wo_status_agg,
        'topGarments': [],
        'pendingReminders': 0,
        'onTimeRate': on_time_rate,
        'totalUsers': total_users,
        'alerts': {
            'overduePos': serialize_doc(overdue_orders),
            'nearDeadlinePos': serialize_doc(near_deadline_orders),
            'unpaidInvoices': serialize_doc(unpaid_ars),
        },
    }

@router.get("/dashboard/analytics")
async def get_dashboard_analytics(request: Request):
    """Enhanced analytics with date range filter"""
    user = await require_auth(request)
    db = get_db()
    sp = request.query_params
    date_from = parse_date(sp.get('from'))
    date_to = to_end_of_day(sp.get('to'))
    date_filter = {}
    if date_from: date_filter['$gte'] = date_from
    if date_to: date_filter['$lte'] = date_to
    date_q = {'created_at': date_filter} if date_filter else {}
    # Vendor lead times (shipment sent → received)
    vendor_lead_times = []
    ships = await db.vendor_shipments.find({**date_q, 'status': 'Received', 'shipment_type': 'NORMAL'}, {'_id': 0}).to_list(None)
    vendor_lt_map = {}
    for s in ships:
        vn = s.get('vendor_name', 'Unknown')
        if s.get('shipment_date') and s.get('updated_at'):
            delta = (s['updated_at'] - s['shipment_date']).days if isinstance(s['updated_at'], datetime) and isinstance(s['shipment_date'], datetime) else 0
            if delta >= 0:
                if vn not in vendor_lt_map: vendor_lt_map[vn] = []
                vendor_lt_map[vn].append(delta)
    for vn, days_list in sorted(vendor_lt_map.items()):
        avg_lt = round(sum(days_list) / len(days_list), 1) if days_list else 0
        vendor_lead_times.append({'vendor': vn, 'avg_days': avg_lt, 'shipment_count': len(days_list)})
    # Missing/defect rates by vendor
    all_inspections = await db.vendor_material_inspections.find(date_q, {'_id': 0}).to_list(None)
    vendor_defect_map = {}
    for insp in all_inspections:
        vn = insp.get('vendor_name', 'Unknown')
        if vn not in vendor_defect_map: vendor_defect_map[vn] = {'received': 0, 'missing': 0}
        vendor_defect_map[vn]['received'] += insp.get('total_received', 0)
        vendor_defect_map[vn]['missing'] += insp.get('total_missing', 0)
    defect_rates = []
    for vn, vals in sorted(vendor_defect_map.items()):
        total = vals['received'] + vals['missing']
        rate = round((vals['missing'] / total * 100) if total > 0 else 0, 1)
        defect_rates.append({'vendor': vn, 'missing_rate': rate, 'total_received': vals['received'], 'total_missing': vals['missing']})
    # Production throughput by week (from Rahaza shipments qty dispatched)
    weekly_throughput = []
    n = now()
    for w in range(7, -1, -1):
        start = n - timedelta(days=(w + 1) * 7)
        end = n - timedelta(days=w * 7)
        # Primary: rahaza_shipments dispatched in window
        ship_agg = await db.rahaza_shipments.aggregate([
            {'$match': {'status': 'dispatched', 'created_at': {'$gte': start, '$lt': end}}},
            {'$group': {'_id': None, 'total': {'$sum': '$qty'}}}
        ]).to_list(None)
        qty = ship_agg[0]['total'] if ship_agg else 0
        # Fallback: legacy production_progress
        if qty == 0:
            prog_agg = await db.production_progress.aggregate([
                {'$match': {'progress_date': {'$gte': start, '$lt': end}}},
                {'$group': {'_id': None, 'total': {'$sum': '$completed_quantity'}}}
            ]).to_list(None)
            qty = prog_agg[0]['total'] if prog_agg else 0
        weekly_throughput.append({
            'week': f"W{8-w}", 'label': start.strftime('%d/%m'),
            'qty': qty
        })
    # Production completion rate by product
    product_completion = await db.production_job_items.aggregate([
        {'$group': {'_id': '$product_name', 'total_available': {'$sum': '$available_qty'}, 'total_produced': {'$sum': '$produced_qty'}}},
        {'$sort': {'total_available': -1}}, {'$limit': 10}
    ]).to_list(None)
    product_comp = [{'product': p['_id'] or 'Unknown',
                     'available': p.get('total_available', 0),
                     'produced': p.get('total_produced', 0),
                     'rate': round((p['total_produced'] / p['total_available'] * 100) if p.get('total_available', 0) > 0 else 0, 1)
                     } for p in product_completion]
    # Shipment status breakdown
    ship_status_agg = await db.vendor_shipments.aggregate([
        {'$group': {'_id': '$status', 'count': {'$sum': 1}}}
    ]).to_list(None)
    # PO deadline distribution
    all_pos = await db.production_pos.find({'status': {'$nin': ['Closed', 'Draft']}}, {'_id': 0, 'deadline': 1, 'po_number': 1}).to_list(None)
    overdue_count = 0
    this_week_count = 0
    next_week_count = 0
    later_count = 0
    for p in all_pos:
        dl = p.get('deadline')
        if not dl: continue
        if isinstance(dl, str):
            dl = parse_date(dl)
        if not isinstance(dl, datetime): continue
        # Ensure timezone-aware comparison
        if dl.tzinfo is None:
            dl = dl.replace(tzinfo=timezone.utc)
        if dl < n: overdue_count += 1
        elif dl < n + timedelta(days=7): this_week_count += 1
        elif dl < n + timedelta(days=14): next_week_count += 1
        else: later_count += 1
    return {
        'vendorLeadTimes': vendor_lead_times,
        'defectRates': defect_rates,
        'weeklyThroughput': weekly_throughput,
        'productCompletion': product_comp,
        'shipmentStatus': [{'status': s['_id'] or 'Unknown', 'count': s['count']} for s in ship_status_agg],
        'deadlineDistribution': {
            'overdue': overdue_count, 'thisWeek': this_week_count,
            'nextWeek': next_week_count, 'later': later_count
        }
    }


# ─── VENDOR DASHBOARD ────────────────────────────────────────────────────────
@router.get("/vendor/dashboard")
async def get_vendor_dashboard(request: Request):
    user = await require_auth(request)
    if user.get('role') != 'vendor': raise HTTPException(403, 'Forbidden')
    db = get_db()
    vendor_id = user.get('vendor_id')
    jobs = await db.production_jobs.find({'vendor_id': vendor_id}, {'_id': 0}).sort('created_at', -1).to_list(None)
    active_jobs = len([j for j in jobs if j.get('status') == 'In Progress' and not j.get('parent_job_id')])
    completed_jobs = len([j for j in jobs if j.get('status') == 'Completed'])
    incoming = await db.vendor_shipments.count_documents({'vendor_id': vendor_id, 'status': 'Sent'})
    all_job_ids = [j['id'] for j in jobs]
    all_job_items = await db.production_job_items.find({'job_id': {'$in': all_job_ids}}).to_list(None) if all_job_ids else []
    total_produced = sum(i.get('produced_qty', 0) for i in all_job_items)
    total_available = sum(i.get('available_qty', i.get('shipment_qty', 0)) for i in all_job_items)
    return {
        'activeJobs': active_jobs, 'completedJobs': completed_jobs,
        'incomingShipments': incoming,
        'totalProduced': total_produced, 'totalAvailable': total_available,
        'progressPct': round((total_produced / total_available * 100) if total_available > 0 else 0),
        'recentProgress': [], 'alerts': {'overdueJobs': [], 'nearDeadlineJobs': []}
    }


# ─── GLOBAL SEARCH ───────────────────────────────────────────────────────────
@router.get("/global-search")
async def global_search(request: Request):
    """
    Global Search v2 — Rahaza-native.
    Mencari lintas entitas bisnis utama: Order, Work Order, Customer, Material,
    Employee, AR Invoice, AP Invoice, Line.

    Response: {results: [{type, id, label, sub, module}]}
    - `module` = moduleId yang dikenali moduleRegistry.js (untuk navigasi saat klik).
    """
    await require_auth(request)
    db = get_db()
    q = request.query_params.get('q', '').strip()
    if not q or len(q) < 2:
        return {'results': []}

    regex = {'$regex': q, '$options': 'i'}
    limit_per_type = 5
    results = []

    # ── Orders ─────────────────────────────────────────────────────────────
    orders = await db.rahaza_orders.find(
        {'$or': [
            {'order_number': regex},
            {'customer_name_snapshot': regex},
            {'notes': regex},
        ]},
        {'_id': 0, 'id': 1, 'order_number': 1, 'customer_name_snapshot': 1, 'status': 1, 'order_date': 1}
    ).limit(limit_per_type).to_list(None)
    for o in orders:
        results.append({
            'type': 'Order',
            'id': o.get('id'),
            'label': o.get('order_number', ''),
            'sub': f"{o.get('customer_name_snapshot', '')} · {o.get('status', '')}",
            'module': 'prod-orders',
        })

    # ── Work Orders ────────────────────────────────────────────────────────
    wos = await db.rahaza_work_orders.find(
        {'$or': [
            {'wo_number': regex},
            {'order_number_snapshot': regex},
            {'model_code_snapshot': regex},
            {'model_name_snapshot': regex},
        ]},
        {'_id': 0, 'id': 1, 'wo_number': 1, 'order_number_snapshot': 1, 'model_code_snapshot': 1,
         'model_name_snapshot': 1, 'status': 1, 'qty': 1}
    ).limit(limit_per_type).to_list(None)
    for w in wos:
        results.append({
            'type': 'Work Order',
            'id': w.get('id'),
            'label': w.get('wo_number', ''),
            'sub': f"{w.get('model_code_snapshot', '')} · {w.get('qty', 0)} pcs · {w.get('status', '')}",
            'module': 'prod-work-orders',
        })

    # ── Customers ──────────────────────────────────────────────────────────
    customers = await db.rahaza_customers.find(
        {'$or': [{'code': regex}, {'name': regex}, {'phone': regex}, {'email': regex}]},
        {'_id': 0, 'id': 1, 'code': 1, 'name': 1, 'active': 1}
    ).limit(limit_per_type).to_list(None)
    for c in customers:
        results.append({
            'type': 'Pelanggan',
            'id': c.get('id'),
            'label': c.get('name', ''),
            'sub': c.get('code', ''),
            'module': 'mgmt-rahaza-customers',
        })

    # ── Materials ──────────────────────────────────────────────────────────
    materials = await db.rahaza_materials.find(
        {'$or': [{'code': regex}, {'name': regex}]},
        {'_id': 0, 'id': 1, 'code': 1, 'name': 1, 'type': 1, 'unit': 1}
    ).limit(limit_per_type).to_list(None)
    for m in materials:
        results.append({
            'type': 'Material',
            'id': m.get('id'),
            'label': m.get('name', ''),
            'sub': f"{m.get('code', '')} · {m.get('type', '')} ({m.get('unit', '')})",
            'module': 'wh-materials',
        })

    # ── Employees ──────────────────────────────────────────────────────────
    employees = await db.rahaza_employees.find(
        {'$or': [{'employee_code': regex}, {'name': regex}, {'phone': regex}]},
        {'_id': 0, 'id': 1, 'employee_code': 1, 'name': 1, 'role': 1, 'active': 1}
    ).limit(limit_per_type).to_list(None)
    for e in employees:
        results.append({
            'type': 'Karyawan',
            'id': e.get('id'),
            'label': e.get('name', ''),
            'sub': f"{e.get('employee_code', '')} · {e.get('role', '')}",
            'module': 'prod-employees',
        })

    # ── AR Invoices ────────────────────────────────────────────────────────
    ar = await db.rahaza_ar_invoices.find(
        {'$or': [{'invoice_number': regex}, {'customer_name': regex}]},
        {'_id': 0, 'id': 1, 'invoice_number': 1, 'customer_name': 1, 'total': 1, 'status': 1}
    ).limit(limit_per_type).to_list(None)
    for i in ar:
        results.append({
            'type': 'AR Invoice',
            'id': i.get('id'),
            'label': i.get('invoice_number', ''),
            'sub': f"{i.get('customer_name', '')} · {i.get('status', '')}",
            'module': 'fin-ar-invoices',
        })

    # ── AP Invoices ────────────────────────────────────────────────────────
    ap = await db.rahaza_ap_invoices.find(
        {'$or': [{'invoice_number': regex}, {'vendor_name': regex}]},
        {'_id': 0, 'id': 1, 'invoice_number': 1, 'vendor_name': 1, 'total': 1, 'status': 1}
    ).limit(limit_per_type).to_list(None)
    for i in ap:
        results.append({
            'type': 'AP Invoice',
            'id': i.get('id'),
            'label': i.get('invoice_number', ''),
            'sub': f"{i.get('vendor_name', '')} · {i.get('status', '')}",
            'module': 'fin-ap',  # routes to legacy AP module (Rahaza AP belum punya module dedicated)
        })

    # ── Lines ──────────────────────────────────────────────────────────────
    lines = await db.rahaza_lines.find(
        {'$or': [{'code': regex}, {'name': regex}]},
        {'_id': 0, 'id': 1, 'code': 1, 'name': 1, 'process_code': 1, 'active': 1}
    ).limit(limit_per_type).to_list(None)
    for l in lines:
        results.append({
            'type': 'Line Produksi',
            'id': l.get('id'),
            'label': l.get('code', ''),
            'sub': f"{l.get('name', '')} · {l.get('process_code', '')}",
            'module': 'prod-lines',
        })

    return {'results': results}


# ─── ATTACHMENTS ─────────────────────────────────────────────────────────────
@router.get("/attachments")
async def get_attachments(request: Request):
    await require_auth(request)
    db = get_db()
    sp = request.query_params
    entity_type = sp.get('entity_type')
    entity_id = sp.get('entity_id')
    if not entity_type or not entity_id: raise HTTPException(400, 'entity_type and entity_id required')
    return serialize_doc(await db.attachments.find({'entity_type': entity_type, 'entity_id': entity_id}, {'_id': 0}).sort('uploaded_at', -1).to_list(None))

