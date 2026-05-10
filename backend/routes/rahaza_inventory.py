"""
PT Rahaza — Inventory (Fase 7)

Endpoints (prefix /api/rahaza):
  Master:
    - GET/POST/PUT/DELETE /materials
  Stock:
    - GET  /material-stock?material_id=&location_id=&type=
    - GET  /material-stock/summary  → totals per type
  Operations:
    - POST /material-receive           body: {material_id, location_id, qty, notes}
    - POST /material-transfer          body: {material_id, from_location_id, to_location_id, qty, notes}
    - POST /material-adjust            body: {material_id, location_id, qty, reason}  (qty +/-)
    - GET  /material-movements?...     ledger (paged)
  Material Issue (link WO):
    - GET  /material-issues?work_order_id=&status=
    - GET  /material-issues/{id}
    - POST /material-issues/draft-from-wo  body: {work_order_id, default_location_id?}
          → auto-fill items dari BOM snapshot WO (qty_required = bom_qty × wo.qty)
    - POST /material-issues                body: manual create
    - PUT  /material-issues/{id}           edit draft
    - POST /material-issues/{id}/confirm   body: {location_overrides?: {material_id: loc_id}}
          → reduce stock + log movement + status=issued. Fail fast jika stok kurang.
    - DELETE /material-issues/{id}         (draft/cancelled only)
    - POST /material-issues/{id}/cancel    (draft only)

Stock keeping: rahaza_material_stock (material_id, location_id) unique.
Movements ledger: rahaza_material_movements.
"""
from fastapi import APIRouter, Request, HTTPException
from database import get_db
from auth import require_auth, serialize_doc, log_activity
import uuid
import logging
from datetime import datetime, timezone, date
from typing import Optional

from routes.rahaza_posting import (
    post_inventory_receive,
    post_inventory_issue,
    post_inventory_adjust,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rahaza", tags=["rahaza-inventory"])


def _uid(): return str(uuid.uuid4())
def _now(): return datetime.now(timezone.utc)


MATERIAL_TYPES = ["yarn", "accessory", "fg", "packaging"]
MATERIAL_UNITS = ["kg", "pcs", "m", "set", "pair", "gram"]


async def _require_admin(request: Request):
    user = await require_auth(request)
    role = (user.get("role") or "").lower()
    if role in ("superadmin", "admin", "owner"):
        return user
    perms = user.get("_permissions") or []
    if "*" in perms or "inventory.manage" in perms or "warehouse.manage" in perms:
        return user
    raise HTTPException(403, "Forbidden: butuh permission inventory / warehouse.")


async def _ensure_stock_row(db, material_id: str, location_id: str):
    existing = await db.rahaza_material_stock.find_one({"material_id": material_id, "location_id": location_id})
    if existing:
        return existing
    doc = {
        "id": _uid(),
        "material_id": material_id, "location_id": location_id,
        "qty": 0.0,
        "updated_at": _now(),
    }
    await db.rahaza_material_stock.insert_one(doc)
    return doc


async def _add_stock(db, material_id: str, location_id: str, delta: float):
    await _ensure_stock_row(db, material_id, location_id)
    await db.rahaza_material_stock.update_one(
        {"material_id": material_id, "location_id": location_id},
        {"$inc": {"qty": float(delta)}, "$set": {"updated_at": _now()}},
    )
    # Phase 12.2 — Low stock trigger (only when delta < 0, i.e. stock is decreasing)
    if delta < 0:
        try:
            await _check_low_stock_alert(db, material_id)
        except Exception as e:
            # Never break core flow because of notification side-effect
            import logging
            logging.getLogger(__name__).warning(f"Low-stock alert check failed: {e}")


async def _check_low_stock_alert(db, material_id: str):
    """Setelah stok berkurang, cek total qty semua lokasi < min_stock → alert."""
    mat = await db.rahaza_materials.find_one({"id": material_id}, {"_id": 0})
    if not mat:
        return
    min_stock = float(mat.get("min_stock") or 0)
    if min_stock <= 0:
        return  # material tanpa min_stock tidak di-monitor

    rows = await db.rahaza_material_stock.find(
        {"material_id": material_id}, {"_id": 0, "qty": 1}
    ).to_list(None)
    total = sum(float(r.get("qty") or 0) for r in rows)

    if total < min_stock:
        from routes.rahaza_notifications import publish_notification
        await publish_notification(
            db,
            type_="low_stock",
            severity="warning" if total > min_stock * 0.5 else "error",
            title=f"Stok {mat.get('name', '')} di bawah minimum",
            message=f"Stok total {total:.1f} {mat.get('unit', '')} < min {min_stock:.1f}. Segera reorder.",
            link_module="wh-stock",
            link_id=material_id,
            target_roles=["warehouse_manager", "production_manager", "superadmin"],
            dedup_key=f"low_stock::{material_id}",
        )


async def _log_movement(db, user, **fields):
    # B6 Fix: use created_at as canonical timestamp (+ keep timestamp for backward compat)
    ts = _now()
    doc = {
        "id": _uid(), "created_at": ts, "timestamp": ts,
        "created_by": user["id"], "created_by_name": user.get("name", ""),
        **fields,
    }
    await db.rahaza_material_movements.insert_one(doc)
    return doc


# ── MATERIALS MASTER ──────────────────────────────────────────────────────────────
@router.get("/materials")
async def list_materials(request: Request, type: Optional[str] = None, search: Optional[str] = None,
                         low_stock: Optional[str] = None, include_inactive: Optional[str] = None):
    await require_auth(request)
    db = get_db()
    q = {}
    # B8 Fix: default to active-only; pass ?include_inactive=true to see all
    if not (include_inactive and include_inactive.lower() == "true"):
        q["active"] = True
    if type:
        if type not in MATERIAL_TYPES: raise HTTPException(400, f"type harus: {MATERIAL_TYPES}")
        q["type"] = type
    if search:
        import re
        pattern = re.compile(re.escape(search), re.IGNORECASE)
        q["$or"] = [{"code": pattern}, {"name": pattern}]
    rows = await db.rahaza_materials.find(q, {"_id": 0}).sort([("type", 1), ("code", 1)]).to_list(None)
    
    # Sprint 3.4: Add low_stock filter — join with stock data
    if low_stock and low_stock.lower() == "true":
        # Get current stock quantities for all materials
        stock_docs = await db.rahaza_material_stock.find({}, {"_id": 0}).to_list(None)
        stock_by_mat = {}
        for s in stock_docs:
            mid = s.get("material_id")
            if mid:
                stock_by_mat[mid] = stock_by_mat.get(mid, 0) + float(s.get("qty") or 0)  # B2 Fix: field is "qty" not "quantity"
        
        low_rows = []
        for m in rows:
            mid = m.get("id")
            current_qty = stock_by_mat.get(mid, 0)
            min_qty = m.get("min_stock_qty")
            min_pct = m.get("min_stock_percentage")
            min_legacy = m.get("min_stock", 0)
            is_low = False
            if min_qty and current_qty < float(min_qty):
                is_low = True
            elif min_pct:
                # Use max historical as baseline if available
                baseline = float(m.get("max_historical_qty") or (min_qty or 100))
                threshold = baseline * (float(min_pct) / 100)
                if current_qty < threshold:
                    is_low = True
            elif min_legacy and current_qty < float(min_legacy):
                is_low = True
            if is_low:
                m["current_qty"] = current_qty
                m["is_low_stock"] = True
                low_rows.append(m)
        rows = low_rows
    
    return serialize_doc(rows)


@router.get("/materials/reorder-alerts")
async def list_reorder_alerts(request: Request):
    """U8: Returns materials where total qty < reorder_point."""
    await require_auth(request)
    db = get_db()
    stock_docs = await db.rahaza_material_stock.find({}, {"_id": 0}).to_list(None)
    stock_by_mat = {}
    for s in stock_docs:
        mid = s.get("material_id")
        if mid:
            stock_by_mat[mid] = stock_by_mat.get(mid, 0) + float(s.get("qty") or 0)
    mats = await db.rahaza_materials.find({"active": True, "reorder_point": {"$gt": 0}}, {"_id": 0}).to_list(None)
    alerts = []
    for m in mats:
        current = stock_by_mat.get(m["id"], 0)
        rp = float(m.get("reorder_point") or 0)
        if current < rp:
            alerts.append({**m, "current_qty": current, "shortage": round(rp - current, 2)})
    return serialize_doc(alerts)


@router.post("/materials")
async def create_material(request: Request):
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    code = (body.get("code") or "").strip().upper()
    name = (body.get("name") or "").strip()
    t    = (body.get("type") or "").strip().lower()
    unit = (body.get("unit") or "").strip().lower()
    if not code or not name:
        raise HTTPException(400, "code & name wajib diisi.")
    if t not in MATERIAL_TYPES:
        raise HTTPException(400, f"type harus salah satu: {MATERIAL_TYPES}")
    if unit not in MATERIAL_UNITS:
        raise HTTPException(400, f"unit harus salah satu: {MATERIAL_UNITS}")
    if await db.rahaza_materials.find_one({"code": code, "active": True}):
        raise HTTPException(409, f"Kode '{code}' sudah terpakai.")
    doc = {
        "id": _uid(), "code": code, "name": name,
        "type": t, "unit": unit,
        "yarn_type": (body.get("yarn_type") or "").strip(),
        "color": (body.get("color") or "").strip(),
        "notes": body.get("notes") or "",
        "min_stock": float(body.get("min_stock") or 0),
        "min_stock_qty": float(body["min_stock_qty"]) if body.get("min_stock_qty") not in (None, "") else None,
        "min_stock_percentage": float(body["min_stock_percentage"]) if body.get("min_stock_percentage") not in (None, "") else None,
        "reorder_point": float(body.get("reorder_point") or 0),  # U8: reorder alert threshold
        "reorder_qty": float(body.get("reorder_qty") or 0),  # U8: suggested reorder quantity
        "unit_cost": float(body.get("unit_cost") or 0),  # B1: unit cost for costing link
        "active": True,
        "created_at": _now(), "updated_at": _now(),
    }
    await db.rahaza_materials.insert_one(doc)
    await log_activity(user["id"], user.get("name", ""), "create", "rahaza.material", code)
    return serialize_doc(doc)


@router.post("/materials/quick-add")
async def quick_add_material(request: Request):
    """Quick add material from Wizard/Material Planning modal - accessible by all users."""
    user = await require_auth(request)  # Allow any authenticated user
    db = get_db()
    body = await request.json()
    
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Nama material wajib diisi")
    
    # Auto-generate code if not provided
    code = body.get("code")
    if not code:
        # Generate code: MAT-XXXXXXXX (8 random chars)
        import uuid
        code = f"MAT-{uuid.uuid4().hex[:8].upper()}"
    else:
        code = code.strip().upper()
    
    # Check duplicate
    if await db.rahaza_materials.find_one({"code": code, "active": True}):
        raise HTTPException(409, f"Kode '{code}' sudah terpakai")
    
    t = (body.get("type") or "yarn").strip().lower()
    unit = (body.get("unit") or "kg").strip().lower()
    
    # Validate type and unit
    if t not in MATERIAL_TYPES:
        t = "yarn"  # Default to yarn
    if unit not in MATERIAL_UNITS:
        unit = "kg"  # Default to kg
    
    doc = {
        "id": _uid(),
        "code": code,
        "name": name,
        "type": t,
        "unit": unit,
        "yarn_type": "",
        "color": body.get("color", "").strip(),
        "notes": body.get("notes") or f"Dibuat via Production Wizard oleh {user.get('name', 'User')}",
        "min_stock": 0,
        "min_stock_qty": None,
        "min_stock_percentage": None,
        "reorder_point": 0,
        "reorder_qty": 0,
        "unit_cost": 0,
        "active": True,
        "created_at": _now(),
        "updated_at": _now(),
    }
    
    await db.rahaza_materials.insert_one(doc)
    await log_activity(user["id"], user.get("name", ""), "create", "rahaza.material", code)
    return serialize_doc(doc)



@router.put("/materials/{mid}")
async def update_material(mid: str, request: Request):
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    body.pop("_id", None); body.pop("id", None); body.pop("created_at", None)
    body["updated_at"] = _now()
    if "code" in body: body["code"] = body["code"].strip().upper()
    if "type" in body and body["type"] not in MATERIAL_TYPES:
        raise HTTPException(400, f"type harus: {MATERIAL_TYPES}")
    if "unit" in body and body["unit"] not in MATERIAL_UNITS:
        raise HTTPException(400, f"unit harus: {MATERIAL_UNITS}")
    
    # Sprint 3.4: Support configurable low stock thresholds
    if "min_stock_qty" in body:
        body["min_stock_qty"] = float(body["min_stock_qty"]) if body["min_stock_qty"] else None
    if "min_stock_percentage" in body:
        body["min_stock_percentage"] = float(body["min_stock_percentage"]) if body["min_stock_percentage"] else None
    
    res = await db.rahaza_materials.update_one({"id": mid}, {"$set": body})
    if res.matched_count == 0: raise HTTPException(404, "Material tidak ditemukan.")
    await log_activity(user["id"], user.get("name", ""), "update", "rahaza.material", mid)
    return serialize_doc(await db.rahaza_materials.find_one({"id": mid}, {"_id": 0}))


@router.delete("/materials/{mid}")
async def deactivate_material(mid: str, request: Request):
    user = await _require_admin(request)
    db = get_db()
    await db.rahaza_materials.update_one({"id": mid}, {"$set": {"active": False, "updated_at": _now()}})
    return {"status": "deactivated"}


# ── STOCK ─────────────────────────────────────────────────────────────────────────────
@router.get("/material-stock")
async def list_stock(request: Request, material_id: Optional[str] = None, location_id: Optional[str] = None, type: Optional[str] = None):
    await require_auth(request)
    db = get_db()
    stock_q = {}
    if material_id: stock_q["material_id"] = material_id
    if location_id: stock_q["location_id"] = location_id
    stocks = await db.rahaza_material_stock.find(stock_q, {"_id": 0}).to_list(None)
    # Enrich
    m_ids = list({s["material_id"] for s in stocks})
    l_ids = list({s["location_id"] for s in stocks})
    mats = await db.rahaza_materials.find({"id": {"$in": m_ids}}, {"_id": 0}).to_list(None) if m_ids else []
    locs = await db.rahaza_locations.find({"id": {"$in": l_ids}}, {"_id": 0}).to_list(None) if l_ids else []
    m_map = {m["id"]: m for m in mats}
    l_map = {l["id"]: l for l in locs}
    rows = []
    for s in stocks:
        m = m_map.get(s["material_id"]) or {}
        l = l_map.get(s["location_id"]) or {}
        if type and m.get("type") != type: continue
        
        # Sprint 3.4: Calculate low stock status based on configurable thresholds
        current_qty = float(s.get("qty", 0))
        is_low_stock = False
        low_stock_reason = None
        
        # Check min_stock_qty (fixed quantity threshold)
        min_stock_qty = m.get("min_stock_qty")
        if min_stock_qty and current_qty < min_stock_qty:
            is_low_stock = True
            low_stock_reason = f"Below min qty: {current_qty} < {min_stock_qty}"
        
        # Check min_stock_percentage (percentage of max/avg historical usage)
        # For now, use simple percentage of a baseline (can be enhanced later with historical data)
        min_stock_pct = m.get("min_stock_percentage")
        if min_stock_pct and not is_low_stock:
            # Assume a baseline max stock (e.g., 1000 units) - can be made dynamic
            baseline_max = 1000  # TODO: Calculate from historical data
            threshold_qty = baseline_max * (min_stock_pct / 100)
            if current_qty < threshold_qty:
                is_low_stock = True
                low_stock_reason = f"Below {min_stock_pct}% threshold: {current_qty} < {threshold_qty:.0f}"
        
        # Backward compatibility: check legacy min_stock field
        if not is_low_stock and m.get("min_stock"):
            if current_qty < m.get("min_stock"):
                is_low_stock = True
                low_stock_reason = f"Below legacy min_stock: {current_qty} < {m.get('min_stock')}"
        
        rows.append({
            **s,
            "material_code": m.get("code"), "material_name": m.get("name"),
            "material_type": m.get("type"), "unit": m.get("unit"),
            "min_stock": m.get("min_stock", 0),
            "min_stock_qty": m.get("min_stock_qty"),
            "min_stock_percentage": m.get("min_stock_percentage"),
            "location_code": l.get("code"), "location_name": l.get("name"),
            "below_min": is_low_stock,  # Sprint 3.4: Enhanced low stock detection
            "low_stock_reason": low_stock_reason,
        })
    rows.sort(key=lambda r: (r.get("material_type") or "", r.get("material_code") or "", r.get("location_code") or ""))
    return serialize_doc(rows)


@router.get("/material-stock/near-expiry")
async def list_near_expiry(request: Request, days: int = 30):
    """U7: Returns material receives with expiry_date within next `days` days."""
    await require_auth(request)
    db = get_db()
    from datetime import timedelta
    cutoff = _now() + timedelta(days=days)
    # Query movements of type 'receive' with an expiry_date set
    mvs = await db.rahaza_material_movements.find(
        {"type": "receive", "expiry_date": {"$exists": True, "$ne": None, "$lte": cutoff.isoformat()}},
        {"_id": 0}
    ).sort("expiry_date", 1).limit(50).to_list(None)
    # Enrich with material code
    m_ids = list({m["material_id"] for m in mvs if m.get("material_id")})
    mats = await db.rahaza_materials.find({"id": {"$in": m_ids}}, {"_id": 0}).to_list(None) if m_ids else []
    m_map = {m["id"]: m for m in mats}
    for mv in mvs:
        mat = m_map.get(mv.get("material_id")) or {}
        mv["material_code"] = mat.get("code")
        mv["material_name"] = mat.get("name")
        mv["unit"] = mat.get("unit")
    return serialize_doc(mvs)


async def stock_summary(request: Request):
    await require_auth(request)
    db = get_db()
    # Aggregate per type
    pipe = [
        {"$lookup": {"from": "rahaza_materials", "localField": "material_id", "foreignField": "id", "as": "mat"}},
        {"$unwind": "$mat"},
        {"$group": {"_id": "$mat.type", "total_qty": {"$sum": "$qty"}, "count": {"$sum": 1}}},
    ]
    rows = await db.rahaza_material_stock.aggregate(pipe).to_list(None)
    by_type = {r["_id"]: {"total_qty": r["total_qty"], "row_count": r["count"]} for r in rows}
    low = await db.rahaza_material_stock.count_documents({})  # placeholder
    # Low stock: need to join to materials; do in python
    stocks = await db.rahaza_material_stock.find({}, {"_id": 0}).to_list(None)
    mats_raw = await db.rahaza_materials.find({}, {"_id": 0}).to_list(None)
    mat_by_id = {m["id"]: m for m in mats_raw}
    # Aggregate per material (sum across locations) then compare to min_stock
    total_by_mat = {}
    for s in stocks:
        total_by_mat[s["material_id"]] = total_by_mat.get(s["material_id"], 0) + float(s.get("qty") or 0)
    low_materials = []
    for mid, total in total_by_mat.items():
        m = mat_by_id.get(mid)
        if not m: continue
        if m.get("min_stock") and total < float(m["min_stock"]):
            low_materials.append({"material_id": mid, "material_code": m["code"], "name": m["name"], "type": m["type"], "unit": m["unit"], "qty": total, "min_stock": m["min_stock"]})
    return {
        "by_type": by_type,
        "low_stock_count": len(low_materials),
        "low_materials": low_materials,
    }


# ── MOVEMENT LEDGER ─────────────────────────────────────────────────────────────
@router.get("/material-movements")
async def list_movements(request: Request, material_id: Optional[str] = None, limit: int = 100):
    await require_auth(request)
    db = get_db()
    q = {}
    if material_id: q["material_id"] = material_id
    rows = await db.rahaza_material_movements.find(q, {"_id": 0}).sort("created_at", -1).limit(int(limit)).to_list(None)  # B6 Fix: sort by created_at
    # Enrich
    m_ids = list({r["material_id"] for r in rows if r.get("material_id")})
    loc_ids = list({x for r in rows for x in (r.get("from_location_id"), r.get("to_location_id")) if x})
    mats = await db.rahaza_materials.find({"id": {"$in": m_ids}}, {"_id": 0}).to_list(None) if m_ids else []
    locs = await db.rahaza_locations.find({"id": {"$in": loc_ids}}, {"_id": 0}).to_list(None) if loc_ids else []
    l_map = {l["id"]: l for l in locs}
    # B10 Fix: fallback lookup in warehouse_locations for IDs not found in rahaza_locations
    missing_ids = [lid for lid in loc_ids if lid not in l_map]
    if missing_ids:
        wh_locs = await db.warehouse_locations.find({"id": {"$in": missing_ids}}, {"_id": 0}).to_list(None)
        for wl in wh_locs:
            l_map[wl["id"]] = wl
    m_map = {m["id"]: m for m in mats}
    for r in rows:
        m = m_map.get(r.get("material_id")) or {}
        r["material_code"] = m.get("code"); r["material_name"] = m.get("name"); r["unit"] = m.get("unit")
        r["from_location_name"] = (l_map.get(r.get("from_location_id")) or {}).get("name")
        r["to_location_name"]   = (l_map.get(r.get("to_location_id")) or {}).get("name")
    return serialize_doc(rows)


# ── OPERATIONS ──────────────────────────────────────────────────────────────────────
@router.post("/material-receive")
async def material_receive(request: Request):
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    material_id = body.get("material_id"); location_id = body.get("location_id")
    qty = float(body.get("qty") or 0)
    if not (material_id and location_id) or qty <= 0:
        raise HTTPException(400, "material_id, location_id, qty(>0) wajib diisi.")
    if not await db.rahaza_materials.find_one({"id": material_id}):
        raise HTTPException(404, "Material tidak ditemukan.")
    if not await db.rahaza_locations.find_one({"id": location_id}):
        raise HTTPException(404, "Location tidak ditemukan.")
    await _add_stock(db, material_id, location_id, qty)
    mv = await _log_movement(db, user,
        type="receive", material_id=material_id, qty=qty,
        unit_cost=float(body.get("unit_cost") or 0),
        from_location_id=None, to_location_id=location_id,
        ref_type=body.get("ref_type") or "receiving", ref_id=body.get("ref_id") or None,
        notes=body.get("notes") or "",
        lot_number=body.get("lot_number") or None,
        expiry_date=body.get("expiry_date") or None,
    )
    await log_activity(user["id"], user.get("name", ""), f"receive:{qty}", "rahaza.material", material_id)

    # ── F3 Auto-post (Dr Inventory RM / Cr AP clearing)
    posting_result = None
    try:
        posting_result = await post_inventory_receive(db, mv, user)
    except Exception as e:
        log.exception("Inventory receive auto-post failed")
        posting_result = {"ok": False, "error": str(e)}
    mv_refresh = await db.rahaza_material_movements.find_one({"id": mv["id"]}, {"_id": 0})
    mv_refresh["_posting_result"] = posting_result
    return serialize_doc(mv_refresh)


@router.post("/material-transfer")
async def material_transfer(request: Request):
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    material_id = body.get("material_id")
    from_loc = body.get("from_location_id"); to_loc = body.get("to_location_id")
    qty = float(body.get("qty") or 0)
    if not (material_id and from_loc and to_loc) or qty <= 0:
        raise HTTPException(400, "material_id, from_location_id, to_location_id, qty(>0) wajib.")
    if from_loc == to_loc:
        raise HTTPException(400, "Lokasi asal dan tujuan tidak boleh sama.")
    # Check stock availability
    src = await db.rahaza_material_stock.find_one({"material_id": material_id, "location_id": from_loc})
    if not src or float(src.get("qty") or 0) < qty:
        raise HTTPException(400, f"Stok tidak cukup di lokasi asal (tersedia: {float((src or {}).get('qty') or 0)}).")
    await _add_stock(db, material_id, from_loc, -qty)
    await _add_stock(db, material_id, to_loc,    qty)
    mv = await _log_movement(db, user,
        type="transfer", material_id=material_id, qty=qty,
        from_location_id=from_loc, to_location_id=to_loc,
        ref_type="transfer", ref_id=None, notes=body.get("notes") or "",
    )
    return serialize_doc(mv)


@router.post("/material-adjust")
async def material_adjust(request: Request):
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    material_id = body.get("material_id"); location_id = body.get("location_id")
    delta = float(body.get("qty") or 0)  # can be negative
    reason = body.get("reason") or ""
    if not (material_id and location_id) or delta == 0:
        raise HTTPException(400, "material_id, location_id, qty (≠0) wajib.")
    # Avoid negative stock
    cur = await db.rahaza_material_stock.find_one({"material_id": material_id, "location_id": location_id}) or {"qty": 0}
    if float(cur.get("qty") or 0) + delta < 0:
        raise HTTPException(400, "Penyesuaian akan membuat stok negatif.")
    await _add_stock(db, material_id, location_id, delta)
    mv = await _log_movement(db, user,
        type="adjust", material_id=material_id, qty=delta,
        from_location_id=None, to_location_id=location_id,
        ref_type="adjustment", ref_id=None, notes=reason,
    )
    # ── F3 Auto-post
    posting_result = None
    try:
        posting_result = await post_inventory_adjust(db, mv, user)
    except Exception as e:
        log.exception("Inventory adjust auto-post failed")
        posting_result = {"ok": False, "error": str(e)}
    mv_refresh = await db.rahaza_material_movements.find_one({"id": mv["id"]}, {"_id": 0})
    mv_refresh["_posting_result"] = posting_result
    return serialize_doc(mv_refresh)


# ── MATERIAL ISSUES (link WO) ────────────────────────────────────────────────────
async def _gen_mi_number(db):
    today = date.today().strftime("%Y%m%d")
    prefix = f"MI-{today}"
    count = await db.rahaza_material_issues.count_documents({"mi_number": {"$regex": f"^{prefix}"}})
    return f"{prefix}-{count+1:03d}"


async def _enrich_mi(db, mi):
    if not mi: return mi
    # Material names
    m_ids = list({it["material_id"] for it in (mi.get("items") or []) if it.get("material_id")})
    loc_ids = list({it["location_id"] for it in (mi.get("items") or []) if it.get("location_id")})
    mats = await db.rahaza_materials.find({"id": {"$in": m_ids}}, {"_id": 0}).to_list(None) if m_ids else []
    locs = await db.rahaza_locations.find({"id": {"$in": loc_ids}}, {"_id": 0}).to_list(None) if loc_ids else []
    m_map = {m["id"]: m for m in mats}; l_map = {l["id"]: l for l in locs}
    for it in (mi.get("items") or []):
        m = m_map.get(it.get("material_id")) or {}
        l = l_map.get(it.get("location_id")) or {}
        it["material_code"] = m.get("code"); it["material_name"] = m.get("name"); it["unit"] = m.get("unit"); it["material_type"] = m.get("type")
        it["location_code"] = l.get("code"); it["location_name"] = l.get("name")
    return mi


def _norm_mi_items(raw_items):
    cleaned = []
    for it in raw_items or []:
        mid = it.get("material_id")
        qty_req = float(it.get("qty_required") or 0)
        if not mid or qty_req <= 0: continue
        cleaned.append({
            "id": it.get("id") or _uid(),
            "material_id": mid,
            "qty_required": round(qty_req, 4),
            "qty_issued":   round(float(it.get("qty_issued") or 0), 4),
            "location_id":  it.get("location_id") or None,
            "notes":        it.get("notes") or "",
        })
    return cleaned


@router.get("/material-issues")
async def list_mis(request: Request, work_order_id: Optional[str] = None, status: Optional[str] = None, limit: int = 200, skip: int = 0):
    await require_auth(request)
    db = get_db()
    q = {}
    if work_order_id: q["work_order_id"] = work_order_id
    if status: q["status"] = status
    rows = await db.rahaza_material_issues.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(None)
    for mi in rows:
        await _enrich_mi(db, mi)
        mi["item_count"] = len(mi.get("items") or [])
        mi["total_required"] = round(sum(float(i.get("qty_required") or 0) for i in (mi.get("items") or [])), 4)
    return serialize_doc(rows)


@router.get("/material-issues/{mid}")
async def get_mi(mid: str, request: Request):
    await require_auth(request)
    db = get_db()
    mi = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    if not mi: raise HTTPException(404, "MI tidak ditemukan.")
    await _enrich_mi(db, mi)
    return serialize_doc(mi)


@router.post("/material-issues/draft-from-wo")
async def draft_mi_from_wo(request: Request):
    """Buat draft MI berdasarkan BOM snapshot pada WO. qty_required = bom_qty × wo.qty."""
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    wo_id = body.get("work_order_id")
    default_loc = body.get("default_location_id") or None
    if not wo_id:
        raise HTTPException(400, "work_order_id wajib diisi.")
    wo = await db.rahaza_work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not wo:
        raise HTTPException(404, "WO tidak ditemukan.")
    snap = wo.get("bom_snapshot") or {}
    yarns = snap.get("yarn_materials") or []
    accs  = snap.get("accessory_materials") or []
    if not yarns and not accs:
        raise HTTPException(400, "WO tidak punya BOM snapshot. Pastikan BOM sudah diisi sebelum generate WO.")
    wo_qty = float(wo.get("qty") or 0)

    # Lookup/auto-create materials by code for each BOM entry
    items = []
    missing_codes = []
    for y in yarns:
        code = (y.get("code") or "").strip().upper()
        if not code:
            missing_codes.append(f"yarn:{y.get('name')}")
            continue
        mat = await db.rahaza_materials.find_one({"code": code, "active": True}, {"_id": 0})
        if not mat:
            # Auto-create material (skeleton) so user bisa terima stok nanti
            mat = {
                "id": _uid(), "code": code, "name": y.get("name") or code,
                "type": "yarn", "unit": "kg",
                "yarn_type": y.get("yarn_type") or "", "color": "",
                "notes": "Auto-created from WO BOM", "min_stock": 0,
                "active": True, "created_at": _now(), "updated_at": _now(),
            }
            await db.rahaza_materials.insert_one(mat)
        items.append({
            "id": _uid(), "material_id": mat["id"],
            "qty_required": round(float(y.get("qty_kg") or 0) * wo_qty, 4),
            "qty_issued": 0, "location_id": default_loc, "notes": y.get("notes") or "",
        })
    for a in accs:
        code = (a.get("code") or "").strip().upper()
        if not code:
            missing_codes.append(f"acc:{a.get('name')}")
            continue
        mat = await db.rahaza_materials.find_one({"code": code, "active": True}, {"_id": 0})
        if not mat:
            mat = {
                "id": _uid(), "code": code, "name": a.get("name") or code,
                "type": "accessory", "unit": (a.get("unit") or "pcs").lower(),
                "yarn_type": "", "color": "",
                "notes": "Auto-created from WO BOM", "min_stock": 0,
                "active": True, "created_at": _now(), "updated_at": _now(),
            }
            await db.rahaza_materials.insert_one(mat)
        items.append({
            "id": _uid(), "material_id": mat["id"],
            "qty_required": round(float(a.get("qty") or 0) * wo_qty, 4),
            "qty_issued": 0, "location_id": default_loc, "notes": a.get("notes") or "",
        })

    if not items:
        raise HTTPException(400, "BOM snapshot kosong (tidak ada material dengan kode).")

    doc = {
        "id": _uid(),
        "mi_number": await _gen_mi_number(db),
        "work_order_id": wo_id,
        "wo_number_snapshot": wo.get("wo_number"),
        "model_id": wo.get("model_id"), "size_id": wo.get("size_id"),
        "qty_wo_pcs": int(wo_qty),
        "items": items,
        "status": "draft",
        "notes": body.get("notes") or "",
        "missing_codes": missing_codes,
        "created_by": user["id"], "created_by_name": user.get("name", ""),
        "created_at": _now(), "updated_at": _now(),
    }
    await db.rahaza_material_issues.insert_one(doc)
    await log_activity(user["id"], user.get("name", ""), "draft_from_wo", "rahaza.mi", doc["mi_number"])
    await _enrich_mi(db, doc)
    return serialize_doc(doc)


@router.post("/material-issues")
async def create_mi_manual(request: Request):
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    items = _norm_mi_items(body.get("items"))
    if not items:
        raise HTTPException(400, "Minimal 1 item material.")
    doc = {
        "id": _uid(),
        "mi_number": await _gen_mi_number(db),
        "work_order_id": body.get("work_order_id") or None,
        "wo_number_snapshot": body.get("wo_number_snapshot") or "",
        "model_id": body.get("model_id") or None,
        "size_id":  body.get("size_id") or None,
        "qty_wo_pcs": int(body.get("qty_wo_pcs") or 0),
        "items": items,
        "status": "draft",
        "notes": body.get("notes") or "",
        "created_by": user["id"], "created_by_name": user.get("name", ""),
        "created_at": _now(), "updated_at": _now(),
    }
    await db.rahaza_material_issues.insert_one(doc)
    await log_activity(user["id"], user.get("name", ""), "create", "rahaza.mi", doc["mi_number"])
    await _enrich_mi(db, doc)
    return serialize_doc(doc)


@router.put("/material-issues/{mid}")
async def update_mi(mid: str, request: Request):
    user = await _require_admin(request)
    db = get_db()
    mi = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    if not mi: raise HTTPException(404, "MI tidak ditemukan.")
    if mi.get("status") != "draft":
        raise HTTPException(400, f"Hanya MI Draft yang bisa diedit.")
    body = await request.json()
    upd = {"updated_at": _now()}
    if "items" in body:
        items = _norm_mi_items(body["items"])
        if not items: raise HTTPException(400, "Minimal 1 item material.")
        upd["items"] = items
    if "notes" in body: upd["notes"] = body["notes"]
    await db.rahaza_material_issues.update_one({"id": mid}, {"$set": upd})
    out = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    await _enrich_mi(db, out)
    return serialize_doc(out)


# ── Sprint 2.2: MI Approval Workflow ────────────────────────────────────────

async def _require_mi_approver(request: Request):
    """Require manager, owner, ppic, or warehouse_manager for MI approval."""
    user = await require_auth(request)
    role = (user.get("role") or "").lower()
    if role in ("superadmin", "owner", "manager", "ppic", "warehouse_manager", "production_manager"):
        return user
    perms = user.get("_permissions") or []
    if "*" in perms or "inventory.approve" in perms or "warehouse.approve" in perms:
        return user
    raise HTTPException(403, "Forbidden: hanya Manager/PPIC/Warehouse Manager yang boleh approve MI.")


@router.post("/material-issues/{mid}/submit")
async def submit_mi(mid: str, request: Request):
    """Submit MI for approval (draft → pending_approval)."""
    user = await _require_admin(request)
    db = get_db()
    mi = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    if not mi:
        raise HTTPException(404, "MI tidak ditemukan.")
    if mi.get("status") not in ("draft", "rejected"):
        raise HTTPException(400, f"Hanya MI Draft/Rejected yang bisa diajukan. Status: {mi.get('status')}")
    
    # Validate semua item punya location
    missing = [it for it in (mi.get("items") or []) if not it.get("location_id")]
    if missing:
        raise HTTPException(400, f"{len(missing)} item belum punya lokasi. Set lokasi dulu sebelum submit.")
    
    await db.rahaza_material_issues.update_one(
        {"id": mid},
        {
            "$set": {
                "status": "pending_approval",
                "submitted_at": _now(),
                "submitted_by": user["id"],
                "updated_at": _now(),
            }
        }
    )
    await log_activity(user["id"], user.get("name", ""), "submit", "rahaza.mi", mi["mi_number"])
    out = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    await _enrich_mi(db, out)
    return serialize_doc(out)


@router.post("/material-issues/{mid}/approve")
async def approve_mi(mid: str, request: Request):
    """Approve MI (pending_approval → approved, then execute issue)."""
    user = await _require_mi_approver(request)
    db = get_db()
    mi = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    if not mi:
        raise HTTPException(404, "MI tidak ditemukan.")
    if mi.get("status") != "pending_approval":
        raise HTTPException(400, f"Hanya MI Pending Approval yang bisa di-approve. Status: {mi.get('status')}")
    
    # Record approval
    await db.rahaza_material_issues.update_one(
        {"id": mid},
        {
            "$set": {
                "approved_at": _now(),
                "approved_by": user["id"],
                "approved_by_name": user.get("name", ""),
                "updated_at": _now(),
            }
        }
    )
    
    # Execute issue (same logic as old confirm, but after approval)
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    loc_overrides = body.get("location_overrides") or {}
    
    # 1) Resolve per-item location & validate stock
    plan = []
    shortages = []
    for it in (mi.get("items") or []):
        loc = loc_overrides.get(it["material_id"]) or it.get("location_id")
        if not loc:
            raise HTTPException(400, f"Item belum punya lokasi: material {it.get('material_id')}.")
        qty = float(it.get("qty_required") or 0)
        if qty <= 0:
            continue
        stock = await db.rahaza_material_stock.find_one({"material_id": it["material_id"], "location_id": loc})
        avail = float((stock or {}).get("qty") or 0)
        if avail < qty:
            shortages.append({"material_id": it["material_id"], "required": qty, "available": avail, "location_id": loc})
        plan.append({"material_id": it["material_id"], "location_id": loc, "qty": qty, "item_id": it["id"]})
    
    if shortages:
        raise HTTPException(400, {"message": "Stok tidak cukup untuk issue.", "shortages": shortages})
    
    # 2) Execute — B11 Fix: atomic conditional decrement to prevent race condition / negative stock
    from pymongo import ReturnDocument
    race_failures = []
    for p in plan:
        result = await db.rahaza_material_stock.find_one_and_update(
            {"material_id": p["material_id"], "location_id": p["location_id"], "qty": {"$gte": p["qty"]}},
            {"$inc": {"qty": -p["qty"]}, "$set": {"updated_at": _now()}},
            return_document=ReturnDocument.AFTER,
        )
        if result is None:
            race_failures.append({"material_id": p["material_id"], "location_id": p["location_id"], "required": p["qty"]})
        else:
            await _log_movement(db, user,
                type="issue", material_id=p["material_id"], qty=p["qty"],
                from_location_id=p["location_id"], to_location_id=None,
                ref_type="wo_issue" if mi.get("work_order_id") else "manual_issue",
                ref_id=mi["id"], notes=f"MI {mi['mi_number']}",
            )
    if race_failures:
        raise HTTPException(409, {"message": "Stok habis karena concurrent issue. Cek ulang ketersediaan.", "failures": race_failures})
    
    # Update item qty_issued + MI status
    new_items = []
    for it in (mi.get("items") or []):
        new_items.append({
            **it,
            "qty_issued": float(it.get("qty_required") or 0),
            "location_id": loc_overrides.get(it["material_id"]) or it.get("location_id")
        })
    
    await db.rahaza_material_issues.update_one(
        {"id": mid},
        {
            "$set": {
                "items": new_items,
                "status": "issued",
                "issued_at": _now(),
                "issued_by": user["id"],
                "updated_at": _now(),
            }
        }
    )
    await log_activity(user["id"], user.get("name", ""), "approve+issue", "rahaza.mi", mi["mi_number"])
    out = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    await _enrich_mi(db, out)
    
    # ── F3 Auto-post: Dr WIP / Cr Inventory RM
    posting_result = None
    try:
        posting_result = await post_inventory_issue(db, out, user)
    except Exception as e:
        log.exception("Inventory issue auto-post failed")
        posting_result = {"ok": False, "error": str(e)}
    
    out_refresh = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    await _enrich_mi(db, out_refresh)
    out_refresh["_posting_result"] = posting_result
    return serialize_doc(out_refresh)


@router.post("/material-issues/{mid}/reject")
async def reject_mi(mid: str, request: Request):
    """Reject MI (pending_approval → rejected)."""
    user = await _require_mi_approver(request)
    db = get_db()
    body = await request.json()
    reason = body.get("reason") or "Tidak ada alasan"
    
    mi = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    if not mi:
        raise HTTPException(404, "MI tidak ditemukan.")
    if mi.get("status") != "pending_approval":
        raise HTTPException(400, f"Hanya MI Pending Approval yang bisa di-reject. Status: {mi.get('status')}")
    
    await db.rahaza_material_issues.update_one(
        {"id": mid},
        {
            "$set": {
                "status": "rejected",
                "rejected_at": _now(),
                "rejected_by": user["id"],
                "rejected_by_name": user.get("name", ""),
                "rejected_reason": reason,
                "updated_at": _now(),
            }
        }
    )
    await log_activity(user["id"], user.get("name", ""), f"reject:{reason}", "rahaza.mi", mi["mi_number"])
    out = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    await _enrich_mi(db, out)
    return serialize_doc(out)


# ── Original confirm endpoint (kept for backward compatibility with old draft MIs) ──

@router.post("/material-issues/{mid}/confirm")
async def confirm_mi(mid: str, request: Request):
    """DEPRECATED: Use submit + approve workflow instead.
    Legacy endpoint for direct confirm (draft → issued without approval).
    Kept for backward compatibility."""
    user = await _require_admin(request)
    db = get_db()
    mi = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    if not mi: raise HTTPException(404, "MI tidak ditemukan.")
    if mi.get("status") != "draft":
        raise HTTPException(400, f"MI status '{mi.get('status')}' tidak bisa di-confirm langsung. Gunakan workflow submit/approve.")
    body = {}
    try: body = await request.json()
    except Exception: body = {}
    loc_overrides = body.get("location_overrides") or {}

    # 1) Resolve per-item location & validate stock
    plan = []
    shortages = []
    for it in (mi.get("items") or []):
        loc = loc_overrides.get(it["material_id"]) or it.get("location_id")
        if not loc:
            raise HTTPException(400, f"Item belum punya lokasi: material {it.get('material_id')}. Isi location_id atau gunakan location_overrides.")
        qty = float(it.get("qty_required") or 0)
        if qty <= 0: continue
        stock = await db.rahaza_material_stock.find_one({"material_id": it["material_id"], "location_id": loc})
        avail = float((stock or {}).get("qty") or 0)
        if avail < qty:
            shortages.append({"material_id": it["material_id"], "required": qty, "available": avail, "location_id": loc})
        plan.append({"material_id": it["material_id"], "location_id": loc, "qty": qty, "item_id": it["id"]})
    if shortages:
        raise HTTPException(400, {"message": "Stok tidak cukup untuk issue.", "shortages": shortages})

    # 2) Execute
    for p in plan:
        await _add_stock(db, p["material_id"], p["location_id"], -p["qty"])
        await _log_movement(db, user,
            type="issue", material_id=p["material_id"], qty=p["qty"],
            from_location_id=p["location_id"], to_location_id=None,
            ref_type="wo_issue" if mi.get("work_order_id") else "manual_issue",
            ref_id=mi["id"], notes=f"MI {mi['mi_number']}",
        )
    # Update item qty_issued + MI status
    new_items = []
    for it in (mi.get("items") or []):
        new_items.append({**it, "qty_issued": float(it.get("qty_required") or 0), "location_id": loc_overrides.get(it["material_id"]) or it.get("location_id")})
    await db.rahaza_material_issues.update_one({"id": mid}, {"$set": {
        "items": new_items, "status": "issued", "issued_at": _now(), "issued_by": user["id"], "updated_at": _now(),
    }})
    await log_activity(user["id"], user.get("name", ""), "confirm", "rahaza.mi", mi["mi_number"])
    out = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    await _enrich_mi(db, out)

    # ── F3 Auto-post: Dr WIP / Cr Inventory RM
    posting_result = None
    try:
        posting_result = await post_inventory_issue(db, out, user)
    except Exception as e:
        log.exception("Inventory issue auto-post failed")
        posting_result = {"ok": False, "error": str(e)}
    out_refresh = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    await _enrich_mi(db, out_refresh)
    out_refresh["_posting_result"] = posting_result
    return serialize_doc(out_refresh)


@router.post("/material-issues/{mid}/post-to-gl")
async def retry_post_mi(mid: str, request: Request):
    """F3: manual retry post Material Issue to GL."""
    user = await _require_admin(request)
    db = get_db()
    mi = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    if not mi:
        raise HTTPException(404, "MI tidak ditemukan.")
    if mi.get("status") != "issued":
        raise HTTPException(400, "Hanya MI issued yang bisa di-post.")
    result = await post_inventory_issue(db, mi, user)
    out = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    await _enrich_mi(db, out)
    out["_posting_result"] = result
    return serialize_doc(out)


@router.post("/material-movements/{mv_id}/post-to-gl")
async def retry_post_movement(mv_id: str, request: Request):
    """F3: manual retry post material movement (receive/adjust) to GL."""
    user = await _require_admin(request)
    db = get_db()
    mv = await db.rahaza_material_movements.find_one({"id": mv_id}, {"_id": 0})
    if not mv:
        raise HTTPException(404, "Movement tidak ditemukan.")
    if mv["type"] == "receive":
        result = await post_inventory_receive(db, mv, user)
    elif mv["type"] == "adjust":
        result = await post_inventory_adjust(db, mv, user)
    else:
        raise HTTPException(400, f"Type '{mv['type']}' tidak bisa di-post.")
    out = await db.rahaza_material_movements.find_one({"id": mv_id}, {"_id": 0})
    out["_posting_result"] = result
    return serialize_doc(out)


@router.post("/material-issues/{mid}/cancel")
async def cancel_mi(mid: str, request: Request):
    user = await _require_admin(request)
    db = get_db()
    mi = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    if not mi: raise HTTPException(404, "MI tidak ditemukan.")
    if mi.get("status") not in ("draft", "pending_approval"):
        raise HTTPException(400, "Hanya MI Draft atau Menunggu Approval yang bisa di-cancel.")
    await db.rahaza_material_issues.update_one({"id": mid}, {"$set": {"status": "cancelled", "updated_at": _now()}})
    return {"status": "cancelled"}


@router.delete("/material-issues/{mid}")
async def delete_mi(mid: str, request: Request):
    user = await _require_admin(request)
    db = get_db()
    mi = await db.rahaza_material_issues.find_one({"id": mid}, {"_id": 0})
    if not mi: raise HTTPException(404, "MI tidak ditemukan.")
    if mi.get("status") not in ("draft", "cancelled"):
        raise HTTPException(400, "Hanya MI Draft/Cancelled yang bisa dihapus.")
    await db.rahaza_material_issues.delete_one({"id": mid})
    return {"status": "deleted"}


# ─── FG Movements ─────────────────────────────────────────────────────────────

@router.get("/fg-movements")
async def list_fg_movements(request: Request, fg_code: Optional[str] = None,
                            direction: Optional[str] = None, limit: int = 50):
    """List FG stock movements (in from production, out from shipment dispatch)."""
    await require_auth(request)
    db = get_db()
    q: dict = {}
    if fg_code:    q["fg_code"] = fg_code
    if direction:  q["direction"] = direction
    movements = await db.rahaza_fg_movements.find(q, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(None)
    return serialize_doc(movements)


# ─── FG Issue (Pengeluaran Produk Jadi Internal) ──────────────────────────────

FG_ISSUE_REASONS = {
    "surat_jalan_internal": "Surat Jalan Internal",
    "sample":               "Sample / Contoh",
    "koreksi_stok":         "Koreksi Stok (Adjustment)",
    "retur":                "Retur / Rusak",
    "lainnya":              "Lainnya",
}

def _fg_uid(): return str(uuid.uuid4())
def _fg_now(): return datetime.now(timezone.utc)


@router.get("/fg-issues")
async def list_fg_issues(request: Request, limit: int = 50):
    """List semua FG issues, terbaru dulu."""
    await require_auth(request)
    db = get_db()
    issues = await db.rahaza_fg_issues.find({}, {"_id": 0}).sort("issued_at", -1).limit(limit).to_list(None)
    return serialize_doc(issues)


@router.post("/fg-issue")
async def create_fg_issue(request: Request):
    """
    Kurangi stok FG secara manual.
    Body: {
      material_id: str,          -- FG material id
      qty: int,                  -- qty dikeluarkan (> 0, <= stok tersedia)
      reason: str,               -- surat_jalan_internal | sample | koreksi_stok | retur | lainnya
      customer_id: str?,         -- opsional, tujuan pengiriman
      reference_number: str?,    -- nomor SJ manual / nomor referensi lain
      notes: str?,
    }
    """
    user = await require_auth(request)
    db   = get_db()
    body = await request.json()

    material_id = body.get("material_id")
    qty         = int(body.get("qty") or 0)
    reason      = body.get("reason", "lainnya")
    customer_id = body.get("customer_id")
    ref_no      = body.get("reference_number", "")
    notes       = body.get("notes", "")

    if not material_id:
        raise HTTPException(400, "material_id wajib diisi")
    if qty <= 0:
        raise HTTPException(400, "qty harus lebih dari 0")
    if reason not in FG_ISSUE_REASONS:
        raise HTTPException(400, f"reason harus salah satu: {list(FG_ISSUE_REASONS.keys())}")

    # Validate material exists and is FG type
    mat = await db.rahaza_materials.find_one({"id": material_id}, {"_id": 0})
    if not mat:
        raise HTTPException(404, "Material tidak ditemukan")
    if mat.get("type") != "fg":
        raise HTTPException(400, "Material bukan produk jadi (type=fg)")

    # Check available stock
    default_loc = await db.rahaza_locations.find_one({"active": True}, {"_id": 0})
    loc_id = default_loc["id"] if default_loc else None
    stock_doc = await db.rahaza_material_stock.find_one(
        {"material_id": material_id, "location_id": loc_id}, {"_id": 0}
    )
    available = float(stock_doc.get("qty", 0)) if stock_doc else 0
    if qty > available:
        raise HTTPException(400, f"Stok tidak cukup. Tersedia: {available} pcs, diminta: {qty} pcs")

    # Customer snapshot (opsional)
    customer_name = None
    if customer_id:
        cust = await db.rahaza_customers.find_one({"id": customer_id}, {"_id": 0})
        customer_name = cust.get("name") if cust else None

    # Generate issue number: FGI-YYYYMMDD-XXXXX
    today_str = _fg_now().strftime("%Y%m%d")
    count = await db.rahaza_fg_issues.count_documents({"issue_number": {"$regex": f"^FGI-{today_str}"}})
    issue_number = f"FGI-{today_str}-{count+1:04d}"

    # Deduct stock
    await db.rahaza_material_stock.update_one(
        {"material_id": material_id, "location_id": loc_id},
        {"$inc": {"qty": -qty}, "$set": {"updated_at": _fg_now()}}
    )

    # Create issue record
    issue_id = _fg_uid()
    issue_doc = {
        "id":               issue_id,
        "issue_number":     issue_number,
        "material_id":      material_id,
        "fg_code":          mat.get("code"),
        "fg_name":          mat.get("name"),
        "qty":              qty,
        "unit":             mat.get("unit", "pcs"),
        "reason":           reason,
        "reason_label":     FG_ISSUE_REASONS[reason],
        "customer_id":      customer_id,
        "customer_name":    customer_name,
        "reference_number": ref_no,
        "notes":            notes,
        "issued_by":        user.get("name", ""),
        "issued_by_id":     user.get("sub", ""),
        "issued_at":        _fg_now(),
        "stock_before":     available,
        "stock_after":      available - qty,
        "location_id":      loc_id,
    }
    await db.rahaza_fg_issues.insert_one(issue_doc)

    # Log FG movement
    await db.rahaza_fg_movements.insert_one({
        "id":              _fg_uid(),
        "fg_code":         mat.get("code"),
        "material_id":     material_id,
        "fg_issue_id":     issue_id,
        "direction":       "out",
        "qty":             qty,
        "source":          "manual_issue",
        "reason":          reason,
        "customer_id":     customer_id,
        "customer_name":   customer_name,
        "reference_number": ref_no,
        "notes":           notes or FG_ISSUE_REASONS[reason],
        "issued_by":       user.get("name", ""),
        "timestamp":       _fg_now(),
    })

    await log_activity(user["id"], user.get("name", ""), "fg_issue_created", "rahaza.fg_issue", 
                      f"{issue_number}: {mat.get('code')} qty={qty} reason={reason}")

    return serialize_doc({**issue_doc, "ok": True})
