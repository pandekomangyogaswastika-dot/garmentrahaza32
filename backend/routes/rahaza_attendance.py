"""
HR Attendance & HR Dashboard — PT Rahaza ERP

Endpoints:
  Clock-in/out (operator self-service)
  Attendance grid (supervisor bulk-entry)
  Attendance summary (payroll calculation input)
  HR Dashboard (Sprint 1.2 — replaces placeholder, real KPIs)
"""
from fastapi import APIRouter, Request, HTTPException
from database import get_db
from auth import require_auth, serialize_doc, log_activity
import uuid
from datetime import datetime, timezone, date, timedelta
from typing import Optional

router = APIRouter(prefix="/api/rahaza", tags=["rahaza-hr"])


def _uid(): return str(uuid.uuid4())
def _now(): return datetime.now(timezone.utc)
def _today_iso(): return date.today().isoformat()
def _parse_iso(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None

def _calc_hours(cin, cout) -> float:
    if not cin or not cout:
        return 0.0
    if isinstance(cin, str): cin = _parse_iso(cin)
    if isinstance(cout, str): cout = _parse_iso(cout)
    if not cin or not cout: return 0.0
    diff = (cout - cin).total_seconds() / 3600
    return round(max(0.0, diff), 2)


async def _enrich(db, rows: list):
    """Add employee_name + employee_code to rows in-place."""
    eids = {r["employee_id"] for r in rows if r.get("employee_id")}
    emps = await db.rahaza_employees.find({"id": {"$in": list(eids)}}, {"_id": 0, "id": 1, "name": 1, "employee_code": 1}).to_list(None) if eids else []
    e_map = {e["id"]: e for e in emps}
    for r in rows:
        e = e_map.get(r.get("employee_id")) or {}
        r.setdefault("employee_name", e.get("name", "?"))
        r.setdefault("employee_code", e.get("employee_code", "-"))


# ─── CLOCK IN / OUT (Operator self-service) ──────────────────────────────────

@router.post("/attendance/clock-in")
async def clock_in(request: Request):
    user = await require_auth(request)
    db = get_db()
    body = await request.json()
    emp_id = body.get("employee_id")
    if not emp_id:
        raise HTTPException(400, "employee_id wajib.")
    d = _today_iso()
    existing = await db.rahaza_attendance_events.find_one({"employee_id": emp_id, "date": d}, {"_id": 0})
    if existing and existing.get("clock_in"):
        raise HTTPException(400, "Sudah clock-in hari ini.")
    now = _now()
    if existing:
        await db.rahaza_attendance_events.update_one(
            {"id": existing["id"]},
            {"$set": {"clock_in": now, "source": "operator",
                      "updated_by": user["id"], "updated_by_name": user.get("name", ""), "updated_at": now}}
        )
        out = await db.rahaza_attendance_events.find_one({"id": existing["id"]}, {"_id": 0})
    else:
        doc = {
            "id": _uid(), "employee_id": emp_id, "date": d,
            "clock_in": now, "clock_out": None,
            "hours_worked": 0, "overtime_hours": 0,
            "status": "hadir", "notes": "", "source": "operator",
            "created_by": user["id"], "created_by_name": user.get("name", ""),
            "created_at": now, "updated_at": now,
        }
        await db.rahaza_attendance_events.insert_one(doc)
        out = doc
    return serialize_doc(out)


@router.post("/attendance/clock-out")
async def clock_out(request: Request):
    user = await require_auth(request)
    db = get_db()
    body = await request.json()
    emp_id = body.get("employee_id")
    if not emp_id:
        raise HTTPException(400, "employee_id wajib.")
    d = _today_iso()
    existing = await db.rahaza_attendance_events.find_one({"employee_id": emp_id, "date": d}, {"_id": 0})
    if not existing or not existing.get("clock_in"):
        raise HTTPException(400, "Belum clock-in hari ini.")
    if existing.get("clock_out"):
        raise HTTPException(400, "Sudah clock-out hari ini.")
    now = _now()
    cin = existing["clock_in"]
    if isinstance(cin, str): cin = _parse_iso(cin)
    hours = _calc_hours(cin, now)
    await db.rahaza_attendance_events.update_one({"id": existing["id"]}, {"$set": {
        "clock_out": now, "hours_worked": hours, "source": "operator", "updated_at": now,
        "updated_by": user["id"], "updated_by_name": user.get("name", ""),
    }})
    out = await db.rahaza_attendance_events.find_one({"id": existing["id"]}, {"_id": 0})
    return serialize_doc(out)


# ─── SUPERVISOR GRID ─────────────────────────────────────────────────────────

@router.get("/attendance")
async def list_attendance(request: Request, date: Optional[str] = None, employee_id: Optional[str] = None, from_: Optional[str] = None, to: Optional[str] = None):
    await require_auth(request)
    db = get_db()
    q = {}
    if date: q["date"] = date
    if employee_id: q["employee_id"] = employee_id
    if from_ or to:
        range_q = {}
        if from_: range_q["$gte"] = from_
        if to: range_q["$lte"] = to
        q["date"] = range_q
    rows = await db.rahaza_attendance_events.find(q, {"_id": 0}).sort("date", -1).to_list(None)
    await _enrich(db, rows)
    return serialize_doc(rows)


@router.get("/attendance/grid")
async def attendance_grid(request: Request, date: Optional[str] = None):
    await require_auth(request)
    db = get_db()
    d = date or _today_iso()
    emps = await db.rahaza_employees.find({"active": True}, {"_id": 0}).sort("employee_code", 1).to_list(None)
    existing = await db.rahaza_attendance_events.find({"date": d}, {"_id": 0}).to_list(None)
    by_emp = {r["employee_id"]: r for r in existing}
    shifts = await db.rahaza_shifts.find({"active": True}, {"_id": 0}).sort("start_time", 1).to_list(None)
    rows = []
    for e in emps:
        r = by_emp.get(e["id"])
        rows.append({
            "employee_id": e["id"],
            "employee_code": e["employee_code"],
            "employee_name": e["name"],
            "role": e.get("role"),
            "line_id": e.get("line_id"),
            "existing_id": r["id"] if r else None,
            "status":        (r or {}).get("status",   "hadir"),
            "shift_id":      (r or {}).get("shift_id") or None,
            "clock_in":      (r or {}).get("clock_in"),
            "clock_out":     (r or {}).get("clock_out"),
            "hours_worked":       (r or {}).get("hours_worked", 0),
            "overtime_hours":     (r or {}).get("overtime_hours", 0),
            "notes":         (r or {}).get("notes", ""),
            "source":        (r or {}).get("source", "supervisor"),
        })
    return {"date": d, "shifts": serialize_doc(shifts), "rows": serialize_doc(rows)}


@router.post("/attendance/bulk")
async def bulk_attendance(request: Request):
    user = await require_auth(request)
    db = get_db()
    body = await request.json()
    rows = body.get("rows", [])
    if not rows:
        raise HTTPException(400, "rows kosong.")
    saved = 0
    for row in rows:
        doc = await _build_att_doc(db, row, user)
        if not doc:
            continue
        existing = await db.rahaza_attendance_events.find_one({"employee_id": row["employee_id"], "date": row.get("date", _today_iso())}, {"_id": 0})
        if existing:
            await db.rahaza_attendance_events.update_one({"id": existing["id"]}, {"$set": doc})
        else:
            await db.rahaza_attendance_events.insert_one(doc)
        saved += 1
    return {"ok": True, "saved": saved}


# ─── Phase 24D: Default Hadir Semua + Mark Absent ──────────────────────
@router.post("/attendance/default-present")
async def default_present(request: Request):
    """Bulk-create attendance records dengan status='hadir' untuk SEMUA karyawan
    aktif yang belum punya record di tanggal yang diberikan. Idempotent.

    Body: { "date": "YYYY-MM-DD" (opsional, default today),
            "default_hours": 8 (opsional, default 8 jam),
            "shift_id": null (opsional)
          }

    Response: { ok: true, created: N, skipped: N, total_employees: N }
    """
    user = await require_auth(request)
    db = get_db()
    body = await request.json() if request.headers.get("content-length", "0") != "0" else {}
    date_str = body.get("date") or _today_iso()
    # Validate date
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "date harus format YYYY-MM-DD")
    default_hours = float(body.get("default_hours") or 8.0)
    shift_id = body.get("shift_id")

    employees = await db.rahaza_employees.find({"active": True}, {"_id": 0, "id": 1, "name": 1, "employee_code": 1}).to_list(None)
    if not employees:
        return {"ok": True, "created": 0, "skipped": 0, "total_employees": 0, "message": "Tidak ada karyawan aktif."}

    # Cek existing untuk hindari double-insert
    existing = await db.rahaza_attendance_events.find(
        {"date": date_str, "employee_id": {"$in": [e["id"] for e in employees]}},
        {"_id": 0, "employee_id": 1}
    ).to_list(None)
    existing_ids = {r["employee_id"] for r in existing}

    new_docs = []
    now = _now()
    for emp in employees:
        if emp["id"] in existing_ids:
            continue
        new_docs.append({
            "id": _uid(),
            "employee_id": emp["id"],
            "date": date_str,
            "shift_id": shift_id,
            "clock_in": None,
            "clock_out": None,
            "hours_worked": round(default_hours, 2),
            "overtime_hours": 0.0,
            "status": "hadir",
            "notes": "Default present (auto-generated)",
            "source": "auto_default",
            "created_by": user["id"],
            "created_by_name": user.get("name", ""),
            "created_at": now,
            "updated_by": user["id"],
            "updated_by_name": user.get("name", ""),
            "updated_at": now,
        })
    if new_docs:
        await db.rahaza_attendance_events.insert_many(new_docs)
    await log_activity(user["id"], user.get("name", ""), "default_present", "rahaza.attendance",
                       f"date={date_str} created={len(new_docs)} skipped={len(existing_ids)}")
    return {
        "ok": True,
        "date": date_str,
        "created": len(new_docs),
        "skipped": len(existing_ids),
        "total_employees": len(employees),
    }


@router.post("/attendance/mark-absent")
async def mark_absent_bulk(request: Request):
    """Tandai 1+ karyawan TIDAK HADIR di tanggal tertentu.
    Akan upsert: jika belum ada record, create dengan status; jika ada, update status.

    Body: {
        "date": "YYYY-MM-DD" (opsional, default today),
        "employee_ids": [...],
        "status": "absen" | "sakit" | "izin" | "cuti" | "alpa",  (default 'absen')
        "notes": "opsional"
    }

    Response: { ok: true, updated: N, created: N }
    """
    user = await require_auth(request)
    db = get_db()
    body = await request.json()
    date_str = body.get("date") or _today_iso()
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "date harus format YYYY-MM-DD")
    emp_ids = body.get("employee_ids") or []
    if not isinstance(emp_ids, list) or not emp_ids:
        raise HTTPException(400, "employee_ids harus list non-kosong")
    status = (body.get("status") or "absen").lower()
    valid_absent = {"absen", "sakit", "izin", "cuti", "alpa"}
    if status not in valid_absent:
        raise HTTPException(400, f"status harus salah satu: {sorted(valid_absent)}")
    notes = body.get("notes") or ""

    now = _now()
    updated = 0
    created = 0
    for eid in emp_ids:
        existing = await db.rahaza_attendance_events.find_one({"employee_id": eid, "date": date_str}, {"_id": 0, "id": 1})
        if existing:
            await db.rahaza_attendance_events.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "status": status, "notes": notes,
                    "hours_worked": 0.0, "overtime_hours": 0.0,
                    "clock_in": None, "clock_out": None,
                    "updated_by": user["id"],
                    "updated_by_name": user.get("name", ""),
                    "updated_at": now,
                }}
            )
            updated += 1
        else:
            await db.rahaza_attendance_events.insert_one({
                "id": _uid(),
                "employee_id": eid,
                "date": date_str,
                "shift_id": None,
                "clock_in": None, "clock_out": None,
                "hours_worked": 0.0,
                "overtime_hours": 0.0,
                "status": status,
                "notes": notes,
                "source": "supervisor",
                "created_by": user["id"],
                "created_by_name": user.get("name", ""),
                "created_at": now,
                "updated_by": user["id"],
                "updated_by_name": user.get("name", ""),
                "updated_at": now,
            })
            created += 1
    await log_activity(user["id"], user.get("name", ""), "mark_absent", "rahaza.attendance",
                       f"date={date_str} status={status} count={len(emp_ids)}")
    return {"ok": True, "date": date_str, "status": status, "updated": updated, "created": created}


async def _build_att_doc(db, body, user):
    emp_id = body.get("employee_id")
    if not emp_id:
        return None
    status  = (body.get("status") or "hadir").lower()
    cin     = body.get("clock_in")
    cout    = body.get("clock_out")
    date_str = body.get("date") or _today_iso()
    hours_override = body.get("hours_worked")
    if isinstance(cin, str) and cin: cin = _parse_iso(cin)
    if isinstance(cout, str) and cout: cout = _parse_iso(cout)
    hours = float(hours_override) if hours_override not in (None, "") else _calc_hours(cin, cout)
    ot = float(body.get("overtime_hours") or 0)
    doc = {
        "employee_id": emp_id, "date": date_str,
        "shift_id": body.get("shift_id") or None,
        "clock_in": cin, "clock_out": cout,
        "hours_worked": round(max(0.0, hours), 2),
        "overtime_hours": round(max(0.0, ot), 2),
        "status": status, "notes": body.get("notes") or "",
        "source": (body.get("source") or "supervisor").lower(),
        "updated_by": user["id"], "updated_by_name": user.get("name", ""),
        "updated_at": _now(),
    }
    if not await db.rahaza_attendance_events.find_one({"employee_id": emp_id, "date": date_str}):
        doc["id"] = _uid()
        doc["created_by"] = user["id"]
        doc["created_by_name"] = user.get("name", "")
        doc["created_at"] = _now()
    return doc


@router.post("/attendance")
async def upsert_attendance(request: Request):
    user = await require_auth(request)
    db = get_db()
    body = await request.json()
    doc = await _build_att_doc(db, body, user)
    if not doc:
        raise HTTPException(400, "employee_id wajib.")
    existing = await db.rahaza_attendance_events.find_one({"employee_id": body["employee_id"], "date": body.get("date", _today_iso())}, {"_id": 0})
    if existing:
        await db.rahaza_attendance_events.update_one({"id": existing["id"]}, {"$set": doc})
        out = await db.rahaza_attendance_events.find_one({"id": existing["id"]}, {"_id": 0})
    else:
        await db.rahaza_attendance_events.insert_one(doc)
        out = doc
    return serialize_doc(out)


@router.get("/attendance/summary")
async def attendance_summary(request: Request, from_: Optional[str] = None, to: Optional[str] = None, employee_id: Optional[str] = None):
    await require_auth(request)
    db = get_db()
    q = {}
    if from_ or to:
        rg = {}
        if from_: rg["$gte"] = from_
        if to: rg["$lte"] = to
        q["date"] = rg
    if employee_id: q["employee_id"] = employee_id
    rows = await db.rahaza_attendance_events.find(q, {"_id": 0}).to_list(None)
    summary = {}
    for r in rows:
        eid = r["employee_id"]
        s = summary.setdefault(eid, {"employee_id": eid, "days_hadir": 0, "days_izin": 0, "days_sakit": 0, "days_alfa": 0, "days_cuti": 0, "days_libur": 0, "total_hours": 0, "total_overtime": 0})
        k = f"days_{r.get('status', 'hadir')}"
        if k in s: s[k] += 1
        s["total_hours"]    += float(r.get("hours_worked") or 0)
        s["total_overtime"] += float(r.get("overtime_hours") or 0)
    eids = list(summary.keys())
    emps = await db.rahaza_employees.find({"id": {"$in": eids}}, {"_id": 0}).to_list(None) if eids else []
    e_map = {e["id"]: e for e in emps}
    out = []
    for eid, s in summary.items():
        e = e_map.get(eid, {})
        s["employee_name"] = e.get("name", "?")
        s["employee_code"] = e.get("employee_code", "-")
        out.append(s)
    return serialize_doc(out)


@router.get("/attendance/my-today")
async def my_today(request: Request, employee_id: Optional[str] = None):
    await require_auth(request)
    db = get_db()
    if not employee_id:
        raise HTTPException(400, "employee_id wajib.")
    d = _today_iso()
    rec = await db.rahaza_attendance_events.find_one({"employee_id": employee_id, "date": d}, {"_id": 0})
    if not rec:
        return {"date": d, "employee_id": employee_id, "status": None, "has_clock_in": False, "has_clock_out": False, "record": None}
    return {
        "date": d, "employee_id": employee_id,
        "status": rec.get("status"),
        "has_clock_in": bool(rec.get("clock_in")),
        "has_clock_out": bool(rec.get("clock_out")),
        "record": serialize_doc(rec),
    }


# ─── HR DASHBOARD (Sprint 1.2) ────────────────────────────────────────────────

@router.get("/hr/dashboard")
async def hr_dashboard(request: Request):
    """
    Real HR KPI dashboard (replaces HRDashboardPlaceholder).
    Returns:
      - total_employees: jumlah karyawan aktif
      - attendance_today: breakdown status untuk hari ini
      - latest_payroll_run: run terbaru (periode, status, total payout)
      - alfa_last_7d: total alfa dalam 7 hari terakhir
      - attendance_trend: hadir count per hari (7 hari terakhir)
      - recent_attendance: 10 record attendance terbaru
    """
    await require_auth(request)
    db = get_db()
    today = _today_iso()
    from_7d = (date.today() - timedelta(days=6)).isoformat()

    # ── Total active employees
    total_employees = await db.rahaza_employees.count_documents({"active": True})

    # ── Attendance today: breakdown by status
    att_today = await db.rahaza_attendance_events.find(
        {"date": today}, {"_id": 0, "status": 1, "employee_id": 1}
    ).to_list(None)
    breakdown = {"hadir": 0, "izin": 0, "sakit": 0, "alfa": 0, "cuti": 0, "libur": 0}
    for a in att_today:
        k = a.get("status", "hadir")
        if k in breakdown:
            breakdown[k] += 1
        else:
            breakdown["hadir"] += 1
    recorded_today = len(att_today)
    not_recorded = max(0, total_employees - recorded_today)

    # ── Latest payroll run
    latest_run = await db.rahaza_payroll_runs.find_one(
        {}, {"_id": 0, "id": 1, "period_from": 1, "period_to": 1,
             "status": 1, "total_net": 1, "total_employees": 1, "employee_count": 1, "created_at": 1},  # FIX: total_net not total_payout
        sort=[("created_at", -1)]
    )

    # ── Alfa last 7 days
    alfa_last_7d = await db.rahaza_attendance_events.count_documents(
        {"status": "alfa", "date": {"$gte": from_7d}}
    )

    # ── Attendance trend last 7 days (hadir per day)
    trend_pipeline = [
        {"$match": {"date": {"$gte": from_7d}, "status": "hadir"}},
        {"$group": {"_id": "$date", "hadir": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    trend_raw = await db.rahaza_attendance_events.aggregate(trend_pipeline).to_list(None)
    trend = [{"date": t["_id"], "hadir": t["hadir"]} for t in trend_raw]

    # ── Recent attendance (last 10 records, enriched)
    recent = await db.rahaza_attendance_events.find(
        {}, {"_id": 0, "employee_id": 1, "date": 1, "status": 1, "clock_in": 1, "clock_out": 1, "hours_worked": 1}
    ).sort("created_at", -1).limit(10).to_list(None)
    await _enrich(db, recent)

    # ── Gender/department breakdown (from employees)
    dept_pipeline = [
        {"$match": {"active": True}},
        {"$group": {"_id": {"$ifNull": ["$department", "$role", "Lainnya"]}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 8},
    ]
    dept_breakdown = await db.rahaza_employees.aggregate(dept_pipeline).to_list(None)

    return serialize_doc({
        "total_employees": total_employees,
        "attendance_today": {
            **breakdown,
            "recorded": recorded_today,
            "not_recorded": not_recorded,
            "attendance_rate": round((breakdown["hadir"] / total_employees * 100), 1) if total_employees > 0 else 0,
        },
        "latest_payroll_run": latest_run,
        "alfa_last_7d": alfa_last_7d,
        "attendance_trend": trend,
        "recent_attendance": recent,
        "dept_breakdown": [{"dept": d["_id"], "count": d["count"]} for d in dept_breakdown],
    })
