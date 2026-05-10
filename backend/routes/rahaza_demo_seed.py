"""
PT Rahaza — Demo Seed Endpoint
POST /api/rahaza/seed-demo — seed semua demo data (idempotent)
"""
from fastapi import APIRouter, Request, HTTPException
from database import get_db
from auth import require_auth
from datetime import datetime, timezone, date, timedelta
import uuid
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rahaza", tags=["rahaza-demo-seed"])


def _uid(): return str(uuid.uuid4())
def _now(): return datetime.now(timezone.utc)
def _today(): return date.today().isoformat()


DEMO_LINES = [
    {"code": "LINE-A", "name": "Line A", "location_code": "ZNA-RAJUT", "capacity_per_shift": 120},
    {"code": "LINE-B", "name": "Line B", "location_code": "ZNA-RAJUT", "capacity_per_shift": 100},
    {"code": "LINE-C", "name": "Line C", "location_code": "ZNA-LINKING", "capacity_per_shift": 80},
    {"code": "LINE-D", "name": "Line D", "location_code": "ZNA-LINKING", "capacity_per_shift": 90},
    {"code": "LINE-E", "name": "Line E", "location_code": "ZNA-RAJUT", "capacity_per_shift": 110},
]

DEMO_MACHINES = [
    {"code": "M-001", "name": "Mesin Rajut 1", "type": "rajut", "model": "Stoll CMS 303", "gauge": "E7"},
    {"code": "M-002", "name": "Mesin Rajut 2", "type": "rajut", "model": "Stoll CMS 303", "gauge": "E7"},
    {"code": "M-003", "name": "Mesin Rajut 3", "type": "rajut", "model": "Shima Seiki SES", "gauge": "E7"},
    {"code": "M-004", "name": "Mesin Rajut 4", "type": "rajut", "model": "Stoll CMS 303", "gauge": "E10"},
    {"code": "M-005", "name": "Mesin Rajut 5", "type": "rajut", "model": "Stoll ADF", "gauge": "E14"},
    {"code": "M-006", "name": "Mesin Linking 1", "type": "linking", "model": "Rimoldi 264", "gauge": "-"},
    {"code": "M-007", "name": "Mesin Linking 2", "type": "linking", "model": "Rimoldi 264", "gauge": "-"},
    {"code": "M-008", "name": "Mesin Steam 1", "type": "steam", "model": "Veit 8321", "gauge": "-"},
    {"code": "M-009", "name": "Mesin Steam 2", "type": "steam", "model": "Veit 8321", "gauge": "-"},
    {"code": "M-010", "name": "Mesin Obras 1", "type": "sewing", "model": "Pegasus W600", "gauge": "-"},
]

DEMO_EMPLOYEES = [
    {"nik": "EMP001", "name": "Budi Santoso", "position": "Operator Rajut", "department": "Produksi", "shift_code": "S1"},
    {"nik": "EMP002", "name": "Siti Rahayu", "position": "Operator Linking", "department": "Produksi", "shift_code": "S1"},
    {"nik": "EMP003", "name": "Ahmad Fauzi", "position": "Operator QC", "department": "Produksi", "shift_code": "S2"},
    {"nik": "EMP004", "name": "Dewi Lestari", "position": "Supervisor Produksi", "department": "Produksi", "shift_code": "S1"},
    {"nik": "EMP005", "name": "Eko Prasetyo", "position": "Operator Rajut", "department": "Produksi", "shift_code": "S2"},
    {"nik": "EMP006", "name": "Fitri Handayani", "position": "Operator Packing", "department": "Produksi", "shift_code": "S1"},
    {"nik": "EMP007", "name": "Gunawan Wijaya", "position": "Operator Steam", "department": "Produksi", "shift_code": "S1"},
    {"nik": "EMP008", "name": "Heni Purwanti", "position": "Operator Sewing", "department": "Produksi", "shift_code": "S2"},
    {"nik": "EMP009", "name": "Irwan Nugraha", "position": "Teknisi Mesin", "department": "Produksi", "shift_code": "S1"},
    {"nik": "EMP010", "name": "Joko Susanto", "position": "Kepala Gudang", "department": "Gudang", "shift_code": "S1"},
    {"nik": "EMP011", "name": "Kartika Sari", "position": "Staff HR", "department": "SDM", "shift_code": "S1"},
    {"nik": "EMP012", "name": "Lina Marlina", "position": "Staff Keuangan", "department": "Keuangan", "shift_code": "S1"},
    {"nik": "EMP013", "name": "Mulyadi", "position": "Operator Rajut", "department": "Produksi", "shift_code": "S2"},
    {"nik": "EMP014", "name": "Nina Sari", "position": "Operator Linking", "department": "Produksi", "shift_code": "S2"},
    {"nik": "EMP015", "name": "Ogi Pranoto", "position": "PPIC", "department": "Produksi", "shift_code": "S1"},
]

DEMO_MATERIALS = [
    {"code": "YRN-W-001", "name": "Benang Wol Putih 2/32", "type": "yarn", "unit": "kg", "yarn_type": "wol", "color": "Putih", "stock_qty": 500.0, "min_stock_qty": 50},
    {"code": "YRN-W-002", "name": "Benang Wol Merah 2/32", "type": "yarn", "unit": "kg", "yarn_type": "wol", "color": "Merah", "stock_qty": 300.0, "min_stock_qty": 30},
    {"code": "YRN-W-003", "name": "Benang Wol Hitam 2/32", "type": "yarn", "unit": "kg", "yarn_type": "wol", "color": "Hitam", "stock_qty": 250.0, "min_stock_qty": 30},
    {"code": "YRN-A-001", "name": "Benang Akrilik Biru 2/28", "type": "yarn", "unit": "kg", "yarn_type": "akrilik", "color": "Biru", "stock_qty": 400.0, "min_stock_qty": 40},
    {"code": "YRN-A-002", "name": "Benang Akrilik Hijau 2/28", "type": "yarn", "unit": "kg", "yarn_type": "akrilik", "color": "Hijau", "stock_qty": 180.0, "min_stock_qty": 50},
    {"code": "ACC-BTN-001", "name": "Kancing Bulat 4-Lubang Putih", "type": "accessory", "unit": "pcs", "color": "Putih", "stock_qty": 5000, "min_stock_qty": 500},
    {"code": "ACC-BTN-002", "name": "Kancing Cokelat Kayu", "type": "accessory", "unit": "pcs", "color": "Cokelat", "stock_qty": 3000, "min_stock_qty": 300},
    {"code": "ACC-LBL-001", "name": "Label Merek Woven", "type": "accessory", "unit": "pcs", "color": "-", "stock_qty": 2000, "min_stock_qty": 200},
    {"code": "ACC-ZPR-001", "name": "Ritsleting YKK 30cm", "type": "accessory", "unit": "pcs", "color": "Hitam", "stock_qty": 150, "min_stock_qty": 100},
    {"code": "PKG-PLY-001", "name": "Plastik OPP 30x40", "type": "packaging", "unit": "pcs", "color": "-", "stock_qty": 10000, "min_stock_qty": 1000},
]

DEMO_MODELS = [
    {"code": "MDL-001", "name": "Sweater Klasik V-Neck", "category": "Sweater", "yarn_kg_per_pcs": 0.45, "bundle_size": 30},
    {"code": "MDL-002", "name": "Cardigan Panjang Wanita", "category": "Cardigan", "yarn_kg_per_pcs": 0.70, "bundle_size": 20},
    {"code": "MDL-003", "name": "Sweater Anak Motif", "category": "Sweater", "yarn_kg_per_pcs": 0.30, "bundle_size": 40},
    {"code": "MDL-004", "name": "Beanie Hat Premium", "category": "Aksesoris", "yarn_kg_per_pcs": 0.10, "bundle_size": 50},
    {"code": "MDL-005", "name": "Scarf Rajut Panjang", "category": "Aksesoris", "yarn_kg_per_pcs": 0.25, "bundle_size": 30},
]

DEMO_SIZES = ["S", "M", "L", "XL", "XXL"]

DEMO_CUSTOMERS = [
    {"code": "CUST-001", "name": "Buyer Jepang - Yamamoto Co.", "country": "Jepang", "contact_person": "Tanaka San"},
    {"code": "CUST-002", "name": "Buyer Korea - K-Fashion Ltd", "country": "Korea", "contact_person": "Kim Mina"},
    {"code": "CUST-003", "name": "Distributor Lokal - Matahari", "country": "Indonesia", "contact_person": "Budi Harto"},
]


@router.post("/seed-demo")
async def seed_demo_data(request: Request):
    """
    Seed semua demo data PT Rahaza (idempotent).
    Hanya bisa dijalankan oleh superadmin / admin.
    """
    user = await require_auth(request)
    if user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(403, "Hanya superadmin/admin yang bisa seed demo data")

    db = get_db()
    results = {}

    # ─── LINES ──────────────────────────────────────────────────────────────
    line_seeded = 0
    line_map = {}  # code → id
    existing_lines = await db.rahaza_lines.find({}, {"_id": 0}).to_list(None)
    for l in existing_lines:
        line_map[l["code"]] = l["id"]

    for line in DEMO_LINES:
        if line["code"] in line_map:
            continue
        loc = await db.rahaza_locations.find_one({"code": line["location_code"]})
        loc_id = loc["id"] if loc else None
        doc = {
            "id": _uid(), "code": line["code"], "name": line["name"],
            "location_id": loc_id, "capacity_per_shift": line["capacity_per_shift"],
            "active": True, "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_lines.insert_one(doc)
        line_map[line["code"]] = doc["id"]
        line_seeded += 1
    results["lines"] = line_seeded

    # ─── MACHINES ───────────────────────────────────────────────────────────
    mach_seeded = 0
    for m in DEMO_MACHINES:
        if await db.rahaza_machines.find_one({"code": m["code"]}):
            continue
        doc = {
            "id": _uid(), "code": m["code"], "name": m["name"],
            "type": m["type"], "model": m["model"], "gauge": m["gauge"],
            "active": True, "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_machines.insert_one(doc)
        mach_seeded += 1
    results["machines"] = mach_seeded

    # ─── SHIFTS (should already exist from startup seed) ────────────────────
    shift_map = {}
    shifts = await db.rahaza_shifts.find({}, {"_id": 0}).to_list(None)
    for s in shifts:
        shift_map[s.get("code")] = s["id"]
    results["shifts_found"] = len(shifts)

    # ─── EMPLOYEES ──────────────────────────────────────────────────────────
    emp_seeded = 0
    emp_map = {}  # nik → id
    for emp in DEMO_EMPLOYEES:
        existing = await db.rahaza_employees.find_one({"nik": emp["nik"]})
        if existing:
            emp_map[emp["nik"]] = existing["id"]
            continue
        shift_id = shift_map.get(emp["shift_code"])
        doc = {
            "id": _uid(), "nik": emp["nik"], "name": emp["name"],
            "employee_code": emp["nik"],
            "position": emp["position"], "department": emp["department"],
            "shift_id": shift_id, "shift_code": emp["shift_code"],
            "join_date": "2023-01-01", "active": True,
            "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_employees.insert_one(doc)
        emp_map[emp["nik"]] = doc["id"]
        emp_seeded += 1
    results["employees"] = emp_seeded

    # ─── MATERIALS ──────────────────────────────────────────────────────────
    mat_seeded = 0
    mat_map = {}  # code → id
    for mat in DEMO_MATERIALS:
        existing = await db.rahaza_materials.find_one({"code": mat["code"]})
        if existing:
            mat_map[mat["code"]] = existing["id"]
            continue
        doc = {
            "id": _uid(), "code": mat["code"], "name": mat["name"],
            "type": mat["type"], "unit": mat["unit"],
            "yarn_type": mat.get("yarn_type"), "color": mat.get("color"),
            "stock_qty": mat.get("stock_qty", 0),
            "min_stock_qty": mat.get("min_stock_qty"),
            "active": True, "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_materials.insert_one(doc)
        mat_map[mat["code"]] = doc["id"]
        # B5 Fix: Seed stock record with "qty" (canonical field) + get default warehouse location
        default_wh_loc = await db.warehouse_locations.find_one({"active": True}, {"_id": 0})
        default_loc_id = default_wh_loc["id"] if default_wh_loc else None
        await db.rahaza_material_stock.update_one(
            {"material_id": doc["id"]},
            {"$set": {
                "material_id": doc["id"],
                "qty": float(mat.get("stock_qty", 0)),  # Fixed: use "qty" not "quantity"
                "location_id": default_loc_id,
                "updated_at": _now(),
            }},
            upsert=True
        )
        mat_seeded += 1
    results["materials"] = mat_seeded

    # ─── MODELS ─────────────────────────────────────────────────────────────
    mdl_seeded = 0
    mdl_map = {}  # code → id
    for mdl in DEMO_MODELS:
        existing = await db.rahaza_models.find_one({"code": mdl["code"]})
        if existing:
            mdl_map[mdl["code"]] = existing["id"]
            continue
        doc = {
            "id": _uid(), "code": mdl["code"], "name": mdl["name"],
            "category": mdl["category"], "yarn_kg_per_pcs": mdl["yarn_kg_per_pcs"],
            "bundle_size": mdl["bundle_size"], "active": True,
            "images": [],
            "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_models.insert_one(doc)
        mdl_map[mdl["code"]] = doc["id"]
        mdl_seeded += 1
    results["models"] = mdl_seeded

    # ─── CUSTOMERS ──────────────────────────────────────────────────────────
    cust_seeded = 0
    cust_map = {}
    for c in DEMO_CUSTOMERS:
        existing = await db.rahaza_customers.find_one({"code": c["code"]})
        if existing:
            cust_map[c["code"]] = existing["id"]
            continue
        doc = {
            "id": _uid(), "code": c["code"], "name": c["name"],
            "country": c.get("country"), "contact_person": c.get("contact_person"),
            "active": True, "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_customers.insert_one(doc)
        cust_map[c["code"]] = doc["id"]
        cust_seeded += 1
    results["customers"] = cust_seeded

    # ─── ORDERS ─────────────────────────────────────────────────────────────
    order_seeded = 0
    order_map = {}  # order_number → id
    demo_orders = [
        {"order_number": "ORD-2026-001", "customer_code": "CUST-001", "model_code": "MDL-001",
         "qty": 500, "size": "M", "delivery_date": "2026-06-30", "status": "in_production"},
        {"order_number": "ORD-2026-002", "customer_code": "CUST-002", "model_code": "MDL-002",
         "qty": 200, "size": "L", "delivery_date": "2026-07-15", "status": "in_production"},
        {"order_number": "ORD-2026-003", "customer_code": "CUST-003", "model_code": "MDL-003",
         "qty": 1000, "size": "S", "delivery_date": "2026-08-01", "status": "draft"},
    ]
    for o in demo_orders:
        existing = await db.rahaza_orders.find_one({"order_number": o["order_number"]})
        if existing:
            order_map[o["order_number"]] = existing["id"]
            continue
        cust_id = cust_map.get(o["customer_code"])
        mdl_id = mdl_map.get(o["model_code"])
        doc = {
            "id": _uid(), "order_number": o["order_number"],
            "customer_id": cust_id, "customer_code": o["customer_code"],
            "model_id": mdl_id, "model_code": o["model_code"],
            "qty": o["qty"], "size": o["size"],
            "delivery_date": o["delivery_date"], "status": o["status"],
            "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_orders.insert_one(doc)
        order_map[o["order_number"]] = doc["id"]
        order_seeded += 1
    results["orders"] = order_seeded

    # ─── WORK ORDERS ────────────────────────────────────────────────────────
    wo_seeded = 0
    demo_wos = [
        {"wo_number": "WO-2026-0001", "order_number": "ORD-2026-001", "model_code": "MDL-001",
         "qty": 200, "status": "in_production", "line_code": "LINE-A",
         "start_date": "2026-04-20", "due_date": "2026-05-10"},
        {"wo_number": "WO-2026-0002", "order_number": "ORD-2026-001", "model_code": "MDL-001",
         "qty": 200, "status": "released", "line_code": "LINE-B",
         "start_date": "2026-04-22", "due_date": "2026-05-15"},
        {"wo_number": "WO-2026-0003", "order_number": "ORD-2026-002", "model_code": "MDL-002",
         "qty": 100, "status": "in_production", "line_code": "LINE-C",
         "start_date": "2026-04-25", "due_date": "2026-05-20"},
        {"wo_number": "WO-2026-0004", "order_number": "ORD-2026-002", "model_code": "MDL-002",
         "qty": 100, "status": "released", "line_code": "LINE-D",
         "start_date": "2026-04-28", "due_date": "2026-05-25"},
        {"wo_number": "WO-2026-0005", "order_number": "ORD-2026-003", "model_code": "MDL-003",
         "qty": 500, "status": "draft", "line_code": "LINE-E",
         "start_date": "2026-05-01", "due_date": "2026-06-01"},
    ]
    for wo in demo_wos:
        existing = await db.rahaza_work_orders.find_one({"wo_number": wo["wo_number"]})
        if existing:
            continue
        order_id = order_map.get(wo["order_number"])
        mdl_id = mdl_map.get(wo["model_code"])
        line_id = line_map.get(wo["line_code"])
        doc = {
            "id": _uid(), "wo_number": wo["wo_number"],
            "order_id": order_id, "order_number": wo["order_number"],
            "model_id": mdl_id, "model_code": wo["model_code"],
            "line_id": line_id, "line_code": wo["line_code"],
            "qty": wo["qty"], "qty_produced": 0, "qty_passed_qc": 0,
            "status": wo["status"],
            "start_date": wo["start_date"], "due_date": wo["due_date"],
            "bom_snapshot": {
                "yarn_materials": [
                    {"material_id": list(mat_map.values())[0] if mat_map else None,
                     "material_code": "YRN-W-001", "material_name": "Benang Wol Putih 2/32",
                     "qty_per_pcs": 0.45, "unit": "kg"}
                ],
                "accessory_materials": [],
                "total_yarn_kg_per_pcs": 0.45
            },
            "created_at": _now(), "updated_at": _now(),
        }
        await db.rahaza_work_orders.insert_one(doc)
        wo_seeded += 1
    results["work_orders"] = wo_seeded

    # ─── SOP DATA ───────────────────────────────────────────────────────────
    sop_seeded = 0
    processes = await db.rahaza_processes.find({"active": True}, {"_id": 0}).sort("order_seq", 1).to_list(None)
    model_id_demo = mdl_map.get("MDL-001")
    if model_id_demo:
        for proc in processes[:4]:  # Seed SOP untuk 4 proses pertama
            existing = await db.rahaza_sop.find_one({"model_id": model_id_demo, "process_id": proc["id"]})
            if existing:
                continue
            doc = {
                "id": _uid(), "model_id": model_id_demo, "model_code": "MDL-001",
                "model_name": "Sweater Klasik V-Neck",
                "process_id": proc["id"], "process_code": proc["code"], "process_name": proc["name"],
                "steps": [
                    f"Persiapkan alat dan bahan untuk proses {proc['name']}.",
                    f"Lakukan pengecekan kualitas sesuai standar {proc['name']}.",
                    "Catat hasil di form tracking produksi.",
                ],
                "sam_minutes": round(2.5 + proc.get("order_seq", 1) * 0.3, 1),
                "target_pcs_per_operator": max(5, 30 - proc.get("order_seq", 1) * 3),
                "attachments": [],
                "active": True,
                "created_at": _now(), "updated_at": _now(),
            }
            await db.rahaza_sop.insert_one(doc)
            sop_seeded += 1
    results["sop"] = sop_seeded

    # ─── ATTENDANCE (sample 7 hari terakhir) ────────────────────────────────
    att_seeded = 0
    emp_ids = list(emp_map.values())[:5]  # seed untuk 5 karyawan pertama
    for i in range(7):
        att_date = (date.today() - timedelta(days=i)).isoformat()
        if date.fromisoformat(att_date).weekday() >= 6:  # skip sunday
            continue
        for eid in emp_ids:
            existing = await db.rahaza_attendance_events.find_one({"employee_id": eid, "date": att_date})
            if existing:
                continue
            doc = {
                "id": _uid(), "employee_id": eid, "date": att_date,
                "check_in": f"{att_date}T07:05:00+07:00",
                "check_out": f"{att_date}T15:10:00+07:00",
                "status": "present", "shift_id": list(shift_map.values())[0] if shift_map else None,
                "created_at": _now(),
            }
            await db.rahaza_attendance_events.insert_one(doc)
            att_seeded += 1
    results["attendance"] = att_seeded

    logger.info(f"Demo seed completed: {results}")
    
    # B5 Fix: Migrate existing rahaza_material_stock NULL rows
    await _migrate_material_stock_nulls(db)
    
    return {"ok": True, "message": "Demo data seeded successfully", "results": results}


async def _migrate_material_stock_nulls(db):
    """
    B5 Fix: Migrate existing rahaza_material_stock rows that have:
    - location_id = None
    - qty = None (or stored as "quantity" field instead of "qty")
    """
    default_wh_loc = await db.warehouse_locations.find_one({"active": True}, {"_id": 0})
    default_loc_id = default_wh_loc["id"] if default_wh_loc else None
    
    migrated = 0
    bad_rows = await db.rahaza_material_stock.find(
        {"$or": [{"location_id": None}, {"qty": None}]},
        {"_id": 0}
    ).to_list(None)
    
    for row in bad_rows:
        mat_id = row["material_id"]
        row_loc_id = row.get("location_id")
        # Fix qty value
        row_qty = float(row.get("qty") or row.get("quantity") or 0)

        # Fix location_id if null
        if not row_loc_id and default_loc_id:
            # Check if target (mat_id, default_loc_id) already exists
            existing_target = await db.rahaza_material_stock.find_one(
                {"material_id": mat_id, "location_id": default_loc_id}
            )
            if existing_target:
                # Merge: add qty into existing target row, delete the null-location row
                await db.rahaza_material_stock.update_one(
                    {"material_id": mat_id, "location_id": default_loc_id},
                    {"$inc": {"qty": row_qty}, "$set": {"updated_at": _now()}, "$unset": {"quantity": ""}}
                )
                await db.rahaza_material_stock.delete_one(
                    {"material_id": mat_id, "location_id": None}
                )
            else:
                # Update: change location_id from None to default
                await db.rahaza_material_stock.update_one(
                    {"material_id": mat_id, "location_id": None},
                    {"$set": {"location_id": default_loc_id, "qty": row_qty, "updated_at": _now()},
                     "$unset": {"quantity": ""}}
                )
        else:
            # Just fix qty if null, no location change needed
            if row.get("qty") is None:
                await db.rahaza_material_stock.update_one(
                    {"material_id": mat_id, "location_id": row_loc_id},
                    {"$set": {"qty": row_qty, "updated_at": _now()}, "$unset": {"quantity": ""}}
                )
        migrated += 1
    
    if migrated:
        logger.info(f"B5 migration: fixed {migrated} NULL rows in rahaza_material_stock")
    return migrated


@router.post("/admin/migrate-stock-nulls")
async def migrate_stock_nulls(request: Request):
    """Fix existing rahaza_material_stock NULL rows (B5 migration endpoint)."""
    user = await require_auth(request)
    if user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(403, "Admin only")
    db = get_db()
    migrated = await _migrate_material_stock_nulls(db)
    return {"ok": True, "migrated": migrated}
