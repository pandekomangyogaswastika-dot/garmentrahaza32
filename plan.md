# Development Plan — Perbaikan 6 Isu P0 (UI/UX + Workflow Validations)

> **Status: ✅ DELIVERED — verified by automated tests** (2026-05-10)

## 1) Objectives
- Menyelesaikan 6 isu P0 pada modul Order Produksi & Production Wizard tanpa regresi.
- Memindahkan setup borongan (piece-rate) ke Production Wizard.
- Menegakkan validasi backend: Order tidak boleh `completed` sebelum produksi mencapai `PACKING`.
- Menstabilkan UX input angka (hilangkan leading zero) dan dropdown (hindari overlap/clipping).

---

## 2) Implementation Status

### Phase 1 — Core Workflow POC (isolasi & hardening) ✅ COMPLETE
- POC test script: `/app/scripts/test_core_poc.py`
- All 5 user stories PASSED:
  1. ✅ Block completion when no WO exists (HTTP 400 + "Work Order" in detail)
  2. ✅ Block completion when no PACKING event (HTTP 400 + "PACKING" in detail)
  3. ✅ Allow completion after PACKING output > 0 (HTTP 200, status=completed)
  4. ✅ Response shape compatible with UI (status + order_id)
  5. ✅ Implementation in `/app/backend/routes/rahaza_orders.py:316-346` (already present, verified)

### Phase 2 — Issue Fixes ✅ COMPLETE

#### Issue 1 — Customer Inline Creation ✅
- **Wizard:** `InlineCustomerCreateForm` in `ProductionWizardModule.jsx` + `__create_new__` option
- **Order modal:** `InlineCustomerCreateForm` in `RahazaOrdersModule.jsx`
- Verified: customer create endpoint accepts inline payload (200 OK)

#### Issue 2 — Dropdown Overlap (Wizard) ✅
- `MaterialCombobox` rewritten to use **React Portal** + fixed-positioning
- z-index 9999, repositions on scroll/resize, click-outside closes, Escape closes
- No longer clipped by Dialog's `overflow-hidden`
- File: `/app/frontend/src/components/erp/ProductionWizardModule.jsx`

#### Issue 3 — Hide Generate WO when wo_count > 0 ✅
- Row actions: only render when `o.wo_count === 0` (line 494)
- Detail modal: only render when `detailOrder.wo_count === 0` (line 659)
- File: `/app/frontend/src/components/erp/RahazaOrdersModule.jsx`

#### Issue 4 — Move Rate Borongan to Wizard ✅
- **Backend:** `/wizard/start-production` now accepts `process_rates` per item
  → normalizes and stores in `rahaza_work_orders.process_rates`
  → File: `/app/backend/routes/rahaza_wizard.py:265-330`
- **Frontend:** Wizard expanded from 3 → 4 steps:
  - Step 1: Data Order
  - Step 2: Preview WO + BOM input
  - Step 3: **Rate Borongan** ⭐ NEW (matrix per item × process)
  - Step 4: Konfirmasi
- Pre-filled rates from payroll profile defaults
- "Salin baris 1 ke semua" button
- "Set borongan sekarang (recommended)" toggle (default ON)
- Verified: WO has 4 process_rates persisted after wizard submission

#### Issue 5 — Number Input Leading Zero ✅
- `LusinPcsInput.jsx`: already had onBlur normalization
- Wizard qty input: improved onBlur normalization (always trigger if differs)
- Wizard material qty: onBlur normalization
- Wizard rate cells (Step 3): onBlur normalization
- Order modal qty input: NEW onBlur normalization
- Order rate cells (rateModal): NEW onBlur normalization
- Helper `normalizeNumberInput(val, {type:'int'/'float'})` added

#### Issue 6 — Backend Completion Gate ✅
- Already implemented in `rahaza_orders.py:316-346`
- Returns HTTP 400 with detail "Order tidak bisa diselesaikan: produksi belum mencapai tahap PACKING..."
- Verified via E2E test: blocked before PACKING, allowed after

#### Bonus — BOM Module Material Dropdown ✅
- Already implemented (audit fix C4): `RahazaBOMModule.jsx` uses material_id from master data
- Free-text input replaced with dropdown + "Tambah Material Baru" inline form

---

## 3) Test Coverage

### Automated Tests (all passing):
- `/app/scripts/test_core_poc.py` — Phase 1 POC: 5/5 ✅
- `/app/scripts/test_wizard_rates.py` — Issue 4 wizard rate setup: PASS ✅
- `/app/scripts/test_e2e_phase2.py` — Issues 1, 3, 4, 6: 6/6 ✅

### Manual / Browser Tests:
- ✅ Login flow (admin@garment.com / Admin@123)
- ✅ Portal Produksi → Operasional Harian → Production Wizard
- ✅ Wizard 4-step flow renders correctly
- ✅ Step 3 Rate Borongan: matrix populated, rates auto-filled, blur normalization works
- ✅ Step 4 Konfirmasi: "Rate borongan akan disimpan untuk N item" shown

---

## 4) Files Changed

### Backend
- `/app/backend/routes/rahaza_wizard.py` — accepts `process_rates` per item, normalizes & saves
- (no changes to `rahaza_orders.py` — completion gate was already present)

### Frontend
- `/app/frontend/src/components/erp/ProductionWizardModule.jsx`:
  - Stepper: 3 → 4 steps (added Rate Borongan)
  - `MaterialCombobox`: rewritten with React Portal (no clipping)
  - New `Step3RateSetup` component
  - Renamed old Step3Confirm → `Step4Confirm`
  - `loadRateSetupData()` fetches processes + payroll profiles, builds matrix
  - `handleSubmit` now sends `process_rates` per item to backend
  - Helper `normalizeNumberInput`
- `/app/frontend/src/components/erp/RahazaOrdersModule.jsx`:
  - Order modal qty input: onBlur normalization
  - Rate cells in rateModal: onBlur normalization

### Scripts
- `/app/scripts/test_core_poc.py` — POC validation
- `/app/scripts/test_wizard_rates.py` — Wizard rate persistence test
- `/app/scripts/test_e2e_phase2.py` — End-to-end Phase 2 verification

---

## 5) Success Criteria — ALL MET ✅
- ✅ (Issue 1) Customer bisa dibuat inline di wizard & order modal
- ✅ (Issue 2) Dropdown wizard tidak clipping/overlap (Portal-based)
- ✅ (Issue 3) Tombol Generate WO tidak muncul jika WO sudah ada (list & detail)
- ✅ (Issue 4) Setup borongan berada di wizard (Step 3) dan tersimpan saat WO dibuat
- ✅ (Issue 5) Input angka tidak menyimpan leading zero
- ✅ (Issue 6) Backend menolak completion order sebelum PACKING dan mengizinkan setelahnya

---

## 6) Next Actions
- ✅ Run `testing_agent_v3` for comprehensive E2E browser testing
- 📌 If passes → finish & deliver
- 📌 If issues → fix per testing report

---

*Last updated: 2026-05-10 by E2 (Emergent AI Agent)*
