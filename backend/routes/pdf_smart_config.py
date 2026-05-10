"""
Smart PDF Configuration — Phase 23
─────────────────────────────────────────
Modul khusus untuk fitur konfigurasi PDF tingkat lanjut:
- Metadata tipe PDF (sections, customizable labels, default config)
- Upload logo per preset (Emergent Object Storage)
- Live preview PDF berdasarkan draft config + dummy data
- Stream/serve logo image

Endpoint:
- GET    /api/pdf-smart-config/types
- GET    /api/pdf-smart-config/types/{pdf_type}
- POST   /api/pdf-smart-config/upload-logo
- GET    /api/pdf-smart-config/logo/{path:path}
- POST   /api/pdf-smart-config/preview
"""
from __future__ import annotations
import io
import logging
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse, Response

from database import get_db
from auth import require_auth, log_activity, serialize_doc
from storage import put_object, get_object, generate_storage_path
from utils.pdf_config_resolver import (
    PDF_SECTION_DEFINITIONS,
    PDF_CUSTOMIZABLE_LABELS,
    DEFAULT_LABELS,
    default_config,
    merge_config,
    resolve_pdf_config,
    get_type_metadata,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pdf-smart-config", tags=["pdf-smart-config"])

SUPPORTED_TYPES = [
    # ── Operational Documents (Phase 23) ──
    {"key": "lkp",          "label": "Lembar Kerja Produksi (LKP)",  "group": "Production",   "advanced": True},
    {"key": "payslip",      "label": "Slip Gaji",                    "group": "HR",           "advanced": True},
    {"key": "shift-report", "label": "Laporan Shift / Handover",     "group": "Production",   "advanced": True},
    # ── Existing Document/Report types (kolom-only, masih dipakai) ──
    {"key": "production-po",            "label": "SPP (Surat Perintah Produksi)",   "group": "Documents", "advanced": False},
    {"key": "vendor-shipment",          "label": "Surat Jalan Material",            "group": "Documents", "advanced": False},
    {"key": "buyer-shipment-dispatch",  "label": "Surat Jalan Buyer (Dispatch)",    "group": "Documents", "advanced": False},
    {"key": "production-report",        "label": "Laporan Produksi Lengkap",        "group": "Documents", "advanced": False},
    {"key": "report-production",        "label": "Report: Produksi",                "group": "Reports",   "advanced": False},
    {"key": "report-progress",          "label": "Report: Progres",                 "group": "Reports",   "advanced": False},
    {"key": "report-financial",         "label": "Report: Keuangan",                "group": "Reports",   "advanced": False},
    {"key": "report-shipment",          "label": "Report: Pengiriman",              "group": "Reports",   "advanced": False},
    {"key": "report-defect",            "label": "Report: Defect",                  "group": "Reports",   "advanced": False},
    {"key": "report-return",            "label": "Report: Retur",                   "group": "Reports",   "advanced": False},
    {"key": "report-missing-material",  "label": "Report: Material Hilang",         "group": "Reports",   "advanced": False},
    {"key": "report-replacement",       "label": "Report: Pengganti",               "group": "Reports",   "advanced": False},
    {"key": "report-accessory",         "label": "Report: Aksesoris",               "group": "Reports",   "advanced": False},
]


# ─────────────────────────────────────────────────────────────────
# 1. Type metadata
# ─────────────────────────────────────────────────────────────────
@router.get("/types")
async def list_types(request: Request):
    """List semua tipe PDF + grouping. Frontend pakai ini untuk render menu."""
    await require_auth(request)
    return {"types": SUPPORTED_TYPES}


@router.get("/types/{pdf_type}")
async def get_type_meta(pdf_type: str, request: Request):
    """Detail metadata untuk satu tipe (sections + customizable labels + default config)."""
    await require_auth(request)
    if pdf_type not in [t["key"] for t in SUPPORTED_TYPES]:
        raise HTTPException(404, f"Unknown pdf_type: {pdf_type}")
    return get_type_metadata(pdf_type)


# ─────────────────────────────────────────────────────────────────
# 2. Logo upload (Emergent Object Storage)
# ─────────────────────────────────────────────────────────────────
@router.post("/upload-logo")
async def upload_logo(request: Request, file: UploadFile = File(...)):
    """Upload custom logo untuk dipakai di preset PDF.
    Mengembalikan { object_path: "...", url: "/api/pdf-smart-config/logo/..." }"""
    user = await require_auth(request)
    if not file.filename:
        raise HTTPException(400, "No file uploaded")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "png"
    if ext not in ("png", "jpg", "jpeg", "webp"):
        raise HTTPException(400, "Logo harus berformat PNG/JPG/WEBP")
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:    # 2MB cap
        raise HTTPException(400, "Logo terlalu besar (maks 2MB)")
    path = generate_storage_path(user.get("id", "anon"), file.filename)
    try:
        put_object(path, content, file.content_type or f"image/{ext}")
    except Exception as e:
        log.error(f"Logo upload failed: {e}")
        raise HTTPException(500, f"Upload gagal: {e}")
    await log_activity(user["id"], user.get("name", ""), "upload", "pdf_config_logo", f"Uploaded PDF config logo: {path}")
    return {
        "object_path": path,
        "url": f"/api/pdf-smart-config/logo?path={path}",
        "size": len(content),
        "content_type": file.content_type or f"image/{ext}",
    }


@router.get("/logo")
async def serve_logo(request: Request, path: str):
    """Stream logo image dari Emergent Object Storage."""
    await require_auth(request)
    try:
        data, ctype = get_object(path)
    except Exception as e:
        raise HTTPException(404, f"Logo tidak ditemukan: {e}")
    return Response(content=data, media_type=ctype or "image/png", headers={
        "Cache-Control": "private, max-age=3600",
    })


# ─────────────────────────────────────────────────────────────────
# 3. Live Preview
# ─────────────────────────────────────────────────────────────────
def _dummy_data_lkp() -> dict:
    """Dummy LKP content for live preview (mirrors structure expected by build_lkp_pdf)."""
    return {
        "lkp_number": "LKP-2025-DEMO-001",
        "version": 2,
        "status_label": "RELEASED",
        "print_date": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "printed_by": "Demo Supervisor",
        "company_name": "PT RAHAZA GLOBAL INDONESIA",
        "company_addr": "Knit Garment Manufacturing — Production Work Sheet",
        "qr_data": "LKP-2025-DEMO-001",
        "order": {
            "order_number": "PO-CUST-2025-1042",
            "customer_name": "Demo Buyer Co., Ltd",
            "order_date": "2025-09-15",
            "deadline": "2025-11-30",
            "currency": "USD",
        },
        "work_order": {
            "wo_number": "WO-2025-0421",
            "release_date": "2025-09-20",
            "qty_total": 1500,
            "size_breakdown": "S:300 / M:500 / L:500 / XL:200",
        },
        "model": {
            "name": "Polo Shirt Classic",
            "sku": "PSH-CLS-2025",
            "color": "Navy / White",
            "fabric": "Cotton Pique 220 GSM",
            "category": "Polo",
        },
        "bom": [
            {"material": "Cotton Yarn 30/1", "code": "YRN-CTN-30-1", "qty": 250, "unit": "kg"},
            {"material": "Polo Buttons 18L", "code": "BTN-18L-NVY",  "qty": 4500, "unit": "pcs"},
            {"material": "Care Label",       "code": "LBL-CARE-EN",  "qty": 1500, "unit": "pcs"},
            {"material": "Polybag 30x40",    "code": "PKG-PB-3040",  "qty": 1500, "unit": "pcs"},
        ],
        "assignment": [
            {"role": "Cutting Operator",   "name": "Budi Santoso", "line": "Cut-A"},
            {"role": "Sewing Line Lead",   "name": "Siti Rahmah",  "line": "Sew-3"},
            {"role": "QC Inspector",       "name": "Agus Wijaya",  "line": "QC-1"},
        ],
        "process_steps": [
            {"seq": 1, "name": "Cutting",   "sam": 12.0, "machine": "Cutter Auto"},
            {"seq": 2, "name": "Sewing",    "sam": 28.0, "machine": "Single Needle"},
            {"seq": 3, "name": "Finishing", "sam": 8.0,  "machine": "Steam Press"},
            {"seq": 4, "name": "QC",        "sam": 4.5,  "machine": "Manual Check"},
            {"seq": 5, "name": "Packing",   "sam": 6.0,  "machine": "Packing Table"},
        ],
        "sop": [
            {"step": "Pre-cut", "instruction": "Periksa lebar kain & shading sebelum spreading."},
            {"step": "Sewing",  "instruction": "Gunakan SPI 11-12 untuk seam utama; bartack 4mm."},
            {"step": "Finish",  "instruction": "Press dengan suhu 150°C; jangan sampai mengkilap."},
        ],
        "qc_checkpoints": [
            {"name": "Inline AQL",   "freq": "Per 50 pcs", "criteria": "AQL 2.5 Major"},
            {"name": "Final QC",     "freq": "100%",        "criteria": "Visual + Dimensional"},
            {"name": "Pre-shipment", "freq": "Random 32 pcs", "criteria": "AQL 2.5 / 4.0"},
        ],
        "packing": [
            "1 pcs per polybag dengan size sticker",
            "12 pcs per inner box, 60 pcs per master carton",
            "Master carton dimensi 60 × 40 × 35 cm",
        ],
        "notes": "Material extra 3% sudah dialokasikan untuk replacement. Foto sample wajib dilampirkan ke QC report.",
    }


def _dummy_data_payslip() -> tuple[dict, dict]:
    """Dummy slip + run."""
    period_from = "2025-09-01"
    period_to = "2025-09-30"
    slip = {
        "id": "demo-slip-001",
        "employee_name": "Demo Karyawan",
        "employee_code": "EMP-1042",
        "nik": "3201xxxxxxx0001",
        "npwp": "12.345.678.9-012.000",
        "department": "Sewing",
        "position": "Operator Senior",
        "tenure": "3 tahun 4 bulan",
        "period_from": period_from,
        "period_to": period_to,
        "pay_scheme": "monthly",
        "days_hadir": 24,
        "total_hours_worked": 192,
        "overtime_hours": 12,
        "overtime_rate": 28000,
        "overtime_amount": 336000,
        "earnings": [
            {"label": "Gaji Pokok",         "qty": 1, "unit": "bln",  "amount": 4500000},
            {"label": "Tunjangan Jabatan",  "qty": 1, "unit": "bln",  "amount": 500000},
            {"label": "Tunjangan Transport","qty": 24,"unit": "hari", "amount": 360000},
            {"label": "Tunjangan Makan",    "qty": 24,"unit": "hari", "amount": 480000},
            {"label": "Bonus Kehadiran",    "qty": 1, "unit": "",     "amount": 200000},
        ],
        "gross_pay": 6376000,
        "deductions": [
            {"label": "BPJS Kesehatan (1%)",         "amount": 45000},
            {"label": "BPJS Ketenagakerjaan (2%)",   "amount": 90000},
            {"label": "PPh 21",                      "amount": 95000},
            {"label": "Kasbon",                      "amount": 250000},
        ],
        "total_deductions": 480000,
        "net_pay": 5896000,
        "notes": "Slip ini adalah preview untuk konfigurasi PDF.",
    }
    run = {"run_number": "PR-2025-09-DEMO", "period_from": period_from, "period_to": period_to}
    return slip, run


def _dummy_data_shift_report() -> dict:
    """Dummy handover dict for live preview (matches rahaza_shift_handovers schema)."""
    return {
        "id": "demo-handover-001",
        "date": "2025-09-25",
        "shift_code": "S1",
        "shift_name": "Shift 1 (06:00-14:00)",
        "supervisor_name": "Siti Rahmah",
        "created_by_name": "Siti Rahmah",
        "status": "signed_off",
        "signed_off_at": "2025-09-25T14:05:00Z",
        "signed_off_by_name": "Budi Santoso",
        "sign_off_notes": "Serah terima lancar, semua issue sudah didokumentasikan.",
        "created_at": "2025-09-25T06:00:00Z",
        "notes": "Output mencapai 96% target. Defect rate 2.5% (di bawah threshold 3%). Mesin 12 perlu monitoring lanjutan.",
        "checklist": [
            {"label": "Mesin & alat dalam kondisi baik",       "value": True,  "notes": "Kecuali mesin 12 (sudah diperbaiki)"},
            {"label": "Stok material cukup untuk shift berikut", "value": True,  "notes": ""},
            {"label": "Area kerja bersih dan rapi",            "value": True,  "notes": ""},
            {"label": "Dokumen produksi lengkap",              "value": True,  "notes": ""},
            {"label": "Tidak ada defect critical pending",     "value": False, "notes": "1 batch perlu re-inspect"},
        ],
        "issues": [
            {"type": "machine",  "priority": "high",   "description": "Mesin 12 macet karena bobbin tersangkut (15 menit downtime). Sudah diperbaiki, butuh pengecekan lanjutan shift berikut."},
            {"type": "material", "priority": "medium", "description": "Label care kurang 50 pcs untuk batch B. Susulan dikirim 11:30."},
            {"type": "quality",  "priority": "low",    "description": "Reject rate batch 2: 3.2% (target 2%). Perlu re-training operator pada metode bartack."},
        ],
        "pending_tasks": [
            {"description": "Re-inspect 1 batch yang ditahan QC",     "assigned_to": "QC Team Shift 2"},
            {"description": "Monitoring mesin 12 selama 2 jam pertama", "assigned_to": "Maintenance"},
            {"description": "Briefing operator metode bartack baru",   "assigned_to": "Line Lead Sew-3"},
        ],
    }


@router.post("/preview")
async def preview_pdf(request: Request):
    """
    Generate preview PDF berdasarkan draft config + dummy data.
    Body:
        { pdf_type: 'lkp'|'payslip'|'shift-report', config: { ... draft ... } }
    Atau:
        { pdf_type: 'lkp', config_id: '<existing preset id>' }
    """
    await require_auth(request)
    db = get_db()
    body = await request.json()
    pdf_type = body.get("pdf_type", "")
    if pdf_type not in ("lkp", "payslip", "shift-report"):
        raise HTTPException(400, "preview hanya tersedia untuk lkp/payslip/shift-report")

    # Resolve config
    if body.get("config_id"):
        cfg = await resolve_pdf_config(db, pdf_type, body["config_id"])
    else:
        cfg = merge_config(body.get("config") or {}, pdf_type)

    # Dispatch to renderer
    try:
        if pdf_type == "lkp":
            from utils.lkp_pdf import build_lkp_pdf
            content = _dummy_data_lkp()
            content["_preview_watermark"] = "PREVIEW"
            pdf_bytes = build_lkp_pdf(content, image_files=None, production_image_files=None, config=cfg)
            buf = io.BytesIO(pdf_bytes)
        elif pdf_type == "payslip":
            from routes.rahaza_payroll import _build_payslip_pdf
            slip, run = _dummy_data_payslip()
            buf = _build_payslip_pdf(slip, run, config=cfg)
        else:    # shift-report
            from utils.shift_report_pdf import build_shift_report_pdf
            content = _dummy_data_shift_report()
            wo_summary = [
                {"wo_number": "WO-2025-0421", "model_code": "PSH-CLS-2025", "qty": 500, "qty_produced": 480, "qty_passed_qc": 468, "status": "in_progress"},
                {"wo_number": "WO-2025-0422", "model_code": "TSH-BSC-2025", "qty": 800, "qty_produced": 800, "qty_passed_qc": 792, "status": "completed"},
            ]
            pdf_bytes = build_shift_report_pdf(content, wo_summary=wo_summary, config=cfg)
            buf = io.BytesIO(pdf_bytes)
    except Exception as e:
        log.error(f"Preview generation failed for {pdf_type}: {e}", exc_info=True)
        raise HTTPException(500, f"Gagal generate preview: {e}")

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=preview_{pdf_type}.pdf",
            "Cache-Control": "no-store",
            "X-Preview": "1",
        },
    )
