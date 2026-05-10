"""
Warehouse Management Module — PT Rahaza ERP

Operations:
  - Location/Bin Management
  - Goods Receiving (GR) with sync bridge to rahaza_material_stock
  - Put-Away
  - Stock Summary + Movements
  - Stock Opname

Sprint 1 changes:
  - create_receiving: accept material_id per item
  - update_receiving: when status='received', sync to rahaza_material_stock
    and record in rahaza_material_movements (single source of truth for
    downstream Material Issue / BOM flow)
  - receipt_number: atomic counter to prevent race condition (W-4)
"""
from fastapi import APIRouter, Request, HTTPException
from database import get_db
from auth import require_auth, serialize_doc, log_activity
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/warehouse", tags=["warehouse"])


def new_id(): return str(uuid.uuid4())
def now(): return datetime.now(timezone.utc)


# ── Sprint 1.1: Sync bridge helper ────────────────────────────────────────────
async def _sync_to_material_stock(db, material_id: str, location_id: str, qty: float):
    """
    Upsert qty into rahaza_material_stock so that the Inventory portal
    (Material Issue, BOM stock check, low-stock alert) sees the correct total.
    This is the sync bridge that resolves the dual-ledger issue (I-1 / W-1).
    """
    existing = await db.rahaza_material_stock.find_one(
        {"material_id": material_id, "location_id": location_id}
    )
    if existing:
        await db.rahaza_material_stock.update_one(
            {"material_id": material_id, "location_id": location_id},
            {"$inc": {"qty": float(qty)}, "$set": {"updated_at": now()}},
        )
    else:
        await db.rahaza_material_stock.insert_one({
            "id": new_id(),
            "material_id": material_id,
            "location_id": location_id,
            "qty": float(qty),
            "updated_at": now(),
        })


async def _record_material_movement(db, material_id: str, location_id: str, location_name: str,
                                     qty: float, unit: str, reference_type: str,
                                     reference_id: str, reference_number: str,
                                     notes: str, user: dict):
    """Record a rahaza_material_movement for audit trail + stock module."""
    await db.rahaza_material_movements.insert_one({
        "id": new_id(),
        "material_id": material_id,
        "location_id": location_id,
        "location_name": location_name,
        "type": "receive",
        "qty": float(qty),
        "unit": unit,
        "reference_type": reference_type,
        "reference_id": reference_id,
        "reference_number": reference_number,
        "notes": notes,
        "created_by": user["id"],
        "created_by_name": user.get("name", "-"),
        "created_at": now(),
    })


# ── Locations / Bin ───────────────────────────────────────────────────────────

@router.get("/locations")
async def get_locations(request: Request):
    await require_auth(request)
    db = get_db()
    locations = await db.warehouse_locations.find({}, {"_id": 0}).sort("code", 1).to_list(None)
    return serialize_doc(locations)


@router.post("/locations")
async def create_location(request: Request):
    user = await require_auth(request)
    db = get_db()
    body = await request.json()
    
    code = body.get("code", "").strip().upper()
    if not code:
        raise HTTPException(400, "Location code required")
    
    existing = await db.warehouse_locations.find_one({"code": code})
    if existing:
        raise HTTPException(400, f"Location {code} already exists")
    
    location = {
        "id": new_id(),
        "code": code,
        "name": body.get("name", code),
        "type": body.get("type", "storage"),  # storage, staging, shipping, receiving
        "zone": body.get("zone", ""),
        "aisle": body.get("aisle", ""),
        "bay": body.get("bay", ""),
        "level": body.get("level", ""),
        "capacity": body.get("capacity", 0),
        "active": True,
        "created_at": now(),
        "updated_at": now(),
    }
    
    await db.warehouse_locations.insert_one(location)
    await log_activity(user["id"], user["name"], "create", "warehouse_locations", f"Created location {code}")
    return serialize_doc(location)


@router.put("/locations/{location_id}")
async def update_location(location_id: str, request: Request):
    user = await require_auth(request)
    db = get_db()
    
    location = await db.warehouse_locations.find_one({"id": location_id})
    if not location:
        raise HTTPException(404, "Location not found")
    
    body = await request.json()
    updates = {k: v for k, v in body.items() if k not in ("id", "_id", "created_at")}
    updates["updated_at"] = now()
    
    await db.warehouse_locations.update_one({"id": location_id}, {"$set": updates})
    updated = await db.warehouse_locations.find_one({"id": location_id}, {"_id": 0})
    return serialize_doc(updated)


@router.delete("/locations/{location_id}")
async def delete_location(location_id: str, request: Request):
    user = await require_auth(request)
    db = get_db()
    
    stock_count = await db.warehouse_stock.count_documents({"location_id": location_id, "quantity": {"$gt": 0}})
    if stock_count > 0:
        raise HTTPException(400, f"Cannot delete location with {stock_count} active stock records")
    
    await db.warehouse_locations.delete_one({"id": location_id})
    return {"status": "deleted"}


# ── Goods Receiving ─────────────────────────────────────────────────────────

@router.get("/receiving")
async def get_receiving(request: Request):
    await require_auth(request)
    db = get_db()
    receipts = await db.warehouse_receiving.find({}, {"_id": 0}).sort("created_at", -1).to_list(None)
    return serialize_doc(receipts)


@router.get("/receiving/{receipt_id}")
async def get_receipt(receipt_id: str, request: Request):
    await require_auth(request)
    db = get_db()
    receipt = await db.warehouse_receiving.find_one({"id": receipt_id}, {"_id": 0})
    if not receipt:
        raise HTTPException(404, "Receipt not found")
    return serialize_doc(receipt)


@router.post("/receiving")
async def create_receiving(request: Request):
    user = await require_auth(request)
    body = await request.json()
    db = get_db()
    
    # W-4: Atomic counter for receipt_number (no race condition)
    from pymongo import ReturnDocument
    counter = await db.counters.find_one_and_update(
        {"_id": "gr_number"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    receipt_number = f"GR-{counter['seq']:05d}"
    
    # Sprint 2.1: PO reference for 3-way matching (optional but recommended)
    po_id = body.get("po_id") or None
    po_number = body.get("po_number") or ""
    
    receipt = {
        "id": new_id(),
        "receipt_number": receipt_number,
        "source_type": body.get("source_type", "supplier"),
        "source_ref": body.get("source_ref", ""),
        "supplier_name": body.get("supplier_name", ""),
        "location_id": body.get("location_id", ""),
        "location_name": body.get("location_name", ""),
        "status": "draft",
        "items": [],
        "notes": body.get("notes", ""),
        "received_by": user["name"],
        "received_by_id": user["id"],
        # Sprint 2.1: Link to Purchase Order
        "po_id": po_id,
        "po_number": po_number,
        "created_at": now(),
        "updated_at": now(),
    }
    
    for item in body.get("items", []):
        receipt_item = {
            "id": new_id(),
            "product_name": item.get("product_name", ""),
            "sku": item.get("sku", ""),
            # Sprint 1.1: material_id links to rahaza_materials for sync bridge
            "material_id": item.get("material_id") or None,
            "material_name": item.get("material_name") or item.get("product_name", ""),
            "expected_qty": float(item.get("expected_qty", 0)),
            "received_qty": float(item.get("received_qty", 0)),
            "rejected_qty": float(item.get("rejected_qty", 0)),
            "unit": item.get("unit", "pcs"),
            "inspection_status": "pending",
            "inspection_notes": "",
        }
        receipt["items"].append(receipt_item)
    
    await db.warehouse_receiving.insert_one(receipt)
    await log_activity(user["id"], user["name"], "create", "warehouse_receiving", f"Created GR {receipt_number}")
    return serialize_doc(receipt)


@router.put("/receiving/{receipt_id}")
async def update_receiving(receipt_id: str, request: Request):
    user = await require_auth(request)
    db = get_db()
    
    existing = await db.warehouse_receiving.find_one({"id": receipt_id})
    if not existing:
        raise HTTPException(404, "Receipt not found")
    
    body = await request.json()
    updates = {}
    
    if "status" in body:
        updates["status"] = body["status"]
    if "items" in body:
        updates["items"] = body["items"]
    if "notes" in body:
        updates["notes"] = body["notes"]
    updates["updated_at"] = now()
    
    # ── Sprint 1.1: Dual-ledger sync bridge ────────────────────────────────
    # When transitioning to 'received', update BOTH ledgers:
    #   1. warehouse_stock (bin-level, used by put-away / dashboard)
    #   2. rahaza_material_stock (material-level, used by Material Issue / BOM)
    if body.get("status") == "received" and existing.get("status") != "received":
        items_to_process = body.get("items") or existing.get("items", [])
        loc_name = existing.get("location_name", "")
        loc_id   = existing.get("location_id", "")
        
        for item in items_to_process:
            net_qty = float(item.get("received_qty", 0)) - float(item.get("rejected_qty", 0))
            if net_qty <= 0:
                continue
            
            sku  = item.get("sku", "")
            pname = item.get("product_name", "")
            unit  = item.get("unit", "pcs")
            lot_number  = item.get("lot_number") or ""
            expiry_date = item.get("expiry_date") or None
            
            # ── Ledger 1: warehouse_stock (existing, unchanged) ──────────────
            material_id = item.get("material_id")
            stock_key = {"location_id": loc_id, "sku": sku, "product_name": pname}
            existing_stock = await db.warehouse_stock.find_one(stock_key)
            if existing_stock:
                set_fields = {"updated_at": now()}
                # Backfill material_id if missing
                if material_id and not existing_stock.get("material_id"):
                    set_fields["material_id"] = material_id
                await db.warehouse_stock.update_one(
                    {"id": existing_stock["id"]},
                    {"$inc": {"quantity": net_qty, "total_received": net_qty}, "$set": set_fields}
                )
            else:
                await db.warehouse_stock.insert_one({
                    **stock_key, "id": new_id(),
                    "material_id": material_id,  # B4 Fix: store material_id so putaway can sync
                    "quantity": net_qty, "reserved": 0, "available": net_qty,
                    "total_received": net_qty, "unit": unit,
                    "lot_number": lot_number,   # U7: lot tracking
                    "expiry_date": expiry_date, # U7: expiry date tracking
                    "created_at": now(), "updated_at": now(),
                })
            
            # warehouse movement log
            await db.warehouse_movements.insert_one({
                "id": new_id(), "type": "receive",
                "receipt_id": receipt_id,
                "receipt_number": existing.get("receipt_number", ""),
                "location_id": loc_id, "location_name": loc_name,
                "sku": sku, "product_name": pname,
                "quantity": net_qty, "unit": unit,
                "performed_by": user["name"], "performed_by_id": user["id"],
                "notes": f"GR {existing.get('receipt_number', '')}",
                "created_at": now(),
            })
            
            # ── Ledger 2: rahaza_material_stock (NEW — sync bridge) ──────────
            # material_id already resolved above (line ~277)
            if material_id:
                try:
                    await _sync_to_material_stock(db, material_id, loc_id, net_qty)
                    await _record_material_movement(
                        db, material_id, loc_id, loc_name, net_qty, unit,
                        "goods_receipt", receipt_id,
                        existing.get("receipt_number", ""),
                        f"GR {existing.get('receipt_number', '')} — {pname} dari {existing.get('supplier_name', existing.get('source_type', ''))}",
                        user,
                    )
                    logger.info(f"GR sync: material_id={material_id} +{net_qty} {unit} @ loc={loc_id}")
                except Exception as e:
                    logger.error(f"GR sync to rahaza_material_stock failed: {e}")
                    # Non-fatal: don't break the receive flow
        
        # ── Sprint 2.1: Update PO received qty (3-way matching) ───────────────
        po_id = existing.get("po_id")
        if po_id:
            try:
                from routes.rahaza_po import update_po_received_qty
                # Build items list with material_id and qty for PO update
                items_for_po = []
                for item in items_to_process:
                    net_qty = float(item.get("received_qty", 0)) - float(item.get("rejected_qty", 0))
                    if net_qty > 0 and item.get("material_id"):
                        items_for_po.append({
                            "material_id": item["material_id"],
                            "qty": net_qty,
                        })
                if items_for_po:
                    await update_po_received_qty(db, po_id, items_for_po)
                    logger.info(f"GR {existing.get('receipt_number')} updated PO {existing.get('po_number')} received qty")
            except Exception as e:
                logger.error(f"Failed to update PO received qty: {e}")
                # Non-fatal: don't break the receive flow
    
    await db.warehouse_receiving.update_one({"id": receipt_id}, {"$set": updates})
    await log_activity(user["id"], user["name"], "update", "warehouse_receiving",
                       f"{existing.get('receipt_number', '')} → {body.get('status', 'updated')}")
    
    updated = await db.warehouse_receiving.find_one({"id": receipt_id}, {"_id": 0})
    return serialize_doc(updated)


@router.delete("/receiving/{receipt_id}")
async def delete_receiving(receipt_id: str, request: Request):
    user = await require_auth(request)
    db = get_db()
    receipt = await db.warehouse_receiving.find_one({"id": receipt_id})
    if not receipt:
        raise HTTPException(404, "Receipt not found")
    if receipt.get("status") == "received":
        raise HTTPException(400, "Tidak bisa hapus GR yang sudah 'received'")
    await db.warehouse_receiving.delete_one({"id": receipt_id})
    return {"status": "deleted"}


# ── Stock Summary & Movements ─────────────────────────────────────────────────

@router.get("/stock")
async def get_stock(request: Request, location_id: str = None, sku: str = None):
    await require_auth(request)
    db = get_db()
    query = {"quantity": {"$gt": 0}}
    if location_id: query["location_id"] = location_id
    if sku: query["sku"] = {"$regex": sku, "$options": "i"}
    stock = await db.warehouse_stock.find(query, {"_id": 0}).sort("product_name", 1).to_list(None)
    return serialize_doc(stock)


@router.get("/stock/summary")
async def get_stock_summary(request: Request):
    await require_auth(request)
    db = get_db()
    pipeline = [
        {"$match": {"quantity": {"$gt": 0}}},
        {"$group": {
            "_id": None,
            "total_skus": {"$sum": 1},
            "total_qty": {"$sum": "$quantity"},
            "total_value": {"$sum": {"$multiply": ["$quantity", {"$ifNull": ["$unit_cost", 0]}]}}
        }}
    ]
    results = await db.warehouse_stock.aggregate(pipeline).to_list(1)
    return serialize_doc(results[0] if results else {"total_skus": 0, "total_qty": 0, "total_value": 0})


@router.get("/movements")
async def get_movements(request: Request, location_id: str = None, sku: str = None, limit: int = 100):
    await require_auth(request)
    db = get_db()
    query = {}
    if location_id: query["location_id"] = location_id
    if sku: query["sku"] = {"$regex": sku, "$options": "i"}
    movements = await db.warehouse_movements.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(None)
    return serialize_doc(movements)


# ── Dashboard ──────────────────────────────────────────────────────────────────

@router.get("/dashboard-kpi")
async def warehouse_dashboard_kpi(request: Request):
    """Sprint 3.4: Dashboard KPI endpoint for WarehouseDashboard.jsx"""
    await require_auth(request)
    db = get_db()
    
    total_locations = await db.warehouse_locations.count_documents({"active": True})
    total_items = await db.warehouse_stock.count_documents({"quantity": {"$gt": 0}})
    pending_gr = await db.warehouse_receiving.count_documents({"status": {"$in": ["draft", "inspecting"]}})
    
    pipeline = [
        {"$match": {"quantity": {"$gt": 0}}},
        {"$group": {"_id": None, "total_qty": {"$sum": "$quantity"}}}
    ]
    stock_agg = await db.warehouse_stock.aggregate(pipeline).to_list(1)
    total_qty = (stock_agg[0]["total_qty"] if stock_agg else 0)
    
    return serialize_doc({
        "total_items": total_items,
        "total_locations": total_locations,
        "pending_gr": pending_gr,
        "total_qty": round(total_qty, 2),
    })


@router.get("/dashboard")
async def warehouse_dashboard(request: Request):
    await require_auth(request)
    db = get_db()
    
    total_locations = await db.warehouse_locations.count_documents({"active": True})
    total_skus      = await db.warehouse_stock.count_documents({"quantity": {"$gt": 0}})
    pending_receipts = await db.warehouse_receiving.count_documents({"status": {"$in": ["draft", "inspecting"]}})
    
    pipeline = [
        {"$match": {"quantity": {"$gt": 0}}},
        {"$group": {"_id": None, "total_qty": {"$sum": "$quantity"}}}
    ]
    stock_agg = await db.warehouse_stock.aggregate(pipeline).to_list(1)
    total_qty = (stock_agg[0]["total_qty"] if stock_agg else 0)
    
    recent_movements = await db.warehouse_movements.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(None)
    
    return serialize_doc({
        "total_locations": total_locations,
        "total_skus": total_skus,
        "total_qty": total_qty,
        "pending_receipts": pending_receipts,
        "recent_movements": recent_movements,
    })


# ── Put-Away ──────────────────────────────────────────────────────────────────

@router.get("/putaway")
async def get_putaways(request: Request):
    await require_auth(request)
    db = get_db()
    putaways = await db.warehouse_putaway.find({}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(None)
    return serialize_doc(putaways)


@router.post("/putaway")
async def create_putaway(request: Request):
    user = await require_auth(request)
    db = get_db()
    body = await request.json()
    
    source_stock_id = body.get("source_stock_id")
    target_location_id = body.get("target_location_id")
    quantity = float(body.get("quantity", 0))
    
    if not all([source_stock_id, target_location_id, quantity > 0]):
        raise HTTPException(400, "source_stock_id, target_location_id, and quantity > 0 required")
    
    source = await db.warehouse_stock.find_one({"id": source_stock_id})
    if not source:
        raise HTTPException(404, "Source stock not found")
    if source.get("available", source.get("quantity", 0)) < quantity:
        raise HTTPException(400, f"Insufficient stock. Available: {source.get('available', source.get('quantity', 0))}")
    
    target_location = await db.warehouse_locations.find_one({"id": target_location_id}, {"_id": 0})
    if not target_location:
        raise HTTPException(404, "Target location not found")
    
    # Move from source to target
    await db.warehouse_stock.update_one(
        {"id": source_stock_id},
        {"$inc": {"quantity": -quantity, "available": -quantity}, "$set": {"updated_at": now()}}
    )
    
    target_key = {"location_id": target_location_id, "sku": source["sku"], "product_name": source["product_name"]}
    existing_target = await db.warehouse_stock.find_one(target_key)
    if existing_target:
        await db.warehouse_stock.update_one(
            {"id": existing_target["id"]},
            {"$inc": {"quantity": quantity, "available": quantity}, "$set": {"updated_at": now()}}
        )
    else:
        await db.warehouse_stock.insert_one({
            **target_key, "id": new_id(),
            "quantity": quantity, "reserved": 0, "available": quantity,
            "unit": source.get("unit", "pcs"),
            "created_at": now(), "updated_at": now(),
        })
    
    putaway = {
        "id": new_id(),
        "source_location_id": source["location_id"],
        "target_location_id": target_location_id,
        "target_location_name": target_location.get("name", ""),
        "sku": source["sku"],
        "product_name": source["product_name"],
        "quantity": quantity,
        "unit": source.get("unit", "pcs"),
        "performed_by": user["name"],
        "performed_by_id": user["id"],
        "created_at": now(),
    }
    await db.warehouse_putaway.insert_one(putaway)
    
    # B4 Fix: sync putaway movement to rahaza_material_stock (the canonical stock ledger)
    material_id = source.get("material_id")
    if material_id:
        source_loc = source["location_id"]
        await _sync_to_material_stock(db, material_id, source_loc, -quantity)
        await _sync_to_material_stock(db, material_id, target_location_id, quantity)
    
    await db.warehouse_movements.insert_one({
        "id": new_id(), "type": "putaway",
        "source_location_id": source["location_id"],
        "location_id": target_location_id, "location_name": target_location.get("name", ""),
        "sku": source["sku"], "product_name": source["product_name"],
        "quantity": quantity, "unit": source.get("unit", "pcs"),
        "performed_by": user["name"], "performed_by_id": user["id"],
        "created_at": now(),
    })
    
    await log_activity(user["id"], user["name"], "putaway", "warehouse_stock", f"Put-away {quantity} {source['sku']} → {target_location.get('name', target_location_id)}")
    return serialize_doc(putaway)


# ── Stock Opname (Cycle Count) ─────────────────────────────────────────────────

@router.get("/opname")
async def get_opnames(request: Request):
    await require_auth(request)
    db = get_db()
    opnames = await db.warehouse_opname.find({}, {"_id": 0}).sort("created_at", -1).to_list(None)
    return serialize_doc(opnames)


@router.post("/opname")
async def create_opname(request: Request):
    user = await require_auth(request)
    db = get_db()
    body = await request.json()
    
    from pymongo import ReturnDocument
    counter = await db.counters.find_one_and_update(
        {"_id": "opname_number"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    opname_number = f"OP-{counter['seq']:05d}"
    
    location_id = body.get("location_id", "")
    location = await db.warehouse_locations.find_one({"id": location_id}, {"_id": 0}) if location_id else None
    
    opname = {
        "id": new_id(),
        "opname_number": opname_number,
        "location_id": location_id,
        "location_name": (location or {}).get("name", ""),
        "status": "draft",
        "items": [],
        "notes": body.get("notes", ""),
        "created_by": user["name"],
        "created_by_id": user["id"],
        "created_at": now(),
        "updated_at": now(),
    }
    
    existing_stock = await db.warehouse_stock.find(
        {"location_id": location_id, "quantity": {"$gt": 0}}, {"_id": 0}
    ).to_list(None) if location_id else []
    
    for stock in existing_stock:
        opname["items"].append({
            "id": new_id(),
            "sku": stock.get("sku", ""),
            "product_name": stock.get("product_name", ""),
            "material_id": stock.get("material_id") or None,
            "system_qty": stock.get("quantity", 0),
            "counted_qty": 0,
            "variance": 0,
            "unit": stock.get("unit", "pcs"),
        })
    
    await db.warehouse_opname.insert_one(opname)
    await log_activity(user["id"], user["name"], "create", "warehouse_opname", f"Opname {opname_number}")
    return serialize_doc(opname)


@router.put("/opname/{opname_id}")
async def update_opname(opname_id: str, request: Request):
    user = await require_auth(request)
    db = get_db()
    
    existing = await db.warehouse_opname.find_one({"id": opname_id})
    if not existing:
        raise HTTPException(404, "Opname not found")
    
    body = await request.json()
    updates = {}
    
    if "items" in body:
        items = body["items"]
        for item in items:
            # B3 Fix: accept physical_qty (frontend field) as alias for counted_qty (backend field)
            if "physical_qty" in item and "counted_qty" not in item:
                item["counted_qty"] = float(item.get("physical_qty") or 0)
            elif "physical_qty" in item:
                item["counted_qty"] = float(item.get("physical_qty") or item.get("counted_qty") or 0)
            item["variance"] = float(item.get("counted_qty", 0)) - float(item.get("system_qty", 0))
            # Also keep discrepancy in sync (frontend uses this field name)
            item["discrepancy"] = item["variance"]
        updates["items"] = items
    
    if "status" in body:
        new_status = body["status"]
        updates["status"] = new_status
        # B3 Fix: treat "adjusted" or "approved" as completion trigger (frontend never sends "completed")
        trigger_completion = new_status in ("completed", "adjusted", "approved")
        
        if trigger_completion and existing.get("status") not in ("completed", "adjusted", "approved"):
            items = updates.get("items") or existing.get("items", [])
            for item in items:
                variance = float(item.get("variance", 0))
                if variance != 0:
                    sku = item.get("sku", "")
                    loc_id = existing.get("location_id", "")
                    pname = item.get("product_name", "")
                    unit = item.get("unit", "pcs")
                    material_id = item.get("material_id")
                    
                    stock = await db.warehouse_stock.find_one({"location_id": loc_id, "sku": sku})
                    if stock:
                        new_qty = max(0, float(stock.get("quantity", 0)) + variance)
                        await db.warehouse_stock.update_one(
                            {"id": stock["id"]},
                            {"$set": {"quantity": new_qty, "available": new_qty, "updated_at": now()}}
                        )
                    
                    await db.warehouse_movements.insert_one({
                        "id": new_id(), "type": "adjustment",
                        "opname_id": opname_id, "opname_number": existing.get("opname_number", ""),
                        "location_id": loc_id, "location_name": existing.get("location_name", ""),
                        "sku": sku, "product_name": pname,
                        "quantity": variance, "unit": unit,
                        "performed_by": user["name"], "performed_by_id": user["id"],
                        "notes": f"Opname adjustment {existing.get('opname_number', '')}",
                        "created_at": now(),
                    })
                    
                    # ── Sprint 2.4: Post opname variance to GL (if material_id exists) ──
                    if material_id:
                        try:
                            # Sync to material stock
                            await _sync_to_material_stock(db, material_id, loc_id, variance)
                            
                            # Create material movement for audit trail
                            mv = await _record_material_movement(
                                db, material_id, loc_id, existing.get("location_name", ""),
                                variance, unit, "opname_adjustment",
                                opname_id, existing.get("opname_number", ""),
                                f"Stock Opname {existing.get('opname_number', '')} - Variance: {variance:+.2f}",
                                user,
                            )
                            
                            # Post to GL (Dr/Cr Inventory vs Adjustment Expense)
                            from routes.rahaza_posting import post_inventory_adjust
                            posting_result = await post_inventory_adjust(db, mv, user)
                            
                            logger.info(f"Opname {existing.get('opname_number')} posted to GL: material_id={material_id}, variance={variance}, result={posting_result.get('ok')}")
                        except Exception as e:
                            logger.error(f"Failed to post opname variance to GL: {e}")
                            # Non-fatal: opname tetap completed, GL bisa di-retry manual
                    else:
                        logger.warning(f"Opname item {sku} tidak punya material_id, skip GL posting")
        
        if new_status in ("completed", "adjusted", "approved"):
            updates["completed_at"] = now()
            updates["completed_by"] = user["name"]
    
    updates["updated_at"] = now()
    await db.warehouse_opname.update_one({"id": opname_id}, {"$set": updates})
    updated = await db.warehouse_opname.find_one({"id": opname_id}, {"_id": 0})
    return serialize_doc(updated)


@router.get("/opname/{opname_id}")
async def get_opname(opname_id: str, request: Request):
    await require_auth(request)
    db = get_db()
    opname = await db.warehouse_opname.find_one({"id": opname_id}, {"_id": 0})
    if not opname:
        raise HTTPException(404, "Opname not found")
    return serialize_doc(opname)
