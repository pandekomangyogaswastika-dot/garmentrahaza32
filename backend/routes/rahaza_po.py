"""
PT Rahaza — Sprint 2.1: Purchase Order (PO) Module

Endpoints (prefix /api/rahaza):
  - GET  /purchase-orders?status=&vendor=&date_from=&date_to=
  - GET  /purchase-orders/{po_id}
  - POST /purchase-orders            → create draft PO
  - PUT  /purchase-orders/{po_id}    → update draft PO
  - POST /purchase-orders/{po_id}/submit     → submit for approval
  - POST /purchase-orders/{po_id}/approve    → approve PO (single-step default)
  - POST /purchase-orders/{po_id}/reject     → reject PO
  - POST /purchase-orders/{po_id}/cancel     → cancel PO (before received)
  - DELETE /purchase-orders/{po_id}          → delete draft PO

Status flow:
  draft → pending_approval → approved → (partially_received | fully_received)
  draft → rejected (bisa re-submit)
  any → cancelled

Sprint 2.1 Goal:
  - Receiving (GR) wajib referensi ke PO valid untuk 3-way matching
  - Approval workflow configurable (default: single-step manager approval)
"""
from fastapi import APIRouter, Request, HTTPException
from database import get_db
from auth import require_auth, serialize_doc, log_activity
import uuid
import logging
from datetime import datetime, timezone, date
from typing import Optional

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rahaza", tags=["rahaza-po"])


def _uid(): return str(uuid.uuid4())
def _now(): return datetime.now(timezone.utc)


PO_STATUSES = ["draft", "pending_approval", "approved", "partially_received", "fully_received", "rejected", "cancelled"]


async def _require_admin(request: Request):
    """Require admin, warehouse, purchasing, manager, or owner role."""
    user = await require_auth(request)
    role = (user.get("role") or "").lower()
    if role in ("superadmin", "admin", "owner", "manager"):
        return user
    perms = user.get("_permissions") or []
    if "*" in perms or "purchasing.manage" in perms or "warehouse.manage" in perms:
        return user
    raise HTTPException(403, "Forbidden: butuh permission purchasing / warehouse / manager.")


async def _require_approver(request: Request):
    """Require manager, owner, or superadmin for approval."""
    user = await require_auth(request)
    role = (user.get("role") or "").lower()
    if role in ("superadmin", "owner", "manager", "production_manager", "warehouse_manager"):
        return user
    perms = user.get("_permissions") or []
    if "*" in perms or "purchasing.approve" in perms:
        return user
    raise HTTPException(403, "Forbidden: hanya Manager/Owner yang boleh approve PO.")


async def _gen_po_number(db) -> str:
    """Generate atomic PO number: PO-YYYYMMDD-001 (B7 Fix: atomic counter prevents race condition)"""
    from pymongo import ReturnDocument
    today = date.today().strftime("%Y%m%d")
    prefix = f"PO-{today}"
    counter = await db.counters.find_one_and_update(
        {"_id": f"po_number_{today}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return f"{prefix}-{counter['seq']:03d}"


async def _enrich_po(db, po):
    """Enrich PO dengan material names & vendor info."""
    if not po:
        return po
    
    # Material names
    m_ids = list({it["material_id"] for it in (po.get("items") or []) if it.get("material_id")})
    mats = await db.rahaza_materials.find({"id": {"$in": m_ids}}, {"_id": 0}).to_list(None) if m_ids else []
    m_map = {m["id"]: m for m in mats}
    
    for it in (po.get("items") or []):
        m = m_map.get(it.get("material_id")) or {}
        it["material_code"] = m.get("code")
        it["material_name"] = m.get("name")
        it["material_type"] = m.get("type")
        it["unit"] = m.get("unit")
    
    return po


def _norm_po_items(raw_items):
    """Normalize and validate PO items."""
    cleaned = []
    for it in raw_items or []:
        mid = it.get("material_id")
        qty = float(it.get("qty_ordered") or 0)
        unit_cost = float(it.get("unit_cost") or 0)
        if not mid or qty <= 0:
            continue
        cleaned.append({
            "id": it.get("id") or _uid(),
            "material_id": mid,
            "qty_ordered": round(qty, 4),
            "qty_received": round(float(it.get("qty_received") or 0), 4),
            "unit_cost": round(unit_cost, 2),
            "notes": it.get("notes") or "",
        })
    return cleaned


# ── PO CRUD ────────────────────────────────────────────────────────────────────

@router.get("/purchase-orders")
async def list_pos(
    request: Request,
    status: Optional[str] = None,
    vendor: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    await require_auth(request)
    db = get_db()
    q = {}
    if status:
        if status not in PO_STATUSES:
            raise HTTPException(400, f"Status harus salah satu: {PO_STATUSES}")
        q["status"] = status
    if vendor:
        q["vendor_name"] = {"$regex": vendor, "$options": "i"}
    if date_from:
        q["po_date"] = q.get("po_date", {})
        q["po_date"]["$gte"] = date_from
    if date_to:
        q["po_date"] = q.get("po_date", {})
        q["po_date"]["$lte"] = date_to
    
    rows = await db.rahaza_purchase_orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(None)
    for po in rows:
        await _enrich_po(db, po)
        po["item_count"] = len(po.get("items") or [])
        po["total_value"] = round(sum(float(i.get("qty_ordered") or 0) * float(i.get("unit_cost") or 0) for i in (po.get("items") or [])), 2)
        po["total_received"] = round(sum(float(i.get("qty_received") or 0) for i in (po.get("items") or [])), 4)
    return serialize_doc(rows)


@router.get("/purchase-orders/{po_id}")
async def get_po(po_id: str, request: Request):
    await require_auth(request)
    db = get_db()
    po = await db.rahaza_purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO tidak ditemukan.")
    await _enrich_po(db, po)
    return serialize_doc(po)


@router.post("/purchase-orders")
async def create_po(request: Request):
    """Create draft PO."""
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    
    vendor_name = (body.get("vendor_name") or "").strip()
    if not vendor_name:
        raise HTTPException(400, "vendor_name wajib diisi.")
    
    items = _norm_po_items(body.get("items"))
    if not items:
        raise HTTPException(400, "Minimal 1 item material.")
    
    # Validate semua material_id exist
    m_ids = [it["material_id"] for it in items]
    existing_mats = await db.rahaza_materials.find({"id": {"$in": m_ids}, "active": True}, {"_id": 0, "id": 1}).to_list(None)
    existing_ids = {m["id"] for m in existing_mats}
    missing = [mid for mid in m_ids if mid not in existing_ids]
    if missing:
        raise HTTPException(400, f"Material ID tidak ditemukan: {missing}")
    
    doc = {
        "id": _uid(),
        "po_number": await _gen_po_number(db),
        "vendor_name": vendor_name,
        "vendor_contact": body.get("vendor_contact") or "",
        "vendor_address": body.get("vendor_address") or "",
        "po_date": body.get("po_date") or date.today().isoformat(),
        "expected_delivery_date": body.get("expected_delivery_date") or None,
        "items": items,
        "status": "draft",
        "notes": body.get("notes") or "",
        "approval_flow_key": body.get("approval_flow_key") or "single_step",  # configurable
        "approvals": [],  # list of {user_id, user_name, approved_at, step}
        "created_by": user["id"],
        "created_by_name": user.get("name", ""),
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.rahaza_purchase_orders.insert_one(doc)
    await log_activity(user["id"], user.get("name", ""), "create", "rahaza.po", doc["po_number"])
    await _enrich_po(db, doc)
    return serialize_doc(doc)


@router.put("/purchase-orders/{po_id}")
async def update_po(po_id: str, request: Request):
    """Update draft PO."""
    user = await _require_admin(request)
    db = get_db()
    po = await db.rahaza_purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO tidak ditemukan.")
    if po.get("status") not in ("draft", "rejected"):
        raise HTTPException(400, f"Hanya PO Draft/Rejected yang bisa diedit. Status saat ini: {po.get('status')}")
    
    body = await request.json()
    upd = {"updated_at": _now()}
    
    if "vendor_name" in body:
        upd["vendor_name"] = body["vendor_name"].strip()
    if "vendor_contact" in body:
        upd["vendor_contact"] = body["vendor_contact"]
    if "vendor_address" in body:
        upd["vendor_address"] = body["vendor_address"]
    if "po_date" in body:
        upd["po_date"] = body["po_date"]
    if "expected_delivery_date" in body:
        upd["expected_delivery_date"] = body["expected_delivery_date"]
    if "notes" in body:
        upd["notes"] = body["notes"]
    if "items" in body:
        items = _norm_po_items(body["items"])
        if not items:
            raise HTTPException(400, "Minimal 1 item material.")
        upd["items"] = items
    
    await db.rahaza_purchase_orders.update_one({"id": po_id}, {"$set": upd})
    await log_activity(user["id"], user.get("name", ""), "update", "rahaza.po", po["po_number"])
    out = await db.rahaza_purchase_orders.find_one({"id": po_id}, {"_id": 0})
    await _enrich_po(db, out)
    return serialize_doc(out)


@router.delete("/purchase-orders/{po_id}")
async def delete_po(po_id: str, request: Request):
    """Delete draft PO."""
    user = await _require_admin(request)
    db = get_db()
    po = await db.rahaza_purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO tidak ditemukan.")
    if po.get("status") not in ("draft", "rejected"):
        raise HTTPException(400, "Hanya PO Draft/Rejected yang bisa dihapus.")
    
    await db.rahaza_purchase_orders.delete_one({"id": po_id})
    await log_activity(user["id"], user.get("name", ""), "delete", "rahaza.po", po["po_number"])
    return {"status": "deleted"}


# ── PO Approval Workflow ───────────────────────────────────────────────────────

@router.post("/purchase-orders/{po_id}/submit")
async def submit_po(po_id: str, request: Request):
    """Submit PO for approval (draft → pending_approval)."""
    user = await _require_admin(request)
    db = get_db()
    po = await db.rahaza_purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO tidak ditemukan.")
    if po.get("status") not in ("draft", "rejected"):
        raise HTTPException(400, f"Hanya PO Draft/Rejected yang bisa diajukan. Status: {po.get('status')}")
    
    await db.rahaza_purchase_orders.update_one(
        {"id": po_id},
        {
            "$set": {
                "status": "pending_approval",
                "submitted_at": _now(),
                "submitted_by": user["id"],
                "updated_at": _now(),
            }
        }
    )
    await log_activity(user["id"], user.get("name", ""), "submit", "rahaza.po", po["po_number"])
    out = await db.rahaza_purchase_orders.find_one({"id": po_id}, {"_id": 0})
    await _enrich_po(db, out)
    return serialize_doc(out)


@router.post("/purchase-orders/{po_id}/approve")
async def approve_po(po_id: str, request: Request):
    """Approve PO (pending_approval → approved).
    
    Untuk single-step workflow: langsung approved.
    Untuk multi-step: catat approval step (future enhancement).
    """
    user = await _require_approver(request)
    db = get_db()
    po = await db.rahaza_purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO tidak ditemukan.")
    if po.get("status") != "pending_approval":
        raise HTTPException(400, f"Hanya PO Pending Approval yang bisa di-approve. Status: {po.get('status')}")
    
    # Record approval
    approval_record = {
        "user_id": user["id"],
        "user_name": user.get("name", ""),
        "approved_at": _now(),
        "step": "final",  # untuk single-step; multi-step bisa tambah logic
    }
    
    await db.rahaza_purchase_orders.update_one(
        {"id": po_id},
        {
            "$set": {
                "status": "approved",
                "approved_at": _now(),
                "approved_by": user["id"],
                "updated_at": _now(),
            },
            "$push": {"approvals": approval_record},
        }
    )
    await log_activity(user["id"], user.get("name", ""), "approve", "rahaza.po", po["po_number"])
    out = await db.rahaza_purchase_orders.find_one({"id": po_id}, {"_id": 0})
    await _enrich_po(db, out)
    return serialize_doc(out)


@router.post("/purchase-orders/{po_id}/reject")
async def reject_po(po_id: str, request: Request):
    """Reject PO (pending_approval → rejected)."""
    user = await _require_approver(request)
    db = get_db()
    body = await request.json()
    reason = body.get("reason") or "Tidak ada alasan"
    
    po = await db.rahaza_purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO tidak ditemukan.")
    if po.get("status") != "pending_approval":
        raise HTTPException(400, f"Hanya PO Pending Approval yang bisa di-reject. Status: {po.get('status')}")
    
    await db.rahaza_purchase_orders.update_one(
        {"id": po_id},
        {
            "$set": {
                "status": "rejected",
                "rejected_at": _now(),
                "rejected_by": user["id"],
                "rejected_reason": reason,
                "updated_at": _now(),
            }
        }
    )
    await log_activity(user["id"], user.get("name", ""), f"reject:{reason}", "rahaza.po", po["po_number"])
    out = await db.rahaza_purchase_orders.find_one({"id": po_id}, {"_id": 0})
    await _enrich_po(db, out)
    return serialize_doc(out)


@router.post("/purchase-orders/{po_id}/cancel")
async def cancel_po(po_id: str, request: Request):
    """Cancel PO (any status except fully_received → cancelled)."""
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    reason = body.get("reason") or "Tidak ada alasan"
    
    po = await db.rahaza_purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO tidak ditemukan.")
    if po.get("status") == "fully_received":
        raise HTTPException(400, "PO yang sudah fully received tidak bisa di-cancel.")
    if po.get("status") == "cancelled":
        raise HTTPException(400, "PO sudah dibatalkan.")
    
    await db.rahaza_purchase_orders.update_one(
        {"id": po_id},
        {
            "$set": {
                "status": "cancelled",
                "cancelled_at": _now(),
                "cancelled_by": user["id"],
                "cancelled_reason": reason,
                "updated_at": _now(),
            }
        }
    )
    await log_activity(user["id"], user.get("name", ""), f"cancel:{reason}", "rahaza.po", po["po_number"])
    out = await db.rahaza_purchase_orders.find_one({"id": po_id}, {"_id": 0})
    await _enrich_po(db, out)
    return serialize_doc(out)


# ── Update PO received qty (called from warehouse GR) ────────────────────────

async def update_po_received_qty(db, po_id: str, items_received: list):
    """
    Called by warehouse.py saat GR received.
    items_received: [{"material_id": "...", "qty": ...}, ...]
    
    Update qty_received per item dan status PO.
    """
    po = await db.rahaza_purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        log.warning(f"PO {po_id} tidak ditemukan untuk update received qty")
        return
    
    # Build dict: material_id → total qty received dari GR
    received_map = {}
    for r in items_received:
        mid = r.get("material_id")
        qty = float(r.get("qty") or 0)
        if mid:
            received_map[mid] = received_map.get(mid, 0) + qty
    
    # Update PO items
    updated_items = []
    total_ordered = 0
    total_received = 0
    for it in (po.get("items") or []):
        mid = it["material_id"]
        qty_ordered = float(it.get("qty_ordered") or 0)
        current_received = float(it.get("qty_received") or 0)
        new_received = current_received + received_map.get(mid, 0)
        
        updated_items.append({
            **it,
            "qty_received": round(new_received, 4),
        })
        total_ordered += qty_ordered
        total_received += new_received
    
    # Determine new status
    new_status = po.get("status")
    if po.get("status") == "approved":
        if total_received >= total_ordered:
            new_status = "fully_received"
        elif total_received > 0:
            new_status = "partially_received"
    
    await db.rahaza_purchase_orders.update_one(
        {"id": po_id},
        {
            "$set": {
                "items": updated_items,
                "status": new_status,
                "updated_at": _now(),
            }
        }
    )
    log.info(f"PO {po.get('po_number')} updated: received {total_received}/{total_ordered}, status: {new_status}")


# ─── BULK CSV IMPORT ────────────────────────────────────────────────────────────

@router.post("/purchase-orders/bulk-import")
async def bulk_import_po_csv(request: Request):
    """
    Import multiple PO items from CSV.
    Body: {vendor_name, rows: [{material_code, qty_ordered, unit_cost, unit?}], ...}
    Returns: list of created POs grouped by vendor.
    """
    user = await require_auth(request)
    db = get_db()
    body = await request.json()
    rows = body.get("rows", [])
    if not rows:
        raise HTTPException(400, "CSV kosong atau tidak ada baris valid.")

    # Group rows by vendor_name (allow per-row vendor override, default to body-level)
    default_vendor = (body.get("vendor_name") or "").strip()
    groups: dict = {}
    errors = []
    for i, row in enumerate(rows):
        vendor = (row.get("vendor_name") or default_vendor).strip()
        if not vendor:
            errors.append(f"Row {i+1}: vendor_name wajib.")
            continue
        mat_code = (row.get("material_code") or "").strip().upper()
        if not mat_code:
            errors.append(f"Row {i+1}: material_code wajib.")
            continue
        try:
            qty = float(row.get("qty_ordered") or 0)
            price = float(row.get("unit_cost") or 0)
        except (ValueError, TypeError):
            errors.append(f"Row {i+1}: qty_ordered/unit_cost harus angka.")
            continue
        if qty <= 0:
            errors.append(f"Row {i+1}: qty_ordered harus > 0.")
            continue
        mat = await db.rahaza_materials.find_one({"code": mat_code, "active": True}, {"_id": 0})
        if not mat:
            errors.append(f"Row {i+1}: material '{mat_code}' tidak ditemukan.")
            continue
        groups.setdefault(vendor, []).append({
            "material_id": mat["id"],
            "material_code": mat["code"],
            "material_name": mat["name"],
            "qty_ordered": qty,
            "unit_cost": price,
            "unit": row.get("unit") or mat.get("unit") or "pcs",
            "qty_received": 0,
            "subtotal": round(qty * price, 2),
        })

    if errors and not groups:
        raise HTTPException(422, {"errors": errors})

    created = []
    for vendor, items in groups.items():
        doc = {
            "id": _uid(),
            "po_number": await _gen_po_number(db),
            "vendor_name": vendor,
            "vendor_contact": body.get("vendor_contact") or "",
            "vendor_address": body.get("vendor_address") or "",
            "po_date": body.get("po_date") or date.today().isoformat(),
            "expected_delivery_date": body.get("expected_delivery_date") or None,
            "items": items,
            "status": "draft",
            "notes": f"[Bulk Import] {body.get('notes') or ''}".strip(),
            "total_value": round(sum(it["subtotal"] for it in items), 2),
            "created_by": user["id"],
            "created_by_name": user.get("name", ""),
            "created_at": _now(),
            "updated_at": _now(),
        }
        await db.rahaza_purchase_orders.insert_one(doc)
        created.append(serialize_doc(doc))

    return {"ok": True, "created": len(created), "purchase_orders": created, "row_errors": errors}

