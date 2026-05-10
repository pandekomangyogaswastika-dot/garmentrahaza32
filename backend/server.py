"""
End-to-End Fashion ERP - Main Server
All route logic has been modularized into routes/ directory.
This file handles app initialization, middleware, and router registration.
"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from database import get_db, client
from auth import seed_initial_data
import os
import logging
from datetime import datetime, timezone
from collections import defaultdict
import time

app = FastAPI(
    title="PT Rahaza Global Indonesia — ERP Rajut API",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────────
from fastapi.exceptions import RequestValidationError
from fastapi import status as http_status
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse({"detail": str(exc.detail), "status": exc.status_code}, status_code=exc.status_code)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(f"Validation error on {request.url.path}: {exc.errors()}")
    return JSONResponse({"detail": "Invalid request data", "errors": exc.errors()}, status_code=422)

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception {request.method} {request.url.path}: {type(exc).__name__}: {exc}", exc_info=True)
    return JSONResponse({"detail": "Internal server error. Please try again later."}, status_code=500)

# ─── STARTUP ─────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    await seed_initial_data()
    await create_indexes()
    # PT Rahaza master data seed (idempotent)
    try:
        from routes.rahaza_master import seed_rahaza_master_data
        await seed_rahaza_master_data()
        from routes.rahaza_production import seed_rahaza_production_data
        await seed_rahaza_production_data()
    except Exception as e:
        logger.warning(f"Rahaza master seed: {e}")
    # Init persistent storage
    try:
        from storage import init_storage
        init_storage()
    except Exception as e:
        logger.warning(f"Storage init: {e}")
    # Start Alert Rule Engine background task (Phase 18A)
    try:
        start_alerts_bg()
        logger.info("Alert rule engine started")
    except Exception as e:
        logger.warning(f"Alert engine start failed: {e}")
    # Phase 5b: BOM data migration (idempotent — fix string versions + missing is_active)
    try:
        from routes.rahaza_bom import migrate_bom_data
        from database import get_db as _get_db
        await migrate_bom_data(_get_db())
        logger.info("BOM migration complete (string versions + is_active fixed)")
    except Exception as e:
        logger.warning(f"BOM migration: {e}")
    logger.info("PT Rahaza ERP API started")


async def create_indexes():
    """Create MongoDB indexes for active collections only (PT Rahaza)."""
    db = get_db()
    try:
        # Auth / RBAC
        await db.users.create_index("email", unique=True)
        await db.roles.create_index("name", unique=True)
        await db.permissions.create_index("key", unique=True)
        await db.activity_logs.create_index([("timestamp", -1)])

        # Warehouse (reused)
        await db.warehouse_locations.create_index("code", unique=True)
        await db.warehouse_locations.create_index("type")
        await db.warehouse_receiving.create_index("receipt_number", unique=True)
        await db.warehouse_receiving.create_index("status")
        await db.warehouse_receiving.create_index("created_at")
        await db.warehouse_stock.create_index([("location_id", 1), ("sku", 1)])
        await db.warehouse_stock.create_index("sku")
        await db.warehouse_movements.create_index("created_at")
        await db.warehouse_movements.create_index("sku")
        await db.warehouse_opname.create_index("opname_number", unique=True)
        await db.warehouse_opname.create_index("status")

        # Accessories (retained as master)
        await db.accessories.create_index("status")

        # PT Rahaza master data — unique code on active records only
        # (use partial index so deactivated codes can be reused)
        pfe_active = {"partialFilterExpression": {"active": True}}
        # Drop old non-partial unique indexes if they exist
        for col in ["rahaza_locations", "rahaza_processes", "rahaza_shifts", "rahaza_machines", "rahaza_lines"]:
            try:
                await db[col].drop_index("code_1")
            except Exception:
                pass
        try:
            await db["rahaza_employees"].drop_index("employee_code_1")
        except Exception:
            pass

        await db.rahaza_locations.create_index("code", unique=True, **pfe_active)
        await db.rahaza_processes.create_index("code", unique=True)  # process seeded, no soft-delete reuse
        await db.rahaza_shifts.create_index("code", unique=True, **pfe_active)
        await db.rahaza_machines.create_index("code", unique=True, **pfe_active)
        await db.rahaza_lines.create_index("code", unique=True, **pfe_active)
        await db.rahaza_employees.create_index("employee_code", unique=True, **pfe_active)

        # Rahaza production execution (Fase 4)
        await db.rahaza_models.create_index("code", unique=True, **pfe_active)
        await db.rahaza_sizes.create_index("code", unique=True, **pfe_active)
        await db.rahaza_line_assignments.create_index([("line_id", 1), ("assign_date", 1), ("shift_id", 1)])
        await db.rahaza_line_assignments.create_index("assign_date")
        await db.rahaza_wip_events.create_index([("line_id", 1), ("timestamp", -1)])
        await db.rahaza_wip_events.create_index([("process_id", 1), ("timestamp", -1)])
        await db.rahaza_wip_events.create_index("timestamp")
        await db.rahaza_wip_events.create_index([("event_date", -1)])                     # FIX: reports query
        await db.rahaza_wip_events.create_index([("event_type", 1), ("event_date", -1)])  # FIX: compound
        await db.rahaza_wip_events.create_index("process_code")                           # FIX: Pareto
        await db.rahaza_wip_events.create_index("operator_id")                            # FIX: payroll PCS

        # Rahaza orders (Fase 5)
        await db.rahaza_customers.create_index("code", unique=True, **pfe_active)
        await db.rahaza_orders.create_index("order_number", unique=True)
        await db.rahaza_orders.create_index("status")
        await db.rahaza_orders.create_index("order_date")
        await db.rahaza_orders.create_index("customer_id")

        # Rahaza BOM (Fase 5b) — unique (model_id, size_id) hanya untuk versi is_active=True
        # Fix: partialFilterExpression harus {active+is_active} bukan hanya {active}
        # Kalau hanya active=True → hanya 1 dokumen per model+size yang boleh active=True
        # → memblokir multi-version. Fix: unique constraint hanya untuk is_active=True.
        for idx_name in ("model_size_active_unique", "model_size_is_active_unique"):
            try:
                await db.rahaza_boms.drop_index(idx_name)
            except Exception:
                pass
        await db.rahaza_boms.create_index(
            [("model_id", 1), ("size_id", 1)],
            unique=True,
            name="model_size_is_active_unique",
            partialFilterExpression={"active": True, "is_active": True},
        )
        await db.rahaza_boms.create_index("model_id")

        # Rahaza work orders (Fase 5c)
        await db.rahaza_work_orders.create_index("wo_number", unique=True)
        await db.rahaza_work_orders.create_index("status")
        await db.rahaza_work_orders.create_index("order_id")
        await db.rahaza_work_orders.create_index("model_id")
        await db.rahaza_deliveries.create_index("delivery_number", unique=True)
        await db.rahaza_deliveries.create_index("order_id")
        await db.rahaza_deliveries.create_index("status")
        await db.rahaza_deliveries.create_index([("delivery_date", -1)])

        await db.rahaza_wip_events.create_index("work_order_id")

        # Rahaza inventory (Fase 7)
        await db.rahaza_materials.create_index("code", unique=True, **pfe_active)
        await db.rahaza_materials.create_index("type")
        await db.rahaza_materials.create_index([("type", 1), ("active", 1)])          # Sprint 3.5: filter by type+active
        await db.rahaza_materials.create_index("min_stock_qty")                         # Sprint 3.5: low-stock queries
        await db.rahaza_material_stock.create_index([("material_id", 1), ("location_id", 1)], unique=True)
        await db.rahaza_material_stock.create_index("location_id")
        await db.rahaza_material_stock.create_index("material_id")                      # Sprint 3.5: stock lookups
        await db.rahaza_material_movements.create_index([("timestamp", -1)])
        await db.rahaza_material_movements.create_index("material_id")
        await db.rahaza_material_issues.create_index("mi_number", unique=True)
        await db.rahaza_material_issues.create_index("work_order_id")
        await db.rahaza_material_issues.create_index("status")

        # Rahaza attendance (Fase 8a)
        await db.rahaza_attendance_events.create_index([("employee_id", 1), ("date", 1)], unique=True)
        await db.rahaza_attendance_events.create_index("date")
        await db.rahaza_attendance_events.create_index("status")

        # Rahaza payroll (Fase 8b + 8c)
        await db.rahaza_payroll_profiles.create_index([("employee_id", 1), ("active", 1)])
        await db.rahaza_payroll_profiles.create_index("pay_scheme")
        await db.rahaza_payroll_runs.create_index("run_number", unique=True)
        await db.rahaza_payroll_runs.create_index([("period_from", 1), ("period_to", 1)])
        await db.rahaza_payroll_runs.create_index("status")
        await db.rahaza_payslips.create_index([("run_id", 1), ("employee_id", 1)])
        await db.rahaza_payslips.create_index("employee_id")

        # Rahaza finance (Fase 8.5)
        await db.rahaza_cost_centers.create_index([("code", 1), ("active", 1)])
        await db.rahaza_ar_invoices.create_index("invoice_number", unique=True)
        await db.rahaza_ar_invoices.create_index("status")
        await db.rahaza_ar_invoices.create_index("customer_id")
        await db.rahaza_ap_invoices.create_index("invoice_number", unique=True)
        await db.rahaza_ap_invoices.create_index("status")
        await db.rahaza_cash_accounts.create_index([("code", 1), ("active", 1)])
        await db.rahaza_cash_movements.create_index([("timestamp", -1)])
        await db.rahaza_cash_movements.create_index("account_id")
        await db.rahaza_expenses.create_index([("date", -1)])
        await db.rahaza_expenses.create_index("cost_center_id")

        # Rahaza costing / HPP (Fase 9)
        await db.rahaza_costing_settings.create_index("id", unique=True)
        await db.rahaza_hpp_snapshots.create_index("work_order_id", unique=True)

        # Rahaza Bundles (Phase 17A)
        await db.rahaza_bundles.create_index("bundle_number", unique=True)
        await db.rahaza_bundles.create_index("work_order_id")
        await db.rahaza_bundles.create_index("status")
        await db.rahaza_bundles.create_index([("current_process_id", 1), ("status", 1)])
        await db.rahaza_bundles.create_index([("current_line_id", 1), ("status", 1)])
        await db.rahaza_bundles.create_index("parent_bundle_id")
        await db.rahaza_bundles.create_index("created_at")
        # Process assignments (new lineboard)
        await db.rahaza_process_assignments.create_index([("order_id", 1), ("process_id", 1)])
        await db.rahaza_process_assignments.create_index([("employee_id", 1)])
        await db.rahaza_process_assignments.create_index([("order_id", 1), ("process_id", 1), ("employee_id", 1)], unique=True)

        # Rahaza Andon (Phase 18B)
        await db.rahaza_andon_events.create_index("status")
        await db.rahaza_andon_events.create_index([("created_at", -1)])
        await db.rahaza_andon_events.create_index("employee_id")
        await db.rahaza_andon_events.create_index("line_id")

        # Rahaza SOP (Phase 18D)
        await db.rahaza_model_process_sop.create_index([("model_id", 1), ("process_id", 1)])
        await db.rahaza_model_process_sop.create_index("active")

        # Rahaza Accounting Core (Phase F1)
        await db.rahaza_coa_accounts.create_index("code", unique=True)
        await db.rahaza_coa_accounts.create_index("type")
        await db.rahaza_coa_accounts.create_index("parent_code")
        await db.rahaza_coa_accounts.create_index("active")
        await db.rahaza_journal_entries.create_index("je_number", unique=True)
        await db.rahaza_journal_entries.create_index([("date", -1)])
        await db.rahaza_journal_entries.create_index("status")
        await db.rahaza_journal_entries.create_index("source_module")
        await db.rahaza_journal_lines.create_index("je_id")
        await db.rahaza_journal_lines.create_index([("account_code", 1), ("date", 1)])
        await db.rahaza_journal_lines.create_index("period_code")
        await db.rahaza_periods.create_index("period_code", unique=True)
        await db.rahaza_periods.create_index("year")

        # Rahaza Accounting Core (Phase F2 — Auto-posting)
        await db.rahaza_posting_profiles.create_index("event_type", unique=True)
        await db.rahaza_posting_profiles.create_index("active")
        # Idempotency: (source_module, source_ref) → exactly one active JE
        await db.rahaza_journal_entries.create_index([("source_module", 1), ("source_ref", 1), ("status", 1)])
        await db.rahaza_journal_lines.create_index("source_module")
        await db.rahaza_journal_lines.create_index("account_type")

        # Phase 21 — QC v2 + Downtime
        await db.rahaza_defect_codes.create_index("code", unique=True)
        await db.rahaza_qc_events.create_index([("created_at", -1)])
        await db.rahaza_qc_events.create_index("bundle_id")
        await db.rahaza_qc_events.create_index("line_id")
        await db.rahaza_machine_downtime.create_index([("start_at", -1)])
        await db.rahaza_machine_downtime.create_index("machine_id")
        await db.rahaza_machine_downtime.create_index("status")
        # Phase 20C — AI
        await db.rahaza_ai_chat_history.create_index([("session_id", 1), ("created_at", 1)])
        await db.rahaza_ai_audit_logs.create_index([("created_at", -1)])
        
        # Phase 22A — Material Reservations & Shift Handovers
        await db.rahaza_material_reservations.create_index("material_id")
        await db.rahaza_material_reservations.create_index("wo_id")
        await db.rahaza_material_reservations.create_index("status")
        await db.rahaza_material_reservations.create_index([("created_at", -1)])
        await db.rahaza_shift_handovers.create_index([("date", -1), ("shift_id", 1)])
        await db.rahaza_shift_handovers.create_index("shift_id")
        await db.rahaza_shift_handovers.create_index("supervisor_id")
        await db.rahaza_handover_templates.create_index("active")

        # M5: LKP indexes (race-condition safety + query performance)
        await db.rahaza_lkp.create_index("lkp_number", unique=True)
        await db.rahaza_lkp.create_index([("work_order_id", 1), ("version", -1)])
        await db.rahaza_lkp.create_index([("created_at", -1)])
        await db.rahaza_lkp.create_index("status")

        # Sprint 2.1: Purchase Orders (W-2)
        await db.rahaza_purchase_orders.create_index("po_number", unique=True)
        await db.rahaza_purchase_orders.create_index("status")
        await db.rahaza_purchase_orders.create_index("vendor_name")
        await db.rahaza_purchase_orders.create_index("po_date")
        await db.rahaza_purchase_orders.create_index("created_at")

        # Sprint 2.3: Leave Management (HR-3)
        await db.rahaza_leave_types.create_index("code", unique=True, **pfe_active)
        await db.rahaza_leave_requests.create_index("employee_id")
        await db.rahaza_leave_requests.create_index("leave_type_id")
        await db.rahaza_leave_requests.create_index("status")
        await db.rahaza_leave_requests.create_index([("from_date", 1), ("to_date", 1)])
        await db.rahaza_leave_requests.create_index("created_at")

        # Sprint 3.1: HR Reports — fast attendance & payroll analytics
        await db.rahaza_attendance_events.create_index([("employee_id", 1), ("date", 1), ("status", 1)])
        await db.rahaza_attendance_events.create_index([("date", 1), ("status", 1)])
        await db.rahaza_payslips.create_index([("run_id", 1), ("status", 1)])
        await db.rahaza_payslips.create_index([("pay_period_from", 1), ("pay_period_to", 1)])

        # Sprint 3.4: Low stock — fast threshold queries
        await db.rahaza_materials.create_index([("type", 1), ("active", 1)])
        await db.rahaza_material_stock.create_index([("material_id", 1), ("quantity", 1)])

        logger.info("MongoDB indexes created (PT Rahaza active schema)")
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")

@app.on_event("shutdown")
async def shutdown():
    try:
        stop_alerts_bg()
    except Exception:
        pass
    client.close()

# ─── HEALTH & METRICS ────────────────────────────────────────────────────────
@app.get("/api/health", tags=["ops"])
async def health_check():
    """Health check: DB ping + uptime. Used by load balancers & monitoring."""
    db = get_db()
    db_ok = False
    db_latency_ms = None
    try:
        t0 = time.time()
        await db.command("ping")
        db_latency_ms = round((time.time() - t0) * 1000, 1)
        db_ok = True
    except Exception as e:
        logger.error(f"Health check DB ping failed: {e}")
    status = "ok" if db_ok else "degraded"
    return JSONResponse(
        {
            "status": status,
            "db": "connected" if db_ok else "unavailable",
            "db_latency_ms": db_latency_ms,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service": "PT Rahaza ERP API",
        },
        status_code=200 if db_ok else 503,
    )

@app.get("/api/metrics", tags=["ops"])
async def metrics():
    """Basic metrics snapshot for monitoring dashboards."""
    db = get_db()
    try:
        counts = {}
        for col in ["rahaza_work_orders", "rahaza_employees", "rahaza_material_issues",
                    "rahaza_payroll_runs", "rahaza_attendance_events", "rahaza_purchase_orders"]:
            counts[col] = await db[col].estimated_document_count()
        return {"status": "ok", "collections": counts, "timestamp": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        return JSONResponse({"status": "error", "detail": str(e)}, status_code=500)

# ─── REQUEST TIMING & LOGGING MIDDLEWARE ─────────────────────────────────────
@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    t0 = time.time()
    response = await call_next(request)
    dur_ms = round((time.time() - t0) * 1000, 1)
    # Log slow requests (> 2s) and all errors
    if dur_ms > 2000 or response.status_code >= 500:
        logger.warning(
            f"[{response.status_code}] {request.method} {request.url.path} "
            f"— {dur_ms}ms client={getattr(request.client, 'host', 'unknown')}"
        )
    return response

# ─── RATE LIMITING MIDDLEWARE ────────────────────────────────────────────────
# Tiered: auth=10/min, AI=20/min, general=300/min
_rl_store: dict = defaultdict(list)

_RL_TIERS = [
    ("/api/auth/login",   10,  60),   # brute-force guard
    ("/api/rahaza/ai",    20,  60),   # AI cost guard
    ("/api/rahaza/hr/reports", 60, 60), # report generation
    (None,               300, 60),   # default
]

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # In K8s/proxy environments, real client IP is in X-Forwarded-For header
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()
    else:
        client_ip = getattr(request.client, "host", "unknown")
    path = request.url.path
    now = time.time()

    # Pick tier
    max_req, window = 300, 60
    for prefix, limit, win in _RL_TIERS:
        if prefix is None or path.startswith(prefix):
            max_req, window = limit, win
            break

    key = f"{client_ip}:{path[:30]}"
    _rl_store[key] = [t for t in _rl_store[key] if now - t < window]
    if len(_rl_store[key]) >= max_req:
        return JSONResponse(
            {"error": f"Rate limit exceeded. Max {max_req} req/{window}s per IP."},
            status_code=429,
        )
    _rl_store[key].append(now)
    return await call_next(request)

# ─── INCLUDE ALL ROUTERS ────────────────────────────────────────────────────
# Domain routers (active after PT Rahaza cleanup — Stage A Phase 1)
from routes.auth_routes import router as auth_router
from routes.master_data import router as master_data_router
from routes.production_po import router as production_po_router
from routes.production import router as production_router
from routes.finance import router as finance_router
from routes.admin import router as admin_router
from routes.dashboard_routes import router as dashboard_router
from routes.operations import router as operations_router
from routes.pdf_smart_config import router as pdf_smart_config_router
from routes.file_storage import router as file_router
from routes.websocket import router as ws_router
from routes.warehouse import router as warehouse_router
from routes.finishing import router as finishing_router
from routes.qc import router as qc_router
from routes.rahaza_master import router as rahaza_master_router
from routes.rahaza_production import router as rahaza_production_router
from routes.rahaza_orders import router as rahaza_orders_router
from routes.rahaza_bom import router as rahaza_bom_router
from routes.rahaza_work_orders import router as rahaza_work_orders_router
from routes.rahaza_execution import router as rahaza_execution_router
from routes.rahaza_lineboard import router as rahaza_lineboard_router
from routes.rahaza_inventory import router as rahaza_inventory_router
from routes.rahaza_attendance import router as rahaza_attendance_router
from routes.rahaza_payroll import router as rahaza_payroll_router
from routes.rahaza_finance import router as rahaza_finance_router
from routes.rahaza_hpp import router as rahaza_hpp_router
from routes.rahaza_reports import router as rahaza_reports_router
from routes.rahaza_notifications import router as rahaza_notifications_router
from routes.rahaza_audit import router as rahaza_audit_router
from routes.rahaza_shipments import router as rahaza_shipments_router
from routes.rahaza_deliveries import router as rahaza_deliveries_router
from routes.rahaza_next_actions import router as rahaza_next_actions_router
from routes.rahaza_setup import router as rahaza_setup_router
from routes.rahaza_bundles import router as rahaza_bundles_router
from routes.rahaza_alerts import (
    router as rahaza_alerts_router,
    start_background_task as start_alerts_bg,
    stop_background_task as stop_alerts_bg,
)
from routes.rahaza_andon import router as rahaza_andon_router
from routes.rahaza_tv import router as rahaza_tv_router
from routes.rahaza_sop import router as rahaza_sop_router
from routes.rahaza_aps import router as rahaza_aps_router
from routes.rahaza_aps_scheduler import router as rahaza_aps_scheduler_router
from routes.rahaza_oee import router as rahaza_oee_router
from routes.rahaza_rework import router as rahaza_rework_router
# Phase F1 — Accounting Core
from routes.rahaza_coa import router as rahaza_coa_router
from routes.rahaza_journals import router as rahaza_journals_router
from routes.rahaza_fin_reports import router as rahaza_fin_reports_router
from routes.rahaza_periods import router as rahaza_periods_router
# Phase F2 — Auto-posting profiles
from routes.rahaza_posting_profiles import router as rahaza_posting_profiles_router
# Admin / Demo Data utilities
from routes.rahaza_admin import router as rahaza_admin_router
# Phase 21 — Decision Support & Quality Metrics
from routes.rahaza_qc_v2 import router as rahaza_qc_v2_router
from routes.rahaza_downtime import router as rahaza_downtime_router
from routes.rahaza_backlog import router as rahaza_backlog_router
# Staff Self-Service Portal
from routes.rahaza_self import router as rahaza_self_router
# Phase 20C — AI Layer
from routes.rahaza_ai import router as rahaza_ai_router
# Phase 22A — Supervisor & PPIC Power Tools
from routes.rahaza_material_reservation import router as rahaza_material_reservation_router
from routes.rahaza_shift_handover import router as rahaza_shift_handover_router
# LKP — Lembar Kerja Produksi (Production Work Sheet PDF)
from routes.rahaza_lkp import router as rahaza_lkp_router
# Sprint 2.1 — Purchase Orders
from routes.rahaza_po import router as rahaza_po_router
# Sprint 2.3 — Leave Management
from routes.rahaza_leave import router as rahaza_leave_router
# Sprint 3.1 — HR Reports
from routes.rahaza_sprint22 import router as rahaza_sprint22_router

# NOTE: legacy routers removed for PT Rahaza rebuild:
#   buyer_portal, retail, distribution, shipments, rnd, cutting
# These flows are not relevant for in-house knit manufacturer.

# Register all active routers
app.include_router(auth_router)
app.include_router(master_data_router)
app.include_router(production_po_router)
app.include_router(production_router)
app.include_router(finance_router)
app.include_router(admin_router)
app.include_router(dashboard_router)
app.include_router(operations_router)
app.include_router(pdf_smart_config_router)
app.include_router(file_router)
app.include_router(ws_router)
app.include_router(warehouse_router)
app.include_router(finishing_router)
app.include_router(qc_router)
app.include_router(rahaza_master_router)
app.include_router(rahaza_production_router)
app.include_router(rahaza_orders_router)
app.include_router(rahaza_bom_router)
app.include_router(rahaza_work_orders_router)
app.include_router(rahaza_execution_router)
app.include_router(rahaza_lineboard_router)
app.include_router(rahaza_inventory_router)
app.include_router(rahaza_attendance_router)
app.include_router(rahaza_payroll_router)
app.include_router(rahaza_finance_router)
app.include_router(rahaza_hpp_router)
app.include_router(rahaza_reports_router)
app.include_router(rahaza_notifications_router)
app.include_router(rahaza_audit_router)
app.include_router(rahaza_shipments_router)
app.include_router(rahaza_deliveries_router)
app.include_router(rahaza_next_actions_router)
app.include_router(rahaza_setup_router)
app.include_router(rahaza_bundles_router)
app.include_router(rahaza_alerts_router)
app.include_router(rahaza_andon_router)
app.include_router(rahaza_tv_router)
app.include_router(rahaza_sop_router)
app.include_router(rahaza_aps_router)
app.include_router(rahaza_aps_scheduler_router)
app.include_router(rahaza_oee_router)
app.include_router(rahaza_rework_router)
# Phase F1 — Accounting Core
app.include_router(rahaza_coa_router)
app.include_router(rahaza_journals_router)
app.include_router(rahaza_fin_reports_router)
app.include_router(rahaza_periods_router)
# Phase F2 — Auto-posting profiles
app.include_router(rahaza_posting_profiles_router)
# Admin / Demo Data utilities
app.include_router(rahaza_admin_router)
# Phase 21 — Decision Support & Quality Metrics
app.include_router(rahaza_qc_v2_router)
app.include_router(rahaza_downtime_router)
app.include_router(rahaza_backlog_router)
# Staff Self-Service Portal
app.include_router(rahaza_self_router)
# Phase 20C — AI Layer
app.include_router(rahaza_ai_router)
# Phase 22A — Supervisor & PPIC Power Tools
app.include_router(rahaza_material_reservation_router)
app.include_router(rahaza_shift_handover_router)
# LKP — Lembar Kerja Produksi
app.include_router(rahaza_lkp_router)
# Sprint 2.1 — Purchase Orders
app.include_router(rahaza_po_router)
# Sprint 2.3 — Leave Management
app.include_router(rahaza_leave_router)
# Sprint 3.1 — HR Reports
from routes.rahaza_hr_reports import router as rahaza_hr_reports_router
app.include_router(rahaza_hr_reports_router)
# Sprint 22 — Supervisor Power Tools
app.include_router(rahaza_sprint22_router)
# Production Calendar (Phase 22B)
from routes.rahaza_production_calendar import router as rahaza_production_calendar_router
app.include_router(rahaza_production_calendar_router)
# Demo Seed
from routes.rahaza_demo_seed import router as rahaza_demo_seed_router
from routes.rahaza_styles import router as rahaza_styles_router
app.include_router(rahaza_demo_seed_router)
app.include_router(rahaza_styles_router)

# Sprint 27 — AQL Sampling Calculator
from routes.rahaza_aql import router as rahaza_aql_router
app.include_router(rahaza_aql_router)

# Integration Settings (API Key management)
from routes.rahaza_integrations import router as rahaza_integrations_router
app.include_router(rahaza_integrations_router)

# Production Wizard (Automation P0)
from routes.rahaza_wizard import router as rahaza_wizard_router
app.include_router(rahaza_wizard_router)

# ─── CORS MIDDLEWARE ────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
