"""
PT Rahaza — Phase 20C: AI Layer

Endpoints (prefix /api/rahaza/ai):
  GET  /ai/daily-summary?date=         — ringkasan harian (LLM)
  POST /ai/chat                         — chatbot supervisor (multi-turn)
  POST /ai/root-cause                   — root-cause assistant
  POST /ai/smart-search                 — pencarian natural language
  GET  /ai/predictive-delay?wo_id=     — prediksi delay WO
  GET  /ai/history?session_id=          — riwayat chat session
"""
from fastapi import APIRouter, Request, HTTPException, Query
from database import get_db
from auth import require_auth, serialize_doc
from datetime import datetime, timezone, date, timedelta
from typing import Optional
import uuid
import logging
import os

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rahaza", tags=["rahaza-ai"])


def _uid():
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


def _get_llm_key():
    """Get LLM key: check env first (fast path), can be overridden via integration settings."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if key:
        return key
    raise HTTPException(503, "AI service tidak tersedia. EMERGENT_LLM_KEY belum dikonfigurasi. Silakan konfigurasi di Portal Manajemen → Integrasi & API Keys.")


async def _get_llm_key_from_db(db) -> str:
    """Get LLM key: check DB integration settings first, then fallback to env."""
    try:
        from routes.rahaza_integrations import get_integration_key
        key = await get_integration_key("EMERGENT_LLM_KEY", db)
        if key:
            return key
    except Exception:
        pass
    key = os.environ.get("EMERGENT_LLM_KEY")
    if key:
        return key
    raise HTTPException(503, "AI service tidak tersedia. EMERGENT_LLM_KEY belum dikonfigurasi. Silakan konfigurasi di Portal Manajemen → Integrasi & API Keys.")


async def _build_daily_context(db, target_date: date) -> dict:
    """Build structured context for AI from DB data."""
    # WIP events for that day
    d_start = target_date.isoformat()
    d_end   = d_start + "T23:59:59Z"

    # Output from WIP events
    wip_events = await db.rahaza_wip_events.find(
        {"event_type": "output", "created_at": {"$gte": d_start, "$lte": d_end}},
        {"_id": 0}
    ).to_list(None)
    total_output = sum(e.get("qty", 0) for e in wip_events)

    # QC events
    qc_events = await db.rahaza_qc_events.find(
        {"created_at": {"$gte": d_start, "$lte": d_end}}, {"_id": 0}
    ).to_list(None)
    total_checked = sum(e.get("checked_qty", 0) for e in qc_events)
    total_fail    = sum(e.get("fail_qty", 0) for e in qc_events)
    fail_rate     = round(total_fail / max(total_checked, 1) * 100, 1)

    # Alerts
    active_alerts = await db.rahaza_alerts.find(
        {"status": {"$in": ["active", "open"]}}, {"_id": 0}
    ).limit(5).to_list(None)

    # Line assignments for that day
    assignments = await db.rahaza_line_assignments.find(
        {"assign_date": d_start}, {"_id": 0}
    ).to_list(None)
    total_target = sum(a.get("target_qty", 0) for a in assignments)

    # Downtime
    downtime = await db.rahaza_machine_downtime.find(
        {"start_at": {"$gte": d_start, "$lte": d_end}}, {"_id": 0}
    ).to_list(None)
    total_downtime_min = sum(e.get("duration_min", 0) for e in downtime)

    # WO backlog summary
    active_wos = await db.rahaza_work_orders.count_documents({"status": {"$in": ["released", "in_production"]}})
    overdue_wos = await db.rahaza_work_orders.count_documents(
        {"status": {"$nin": ["completed", "cancelled"]}, "due_date": {"$lt": date.today().isoformat()}}
    )

    return {
        "tanggal": target_date.strftime("%d %B %Y"),
        "total_output_pcs": total_output,
        "target_output_pcs": total_target,
        "efisiensi_pct": round(total_output / max(total_target, 1) * 100, 1),
        "total_qc_checked": total_checked,
        "total_qc_fail": total_fail,
        "fail_rate_pct": fail_rate,
        "downtime_menit": total_downtime_min,
        "alert_aktif": len(active_alerts),
        "alert_sample": [a.get("message", "") for a in active_alerts[:3]],
        "wo_aktif": active_wos,
        "wo_overdue": overdue_wos,
    }


@router.get("/ai/daily-summary")
async def daily_summary(
    request: Request,
    target_date: Optional[str] = Query(None, alias="date"),
):
    user = await require_auth(request)
    db = get_db()
    key = await _get_llm_key_from_db(db)

    d = date.fromisoformat(target_date) if target_date else date.today()
    ctx = await _build_daily_context(db, d)

    prompt = f"""Kamu adalah asisten ERP pabrik rajut PT Rahaza. Buat RINGKASAN HARIAN produksi yang padat dan informatif dalam Bahasa Indonesia.

DATA HARI INI ({ctx['tanggal']}):
- Output: {ctx['total_output_pcs']} pcs (target {ctx['target_output_pcs']} pcs, efisiensi {ctx['efisiensi_pct']}%)
- QC: diperiksa {ctx['total_qc_checked']} pcs, gagal {ctx['total_qc_fail']} pcs (fail rate {ctx['fail_rate_pct']}%)
- Downtime mesin: {ctx['downtime_menit']} menit
- Alert aktif: {ctx['alert_aktif']} item{(': ' + ', '.join(ctx['alert_sample'])) if ctx['alert_sample'] else ''}
- WO aktif: {ctx['wo_aktif']}, WO overdue: {ctx['wo_overdue']}

Buat ringkasan 3-4 kalimat yang:
1. Menyebutkan performa output vs target
2. Menyoroti masalah QC atau downtime jika ada
3. Memberikan 1 rekomendasi tindakan utama
Jangan gunakan bullet points, cukup paragraf singkat."""

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key,
            session_id=f"daily-{d.isoformat()}-{user['id'][:8]}",
            system_message="Kamu adalah asisten ERP pabrik rajut yang memberikan ringkasan singkat, padat, dan actionable dalam Bahasa Indonesia."
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        response = await chat.send_message(UserMessage(text=prompt))
        summary_text = response if isinstance(response, str) else str(response)
    except Exception as e:
        logger.error(f"AI daily summary error: {e}")
        # Fallback: generate text-based summary without LLM
        eff = ctx['efisiensi_pct']
        summary_text = f"Produksi hari ini mencapai {ctx['total_output_pcs']} pcs dari target {ctx['target_output_pcs']} pcs (efisiensi {eff}%). "
        if ctx['fail_rate_pct'] > 10:
            summary_text += f"QC fail rate {ctx['fail_rate_pct']}% perlu perhatian. "
        if ctx['downtime_menit'] > 30:
            summary_text += f"Downtime mesin {ctx['downtime_menit']} menit tercatat hari ini. "
        if ctx['wo_overdue'] > 0:
            summary_text += f"Terdapat {ctx['wo_overdue']} WO overdue yang perlu segera ditindaklanjuti."

    # Save to audit log
    await db.rahaza_ai_audit_logs.insert_one({
        "id": _uid(), "user_id": user["id"], "feature": "daily_summary",
        "date": d.isoformat(), "created_at": _now().isoformat(),
    })

    return {
        "ok": True, "date": d.isoformat(),
        "context": ctx,
        "summary": summary_text,
        "generated_at": _now().isoformat(),
    }


@router.post("/ai/chat")
async def ai_chat(request: Request):
    user = await require_auth(request)
    db = get_db()
    key = await _get_llm_key_from_db(db)
    body = await request.json()
    message = (body.get("message") or "").strip()
    session_id = body.get("session_id") or f"chat-{user['id'][:8]}-{date.today().isoformat()}"
    if not message:
        raise HTTPException(400, "message wajib diisi.")

    # Fetch recent context for grounding
    ctx = await _build_daily_context(db, date.today())

    system_msg = f"""Kamu adalah asisten ERP pabrik rajut PT Rahaza. Jawab pertanyaan supervisor/manager tentang produksi, QC, dan inventori.

KONTEKS HARI INI:
- Output hari ini: {ctx['total_output_pcs']} pcs (target {ctx['target_output_pcs']} pcs)
- QC fail rate: {ctx['fail_rate_pct']}%
- Downtime: {ctx['downtime_menit']} menit
- Alert aktif: {ctx['alert_aktif']}
- WO aktif: {ctx['wo_aktif']}, overdue: {ctx['wo_overdue']}

Catatan:
- Jawab dalam Bahasa Indonesia yang singkat dan profesional
- Jika pertanyaan di luar konteks ERP produksi, arahkan kembali ke topik yang relevan
- Selalu berdasarkan data yang diberikan, jangan karang data"""

    # Load chat history from DB
    history_docs = await db.rahaza_ai_chat_history.find(
        {"session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).limit(20).to_list(None)

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key,
            session_id=session_id,
            system_message=system_msg
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        # Replay history into chat
        for h in history_docs:
            if h.get("role") == "user":
                await chat.send_message(UserMessage(text=h["content"]))

        response = await chat.send_message(UserMessage(text=message))
        reply = response if isinstance(response, str) else str(response)
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        reply = "Maaf, AI assistant sedang tidak tersedia. Silakan coba lagi nanti."

    # Save message + reply
    now_iso = _now().isoformat()
    await db.rahaza_ai_chat_history.insert_many([
        {"id": _uid(), "session_id": session_id, "user_id": user["id"], "role": "user", "content": message, "created_at": now_iso},
        {"id": _uid(), "session_id": session_id, "user_id": user["id"], "role": "assistant", "content": reply, "created_at": now_iso},
    ])

    return {"ok": True, "session_id": session_id, "reply": reply, "created_at": now_iso}


@router.get("/ai/history")
async def ai_history(request: Request, session_id: Optional[str] = None):
    user = await require_auth(request)
    db = get_db()
    if not session_id:
        session_id = f"chat-{user['id'][:8]}-{date.today().isoformat()}"
    history = await db.rahaza_ai_chat_history.find(
        {"session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(None)
    return {"session_id": session_id, "messages": history}


@router.post("/ai/root-cause")
async def ai_root_cause(request: Request):
    user = await require_auth(request)
    db = get_db()
    key = await _get_llm_key_from_db(db)
    body = await request.json()
    question = (body.get("question") or "").strip()
    if not question:
        raise HTTPException(400, "question wajib diisi.")

    # Collect relevant metrics
    from_ = (date.today() - timedelta(days=7)).isoformat()
    to = date.today().isoformat()

    qc_events = await db.rahaza_qc_events.find(
        {"created_at": {"$gte": from_, "$lte": to + "T23:59:59Z"}}, {"_id": 0}
    ).limit(200).to_list(None)
    total_checked = sum(e.get("checked_qty", 0) for e in qc_events)
    total_fail    = sum(e.get("fail_qty", 0) for e in qc_events)

    downtime_events = await db.rahaza_machine_downtime.find(
        {"start_at": {"$gte": from_, "$lte": to + "T23:59:59Z"}}, {"_id": 0}
    ).limit(50).to_list(None)
    total_dt_min = sum(e.get("duration_min", 0) for e in downtime_events)

    alerts = await db.rahaza_alerts.find(
        {"status": {"$in": ["active", "triggered"]}}, {"_id": 0}
    ).limit(10).to_list(None)

    context = f"""DATA PRODUKSI 7 HARI TERAKHIR ({from_} s/d {to}):
- QC: checked {total_checked} pcs, fail {total_fail} pcs (fail rate {round(total_fail/max(total_checked,1)*100,1)}%)
- Downtime total: {total_dt_min} menit dari {len(downtime_events)} kejadian
- Alert aktif: {len(alerts)} ({', '.join(a.get('message','')[:50] for a in alerts[:3])})
- Jumlah event QC: {len(qc_events)}"""

    prompt = f"""{context}

PERTANYAAN: {question}

Berikan analisis root cause dalam Bahasa Indonesia yang:
1. Identifikasi kemungkinan penyebab utama berdasarkan data
2. Sebutkan data pendukung (angka spesifik)
3. Rekomendasikan 2-3 tindakan korektif
Jawaban singkat, padat, max 200 kata."""

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key,
            session_id=f"root-cause-{_uid()[:8]}",
            system_message="Kamu adalah konsultan manufacturing yang ahli root cause analysis. Jawab berdasarkan data yang diberikan."
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        response = await chat.send_message(UserMessage(text=prompt))
        answer = response if isinstance(response, str) else str(response)
    except Exception as e:
        logger.error(f"Root cause error: {e}")
        answer = f"Berdasarkan data, fail rate QC {round(total_fail/max(total_checked,1)*100,1)}% dan downtime {total_dt_min} menit perlu investigasi lebih lanjut."

    return {"ok": True, "question": question, "analysis": answer, "data_period": f"{from_} s/d {to}"}


@router.post("/ai/smart-search")
async def ai_smart_search(request: Request):
    user = await require_auth(request)
    db = get_db()
    body = await request.json()
    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(400, "query wajib diisi.")

    results = []
    q_lower = query.lower()

    # Search WOs
    wos = await db.rahaza_work_orders.find({}, {"_id": 0}).limit(500).to_list(None)
    for wo in wos:
        wo_num = (wo.get("wo_number") or "").lower()
        status = (wo.get("status") or "").lower()
        # Check keywords
        match = (
            q_lower in wo_num or
            ("overdue" in q_lower and wo.get("due_date") and wo["due_date"] < date.today().isoformat() and status not in ["completed", "cancelled"]) or
            ("terlambat" in q_lower and wo.get("due_date") and wo["due_date"] < date.today().isoformat()) or
            ("aktif" in q_lower and status in ["in_production", "released"]) or
            ("selesai" in q_lower and status == "completed") or
            ("draft" in q_lower and status == "draft")
        )
        if match:
            results.append({"type": "work_order", "id": wo["id"], "label": wo.get("wo_number", wo["id"]), "status": wo.get("status")})
    # Search orders
    orders = await db.rahaza_orders.find({}, {"_id": 0}).limit(200).to_list(None)
    for o in orders:
        on = (o.get("order_number") or "").lower()
        cn = (o.get("customer_name") or "").lower()
        if q_lower in on or q_lower in cn:
            results.append({"type": "order", "id": o["id"], "label": o.get("order_number", o["id"]), "customer": o.get("customer_name")})
    # Search employees
    emps = await db.rahaza_employees.find({"active": True}, {"_id": 0}).limit(100).to_list(None)
    for e in emps:
        nm = (e.get("name") or "").lower()
        ec = (e.get("employee_code") or "").lower()
        if q_lower in nm or q_lower in ec:
            results.append({"type": "employee", "id": e["id"], "label": e.get("name", ""), "code": e.get("employee_code")})

    return {"ok": True, "query": query, "count": len(results), "results": results[:20]}


@router.get("/ai/predictive-delay")
async def predictive_delay(
    request: Request,
    wo_id: Optional[str] = None,
):
    user = await require_auth(request)
    db = get_db()

    if wo_id:
        wos = await db.rahaza_work_orders.find({"id": wo_id}, {"_id": 0}).to_list(None)
    else:
        wos = await db.rahaza_work_orders.find(
            {"status": {"$in": ["released", "in_production"]}}, {"_id": 0}
        ).limit(50).to_list(None)

    today = date.today()
    results = []
    for wo in wos:
        due = wo.get("due_date")
        qty_target    = wo.get("qty") or 0
        qty_produced  = wo.get("qty_produced") or 0
        qty_remaining = max(0, qty_target - qty_produced)
        if not due or qty_remaining == 0:
            continue
        due_date = date.fromisoformat(due[:10])
        days_left = (due_date - today).days

        # Simple linear forecast
        cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
        events = await db.rahaza_wip_events.find(
            {"event_type": "output", "created_at": {"$gte": cutoff}}, {"_id": 0}
        ).to_list(None)
        by_day: dict = {}
        for e in events:
            d = (e.get("created_at") or "")[:10]
            by_day[d] = by_day.get(d, 0) + (e.get("qty") or 0)
        avg_daily = max(sum(by_day.values()) / len(by_day), 1) if by_day else 30
        days_needed = int(qty_remaining / avg_daily) + 1
        prob_delay = 0.0
        if days_needed > days_left:
            prob_delay = min(100, round((days_needed - days_left) / max(days_needed, 1) * 100 + 30, 0))

        if prob_delay >= 40:
            risk_level = "high"
        elif prob_delay >= 20:
            risk_level = "medium"
        else:
            risk_level = "low"

        results.append({
            "wo_id": wo["id"],
            "wo_number": wo.get("wo_number", ""),
            "due_date": due,
            "days_left": days_left,
            "qty_remaining": qty_remaining,
            "avg_daily_output": round(avg_daily, 1),
            "days_needed": days_needed,
            "prob_delay_pct": prob_delay,
            "risk_level": risk_level,
            "message": f"WO {wo.get('wo_number','')} butuh ~{days_needed} hari lagi, tersisa {days_left} hari sebelum due date." if prob_delay > 0 else "",
        })

    results.sort(key=lambda x: x["prob_delay_pct"], reverse=True)
    return {"ok": True, "total": len(results), "high_risk": sum(1 for r in results if r["risk_level"] == "high"), "data": results}
