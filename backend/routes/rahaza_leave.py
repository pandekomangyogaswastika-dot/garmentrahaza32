"""
PT Rahaza — Sprint 2.3: Leave Management (Izin/Cuti)

Collections:
  - rahaza_leave_types: Master tipe cuti (configurable)
  - rahaza_leave_requests: Request cuti karyawan
  - rahaza_leave_balances: Saldo cuti per karyawan per tahun

Endpoints (prefix /api/rahaza):
  Leave Types (Master):
    - GET  /leave-types
    - POST /leave-types        (admin/HR only)
    - PUT  /leave-types/{id}   (admin/HR only)
    - DELETE /leave-types/{id} (admin/HR only)
  
  Leave Requests:
    - GET  /leaves?status=&employee_id=&from=&to=
    - GET  /leaves/{id}
    - POST /leaves/request               (employee/admin)
    - POST /leaves/{id}/approve          (manager/HR)
    - POST /leaves/{id}/reject           (manager/HR)
    - DELETE /leaves/{id}                (draft only)
  
  Leave Balance:
    - GET /leaves/balance?employee_id=&year=

Workflow:
  draft → pending_approval → approved (attendance auto-filled)
  draft → rejected
"""
from fastapi import APIRouter, Request, HTTPException
from database import get_db
from auth import require_auth, serialize_doc, log_activity
import uuid
import logging
from datetime import datetime, timezone, date, timedelta
from typing import Optional

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rahaza", tags=["rahaza-leave"])


def _uid(): return str(uuid.uuid4())
def _now(): return datetime.now(timezone.utc)


LEAVE_STATUSES = ["draft", "pending_approval", "approved", "rejected", "cancelled"]


async def _require_hr_admin(request: Request):
    """Require HR, admin, or owner."""
    user = await require_auth(request)
    role = (user.get("role") or "").lower()
    if role in ("superadmin", "admin", "owner", "hr"):
        return user
    perms = user.get("_permissions") or []
    if "*" in perms or "hr.manage" in perms:
        return user
    raise HTTPException(403, "Forbidden: butuh akses HR/Admin.")


async def _require_leave_approver(request: Request):
    """Require manager, HR, or owner for approval."""
    user = await require_auth(request)
    role = (user.get("role") or "").lower()
    if role in ("superadmin", "owner", "manager", "hr", "production_manager"):
        return user
    perms = user.get("_permissions") or []
    if "*" in perms or "hr.approve" in perms:
        return user
    raise HTTPException(403, "Forbidden: hanya Manager/HR yang boleh approve cuti.")


# ── LEAVE TYPES (Master) ───────────────────────────────────────────────────────

@router.get("/leave-types")
async def list_leave_types(request: Request):
    await require_auth(request)
    db = get_db()
    rows = await db.rahaza_leave_types.find({}, {"_id": 0}).sort("code", 1).to_list(None)
    return serialize_doc(rows)


@router.post("/leave-types")
async def create_leave_type(request: Request):
    user = await _require_hr_admin(request)
    db = get_db()
    body = await request.json()
    
    code = (body.get("code") or "").strip().upper()
    name = (body.get("name") or "").strip()
    if not code or not name:
        raise HTTPException(400, "code & name wajib diisi.")
    
    if await db.rahaza_leave_types.find_one({"code": code, "active": True}):
        raise HTTPException(409, f"Kode '{code}' sudah terpakai.")
    
    doc = {
        "id": _uid(),
        "code": code,
        "name": name,
        "paid": bool(body.get("paid", True)),  # paid/unpaid
        "quota_default": int(body.get("quota_default") or 12),  # default quota per year (days)
        "description": body.get("description") or "",
        "active": True,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.rahaza_leave_types.insert_one(doc)
    await log_activity(user["id"], user.get("name", ""), "create", "rahaza.leave_type", code)
    return serialize_doc(doc)


@router.put("/leave-types/{lt_id}")
async def update_leave_type(lt_id: str, request: Request):
    user = await _require_hr_admin(request)
    db = get_db()
    body = await request.json()
    body.pop("_id", None)
    body.pop("id", None)
    body.pop("created_at", None)
    body["updated_at"] = _now()
    
    res = await db.rahaza_leave_types.update_one({"id": lt_id}, {"$set": body})
    if res.matched_count == 0:
        raise HTTPException(404, "Leave type tidak ditemukan.")
    
    await log_activity(user["id"], user.get("name", ""), "update", "rahaza.leave_type", lt_id)
    return serialize_doc(await db.rahaza_leave_types.find_one({"id": lt_id}, {"_id": 0}))


@router.delete("/leave-types/{lt_id}")
async def deactivate_leave_type(lt_id: str, request: Request):
    user = await _require_hr_admin(request)
    db = get_db()
    await db.rahaza_leave_types.update_one({"id": lt_id}, {"$set": {"active": False, "updated_at": _now()}})
    return {"status": "deactivated"}


# ── LEAVE REQUESTS ─────────────────────────────────────────────────────────────

@router.get("/leaves")
async def list_leaves(
    request: Request,
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    await require_auth(request)
    db = get_db()
    q = {}
    if status:
        if status not in LEAVE_STATUSES:
            raise HTTPException(400, f"Status harus: {LEAVE_STATUSES}")
        q["status"] = status
    if employee_id:
        q["employee_id"] = employee_id
    if date_from:
        q["from_date"] = q.get("from_date", {})
        q["from_date"]["$gte"] = date_from
    if date_to:
        q["to_date"] = q.get("to_date", {})
        q["to_date"]["$lte"] = date_to
    
    rows = await db.rahaza_leave_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(None)
    
    # Enrich with employee & leave type names
    emp_ids = list({r["employee_id"] for r in rows if r.get("employee_id")})
    lt_ids = list({r["leave_type_id"] for r in rows if r.get("leave_type_id")})
    
    emps = await db.rahaza_employees.find({"id": {"$in": emp_ids}}, {"_id": 0}).to_list(None) if emp_ids else []
    lts = await db.rahaza_leave_types.find({"id": {"$in": lt_ids}}, {"_id": 0}).to_list(None) if lt_ids else []
    
    emp_map = {e["id"]: e for e in emps}
    lt_map = {l["id"]: l for l in lts}
    
    for r in rows:
        e = emp_map.get(r.get("employee_id")) or {}
        lt = lt_map.get(r.get("leave_type_id")) or {}
        r["employee_code"] = e.get("employee_code")
        r["employee_name"] = e.get("name")
        r["leave_type_code"] = lt.get("code")
        r["leave_type_name"] = lt.get("name")
        r["is_paid"] = lt.get("paid", False)
    
    return serialize_doc(rows)


@router.get("/leaves/{leave_id}")
async def get_leave(leave_id: str, request: Request):
    await require_auth(request)
    db = get_db()
    leave = await db.rahaza_leave_requests.find_one({"id": leave_id}, {"_id": 0})
    if not leave:
        raise HTTPException(404, "Leave request tidak ditemukan.")
    
    # Enrich
    if leave.get("employee_id"):
        emp = await db.rahaza_employees.find_one({"id": leave["employee_id"]}, {"_id": 0})
        leave["employee_code"] = emp.get("employee_code") if emp else None
        leave["employee_name"] = emp.get("name") if emp else None
    if leave.get("leave_type_id"):
        lt = await db.rahaza_leave_types.find_one({"id": leave["leave_type_id"]}, {"_id": 0})
        leave["leave_type_code"] = lt.get("code") if lt else None
        leave["leave_type_name"] = lt.get("name") if lt else None
        leave["is_paid"] = lt.get("paid") if lt else False
    
    return serialize_doc(leave)


@router.post("/leaves/request")
async def request_leave(request: Request):
    """Create leave request (draft)."""
    user = await require_auth(request)
    db = get_db()
    body = await request.json()
    
    employee_id = body.get("employee_id")
    leave_type_id = body.get("leave_type_id")
    from_date = body.get("from_date")
    to_date = body.get("to_date")
    reason = (body.get("reason") or "").strip()
    
    if not (employee_id and leave_type_id and from_date and to_date):
        raise HTTPException(400, "employee_id, leave_type_id, from_date, to_date wajib diisi.")
    
    # Validate employee & leave type exist
    emp = await db.rahaza_employees.find_one({"id": employee_id})
    if not emp:
        raise HTTPException(404, "Employee tidak ditemukan.")
    
    lt = await db.rahaza_leave_types.find_one({"id": leave_type_id, "active": True})
    if not lt:
        raise HTTPException(404, "Leave type tidak ditemukan atau tidak aktif.")
    
    # Calculate duration (days)
    try:
        d_from = date.fromisoformat(from_date)
        d_to = date.fromisoformat(to_date)
        if d_to < d_from:
            raise HTTPException(400, "to_date tidak boleh lebih awal dari from_date.")
        duration = (d_to - d_from).days + 1
    except ValueError:
        raise HTTPException(400, "Format tanggal tidak valid (YYYY-MM-DD).")
    
    doc = {
        "id": _uid(),
        "employee_id": employee_id,
        "leave_type_id": leave_type_id,
        "from_date": from_date,
        "to_date": to_date,
        "duration_days": duration,
        "reason": reason,
        "status": "pending_approval",  # langsung pending (bisa draft dulu jika perlu workflow 2-step)
        "submitted_at": _now(),
        "submitted_by": user["id"],
        "created_by": user["id"],
        "created_by_name": user.get("name", ""),
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.rahaza_leave_requests.insert_one(doc)
    await log_activity(user["id"], user.get("name", ""), "request", "rahaza.leave", f"{emp.get('name', employee_id)} - {duration} hari")
    return serialize_doc(doc)


@router.post("/leaves/{leave_id}/approve")
async def approve_leave(leave_id: str, request: Request):
    """Approve leave request and auto-create attendance records."""
    user = await _require_leave_approver(request)
    db = get_db()
    
    leave = await db.rahaza_leave_requests.find_one({"id": leave_id}, {"_id": 0})
    if not leave:
        raise HTTPException(404, "Leave request tidak ditemukan.")
    if leave.get("status") != "pending_approval":
        raise HTTPException(400, f"Hanya leave Pending Approval yang bisa di-approve. Status: {leave.get('status')}")
    
    # Update leave status
    await db.rahaza_leave_requests.update_one(
        {"id": leave_id},
        {
            "$set": {
                "status": "approved",
                "approved_at": _now(),
                "approved_by": user["id"],
                "approved_by_name": user.get("name", ""),
                "updated_at": _now(),
            }
        }
    )
    
    # Auto-create attendance records (cuti) for date range
    try:
        d_from = date.fromisoformat(leave["from_date"])
        d_to = date.fromisoformat(leave["to_date"])
        
        # Get leave type for attendance status mapping
        lt = await db.rahaza_leave_types.find_one({"id": leave["leave_type_id"]}, {"_id": 0})
        lt_code = (lt.get("code") if lt else "CUTI").lower()
        
        current = d_from
        while current <= d_to:
            # Upsert attendance (overwrite if exists)
            await db.rahaza_attendance_events.update_one(
                {"employee_id": leave["employee_id"], "date": current.isoformat()},
                {
                    "$set": {
                        "status": "cuti",  # atau bisa disesuaikan dengan lt_code
                        "notes": f"Cuti: {lt.get('name') if lt else 'Leave'} ({leave.get('reason', '')})",
                        "leave_request_id": leave_id,
                        "updated_at": _now(),
                    },
                    "$setOnInsert": {
                        "id": _uid(),
                        "employee_id": leave["employee_id"],
                        "date": current.isoformat(),
                        "created_at": _now(),
                    },
                },
                upsert=True,
            )
            current += timedelta(days=1)
        
        log.info(f"Leave approved: {leave_id}, attendance created for {leave['duration_days']} days")
    except Exception as e:
        log.error(f"Failed to create attendance for leave {leave_id}: {e}")
        # Non-fatal: leave sudah approved, attendance bisa di-fix manual
    
    await log_activity(user["id"], user.get("name", ""), "approve", "rahaza.leave", leave_id)
    out = await db.rahaza_leave_requests.find_one({"id": leave_id}, {"_id": 0})
    return serialize_doc(out)


@router.post("/leaves/{leave_id}/reject")
async def reject_leave(leave_id: str, request: Request):
    """Reject leave request."""
    user = await _require_leave_approver(request)
    db = get_db()
    body = await request.json()
    reason = body.get("reason") or "Tidak ada alasan"
    
    leave = await db.rahaza_leave_requests.find_one({"id": leave_id}, {"_id": 0})
    if not leave:
        raise HTTPException(404, "Leave request tidak ditemukan.")
    if leave.get("status") != "pending_approval":
        raise HTTPException(400, f"Hanya leave Pending Approval yang bisa di-reject. Status: {leave.get('status')}")
    
    await db.rahaza_leave_requests.update_one(
        {"id": leave_id},
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
    await log_activity(user["id"], user.get("name", ""), f"reject:{reason}", "rahaza.leave", leave_id)
    out = await db.rahaza_leave_requests.find_one({"id": leave_id}, {"_id": 0})
    return serialize_doc(out)


@router.post("/leaves/bulk-approve")
async def bulk_approve_leaves(request: Request):
    """Bulk approve all pending_approval leave requests (by list of IDs or all)."""
    user = await _require_leave_approver(request)
    db = get_db()
    body = await request.json()
    leave_ids = body.get("leave_ids")  # list or None (None = all pending)

    query = {"status": "pending_approval"}
    if leave_ids:
        query["id"] = {"$in": leave_ids}

    pending = await db.rahaza_leave_requests.find(query, {"_id": 0}).to_list(500)
    if not pending:
        return {"approved": 0, "skipped": 0, "message": "Tidak ada request pending untuk disetujui."}

    approved_count = 0
    for leave in pending:
        try:
            await db.rahaza_leave_requests.update_one(
                {"id": leave["id"]},
                {"$set": {
                    "status": "approved",
                    "approved_at": _now(),
                    "approved_by": user["id"],
                    "approved_by_name": user.get("name", ""),
                    "updated_at": _now(),
                }}
            )
            # Auto-create attendance records
            d_from = date.fromisoformat(leave["from_date"])
            d_to = date.fromisoformat(leave["to_date"])
            lt = await db.rahaza_leave_types.find_one({"id": leave["leave_type_id"]}, {"_id": 0})
            current = d_from
            while current <= d_to:
                await db.rahaza_attendance_events.update_one(
                    {"employee_id": leave["employee_id"], "date": current.isoformat()},
                    {"$set": {"status": "cuti", "notes": f"Cuti: {lt.get('name') if lt else 'Leave'}", "leave_request_id": leave["id"], "updated_at": _now()},
                     "$setOnInsert": {"id": _uid(), "employee_id": leave["employee_id"], "date": current.isoformat(), "created_at": _now()}},
                    upsert=True,
                )
                current += timedelta(days=1)
            approved_count += 1
            await log_activity(user["id"], user.get("name", ""), "bulk_approve", "rahaza.leave", leave["id"])
        except Exception as e:
            log.error(f"bulk_approve: failed for {leave['id']}: {e}")

    return {"approved": approved_count, "skipped": len(pending) - approved_count,
            "message": f"{approved_count} request cuti berhasil disetujui."}


@router.delete("/leaves/{leave_id}")
async def delete_leave(leave_id: str, request: Request):
    """Delete draft/rejected leave request."""
    user = await require_auth(request)
    db = get_db()
    
    leave = await db.rahaza_leave_requests.find_one({"id": leave_id}, {"_id": 0})
    if not leave:
        raise HTTPException(404, "Leave request tidak ditemukan.")
    if leave.get("status") not in ("draft", "rejected"):
        raise HTTPException(400, "Hanya leave Draft/Rejected yang bisa dihapus.")
    
    await db.rahaza_leave_requests.delete_one({"id": leave_id})
    return {"status": "deleted"}


# ── LEAVE BALANCE ──────────────────────────────────────────────────────────────

@router.get("/leaves/balance")
async def get_leave_balance(request: Request, employee_id: str, year: Optional[int] = None):
    """Get leave balance for employee (per year, per leave type)."""
    await require_auth(request)
    db = get_db()
    
    if not year:
        year = datetime.now().year
    
    # Get all leave types
    leave_types = await db.rahaza_leave_types.find({"active": True}, {"_id": 0}).to_list(None)
    
    # Get approved leaves for this employee/year
    leaves = await db.rahaza_leave_requests.find({
        "employee_id": employee_id,
        "status": "approved",
        "from_date": {"$regex": f"^{year}"},
    }, {"_id": 0}).to_list(None)
    
    # Calculate used per leave type
    used_map = {}
    for lv in leaves:
        lt_id = lv.get("leave_type_id")
        if lt_id:
            used_map[lt_id] = used_map.get(lt_id, 0) + lv.get("duration_days", 0)
    
    # Build balance report
    balances = []
    for lt in leave_types:
        quota = lt.get("quota_default", 12)
        used = used_map.get(lt["id"], 0)
        remaining = max(0, quota - used)
        
        balances.append({
            "leave_type_id": lt["id"],
            "leave_type_code": lt["code"],
            "leave_type_name": lt["name"],
            "quota": quota,
            "used": used,
            "remaining": remaining,
            "is_paid": lt.get("paid", False),
        })
    
    return {
        "employee_id": employee_id,
        "year": year,
        "balances": balances,
    }
