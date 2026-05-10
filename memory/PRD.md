# PT Rahaza ERP — Product Requirements Document

**Last Updated:** 2026-05-08
**Status:** Active Development

---

## Original Problem Statement
PT Rahaza ERP — garment manufacturing ERP system for a rajut (knitting) factory.
Repository: https://github.com/pandekomangyogaswastika-dot/garmentrahaza26

---

## Architecture
- **Backend:** FastAPI + MongoDB (Motor async) — 68+ route files
- **Frontend:** React + Tailwind CSS + shadcn/ui — 144+ ERP components
- **Auth:** JWT (HS256) with role-based access control
- **AI:** Emergent LLM Key (AI Insights module)

---

## What's Been Implemented

### Phase 1 (Migration) — COMPLETE ✅
- Full codebase migrated from GitHub repo to /app
- Backend starts cleanly, /api/docs works
- Seed/reset endpoint works
- Login works with JWT

### Phase 2 (Warehouse UX) — COMPLETE ✅
- Critical stock visibility, bulk CSV import, barcode scan
- Excel export, stock filter by location, heatmap
- Expiry lot tracking, reorder point alerts

### Phase 3 (Style Master 2.0) — COMPLETE ✅
- Multi-photo upload, tech-pack PDF
- Size chart per size, costing from BOM × unit_cost

### Phase 4 (UI Polish) — COMPLETE ✅
- DataTable smart defaults, tooltips, combobox upgrades
- Work Orders default filter (not_completed), due date coloring

### End-to-End Payroll Verification (WO Rates) — 2026-05-08 COMPLETE ✅
- **Verifikasi**: Run payroll April 2026 untuk 18 karyawan → total **Rp 37.128.700**, semua slip > 0
- **WO Rate sourcing terbukti bekerja**: 8 operator (LINKING/SEWING_S1-S3/STEAM/PACKING/QC) earnings ber-tag `rate_source='wo_rate'`. 4 Rajut operator earnings ber-tag `rate_source='profile_hourly'`. Monthly staff ber-tag `rate_source='base_monthly'`.
- **Bug UI Rp 0 di Payroll Run Detail Modal — FIXED** (`/app/frontend/src/components/erp/RahazaPayrollRunModule.jsx`):
  - Sebelumnya: kolom Gaji Pokok/Transport/Tunjangan/Bonus baca field schema lama (`s.base_salary`, `s.transport_allowance`, `s.overtime_pay`, `s.net_salary`) → semua Rp 0
  - Sekarang: kolom Karyawan, Skema, Hadir/Jam, Pendapatan, Lembur, Potongan, Net pakai `s.earnings_total`, `s.overtime_amount`, `s.deductions_total`, `s.net_pay` (schema baru). Hover Pendapatan untuk lihat breakdown earnings + rate_source per item
- **Backend `rate_source` lengkap**: monthly/weekly/hourly base earnings sekarang juga punya `rate_source` (base_monthly/base_weekly/base_hourly) untuk konsistensi schema
- **Backend tests dibuat** di `/app/backend/tests/backend_test.py` — 11 test cases, 10/10 passed (1 skipped due to seed idempotency)
- **Testing agent verifikasi**: Backend 100%, Frontend 100% pada flow payroll modal

### Phase 5 (Production Flow Redesign P1-P9) — COMPLETE ✅
- P1: WO status in_progress → in_production fixed
- P2: Lusin+Pcs dual input across all production UIs
- P3: LineBoardModule per-PO with employee-first assignment
- P4: Hide "Line" concept from primary UX
- P5: Sewing 3 sub-processes sequential (S1/S2/S3)
- P6: WO process_rates (borongan per model+size)
- P7: Payroll calculation via WO.process_rates with fallback chain
- P8: Employee form cleanup (remove base_rate/wage_scheme)
- P9: Material Planning (BOM awal + akhir di WO)

### WO Rate Matrix per PO (model × size × proses) — 2026-05-08 COMPLETE ✅
- **Backend**: `generate-work-orders` endpoint diperbaiki — sekarang menerima `item_rates` per item PO, menyimpan `process_rates` di setiap WO, dan populate `model_name`/`size_name` dari DB join
- **Frontend**: Generate WO flow diganti dari `confirm()` menjadi **Rate Setup Modal** dengan matrix interaktif:
  - Rows = item PO (model × size)
  - Columns = proses aktif (RAJUT/jam, LINKING/pcs, SEWING_S1-S3/pcs, STEAM, QC, PACKING)
  - Pre-filled dari payroll profiles sebagai default
  - Setiap cell editable untuk beda rate per model×size per proses
  - Tombol "Salin baris 1 ke semua" untuk rate seragam
- **Payroll chain**: WO.process_rates → profile.pcs_process_rates → base_rate (tidak berubah, tapi sekarang WO rates terisi saat generate)

- **12 operator produksi** dikonfigurasi dengan per-process wage scheme:
  - RAJUT (4 orang): `RAJUT:HOURLY Rp 8.500/jam` — Ahmad Fauzi, Siti Aminah, Dedi Kurniawan, Yuni Lestari
  - LINKING (2 orang): `LINKING:PCS Rp 350/pcs`
  - SEWING (2 orang): `SEWING_S1:PCS Rp 300 | SEWING_S2:PCS Rp 250 | SEWING_S3:PCS Rp 200`
  - STEAM (1 orang): `STEAM:PCS Rp 150/pcs`
  - PACKING (1 orang): `PACKING:PCS Rp 125/pcs`
  - QC (2 orang): `QC:PCS Rp 100/pcs`
- **6 staff non-produksi** dikonfigurasi monthly: Supervisor Rp 4.5–5 juta, Staff Rp 3.5–3.75 juta, Admin/Akuntan Rp 4.5–5 juta
- Verified: Rajut operators dapat Rp 1.6–1.7 juta/bulan (192–200 jam × Rp 8.500), Linking dapat sesuai output WIP

- **WO model_name/size_name**: Seed & board API diperbaiki → WO picker di LineBoardModule kini menampilkan "Polo Sport Knit · S", "Cardigan Classic Wool · M", dll
- **Per-Process Wage Scheme**: `pcs_process_rates` kini punya field `scheme: "pcs" | "hourly"` per entry. Backend kalkulasi: hourly entry → `jam_hadir × rate`, pcs entry → `wip_output × rate`. Exclude proses hourly dari WIP event loop (no double-counting).
- **UI Payroll Profile**: Section "Rate per Proses" tampil untuk scheme `pcs` dan `hourly`, dengan scheme-toggle per baris (Borongan Pcs/Jam), unit otomatis berubah ke "jam" saat hourly dipilih, dan info panel yang menjelaskan perbedaan.

- C1: WO in_progress → in_production in ALL 8 files fixed
- C2: flow_summary() sewing aggregation fixed (SEWING_S3 output)
- C3: QuickInputPanel SEWING → SEWING_S1/S2/S3 fixed
- C4: BOM Module free-text → dropdown from materials master
- M1-M4: Medium issues (dedup rates, negative qty, BOM concurrency, payroll CAS)

---

## Core Modules (All Portals)

| Portal | Key Modules |
|--------|-------------|
| Manajemen | Dashboard, Models, Sales Orders, Reports, AI Insights |
| Produksi | LineBoardModule, Work Orders, Process Execution, Backlog |
| Gudang | Materials, PO, Stock Receive/Issue, Opname, Heatmap |
| Keuangan | COA, Journals, AR/AP, Finance Reports, HPP |
| SDM | Employees, Attendance, Leave, Payroll, HR Reports |
| Saya | Self-service attendance, payslip |

---

## Prioritized Backlog

### P0 (Critical — already fixed)
- All Phase 5 + Phase 9 issues resolved

### P1 (Next Sprint — User to confirm)
- Phase 6: Finance Enhancement (Cash Flow, PPN/PPh, Budgets)
- Phase 7: Notification Stack (WhatsApp/Telegram)
- Phase 8: Decision Support Dashboards

### P2 (Future)
- Mobile app / PWA
- Advanced MRP
- Customer portal

---

## Tech Credentials
- Admin: admin@garment.com / Admin@123
- JWT Secret: in /app/backend/.env
- Emergent LLM Key: in /app/backend/.env


---

## 🆕 [UPDATED 2026-05-10] Phase 2 Addendum — FG Inventory + Delivery + User Guide

> Catatan tambahan tanpa menghapus konten PRD asli di atas.

### Tujuan

Menutup gap operasional pasca-produksi: setelah WO selesai, barang jadi (FG)
harus tercatat di inventory dan bisa dikirim ke customer dengan kontrol qty
yang ketat.

### Requirements Baru (Confirmed)

#### R-FG-01 — FG Inventory Auto-Increment

- Saat WO transition ke `completed`, sistem **wajib** menambah FG stock di
  koleksi `rahaza_fg_stock` (key: `model_id` + `size_id`).
- WO yang `completed_qty=0` tidak boleh transit ke `completed`.
- Rework guard tetap berlaku (pending rework > 0 → 409 block).

#### R-FG-02 — FG Inventory Decrement on Delivery

- Saat delivery dispatch, FG dikurangi sesuai qty per item.
- Tidak boleh dispatch jika qty > FG available atau FG = 0.

#### R-DL-01 — Delivery Module dengan 4 Tipe

| Tipe       | Aturan                                                    |
| ---------- | --------------------------------------------------------- |
| Standard   | 1 PO → 1 surat jalan, qty ≤ FG produced                   |
| Batch      | Multi PO dalam 1 surat jalan (customer harus sama)        |
| Return     | Customer return → FG re-increment + alasan tracking       |
| Partial    | Multiple dispatch per PO/WO → kumulatif ≤ produced qty    |

#### R-UG-01 — In-App User Guide S1–S10

- HelpGuideModule menampilkan 10 skenario lengkap (Production + Payroll).
- Bahasa Indonesia, narasi cerita pabrik realistis.
- Akses dari sidebar setiap portal (Help & Guide).

### Constraints (Confirmed dari User)

- Input qty pengiriman **hanya boleh** sesuai produced qty (maksimal).
- Multiple dispatch diizinkan (untuk shipment partial).
- Tidak boleh dispatch jika FG = 0.
- Harus berdasarkan PO Number (dropdown valid order saja).

### Files Touched

- `/app/backend/routes/rahaza_work_orders.py` (FG increment trigger)
- `/app/backend/routes/rahaza_deliveries.py` (NEW — full module)
- `/app/backend/server.py` (registered router)
- `/app/frontend/src/components/erp/RahazaDeliveriesModule.jsx` (NEW)
- `/app/frontend/src/components/erp/PortalShell.jsx` (sidebar)
- `/app/frontend/src/components/erp/moduleRegistry.js` (routing)
- `/app/frontend/src/components/erp/userGuide/guideData.js` (S1–S10)

### Pending — P0

- **Verifikasi end-to-end** Inventory Material Issue + Payroll API.
  Agent sebelumnya melaporkan test sukses tapi script sebenarnya 404.

### Status: 🟢 DELIVERED (logic) | 🟡 PENDING (E2E validation)

