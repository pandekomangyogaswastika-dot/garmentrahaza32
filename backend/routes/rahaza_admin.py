"""
PT Rahaza — Administrative / Demo Data utilities.

Endpoints (prefix /api/rahaza/admin):
  - POST /purge-demo-data   : Hapus seluruh data transaksional & master (user accounts preserved).
  - POST /seed-demo-data    : Generate realistic integrated demo data untuk 3 bulan terakhir.

Super admin only. Dipanggil manual dari UI atau curl.
"""
from fastapi import APIRouter, Request, HTTPException
from database import get_db
from auth import require_auth, serialize_doc, log_activity, hash_password
from routes.rahaza_master import seed_rahaza_master_data, DEFAULT_LOCATIONS
from routes.rahaza_coa import SEED_TEMPLATE, _normal_balance_for, _infer_parent_code
from routes.rahaza_posting_profiles import DEFAULT_PROFILES as PROFILE_TEMPLATES
from routes.rahaza_posting import (
    post_ar_invoice, post_ar_payment,
    post_ap_invoice, post_ap_payment,
    post_expense, post_inventory_receive, post_inventory_issue,
    post_payroll_run, post_cogs_shipment,
)
import uuid
import random
import logging
from datetime import datetime, timezone, timedelta, date
from typing import List, Dict

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rahaza/admin", tags=["rahaza-admin"])


def _uid(): return str(uuid.uuid4())
def _now(): return datetime.now(timezone.utc)


# Collections that store TRANSACTIONAL + MASTER data (to be purged on demo reset).
# Users / roles / permissions / company_settings NEVER purged.
PURGE_COLLECTIONS = [
    # Warehouse (legacy + active)
    "warehouse_locations", "warehouse_receiving", "warehouse_stock",
    "warehouse_movements", "warehouse_opname", "accessories",
    # Rahaza master
    "rahaza_locations", "rahaza_processes", "rahaza_shifts",
    "rahaza_machines", "rahaza_lines", "rahaza_employees",
    "rahaza_models", "rahaza_sizes", "rahaza_customers",
    # Rahaza production
    "rahaza_line_assignments", "rahaza_wip_events",
    "rahaza_orders", "rahaza_boms", "rahaza_work_orders",
    "rahaza_bundles", "rahaza_model_process_sop",
    # Rahaza inventory
    "rahaza_materials", "rahaza_material_stock",
    "rahaza_material_movements", "rahaza_material_issues",
    # Rahaza HR
    "rahaza_attendance_events", "rahaza_payroll_profiles",
    "rahaza_payroll_runs", "rahaza_payslips",
    # Rahaza finance operasional
    "rahaza_cost_centers",
    "rahaza_ar_invoices", "rahaza_ap_invoices",
    "rahaza_cash_accounts", "rahaza_cash_movements",
    "rahaza_expenses",
    # Rahaza costing / HPP
    "rahaza_costing_settings", "rahaza_hpp_snapshots",
    # Rahaza andon
    "rahaza_andon_events", "rahaza_andon_rules",
    # Rahaza alerts
    "rahaza_alerts", "rahaza_alert_rules",
    # Rahaza notifications
    "rahaza_notifications",
    # Rahaza shipments
    "rahaza_shipments",
    # Rahaza setup / next-action
    "rahaza_setup_state", "rahaza_next_action_dismissals",
    # Rahaza APS
    "rahaza_aps_schedules", "rahaza_aps_runs",
    # Rahaza OEE / rework
    "rahaza_oee_snapshots", "rahaza_rework_cases",
    # Rahaza QC v2
    "rahaza_qc_events", "rahaza_defect_codes",        # FIX: add to purge list
    # Rahaza Accounting Core (F1-F3)
    "rahaza_coa_accounts",
    "rahaza_journal_entries", "rahaza_journal_lines",
    "rahaza_periods", "rahaza_posting_profiles",
    # Legacy production / operations
    "purchase_orders", "work_orders", "production_logs",
    "invoices", "payments", "manual_invoices",
    "qc_inspections", "finishing_records",
    # Audit (optional purge)
    "rahaza_audit_log",
]


async def _require_super(request: Request):
    user = await require_auth(request)
    role = (user.get("role") or "").lower()
    if role not in ("superadmin", "admin"):
        raise HTTPException(403, "Forbidden: butuh role superadmin/admin.")
    return user


# ═══════════════════════════════════════════════════════════════════════════
#   PURGE ENDPOINT
# ═══════════════════════════════════════════════════════════════════════════
@router.post("/purge-demo-data")
async def purge_demo_data(request: Request):
    """
    Hapus seluruh data transaksional & master.
    User accounts, roles, permissions, company_settings DIPRESERVE.
    """
    user = await _require_super(request)
    db = get_db()
    summary = {}
    total = 0
    for col in PURGE_COLLECTIONS:
        try:
            res = await db[col].delete_many({})
            if res.deleted_count:
                summary[col] = res.deleted_count
                total += res.deleted_count
        except Exception as e:
            logger.warning(f"Purge {col} error: {e}")
    await log_activity(user["id"], user.get("name", ""), "purge_demo", "admin", f"total_deleted={total}")
    return {"ok": True, "total_deleted": total, "collections": summary}


# ═══════════════════════════════════════════════════════════════════════════
#   SEED COMPREHENSIVE DEMO DATA — 3 MONTHS
# ═══════════════════════════════════════════════════════════════════════════
CUSTOMER_SEED = [
    {"code": "CUST-001", "name": "PT Matahari Retail", "payment_terms": "net_30", "address": "Jakarta Selatan"},
    {"code": "CUST-002", "name": "CV Sumber Rejeki Sandang", "payment_terms": "net_14", "address": "Bandung"},
    {"code": "CUST-003", "name": "Toko Berkah Fashion", "payment_terms": "net_7", "address": "Surabaya"},
    {"code": "CUST-004", "name": "PT Alam Busana Sejahtera", "payment_terms": "net_30", "address": "Semarang"},
    {"code": "CUST-005", "name": "Butik Eva Store", "payment_terms": "cash", "address": "Denpasar"},
    {"code": "CUST-006", "name": "PT Orient Knit Export", "payment_terms": "net_30", "address": "Jakarta Pusat"},
]

MODEL_SEED = [
    {"code": "SWT-BASIC",  "name": "Sweater Basic Knit",        "base_hpp": 85000,  "retail_price": 185000},
    {"code": "CRD-CLASSIC","name": "Cardigan Classic Wool",     "base_hpp": 110000, "retail_price": 245000},
    {"code": "POL-SPORT",  "name": "Polo Sport Knit",           "base_hpp": 65000,  "retail_price": 145000},
    {"code": "TRT-WARM",   "name": "Turtle Neck Warm",          "base_hpp": 95000,  "retail_price": 215000},
    {"code": "KID-CUTE",   "name": "Kids Sweater Cute Series",  "base_hpp": 55000,  "retail_price": 125000},
]

SIZE_SEED = [
    {"code": "S",   "name": "Small"},
    {"code": "M",   "name": "Medium"},
    {"code": "L",   "name": "Large"},
    {"code": "XL",  "name": "Extra Large"},
]

MATERIAL_SEED = [
    {"code": "YRN-ACR-001", "name": "Benang Akrilik Premium 2/28", "type": "yarn",      "unit": "kg", "unit_cost": 95000,  "min_stock": 50,  "max_stock": 300, "min_stock_qty": 80,   "reorder_point": 100},
    {"code": "YRN-ACR-002", "name": "Benang Akrilik Standard 2/32","type": "yarn",      "unit": "kg", "unit_cost": 75000,  "min_stock": 50,  "max_stock": 300, "min_stock_qty": 80,   "reorder_point": 100},
    {"code": "YRN-WOL-001", "name": "Benang Wool Blend 80/20",    "type": "yarn",      "unit": "kg", "unit_cost": 145000, "min_stock": 30,  "max_stock": 200, "min_stock_qty": 50,   "reorder_point": 70},
    {"code": "YRN-COT-001", "name": "Benang Cotton Combed 30s",   "type": "yarn",      "unit": "kg", "unit_cost": 110000, "min_stock": 40,  "max_stock": 250, "min_stock_qty": 60,   "reorder_point": 80},
    {"code": "YRN-NYL-001", "name": "Benang Nylon Stretch",       "type": "yarn",      "unit": "kg", "unit_cost": 85000,  "min_stock": 30,  "max_stock": 200, "min_stock_qty": 50,   "reorder_point": 70},
    {"code": "ACC-BTN-001", "name": "Kancing Plastik Resin 18mm", "type": "accessory", "unit": "pcs","unit_cost": 350,    "min_stock": 2000,"max_stock": 10000,"min_stock_qty": 3000, "reorder_point": 4000},
    {"code": "ACC-ZIP-001", "name": "Resleting YKK 60cm",          "type": "accessory", "unit": "pcs","unit_cost": 4500,   "min_stock": 500, "max_stock": 3000, "min_stock_qty": 800,  "reorder_point": 1000},
    {"code": "ACC-LBL-001", "name": "Label Woven Brand Rahaza",    "type": "accessory", "unit": "pcs","unit_cost": 600,    "min_stock": 2000,"max_stock": 10000,"min_stock_qty": 3000, "reorder_point": 4000},
]

EMPLOYEE_SEED = [
    # Supervisors
    {"code": "EMP-S001", "name": "Budi Santoso",    "job_title": "Supervisor Produksi", "wage_scheme": "bulanan",       "base_rate": 6500000},
    {"code": "EMP-S002", "name": "Sri Wahyuni",     "job_title": "Supervisor Gudang",   "wage_scheme": "bulanan",       "base_rate": 6000000},
    # Operators - Rajut
    {"code": "EMP-R001", "name": "Ahmad Fauzi",     "job_title": "Operator Rajut",      "wage_scheme": "borongan_pcs",  "base_rate": 3500},
    {"code": "EMP-R002", "name": "Siti Aminah",     "job_title": "Operator Rajut",      "wage_scheme": "borongan_pcs",  "base_rate": 3500},
    {"code": "EMP-R003", "name": "Dedi Kurniawan",  "job_title": "Operator Rajut",      "wage_scheme": "borongan_pcs",  "base_rate": 3500},
    {"code": "EMP-R004", "name": "Yuni Lestari",    "job_title": "Operator Rajut",      "wage_scheme": "borongan_pcs",  "base_rate": 3500},
    # Operators - Linking
    {"code": "EMP-L001", "name": "Indah Permata",   "job_title": "Operator Linking",    "wage_scheme": "borongan_pcs",  "base_rate": 4000},
    {"code": "EMP-L002", "name": "Rini Susanti",    "job_title": "Operator Linking",    "wage_scheme": "borongan_pcs",  "base_rate": 4000},
    # Operators - Sewing
    {"code": "EMP-J001", "name": "Mariana Dewi",    "job_title": "Operator Sewing",     "wage_scheme": "borongan_pcs",  "base_rate": 4500},
    {"code": "EMP-J002", "name": "Lia Kartika",     "job_title": "Operator Sewing",     "wage_scheme": "borongan_pcs",  "base_rate": 4500},
    # QC
    {"code": "EMP-Q001", "name": "Bambang Hariyanto","job_title": "QC Inspector",       "wage_scheme": "bulanan",       "base_rate": 5000000},
    {"code": "EMP-Q002", "name": "Wati Suryani",    "job_title": "QC Inspector",        "wage_scheme": "bulanan",       "base_rate": 5000000},
    # Steam / Packing
    {"code": "EMP-P001", "name": "Joko Susilo",     "job_title": "Operator Steam",      "wage_scheme": "borongan_jam",  "base_rate": 25000},
    {"code": "EMP-P002", "name": "Nita Rosmala",    "job_title": "Operator Packing",    "wage_scheme": "mingguan",      "base_rate": 900000},
    # Warehouse / Admin
    {"code": "EMP-W001", "name": "Agung Prasetyo",  "job_title": "Staff Gudang",        "wage_scheme": "bulanan",       "base_rate": 4500000},
    {"code": "EMP-W002", "name": "Fitri Handayani", "job_title": "Admin Produksi",      "wage_scheme": "bulanan",       "base_rate": 4800000},
    {"code": "EMP-A001", "name": "Dewi Anjani",     "job_title": "Admin Keuangan",      "wage_scheme": "bulanan",       "base_rate": 5500000},
    {"code": "EMP-A002", "name": "Hendro Wibowo",   "job_title": "Akuntan",             "wage_scheme": "bulanan",       "base_rate": 7000000},
]

COST_CENTER_SEED = [
    {"code": "CC-PROD", "name": "Produksi",     "description": "Biaya lini produksi"},
    {"code": "CC-MKT",  "name": "Marketing",    "description": "Biaya pemasaran & sales"},
    {"code": "CC-ADM",  "name": "Administrasi", "description": "Biaya admin & office"},
    {"code": "CC-FIN",  "name": "Keuangan",     "description": "Biaya departemen keuangan"},
]

CASH_ACCOUNT_SEED = [
    {"code": "CASH-BSR", "name": "Kas Besar",   "account_type": "cash", "coa_code": "1-1102", "opening_balance": 25_000_000},
    {"code": "BANK-BCA", "name": "Bank BCA",    "account_type": "bank", "coa_code": "1-1201", "opening_balance": 250_000_000},
    {"code": "BANK-MDR", "name": "Bank Mandiri","account_type": "bank", "coa_code": "1-1202", "opening_balance": 150_000_000},
]

MACHINE_SEED = [
    {"code": "MSN-001", "name": "Shima Seiki SES122-RT", "machine_type": "Rajut", "gauge": "7gg", "location_code": "ZNA-RAJUT"},
    {"code": "MSN-002", "name": "Shima Seiki SES122-RT", "machine_type": "Rajut", "gauge": "7gg", "location_code": "ZNA-RAJUT"},
    {"code": "MSN-003", "name": "Stoll CMS ADF 830",     "machine_type": "Rajut", "gauge": "12gg","location_code": "ZNA-RAJUT"},
    {"code": "MSN-004", "name": "Stoll CMS ADF 830",     "machine_type": "Rajut", "gauge": "12gg","location_code": "ZNA-RAJUT"},
    {"code": "MSN-005", "name": "Linking Manual Santoni","machine_type": "Linking","gauge":"","location_code": "ZNA-LINKING"},
    {"code": "MSN-006", "name": "Linking Manual Santoni","machine_type": "Linking","gauge":"","location_code": "ZNA-LINKING"},
]

LINE_SEED = [
    {"code": "LINE-A", "name": "Line A — Rajut Premium",   "process_code": "RAJUT",     "location_code": "ZNA-RAJUT",   "capacity_per_hour": 20},
    {"code": "LINE-B", "name": "Line B — Sewing",          "process_code": "SEWING_S1", "location_code": "ZNA-LINKING", "capacity_per_hour": 25},
    {"code": "LINE-C", "name": "Line C — Linking",         "process_code": "LINKING",   "location_code": "ZNA-LINKING", "capacity_per_hour": 30},
]


async def _ensure_period(db, d: date) -> str:
    """Ensure period exists for date d (status=open)."""
    year = d.year
    month = d.month
    period_code = f"{year}-{month:02d}"
    existing = await db.rahaza_periods.find_one({"period_code": period_code}, {"_id": 0})
    if existing:
        return period_code
    start = date(year, month, 1)
    # last day of month
    if month == 12:
        end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)
    await db.rahaza_periods.insert_one({
        "id": _uid(),
        "period_code": period_code,
        "year": year,
        "month": month,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "status": "open",
        "closed_at": None,
        "closed_by": None,
        "locked": False,
        "created_at": _now(),
        "updated_at": _now(),
    })
    return period_code


async def _seed_coa(db, user: dict):
    inserted = 0
    for code, name, acc_type, is_group, flags in SEED_TEMPLATE:
        exists = await db.rahaza_coa_accounts.find_one({"code": code})
        if exists:
            continue
        parent_code = _infer_parent_code(code, [c for c, *_ in SEED_TEMPLATE])
        await db.rahaza_coa_accounts.insert_one({
            "id": _uid(),
            "code": code, "name": name, "type": acc_type,
            "parent_code": parent_code, "is_group": is_group,
            "normal_balance": _normal_balance_for(acc_type),
            "flags": flags, "active": True,
            "created_at": _now(), "updated_at": _now(),
            "created_by": user["id"], "created_by_name": user.get("name", ""),
        })
        inserted += 1
    return inserted


async def _seed_posting_profiles(db, user: dict):
    """Seed default posting profiles (proper schema with `mapping` dict)."""
    count = 0
    for p in PROFILE_TEMPLATES:
        exists = await db.rahaza_posting_profiles.find_one({"event_type": p["event_type"]})
        if exists:
            continue
        await db.rahaza_posting_profiles.insert_one({
            "id": _uid(),
            "event_type": p["event_type"],
            "description": p["description"],
            "mapping": p["mapping"],
            "active": True,
            "created_at": _now(), "updated_at": _now(),
            "created_by": user["id"],
            "created_by_name": user.get("name", ""),
        })
        count += 1
    return count


async def _seed_master_data(db, user: dict) -> dict:
    """Seed full master dataset. Returns ID maps for referencing."""
    maps = {
        "locations": {}, "processes": {}, "shifts": {},
        "machines": {}, "lines": {}, "employees": {},
        "models": {}, "sizes": {}, "customers": {},
        "materials": {}, "cash_accounts": {}, "cost_centers": {},
        "employee_users": {},   # FIX: track employee user accounts
    }

    # Locations + Processes + Shifts (use existing master seed fn)
    await seed_rahaza_master_data()
    for r in await db.rahaza_locations.find({}, {"_id": 0}).to_list(None):
        maps["locations"][r["code"]] = r["id"]
    for r in await db.rahaza_processes.find({}, {"_id": 0}).to_list(None):
        maps["processes"][r["code"]] = r["id"]
    for r in await db.rahaza_shifts.find({}, {"_id": 0}).to_list(None):
        maps["shifts"][r["code"]] = r["id"]

    # Machines
    for m in MACHINE_SEED:
        doc = {
            "id": _uid(), "code": m["code"], "name": m["name"],
            "machine_type": m["machine_type"], "gauge": m.get("gauge", ""),
            "location_id": maps["locations"].get(m["location_code"]),
            "status": "active", "active": True,
            "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_machines.insert_one(doc)
        maps["machines"][m["code"]] = doc["id"]

    # Lines
    for ln in LINE_SEED:
        doc = {
            "id": _uid(), "code": ln["code"], "name": ln["name"],
            "process_id": maps["processes"].get(ln["process_code"]),
            "location_id": maps["locations"].get(ln["location_code"]),
            "capacity_per_hour": ln["capacity_per_hour"],
            "notes": "", "active": True,
            "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_lines.insert_one(doc)
        maps["lines"][ln["code"]] = doc["id"]

    # Employees
    for e in EMPLOYEE_SEED:
        doc = {
            "id": _uid(), "employee_code": e["code"], "name": e["name"],
            "job_title": e["job_title"],
            "location_id": maps["locations"].get("ZNA-RAJUT"),
            "phone": f"0812-{random.randint(1000,9999)}-{random.randint(1000,9999)}",
            "wage_scheme": e["wage_scheme"],
            "base_rate": e["base_rate"],
            "joined_at": (_now() - timedelta(days=365)).isoformat(),
            "active": True,
            "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_employees.insert_one(doc)
        maps["employees"][e["code"]] = doc["id"]
        
        # FIX: Create dedicated employee user account for Self Service Portal
        emp_user_pwd = "Employee@123"
        emp_user_hash = hash_password(emp_user_pwd)
        emp_username = e["code"].lower().replace("-", "") + "@garment.com"  # e.g. emps001@garment.com
        emp_user_doc = {
            "id": _uid(),
            "email": emp_username,
            "password": emp_user_hash,
            "name": e["name"],
            "role": "karyawan",
            "employee_id": doc["id"],    # FIX: link user to employee
            "portal_access": ["self", "production"],
            "active": True,
            "created_at": _now(), "updated_at": _now(),
        }
        await db.users.update_one({"email": emp_username}, {"$setOnInsert": emp_user_doc}, upsert=True)
        maps["employee_users"][e["code"]] = emp_user_doc["id"]
        
        # FIX: Create payroll profile for each employee (required for payroll run)
        scheme_map = {
            "bulanan": "monthly", "mingguan": "weekly",
            "borongan_pcs": "pcs", "borongan_jam": "hourly",
        }

        # PCS process rates per employee code (seed defaults for borongan_pcs employees)
        # These are used as fallback if WO.process_rates is not set
        PCS_PROC_RATES_BY_CODE = {
            # Rajut operators → hourly rate (8500/jam)
            "EMP-R001": [{"process_code": "RAJUT", "rate": 8500, "unit": "jam", "scheme": "hourly"}],
            "EMP-R002": [{"process_code": "RAJUT", "rate": 8500, "unit": "jam", "scheme": "hourly"}],
            "EMP-R003": [{"process_code": "RAJUT", "rate": 8500, "unit": "jam", "scheme": "hourly"}],
            "EMP-R004": [{"process_code": "RAJUT", "rate": 8500, "unit": "jam", "scheme": "hourly"}],
            # Linking operators → pcs rate
            "EMP-L001": [{"process_code": "LINKING", "rate": 350, "unit": "pcs", "scheme": "pcs"}],
            "EMP-L002": [{"process_code": "LINKING", "rate": 350, "unit": "pcs", "scheme": "pcs"}],
            # Sewing operators → pcs rate for S1/S2/S3
            "EMP-J001": [
                {"process_code": "SEWING_S1", "rate": 300, "unit": "pcs", "scheme": "pcs"},
                {"process_code": "SEWING_S2", "rate": 250, "unit": "pcs", "scheme": "pcs"},
                {"process_code": "SEWING_S3", "rate": 200, "unit": "pcs", "scheme": "pcs"},
            ],
            "EMP-J002": [
                {"process_code": "SEWING_S1", "rate": 300, "unit": "pcs", "scheme": "pcs"},
                {"process_code": "SEWING_S2", "rate": 250, "unit": "pcs", "scheme": "pcs"},
                {"process_code": "SEWING_S3", "rate": 200, "unit": "pcs", "scheme": "pcs"},
            ],
            # Steam operator
            "EMP-T001": [{"process_code": "STEAM", "rate": 150, "unit": "pcs", "scheme": "pcs"}],
        }
        # Resolve process IDs from current maps (built after processes are seeded)
        pcs_proc_rates_raw = PCS_PROC_RATES_BY_CODE.get(e["code"], [])
        pcs_proc_rates_resolved = []
        for r in pcs_proc_rates_raw:
            proc_id = maps["processes"].get(r["process_code"])
            if proc_id:
                pcs_proc_rates_resolved.append({
                    "process_id": proc_id,
                    "process_code": r["process_code"],
                    "rate": float(r["rate"]),
                    "unit": r["unit"],
                    "scheme": r.get("scheme", "pcs"),
                })

        profile_doc = {
            "id": _uid(),
            "employee_id": doc["id"],
            "employee_code": e["code"],
            "employee_name": e["name"],
            "pay_scheme": scheme_map.get(e["wage_scheme"], "monthly"),
            "wage_scheme": e["wage_scheme"],  # Keep alias
            "base_rate": e["base_rate"],
            "overtime_multiplier": 1.5,
            "meal_allowance": 20000,
            "transport_allowance": 15000,
            "bpjs_kes": 0.01,    # 1% employee
            "bpjs_tk": 0.02,     # 2% employee
            "pph21_bracket": "progressive",
            "pcs_process_rates": pcs_proc_rates_resolved,
            "effective_from": (_now() - timedelta(days=365)).isoformat(),
            "effective_to": None,
            "active": True,
            "created_at": _now(), "updated_at": _now(),
            "created_by": user["id"],
        }
        await db.rahaza_payroll_profiles.insert_one(profile_doc)

    # Models
    for m in MODEL_SEED:
        doc = {
            "id": _uid(), "code": m["code"], "name": m["name"],
            "category": "Sweater Rajut",
            "base_hpp": m["base_hpp"],
            "retail_price": m["retail_price"],
            "active": True,
            "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_models.insert_one(doc)
        maps["models"][m["code"]] = doc["id"]

    # Sizes
    for s in SIZE_SEED:
        doc = {
            "id": _uid(), "code": s["code"], "name": s["name"],
            "active": True,
            "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_sizes.insert_one(doc)
        maps["sizes"][s["code"]] = doc["id"]

    # Customers
    for c in CUSTOMER_SEED:
        doc = {
            "id": _uid(), "code": c["code"], "name": c["name"],
            "company_type": "company",
            "npwp": f"01.{random.randint(100,999)}.{random.randint(100,999)}.{random.randint(1,9)}-000.000",
            "phone": f"021-{random.randint(1000,9999)}-{random.randint(1000,9999)}",
            "email": f"{c['code'].lower()}@example.co.id",
            "address": c["address"],
            "payment_terms": c["payment_terms"],
            "payment_terms_custom": "",
            "credit_limit": 500_000_000,
            "notes": "",
            "active": True,
            "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_customers.insert_one(doc)
        maps["customers"][c["code"]] = doc["id"]

    # Materials (+ opening stock at default location)
    default_loc_id = maps["locations"].get("ZNA-GDG-A") or list(maps["locations"].values())[0]
    for m in MATERIAL_SEED:
        doc = {
            "id": _uid(), "code": m["code"], "name": m["name"],
            "type": m["type"], "unit": m["unit"],
            "unit_cost": m["unit_cost"],
            "min_stock": m["min_stock"],
            "max_stock": m["max_stock"],
            "min_stock_qty": m.get("min_stock_qty"),          # Sprint 3.4
            "min_stock_percentage": m.get("min_stock_pct"),    # Sprint 3.4
            "reorder_point": m.get("reorder_point"),           # Sprint 3.4
            "description": "",
            "active": True,
            "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_materials.insert_one(doc)
        maps["materials"][m["code"]] = doc["id"]
        # Opening stock: yarn uses 40-70% of max; accessories deliberately low to show low-stock demo
        if m["type"] == "accessory":
            qty = round(m["max_stock"] * random.uniform(0.1, 0.25), 2)  # Low stock for demo
        else:
            qty = round(m["max_stock"] * random.uniform(0.4, 0.7), 2)
        await db.rahaza_material_stock.insert_one({
            "id": _uid(),
            "material_id": doc["id"],
            "location_id": default_loc_id,
            "qty": qty,  # Canonical field name (B5 fix: use qty not quantity)
            "updated_at": _now(),
        })

    # Cost Centers
    for cc in COST_CENTER_SEED:
        doc = {
            "id": _uid(), "code": cc["code"], "name": cc["name"],
            "description": cc["description"],
            "active": True,
            "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_cost_centers.insert_one(doc)
        maps["cost_centers"][cc["code"]] = doc["id"]

    # Cash Accounts (+ opening balance cash movement)
    for ca in CASH_ACCOUNT_SEED:
        doc = {
            "id": _uid(), "code": ca["code"], "name": ca["name"],
            "account_type": ca["account_type"],
            "coa_code": ca["coa_code"],
            "currency": "IDR",
            "opening_balance": ca["opening_balance"],
            "current_balance": ca["opening_balance"],
            "active": True,
            "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_cash_accounts.insert_one(doc)
        maps["cash_accounts"][ca["code"]] = doc["id"]

    # BOMs — basic: 1 model × 1 size × 2-3 materials
    yarn_materials = [m for m in MATERIAL_SEED if m["type"] == "yarn"]
    acc_materials  = [m for m in MATERIAL_SEED if m["type"] == "accessory"]
    for m_code, m_id in maps["models"].items():
        for s_code, s_id in maps["sizes"].items():
            chosen_yarn = random.choice(yarn_materials)
            chosen_acc  = random.choice(acc_materials)
            # qty per piece — larger size needs more yarn
            yarn_qty = {"S": 0.35, "M": 0.42, "L": 0.50, "XL": 0.58}.get(s_code, 0.45)
            await db.rahaza_boms.insert_one({
                "id": _uid(),
                "model_id": m_id, "size_id": s_id,
                "version": "v1",
                "active": True,
                "materials": [
                    {
                        "material_id": maps["materials"][chosen_yarn["code"]],
                        "material_code": chosen_yarn["code"],
                        "material_name": chosen_yarn["name"],
                        "quantity": yarn_qty,
                        "unit": chosen_yarn["unit"],
                        "unit_cost": chosen_yarn["unit_cost"],
                    },
                    {
                        "material_id": maps["materials"][chosen_acc["code"]],
                        "material_code": chosen_acc["code"],
                        "material_name": chosen_acc["name"],
                        "quantity": 4 if chosen_acc["unit"] == "pcs" else 1,
                        "unit": chosen_acc["unit"],
                        "unit_cost": chosen_acc["unit_cost"],
                    },
                ],
                "notes": "",
                "created_at": _now(), "updated_at": _now(),
            })

    return maps


async def _gen_order_number(db, i: int) -> str:
    return f"ORD-{datetime.now().year}-{i:04d}"


async def _gen_wo_number(db, i: int) -> str:
    return f"WO-{datetime.now().year}-{i:04d}"


async def _gen_inv_number(db, prefix: str, i: int) -> str:
    return f"{prefix}-{datetime.now().year}{datetime.now().month:02d}-{i:04d}"


# ═══════════════════════════════════════════════════════════════════════════
#   SEED DEMO DATA — 3 MONTHS INTEGRATED
# ═══════════════════════════════════════════════════════════════════════════
@router.post("/seed-demo-data")
async def seed_demo_data(request: Request):
    """
    Generate realistic 3-month demo data. Safe to call multiple times if
    purge was called first. Otherwise will error on duplicates.
    """
    user = await _require_super(request)
    db = get_db()
    random.seed(42)  # deterministic for reproducibility

    log = {"steps": []}

    def _step(name, data=None):
        log["steps"].append({"name": name, **(data or {})})

    # ── 1. CoA + Posting Profiles + Periods for last 4 months ──────────────
    coa_count = await _seed_coa(db, user)
    _step("coa_seed", {"inserted": coa_count})
    pp_count = await _seed_posting_profiles(db, user)
    _step("posting_profiles", {"inserted": pp_count})

    today = date.today()
    # Ensure last 5 calendar months of periods (covers 3-month seed window + buffer)
    def _first_of_prev_month(d: date) -> date:
        if d.month == 1:
            return date(d.year - 1, 12, 1)
        return date(d.year, d.month - 1, 1)

    cursor = today.replace(day=1)
    for _ in range(5):
        await _ensure_period(db, cursor)
        cursor = _first_of_prev_month(cursor)
    _step("periods_ensured")

    # ── 2. Master Data ─────────────────────────────────────────────────────
    maps = await _seed_master_data(db, user)
    _step("master_data", {
        "customers": len(maps["customers"]),
        "models": len(maps["models"]),
        "employees": len(maps["employees"]),
        "lines": len(maps["lines"]),
        "machines": len(maps["machines"]),
        "materials": len(maps["materials"]),
    })

    # ── 3. Material Receives (weekly over 90 days) ─────────────────────────
    receive_count = 0
    default_loc_id = maps["locations"].get("ZNA-GDG-A") or list(maps["locations"].values())[0]
    for week in range(12):
        d = today - timedelta(days=90 - week * 7)
        # Each week receive 2-3 materials (bahan baku)
        yarns = [m for m in MATERIAL_SEED if m["type"] == "yarn"]
        chosen = random.sample(yarns, 2)
        for mat in chosen:
            qty = round(random.uniform(30, 80), 1)
            mv = {
                "id": _uid(),
                "material_id": maps["materials"][mat["code"]],
                "location_id": default_loc_id,
                "movement_type": "receive",
                "quantity": qty,
                "unit_cost": mat["unit_cost"],
                "total_cost": round(qty * mat["unit_cost"]),
                "reference": f"PO-YARN-{week:03d}",
                "notes": f"Receive weekly yarn {mat['code']}",
                "timestamp": datetime.combine(d, datetime.min.time()).replace(tzinfo=timezone.utc),
            }
            await db.rahaza_material_movements.insert_one(mv)
            # Update stock
            await db.rahaza_material_stock.update_one(
                {"material_id": mv["material_id"], "location_id": mv["location_id"]},
                {"$inc": {"qty": qty}, "$set": {"updated_at": _now()}}  # B5: use qty not quantity
            )
            # Auto-post JE
            try:
                await post_inventory_receive(db, mv, user)
            except Exception as e:
                logger.warning(f"Post receive err: {e}")
            receive_count += 1
    _step("material_receives", {"count": receive_count})

    # ── 4. Orders + Work Orders + AR Invoices ──────────────────────────────
    orders = []
    order_idx = 1
    customer_ids = list(maps["customers"].values())
    model_ids = list(maps["models"].values())
    size_ids  = list(maps["sizes"].values())

    # 15 orders over 90 days
    for i in range(15):
        order_date = today - timedelta(days=random.randint(10, 88))
        # Fix M-007: Adjust due_date to reduce overdue orders
        # For older orders (>60 days old), extend due date to be in future or near-future
        days_ago = (today - order_date).days
        if days_ago > 60:
            # Old orders: due date should be today + 10-30 days (future)
            due_date = today + timedelta(days=random.randint(10, 30))
        elif days_ago > 30:
            # Medium orders: due date should be today ± 5 days
            due_date = today + timedelta(days=random.randint(-5, 15))
        else:
            # Recent orders: due date 30-60 days from order date
            due_date = order_date + timedelta(days=random.randint(30, 60))
        customer_id = random.choice(customer_ids)
        customer = await db.rahaza_customers.find_one({"id": customer_id}, {"_id": 0})
        # 2-4 items per order
        num_items = random.randint(2, 4)
        items = []
        order_total_value = 0
        for _ in range(num_items):
            mid = random.choice(model_ids)
            sid = random.choice(size_ids)
            qty = random.choice([50, 100, 150, 200, 300])
            # Fetch price
            model = await db.rahaza_models.find_one({"id": mid}, {"_id": 0})
            unit_price = model["retail_price"]
            items.append({
                "id": _uid(),
                "model_id": mid,
                "size_id": sid,
                "qty": qty,
                "unit_price": unit_price,
                "notes": "",
            })
            order_total_value += qty * unit_price

        order_doc = {
            "id": _uid(),
            "order_number": await _gen_order_number(db, order_idx),
            "order_date": order_date.isoformat(),
            "due_date": due_date.isoformat(),
            "customer_id": customer_id,
            "customer_name_snapshot": customer["name"],
            "is_internal": False,
            "status": random.choice(["confirmed", "in_production", "completed", "completed", "completed"]),
            "items": items,
            "notes": "",
            "total_value_snapshot": order_total_value,
            "created_by": user["id"],
            "created_by_name": user.get("name", ""),
            "created_at": datetime.combine(order_date, datetime.min.time()).replace(tzinfo=timezone.utc),
            "updated_at": _now(),
        }
        await db.rahaza_orders.insert_one(order_doc)
        orders.append(order_doc)
        order_idx += 1

        # Generate Work Orders (1 WO per item)
        wo_idx = 1
        for item in items:
            target_end = order_date + timedelta(days=random.randint(14, 28))
            # Determine WO status based on order status
            if order_doc["status"] == "completed":
                wo_status = "completed"
            elif order_doc["status"] == "in_production":
                wo_status = random.choice(["in_production", "in_production", "completed"])
            else:
                wo_status = random.choice(["draft", "released"])

            # Resolve model_name and size_name for WO picker display
            _model_doc = await db.rahaza_models.find_one({"id": item["model_id"]}, {"_id": 0, "name": 1, "code": 1}) or {}
            _size_doc  = await db.rahaza_sizes.find_one({"id": item["size_id"]},  {"_id": 0, "name": 1, "code": 1}) or {}
            wo_doc = {
                "id": _uid(),
                "wo_number": f"{order_doc['order_number']}-WO{wo_idx:02d}",
                "order_id": order_doc["id"],
                "order_number_snapshot": order_doc["order_number"],
                "order_item_id": item["id"],
                "model_id": item["model_id"],
                "size_id": item["size_id"],
                "model_name": _model_doc.get("name") or _model_doc.get("code") or "",
                "size_name": _size_doc.get("code") or _size_doc.get("name") or "",
                "qty": item["qty"],
                "customer_snapshot": customer["name"],
                "is_internal": False,
                "priority": random.choice(["normal", "normal", "high"]),
                "target_start_date": order_date.isoformat(),
                "target_end_date": target_end.isoformat(),
                "bom_snapshot": None,
                "status": wo_status,
                "notes": "",
                "created_by": user["id"],
                "created_by_name": user.get("name", ""),
                "created_at": datetime.combine(order_date, datetime.min.time()).replace(tzinfo=timezone.utc),
                "updated_at": _now(),
            }
            await db.rahaza_work_orders.insert_one(wo_doc)
            wo_idx += 1

        # AR Invoice — one per order if order is at least confirmed
        if order_doc["status"] in ("confirmed", "in_production", "completed"):
            subtotal = order_total_value
            tax_pct = 11  # PPN
            tax = round(subtotal * tax_pct / 100)
            total = subtotal + tax
            issue_date = (order_date + timedelta(days=random.randint(1, 7))).isoformat()
            due_ar = (order_date + timedelta(days=30)).isoformat()
            inv = {
                "id": _uid(),
                "invoice_number": await _gen_inv_number(db, "AR", order_idx - 1),
                "customer_id": customer_id,
                "order_id": order_doc["id"],
                "issue_date": issue_date,
                "due_date": due_ar,
                "items": [{
                    "description": f"{item['qty']} pcs {(await db.rahaza_models.find_one({'id':item['model_id']},{'_id':0}))['name']}",
                    "qty": item["qty"],
                    "unit": "pcs",
                    "price": item["unit_price"],
                    "amount": item["qty"] * item["unit_price"],
                } for item in items],
                "subtotal": subtotal,
                "tax_pct": tax_pct,
                "tax_amount": tax,
                "total": total,
                "paid_amount": 0,
                "balance": total,
                "status": "sent",
                "notes": "",
                "created_at": datetime.combine(order_date, datetime.min.time()).replace(tzinfo=timezone.utc),
                "updated_at": _now(),
                "created_by": user["id"],
                "created_by_name": user.get("name", ""),
            }
            await db.rahaza_ar_invoices.insert_one(inv)
            # Auto-post JE
            try:
                await post_ar_invoice(db, inv, user)
            except Exception as e:
                logger.warning(f"Post ar inv err: {e}")

            # If order completed, 80% chance mark invoice as paid
            if order_doc["status"] == "completed" and random.random() < 0.8:
                paid_date = (order_date + timedelta(days=random.randint(15, 40)))
                bank_id = maps["cash_accounts"]["BANK-BCA"]
                # Move JE for payment + cash movement
                await db.rahaza_ar_invoices.update_one(
                    {"id": inv["id"]},
                    {"$set": {"paid_amount": total, "balance": 0, "status": "paid", "updated_at": _now()}}
                )
                # Cash movement
                cm = {
                    "id": _uid(),
                    "account_id": bank_id,
                    "direction": "in",
                    "amount": total,
                    "reference": inv["invoice_number"],
                    "source_module": "ar_payment",
                    "source_ref": inv["id"],
                    "notes": f"Pelunasan {inv['invoice_number']}",
                    "timestamp": datetime.combine(paid_date, datetime.min.time()).replace(tzinfo=timezone.utc),
                }
                await db.rahaza_cash_movements.insert_one(cm)
                await db.rahaza_cash_accounts.update_one(
                    {"id": bank_id},
                    {"$inc": {"current_balance": total}}
                )
                # Post payment JE
                try:
                    await post_ar_payment(db, inv, total, bank_id, paid_date.isoformat(), user, movement_id=cm["id"])
                except Exception as e:
                    logger.warning(f"Post ar pay err: {e}")

    _step("orders_wos_arinvoices", {"orders": len(orders)})

    # ── 5. AP Invoices (supplier invoices over 3 months) ───────────────────
    ap_vendors = [
        {"name": "PT Supplier Benang Nusantara", "desc": "Pembelian benang bulanan"},
        {"name": "CV Aksesoris Bersama",         "desc": "Pembelian aksesoris"},
        {"name": "PT Listrik Negara",            "desc": "Tagihan listrik pabrik"},
        {"name": "CV Percetakan Label Cepat",    "desc": "Cetak label produk"},
        {"name": "PT Jasa Kurir Kilat",          "desc": "Jasa ekspedisi pengiriman"},
    ]
    ap_count = 0
    for i in range(10):
        inv_date = today - timedelta(days=random.randint(5, 85))
        vendor = random.choice(ap_vendors)
        subtotal = random.choice([8_500_000, 12_500_000, 22_000_000, 6_200_000, 18_900_000, 35_000_000])
        tax = round(subtotal * 0.11)
        total = subtotal + tax
        ap = {
            "id": _uid(),
            "invoice_number": f"AP-{inv_date.year}{inv_date.month:02d}-{i:03d}",
            "vendor_name": vendor["name"],
            "issue_date": inv_date.isoformat(),
            "due_date": (inv_date + timedelta(days=30)).isoformat(),
            "items": [{"description": vendor["desc"], "qty": 1, "unit": "lot", "price": subtotal, "amount": subtotal}],
            "subtotal": subtotal,
            "tax_pct": 11,
            "tax_amount": tax,
            "total": total,
            "paid_amount": 0,
            "balance": total,
            "status": "sent",
            "notes": "",
            "created_at": datetime.combine(inv_date, datetime.min.time()).replace(tzinfo=timezone.utc),
            "updated_at": _now(),
        }
        await db.rahaza_ap_invoices.insert_one(ap)
        try:
            await post_ap_invoice(db, ap, user)
        except Exception as e:
            logger.warning(f"Post ap inv err: {e}")

        # 60% paid
        if random.random() < 0.6:
            pay_date = inv_date + timedelta(days=random.randint(10, 28))
            bank_id = maps["cash_accounts"]["BANK-MDR"]
            await db.rahaza_ap_invoices.update_one(
                {"id": ap["id"]},
                {"$set": {"paid_amount": total, "balance": 0, "status": "paid", "updated_at": _now()}}
            )
            cm = {
                "id": _uid(),
                "account_id": bank_id,
                "direction": "out",
                "amount": total,
                "reference": ap["invoice_number"],
                "source_module": "ap_payment",
                "source_ref": ap["id"],
                "notes": f"Bayar {ap['invoice_number']}",
                "timestamp": datetime.combine(pay_date, datetime.min.time()).replace(tzinfo=timezone.utc),
            }
            await db.rahaza_cash_movements.insert_one(cm)
            await db.rahaza_cash_accounts.update_one(
                {"id": bank_id},
                {"$inc": {"current_balance": -total}}
            )
            try:
                await post_ap_payment(db, ap, total, bank_id, pay_date.isoformat(), user, movement_id=cm["id"])
            except Exception as e:
                logger.warning(f"Post ap pay err: {e}")
        ap_count += 1
    _step("ap_invoices", {"count": ap_count})

    # ── 6. Expenses (operational OPEX) ─────────────────────────────────────
    expense_types = [
        {"desc": "Biaya listrik pabrik",      "cc": "CC-PROD", "amount_range": (8_500_000, 12_000_000), "gl": "6-2100"},
        {"desc": "Biaya air & limbah",        "cc": "CC-PROD", "amount_range": (1_500_000, 2_500_000),  "gl": "6-2200"},
        {"desc": "Biaya telepon & internet",  "cc": "CC-ADM",  "amount_range": (800_000, 1_200_000),    "gl": "6-3100"},
        {"desc": "ATK & office supplies",     "cc": "CC-ADM",  "amount_range": (500_000, 1_500_000),    "gl": "6-3200"},
        {"desc": "Biaya transportasi sales",  "cc": "CC-MKT",  "amount_range": (1_000_000, 3_500_000),  "gl": "6-4100"},
        {"desc": "Biaya marketing digital",   "cc": "CC-MKT",  "amount_range": (2_500_000, 5_000_000),  "gl": "6-4200"},
    ]
    exp_count = 0
    for i in range(18):
        exp_date = today - timedelta(days=random.randint(1, 89))
        t = random.choice(expense_types)
        amount = random.randint(*t["amount_range"])
        bank_id = maps["cash_accounts"]["BANK-BCA"]
        exp = {
            "id": _uid(),
            "date": exp_date.isoformat(),
            "description": t["desc"],
            "category": t["desc"].split()[0],
            "amount": amount,
            "cost_center_id": maps["cost_centers"][t["cc"]],
            "gl_debit_code": t["gl"],
            "payment_account_id": bank_id,
            "reference": f"EXP-{exp_date.year}{exp_date.month:02d}-{i:03d}",
            "notes": "",
            "created_at": datetime.combine(exp_date, datetime.min.time()).replace(tzinfo=timezone.utc),
            "updated_at": _now(),
            "created_by": user["id"],
            "created_by_name": user.get("name", ""),
        }
        await db.rahaza_expenses.insert_one(exp)
        # Cash movement
        cm = {
            "id": _uid(),
            "account_id": bank_id,
            "direction": "out",
            "amount": amount,
            "reference": exp["reference"],
            "source_module": "expense",
            "source_ref": exp["id"],
            "notes": t["desc"],
            "timestamp": datetime.combine(exp_date, datetime.min.time()).replace(tzinfo=timezone.utc),
        }
        await db.rahaza_cash_movements.insert_one(cm)
        await db.rahaza_cash_accounts.update_one(
            {"id": bank_id},
            {"$inc": {"current_balance": -amount}}
        )
        try:
            await post_expense(db, exp, user)
        except Exception as e:
            logger.warning(f"Post exp err: {e}")
        exp_count += 1
    _step("expenses", {"count": exp_count})

    # ── 7. Attendance (daily for all active employees over 90 days) ────────
    # Only weekdays (Mon-Sat, skip Sun)
    att_count = 0
    employee_docs = await db.rahaza_employees.find({"active": True}, {"_id": 0}).to_list(None)
    for emp in employee_docs:
        for day_off in range(90):
            d = today - timedelta(days=day_off)
            if d.weekday() == 6:  # Sunday off
                continue
            # 95% present, 3% sakit, 2% alfa
            r = random.random()
            status = "hadir" if r < 0.95 else ("sakit" if r < 0.97 else "alfa")  # FIX: "absen" → valid status
            shift_id = maps["shifts"].get("S1")
            clock_in = "07:00" if status == "hadir" else None    # FIX: clock_in not check_in
            clock_out = "16:00" if status == "hadir" else None   # FIX: clock_out not check_out
            await db.rahaza_attendance_events.insert_one({
                "id": _uid(),
                "employee_id": emp["id"],
                "date": d.isoformat(),
                "shift_id": shift_id,
                "status": status,
                "clock_in": clock_in,     # FIX: correct field name
                "clock_out": clock_out,   # FIX: correct field name
                "hours_worked": 8.0 if status == "hadir" else 0,
                "overtime_hours": 0,
                "notes": "",
                "created_at": datetime.combine(d, datetime.min.time()).replace(tzinfo=timezone.utc),
                "updated_at": _now(),
            })
            att_count += 1
    _step("attendance", {"count": att_count})

    # ── 8. Payroll Runs (monthly for 3 months) ─────────────────────────────
    payroll_count = 0
    for month_off in range(3, 0, -1):
        d_end = today.replace(day=1) - timedelta(days=(month_off - 1) * 30)
        d_end = d_end.replace(day=1) - timedelta(days=1)  # last day of that month
        d_start = d_end.replace(day=1)
        run_number = f"PR-{d_end.year}{d_end.month:02d}"
        # Skip if exists
        if await db.rahaza_payroll_runs.find_one({"run_number": run_number}):
            continue
        total_gross = 0
        payslips = []
        for emp in employee_docs:
            # Simplified gross pay based on scheme
            scheme = emp.get("wage_scheme", "bulanan")
            base_rate = emp.get("base_rate", 0)
            if scheme == "bulanan":
                gross = base_rate
            elif scheme == "mingguan":
                gross = base_rate * 4
            elif scheme == "borongan_pcs":
                pcs_done = random.randint(800, 1500)
                gross = pcs_done * base_rate
            elif scheme == "borongan_jam":
                hours = random.randint(160, 200)
                gross = hours * base_rate
            else:
                gross = base_rate
            gross = int(gross)
            # Deductions
            bpjs = int(gross * 0.02)
            pph = int(gross * 0.025) if gross > 5_000_000 else 0
            ded_total = bpjs + pph
            net = gross - ded_total
            total_gross += gross
            payslips.append({
                "id": _uid(),
                "run_id": None,  # filled after run insert
                "employee_id": emp["id"],
                "employee_code": emp["employee_code"],
                "employee_name": emp["name"],
                "pay_scheme": scheme,        # FIX: use pay_scheme not wage_scheme
                "wage_scheme": scheme,       # Keep for backward compat
                "base_rate": base_rate,
                "gross_pay": gross,          # FIX: use gross_pay
                "gross_salary": gross,       # Keep alias for HR Reports
                "deductions": [              # FIX: array of {label, amount}
                    {"label": "BPJS Tenaga Kerja", "amount": bpjs},
                    *([{"label": "PPh 21", "amount": pph}] if pph > 0 else []),
                ],
                "deductions_total": ded_total,    # FIX: explicit total
                "total_deductions": ded_total,     # Alias for HR Reports
                "net_pay": net,              # FIX: use net_pay
                "net_salary": net,           # Keep alias for HR Reports
                "period_from": d_start.isoformat(),
                "period_to": d_end.isoformat(),
                "created_at": datetime.combine(d_end, datetime.min.time()).replace(tzinfo=timezone.utc),
            })
        run_doc = {
            "id": _uid(),
            "run_number": run_number,
            "period_from": d_start.isoformat(),
            "period_to": d_end.isoformat(),
            "status": "finalized",
            "total_gross": total_gross,
            "total_net": total_gross - int(total_gross * 0.045),  # approx
            "total_deductions": int(total_gross * 0.045),
            "total_employees": len(payslips),   # FIX: total_employees not employee_count
            "employee_count": len(payslips),    # Keep alias
            "notes": "",
            "finalized_at": datetime.combine(d_end, datetime.min.time()).replace(tzinfo=timezone.utc),
            "finalized_by": user["id"],
            "created_at": datetime.combine(d_end, datetime.min.time()).replace(tzinfo=timezone.utc),
            "updated_at": _now(),
        }
        await db.rahaza_payroll_runs.insert_one(run_doc)
        for slip in payslips:
            slip["run_id"] = run_doc["id"]
            await db.rahaza_payslips.insert_one(slip)
        try:
            await post_payroll_run(db, run_doc, user)
        except Exception as e:
            logger.warning(f"Post payroll err: {e}")
        payroll_count += 1
    _step("payroll_runs", {"count": payroll_count})

    # ── 9. Bundles (Phase 17A) — seed bundles for in-production WOs ────────
    bundle_count = 0
    wos_in_prog = await db.rahaza_work_orders.find(
        {"status": {"$in": ["in_production", "completed"]}}, {"_id": 0}
    ).to_list(None)
    # Limit to 30 WOs to keep seed fast
    for wo in wos_in_prog[:30]:
        # Create 3-5 bundles per WO (qty distributed)
        num_bundles = random.randint(3, 5)
        bundle_qty = wo["qty"] // num_bundles
        for b_idx in range(num_bundles):
            process_code = random.choice(["RAJUT", "LINKING", "SEWING_S1", "SEWING_S2", "SEWING_S3", "QC", "STEAM", "PACKING"])
            status_options = {
                "in_production": ["open", "in_process", "in_process", "complete"],
                "completed": ["complete"],
            }
            bundle = {
                "id": _uid(),
                "bundle_number": f"B-{wo['wo_number']}-{b_idx+1:02d}",
                "work_order_id": wo["id"],
                "wo_number_snapshot": wo["wo_number"],
                "model_id": wo["model_id"],
                "size_id": wo["size_id"],
                "qty": bundle_qty,
                "status": random.choice(status_options[wo["status"]]),
                "current_process_id": maps["processes"].get(process_code),
                "current_line_id": random.choice(list(maps["lines"].values())),
                "parent_bundle_id": None,
                "notes": "",
                "created_at": _now() - timedelta(days=random.randint(1, 30)),
                "updated_at": _now(),
            }
            await db.rahaza_bundles.insert_one(bundle)
            bundle_count += 1
    _step("bundles", {"count": bundle_count})

    # ── 10. Shipments (for completed WOs) ──────────────────────────────────
    ship_count = 0
    completed_wos = await db.rahaza_work_orders.find({"status": "completed"}, {"_id": 0}).limit(15).to_list(None)
    for idx, wo in enumerate(completed_wos):
        order = await db.rahaza_orders.find_one({"id": wo["order_id"]}, {"_id": 0}) if wo.get("order_id") else None
        if not order:
            continue
        ship_date = today - timedelta(days=random.randint(5, 60))
        ship = {
            "id": _uid(),
            "shipment_number": f"SJ-{ship_date.year}{ship_date.month:02d}-{idx:04d}",
            "work_order_id": wo["id"],
            "wo_number_snapshot": wo["wo_number"],
            "order_id": order["id"],
            "order_number_snapshot": order["order_number"],
            "customer_id": order["customer_id"],
            "customer_name_snapshot": order.get("customer_name_snapshot", ""),
            "ship_date": ship_date.isoformat(),
            "qty": wo["qty"],
            "status": "dispatched",
            "notes": "",
            "created_at": datetime.combine(ship_date, datetime.min.time()).replace(tzinfo=timezone.utc),
            "updated_at": _now(),
            "created_by": user["id"],
        }
        await db.rahaza_shipments.insert_one(ship)
        # Post COGS
        try:
            await post_cogs_shipment(db, ship, user)
        except Exception as e:
            logger.warning(f"Post cogs ship err: {e}")
        ship_count += 1
    _step("shipments", {"count": ship_count})

    # ── 11. Line Assignments (daily for each line, 90 days) ────────────────
    assign_count = 0
    rajut_emp_ids = [maps["employees"][c] for c in maps["employees"] if c.startswith("EMP-R")]
    linking_emp_ids = [maps["employees"][c] for c in maps["employees"] if c.startswith("EMP-L")]
    sewing_emp_ids = [maps["employees"][c] for c in maps["employees"] if c.startswith("EMP-J")]
    steam_emp_ids = [maps["employees"][c] for c in maps["employees"] if c.startswith("EMP-T")]
    qc_emp_ids = [maps["employees"][c] for c in maps["employees"] if c.startswith("EMP-Q")]
    packing_emp_ids = [maps["employees"][c] for c in maps["employees"] if c.startswith("EMP-P")]
    
    for day_off in range(90):
        d = today - timedelta(days=day_off)
        if d.weekday() == 6:
            continue
        # Assign to all process types (not just rajut/linking)
        for line_code, line_id in maps["lines"].items():
            # Determine employee pool based on line
            if line_code == "LINE-C":
                emp_pool = linking_emp_ids
            elif line_code == "LINE-A":
                emp_pool = rajut_emp_ids
            elif line_code == "LINE-B":
                # Mix of sewing operators
                emp_pool = sewing_emp_ids if sewing_emp_ids else rajut_emp_ids
            elif line_code == "LINE-D":
                # QC operators
                emp_pool = qc_emp_ids if qc_emp_ids else rajut_emp_ids
            elif line_code == "LINE-E":
                # Packing/Steam operators
                emp_pool = packing_emp_ids + steam_emp_ids if (packing_emp_ids or steam_emp_ids) else rajut_emp_ids
            else:
                emp_pool = rajut_emp_ids
            
            if not emp_pool:
                continue
            emp_ids = random.sample(emp_pool, min(2, len(emp_pool)))
            target = random.randint(80, 200)
            actual = int(target * random.uniform(0.75, 1.05))
            await db.rahaza_line_assignments.insert_one({
                "id": _uid(),
                "line_id": line_id,
                "assign_date": d.isoformat(),
                "shift_id": maps["shifts"].get("S1"),
                "employee_ids": emp_ids,
                "target_qty": target,
                "actual_qty": actual,
                "notes": "",
                "created_at": datetime.combine(d, datetime.min.time()).replace(tzinfo=timezone.utc),
                "updated_at": _now(),
            })
            assign_count += 1
    _step("line_assignments", {"count": assign_count})

    # ── 12. WIP Events (output events linked to real WOs) ─────────────────
    wip_count = 0
    all_assignments = await db.rahaza_line_assignments.find({}, {"_id": 0}).to_list(None)
    process_map = {p["id"]: p for p in await db.rahaza_processes.find({"active": True}, {"_id": 0}).to_list(None)}
    line_map    = {l["id"]: l for l in await db.rahaza_lines.find({}, {"_id": 0}).to_list(None)}
    employee_docs_list = await db.rahaza_employees.find({"active": True}, {"_id": 0}).to_list(None)

    # ── Populate WO process_rates — hardcoded realistic defaults ─────────
    # These match the payroll profiles seeded below; WO rates take priority in payroll
    seed_wo_rates_lookup = {}   # process_code → rate entry (will be filled after profiles seeded)
    # Use hardcoded defaults so WOs have rates even before profiles are created
    SEED_PROC_RATES = {
        "RAJUT":     {"rate": 8500, "unit": "jam"},
        "LINKING":   {"rate":  350, "unit": "pcs"},
        "SEWING_S1": {"rate":  300, "unit": "pcs"},
        "SEWING_S2": {"rate":  250, "unit": "pcs"},
        "SEWING_S3": {"rate":  200, "unit": "pcs"},
        "STEAM":     {"rate":  150, "unit": "pcs"},
        "QC":        {"rate":  100, "unit": "pcs"},
        "PACKING":   {"rate":  125, "unit": "pcs"},
    }
    active_procs_for_rates = await db.rahaza_processes.find({"active": True, "is_rework": {"$ne": True}}, {"_id": 0, "id": 1, "code": 1}).to_list(None)
    wo_rate_entries = []
    for p in active_procs_for_rates:
        defaults = SEED_PROC_RATES.get(p["code"])
        if defaults:
            wo_rate_entries.append({
                "process_id":   p["id"],
                "process_code": p["code"],
                "rate":         float(defaults["rate"]),
                "unit":         defaults["unit"],
            })
    if wo_rate_entries:
        all_seed_wos = await db.rahaza_work_orders.find({}, {"_id": 0, "id": 1}).to_list(None)
        for wo in all_seed_wos:
            await db.rahaza_work_orders.update_one(
                {"id": wo["id"]},
                {"$set": {"process_rates": wo_rate_entries}}
            )

    # ── Build WO pool per process (for work_order_id linking) ────────────
    active_wos = await db.rahaza_work_orders.find(
        {"status": {"$in": ["draft", "in_production", "completed"]}},
        {"_id": 0, "id": 1, "model_id": 1, "size_id": 1, "order_id": 1}
    ).to_list(None)
    wo_pool_all = active_wos if active_wos else []

    for assignment in all_assignments:
        line_id = assignment.get("line_id")
        line = line_map.get(line_id) or {}
        process_id = line.get("process_id")
        process    = process_map.get(process_id) or {}
        proc_code  = process.get("code") or "RAJUT"
        assign_date = assignment.get("assign_date")
        if not assign_date:
            continue
        actual_qty = assignment.get("actual_qty") or 0
        emp_ids = assignment.get("employee_ids") or []
        if not emp_ids and employee_docs_list:
            emp_ids = [random.choice(employee_docs_list)["id"]]

        # Pick a random WO from pool for this event
        wo_ref = random.choice(wo_pool_all) if wo_pool_all else None

        # Distribute output qty across operators
        for emp_id in emp_ids:
            op_qty = actual_qty // max(1, len(emp_ids))
            if op_qty <= 0:
                continue
            ev = {
                "id": _uid(),
                "timestamp": datetime.combine(
                    datetime.fromisoformat(assign_date).date(),
                    datetime.min.time()
                ).replace(tzinfo=timezone.utc),
                "event_date":   assign_date,
                "line_id":      line_id,
                "process_id":   process_id,
                "process_code": proc_code,
                "location_id":  line.get("location_id"),
                "model_id":     wo_ref.get("model_id") if wo_ref else None,
                "size_id":      wo_ref.get("size_id")  if wo_ref else None,
                "work_order_id": wo_ref["id"]           if wo_ref else None,
                "event_type":   "output",
                "qty":          op_qty,
                "notes":        "Seed data",
                "operator_id":  emp_id,
                "created_by":       user["id"],
                "created_by_name":  user.get("name", ""),
            }
            await db.rahaza_wip_events.insert_one(ev)
            wip_count += 1
        # Add QC events (10% of output pass, 5% fail)
        total_qty = actual_qty
        qc_pass_qty = int(total_qty * 0.10)
        qc_fail_qty = int(total_qty * 0.05)
        if qc_pass_qty > 0:
            qc_ev = {
                "id": _uid(),
                "timestamp": datetime.combine(
                    datetime.fromisoformat(assign_date).date(),
                    datetime.min.time()
                ).replace(tzinfo=timezone.utc),
                "event_date": assign_date,
                "line_id": line_id,
                "process_id": process_id,
                "process_code": proc_code,
                "location_id": line.get("location_id"),
                "model_id": None,
                "work_order_id": None,
                "event_type": "qc_pass",
                "qty": qc_pass_qty,
                "notes": "Seed QC data",
                "operator_id": user["id"],
                "created_by": user["id"],
                "created_by_name": user.get("name", ""),
            }
            await db.rahaza_wip_events.insert_one(qc_ev)
            wip_count += 1
        if qc_fail_qty > 0:
            qc_fev = {
                "id": _uid(),
                "timestamp": qc_ev["timestamp"],
                "event_date": assign_date,
                "line_id": line_id,
                "process_id": process_id,
                "process_code": proc_code,
                "location_id": line.get("location_id"),
                "model_id": None,
                "work_order_id": None,
                "event_type": "qc_fail",
                "qty": qc_fail_qty,
                "notes": "Seed QC data",
                "operator_id": user["id"],
                "created_by": user["id"],
                "created_by_name": user.get("name", ""),
            }
            await db.rahaza_wip_events.insert_one(qc_fev)
            wip_count += 1
    _step("wip_events", {"count": wip_count})

    # ── 13. QC Events (rahaza_qc_events for FPY module) ──────────────────────
    qc_event_count = 0
    all_bundles = await db.rahaza_bundles.find(
        {"status": {"$in": ["complete", "completed", "qc_pass"]}}, {"_id": 0}
    ).to_list(None)
    for b in all_bundles[:100]:  # Limit to 100 bundles for seed performance
        total_qty = b.get("quantity") or b.get("qty") or 20
        pass_qty = int(total_qty * random.uniform(0.85, 0.98))
        fail_qty = total_qty - pass_qty
        # Determine date from bundle or default to last 30 days
        created_at = b.get("created_at") or b.get("updated_at")
        if created_at and hasattr(created_at, "isoformat"):
            ev_date = created_at.isoformat()
        elif isinstance(created_at, str):
            ev_date = created_at
        else:
            days_ago = random.randint(0, 30)
            ev_date = (date.today() - timedelta(days=days_ago)).isoformat() + "T08:00:00Z"
        qc_doc = {
            "id": _uid(),
            "bundle_id": b.get("id"),
            "work_order_id": b.get("work_order_id"),
            "line_id": b.get("current_line_id") or b.get("line_id"),  # FIX: bundles use current_line_id
            "employee_id": user["id"],
            "model_id": b.get("model_id"),
            "shift_id": None,
            "checked_qty": total_qty,
            "pass_qty": pass_qty,
            "fail_qty": fail_qty,
            "defect_code_ids": [],
            "defect_details": [],
            "notes": "Seed QC inspection",
            "verdict": "pass" if fail_qty == 0 else "fail",
            "created_at": ev_date,
            "created_by": user["id"],
        }
        await db.rahaza_qc_events.insert_one(qc_doc)
        qc_event_count += 1
    _step("qc_events", {"count": qc_event_count})

    # ── 14. Manual JE (opening balance adjustment for realism) ─────────────
    # Recreate opening balance JE for equity
    _step("complete")

    await log_activity(user["id"], user.get("name", ""), "seed_demo", "admin", f"ok steps={len(log['steps'])}")
    return {"ok": True, **log}



# ═══════════════════════════════════════════════════════════════════════════
#   HR DEMO SEED — Leave types, leave requests, current payroll draft
# ═══════════════════════════════════════════════════════════════════════════
@router.post("/seed-hr-demo")
async def seed_hr_demo(request: Request):
    """
    Dedicated HR demo seed — tidak menghapus data lain.
    Seeds:
      1. Leave types (Cuti Tahunan, Sakit, Melahirkan, Izin)
      2. Leave requests with mixed statuses
      3. Overtime events for April & May
      4. Current month (May 2026) payroll run in 'draft' status
      5. Fix attendance data to have complete April & May records
    """
    user = await _require_super(request)
    db = get_db()
    log = {"steps": []}

    def _step(name, info=None):
        log["steps"].append({"name": name, **(info or {})})

    today = date.today()
    now_dt = _now()

    # ── 1. Leave types ──────────────────────────────────────────────────────
    LEAVE_TYPES = [
        {"code": "CT-T", "name": "Cuti Tahunan",    "max_days": 12, "paid": True,  "color": "#22c55e",
         "description": "Hak cuti tahunan karyawan — 12 hari per tahun"},
        {"code": "CT-S", "name": "Cuti Sakit",      "max_days": 14, "paid": True,  "color": "#3b82f6",
         "description": "Cuti sakit dengan surat dokter wajib"},
        {"code": "CT-M", "name": "Cuti Melahirkan", "max_days": 90, "paid": True,  "color": "#a855f7",
         "description": "Cuti melahirkan 3 bulan sesuai UU"},
        {"code": "IZ-U", "name": "Izin Urusan",     "max_days": 3,  "paid": False, "color": "#f59e0b",
         "description": "Izin keperluan keluarga/pribadi (tidak berbayar)"},
        {"code": "IZ-K", "name": "Izin Kedinasan",  "max_days": 5,  "paid": True,  "color": "#06b6d4",
         "description": "Izin pelatihan/kedinasan dibayar perusahaan"},
    ]
    lt_count = 0
    lt_map = {}
    for lt in LEAVE_TYPES:
        existing = await db.rahaza_leave_types.find_one({"code": lt["code"]})
        if existing:
            lt_map[lt["code"]] = existing["id"]
            continue
        doc = {
            "id": _uid(), "code": lt["code"], "name": lt["name"],
            "max_days": lt["max_days"], "paid": lt["paid"], "color": lt["color"],
            "description": lt["description"], "active": True,
            "created_at": now_dt, "updated_at": now_dt,
        }
        await db.rahaza_leave_types.insert_one(doc)
        lt_map[lt["code"]] = doc["id"]
        lt_count += 1
    _step("leave_types", {"added": lt_count, "total": len(LEAVE_TYPES)})

    # ── 2. Leave requests ───────────────────────────────────────────────────
    employees = await db.rahaza_employees.find({"active": True}, {"_id": 0}).to_list(None)
    lr_count = 0
    LR_SCENARIOS = [
        # code, emp_idx, lt_code, days_ago_from, days_ago_to, status, note
        ("EMP-S001", "CT-T",  28, 22, "approved",  "Liburan keluarga"),
        ("EMP-R001", "IZ-U",  15, 13, "approved",  "Urusan keluarga"),
        ("EMP-L001", "CT-S",  10,  8, "approved",  "Sakit demam — surat dokter terlampir"),
        ("EMP-J001", "CT-T",   5,  2, "pending",   "Liburan"),
        ("EMP-R002", "IZ-U",   3,  2, "pending",   "Keperluan mendesak"),
        ("EMP-Q001", "IZ-K",  20, 17, "approved",  "Pelatihan K3 BPJS"),
        ("EMP-W001", "CT-T",  60, 55, "approved",  "Mudik lebaran"),
        ("EMP-A001", "CT-S",  45, 42, "rejected",  "Tidak ada surat keterangan dokter"),
        ("EMP-P001", "IZ-U",   1,  1, "pending",   "Minta izin hari ini"),
        ("EMP-R003", "CT-T",  90, 83, "approved",  "Cuti tahun lalu"),
        ("EMP-J002", "CT-M",  35, 35 - 90, "approved", "Cuti melahirkan"),  # 90-day leave
        ("EMP-L002", "CT-S",  7,  5, "pending",   "Sakit flu"),
    ]
    emp_map = {e["employee_code"]: e for e in employees}
    for emp_code, lt_code, d_from_ago, d_to_ago, status, note in LR_SCENARIOS:
        emp = emp_map.get(emp_code)
        lt_id = lt_map.get(lt_code)
        if not emp or not lt_id:
            continue
        # Skip if already exists
        ex = await db.rahaza_leave_requests.find_one({
            "employee_id": emp["id"], "leave_type_id": lt_id,
        })
        if ex:
            continue
        from_dt = today - timedelta(days=d_from_ago)
        to_dt   = today - timedelta(days=d_to_ago)
        if to_dt < from_dt:
            to_dt = from_dt
        n_days  = max(1, (to_dt - from_dt).days + 1)
        doc = {
            "id": _uid(),
            "employee_id": emp["id"],
            "employee_code": emp["employee_code"],
            "employee_name": emp["name"],
            "leave_type_id": lt_id,
            "leave_type_code": lt_code,
            "from_date":    from_dt.isoformat(),
            "to_date":      to_dt.isoformat(),
            "days":         n_days,
            "reason":       note,
            "status":       status,
            "approved_by":  user["id"] if status in ("approved", "rejected") else None,
            "approved_at":  now_dt     if status in ("approved", "rejected") else None,
            "rejection_note": "Tidak memenuhi syarat" if status == "rejected" else None,
            "created_at": now_dt, "updated_at": now_dt,
        }
        await db.rahaza_leave_requests.insert_one(doc)
        lr_count += 1
    _step("leave_requests", {"added": lr_count})

    # ── 3. Overtime events ──────────────────────────────────────────────────
    ot_emp_codes = ["EMP-R001", "EMP-R002", "EMP-L001", "EMP-J001", "EMP-P001"]
    ot_count = 0
    for emp_code in ot_emp_codes:
        emp = emp_map.get(emp_code)
        if not emp:
            continue
        for day_ago in [3, 7, 14, 21, 28]:
            ot_date = today - timedelta(days=day_ago)
            if ot_date.weekday() == 6:
                continue
            ex = await db.rahaza_attendance_events.find_one({
                "employee_id": emp["id"], "date": ot_date.isoformat(), "overtime_hours": {"$gt": 0}
            })
            if ex:
                continue
            # Update existing attendance to add overtime, or insert new
            existing_att = await db.rahaza_attendance_events.find_one({
                "employee_id": emp["id"], "date": ot_date.isoformat()
            })
            ot_hrs = random.choice([1, 2, 3])
            if existing_att:
                await db.rahaza_attendance_events.update_one(
                    {"id": existing_att["id"]},
                    {"$set": {"overtime_hours": ot_hrs, "clock_out": "19:00" if ot_hrs >= 2 else "18:00"}}
                )
            else:
                shifts = await db.rahaza_shifts.find({}, {"_id": 0}).limit(1).to_list(None)
                shift_id = shifts[0]["id"] if shifts else None
                await db.rahaza_attendance_events.insert_one({
                    "id": _uid(), "employee_id": emp["id"],
                    "date": ot_date.isoformat(), "shift_id": shift_id,
                    "status": "hadir", "clock_in": "07:00",
                    "clock_out": "18:00" if ot_hrs == 1 else "19:00",
                    "hours_worked": 8.0, "overtime_hours": ot_hrs,
                    "notes": "Lembur penyelesaian order",
                    "created_at": datetime.combine(ot_date, datetime.min.time()).replace(tzinfo=timezone.utc),
                    "updated_at": now_dt,
                })
            ot_count += 1
    _step("overtime_events", {"added": ot_count})

    # ── 4. Current month payroll draft (May 2026) ────────────────────────────
    cur_year  = today.year
    cur_month = today.month
    run_number = f"PR-{cur_year}{cur_month:02d}"
    existing_run = await db.rahaza_payroll_runs.find_one({"run_number": run_number})
    payslip_count = 0
    if not existing_run:
        period_start = date(cur_year, cur_month, 1)
        period_end   = today  # up to today
        total_gross  = 0
        payslips     = []
        for emp in employees:
            scheme    = emp.get("wage_scheme", "bulanan")
            base_rate = emp.get("base_rate", 0)

            if scheme == "bulanan":
                # Pro-rate: days worked so far this month / total days in month
                import calendar as cal_mod
                total_days = cal_mod.monthrange(cur_year, cur_month)[1]
                days_so_far = today.day
                gross = int(base_rate * days_so_far / total_days)
            elif scheme == "mingguan":
                weeks = (today.day // 7)
                gross = int(base_rate * weeks)
            elif scheme == "borongan_pcs":
                pcs_done = random.randint(200, 800)
                gross = pcs_done * base_rate
            elif scheme == "borongan_jam":
                hours = random.randint(40, 80)
                gross = hours * base_rate
            else:
                gross = base_rate
            gross = max(int(gross), 0)

            # Deductions
            bpjs_kes = int(gross * 0.01)
            bpjs_tk  = int(gross * 0.02)
            pph21    = int(gross * 0.025) if gross > 5_000_000 else 0
            ded_total = bpjs_kes + bpjs_tk + pph21
            net       = gross - ded_total
            total_gross += gross

            # Allowances
            meal_allowance      = 20000 * today.day
            transport_allowance = 15000 * today.day
            gross_with_allowance = gross + meal_allowance + transport_allowance

            payslips.append({
                "id":                  _uid(),
                "run_id":              None,
                "employee_id":         emp["id"],
                "employee_code":       emp["employee_code"],
                "employee_name":       emp["name"],
                "job_title":           emp.get("job_title", ""),
                "department":          emp.get("department", "Produksi"),
                "pay_scheme":          scheme,
                "wage_scheme":         scheme,
                "base_rate":           base_rate,
                "gross_pay":           gross,
                "gross_salary":        gross,
                "meal_allowance":      meal_allowance,
                "transport_allowance": transport_allowance,
                "overtime_pay":        0,
                "deductions": [
                    {"label": "BPJS Kesehatan",    "amount": bpjs_kes},
                    {"label": "BPJS Tenaga Kerja",  "amount": bpjs_tk},
                    *([{"label": "PPh 21",           "amount": pph21}] if pph21 > 0 else []),
                ],
                "deductions_total":    ded_total,
                "total_deductions":    ded_total,
                "net_pay":             net,
                "net_salary":          net,
                "period_from":         period_start.isoformat(),
                "period_to":           period_end.isoformat(),
                "pay_period_from":     period_start.isoformat(),
                "pay_period_to":       period_end.isoformat(),
                "status":              "draft",
                "created_at":          now_dt,
            })

        run_doc = {
            "id":               _uid(),
            "run_number":       run_number,
            "period_from":      period_start.isoformat(),
            "period_to":        period_end.isoformat(),
            "status":           "draft",
            "total_gross":      total_gross,
            "total_net":        total_gross - sum(s["deductions_total"] for s in payslips),
            "total_deductions": sum(s["deductions_total"] for s in payslips),
            "total_employees":  len(payslips),
            "employee_count":   len(payslips),
            "notes":            f"Payroll bulan {today.strftime('%B %Y')} — belum difinalisasi",
            "created_at":       now_dt, "updated_at": now_dt,
        }
        await db.rahaza_payroll_runs.insert_one(run_doc)
        for slip in payslips:
            slip["run_id"] = run_doc["id"]
            await db.rahaza_payslips.insert_one(slip)
        payslip_count = len(payslips)
        _step("payroll_draft", {"run_number": run_number, "status": "draft", "employees": payslip_count})
    else:
        _step("payroll_draft", {"skipped": True, "existing": run_number})

    # ── 5. Summary ──────────────────────────────────────────────────────────
    total_att = await db.rahaza_attendance_events.count_documents({})
    total_lr  = await db.rahaza_leave_requests.count_documents({})
    total_lt  = await db.rahaza_leave_types.count_documents({})
    total_pr  = await db.rahaza_payroll_runs.count_documents({})
    total_ps  = await db.rahaza_payslips.count_documents({})
    _step("complete")

    return {
        "ok": True,
        "summary": {
            "leave_types":       total_lt,
            "leave_requests":    total_lr,
            "attendance_events": total_att,
            "payroll_runs":      total_pr,
            "payslips":          total_ps,
            "payroll_draft_run": run_number,
            "new_payslips":      payslip_count,
        },
        **log,
    }

@router.post("/migrate-wo-status")
async def migrate_wo_status(request: Request):
    """One-time migration: fix WO status in_progress → in_production."""
    await _require_super(request)
    db = get_db()
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    # Fix WOs
    r_wo = await db.rahaza_work_orders.update_many(
        {"status": "in_progress"},
        {"$set": {"status": "in_production", "updated_at": now}}
    )
    # Fix Orders
    r_ord = await db.rahaza_orders.update_many(
        {"status": "in_progress"},
        {"$set": {"status": "in_production", "updated_at": now}}
    )
    return {"ok": True, "wo_fixed": r_wo.modified_count, "orders_fixed": r_ord.modified_count}


@router.post("/reset-and-seed")
async def reset_and_seed(request: Request):
    """Convenience: purge lalu seed demo data langsung."""
    user = await _require_super(request)
    # Reuse functions directly
    db = get_db()
    summary = {}
    total = 0
    for col in PURGE_COLLECTIONS:
        try:
            res = await db[col].delete_many({})
            if res.deleted_count:
                summary[col] = res.deleted_count
                total += res.deleted_count
        except Exception as e:
            logger.warning(f"Purge {col} err: {e}")
    await log_activity(user["id"], user.get("name", ""), "purge_demo", "admin", f"total_deleted={total}")
    # Now seed
    seed_result = await seed_demo_data(request)
    return {"ok": True, "purge": {"total_deleted": total}, "seed": seed_result}
