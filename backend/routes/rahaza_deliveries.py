"""
PT Rahaza — Deliveries / Shipments (FG Dispatch)

Endpoints (prefix /api/rahaza):
  - GET    /deliveries                    : List all deliveries (filters: order_id, status, date_range)
  - GET    /deliveries/{delivery_id}      : Detail delivery
  - GET    /orders/{order_id}/deliveries  : Get all deliveries for specific order
  - POST   /deliveries                    : Create new delivery (with validations)
  - PUT    /deliveries/{delivery_id}      : Update delivery (draft only)
  - DELETE /deliveries/{delivery_id}      : Delete delivery (draft only)
  - POST   /deliveries/{delivery_id}/confirm : Confirm delivery (reduce FG stock)

Schema (rahaza_deliveries):
  {
    id, delivery_number, order_id, order_number,
    delivery_date, customer_name, customer_id,
    items: [
      {
        model_id, model_code, model_name,
        size_id, size_code, size_name,
        fg_material_id, fg_code,
        qty_requested, qty_available_at_creation,
        work_order_id (optional - untuk tracking)
      }
    ],
    status,  # draft | confirmed | cancelled
    total_qty, notes, do_number (Delivery Order number external),
    created_at, updated_at, confirmed_at, confirmed_by, created_by
  }

Validations:
1. Order must exist and have completed WOs
2. qty_requested <= qty available in FG inventory
3. qty_requested <= (total_completed_qty - total_delivered_qty) per model+size
4. FG inventory > 0 for each item
5. Support multiple dispatch (track total delivered per order)
"""
from fastapi import APIRouter, Request, HTTPException
from database import get_db
from auth import require_auth, serialize_doc, log_activity
from routes.rahaza_audit import log_audit
import uuid
from datetime import datetime, timezone, date
from typing import Optional
import logging

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rahaza", tags=["rahaza-deliveries"])


def _uid(): return str(uuid.uuid4())
def _now(): return datetime.now(timezone.utc)


DELIVERY_STATUSES = ["draft", "confirmed", "cancelled"]


async def _require_admin(request: Request):
    user = await require_auth(request)
    role = (user.get("role") or "").lower()
    if role in ("superadmin", "admin", "owner"):
        return user
    perms = user.get("_permissions") or []
    if "*" in perms or "delivery.manage" in perms or "warehouse.manage" in perms:
        return user
    raise HTTPException(403, "Forbidden: butuh permission delivery / warehouse.")


async def _gen_delivery_number(db):
    today = date.today().strftime("%Y%m%d")
    prefix = f"DLV-{today}"
    count = await db.rahaza_deliveries.count_documents({"delivery_number": {"$regex": f"^{prefix}"}})
    return f"{prefix}-{count+1:03d}"


# ────────────────────────────────────────────────────────────────────────────────
# LIST DELIVERIES
# ────────────────────────────────────────────────────────────────────────────────
@router.get("/deliveries")
async def list_deliveries(
    request: Request,
    order_id: Optional[str] = None,
    status: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    user = await require_auth(request)
    db = get_db()
    
    query = {}
    if order_id:
        query["order_id"] = order_id
    if status:
        query["status"] = status.lower()
    if from_date:
        query["delivery_date"] = {"$gte": from_date}
    if to_date:
        query.setdefault("delivery_date", {})["$lte"] = to_date
    
    total = await db.rahaza_deliveries.count_documents(query)
    deliveries = await db.rahaza_deliveries.find(
        query, {"_id": 0}
    ).sort([("delivery_date", -1), ("created_at", -1)]).skip(offset).limit(limit).to_list(None)
    
    return {
        "items": [serialize_doc(d) for d in deliveries],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ────────────────────────────────────────────────────────────────────────────────
# GET DELIVERY DETAIL
# ────────────────────────────────────────────────────────────────────────────────
@router.get("/deliveries/{delivery_id}")
async def get_delivery_detail(request: Request, delivery_id: str):
    user = await require_auth(request)
    db = get_db()
    
    delivery = await db.rahaza_deliveries.find_one({"id": delivery_id}, {"_id": 0})
    if not delivery:
        raise HTTPException(404, "Delivery not found")
    
    return serialize_doc(delivery)


# ────────────────────────────────────────────────────────────────────────────────
# GET DELIVERIES FOR ORDER
# ────────────────────────────────────────────────────────────────────────────────
@router.get("/orders/{order_id}/deliveries")
async def get_order_deliveries(request: Request, order_id: str):
    user = await require_auth(request)
    db = get_db()
    
    deliveries = await db.rahaza_deliveries.find(
        {"order_id": order_id}, {"_id": 0}
    ).sort([("delivery_date", -1), ("created_at", -1)]).to_list(None)
    
    # Calculate summary
    total_delivered = 0
    for dlv in deliveries:
        if dlv.get("status") == "confirmed":
            total_delivered += dlv.get("total_qty", 0)
    
    return {
        "deliveries": [serialize_doc(d) for d in deliveries],
        "summary": {
            "total_deliveries": len(deliveries),
            "total_qty_delivered": total_delivered,
        }
    }


# ────────────────────────────────────────────────────────────────────────────────
# CREATE DELIVERY
# ────────────────────────────────────────────────────────────────────────────────
@router.post("/deliveries")
async def create_delivery(request: Request):
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    
    order_id = body.get("order_id")
    if not order_id:
        raise HTTPException(400, "order_id required")
    
    # Validate order exists
    order = await db.rahaza_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, f"Order {order_id} not found")
    
    # Get items to deliver
    items = body.get("items", [])
    if not items:
        raise HTTPException(400, "items required (at least 1 item)")
    
    # Validate and enrich each item
    validated_items = []
    total_qty = 0
    
    for item in items:
        model_id = item.get("model_id")
        size_id = item.get("size_id")
        qty_requested = int(item.get("qty_requested", 0))
        
        if qty_requested <= 0:
            raise HTTPException(400, f"qty_requested must be > 0 for model {model_id}")
        
        # Get model info
        model = await db.rahaza_models.find_one({"id": model_id}, {"_id": 0})
        if not model:
            raise HTTPException(404, f"Model {model_id} not found")
        
        # Get size info
        size_code = ""
        size_name = ""
        if size_id:
            size_doc = await db.rahaza_sizes.find_one({"id": size_id}, {"_id": 0})
            if size_doc:
                size_code = size_doc.get("code", "")
                size_name = size_doc.get("name", "")
        
        # Generate FG code
        fg_code = f"FG-{model.get('code', 'UNKNOWN')}"
        if size_code:
            fg_code = f"{fg_code}-{size_code}"
        
        # Check FG material exists
        fg_material = await db.rahaza_materials.find_one({"code": fg_code}, {"_id": 0})
        if not fg_material:
            raise HTTPException(
                404,
                f"FG material {fg_code} tidak ditemukan. Pastikan model {model.get('code')} size {size_code} sudah pernah diproduksi (WO completed)."
            )
        
        # VALIDATION 1: Check FG inventory available
        fg_location = await db.rahaza_locations.find_one({"code": "FG-WH"}, {"_id": 0})
        if not fg_location:
            raise HTTPException(500, "FG Warehouse location not found. Please contact admin.")
        
        stock = await db.rahaza_material_stock.find_one({
            "material_id": fg_material["id"],
            "location_id": fg_location["id"],
        }, {"_id": 0})
        
        qty_available = float(stock.get("qty", 0)) if stock else 0
        
        if qty_available <= 0:
            raise HTTPException(
                400,
                f"❌ VALIDASI GAGAL: Inventory FG {fg_code} = 0. Tidak bisa melakukan pengiriman. Produksi dulu atau tunggu WO selesai."
            )
        
        if qty_requested > qty_available:
            raise HTTPException(
                400,
                f"❌ VALIDASI GAGAL: Qty pengiriman ({qty_requested} pcs) melebihi stock FG yang tersedia ({int(qty_available)} pcs) untuk {fg_code}. Maksimal kirim: {int(qty_available)} pcs."
            )
        
        # VALIDATION 2: Check against completed WO qty
        # Get all completed WOs for this order + model + size
        completed_wos = await db.rahaza_work_orders.find({
            "order_id": order_id,
            "model_id": model_id,
            "size_id": size_id,
            "status": "completed",
        }, {"_id": 0, "id": 1, "wo_number": 1, "qty": 1}).to_list(None)
        
        total_completed = sum(int(wo.get("qty", 0)) for wo in completed_wos)
        
        if total_completed == 0:
            raise HTTPException(
                400,
                f"❌ VALIDASI GAGAL: Belum ada WO yang completed untuk {model.get('code')} size {size_code} di order ini. Tunggu produksi selesai dulu."
            )
        
        # Get total already delivered for this order + model + size
        already_delivered = await db.rahaza_deliveries.aggregate([
            {"$match": {"order_id": order_id, "status": "confirmed"}},
            {"$unwind": "$items"},
            {"$match": {"items.model_id": model_id, "items.size_id": size_id if size_id else {"$exists": False}}},
            {"$group": {"_id": None, "total": {"$sum": "$items.qty_requested"}}}
        ]).to_list(None)
        
        total_delivered = int(already_delivered[0]["total"]) if already_delivered else 0
        remaining_qty = total_completed - total_delivered
        
        if qty_requested > remaining_qty:
            raise HTTPException(
                400,
                f"❌ VALIDASI GAGAL: Qty pengiriman ({qty_requested} pcs) melebihi sisa yang belum dikirim ({remaining_qty} pcs) untuk {fg_code}.\n"
                f"Detail: Total produksi = {total_completed} pcs, Sudah dikirim = {total_delivered} pcs, Sisa = {remaining_qty} pcs."
            )
        
        # Item valid - add to list
        validated_items.append({
            "model_id": model_id,
            "model_code": model.get("code", ""),
            "model_name": model.get("name", ""),
            "size_id": size_id if size_id else None,
            "size_code": size_code,
            "size_name": size_name,
            "fg_material_id": fg_material["id"],
            "fg_code": fg_code,
            "qty_requested": qty_requested,
            "qty_available_at_creation": int(qty_available),
            "qty_completed": total_completed,
            "qty_already_delivered": total_delivered,
        })
        
        total_qty += qty_requested
    
    # All validations passed - create delivery
    delivery_id = _uid()
    delivery_number = await _gen_delivery_number(db)
    
    delivery_doc = {
        "id": delivery_id,
        "delivery_number": delivery_number,
        "order_id": order_id,
        "order_number": order.get("order_number", ""),
        "customer_id": order.get("customer_id", ""),
        "customer_name": order.get("customer_name", ""),
        "delivery_date": body.get("delivery_date") or date.today().isoformat(),
        "items": validated_items,
        "total_qty": total_qty,
        "status": "draft",
        "do_number": body.get("do_number", ""),  # External Delivery Order number
        "notes": body.get("notes", ""),
        "created_at": _now(),
        "updated_at": _now(),
        "created_by": user.get("id"),
        "created_by_name": user.get("name", ""),
    }
    
    await db.rahaza_deliveries.insert_one(delivery_doc)
    await log_activity(user["id"], user.get("name", ""), "create", "rahaza.delivery", delivery_id)
    await log_audit(db, entity_type="rahaza_delivery", entity_id=delivery_id, action="create",
                    before=None, after=delivery_doc, user=user, request=request)
    
    return {
        "message": "✅ Delivery created successfully (status: draft). Confirm untuk mengurangi inventory FG.",
        "delivery": serialize_doc(delivery_doc),
    }


# ────────────────────────────────────────────────────────────────────────────────
# CONFIRM DELIVERY (Reduce FG Stock)
# ────────────────────────────────────────────────────────────────────────────────
@router.post("/deliveries/{delivery_id}/confirm")
async def confirm_delivery(request: Request, delivery_id: str):
    user = await _require_admin(request)
    db = get_db()
    
    delivery = await db.rahaza_deliveries.find_one({"id": delivery_id}, {"_id": 0})
    if not delivery:
        raise HTTPException(404, "Delivery not found")
    
    if delivery.get("status") != "draft":
        raise HTTPException(400, f"Delivery sudah {delivery.get('status')}. Hanya draft yang bisa di-confirm.")
    
    # Get FG warehouse location
    fg_location = await db.rahaza_locations.find_one({"code": "FG-WH"}, {"_id": 0})
    if not fg_location:
        raise HTTPException(500, "FG Warehouse location not found")
    
    # Reduce stock for each item
    items = delivery.get("items", [])
    for item in items:
        fg_material_id = item.get("fg_material_id")
        qty = item.get("qty_requested", 0)
        fg_code = item.get("fg_code", "")
        
        # Re-check stock (double validation in case stock changed)
        stock = await db.rahaza_material_stock.find_one({
            "material_id": fg_material_id,
            "location_id": fg_location["id"],
        }, {"_id": 0})
        
        current_qty = float(stock.get("qty", 0)) if stock else 0
        
        if current_qty < qty:
            raise HTTPException(
                400,
                f"❌ GAGAL CONFIRM: Stock FG {fg_code} sekarang hanya {int(current_qty)} pcs (kurang dari {qty} pcs yang akan dikirim). Stock berubah sejak delivery dibuat."
            )
        
        # Reduce stock
        await db.rahaza_material_stock.update_one(
            {"material_id": fg_material_id, "location_id": fg_location["id"]},
            {"$inc": {"qty": -qty}, "$set": {"updated_at": _now()}},
        )
        
        # Log FG movement
        await db.rahaza_fg_movements.insert_one({
            "id": _uid(),
            "fg_code": fg_code,
            "fg_material_id": fg_material_id,
            "delivery_id": delivery_id,
            "delivery_number": delivery.get("delivery_number", ""),
            "event_type": "delivery_out",
            "qty": -qty,  # negative = keluar
            "location_id": fg_location["id"],
            "location_name": fg_location.get("name", ""),
            "timestamp": _now(),
            "created_by": user.get("id"),
            "created_by_name": user.get("name", ""),
            "notes": f"Delivery {delivery.get('delivery_number', '')} ke {delivery.get('customer_name', '')}",
        })
    
    # Update delivery status
    await db.rahaza_deliveries.update_one(
        {"id": delivery_id},
        {"$set": {
            "status": "confirmed",
            "confirmed_at": _now(),
            "confirmed_by": user.get("id"),
            "confirmed_by_name": user.get("name", ""),
            "updated_at": _now(),
        }},
    )
    
    await log_activity(user["id"], user.get("name", ""), "confirm", "rahaza.delivery", delivery_id)
    await log_audit(db, entity_type="rahaza_delivery", entity_id=delivery_id, action="confirm",
                    before={"status": "draft"}, after={"status": "confirmed"},
                    user=user, request=request)
    
    log.info(f"Delivery {delivery.get('delivery_number', '')} confirmed: {delivery.get('total_qty')} pcs sent to {delivery.get('customer_name')}")
    
    return {
        "message": "✅ Delivery confirmed! FG inventory berkurang sesuai qty pengiriman.",
        "delivery_id": delivery_id,
        "delivery_number": delivery.get("delivery_number", ""),
        "total_qty": delivery.get("total_qty", 0),
        "status": "confirmed",
    }


# ────────────────────────────────────────────────────────────────────────────────
# UPDATE DELIVERY (Draft Only)
# ────────────────────────────────────────────────────────────────────────────────
@router.put("/deliveries/{delivery_id}")
async def update_delivery(request: Request, delivery_id: str):
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    
    delivery = await db.rahaza_deliveries.find_one({"id": delivery_id}, {"_id": 0})
    if not delivery:
        raise HTTPException(404, "Delivery not found")
    
    if delivery.get("status") != "draft":
        raise HTTPException(400, "Hanya delivery draft yang bisa diubah")
    
    upd = {"updated_at": _now()}
    if "delivery_date" in body: upd["delivery_date"] = body["delivery_date"]
    if "do_number" in body: upd["do_number"] = body["do_number"]
    if "notes" in body: upd["notes"] = body["notes"]
    
    await db.rahaza_deliveries.update_one({"id": delivery_id}, {"$set": upd})
    await log_activity(user["id"], user.get("name", ""), "update", "rahaza.delivery", delivery_id)
    
    return {"message": "Delivery updated", "delivery_id": delivery_id}


# ────────────────────────────────────────────────────────────────────────────────
# DELETE DELIVERY (Draft Only)
# ────────────────────────────────────────────────────────────────────────────────
@router.delete("/deliveries/{delivery_id}")
async def delete_delivery(request: Request, delivery_id: str):
    user = await _require_admin(request)
    db = get_db()
    
    delivery = await db.rahaza_deliveries.find_one({"id": delivery_id}, {"_id": 0})
    if not delivery:
        raise HTTPException(404, "Delivery not found")
    
    if delivery.get("status") != "draft":
        raise HTTPException(400, "Hanya delivery draft yang bisa dihapus")
    
    await db.rahaza_deliveries.delete_one({"id": delivery_id})
    await log_activity(user["id"], user.get("name", ""), "delete", "rahaza.delivery", delivery_id)
    
    return {"message": "Delivery deleted", "delivery_id": delivery_id}



# ────────────────────────────────────────────────────────────────────────────────
# ADVANCED FEATURE 1: BATCH DELIVERY (Multiple Orders in 1 Delivery)
# ────────────────────────────────────────────────────────────────────────────────
@router.post("/deliveries/batch")
async def create_batch_delivery(request: Request):
    """
    Create delivery untuk multiple orders sekaligus.
    
    Payload:
    {
      "delivery_date": "2026-06-01",
      "do_number": "DO-BATCH-001",
      "notes": "Batch delivery ke warehouse pusat",
      "orders": [
        {
          "order_id": "order-1",
          "items": [{"model_id": "...", "size_id": "...", "qty_requested": 100}]
        },
        {
          "order_id": "order-2",
          "items": [{"model_id": "...", "size_id": "...", "qty_requested": 50}]
        }
      ]
    }
    
    Response: 1 delivery doc dengan items dari semua orders
    """
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    
    orders_data = body.get("orders", [])
    if not orders_data:
        raise HTTPException(400, "orders required (minimal 1 order)")
    
    if len(orders_data) < 2:
        raise HTTPException(400, "Batch delivery minimal untuk 2 orders. Gunakan endpoint biasa untuk 1 order.")
    
    # Aggregate all items from all orders
    all_items = []
    order_summaries = []
    
    for order_data in orders_data:
        order_id = order_data.get("order_id")
        items = order_data.get("items", [])
        
        if not order_id or not items:
            raise HTTPException(400, f"order_id dan items required untuk setiap order")
        
        # Validate order exists
        order = await db.rahaza_orders.find_one({"id": order_id}, {"_id": 0})
        if not order:
            raise HTTPException(404, f"Order {order_id} not found")
        
        # Validate items for this order (sama seperti single delivery)
        validated_items = []
        order_total_qty = 0
        
        for item in items:
            model_id = item.get("model_id")
            size_id = item.get("size_id")
            qty_requested = int(item.get("qty_requested", 0))
            
            if qty_requested <= 0:
                raise HTTPException(400, f"qty_requested must be > 0")
            
            # Get model & size info
            model = await db.rahaza_models.find_one({"id": model_id}, {"_id": 0})
            if not model:
                raise HTTPException(404, f"Model {model_id} not found")
            
            size_code = ""
            size_name = ""
            if size_id:
                size_doc = await db.rahaza_sizes.find_one({"id": size_id}, {"_id": 0})
                if size_doc:
                    size_code = size_doc.get("code", "")
                    size_name = size_doc.get("name", "")
            
            fg_code = f"FG-{model.get('code', 'UNKNOWN')}"
            if size_code:
                fg_code = f"{fg_code}-{size_code}"
            
            # Check FG material & stock (sama validasi seperti single delivery)
            fg_material = await db.rahaza_materials.find_one({"code": fg_code}, {"_id": 0})
            if not fg_material:
                raise HTTPException(404, f"FG material {fg_code} belum pernah diproduksi")
            
            fg_location = await db.rahaza_locations.find_one({"code": "FG-WH"}, {"_id": 0})
            if not fg_location:
                raise HTTPException(500, "FG Warehouse not found")
            
            stock = await db.rahaza_material_stock.find_one({
                "material_id": fg_material["id"],
                "location_id": fg_location["id"],
            }, {"_id": 0})
            
            qty_available = float(stock.get("qty", 0)) if stock else 0
            
            if qty_available <= 0:
                raise HTTPException(400, f"❌ Inventory FG {fg_code} = 0 untuk order {order.get('order_number')}")
            
            if qty_requested > qty_available:
                raise HTTPException(400, f"❌ Qty ({qty_requested}) > Stock ({int(qty_available)}) untuk {fg_code}")
            
            # Check completed vs delivered
            completed_wos = await db.rahaza_work_orders.find({
                "order_id": order_id,
                "model_id": model_id,
                "size_id": size_id,
                "status": "completed",
            }, {"_id": 0, "qty": 1}).to_list(None)
            
            total_completed = sum(int(wo.get("qty", 0)) for wo in completed_wos)
            
            if total_completed == 0:
                raise HTTPException(400, f"❌ Belum ada WO completed untuk {fg_code} di order {order.get('order_number')}")
            
            already_delivered = await db.rahaza_deliveries.aggregate([
                {"$match": {"order_id": order_id, "status": "confirmed"}},
                {"$unwind": "$items"},
                {"$match": {"items.model_id": model_id, "items.size_id": size_id if size_id else {"$exists": False}}},
                {"$group": {"_id": None, "total": {"$sum": "$items.qty_requested"}}}
            ]).to_list(None)
            
            total_delivered = int(already_delivered[0]["total"]) if already_delivered else 0
            remaining_qty = total_completed - total_delivered
            
            if qty_requested > remaining_qty:
                raise HTTPException(400, f"❌ Qty ({qty_requested}) > Remaining ({remaining_qty}) untuk {fg_code}")
            
            # Item valid
            validated_items.append({
                "order_id": order_id,
                "order_number": order.get("order_number", ""),
                "model_id": model_id,
                "model_code": model.get("code", ""),
                "model_name": model.get("name", ""),
                "size_id": size_id if size_id else None,
                "size_code": size_code,
                "size_name": size_name,
                "fg_material_id": fg_material["id"],
                "fg_code": fg_code,
                "qty_requested": qty_requested,
                "qty_available_at_creation": int(qty_available),
            })
            
            order_total_qty += qty_requested
        
        all_items.extend(validated_items)
        order_summaries.append({
            "order_id": order_id,
            "order_number": order.get("order_number", ""),
            "customer_name": order.get("customer_name", ""),
            "total_qty": order_total_qty,
        })
    
    # Create batch delivery
    delivery_id = _uid()
    delivery_number = await _gen_delivery_number(db)
    total_qty = sum(item["qty_requested"] for item in all_items)
    
    delivery_doc = {
        "id": delivery_id,
        "delivery_number": delivery_number,
        "delivery_type": "batch",  # NEW: batch vs single
        "order_id": None,  # Null untuk batch (multiple orders)
        "order_summaries": order_summaries,  # Summary per order
        "delivery_date": body.get("delivery_date") or date.today().isoformat(),
        "items": all_items,
        "total_qty": total_qty,
        "status": "draft",
        "do_number": body.get("do_number", ""),
        "notes": body.get("notes", ""),
        "created_at": _now(),
        "updated_at": _now(),
        "created_by": user.get("id"),
        "created_by_name": user.get("name", ""),
    }
    
    await db.rahaza_deliveries.insert_one(delivery_doc)
    await log_activity(user["id"], user.get("name", ""), "create_batch", "rahaza.delivery", delivery_id)
    
    log.info(f"Batch delivery {delivery_number} created: {len(order_summaries)} orders, {total_qty} pcs total")
    
    return {
        "message": f"✅ Batch delivery created! {len(order_summaries)} orders, {total_qty} pcs total. Status: draft.",
        "delivery": serialize_doc(delivery_doc),
        "order_count": len(order_summaries),
    }


# ────────────────────────────────────────────────────────────────────────────────
# ADVANCED FEATURE 2: RETURN DELIVERY (Barang Dikembalikan)
# ────────────────────────────────────────────────────────────────────────────────
@router.post("/deliveries/{delivery_id}/return")
async def create_delivery_return(request: Request, delivery_id: str):
    """
    Create return delivery untuk barang yang dikembalikan customer.
    
    Payload:
    {
      "return_date": "2026-06-10",
      "return_reason": "Defect ditemukan customer",
      "items": [
        {
          "fg_material_id": "...",
          "fg_code": "FG-SWT-001-M",
          "qty_returned": 10
        }
      ],
      "notes": "10 pcs defect dikembalikan customer untuk rework"
    }
    
    Logic:
    - Create return doc (status: draft)
    - Saat confirm: FG stock += qty_returned (balik ke inventory)
    - Log fg_movements (delivery_return_in)
    """
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    
    # Get original delivery
    delivery = await db.rahaza_deliveries.find_one({"id": delivery_id}, {"_id": 0})
    if not delivery:
        raise HTTPException(404, "Delivery not found")
    
    if delivery.get("status") != "confirmed":
        raise HTTPException(400, "Hanya delivery confirmed yang bisa di-return")
    
    # Get return items
    return_items = body.get("items", [])
    if not return_items:
        raise HTTPException(400, "items required (minimal 1 item)")
    
    validated_return_items = []
    total_return_qty = 0
    
    for item in return_items:
        fg_material_id = item.get("fg_material_id")
        fg_code = item.get("fg_code")
        qty_returned = int(item.get("qty_returned", 0))
        
        if qty_returned <= 0:
            raise HTTPException(400, "qty_returned must be > 0")
        
        # Validate item was in original delivery
        original_item = None
        for orig in delivery.get("items", []):
            if orig.get("fg_material_id") == fg_material_id or orig.get("fg_code") == fg_code:
                original_item = orig
                break
        
        if not original_item:
            raise HTTPException(400, f"Item {fg_code} tidak ada di delivery {delivery.get('delivery_number')}")
        
        # Check if qty_returned <= qty_requested dari original
        if qty_returned > original_item.get("qty_requested", 0):
            raise HTTPException(400, f"Qty return ({qty_returned}) > Qty delivered original ({original_item.get('qty_requested')})")
        
        validated_return_items.append({
            "fg_material_id": fg_material_id or original_item.get("fg_material_id"),
            "fg_code": fg_code or original_item.get("fg_code"),
            "model_code": original_item.get("model_code"),
            "model_name": original_item.get("model_name"),
            "size_code": original_item.get("size_code"),
            "qty_returned": qty_returned,
            "qty_original_delivered": original_item.get("qty_requested"),
        })
        
        total_return_qty += qty_returned
    
    # Create return doc
    return_id = _uid()
    return_number = f"RTN-{delivery.get('delivery_number')}"
    
    return_doc = {
        "id": return_id,
        "return_number": return_number,
        "original_delivery_id": delivery_id,
        "original_delivery_number": delivery.get("delivery_number"),
        "order_id": delivery.get("order_id"),
        "order_number": delivery.get("order_number"),
        "customer_id": delivery.get("customer_id"),
        "customer_name": delivery.get("customer_name"),
        "return_date": body.get("return_date") or date.today().isoformat(),
        "return_reason": body.get("return_reason", ""),
        "items": validated_return_items,
        "total_qty": total_return_qty,
        "status": "draft",  # draft | confirmed | cancelled
        "notes": body.get("notes", ""),
        "created_at": _now(),
        "updated_at": _now(),
        "created_by": user.get("id"),
        "created_by_name": user.get("name", ""),
    }
    
    await db.rahaza_delivery_returns.insert_one(return_doc)
    await log_activity(user["id"], user.get("name", ""), "create_return", "rahaza.delivery_return", return_id)
    
    log.info(f"Return {return_number} created: {total_return_qty} pcs from delivery {delivery.get('delivery_number')}")
    
    return {
        "message": f"✅ Return delivery created! {total_return_qty} pcs akan dikembalikan ke inventory saat confirm.",
        "return": serialize_doc(return_doc),
    }


@router.post("/delivery-returns/{return_id}/confirm")
async def confirm_delivery_return(request: Request, return_id: str):
    """
    Confirm return delivery → FG stock bertambah kembali
    """
    user = await _require_admin(request)
    db = get_db()
    
    return_doc = await db.rahaza_delivery_returns.find_one({"id": return_id}, {"_id": 0})
    if not return_doc:
        raise HTTPException(404, "Return not found")
    
    if return_doc.get("status") != "draft":
        raise HTTPException(400, f"Return sudah {return_doc.get('status')}")
    
    # Get FG warehouse
    fg_location = await db.rahaza_locations.find_one({"code": "FG-WH"}, {"_id": 0})
    if not fg_location:
        raise HTTPException(500, "FG Warehouse not found")
    
    # Increment stock for each returned item
    items = return_doc.get("items", [])
    for item in items:
        fg_material_id = item.get("fg_material_id")
        qty = item.get("qty_returned", 0)
        fg_code = item.get("fg_code", "")
        
        # Increment stock (opposite of delivery out)
        await db.rahaza_material_stock.update_one(
            {"material_id": fg_material_id, "location_id": fg_location["id"]},
            {"$inc": {"qty": qty}, "$set": {"updated_at": _now()}},
        )
        
        # Log FG movement (positive = masuk kembali)
        await db.rahaza_fg_movements.insert_one({
            "id": _uid(),
            "fg_code": fg_code,
            "fg_material_id": fg_material_id,
            "return_id": return_id,
            "return_number": return_doc.get("return_number", ""),
            "original_delivery_id": return_doc.get("original_delivery_id"),
            "event_type": "delivery_return_in",
            "qty": qty,  # positive = masuk
            "location_id": fg_location["id"],
            "location_name": fg_location.get("name", ""),
            "timestamp": _now(),
            "created_by": user.get("id"),
            "created_by_name": user.get("name", ""),
            "notes": f"Return from delivery {return_doc.get('original_delivery_number')}. Reason: {return_doc.get('return_reason', 'N/A')}",
        })
    
    # Update return status
    await db.rahaza_delivery_returns.update_one(
        {"id": return_id},
        {"$set": {
            "status": "confirmed",
            "confirmed_at": _now(),
            "confirmed_by": user.get("id"),
            "confirmed_by_name": user.get("name", ""),
            "updated_at": _now(),
        }},
    )
    
    await log_activity(user["id"], user.get("name", ""), "confirm_return", "rahaza.delivery_return", return_id)
    
    log.info(f"Return {return_doc.get('return_number')} confirmed: {return_doc.get('total_qty')} pcs added back to FG inventory")
    
    return {
        "message": "✅ Return confirmed! FG inventory bertambah kembali.",
        "return_id": return_id,
        "return_number": return_doc.get("return_number", ""),
        "total_qty": return_doc.get("total_qty", 0),
        "status": "confirmed",
    }


@router.get("/delivery-returns")
async def list_delivery_returns(
    request: Request,
    delivery_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """List all delivery returns"""
    user = await require_auth(request)
    db = get_db()
    
    query = {}
    if delivery_id:
        query["original_delivery_id"] = delivery_id
    if status:
        query["status"] = status.lower()
    
    total = await db.rahaza_delivery_returns.count_documents(query)
    returns = await db.rahaza_delivery_returns.find(
        query, {"_id": 0}
    ).sort([("return_date", -1), ("created_at", -1)]).skip(offset).limit(limit).to_list(None)
    
    return {
        "items": [serialize_doc(r) for r in returns],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ────────────────────────────────────────────────────────────────────────────────
# ADVANCED FEATURE 3: PARTIAL DELIVERY dengan SPLIT WO
# ────────────────────────────────────────────────────────────────────────────────
@router.post("/work-orders/{wo_id}/split")
async def split_work_order(request: Request, wo_id: str):
    """
    Split WO menjadi beberapa sub-WO untuk partial delivery.
    
    Use case: WO besar (1000 pcs) ingin dikirim bertahap → split jadi 2 WO (500 + 500)
    
    Payload:
    {
      "splits": [
        {"qty": 500, "notes": "Split 1 - kirim dulu"},
        {"qty": 500, "notes": "Split 2 - kirim minggu depan"}
      ]
    }
    
    Logic:
    - Original WO status → "split" (tidak aktif lagi)
    - Create N new WOs (child) dengan qty masing-masing
    - Child WOs bisa di-deliver independently
    - Material reservation split proportionally
    """
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    
    # Get original WO
    wo = await db.rahaza_work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not wo:
        raise HTTPException(404, "Work Order not found")
    
    if wo.get("status") not in ["released", "in_production"]:
        raise HTTPException(400, f"WO status {wo.get('status')} tidak bisa di-split. Hanya 'released' atau 'in_production'.")
    
    if wo.get("is_split_child", False):
        raise HTTPException(400, "WO ini sudah hasil split. Tidak bisa di-split lagi.")
    
    # Get split config
    splits = body.get("splits", [])
    if len(splits) < 2:
        raise HTTPException(400, "Minimal 2 splits")
    
    total_split_qty = sum(int(s.get("qty", 0)) for s in splits)
    original_qty = int(wo.get("qty", 0))
    
    if total_split_qty != original_qty:
        raise HTTPException(400, f"Total split qty ({total_split_qty}) harus sama dengan WO original ({original_qty})")
    
    # Create child WOs
    child_wos = []
    for idx, split in enumerate(splits, 1):
        split_qty = int(split.get("qty", 0))
        if split_qty <= 0:
            raise HTTPException(400, "Qty split harus > 0")
        
        child_id = _uid()
        child_wo_number = f"{wo.get('wo_number')}-S{idx}"
        
        child_wo = {
            **wo,  # Copy semua field dari parent
            "id": child_id,
            "wo_number": child_wo_number,
            "qty": split_qty,
            "parent_wo_id": wo_id,
            "parent_wo_number": wo.get("wo_number"),
            "is_split_child": True,
            "split_index": idx,
            "split_notes": split.get("notes", ""),
            "status": "released",  # Reset to released
            "created_at": _now(),
            "updated_at": _now(),
            "split_created_by": user.get("id"),
            "split_created_by_name": user.get("name", ""),
        }
        
        # Remove fields yang tidak applicable untuk child
        child_wo.pop("completed_at", None)
        child_wo.pop("completed_by", None)
        
        await db.rahaza_work_orders.insert_one(child_wo)
        child_wos.append(child_wo)
        
        log.info(f"Child WO {child_wo_number} created: {split_qty} pcs (split from {wo.get('wo_number')})")
    
    # Update original WO status
    await db.rahaza_work_orders.update_one(
        {"id": wo_id},
        {"$set": {
            "status": "split",
            "split_at": _now(),
            "split_by": user.get("id"),
            "split_by_name": user.get("name", ""),
            "child_wo_ids": [c["id"] for c in child_wos],
            "updated_at": _now(),
        }},
    )
    
    # Split material reservation proportionally
    reservation = await db.rahaza_material_reservations.find_one({"work_order_id": wo_id}, {"_id": 0})
    if reservation:
        for child in child_wos:
            child_qty = child["qty"]
            ratio = child_qty / original_qty
            
            child_items = []
            for item in reservation.get("items", []):
                child_items.append({
                    **item,
                    "qty_reserved": item.get("qty_reserved", 0) * ratio,
                })
            
            child_reservation = {
                "id": _uid(),
                "work_order_id": child["id"],
                "work_order_number": child["wo_number"],
                "items": child_items,
                "status": "active",
                "created_at": _now(),
                "created_by": user.get("id"),
            }
            
            await db.rahaza_material_reservations.insert_one(child_reservation)
    
    await log_activity(user["id"], user.get("name", ""), "split_wo", "rahaza.work_order", wo_id)
    
    return {
        "message": f"✅ WO split successfully! {len(child_wos)} child WOs created.",
        "original_wo_id": wo_id,
        "original_wo_number": wo.get("wo_number"),
        "child_wos": [{"wo_number": c["wo_number"], "qty": c["qty"]} for c in child_wos],
    }


@router.get("/work-orders/{wo_id}/split-children")
async def get_split_children(request: Request, wo_id: str):
    """Get all child WOs from a split parent"""
    user = await require_auth(request)
    db = get_db()
    
    wo = await db.rahaza_work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not wo:
        raise HTTPException(404, "Work Order not found")
    
    if wo.get("status") != "split":
        return {"is_split": False, "children": []}
    
    child_ids = wo.get("child_wo_ids", [])
    children = await db.rahaza_work_orders.find(
        {"id": {"$in": child_ids}}, {"_id": 0}
    ).to_list(None)
    
    return {
        "is_split": True,
        "parent_wo": {
            "wo_number": wo.get("wo_number"),
            "original_qty": wo.get("qty"),
            "split_at": wo.get("split_at"),
        },
        "children": [serialize_doc(c) for c in children],
    }

