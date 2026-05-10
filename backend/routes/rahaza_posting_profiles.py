"""
PT Rahaza — Phase F2 Accounting Core
Posting Profiles — mapping event_type → CoA account codes.

Collection: rahaza_posting_profiles
  id, event_type (unique), active (bool),
  mapping { <role>: <account_code> },  e.g. {'debit_ar': '1-1301', 'credit_revenue': '4-1100'}
  description, updated_at, updated_by

Seed defaults (garment manufacturing, PSAK):
  ar_invoice        : Dr AR (1-1301), Cr Revenue (4-1100), Cr Tax Output (2-1400)
  ar_payment        : Dr Cash (fallback 1-1101), Cr AR (1-1301)
  ap_invoice        : Dr Expense (fallback 6-2200) or Inventory RM (1-1401), Cr AP (2-1100), Dr Tax Input (1-1501)
  ap_payment        : Dr AP (2-1100), Cr Cash (fallback 1-1101)
  expense           : Dr Expense (fallback 6-2200), Cr Cash (fallback 1-1101)
  payroll_finalize  : Dr Salary Expense (6-2100), Cr Hutang Gaji (2-1200)
  inventory_receive : Dr Inventory RM (1-1401), Cr AP (2-1100) [clearing]
  inventory_issue   : Dr WIP (1-1403), Cr Inventory RM (1-1401)
  inventory_adjust  : Dr/Cr Inventory (1-1401) vs Expense (6-2400)
  cogs_shipment     : Dr COGS Material (5-1000), Dr COGS Labor (5-2000), Dr COGS Overhead (5-3000), Cr FG Inventory (1-1404)
"""
from fastapi import APIRouter, Request, HTTPException
from database import get_db
from auth import require_auth, serialize_doc, log_activity
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/api/rahaza/posting-profiles", tags=["rahaza-posting-profiles"])


def _uid(): return str(uuid.uuid4())
def _now(): return datetime.now(timezone.utc)


async def _require_fin(request: Request):
    user = await require_auth(request)
    role = (user.get("role") or "").lower()
    if role in ("superadmin", "admin", "owner", "accounting", "finance", "manager"):
        return user
    perms = user.get("_permissions") or []
    if "*" in perms or "finance.manage" in perms:
        return user
    raise HTTPException(403, "Forbidden: butuh permission finance.")


# ───────────────────────── SEED TEMPLATE ──────────────────────────────────────
# Each event_type maps role -> CoA code.
# `role` is a free-form key used by posting helpers when building JE lines.
DEFAULT_PROFILES = [
    {
        "event_type": "ar_invoice",
        "description": "AR Invoice sent → Dr AR / Cr Revenue (+Tax Output)",
        "mapping": {
            "debit_ar": "1-1301",
            "credit_revenue": "4-1100",
            "credit_tax_output": "2-1400",
        },
    },
    {
        "event_type": "ar_payment",
        "description": "Pembayaran AR → Dr Cash / Cr AR",
        "mapping": {
            "debit_cash_default": "1-1101",
            "credit_ar": "1-1301",
        },
    },
    {
        "event_type": "ap_invoice",
        "description": "AP Invoice sent → Dr Expense/Inventory / Cr AP (+Tax Input)",
        "mapping": {
            "debit_expense_default": "6-2200",
            "debit_inventory_rm": "1-1401",
            "debit_tax_input": "1-1501",
            "credit_ap": "2-1100",
        },
    },
    {
        "event_type": "ap_payment",
        "description": "Pembayaran AP → Dr AP / Cr Cash",
        "mapping": {
            "debit_ap": "2-1100",
            "credit_cash_default": "1-1101",
        },
    },
    {
        "event_type": "expense",
        "description": "Expense operasional → Dr Expense / Cr Cash",
        "mapping": {
            "debit_expense_default": "6-2200",
            "credit_cash_default": "1-1101",
        },
    },
    {
        "event_type": "payroll_finalize",
        "description": "Payroll finalize → Dr Gaji Expense / Cr Hutang Gaji",
        "mapping": {
            "debit_salary_expense": "6-2100",
            "credit_salary_payable": "2-1200",
            "credit_tax_pph21": "2-1301",
            "credit_bpjs_payable": "2-1500",
        },
    },
    {
        "event_type": "inventory_receive",
        "description": "Material receive → Dr Inventory RM / Cr AP (clearing)",
        "mapping": {
            "debit_inventory_rm": "1-1401",
            "credit_ap_clearing": "2-1100",
        },
    },
    {
        "event_type": "inventory_issue",
        "description": "Material issue ke WO → Dr WIP / Cr Inventory RM",
        "mapping": {
            "debit_wip": "1-1403",
            "credit_inventory_rm": "1-1401",
        },
    },
    {
        "event_type": "inventory_adjust",
        "description": "Material adjust → Dr/Cr Inventory vs Adjustment Expense",
        "mapping": {
            "inventory_rm": "1-1401",
            "adjustment_expense": "6-2400",
        },
    },
    {
        "event_type": "cogs_shipment",
        "description": "Shipment dispatched → Dr COGS / Cr FG Inventory (berdasarkan HPP snapshot)",
        "mapping": {
            "debit_cogs_material": "5-1000",
            "debit_cogs_labor": "5-2000",
            "debit_cogs_overhead": "5-3000",
            "credit_fg_inventory": "1-1404",
        },
    },
]


# ───────────────────────── ENDPOINTS ──────────────────────────────────────────
@router.get("")
async def list_profiles(request: Request):
    await require_auth(request)
    db = get_db()
    rows = await db.rahaza_posting_profiles.find({}, {"_id": 0}).sort("event_type", 1).to_list(None)
    return serialize_doc(rows)


@router.get("/{event_type}")
async def get_profile(event_type: str, request: Request):
    await require_auth(request)
    db = get_db()
    doc = await db.rahaza_posting_profiles.find_one({"event_type": event_type}, {"_id": 0})
    if not doc:
        raise HTTPException(404, f"Posting profile '{event_type}' tidak ditemukan.")
    return serialize_doc(doc)


@router.put("/{event_type}")
async def update_profile(event_type: str, request: Request):
    user = await _require_fin(request)
    db = get_db()
    body = await request.json()
    doc = await db.rahaza_posting_profiles.find_one({"event_type": event_type})
    if not doc:
        raise HTTPException(404, f"Posting profile '{event_type}' tidak ditemukan. Jalankan seed dulu.")
    upd = {"updated_at": _now(), "updated_by": user["id"], "updated_by_name": user.get("name", "")}
    if "mapping" in body and isinstance(body["mapping"], dict):
        # validate each account_code exists + leaf + active (warning but not blocker if missing)
        mapping = body["mapping"]
        clean = {}
        for role, code in mapping.items():
            if not code:
                continue
            code = str(code).strip()
            acc = await db.rahaza_coa_accounts.find_one({"code": code})
            if not acc:
                raise HTTPException(400, f"Role '{role}': akun '{code}' tidak ditemukan di CoA.")
            if acc.get("is_group"):
                raise HTTPException(400, f"Role '{role}': akun '{code}' adalah header (non-postable). Pilih akun leaf.")
            if not acc.get("active"):
                raise HTTPException(400, f"Role '{role}': akun '{code}' tidak aktif.")
            clean[role] = code
        upd["mapping"] = clean
    if "description" in body:
        upd["description"] = (body.get("description") or "").strip()
    if "active" in body:
        upd["active"] = bool(body["active"])
    await db.rahaza_posting_profiles.update_one({"event_type": event_type}, {"$set": upd})
    out = await db.rahaza_posting_profiles.find_one({"event_type": event_type}, {"_id": 0})
    await log_activity(user["id"], user.get("name", ""), "update_posting_profile", "posting_profile", event_type)
    return serialize_doc(out)


@router.post("/seed")
async def seed_defaults(request: Request):
    """Seed default posting profiles idempotent (skip if exists)."""
    user = await _require_fin(request)
    db = get_db()
    inserted = 0
    skipped = 0
    for p in DEFAULT_PROFILES:
        exists = await db.rahaza_posting_profiles.find_one({"event_type": p["event_type"]})
        if exists:
            skipped += 1
            continue
        doc = {
            "id": _uid(),
            "event_type": p["event_type"],
            "description": p["description"],
            "mapping": p["mapping"],
            "active": True,
            "created_at": _now(),
            "updated_at": _now(),
            "created_by": user["id"],
            "created_by_name": user.get("name", ""),
        }
        await db.rahaza_posting_profiles.insert_one(doc)
        inserted += 1
    await log_activity(user["id"], user.get("name", ""), "seed_posting_profiles", "posting_profile", f"inserted={inserted} skipped={skipped}")
    return {"ok": True, "inserted": inserted, "skipped": skipped, "total_template": len(DEFAULT_PROFILES)}


async def ensure_seed(db):
    """Internal helper: auto-seed if collection is empty. Called by posting helpers."""
    cnt = await db.rahaza_posting_profiles.count_documents({})
    if cnt > 0:
        return
    for p in DEFAULT_PROFILES:
        doc = {
            "id": _uid(),
            "event_type": p["event_type"],
            "description": p["description"],
            "mapping": p["mapping"],
            "active": True,
            "created_at": _now(),
            "updated_at": _now(),
            "created_by": "system",
            "created_by_name": "system",
        }
        await db.rahaza_posting_profiles.insert_one(doc)


async def get_mapping(db, event_type: str) -> dict:
    """Internal helper: returns mapping dict for given event_type, ensuring seed exists."""
    await ensure_seed(db)
    doc = await db.rahaza_posting_profiles.find_one({"event_type": event_type, "active": True}, {"_id": 0})
    if not doc:
        return {}
    return doc.get("mapping") or {}
