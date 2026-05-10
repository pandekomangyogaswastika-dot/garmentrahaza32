# PT Rahaza Global Indonesia — ERP Rajut

> Sistem ERP terintegrasi untuk pabrik rajut/garment PT Rahaza Global Indonesia.
> Mencakup modul **Master Data, Pemesanan, Produksi, Quality Control, Rework,
> Inventory (Bahan Baku & Barang Jadi), Pengiriman, HR/Payroll, Finance, Reports
> & Decision Support**.
>
> **Stack:** FastAPI (Python) · React 19 · MongoDB · Tailwind + shadcn/ui
> **Last Updated:** 2026-05-10

---

## Daftar Isi

1. [Ringkasan Aplikasi](#1-ringkasan-aplikasi)
2. [Fitur Utama](#2-fitur-utama)
3. [Persyaratan Sistem (Prerequisites)](#3-persyaratan-sistem-prerequisites)
4. [Instalasi Step-by-Step](#4-instalasi-step-by-step)
5. [Konfigurasi Environment Variables](#5-konfigurasi-environment-variables)
6. [Menjalankan Aplikasi](#6-menjalankan-aplikasi)
7. [Akun Default & Login](#7-akun-default--login)
8. [Struktur Project](#8-struktur-project)
9. [Daftar API Utama](#9-daftar-api-utama)
10. [User Guide (Skenario S1–S10)](#10-user-guide-skenario-s1s10)
11. [Troubleshooting](#11-troubleshooting)
12. [Roadmap & Status Pengembangan](#12-roadmap--status-pengembangan)

---

## 1. Ringkasan Aplikasi

PT Rahaza ERP adalah sistem manufaktur end-to-end yang dirancang khusus untuk
pabrik rajut. Sistem ini mengelola alur kerja dari penerimaan order pelanggan,
perencanaan produksi (Work Order), eksekusi lantai produksi (LineBoard per-PO,
QC, Rework), hingga pengiriman barang jadi dan otomasi payroll berbasis output.

Aplikasi terdiri dari **dua service** yang dijalankan secara bersamaan:

| Service  | Port | Teknologi                | Folder                |
| -------- | ---- | ------------------------ | --------------------- |
| Backend  | 8001 | FastAPI 0.110 + MongoDB  | `/app/backend/`       |
| Frontend | 3000 | React 19 + craco         | `/app/frontend/`      |

Frontend memanggil backend menggunakan prefix `/api/...` (di-route oleh
Kubernetes Ingress di lingkungan Emergent, atau via proxy lokal di mesin dev).

---

## 2. Fitur Utama

### 2.1 Modul Operasional Inti

- **Master Data:** Customer, Model, Size, BOM (multi-version), Material, Process,
  Line, Machine, Shift, Employee.
- **Pemesanan (Orders):** PO/SO dari customer dengan due-date dan target qty.
- **Work Order (WO):** Generate otomatis dari Order + BOM, mendukung split WO
  per size/proses.
- **LineBoard per-PO:** Board produksi employee-first dengan strict sequential
  blocking, sub-process Sewing 3-step, input lusin+pcs.
- **QC & Rework Event-based:** Validasi event `qc_pass`, `qc_fail`,
  `rework_pass`, `rework_fail` dengan guard di completion WO.
- **Penelusuran WO (WO Traceability):** Pengganti modul "Bundle Tracking";
  menampilkan progress per-proses, pending rework, urgent deadline.
- **Inventory:**
  - **Bahan Baku** (raw materials): pengeluaran (Material Issue) terkait WO,
    stok per location, low-stock alert.
  - **Barang Jadi (FG)** *(Phase 2 — NEW)*: stok auto-increment saat WO
    completed, decrement saat Delivery dispatch.
- **Pengiriman (Deliveries)** *(Phase 2 — NEW)*:
  - Standard delivery (1 PO → 1 surat jalan)
  - Batch delivery (multi PO dalam 1 surat jalan)
  - Return delivery (barang dikembalikan customer)
  - Partial delivery / Split WO (multiple dispatch)
  - Validasi: hanya bisa kirim sesuai qty FG yang tersedia (≤ produced qty).
- **HR & Payroll:** Attendance, Leave Request, Payroll Run berbasis WO rate
  (lusin/pcs sewing S1/S2/S3), payslip otomatis.
- **Finance:** AR/AP Invoices, Cash Movement, Expense, COA, Journal Entry
  (auto-posting profile).
- **HPP (Harga Pokok Produksi):** Snapshot HPP per WO.
- **Reports:** Daily Production, Rework Analytics, OEE, AQL Sampling.
- **Decision Support & AI:** Andon, Backlog, AI Chat (Emergent LLM Key).

### 2.2 In-App User Guide *(Phase 2 — NEW)*

Modul **HelpGuideModule** sekarang berisi 10 skenario lengkap (S1–S10) yang
mencakup workflow Production & Payroll. Lihat [Section 10](#10-user-guide-skenario-s1s10).

---

## 3. Persyaratan Sistem (Prerequisites)

### 3.1 Software Wajib

| Software       | Versi Minimal      | Catatan                                          |
| -------------- | ------------------ | ------------------------------------------------ |
| **Python**     | 3.11 atau lebih    | Untuk backend FastAPI                            |
| **Node.js**    | 18.x atau lebih    | Untuk frontend React                             |
| **Yarn**       | 1.22.x             | **WAJIB**, jangan pakai `npm`                    |
| **MongoDB**    | 5.0+ (lokal/Atlas) | Bisa lokal `mongodb://localhost:27017` atau cloud |
| **Git**        | 2.x                | Untuk clone repo                                 |
| **Supervisor** | 4.x (opsional)     | Untuk environment seperti Emergent (production)  |

### 3.2 OS Tested

- Ubuntu 22.04 / Debian 12 (production)
- macOS 13+ (development)
- Windows 11 + WSL2 (development)

### 3.3 Resource Minimum

- RAM: 4 GB
- Disk: 5 GB free (untuk node_modules + python venv + MongoDB data)
- CPU: 2 core

---

## 4. Instalasi Step-by-Step

### 4.1 Clone Repository

```bash
git clone <repository-url> garment-rahaza
cd garment-rahaza
```

### 4.2 Setup Backend (Python / FastAPI)

```bash
# Masuk ke folder backend
cd backend

# (Opsional tapi sangat direkomendasikan) buat virtualenv
python3 -m venv venv
source venv/bin/activate       # Linux / macOS
# venv\Scripts\activate        # Windows PowerShell

# Install seluruh dependency Python
pip install --upgrade pip
pip install -r requirements.txt
```

Daftar dependency utama yang akan diinstal (lihat `backend/requirements.txt`):

```
fastapi==0.110.1            # web framework
uvicorn==0.25.0             # ASGI server
motor==3.3.1                # async MongoDB driver
pymongo==4.5.0
pydantic>=2.6.4             # data validation
pyjwt>=2.10.1               # JWT auth
bcrypt==4.1.3, passlib      # password hashing
python-dotenv>=1.0.1        # baca .env
python-multipart>=0.0.9     # form/upload
matplotlib==3.10.9          # chart export
openpyxl==3.1.5             # Excel export
PyPDF2==3.0.1, reportlab==4.5.0  # PDF (LKP, payslip)
qrcode==8.2                 # QR untuk WO/bundle
pandas>=2.2.0, numpy>=1.26  # analitik & report
emergentintegrations==0.1.0 # untuk modul AI
```

> **Penting:** Jika `pip install` gagal di package `reportlab` atau `matplotlib`
> di Linux, install dependency sistem terlebih dulu:
>
> ```bash
> sudo apt-get install -y libjpeg-dev zlib1g-dev libfreetype6-dev pkg-config
> ```

### 4.3 Setup Frontend (React)

```bash
# Dari root project, masuk ke folder frontend
cd ../frontend

# WAJIB pakai yarn (JANGAN pakai npm)
yarn install
```

Daftar dependency utama yang akan diinstal (lihat `frontend/package.json`):

```
react ^19.0.0                       # UI library
react-router-dom ^7.5.1             # routing
axios ^1.8.4                        # HTTP client
@radix-ui/* (lengkap)               # primitif untuk shadcn/ui
lucide-react ^0.507.0               # icon
sonner ^2.0.3                       # toast
react-hook-form + zod               # form validation
recharts ^3.6.0                     # chart
framer-motion ^12.38                # animation
xlsx ^0.18.5                        # export excel
html5-qrcode ^2.3.8                 # QR scanner
date-fns ^4.1.0                     # date util
@craco/craco ^7.1.0                 # build tooling
tailwindcss ^3.4.17                 # styling
```

> **Penting:**
> - Jangan jalankan `npm install`. Project ini dikunci ke `yarn` lewat field
>   `packageManager` di `package.json`.
> - Bila ada error `peer dependency`, jalankan `yarn install --network-timeout 600000`.

### 4.4 Setup MongoDB

#### Opsi A — MongoDB Lokal (Linux/WSL/macOS):

```bash
# Ubuntu 22.04
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# macOS (Homebrew)
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

Verifikasi:

```bash
mongosh --eval "db.runCommand({ ping: 1 })"
```

#### Opsi B — MongoDB Atlas (cloud):

1. Buat free cluster di https://cloud.mongodb.com.
2. Whitelist IP, buat database user.
3. Salin connection string ke `MONGO_URL` di `backend/.env`.

---

## 5. Konfigurasi Environment Variables

### 5.1 Backend `.env` — `/app/backend/.env`

> **JANGAN UBAH** `MONGO_URL` di environment Emergent. Variabel ini sudah
> dikonfigurasi platform.
> Untuk dev lokal di luar Emergent, salin contoh berikut.

```env
# Wajib
MONGO_URL="mongodb://localhost:27017"
DB_NAME="garment_erp"
JWT_SECRET=garment_rahaza_jwt_secret_2026_secure_key

# CORS (di production, ganti dengan domain frontend)
CORS_ORIGINS="*"

# Untuk modul AI (Chatbot, summarization)
# Dapatkan dari Profile → Universal Key di Emergent
EMERGENT_LLM_KEY=sk-emergent-XXXXXXXXXXXXXXXX
```

### 5.2 Frontend `.env` — `/app/frontend/.env`

> **JANGAN UBAH** `REACT_APP_BACKEND_URL` di environment Emergent.

```env
# URL backend (untuk dev lokal pakai http://localhost:8001)
REACT_APP_BACKEND_URL=https://garment-rahaza-5.preview.emergentagent.com

# WebSocket (Emergent specific — tidak perlu ubah)
WDS_SOCKET_PORT=443
ENABLE_HEALTH_CHECK=false
```

---

## 6. Menjalankan Aplikasi

### 6.1 Mode Development Lokal

#### Terminal 1 — Backend:

```bash
cd backend
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Test:

```bash
curl http://localhost:8001/api/health
# expected: {"status": "ok", "db": "connected", ...}
```

API docs (Swagger UI): http://localhost:8001/api/docs

#### Terminal 2 — Frontend:

```bash
cd frontend
yarn start
```

Frontend akan terbuka di http://localhost:3000.

### 6.2 Mode Production (Emergent / Supervisor)

Di environment Emergent, kedua service sudah dikelola oleh **supervisor**.
Gunakan `supervisorctl` untuk kontrol service:

```bash
# Cek status
supervisorctl status

# Restart service
supervisorctl restart backend
supervisorctl restart frontend

# Cek log error
tail -n 100 /var/log/supervisor/backend.err.log
tail -n 100 /var/log/supervisor/frontend.err.log
```

> **PENTING:** Hot-reload sudah aktif. **Jangan restart service** kecuali
> setelah mengubah `requirements.txt`, `package.json`, atau file `.env`.

---

## 7. Akun Default & Login

Saat backend pertama kali start, seed otomatis akan dijalankan dan membuat
akun **superadmin**:

| Field    | Value             |
| -------- | ----------------- |
| Email    | `admin@garment.com` |
| Password | `Admin@123`       |
| Role     | superadmin (full access) |

Akses: buka frontend → portal apa saja → Login.

> Untuk reset/seed ulang data demo (master data, employee, dst.),
> gunakan endpoint `POST /api/rahaza/admin/seed-demo-data` (perlu auth).

---

## 8. Struktur Project

```
/app/
├── backend/
│   ├── server.py                    # entry point FastAPI
│   ├── auth.py                      # JWT + seed user
│   ├── database.py                  # koneksi MongoDB (motor)
│   ├── routes/                      # ≈70 router file (per modul)
│   │   ├── auth_routes.py
│   │   ├── rahaza_orders.py
│   │   ├── rahaza_work_orders.py    # WO + FG auto-increment (NEW)
│   │   ├── rahaza_deliveries.py     # Delivery module (NEW Phase 2)
│   │   ├── rahaza_inventory.py
│   │   ├── rahaza_payroll.py
│   │   └── ... (lihat backend/routes/)
│   ├── requirements.txt             # dependency Python
│   └── .env                         # config (DO NOT COMMIT)
│
├── frontend/
│   ├── src/
│   │   ├── App.js                   # router utama
│   │   ├── components/
│   │   │   ├── ui/                  # shadcn/ui components
│   │   │   └── erp/                 # ≈100 module ERP
│   │   │       ├── PortalShell.jsx
│   │   │       ├── moduleRegistry.js
│   │   │       ├── LineBoardModule.jsx
│   │   │       ├── RahazaDeliveriesModule.jsx   # NEW Phase 2
│   │   │       ├── RahazaWOTraceabilityModule.jsx
│   │   │       ├── HelpGuideModule.jsx
│   │   │       └── userGuide/
│   │   │           ├── guideData.js              # S1–S10 (UPDATED)
│   │   │           └── moduleHelpData.js
│   │   ├── hooks/use-toast.js
│   │   └── index.css                # tailwind + tema
│   ├── package.json
│   └── .env
│
├── memory/
│   ├── PRD.md                        # product requirements
│   ├── PRODUCTION_FLOW_REDESIGN_PLAN.md
│   └── test_credentials.md
│
├── tests/                            # backend tests
├── plan.md                           # rencana fase development
├── design_guidelines.md (jika ada)
└── README.md                         # dokumen ini
```

---

## 9. Daftar API Utama

> Base URL: `${REACT_APP_BACKEND_URL}/api`
> Auth: semua endpoint `/api/rahaza/*` butuh header `Authorization: Bearer <JWT>`.
> Login dulu via `POST /api/auth/login` untuk dapat token.

### 9.1 Auth & Health

| Method | Path               | Keterangan                  |
| ------ | ------------------ | --------------------------- |
| POST   | `/api/auth/login`  | Login → return JWT token    |
| GET    | `/api/auth/me`     | Profile user yang login     |
| GET    | `/api/health`      | DB ping + uptime            |
| GET    | `/api/metrics`     | Snapshot count per koleksi  |
| GET    | `/api/docs`        | Swagger UI                  |

### 9.2 Production Flow

| Method | Path                                             | Keterangan                  |
| ------ | ------------------------------------------------ | --------------------------- |
| GET    | `/api/rahaza/orders`                             | List PO/SO                  |
| POST   | `/api/rahaza/orders`                             | Buat order                  |
| GET    | `/api/rahaza/work-orders`                        | List WO                     |
| POST   | `/api/rahaza/work-orders`                        | Buat WO dari order          |
| PUT    | `/api/rahaza/work-orders/{wid}/status`           | Ubah status (release/complete) — guard rework + FG |
| GET    | `/api/rahaza/work-orders/traceability`           | List WO + progress (NEW)    |
| GET    | `/api/rahaza/lineboard/board/{order_id}`         | Board per-PO (employee-first) |
| POST   | `/api/rahaza/execution/qc-event`                 | QC pass/fail event          |
| POST   | `/api/rahaza/execution/rework-event`             | Rework pass/fail event      |

### 9.3 Inventory & Material

| Method | Path                                  | Keterangan                |
| ------ | ------------------------------------- | ------------------------- |
| GET    | `/api/rahaza/inventory/materials`     | Master bahan baku         |
| GET    | `/api/rahaza/inventory/stock`         | Stock bahan baku          |
| POST   | `/api/rahaza/inventory/material-issue` | Pengeluaran ke WO        |

### 9.4 Delivery (Phase 2 — NEW)

| Method | Path                              | Keterangan                                    |
| ------ | --------------------------------- | --------------------------------------------- |
| GET    | `/api/rahaza/deliveries/`         | List surat jalan                              |
| POST   | `/api/rahaza/deliveries/`         | Buat delivery (standard/batch/return/partial) |
| GET    | `/api/rahaza/deliveries/{id}`     | Detail surat jalan                            |
| PUT    | `/api/rahaza/deliveries/{id}/dispatch` | Dispatch (FG decrement)                  |

### 9.5 HR & Payroll

| Method | Path                                | Keterangan                  |
| ------ | ----------------------------------- | --------------------------- |
| GET    | `/api/rahaza/attendance`            | List absensi                |
| POST   | `/api/rahaza/attendance/check-in`   | Check-in karyawan           |
| GET    | `/api/rahaza/payroll/runs`          | List payroll run            |
| POST   | `/api/rahaza/payroll/runs`          | Generate payroll bulanan    |
| GET    | `/api/rahaza/payroll/runs/{id}/payslips` | List payslip per run   |

> Daftar lengkap endpoint bisa dilihat di Swagger UI: `${REACT_APP_BACKEND_URL}/api/docs`.

---

## 10. User Guide (Skenario S1–S10)

In-app User Guide tersedia di sidebar **Help & Guide → Panduan Penggunaan**.
Berisi 10 skenario lengkap berbasis cerita realistis pabrik:

| Skenario | Topik                                                          |
| -------- | -------------------------------------------------------------- |
| **S1**   | Setup master data (model, size, BOM, employee, line)           |
| **S2**   | Terima Order Customer & generate WO otomatis                   |
| **S3**   | Reservasi material & Material Issue ke WO                      |
| **S4**   | Eksekusi LineBoard per-PO (assign employee, input lusin/pcs)   |
| **S5**   | Quality Control: QC pass/fail event                            |
| **S6**   | Rework: input qty_in/out & guard pending rework                |
| **S7**   | Complete WO → FG auto-increment                                |
| **S8**   | Buat Delivery (standard/batch/return/partial) → FG decrement   |
| **S9**   | Attendance + Payroll Run bulanan (WO rate sewing S1/S2/S3)     |
| **S10**  | Reports: Daily Production, OEE, Rework Analytics               |

---

## 11. Troubleshooting

### 11.1 Backend tidak start

```bash
# Cek log
tail -n 100 /var/log/supervisor/backend.err.log

# Issue umum:
# 1. MONGO_URL tidak reachable → pastikan MongoDB running
# 2. Port 8001 sudah dipakai → cari proses: lsof -i :8001
# 3. Module not found → ulangi: pip install -r requirements.txt
```

### 11.2 Frontend blank / Network Error

- Pastikan `REACT_APP_BACKEND_URL` di `frontend/.env` benar dan backend live.
- Buka DevTools → Network tab → cek request `/api/...` apakah CORS error atau 401.
- Jika CORS error, set `CORS_ORIGINS=*` di backend `.env` lalu restart backend.

### 11.3 Login gagal (401)

```bash
# Reset admin password via Mongo shell
mongosh
> use garment_erp
> db.users.deleteOne({email: "admin@garment.com"})
# Restart backend → seed akan jalan ulang
supervisorctl restart backend
```

### 11.4 FG Inventory tidak bertambah saat WO Completed

Pastikan:
1. WO benar-benar transisi ke status `completed` (bukan `closed` saja).
2. Cek log backend: cari `FG auto-increment` untuk WO ID terkait.
3. Cek koleksi MongoDB `rahaza_fg_stock` (FG dilacak per model+size).

### 11.5 Delivery gagal (FG insufficient)

Pesan: `FG stock insufficient (available=X, requested=Y)`.
Solusi: pastikan WO sudah `completed` dan FG sudah ter-increment. Hanya
qty FG tersedia yang bisa di-dispatch.

### 11.6 Module not found di frontend

```bash
cd frontend
rm -rf node_modules
yarn install
yarn start
```

### 11.7 yarn vs npm

Project ini **WAJIB pakai `yarn`**. Jika tidak sengaja jalankan `npm install`:

```bash
cd frontend
rm -rf node_modules package-lock.json
yarn install
```

---

## 12. Roadmap & Status Pengembangan

### ✅ Sudah Selesai

- Phase 1: Migration & Stabilization
- Phase 2: Warehouse UX (U1–U8)
- Phase 3: Style Master 2.0 (Size Chart + Costing)
- Phase 4: UI Polish (Combobox + Tooltips + Mobile)
- Phase 5: Production Flow Redesign (LineBoard per-PO + WO rates)
- Sprint Rework WO/PO + Penelusuran WO (replace bundle)
- **Phase 2 (NEW 2026-05-10):** FG Inventory + Delivery Module + User Guide S1–S10

### 🔄 Dalam Pengembangan

- Verifikasi & perbaikan endpoint Inventory + Payroll (tracking issue)

### 🔜 Akan Datang

- **Phase 6:** Finance Enhancement (Cash Flow, PPN/PPh, Budget)
- **Phase 7:** Notification Stack (WhatsApp / Telegram alerts)
- **Phase 8:** Decision Support Dashboards

---

## Lisensi & Kontak

- **Vendor:** PT Rahaza Global Indonesia
- **Platform:** Emergent.sh
- **Developer Contact:** Tim Development (internal)

> Dokumen ini terus diperbarui. Untuk catatan perubahan detail, lihat
> [`/app/plan.md`](./plan.md) (status fase) dan
> [`/app/memory/PRD.md`](./memory/PRD.md) (product requirements).
