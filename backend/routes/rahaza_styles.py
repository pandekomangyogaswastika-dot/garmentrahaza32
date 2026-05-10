"""
Style Master 2.0 — PT Rahaza ERP
Manages product styles: design images, tech-pack documents, color/size variants.
Routes prefix: /api/rahaza
"""
import logging
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, Request, HTTPException, UploadFile, File
from database import get_db
from auth import require_auth

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rahaza", tags=["style-master"])

def _uid():  return str(uuid4())
def _now():  return datetime.now(timezone.utc).isoformat()

def serialize_doc(d):
    if isinstance(d, list): return [serialize_doc(x) for x in d]
    if isinstance(d, dict): return {k: serialize_doc(v) for k, v in d.items() if k != "_id"}
    return d

async def _require_admin(request: Request):
    user = await require_auth(request)
    if user.get("role") not in ("superadmin", "admin", "manager", "gudang"):
        raise HTTPException(403, "Tidak ada akses.")
    return user


# ─── STYLE MASTER CRUD ─────────────────────────────────────────────────────────

@router.get("/styles")
async def list_styles(request: Request, search: str = "", category: str = "", buyer: str = "", season: str = ""):
    await require_auth(request)
    db = get_db()
    q = {}
    if search:
        import re
        pat = re.compile(re.escape(search), re.IGNORECASE)
        q["$or"] = [{"style_code": pat}, {"style_name": pat}, {"buyer": pat}]
    if category: q["category"] = category
    if buyer:    q["buyer"] = buyer
    if season:   q["season"] = season
    styles = await db.rahaza_styles.find(q, {"_id": 0}).sort("created_at", -1).to_list(None)
    return serialize_doc(styles)


@router.post("/styles")
async def create_style(request: Request):
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    code = (body.get("style_code") or "").strip().upper()
    name = (body.get("style_name") or "").strip()
    if not code or not name:
        raise HTTPException(400, "style_code & style_name wajib diisi.")
    if await db.rahaza_styles.find_one({"style_code": code}):
        raise HTTPException(409, f"Kode style '{code}' sudah ada.")
    doc = {
        "id": _uid(), "style_code": code, "style_name": name,
        "category":      body.get("category") or "",
        "buyer":         body.get("buyer") or "",
        "fabric_type":   body.get("fabric_type") or "",
        "season":        body.get("season") or "",
        "description":   body.get("description") or "",
        "status":        body.get("status") or "active",
        "design_images": [],          # [{id, url, caption, uploaded_at}]
        "techpack_url":  None,        # PDF URL
        "techpack_name": None,
        "variants":      [],          # [{id, color, size, sku, notes}]
        "created_by":    user["id"],
        "created_by_name": user.get("name", ""),
        "created_at":    _now(),
        "updated_at":    _now(),
    }
    await db.rahaza_styles.insert_one(doc)
    return serialize_doc(doc)


@router.get("/styles/{style_id}")
async def get_style(style_id: str, request: Request):
    await require_auth(request)
    db = get_db()
    s = await db.rahaza_styles.find_one({"id": style_id}, {"_id": 0})
    if not s: raise HTTPException(404, "Style tidak ditemukan.")
    return serialize_doc(s)


@router.put("/styles/{style_id}")
async def update_style(style_id: str, request: Request):
    user = await _require_admin(request)
    db = get_db()
    body = await request.json()
    body.pop("_id", None); body.pop("id", None); body.pop("created_at", None)
    body.pop("design_images", None); body.pop("techpack_url", None); body.pop("variants", None)
    body["updated_at"] = _now()
    if "style_code" in body: body["style_code"] = body["style_code"].strip().upper()
    res = await db.rahaza_styles.update_one({"id": style_id}, {"$set": body})
    if res.matched_count == 0: raise HTTPException(404, "Style tidak ditemukan.")
    return serialize_doc(await db.rahaza_styles.find_one({"id": style_id}, {"_id": 0}))


@router.delete("/styles/{style_id}")
async def delete_style(style_id: str, request: Request):
    await _require_admin(request)
    db = get_db()
    s = await db.rahaza_styles.find_one({"id": style_id})
    if not s: raise HTTPException(404, "Style tidak ditemukan.")
    await db.rahaza_styles.delete_one({"id": style_id})
    return {"ok": True}


# ─── DESIGN IMAGES ─────────────────────────────────────────────────────────────

@router.post("/styles/{style_id}/images")
async def upload_style_image(style_id: str, request: Request, file: UploadFile = File(...)):
    user = await _require_admin(request)
    db = get_db()
    s = await db.rahaza_styles.find_one({"id": style_id})
    if not s: raise HTTPException(404, "Style tidak ditemukan.")

    from storage import put_object, generate_storage_path
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "Gambar terlalu besar (max 10MB).")
    path = generate_storage_path(user["id"], f"style_img_{style_id[:8]}_{file.filename}")
    try:
        result = put_object(path, content, file.content_type or "image/jpeg")
        stored_path = result.get("path", path)
    except Exception as e:
        logger.error(f"Style image upload failed: {e}")
        raise HTTPException(500, "Upload gagal: storage tidak tersedia.")

    # Register in attachments so /api/files/{path} can serve it
    await db.attachments.insert_one({
        "id": _uid(), "storage_path": stored_path,
        "original_filename": file.filename,
        "content_type": file.content_type or "image/jpeg",
        "size": len(content),
        "entity_type": "style", "entity_id": style_id,
        "uploaded_by": user.get("name", ""), "uploaded_by_id": user["id"],
        "is_deleted": False, "created_at": _now(),
    })

    url = f"/api/files/{stored_path}"
    img_entry = {
        "id":            _uid(),
        "url":           url,
        "storage_path":  stored_path,
        "caption":       file.filename,
        "content_type":  file.content_type or "image/jpeg",
        "uploaded_at":   _now(),
        "uploaded_by":   user.get("name", ""),
    }
    await db.rahaza_styles.update_one(
        {"id": style_id},
        {"$push": {"design_images": img_entry}, "$set": {"updated_at": _now()}}
    )
    return img_entry


@router.delete("/styles/{style_id}/images/{img_id}")
async def delete_style_image(style_id: str, img_id: str, request: Request):
    await _require_admin(request)
    db = get_db()
    await db.rahaza_styles.update_one(
        {"id": style_id},
        {"$pull": {"design_images": {"id": img_id}}, "$set": {"updated_at": _now()}}
    )
    return {"ok": True}


# ─── TECH-PACK ─────────────────────────────────────────────────────────────────

@router.post("/styles/{style_id}/techpack")
async def upload_techpack(style_id: str, request: Request, file: UploadFile = File(...)):
    user = await _require_admin(request)
    db = get_db()
    s = await db.rahaza_styles.find_one({"id": style_id})
    if not s: raise HTTPException(404, "Style tidak ditemukan.")

    from storage import put_object, generate_storage_path
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(400, "Tech-pack terlalu besar (max 20MB).")
    path = generate_storage_path(user["id"], f"techpack_{style_id[:8]}_{file.filename}")
    try:
        result = put_object(path, content, file.content_type or "application/pdf")
        stored_path = result.get("path", path)
    except Exception as e:
        logger.error(f"Tech-pack upload failed: {e}")
        raise HTTPException(500, "Upload gagal: storage tidak tersedia.")

    # Register attachment so /api/files/{path} can serve it
    await db.attachments.insert_one({
        "id": _uid(), "storage_path": stored_path,
        "original_filename": file.filename,
        "content_type": file.content_type or "application/pdf",
        "size": len(content),
        "entity_type": "style_techpack", "entity_id": style_id,
        "uploaded_by": user.get("name", ""), "uploaded_by_id": user["id"],
        "is_deleted": False, "created_at": _now(),
    })

    url = f"/api/files/{stored_path}"
    await db.rahaza_styles.update_one(
        {"id": style_id},
        {"$set": {
            "techpack_url":  url,
            "techpack_path": stored_path,
            "techpack_name": file.filename,
            "updated_at":    _now(),
        }}
    )
    return {"ok": True, "url": url, "name": file.filename}


@router.delete("/styles/{style_id}/techpack")
async def delete_techpack(style_id: str, request: Request):
    await _require_admin(request)
    db = get_db()
    await db.rahaza_styles.update_one(
        {"id": style_id},
        {"$set": {"techpack_url": None, "techpack_name": None, "updated_at": _now()}}
    )
    return {"ok": True}


# ─── VARIANTS ──────────────────────────────────────────────────────────────────

@router.post("/styles/{style_id}/variants")
async def add_variant(style_id: str, request: Request):
    await _require_admin(request)
    db = get_db()
    s = await db.rahaza_styles.find_one({"id": style_id})
    if not s: raise HTTPException(404, "Style tidak ditemukan.")
    body = await request.json()
    variant = {
        "id":     _uid(),
        "color":  body.get("color") or "",
        "size":   body.get("size") or "",
        "sku":    body.get("sku") or "",
        "notes":  body.get("notes") or "",
    }
    await db.rahaza_styles.update_one(
        {"id": style_id},
        {"$push": {"variants": variant}, "$set": {"updated_at": _now()}}
    )
    return variant


@router.delete("/styles/{style_id}/variants/{variant_id}")
async def delete_variant(style_id: str, variant_id: str, request: Request):
    await _require_admin(request)
    db = get_db()
    await db.rahaza_styles.update_one(
        {"id": style_id},
        {"$pull": {"variants": {"id": variant_id}}, "$set": {"updated_at": _now()}}
    )
    return {"ok": True}


# ─── SIZE CHART ─────────────────────────────────────────────────────────────────

@router.get("/styles/{style_id}/size-chart")
async def get_size_chart(style_id: str, request: Request):
    """Get size chart for a style."""
    await require_auth(request)
    db = get_db()
    s = await db.rahaza_styles.find_one({"id": style_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Style tidak ditemukan.")
    return {
        "size_chart": s.get("size_chart") or [],
        "measurement_unit": s.get("measurement_unit") or "cm",
        "measurement_columns": s.get("measurement_columns") or ["chest", "length", "shoulder", "sleeve"],
    }


@router.put("/styles/{style_id}/size-chart")
async def save_size_chart(style_id: str, request: Request):
    """Save/update size chart. Body: {size_chart: [...], measurement_unit, measurement_columns}"""
    user = await _require_admin(request)
    db = get_db()
    s = await db.rahaza_styles.find_one({"id": style_id})
    if not s:
        raise HTTPException(404, "Style tidak ditemukan.")
    body = await request.json()
    rows = body.get("size_chart") or []
    unit = body.get("measurement_unit") or "cm"
    cols = body.get("measurement_columns") or ["chest", "length", "shoulder", "sleeve"]
    # Validate each row has 'size' key
    for i, r in enumerate(rows):
        if not r.get("size"):
            raise HTTPException(400, f"Baris {i+1}: field 'size' wajib diisi.")
    await db.rahaza_styles.update_one(
        {"id": style_id},
        {"$set": {
            "size_chart": rows,
            "measurement_unit": unit,
            "measurement_columns": cols,
            "updated_at": _now(),
        }}
    )
    return {"ok": True, "row_count": len(rows)}


# ─── BASELINE HPP COSTING ───────────────────────────────────────────────────────

@router.get("/styles/{style_id}/costing")
async def get_style_costing(style_id: str, request: Request, model_id: str = "", size_id: str = ""):
    """
    Compute baseline HPP per dozen from active BOM × material unit_cost.
    If model_id/size_id not provided, use first available BOM.
    """
    await require_auth(request)
    db = get_db()
    s = await db.rahaza_styles.find_one({"id": style_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Style tidak ditemukan.")

    # Get BOM
    bom_q = {"active": True}
    if model_id:
        bom_q["model_id"] = model_id
    if size_id:
        bom_q["size_id"] = size_id
    bom = await db.rahaza_boms.find_one(bom_q, {"_id": 0})

    if not bom:
        return {
            "style_id": style_id,
            "bom_found": False,
            "message": "Tidak ada BOM aktif untuk model/size ini.",
            "items": [], "total_hpp": 0,
        }

    # Enrich with material unit_cost
    items = []
    total_hpp = 0.0
    for mat in (bom.get("materials") or []):
        material_id = mat.get("material_id")
        material_doc = None
        if material_id:
            material_doc = await db.rahaza_materials.find_one({"id": material_id}, {"_id": 0})
        if not material_doc and mat.get("code"):
            material_doc = await db.rahaza_materials.find_one(
                {"code": mat["code"], "active": True}, {"_id": 0}
            )
        unit_cost = float((material_doc or {}).get("unit_cost") or 0)
        qty = float(mat.get("qty_kg") or mat.get("qty") or 0)
        subtotal = round(qty * unit_cost, 2)
        total_hpp += subtotal
        items.append({
            "material_code":  mat.get("code") or (material_doc or {}).get("code") or "?",
            "material_name":  mat.get("name") or (material_doc or {}).get("name") or "",
            "unit":           mat.get("unit") or (material_doc or {}).get("unit") or "kg",
            "qty":            qty,
            "unit_cost":      unit_cost,
            "subtotal":       subtotal,
        })

    # Get size/model labels
    model_doc = await db.rahaza_models.find_one({"id": bom.get("model_id")}, {"_id": 0})
    size_doc  = await db.rahaza_sizes.find_one({"id":  bom.get("size_id")},  {"_id": 0})
    return {
        "style_id":   style_id,
        "bom_found":  True,
        "bom_id":     bom.get("id"),
        "bom_version": bom.get("version"),
        "model_code": (model_doc or {}).get("code") or "",
        "model_name": (model_doc or {}).get("name") or "",
        "size_code":  (size_doc or {}).get("code") or "",
        "size_name":  (size_doc or {}).get("name") or "",
        "items":      items,
        "total_hpp":  round(total_hpp, 2),
        "currency":   "IDR",
    }


# ─── BULK CSV IMPORT FOR PO ────────────────────────────────────────────────────
# (Placed here to avoid modifying rahaza_po.py heavily)

