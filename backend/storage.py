"""Persistent file storage using Emergent Object Storage."""
import os
import uuid
import requests
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "garment-erp"
storage_key = None

# M15: Whitelist safe extensions
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp', 'pdf', 'csv', 'txt', 'json'}

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf",
    "json": "application/json", "csv": "text/csv", "txt": "text/plain",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "doc": "application/msword", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

def init_storage():
    """Initialize storage session. Call once at startup."""
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_KEY:
        logger.warning("EMERGENT_LLM_KEY not set, storage disabled")
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        logger.info("Object storage initialized")
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload file to storage."""
    key = init_storage()
    if not key:
        raise RuntimeError("Storage not initialized")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120
    )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    """Download file from storage. Returns (bytes, content_type)."""
    key = init_storage()
    if not key:
        raise RuntimeError("Storage not initialized")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

def delete_object(path: str) -> bool:
    """Delete file from storage. Returns True on success."""
    key = init_storage()
    if not key:
        logger.warning("Storage not initialized, cannot delete object")
        return False
    try:
        resp = requests.delete(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key}, timeout=30
        )
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.warning(f"delete_object({path}) failed: {e}")
        return False

def generate_storage_path(user_id: str, filename: str) -> str:
    """Generate a unique storage path with whitelisted extension."""
    raw_ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'bin'
    # M15: Only allow whitelisted extensions
    ext = raw_ext if raw_ext in ALLOWED_EXTENSIONS else 'bin'
    return f"{APP_NAME}/uploads/{user_id}/{uuid.uuid4()}.{ext}"
