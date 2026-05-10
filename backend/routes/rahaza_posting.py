"""
PT Rahaza — Phase F2 Accounting Core
Shared posting helpers: translate business events into balanced JE (posted).

All posting is idempotent via (source_module, source_ref). On posting error,
we STORE the error on the source document (post_error) and return a dict with
`ok=False` so the caller can persist state — **we never raise, business ops keep going**.

Helpers:
  post_ar_invoice(db, invoice, user)         → AR Invoice issuance
  post_ar_payment(db, invoice, movement, user) → AR receipt (1 payment = 1 JE)
  post_ap_invoice(db, invoice, user)         → AP Invoice issuance
  post_ap_payment(db, invoice, movement, user) → AP disbursement
  post_expense(db, expense, user)            → Expense (cash or non-cash)
  post_payroll_run(db, run, user)            → Payroll finalize (F3)
  post_inventory_receive(db, movement, user) → Material receive (F3)
  post_inventory_issue(db, mi, user)         → Material issue (F3)
  post_inventory_adjust(db, movement, user)  → Material adjust (F3)
  post_cogs_shipment(db, shipment, user)     → COGS on dispatch (F3)
"""
import logging
import uuid
from datetime import datetime, timezone, date
from typing import Optional

from database import get_db
from routes.rahaza_posting_profiles import get_mapping

log = logging.getLogger(__name__)


def _uid(): return str(uuid.uuid4())
def _now(): return datetime.now(timezone.utc)


# ───────────────────────── Core JE builder ────────────────────────────────────
async def _ensure_period_open(db, d: date) -> Optional[str]:
    """Return None if OK, else error message string (graceful, no raise)."""
    ym = d.strftime("%Y-%m")
    per = await db.rahaza_periods.find_one({"period_code": ym})
    if per and per.get("status") in ("closed", "locked"):
        return f"Periode {ym} sudah {per['status']}. Posting ditolak."
    return None


async def _get_account(db, code: str):
    if not code:
        return None
    return await db.rahaza_coa_accounts.find_one({"code": code, "active": True}, {"_id": 0})


async def _gen_je_number(db, d: date) -> str:
    prefix = f"JE-{d.strftime('%Y%m%d')}-"
    cnt = await db.rahaza_journal_entries.count_documents({"je_number": {"$regex": f"^{prefix}"}})
    return f"{prefix}{cnt+1:04d}"


async def _find_existing_je(db, source_module: str, source_ref: str):
    return await db.rahaza_journal_entries.find_one(
        {"source_module": source_module, "source_ref": source_ref, "status": {"$ne": "voided"}},
        {"_id": 0},
    )


async def _create_posted_je(
    db,
    je_date: date,
    memo: str,
    source_module: str,
    source_ref: str,
    lines_raw: list,
    user: dict,
) -> dict:
    """Create a POSTED JE + mirror lines. Validates balance + account existence.
    Returns dict {ok, je_id, je_number, error?}."""
    # Normalize + validate lines
    total_d = 0.0
    total_c = 0.0
    norm = []
    for i, ln in enumerate(lines_raw):
        code = (ln.get("account_code") or "").strip()
        if not code:
            return {"ok": False, "error": f"Baris #{i+1}: account_code kosong (mapping CoA missing)."}
        acc = await _get_account(db, code)
        if not acc:
            return {"ok": False, "error": f"Baris #{i+1}: akun '{code}' tidak ditemukan/aktif."}
        if acc.get("is_group"):
            return {"ok": False, "error": f"Baris #{i+1}: akun '{code}' adalah header (non-postable)."}
        d_amt = float(ln.get("debit") or 0)
        c_amt = float(ln.get("credit") or 0)
        if d_amt < 0 or c_amt < 0:
            return {"ok": False, "error": f"Baris #{i+1}: nilai negatif tidak boleh."}
        if d_amt > 0 and c_amt > 0:
            return {"ok": False, "error": f"Baris #{i+1}: satu baris hanya debit ATAU credit."}
        if d_amt == 0 and c_amt == 0:
            continue  # skip zero-amount lines
        norm.append({
            "line_id": _uid(),
            "account_code": code,
            "account_name": acc.get("name"),
            "account_type": acc.get("type"),
            "debit": round(d_amt, 2),
            "credit": round(c_amt, 2),
            "description": (ln.get("description") or "").strip(),
            "cost_center_id": ln.get("cost_center_id") or None,
        })
        total_d += d_amt
        total_c += c_amt
    if len(norm) < 2:
        return {"ok": False, "error": "Jurnal harus minimal 2 baris."}
    if round(total_d, 2) != round(total_c, 2):
        return {"ok": False, "error": f"Jurnal tidak seimbang. Dr {total_d} ≠ Cr {total_c}."}

    # Period guard
    err = await _ensure_period_open(db, je_date)
    if err:
        return {"ok": False, "error": err}

    je_number = await _gen_je_number(db, je_date)
    je_id = _uid()
    je_doc = {
        "id": je_id,
        "je_number": je_number,
        "date": je_date.isoformat(),
        "memo": memo,
        "source_module": source_module,
        "source_ref": source_ref,
        "status": "posted",
        "total_debit": round(total_d, 2),
        "total_credit": round(total_c, 2),
        "lines": norm,
        "created_at": _now(),
        "updated_at": _now(),
        "posted_at": _now(),
        "posted_by": (user or {}).get("id") or "system",
        "created_by": (user or {}).get("id") or "system",
        "created_by_name": (user or {}).get("name", "system"),
        "voided_at": None,
        "voided_by": None,
    }
    await db.rahaza_journal_entries.insert_one(je_doc)

    # mirror lines for fast GL/TB
    rows = [{
        "id": _uid(),
        "je_id": je_id,
        "je_number": je_number,
        "date": je_doc["date"],
        "period_code": je_doc["date"][:7],
        "account_code": ln["account_code"],
        "account_name": ln["account_name"],
        "account_type": ln["account_type"],
        "debit": ln["debit"],
        "credit": ln["credit"],
        "description": ln.get("description", ""),
        "cost_center_id": ln.get("cost_center_id"),
        "source_module": source_module,
        "source_ref": source_ref,
        "created_at": _now(),
    } for ln in norm]
    if rows:
        await db.rahaza_journal_lines.insert_many(rows)

    return {"ok": True, "je_id": je_id, "je_number": je_number}


async def _void_je_by_source(db, source_module: str, source_ref: str, user: dict, reason: str = ""):
    je = await _find_existing_je(db, source_module, source_ref)
    if not je:
        return {"ok": True, "voided": False, "reason": "JE not found"}
    je_date = date.fromisoformat(je["date"])
    err = await _ensure_period_open(db, je_date)
    if err:
        return {"ok": False, "error": err}
    await db.rahaza_journal_entries.update_one(
        {"id": je["id"]},
        {"$set": {
            "status": "voided",
            "voided_at": _now(),
            "voided_by": (user or {}).get("id") or "system",
            "void_reason": reason,
            "updated_at": _now(),
        }},
    )
    await db.rahaza_journal_lines.delete_many({"je_id": je["id"]})
    return {"ok": True, "voided": True, "je_id": je["id"], "je_number": je["je_number"]}


async def _save_source_posting_result(db, collection: str, doc_id: str, result: dict):
    """Persist posting outcome on the source document."""
    if result.get("ok"):
        upd = {
            "gl_posted_at": _now(),
            "gl_je_id": result["je_id"],
            "gl_je_number": result["je_number"],
            "post_error": None,
            "post_error_at": None,
        }
    else:
        upd = {
            "post_error": result.get("error") or "Unknown posting error",
            "post_error_at": _now(),
        }
    try:
        await db[collection].update_one({"id": doc_id}, {"$set": upd})
    except Exception as e:
        log.warning(f"Failed to write posting result to {collection}/{doc_id}: {e}")


# ───────────────────────── AR POSTING ─────────────────────────────────────────
async def post_ar_invoice(db, invoice: dict, user: dict) -> dict:
    """Post AR Invoice (issuance). Dr AR / Cr Revenue (+ Cr Tax if tax_pct > 0).
    Idempotent via source_ref = invoice.id."""
    inv_id = invoice.get("id")
    source_ref = f"ar:{inv_id}"
    existing = await _find_existing_je(db, "ar_invoice", source_ref)
    if existing:
        return {"ok": True, "je_id": existing["id"], "je_number": existing["je_number"], "already_posted": True}

    mapping = await get_mapping(db, "ar_invoice")
    ar_code = mapping.get("debit_ar")
    rev_code = mapping.get("credit_revenue")
    tax_code = mapping.get("credit_tax_output")
    if not ar_code or not rev_code:
        result = {"ok": False, "error": "Mapping 'ar_invoice' belum lengkap (debit_ar/credit_revenue)."}
        await _save_source_posting_result(db, "rahaza_ar_invoices", inv_id, result)
        return result

    total = float(invoice.get("total") or 0)
    subtotal = float(invoice.get("subtotal") or 0)
    tax = float(invoice.get("tax_amount") or invoice.get("tax") or 0)
    try:
        je_date = date.fromisoformat((invoice.get("issue_date") or str(date.today()))[:10])
    except Exception:
        je_date = date.today()

    memo = f"AR Invoice {invoice.get('invoice_number')} · {invoice.get('customer_name') or ''}".strip()
    desc = f"Invoice {invoice.get('invoice_number')}"
    lines = [
        {"account_code": ar_code, "debit": total, "credit": 0, "description": desc},
        {"account_code": rev_code, "debit": 0, "credit": subtotal, "description": desc},
    ]
    if tax > 0 and tax_code:
        lines.append({"account_code": tax_code, "debit": 0, "credit": tax, "description": f"{desc} - PPN"})

    result = await _create_posted_je(db, je_date, memo, "ar_invoice", source_ref, lines, user)
    await _save_source_posting_result(db, "rahaza_ar_invoices", inv_id, result)
    return result


async def post_ar_payment(db, invoice: dict, amount: float, cash_account_id: Optional[str], payment_date: str, user: dict, movement_id: Optional[str] = None) -> dict:
    """Post AR receipt (1 payment). Dr Cash / Cr AR. idempotent via source_ref = movement_id or fallback."""
    inv_id = invoice.get("id")
    source_ref = f"arpay:{movement_id or inv_id + ':' + (payment_date or '')}:{int(round(amount))}"
    existing = await _find_existing_je(db, "ar_payment", source_ref)
    if existing:
        return {"ok": True, "je_id": existing["id"], "je_number": existing["je_number"], "already_posted": True}

    mapping = await get_mapping(db, "ar_payment")
    ar_code = mapping.get("credit_ar")
    cash_default = mapping.get("debit_cash_default")
    cash_code = cash_default
    # override from cash account if it has gl_account_code
    if cash_account_id:
        cash_acc = await db.rahaza_cash_accounts.find_one({"id": cash_account_id}, {"_id": 0})
        if cash_acc and cash_acc.get("gl_account_code"):
            cash_code = cash_acc["gl_account_code"]
    if not ar_code or not cash_code:
        result = {"ok": False, "error": "Mapping 'ar_payment' belum lengkap (credit_ar/debit_cash)."}
        # store on movement if available, else on invoice
        if movement_id:
            await _save_source_posting_result(db, "rahaza_cash_movements", movement_id, result)
        return result

    try:
        je_date = date.fromisoformat((payment_date or str(date.today()))[:10])
    except Exception:
        je_date = date.today()
    memo = f"Pembayaran AR {invoice.get('invoice_number')} · {invoice.get('customer_name') or ''}".strip()
    desc = f"Payment {invoice.get('invoice_number')}"
    lines = [
        {"account_code": cash_code, "debit": amount, "credit": 0, "description": desc},
        {"account_code": ar_code, "debit": 0, "credit": amount, "description": desc},
    ]
    result = await _create_posted_je(db, je_date, memo, "ar_payment", source_ref, lines, user)
    if movement_id:
        await _save_source_posting_result(db, "rahaza_cash_movements", movement_id, result)
    return result


# ───────────────────────── AP POSTING ─────────────────────────────────────────
async def post_ap_invoice(db, invoice: dict, user: dict) -> dict:
    """Post AP Invoice (issuance). Dr Expense (or Inventory) / Cr AP (+ Dr Tax Input if tax).
    MVP: default to expense account. Caller can tag invoice with `gl_debit_code` for override.
    Idempotent via source_ref."""
    inv_id = invoice.get("id")
    source_ref = f"ap:{inv_id}"
    existing = await _find_existing_je(db, "ap_invoice", source_ref)
    if existing:
        return {"ok": True, "je_id": existing["id"], "je_number": existing["je_number"], "already_posted": True}

    mapping = await get_mapping(db, "ap_invoice")
    ap_code = mapping.get("credit_ap")
    exp_default = invoice.get("gl_debit_code") or mapping.get("debit_expense_default")
    tax_code = mapping.get("debit_tax_input")
    if not ap_code or not exp_default:
        result = {"ok": False, "error": "Mapping 'ap_invoice' belum lengkap (credit_ap/debit_expense)."}
        await _save_source_posting_result(db, "rahaza_ap_invoices", inv_id, result)
        return result

    total = float(invoice.get("total") or 0)
    subtotal = float(invoice.get("subtotal") or 0)
    tax = float(invoice.get("tax_amount") or invoice.get("tax") or 0)
    try:
        je_date = date.fromisoformat((invoice.get("issue_date") or str(date.today()))[:10])
    except Exception:
        je_date = date.today()

    memo = f"AP Invoice {invoice.get('invoice_number')} · {invoice.get('vendor_name') or ''}".strip()
    desc = f"AP {invoice.get('invoice_number')}"
    lines = [
        {"account_code": exp_default, "debit": subtotal, "credit": 0, "description": desc},
        {"account_code": ap_code, "debit": 0, "credit": total, "description": desc},
    ]
    if tax > 0 and tax_code:
        lines.append({"account_code": tax_code, "debit": tax, "credit": 0, "description": f"{desc} - PPN Masukan"})

    result = await _create_posted_je(db, je_date, memo, "ap_invoice", source_ref, lines, user)
    await _save_source_posting_result(db, "rahaza_ap_invoices", inv_id, result)
    return result


async def post_ap_payment(db, invoice: dict, amount: float, cash_account_id: Optional[str], payment_date: str, user: dict, movement_id: Optional[str] = None) -> dict:
    """Post AP disbursement. Dr AP / Cr Cash."""
    inv_id = invoice.get("id")
    source_ref = f"appay:{movement_id or inv_id + ':' + (payment_date or '')}:{int(round(amount))}"
    existing = await _find_existing_je(db, "ap_payment", source_ref)
    if existing:
        return {"ok": True, "je_id": existing["id"], "je_number": existing["je_number"], "already_posted": True}

    mapping = await get_mapping(db, "ap_payment")
    ap_code = mapping.get("debit_ap")
    cash_default = mapping.get("credit_cash_default")
    cash_code = cash_default
    if cash_account_id:
        cash_acc = await db.rahaza_cash_accounts.find_one({"id": cash_account_id}, {"_id": 0})
        if cash_acc and cash_acc.get("gl_account_code"):
            cash_code = cash_acc["gl_account_code"]
    if not ap_code or not cash_code:
        result = {"ok": False, "error": "Mapping 'ap_payment' belum lengkap (debit_ap/credit_cash)."}
        if movement_id:
            await _save_source_posting_result(db, "rahaza_cash_movements", movement_id, result)
        return result

    try:
        je_date = date.fromisoformat((payment_date or str(date.today()))[:10])
    except Exception:
        je_date = date.today()
    memo = f"Pembayaran AP {invoice.get('invoice_number')} · {invoice.get('vendor_name') or ''}".strip()
    desc = f"AP Payment {invoice.get('invoice_number')}"
    lines = [
        {"account_code": ap_code, "debit": amount, "credit": 0, "description": desc},
        {"account_code": cash_code, "debit": 0, "credit": amount, "description": desc},
    ]
    result = await _create_posted_je(db, je_date, memo, "ap_payment", source_ref, lines, user)
    if movement_id:
        await _save_source_posting_result(db, "rahaza_cash_movements", movement_id, result)
    return result


# ───────────────────────── EXPENSE POSTING ────────────────────────────────────
async def post_expense(db, expense: dict, user: dict) -> dict:
    """Post Expense. Dr Expense / Cr Cash (if cash account) OR Cr AP clearing (if no cash)."""
    exp_id = expense.get("id")
    source_ref = f"exp:{exp_id}"
    existing = await _find_existing_je(db, "expense", source_ref)
    if existing:
        return {"ok": True, "je_id": existing["id"], "je_number": existing["je_number"], "already_posted": True}

    mapping = await get_mapping(db, "expense")
    exp_code = expense.get("gl_debit_code") or mapping.get("debit_expense_default")
    cash_default = mapping.get("credit_cash_default")
    cash_acc_id = expense.get("account_id")
    cash_code = cash_default
    if cash_acc_id:
        cash_acc = await db.rahaza_cash_accounts.find_one({"id": cash_acc_id}, {"_id": 0})
        if cash_acc and cash_acc.get("gl_account_code"):
            cash_code = cash_acc["gl_account_code"]
    if not exp_code or not cash_code:
        result = {"ok": False, "error": "Mapping 'expense' belum lengkap (debit_expense/credit_cash)."}
        await _save_source_posting_result(db, "rahaza_expenses", exp_id, result)
        return result

    amount = float(expense.get("amount") or 0)
    if amount <= 0:
        return {"ok": False, "error": "amount expense <= 0"}
    try:
        je_date = date.fromisoformat((expense.get("date") or str(date.today()))[:10])
    except Exception:
        je_date = date.today()
    memo = f"Expense: {expense.get('description') or expense.get('category') or ''}".strip()
    lines = [
        {"account_code": exp_code, "debit": amount, "credit": 0, "description": memo, "cost_center_id": expense.get("cost_center_id")},
        {"account_code": cash_code, "debit": 0, "credit": amount, "description": memo},
    ]
    result = await _create_posted_je(db, je_date, memo, "expense", source_ref, lines, user)
    await _save_source_posting_result(db, "rahaza_expenses", exp_id, result)
    return result


# ───────────────────────── VOID HELPERS (for cancel/reverse) ─────────────────
async def void_ar_invoice_posting(db, invoice_id: str, user: dict, reason: str = ""):
    return await _void_je_by_source(db, "ar_invoice", f"ar:{invoice_id}", user, reason)


async def void_ap_invoice_posting(db, invoice_id: str, user: dict, reason: str = ""):
    return await _void_je_by_source(db, "ap_invoice", f"ap:{invoice_id}", user, reason)


# ───────────────────────── F3 STUBS ───────────────────────────────────────────
async def post_payroll_run(db, run: dict, user: dict) -> dict:
    """Payroll finalize → JE. Dr Salary Expense / Cr Hutang Gaji (+PPh21 + BPJS if present).
    Idempotent via source_ref = payroll_run_id."""
    run_id = run.get("id")
    source_ref = f"payroll:{run_id}"
    existing = await _find_existing_je(db, "payroll_finalize", source_ref)
    if existing:
        return {"ok": True, "je_id": existing["id"], "je_number": existing["je_number"], "already_posted": True}

    mapping = await get_mapping(db, "payroll_finalize")
    sal_expense = mapping.get("debit_salary_expense")
    sal_payable = mapping.get("credit_salary_payable")
    pph21_code = mapping.get("credit_tax_pph21")
    bpjs_code = mapping.get("credit_bpjs_payable")
    if not sal_expense or not sal_payable:
        result = {"ok": False, "error": "Mapping 'payroll_finalize' belum lengkap."}
        await _save_source_posting_result(db, "rahaza_payroll_runs", run_id, result)
        return result

    total_gross = float(run.get("total_gross") or 0)
    total_net = float(run.get("total_net") or 0)
    total_deductions = float(run.get("total_deductions") or 0)
    # Breakdown deductions — MVP: simplistic. If run has bpjs_total/pph21_total, use them.
    pph21 = float(run.get("total_pph21") or 0)
    bpjs = float(run.get("total_bpjs_employee") or 0)
    other_ded = max(0, total_deductions - pph21 - bpjs)

    try:
        run_to = run.get("period_to") or str(date.today())
        je_date = date.fromisoformat(str(run_to)[:10])
    except Exception:
        je_date = date.today()
    memo = f"Payroll Run {run.get('run_number')} · {run.get('period_from')}–{run.get('period_to')}".strip()
    desc = f"Payroll {run.get('run_number')}"
    lines = [
        {"account_code": sal_expense, "debit": total_gross, "credit": 0, "description": desc},
    ]
    # Credit side: payable net + deductions
    if total_net > 0:
        lines.append({"account_code": sal_payable, "debit": 0, "credit": total_net, "description": f"{desc} - Net"})
    if pph21 > 0 and pph21_code:
        lines.append({"account_code": pph21_code, "debit": 0, "credit": pph21, "description": f"{desc} - PPh21"})
    if bpjs > 0 and bpjs_code:
        lines.append({"account_code": bpjs_code, "debit": 0, "credit": bpjs, "description": f"{desc} - BPJS"})
    if other_ded > 0 and total_net + pph21 + bpjs + other_ded == total_gross:
        # other deductions go to salary payable as well (stay as liability adjustment)
        lines.append({"account_code": sal_payable, "debit": 0, "credit": other_ded, "description": f"{desc} - Other Deductions"})

    result = await _create_posted_je(db, je_date, memo, "payroll_finalize", source_ref, lines, user)
    await _save_source_posting_result(db, "rahaza_payroll_runs", run_id, result)
    return result


async def post_inventory_receive(db, movement: dict, user: dict) -> dict:
    """Material receive → Dr Inventory RM / Cr AP clearing."""
    mv_id = movement.get("id")
    source_ref = f"mvrcv:{mv_id}"
    existing = await _find_existing_je(db, "inventory_receive", source_ref)
    if existing:
        return {"ok": True, "je_id": existing["id"], "je_number": existing["je_number"], "already_posted": True}

    mapping = await get_mapping(db, "inventory_receive")
    inv_code = mapping.get("debit_inventory_rm")
    ap_code = mapping.get("credit_ap_clearing")
    if not inv_code or not ap_code:
        result = {"ok": False, "error": "Mapping 'inventory_receive' belum lengkap."}
        await _save_source_posting_result(db, "rahaza_material_movements", mv_id, result)
        return result

    qty = float(movement.get("qty") or 0)
    unit_cost = float(movement.get("unit_cost") or 0)
    if unit_cost <= 0:
        # try enrich from material master
        mat_id = movement.get("material_id")
        mat = await db.rahaza_materials.find_one({"id": mat_id}, {"_id": 0}) if mat_id else None
        unit_cost = float((mat or {}).get("unit_cost") or 0)
    amount = qty * unit_cost
    if amount <= 0:
        result = {"ok": False, "error": f"Amount {amount} <= 0 (qty × unit_cost). Set unit_cost di material master."}
        await _save_source_posting_result(db, "rahaza_material_movements", mv_id, result)
        return result

    try:
        je_date = datetime.fromisoformat(str(movement.get("timestamp") or movement.get("created_at") or _now()).replace("Z", "+00:00")).date()
    except Exception:
        je_date = date.today()
    memo = f"Material Receive · {movement.get('material_name') or movement.get('material_id')}"
    desc = memo
    lines = [
        {"account_code": inv_code, "debit": amount, "credit": 0, "description": desc},
        {"account_code": ap_code, "debit": 0, "credit": amount, "description": desc},
    ]
    result = await _create_posted_je(db, je_date, memo, "inventory_receive", source_ref, lines, user)
    await _save_source_posting_result(db, "rahaza_material_movements", mv_id, result)
    return result


async def post_inventory_issue(db, mi: dict, user: dict) -> dict:
    """Material Issue confirmed → Dr WIP / Cr Inventory RM."""
    mi_id = mi.get("id")
    source_ref = f"mi:{mi_id}"
    existing = await _find_existing_je(db, "inventory_issue", source_ref)
    if existing:
        return {"ok": True, "je_id": existing["id"], "je_number": existing["je_number"], "already_posted": True}

    mapping = await get_mapping(db, "inventory_issue")
    wip_code = mapping.get("debit_wip")
    inv_code = mapping.get("credit_inventory_rm")
    if not wip_code or not inv_code:
        result = {"ok": False, "error": "Mapping 'inventory_issue' belum lengkap."}
        await _save_source_posting_result(db, "rahaza_material_issues", mi_id, result)
        return result

    # compute total amount from items × material unit_cost
    total = 0.0
    for it in (mi.get("items") or []):
        qty = float(it.get("qty_issued") or it.get("qty_required") or 0)
        if qty <= 0:
            continue
        mat = await db.rahaza_materials.find_one({"id": it.get("material_id")}, {"_id": 0})
        unit_cost = float((mat or {}).get("unit_cost") or 0)
        total += qty * unit_cost
    if total <= 0:
        result = {"ok": False, "error": "Total issue cost = 0 (materials tanpa unit_cost)."}
        await _save_source_posting_result(db, "rahaza_material_issues", mi_id, result)
        return result

    try:
        je_date = datetime.fromisoformat(str(mi.get("issued_at") or mi.get("created_at") or _now()).replace("Z", "+00:00")).date()
    except Exception:
        je_date = date.today()
    memo = f"Material Issue {mi.get('mi_number')} → WO {mi.get('work_order_id') or '-'}"
    lines = [
        {"account_code": wip_code, "debit": total, "credit": 0, "description": memo},
        {"account_code": inv_code, "debit": 0, "credit": total, "description": memo},
    ]
    result = await _create_posted_je(db, je_date, memo, "inventory_issue", source_ref, lines, user)
    await _save_source_posting_result(db, "rahaza_material_issues", mi_id, result)
    return result


async def post_inventory_adjust(db, movement: dict, user: dict) -> dict:
    """Material adjust (+ or -) → Dr/Cr Inventory vs Adjustment Expense."""
    mv_id = movement.get("id")
    source_ref = f"mvadj:{mv_id}"
    existing = await _find_existing_je(db, "inventory_adjust", source_ref)
    if existing:
        return {"ok": True, "je_id": existing["id"], "je_number": existing["je_number"], "already_posted": True}

    mapping = await get_mapping(db, "inventory_adjust")
    inv_code = mapping.get("inventory_rm")
    adj_code = mapping.get("adjustment_expense")
    if not inv_code or not adj_code:
        result = {"ok": False, "error": "Mapping 'inventory_adjust' belum lengkap."}
        await _save_source_posting_result(db, "rahaza_material_movements", mv_id, result)
        return result

    qty = float(movement.get("qty") or 0)
    mat_id = movement.get("material_id")
    mat = await db.rahaza_materials.find_one({"id": mat_id}, {"_id": 0}) if mat_id else None
    unit_cost = float((mat or {}).get("unit_cost") or 0)
    amount = abs(qty) * unit_cost
    if amount <= 0:
        result = {"ok": False, "error": "Amount adjust = 0 (set unit_cost material)."}
        await _save_source_posting_result(db, "rahaza_material_movements", mv_id, result)
        return result

    try:
        je_date = datetime.fromisoformat(str(movement.get("timestamp") or movement.get("created_at") or _now()).replace("Z", "+00:00")).date()
    except Exception:
        je_date = date.today()
    memo = f"Stock Adjust · {movement.get('material_name') or mat_id} · {qty}"
    # If qty > 0 → increase stock (Dr Inventory / Cr Adjustment). If qty < 0 → decrease (Dr Adjustment / Cr Inventory).
    if qty > 0:
        lines = [
            {"account_code": inv_code, "debit": amount, "credit": 0, "description": memo},
            {"account_code": adj_code, "debit": 0, "credit": amount, "description": memo},
        ]
    else:
        lines = [
            {"account_code": adj_code, "debit": amount, "credit": 0, "description": memo},
            {"account_code": inv_code, "debit": 0, "credit": amount, "description": memo},
        ]
    result = await _create_posted_je(db, je_date, memo, "inventory_adjust", source_ref, lines, user)
    await _save_source_posting_result(db, "rahaza_material_movements", mv_id, result)
    return result


async def post_cogs_shipment(db, shipment: dict, user: dict) -> dict:
    """Shipment dispatched → COGS posting based on HPP snapshots per WO in shipment items.
    Dr COGS Material+Labor+Overhead / Cr FG Inventory.
    """
    shp_id = shipment.get("id")
    source_ref = f"cogs:{shp_id}"
    existing = await _find_existing_je(db, "cogs_shipment", source_ref)
    if existing:
        return {"ok": True, "je_id": existing["id"], "je_number": existing["je_number"], "already_posted": True}

    mapping = await get_mapping(db, "cogs_shipment")
    dm = mapping.get("debit_cogs_material")
    dl = mapping.get("debit_cogs_labor")
    do = mapping.get("debit_cogs_overhead")
    cfg = mapping.get("credit_fg_inventory")
    if not all([dm, dl, do, cfg]):
        result = {"ok": False, "error": "Mapping 'cogs_shipment' belum lengkap."}
        await _save_source_posting_result(db, "rahaza_shipments", shp_id, result)
        return result

    # Aggregate HPP from snapshots per WO in shipment items; fallback to 0 if no snapshot.
    items = shipment.get("items") or []
    wo_ids = list({it.get("work_order_id") or it.get("wo_id") for it in items if it.get("work_order_id") or it.get("wo_id")})
    snapshots = await db.rahaza_hpp_snapshots.find({"work_order_id": {"$in": wo_ids}}, {"_id": 0}).to_list(None) if wo_ids else []
    snap_by_wo = {s["work_order_id"]: s for s in snapshots}

    total_material = 0.0
    total_labor = 0.0
    total_overhead = 0.0
    for it in items:
        wo_id = it.get("work_order_id") or it.get("wo_id")
        qty = float(it.get("qty") or 0)
        snap = snap_by_wo.get(wo_id)
        if not snap:
            continue
        qty_completed = float(snap.get("qty_completed") or snap.get("qty") or 1)
        if qty_completed <= 0:
            qty_completed = 1
        total_material += float(snap.get("material_cost") or 0) * (qty / qty_completed)
        total_labor += float(snap.get("labor_cost") or 0) * (qty / qty_completed)
        total_overhead += float(snap.get("overhead_cost") or 0) * (qty / qty_completed)

    total_cogs = total_material + total_labor + total_overhead
    if total_cogs <= 0:
        result = {"ok": False, "error": "COGS = 0 (HPP snapshot tidak ditemukan untuk WO pada shipment)."}
        await _save_source_posting_result(db, "rahaza_shipments", shp_id, result)
        return result

    try:
        je_date = datetime.fromisoformat(str(shipment.get("dispatched_at") or shipment.get("shipment_date") or _now()).replace("Z", "+00:00")).date()
    except Exception:
        je_date = date.today()
    memo = f"COGS Shipment {shipment.get('shipment_number')}"
    lines = []
    if total_material > 0:
        lines.append({"account_code": dm, "debit": round(total_material, 2), "credit": 0, "description": f"{memo} - Material"})
    if total_labor > 0:
        lines.append({"account_code": dl, "debit": round(total_labor, 2), "credit": 0, "description": f"{memo} - Labor"})
    if total_overhead > 0:
        lines.append({"account_code": do, "debit": round(total_overhead, 2), "credit": 0, "description": f"{memo} - Overhead"})
    lines.append({"account_code": cfg, "debit": 0, "credit": round(total_cogs, 2), "description": f"{memo} - FG Inventory"})

    result = await _create_posted_je(db, je_date, memo, "cogs_shipment", source_ref, lines, user)
    await _save_source_posting_result(db, "rahaza_shipments", shp_id, result)
    return result
