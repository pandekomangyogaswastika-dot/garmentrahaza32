/**
 * Structured data untuk Panduan Penggunaan PT Rahaza ERP.
 * Dipakai oleh UserGuideContent.jsx (rich-visual renderer).
 *
 * Struktur:
 *  - PORTAL_META: warna, icon, role per portal
 *  - GUIDE_SECTIONS: array section utama (overview, per-portal, scenarios, tips)
 *  - SCENARIOS: array test-scenario dengan prerequisite, langkah, expected result
 */

import {
  BookOpen, BarChart3, Workflow, Warehouse, DollarSign, UserCog, UserCircle,
  Package, ClipboardList, FileText, Calendar, Users, Settings, Activity,
  AlertTriangle, CheckCircle2, Clock, Lightbulb, Zap, Wrench, ShieldAlert,
  PackageCheck, Truck, Receipt, BookMarked, Layers, Target, ScrollText,
  HelpCircle, Sparkles, Boxes, Factory, ListChecks, Gauge,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────
 * Portal Meta — warna & ikon per portal (konsisten di seluruh aplikasi)
 * ───────────────────────────────────────────────────────── */
export const PORTAL_META = {
  manajemen: {
    name: 'Manajemen',
    short: 'MGT',
    icon: BarChart3,
    role: 'Direktur, Manager Produksi/Keuangan/HR',
    color: 'sky',
    classes: {
      text: 'text-sky-500',
      bg: 'bg-sky-500/10',
      border: 'border-sky-500/30',
      ring: 'ring-sky-500/20',
      dot: 'bg-sky-500',
    },
  },
  produksi: {
    name: 'Produksi',
    short: 'PRD',
    icon: Factory,
    role: 'Supervisor, PPIC, Operator',
    color: 'emerald',
    classes: {
      text: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      ring: 'ring-emerald-500/20',
      dot: 'bg-emerald-500',
    },
  },
  gudang: {
    name: 'Gudang',
    short: 'WHS',
    icon: Warehouse,
    role: 'Kepala Gudang, Staff Gudang',
    color: 'amber',
    classes: {
      text: 'text-amber-500',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      ring: 'ring-amber-500/20',
      dot: 'bg-amber-500',
    },
  },
  keuangan: {
    name: 'Keuangan',
    short: 'FIN',
    icon: DollarSign,
    role: 'Finance Staff, Accounting',
    color: 'violet',
    classes: {
      text: 'text-violet-500',
      bg: 'bg-violet-500/10',
      border: 'border-violet-500/30',
      ring: 'ring-violet-500/20',
      dot: 'bg-violet-500',
    },
  },
  sdm: {
    name: 'SDM',
    short: 'HR',
    icon: UserCog,
    role: 'HR Staff',
    color: 'rose',
    classes: {
      text: 'text-rose-500',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/30',
      ring: 'ring-rose-500/20',
      dot: 'bg-rose-500',
    },
  },
  qc: {
    name: 'QC',
    short: 'QC',
    icon: ShieldAlert,
    role: 'QC Inspector',
    color: 'fuchsia',
    classes: {
      text: 'text-fuchsia-500',
      bg: 'bg-fuchsia-500/10',
      border: 'border-fuchsia-500/30',
      ring: 'ring-fuchsia-500/20',
      dot: 'bg-fuchsia-500',
    },
  },
  shift: {
    name: 'Shift',
    short: 'SHF',
    icon: Clock,
    role: 'Supervisor Shift',
    color: 'cyan',
    classes: {
      text: 'text-cyan-500',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/30',
      ring: 'ring-cyan-500/20',
      dot: 'bg-cyan-500',
    },
  },
  saya: {
    name: 'Portal Saya',
    short: 'ME',
    icon: UserCircle,
    role: 'Semua karyawan',
    color: 'pink',
    classes: {
      text: 'text-pink-500',
      bg: 'bg-pink-500/10',
      border: 'border-pink-500/30',
      ring: 'ring-pink-500/20',
      dot: 'bg-pink-500',
    },
  },
};

/* ─────────────────────────────────────────────────────────
 * Difficulty levels untuk skenario
 * ───────────────────────────────────────────────────────── */
export const DIFFICULTY = {
  pemula: { label: 'Pemula', classes: 'bg-green-500/15 text-green-600 border-green-500/30' },
  menengah: { label: 'Menengah', classes: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  lanjut: { label: 'Lanjut', classes: 'bg-red-500/15 text-red-600 border-red-500/30' },
};

/* ─────────────────────────────────────────────────────────
 * Section "Overview" — pengenalan sistem
 * ───────────────────────────────────────────────────────── */
export const OVERVIEW = {
  id: 'overview',
  title: 'Selamat Datang',
  icon: BookOpen,
  intro:
    'PT Rahaza ERP adalah platform terpadu untuk mengelola seluruh operasional pabrik garment rajut — dari perencanaan produksi, gudang, keuangan, hingga SDM.',
  highlights: [
    { icon: Zap, title: 'Real-time', desc: 'Data produksi & stok ter-update otomatis' },
    { icon: ListChecks, title: 'Terintegrasi', desc: '5 portal saling terhubung tanpa duplikasi data' },
    { icon: ShieldAlert, title: 'Audit Trail', desc: 'Setiap perubahan tercatat (siapa, kapan, apa)' },
    { icon: Sparkles, title: 'AI Assistant', desc: 'Chatbot bantuan & ringkasan laporan otomatis' },
  ],
  loginSteps: [
    { icon: 'login', text: 'Masuk dengan email & password yang diberikan admin' },
    { icon: 'select', text: 'Pilih Portal yang sesuai dengan peran Anda' },
    { icon: 'navigate', text: 'Menu utama berada di sidebar kiri portal' },
    { icon: 'switch', text: 'Klik nama portal di kiri-atas untuk berpindah portal' },
  ],
};

/* ─────────────────────────────────────────────────────────
 * Per-Portal Detail — daftar menu & deskripsi visual
 * ───────────────────────────────────────────────────────── */
export const PORTALS_GUIDE = [
  {
    id: 'p-manajemen',
    portalKey: 'manajemen',
    title: 'Portal Manajemen',
    summary: 'Pusat kendali eksekutif: dashboard KPI, master data produk/customer, order buyer, analitik.',
    menus: [
      {
        icon: BarChart3, title: 'Dashboard Eksekutif',
        path: 'Dashboard › Dashboard Eksekutif',
        description: 'Tampilan KPI utama untuk direktur & manager.',
        bullets: [
          'KPI: WO aktif, WO selesai bulan ini, OEE rata-rata, total karyawan',
          'Production Trend Chart 30 hari terakhir',
          'Top Issues — masalah produksi yang paling sering muncul',
        ],
        tips: 'Refresh otomatis tiap 5 menit. Cocok ditampilkan di TV ruang manajemen.',
      },
      {
        icon: Layers, title: 'Style Master (Model Produk)',
        path: 'Master Data › Model Produk',
        description: 'Katalog desain yang pernah/akan diproduksi.',
        bullets: [
          'Kode & nama, kategori, berat benang per pcs, ukuran bundle',
          'Upload foto desain (otomatis muncul di LKP PDF)',
          'BOM — daftar material per model',
        ],
        warn: 'Pastikan foto desain ter-upload sebelum produksi mulai.',
      },
      {
        icon: ClipboardList, title: 'Order Management',
        path: 'Order › Order Produksi',
        description: 'Buat & pantau order dari buyer/customer.',
        bullets: [
          'Pilih buyer, model, qty, ukuran, tanggal kirim',
          'Status: Draft → Confirmed → In Production → Shipped',
          'Generate Work Order otomatis per batch',
        ],
      },
      {
        icon: BookMarked, title: 'Panduan Penggunaan ERP',
        path: 'Bantuan › Panduan',
        description: 'Manual lengkap (halaman ini).',
        bullets: ['Search semua menu & fitur', '8 skenario test step-by-step', 'Tips & FAQ'],
      },
    ],
  },
  {
    id: 'p-produksi',
    portalKey: 'produksi',
    title: 'Portal Produksi',
    summary: 'Hati pabrik: WO, LKP, APS Gantt, Line Assignment, OEE, Rework, Shift Handover.',
    menus: [
      {
        icon: ClipboardList, title: 'Work Order (WO)',
        path: 'Eksekusi › Work Order',
        description: 'Surat perintah kerja yang menggerakkan lantai produksi.',
        bullets: [
          'Status: Draft → Released → In Progress → Completed/Cancelled',
          'Release WO → otomatis reserve material sesuai BOM',
          'Cetak LKP Massal — status LKP semua WO aktif',
        ],
        warn: 'Pastikan stok BOM sudah cukup sebelum Release. Kalau kurang, sistem tampilkan warning.',
      },
      {
        icon: FileText, title: 'LKP (Lembar Kerja Produksi)',
        path: 'Eksekusi › Work Order › [WO] › LKP',
        description: 'Dokumen instruksi kerja per WO — SOP, BOM, QC, packing.',
        bullets: [
          '5-step wizard: Tech Pack → SOP → QC → Packing → Notes',
          'Upload Foto QC/defect/progres (max 3 per LKP)',
          'Foto otomatis muncul di Section L PDF',
          'Versioning — setiap revisi buat versi baru',
        ],
        tips: 'Download PDF selalu generate ulang dengan foto terbaru.',
      },
      {
        icon: Calendar, title: 'APS Gantt — Penjadwalan Otomatis',
        path: 'Monitoring › Penjadwalan APS',
        description: 'Visualisasi jadwal WO per lini.',
        bullets: [
          'Auto-Schedule — sistem optimalkan urutan WO',
          'Kolom merah = hari libur (dari Kalender Produksi)',
          'Tab Line Balance — keseimbangan beban per lini',
        ],
      },
      {
        icon: Users, title: 'Assign Lini Hari Ini',
        path: 'Eksekusi › Assign Lini Hari Ini',
        description: 'Tentukan karyawan & mesin per lini & shift.',
        bullets: [
          'Copy dari Kemarin — 1 klik isi otomatis',
          'Auto-Assign dari Template tersimpan',
        ],
      },
      {
        icon: PackageCheck, title: 'Bulk Material Issue (Bulk MI)',
        path: 'Eksekusi › Bulk Material Issue',
        description: 'Keluarkan material ke lantai produksi banyak WO sekaligus.',
        bullets: [
          'Default tampil WO "in_progress" — bisa filter ke "released"',
          'Pilih WO → review BOM → konfirmasi → stok terkurangi',
        ],
        warn: 'Cek stok material cukup sebelum issue.',
      },
      {
        icon: Clock, title: 'Shift Handover',
        path: 'Eksekusi › Shift Handover',
        description: 'Serah terima shift dengan checklist & PDF.',
        bullets: [
          '5 checklist standar (target, quality, downtime, material, K3)',
          'Catat issues (tipe + priority) & pending tasks',
          'Sign-Off oleh supervisor shift berikutnya',
          'Download End-of-Shift PDF',
        ],
      },
      {
        icon: Boxes, title: 'Reservasi Material',
        path: 'Eksekusi › Reservasi Material',
        description: 'Stok yang sudah di-booking untuk WO tertentu.',
        bullets: [
          'Tab Per WO / Per Material',
          'Auto-reservasi saat WO di-release',
          'Stok Tersedia = Stok Total - Reserved',
        ],
      },
      {
        icon: Calendar, title: 'Kalender Produksi',
        path: 'Master Data › Kalender Produksi',
        description: 'Hari libur & pengecualian untuk APS.',
        bullets: [
          'Seed Libur Nasional 2026 (1-klik 20 hari)',
          'Tipe entri: Libur (merah), Pengecualian (kuning), Catatan (biru)',
          'Kalkulator hari kerja per periode',
        ],
      },
      {
        icon: Gauge, title: 'OEE Dashboard',
        path: 'Monitoring › OEE',
        description: 'Overall Equipment Effectiveness per lini & mesin.',
        bullets: [
          'OEE = Availability × Performance × Quality',
          'Drill-down per lini & mesin',
          'Downtime events (mesin breakdown, dll)',
        ],
      },
      {
        icon: AlertTriangle, title: 'Papan Rework',
        path: 'Eksekusi › Papan Rework',
        description: 'Manajemen item yang gagal QC & perlu rework.',
        bullets: [
          'Buat Rework: WO, qty, jenis defect, assign operator',
          'Kode defect terstandardisasi',
          'Closed-loop tracking — sampai pcs pass kembali',
        ],
      },
    ],
  },
  {
    id: 'p-gudang',
    portalKey: 'gudang',
    title: 'Portal Gudang',
    summary: 'Kelola material, inventori, PO, receiving, opname stok, multi-zona.',
    menus: [
      {
        icon: Package, title: 'Master Material',
        path: 'Master Data › Material',
        description: 'Daftar semua material (benang, aksesoris, FG).',
        bullets: ['Kategori: Benang / Aksesoris / FG', 'Min stock indicator (low-stock badge)'],
      },
      {
        icon: Boxes, title: 'Inventori',
        path: 'Inventori › Stok',
        description: 'Stok real-time per material & lokasi.',
        bullets: [
          'FIFO valuation',
          'Movement log lengkap (in/out/adjust)',
          'Filter per gedung/zona/rak',
        ],
      },
      {
        icon: Receipt, title: 'Purchase Order (PO)',
        path: 'Procurement › PO',
        description: 'Order pembelian ke supplier.',
        bullets: [
          'Pilih supplier, material, qty, due date',
          '3-way match: PO → GR (Receiving)',
          'Status: Draft → Approved → Partial → Received',
        ],
      },
      {
        icon: Truck, title: 'Receiving (Goods Receipt)',
        path: 'Procurement › Receiving',
        description: 'Konfirmasi penerimaan barang dari PO.',
        bullets: [
          'No GR atomic counter (GR-00001 dst)',
          'Saat status = received → auto-sync ke material_stock',
          'Material picker dari master material',
        ],
      },
      {
        icon: ListChecks, title: 'Stockopname',
        path: 'Inventori › Opname',
        description: 'Stock taking dengan adjustment otomatis ke GL.',
        bullets: [
          'Input fisik vs sistem',
          'Selisih → otomatis posting jurnal ke akuntansi',
          'Audit trail per record',
        ],
      },
      {
        icon: AlertTriangle, title: 'Low Stock Indicators',
        path: 'Inventori › Low Stock',
        description: 'Material di bawah minimum.',
        bullets: ['Threshold konfigurabel (angka tetap atau %)', 'Badge merah/kuning'],
      },
    ],
  },
  {
    id: 'p-keuangan',
    portalKey: 'keuangan',
    title: 'Portal Keuangan',
    summary: 'Akuntansi penuh: CoA, jurnal, payroll, laporan keuangan.',
    menus: [
      {
        icon: BookMarked, title: 'Chart of Accounts (CoA)',
        path: 'Master › CoA',
        description: 'Daftar akun akuntansi.',
        bullets: ['Hierarchy multi-level', 'Tipe: Asset/Liability/Equity/Revenue/Expense'],
      },
      {
        icon: ScrollText, title: 'Jurnal Umum',
        path: 'Akuntansi › Jurnal',
        description: 'Posting jurnal manual & otomatis.',
        bullets: [
          'Auto-post dari opname adjustment & payroll',
          'Filter per periode/akun',
          'Posting / Reverse',
        ],
      },
      {
        icon: DollarSign, title: 'Payroll Run',
        path: 'Payroll › Periode',
        description: 'Pemrosesan gaji bulanan.',
        bullets: [
          'Multi-skema: borongan pcs/jam, mingguan, bulanan',
          'Tombol "Periksa Sekarang" — validasi anomali absensi',
          'Generate slip gaji + posting jurnal',
        ],
        tips: 'Validasi attendance bersifat warning (bukan block).',
      },
      {
        icon: FileText, title: 'Laporan Keuangan',
        path: 'Laporan › Finance',
        description: 'Laporan standar.',
        bullets: ['Neraca, Laba-Rugi, Cash Flow Direct', 'Export Excel/PDF'],
      },
    ],
  },
  {
    id: 'p-sdm',
    portalKey: 'sdm',
    title: 'Portal SDM',
    summary: 'Kelola karyawan, absensi, izin, payroll profile, laporan HR.',
    menus: [
      {
        icon: Users, title: 'Master Karyawan',
        path: 'SDM › Karyawan',
        description: 'Daftar karyawan & profil.',
        bullets: [
          'Data identitas, departemen, lini, shift',
          'Payroll profile (skema gaji, base rate)',
          'Linking user → employee untuk Portal Saya',
        ],
      },
      {
        icon: Activity, title: 'Absensi',
        path: 'SDM › Absensi',
        description: 'Catat kehadiran harian.',
        bullets: [
          'Check-in / check-out',
          'Lembur (overtime)',
          'Auto-fill dari approved leave',
        ],
      },
      {
        icon: ListChecks, title: 'Izin & Cuti',
        path: 'SDM › Izin/Cuti',
        description: 'Request & approval cuti.',
        bullets: ['Saldo cuti per karyawan', 'Approval flow', 'Auto-fill ke attendance'],
      },
      {
        icon: BarChart3, title: 'Laporan HR',
        path: 'SDM › Laporan',
        description: 'Laporan attendance, lembur, payroll, turnover.',
        bullets: [
          'Filter: department, location, shift',
          'Format: table + charts',
          'Export Excel + PDF',
        ],
      },
    ],
  },
  {
    id: 'p-saya',
    portalKey: 'saya',
    title: 'Portal Saya',
    summary: 'Self-service untuk semua karyawan: kehadiran & slip gaji pribadi.',
    menus: [
      {
        icon: UserCircle, title: 'Profil Saya',
        path: 'Saya › Profil',
        description: 'Data pribadi & status karyawan.',
        bullets: ['Departemen, lini, shift', 'Saldo cuti'],
      },
      {
        icon: Activity, title: 'Kehadiran Saya',
        path: 'Saya › Absensi',
        description: 'Riwayat kehadiran pribadi.',
        bullets: ['Per bulan', 'Statistik kehadiran/lembur'],
      },
      {
        icon: Receipt, title: 'Slip Gaji Saya',
        path: 'Saya › Slip Gaji',
        description: 'Download slip gaji per periode.',
        bullets: ['Detail komponen gaji', 'Download PDF'],
      },
    ],
  },
];

/* ─────────────────────────────────────────────────────────
 * 8 Skenario Test — dengan PRE-REQUISITE eksplisit
 * Format step: { portal: 'produksi', icon: ?, title: 'Buat Order',
 *               detail: '...', menu: 'Order > Buat Order' }
 * ───────────────────────────────────────────────────────── */
export const SCENARIOS = [
  {
    id: 's1',
    code: 'S1',
    title: 'Order Baru → Produksi → QC Pass → Selesai (Happy Path)',
    description:
      'Alur happy-path produksi normal tanpa masalah: dari order masuk dari buyer hingga semua qty lulus QC dan WO ditutup. Cocok untuk memahami flow standar produksi.',
    difficulty: 'pemula',
    estimatedTime: '~3-5 hari kerja (proses produksi real); ~30 menit (input sistem pertama kali)',
    personas: ['manajemen', 'produksi', 'qc', 'shift'],
    prerequisites: [
      'Master Customer "PT Fashion Indonesia" & Buyer "Uniqlo" sudah terdaftar',
      'Master Model "Sweater Klasik V-Neck" sudah ada dengan foto desain ter-upload',
      'BOM lengkap: Benang wool 0.4kg/pcs, Kancing 3pcs, Label 1set, Hang tag 1pcs',
      'SOP per proses sudah dibuat dengan target waktu (SAM) dan instruksi detail',
      'Stok material cukup: Benang wool 80kg, Kancing 600pcs, Label 200set, Hang tag 200pcs',
      'Line A sudah aktif dengan 6 operator terlatih (Rajut, Linking, Sewing, Steam, QC, Packing)',
      'Mesin rajut M-RAJ-02, linking M-LNK-01, sewing M-SEW-03, steam M-STM-01 ready',
    ],
    steps: [
      { portal: 'manajemen', title: '[STEP 1] Buat Order dari Buyer', menu: 'Manajemen › Order › Buat Order',
        detail: 'Manager Marketing menerima PO dari Uniqlo. Buka Portal Manajemen → Order → Buat Order. Isi form: Buyer = Uniqlo, Customer = PT Fashion Indonesia, Model = Sweater Klasik V-Neck, Qty = 200 pcs, Size = M (100pcs) & L (100pcs), Delivery Date = 30 Juni 2026. Klik "Simpan Order". Status: Draft.' },
      
      { portal: 'manajemen', title: '[STEP 2] Confirm Order', menu: 'Order › Detail Order › Confirm',
        detail: 'Setelah koordinasi dengan buyer selesai, buka detail order → klik "Confirm Order". Status berubah: Draft → Confirmed. Order siap di-generate menjadi Work Order.' },
      
      { portal: 'produksi', title: '[STEP 3] Generate Work Order', menu: 'Produksi › Order › Detail Order › Generate WO',
        detail: 'PPIC buka detail order di Portal Produksi → klik "Generate WO". Sistem otomatis buat WO: WO-2026-001, Model = Sweater V-Neck, Qty = 200 pcs, Due Date = 28 Juni (2 hari buffer sebelum delivery). Status WO: Draft. BOM otomatis ter-link: Benang 80kg, Kancing 600pcs, Label 200set.' },
      
      { portal: 'produksi', title: '[STEP 4] Review & Release WO', menu: 'Produksi › Work Order › WO-2026-001 › Release',
        detail: 'Supervisor buka WO-2026-001. Review: (1) BOM lengkap ✓, (2) Qty 200 ✓, (3) Due date realistis ✓. Klik "Release WO". Sistem auto-reserve material: Benang 80kg dari gudang, Kancing 600, Label 200, Hang tag 200. Status: Released. Material reserved (stok available berkurang). WO siap produksi.' },
      
      { portal: 'produksi', title: '[STEP 5] Buat LKP (Lembar Kerja Produksi)', menu: 'Work Order › WO-2026-001 › Buat LKP',
        detail: 'Klik "Buat LKP". Wizard 5 step: (1) Tech Pack: Upload foto sweater V-neck dari buyer (front view, back view, detail kerah). (2) SOP: Pilih SOP untuk Rajut (30 min), Linking (20 min), Sewing (25 min), Steam (5 min), QC (10 min), Packing (5 min). (3) QC Standards: AQL 1.5, toleransi ukuran ±2cm, warna sesuai pantone 18-4027 TPX. (4) Packing: 10 pcs per polybag, 50 pcs per karton. (5) Notes: "Perhatikan bentuk V-neck harus simetris, kancing rapi jarak sama". Klik "Generate LKP". Download PDF, cetak 5 copy untuk operator.' },
      
      { portal: 'produksi', title: '[STEP 6] Assign Operator ke Line A', menu: 'Produksi › Eksekusi › Assign Lini Hari Ini',
        detail: 'Tanggal 23 Juni 2026, Supervisor assign operator: Lini = Line A, Shift = Shift 1 (07:00-15:00). Operator: (1) Rajut = Bambang + Mesin M-RAJ-02, (2) Linking = Sari + Mesin M-LNK-01, (3) Sewing = Tono + Mesin M-SEW-03, (4) Steam = Rina + Mesin M-STM-01, (5) QC = Dedi (QC Inspector), (6) Packing = Wati. Klik "Simpan Assignment". Semua operator dapat notifikasi WO baru hari ini.' },
      
      { portal: 'produksi', title: '[STEP 7] Issue Material ke Line A', menu: 'Produksi › Eksekusi › Bulk Material Issue',
        detail: 'Staff gudang buka Bulk MI. Filter: Status = Released. Centang WO-2026-001. Klik "Preview" → tampil: Benang wool 80kg, Kancing 600, Label 200, Hang tag 200. Cek fisik di gudang: semua ada ✓. Klik "Konfirmasi Issue". Material keluar dari gudang, dibawa ke Line A dengan trolley. Stok gudang berkurang. Status WO: In Progress. Produksi dimulai!' },
      
      { portal: 'produksi', title: '[STEP 8] Proses Rajut (Hari 1-2)', menu: 'Papan Lini Produksi › Line A › Input Produksi',
        detail: 'Hari 1 (23 Juni): Bambang mulai rajut dengan mesin M-RAJ-02. Target: 100 pcs/hari. Selesai 25 pcs (1 bundle) jam 11:00 → Input: WO = WO-2026-001, Proses = Rajut, Qty = 25, Operator = Bambang, Mesin = M-RAJ-02. Simpan. Ulangi untuk 75 pcs sisanya (3 bundle lagi). Total hari 1: 100 pcs. Hari 2 (24 Juni): 100 pcs lagi. Total rajut: 200 pcs ✓. Bundle pindah ke Linking.' },
      
      { portal: 'produksi', title: '[STEP 9] Proses Linking (Hari 2-3)', menu: 'Papan Lini Produksi › Line A › Input Produksi',
        detail: 'Sari terima 200 pcs dari Rajut. Sambung badan+lengan kiri+lengan kanan+kerah V dengan mesin linking. Target: 120 pcs/hari. Hari 2: 120 pcs (4 bundle @ 30 pcs). Hari 3: 80 pcs (3 bundle). Input setiap bundle selesai: Proses = Linking, Qty = 30, Operator = Sari. Total linking: 200 pcs ✓. Bundle ke Sewing.' },
      
      { portal: 'produksi', title: '[STEP 10] Proses Sewing (Hari 3-4)', menu: 'Papan Lini Produksi › Line A › Input Produksi',
        detail: 'Tono terima 200 pcs dari Linking. Jahit: pasang label merek di dalam kerah, label ukuran di samping dalam, hang tag di leher. Jahit 3 kancing di depan sweater (jarak rata). Target: 100 pcs/hari. Hari 3 (sisa): 50 pcs. Hari 4: 150 pcs. Input per bundle 25 pcs: Proses = Sewing, Operator = Tono. Total: 200 pcs ✓. Bundle ke Steam.' },
      
      { portal: 'produksi', title: '[STEP 11] Proses Steam (Hari 4)', menu: 'Papan Lini Produksi › Line A › Input Produksi',
        detail: 'Rina terima 200 pcs dari Sewing. Masukkan ke mesin steam M-STM-01, suhu 95°C, durasi 3 menit per pcs. Steam ratakan sweater, bentuk V-neck simetris, hilangkan kerutan. Target: 200 pcs/hari (cepat). Selesai semua dalam 1 hari. Input per bundle 40 pcs: Proses = Steam, Operator = Rina. Total: 200 pcs ✓. Bundle SUDAH RAPI → pindah ke QC.' },
      
      { portal: 'produksi', title: '[STEP 12] Proses QC Inspeksi (Hari 4-5)', menu: 'Papan Lini Produksi › Line A › Catat QC',
        detail: 'QC Inspector Dedi terima 200 pcs dari Steam (sudah rapi). Periksa berdasarkan LKP: (1) Ukuran: panjang 65cm ±2cm ✓, lebar dada 50cm ±2cm ✓. (2) V-neck simetris ✓. (3) Kancing 3 pcs, jarak rata ✓. (4) Warna sesuai pantone ✓. (5) Label posisi benar ✓. (6) Tidak ada defect (lubang, jahitan lepas, noda). Hasil: 200 pcs SEMUA PASS (0 defect - happy path!). Input QC: WO = WO-2026-001, Qty PASS = 200, Qty FAIL = 0. Simpan. 200 pcs pindah ke Packing.' },
      
      { portal: 'produksi', title: '[STEP 13] Proses Packing (Hari 5)', menu: 'Papan Lini Produksi › Line A › Input Produksi',
        detail: 'Wati terima 200 pcs yang LULUS QC. Lipat sweater sesuai standar buyer (fold di tengah, lengan ke dalam). Masukkan polybag (10 pcs per bag). Masukkan karton (50 pcs per karton = 5 polybag). Tempel label karton: WO-2026-001, Model: Sweater V-Neck, Qty: 50 pcs, Size M/L, Buyer: Uniqlo. Total 4 karton (200 pcs). Input per karton: Proses = Packing, Qty = 50, Operator = Wati. Total: 200 pcs ✓. Karton ke area Finished Goods.' },
      
      { portal: 'produksi', title: '[STEP 14] Verifikasi & Tutup WO', menu: 'Produksi › Work Order › WO-2026-001 › Ubah Status',
        detail: 'Supervisor buka WO-2026-001. Tab Progress: qty_produced = 200 ✓, qty_passed_qc = 200 ✓ (0 rework), qty_packed = 200 ✓. Semua qty selesai. Klik dropdown Status → "Completed" → Update. WO status: Completed. Material reservation dilepas. Order status otomatis update: In Production → Ready to Ship. WO tidak muncul lagi di WO aktif.' },
      
      { portal: 'shift', title: '[STEP 15] Shift Handover Akhir Produksi', menu: 'Produksi › Eksekusi › Shift Handover',
        detail: 'Hari 5 akhir shift, Supervisor buat Shift Handover: Shift = Shift 1, Tanggal = 27 Juni 2026. Checklist 5 item: (1) Target ✓ (200 pcs selesai on-time), (2) Quality ✓ (0 defect, 100% pass rate), (3) Downtime ✓ (0 downtime, lancar), (4) Material ✓ (sesuai BOM), (5) K3 ✓ (no incident). Issues = (kosong - tidak ada masalah). Pending Tasks = (kosong). Klik "Simpan". Supervisor Shift 2 (backup) sign-off. Download PDF untuk arsip.' },
    ],
    expectedResults: [
      'WO-2026-001 status: Completed ✓',
      'Output: 200 pcs SEMUA lulus QC (100% pass rate - happy path!)',
      '4 karton packed, ready to ship ke Uniqlo',
      'LKP PDF tersimpan, bisa dicetak ulang kapan saja',
      'Stok gudang berkurang sesuai BOM: Benang -80kg, Kancing -600pcs, Label -200, Hang tag -200',
      'Shift Handover terdokumentasi dengan hasil sempurna (0 issue)',
      'Order status: Ready to Ship (siap pengiriman ke buyer tanggal 30 Juni)',
      'Lead time produksi: 5 hari kerja (23-27 Juni) - sesuai target',
    ],
    keyLearnings: [
      '✅ Happy path = alur ideal tanpa masalah (0 defect, 0 downtime, 100% pass QC)',
      '✅ Order harus Confirmed dulu sebelum bisa generate WO',
      '✅ Release WO = auto-reserve material dari gudang (stok available berkurang)',
      '✅ LKP wajib dibuat sebelum produksi dimulai (operator butuh instruksi jelas)',
      '✅ Assignment operator SETIAP HARI agar sistem tahu siapa bertanggung jawab',
      '✅ Material Issue sebelum produksi dimulai (stok fisik keluar dari gudang ke lini)',
      '✅ URUTAN PROSES: Rajut → Linking → Sewing → STEAM → QC → Packing',
      '✅ Steam WAJIB sebelum QC (garmen harus rapi dulu sebelum inspeksi)',
      '✅ Input progress SETIAP bundle selesai (jangan tunggu akhir hari)',
      '✅ QC pass semua → langsung Packing (tidak perlu Rework)',
      '✅ WO Completed hanya setelah semua qty selesai packed',
      '✅ Shift Handover wajib dibuat meski tidak ada masalah (dokumentasi penting)',
    ],
  },
  {
    id: 's2',
    code: 'S2',
    title: 'Ada Defect — Tidak Lulus QC → Rework',
    description: '200 pcs diproduksi, 30 pcs cacat (jahitan lepas), harus rework.',
    difficulty: 'menengah',
    estimatedTime: '+1-2 hari ekstra (untuk rework)',
    personas: ['produksi', 'qc'],
    prerequisites: [
      'Skenario S1 langkah 1-7 sudah dijalankan (WO sudah produksi 200 pcs)',
      'Kode defect sudah terdaftar di master (mis: jaitan-lepas, lubang, salah-warna)',
      'Operator rework sudah ditentukan',
      'LKP sudah ada untuk WO terkait (untuk upload foto evidence)',
    ],
    steps: [
      { portal: 'qc', title: 'QC Check', menu: 'QC › Inspect',
        detail: '170 lulus, 30 defect (kode: jaitan-lepas).' },
      { portal: 'produksi', title: 'Update WO', menu: 'WO detail',
        detail: 'qty_passed_qc = 170, qty_rework = 30.' },
      { portal: 'produksi', title: 'Tambah Rework', menu: 'Eksekusi › Papan Rework',
        detail: 'Isi WO, qty 30, jenis defect, assign operator rework.' },
      { portal: 'produksi', title: 'Upload Foto Defect', menu: 'LKP detail › Upload Foto',
        detail: 'Caption "Defect: jahitan lepas area bahu", tipe defect_evidence.' },
      { portal: 'produksi', title: 'Rework Selesai', menu: 'Papan Rework',
        detail: '28 pcs sukses rework, 2 pcs reject total.' },
      { portal: 'produksi', title: 'Update Final', menu: 'WO detail',
        detail: 'qty_passed_qc = 198, qty_reject = 2.' },
      { portal: 'shift', title: 'Catat di Handover', menu: 'Shift Handover',
        detail: 'Issues: tipe "kualitas", deskripsi & priority "medium".' },
      { portal: 'produksi', title: 'Download LKP PDF', menu: 'LKP › Download',
        detail: 'Section L menampilkan foto defect.' },
    ],
    expectedResults: [
      'Papan Rework terdokumentasi',
      'Foto defect muncul di LKP PDF Section L',
      'Shift handover mencatat masalah kualitas',
      'Net output: 198 pcs (bukan 200)',
    ],
  },
  {
    id: 's3',
    code: 'S3',
    title: 'Material Kurang — Produksi Tertunda',
    description: 'Stok benang tidak cukup saat WO di-release. Sistem kasih warning.',
    difficulty: 'menengah',
    estimatedTime: '~1-3 hari (tunggu PO datang)',
    personas: ['produksi', 'gudang'],
    prerequisites: [
      'WO Draft sudah ada dengan BOM yang komplit',
      'Master supplier sudah terdaftar',
      'Threshold low stock sudah dikonfigurasi per material',
      'Stok benang YRN-W-002 di bawah kebutuhan WO (intentional shortage)',
    ],
    steps: [
      { portal: 'produksi', title: 'Release WO', menu: 'WO › Release',
        detail: 'Sistem auto-reserve material.' },
      { portal: 'produksi', title: 'Cek Warning', menu: 'API response',
        detail: '"material_reservation.warnings: Stok YRN-W-002 tidak cukup: butuh 45kg, tersedia 30kg".' },
      { portal: 'gudang', title: 'Lihat Low Stock', menu: 'Inventori › Benang',
        detail: 'Badge merah pada YRN-W-002.' },
      { portal: 'gudang', title: 'Buat PO', menu: 'Procurement › PO',
        detail: 'Order ke supplier YRN-W-002 qty 100kg.' },
      { portal: 'shift', title: 'Catat Issue', menu: 'Shift Handover',
        detail: 'Tipe "material", priority "high", deskripsi shortage + status PO.' },
      { portal: 'gudang', title: 'Receiving', menu: 'Procurement › Receiving',
        detail: 'Konfirmasi terima 100kg → stok bertambah otomatis.' },
      { portal: 'produksi', title: 'Lanjutkan Produksi', menu: 'Bulk MI',
        detail: 'Issue material → produksi berjalan.' },
    ],
    expectedResults: [
      'Warning muncul saat release WO',
      'Low stock badge terlihat di modul material',
      'PO terdokumentasi & ter-receive',
      'Shift handover mencatat masalah material',
    ],
  },
  {
    id: 's4',
    code: 'S4',
    title: 'Mesin Breakdown — OEE Turun',
    description: 'Mesin Rajut M-001 breakdown 3 jam di Line A, OEE hari ini turun.',
    difficulty: 'menengah',
    estimatedTime: '~3 jam (event); ~10 menit (input sistem)',
    personas: ['produksi'],
    prerequisites: [
      'Mesin M-001 terdaftar di Master Mesin & assigned ke Line A',
      'WO aktif sedang berjalan di Line A',
      'Reason code downtime sudah ada (mesin-rusak, listrik, dll)',
      'OEE Dashboard sudah ada baseline data minggu ini',
    ],
    steps: [
      { portal: 'produksi', title: 'Operator Lapor', menu: '—',
        detail: 'Mesin M-001 mati jam 09:00.' },
      { portal: 'shift', title: 'Buat Shift Handover (mid-shift)', menu: 'Shift Handover',
        detail: 'Checklist downtime ✓, issue tipe "mesin" priority "high", task "Hubungi teknisi".' },
      { portal: 'produksi', title: 'Lihat OEE', menu: 'Monitoring › OEE',
        detail: 'Line A OEE turun → drill-down → downtime events terlihat.' },
      { portal: 'produksi', title: 'Mesin Diperbaiki', menu: '—',
        detail: 'Jam 12:00 (downtime 3 jam dari 8 jam = Availability 62.5%).' },
      { portal: 'shift', title: 'Sign-Off Handover', menu: 'Shift Handover',
        detail: 'Notes "M-001 sudah ok jam 12:00".' },
      { portal: 'shift', title: 'Download PDF', menu: 'Shift Handover › PDF',
        detail: 'End-of-Shift report tergenerate.' },
    ],
    expectedResults: [
      'OEE Line A turun (availability < 100%)',
      'Downtime terdokumentasi di shift handover & OEE dashboard',
      'Sign-off dengan catatan perbaikan',
      'PDF report lengkap',
    ],
  },
  {
    id: 's5',
    code: 'S5',
    title: 'Shift Malam — Serah Terima Lengkap',
    description: 'Shift 1 (07:00-15:00) selesai, serah terima ke Shift 2 (15:00-23:00).',
    difficulty: 'pemula',
    estimatedTime: '~15 menit',
    personas: ['shift'],
    prerequisites: [
      'Master Shift sudah terdaftar (S1, S2, S3 dengan jam masing-masing)',
      'Supervisor Shift 1 & Shift 2 sudah login',
      'WO aktif dengan progress data shift 1',
    ],
    steps: [
      { portal: 'shift', title: 'Buat Handover Shift 1', menu: 'Shift Handover › Baru',
        detail: 'Pilih Shift 1, isi catatan, checklist 5 item, issues, pending tasks.' },
      { portal: 'shift', title: 'Shift 2 Lihat Handover', menu: 'Shift Handover › Tab Hari Ini',
        detail: '—' },
      { portal: 'shift', title: 'Sign Off', menu: 'Card › Sign Off',
        detail: 'Notes "Diterima, siap dilanjutkan".' },
      { portal: 'shift', title: 'Download PDF', menu: 'Detail › PDF',
        detail: 'Arsip dokumen serah terima.' },
    ],
    expectedResults: [
      'Handover terdaftar dengan status "Signed Off"',
      'Badge "Signed Off" hijau di kartu',
      'PDF lengkap dengan blok tanda tangan kedua supervisor',
    ],
  },
  {
    id: 's6',
    code: 'S6',
    title: 'Hari Libur — APS Skip Otomatis',
    description: '1 Mei (Hari Buruh) — pabrik libur. APS perlu tahu ini.',
    difficulty: 'pemula',
    estimatedTime: '~5 menit',
    personas: ['produksi', 'manajemen'],
    prerequisites: [
      'User punya akses ke Kalender Produksi (admin/produksi)',
      'Tahun berjalan belum di-seed libur nasional',
    ],
    steps: [
      { portal: 'produksi', title: 'Seed Libur Nasional', menu: 'Master Data › Kalender Produksi',
        detail: 'Klik "Seed Libur Nasional 2026" → 20 hari otomatis masuk.' },
      { portal: 'produksi', title: 'Cek APS Gantt', menu: 'Monitoring › APS',
        detail: 'Tanggal 1 Mei berwarna merah, tooltip "Hari Buruh Internasional".' },
      { portal: 'produksi', title: 'Auto-Schedule', menu: 'APS › Auto-Schedule',
        detail: 'Sistem skip tanggal merah otomatis.' },
      { portal: 'produksi', title: 'Cek Kalkulator', menu: 'Kalender › Kalkulator Hari Kerja',
        detail: 'Mei 2026 = 20 hari kerja.' },
    ],
    expectedResults: [
      'Hari libur merah di APS Gantt',
      'Auto-schedule skip hari libur',
      'Kalkulator hari kerja akurat',
    ],
  },
  {
    id: 's7',
    code: 'S7',
    title: 'New Buyer — Full Flow dari Nol',
    description: 'Buyer baru dari Korea pesan 500 pcs cardigan, model belum pernah diproduksi.',
    difficulty: 'lanjut',
    estimatedTime: '~1-2 minggu (real); ~1 jam (setup sistem)',
    personas: ['manajemen', 'produksi', 'gudang'],
    prerequisites: [
      'Akses admin/manager untuk membuat master data baru',
      'Foto sample dari buyer sudah ada (untuk LKP)',
      'Spesifikasi tech-pack model dari buyer',
      'Daftar material yang dibutuhkan (benang, aksesoris)',
    ],
    steps: [
      { portal: 'manajemen', title: 'Tambah Customer', menu: 'Master › Customer',
        detail: 'Profil buyer baru "K-Fashion Ltd".' },
      { portal: 'manajemen', title: 'Tambah Model', menu: 'Master Data › Model Produk',
        detail: 'Model "Cardigan Korea 2026", upload foto desain.' },
      { portal: 'produksi', title: 'Buat BOM', menu: 'BOM › Tambah',
        detail: 'Input kebutuhan material per pcs.' },
      { portal: 'produksi', title: 'Buat SOP', menu: 'SOP › Tambah',
        detail: 'Input langkah kerja + SAM + target pcs/jam.' },
      { portal: 'manajemen', title: 'Buat Order', menu: 'Order › Buat',
        detail: 'K-Fashion 500 pcs Cardigan, delivery 15 Juli.' },
      { portal: 'produksi', title: 'Auto-Schedule', menu: 'APS › Auto-Schedule',
        detail: 'Sistem bagi ke beberapa lini.' },
      { portal: 'produksi', title: 'Generate WO', menu: 'Order › Generate',
        detail: '3 WO: Line A 200, Line B 150, Line C 150.' },
      { portal: 'gudang', title: 'Cek Material & PO', menu: 'Inventori + PO',
        detail: 'Buat PO jika stok kurang.' },
      { portal: 'produksi', title: 'Release Semua WO', menu: 'WO › Release',
        detail: 'Material auto-reserve.' },
      { portal: 'produksi', title: 'Buat LKP per WO', menu: 'LKP › Buat',
        detail: 'Upload foto sample buyer.' },
      { portal: 'produksi', title: 'Lanjut S1', menu: '—',
        detail: 'Lanjutkan dengan flow Skenario 1 (produksi normal).' },
    ],
    expectedResults: [
      'Master data model & SOP tersedia sebelum produksi',
      'APS bisa schedule semua 3 WO sekaligus',
      'LKP berisi foto sample buyer',
    ],
  },
  {
    id: 's8',
    code: 'S8',
    title: 'Lembur & Payroll Akhir Bulan',
    description: 'Ada lembur di akhir bulan, payroll harus akurat.',
    difficulty: 'menengah',
    estimatedTime: '~1-2 jam (review + run payroll)',
    personas: ['sdm', 'keuangan'],
    prerequisites: [
      'Master karyawan + payroll profile lengkap (skema, base rate)',
      'Cutoff payroll bulan berjalan sudah ditentukan',
      'Data attendance bulan ini sudah lengkap (termasuk lembur)',
      'CoA Payroll-related sudah ter-set up',
    ],
    steps: [
      { portal: 'sdm', title: 'Input Lembur', menu: 'SDM › Absensi',
        detail: 'Input jam lembur per karyawan.' },
      { portal: 'sdm', title: 'Export Review', menu: 'Absensi › Export',
        detail: 'Excel data attendance untuk validasi.' },
      { portal: 'keuangan', title: 'Validasi Payroll', menu: 'Payroll › Periksa Sekarang',
        detail: 'Sistem cek anomali (lembur > 3 jam tanpa approval, dll).' },
      { portal: 'keuangan', title: 'Selesaikan Warning', menu: '—',
        detail: 'Approve / koreksi anomali.' },
      { portal: 'keuangan', title: 'Proses Payroll', menu: 'Payroll › Run',
        detail: 'Hitung gaji + lembur + tunjangan - potongan.' },
      { portal: 'keuangan', title: 'Cetak Slip', menu: 'Payroll › Slip',
        detail: 'Generate slip semua karyawan.' },
      { portal: 'sdm', title: 'Laporan Lembur', menu: 'SDM › Laporan',
        detail: 'Export Excel → kirim manajemen.' },
    ],
    expectedResults: [
      'Lembur terhitung otomatis',
      'Warning anomali absensi terdeteksi sebelum payroll',
      'Slip gaji akurat',
      'Laporan lembur ter-export',
    ],
  },
  {
    id: 's9',
    code: 'S9',
    title: 'Workflow Produksi Lengkap — Dari WO Hingga Packing (Step-by-Step Detail)',
    description:
      'Skenario lengkap produksi garmen rajut dari awal hingga akhir dengan 6 proses berurutan: Rajut → Linking → Sewing → Steam → QC → Packing. Panduan ini sangat detail untuk operator dan supervisor baru.',
    difficulty: 'pemula',
    estimatedTime: '~5-7 hari kerja (proses produksi real); ~2 jam (input sistem pertama kali)',
    personas: ['produksi', 'qc', 'shift'],
    prerequisites: [
      'Master Customer & Buyer sudah terdaftar',
      'Model "Kaos Polo Premium" sudah ada dengan foto desain',
      'BOM lengkap: benang cotton 0.3kg/pcs, kancing 2pcs, label 1set',
      'SOP per proses sudah dibuat dengan target waktu & SAM',
      'Stok material cukup untuk 100 pcs',
      'Line B sudah dikonfigurasi dengan 6 operator (1 per proses)',
      'Mesin rajut, linking, sewing, steam sudah ready',
      'QC Inspector sudah trained dengan standar AQL 1.5',
    ],
    steps: [
      // FASE 1: PERSIAPAN
      { portal: 'produksi', title: '[PERSIAPAN 1] Buat Work Order', menu: 'Produksi › Work Order › Buat WO',
        detail: 'Klik "Buat WO Manual". Isi: Model = Kaos Polo Premium, Qty = 100 pcs, Due Date = 7 hari dari hari ini. Status: Draft. Klik "Simpan WO".' },
      
      { portal: 'produksi', title: '[PERSIAPAN 2] Release WO', menu: 'Work Order › Detail WO › Release',
        detail: 'Buka WO yang baru dibuat. Klik "Release WO". Sistem akan reserve material otomatis (benang 30kg, kancing 200pcs, label 100set). Status berubah: Released. Material reserved.' },
      
      { portal: 'produksi', title: '[PERSIAPAN 3] Buat LKP', menu: 'Work Order › Detail WO › Buat LKP',
        detail: 'Klik "Buat LKP". Wizard 5 step: (1) Upload foto desain polo, (2) Pilih SOP: Rajut/Linking/Sewing/Steam/QC/Packing, (3) Standar QC: AQL 1.5, (4) Instruksi packing: 10pcs per polybag, 50pcs per karton, (5) Notes khusus: "Perhatikan kerah polo harus rapi". Klik "Generate LKP". Download PDF dan cetak untuk operator.' },
      
      { portal: 'produksi', title: '[PERSIAPAN 4] Assign Operator ke Line B', menu: 'Produksi › Eksekusi › Assign Lini Hari Ini',
        detail: 'Pilih tanggal = hari ini. Pilih lini = Line B. Assign 6 operator: (1) Budi → Rajut, (2) Siti → Linking, (3) Andi → Sewing, (4) Rini → Steam, (5) Dedi (QC Inspector) → QC, (6) Wati → Packing. Klik "Simpan Assignment".' },
      
      { portal: 'produksi', title: '[PERSIAPAN 5] Issue Material ke Lantai', menu: 'Produksi › Eksekusi › Bulk Material Issue',
        detail: 'Filter WO: "Released". Centang WO Kaos Polo Premium. Klik "Preview" → sistem tampilkan: Benang cotton 30kg, Kancing 200pcs, Label 100set. Klik "Konfirmasi Issue". Material keluar dari gudang ke Line B. Status WO: In Progress.' },
      
      // FASE 2: PROSES PRODUKSI (6 PROSES)
      { portal: 'produksi', title: '[PROSES 1/6] RAJUT — Operator Budi merajut', menu: 'Papan Lini Produksi › Line B › Input Produksi',
        detail: 'Operator Budi mulai merajut dengan mesin M-RAJ-01. Selesai 20 pcs (1 bundle): Klik "Input Produksi" → Pilih WO = Kaos Polo Premium → Proses = Rajut → Qty = 20 pcs → Operator = Budi → Mesin = M-RAJ-01 → Simpan. Bundle pindah ke proses berikutnya (Linking).' },
      
      { portal: 'produksi', title: '[PROSES 2/6] LINKING — Operator Siti menyambung', menu: 'Papan Lini Produksi › Line B › Input Produksi',
        detail: 'Operator Siti terima 20 pcs dari Rajut. Sambungkan badan+lengan+kerah dengan mesin linking. Selesai 20 pcs: Klik "Input Produksi" → WO = Kaos Polo Premium → Proses = Linking → Qty = 20 → Operator = Siti → Simpan. Bundle pindah ke Sewing.' },
      
      { portal: 'produksi', title: '[PROSES 3/6] SEWING — Operator Andi jahit finishing', menu: 'Papan Lini Produksi › Line B › Input Produksi',
        detail: 'Operator Andi terima 20 pcs dari Linking. Pasang label merek & label ukuran, jahit kancing polo. Selesai 20 pcs: Klik "Input Produksi" → WO = Kaos Polo Premium → Proses = Sewing → Qty = 20 → Operator = Andi → Simpan. Bundle pindah ke Steam.' },
      
      { portal: 'produksi', title: '[PROSES 4/6] STEAM — Operator Rini meratakan (WAJIB sebelum QC!)', menu: 'Papan Lini Produksi › Line B › Input Produksi',
        detail: 'Operator Rini terima 20 pcs dari Sewing. Masukkan ke mesin steam 90°C selama 3 menit per pcs untuk ratakan dan bentuk polo. Selesai 20 pcs: Klik "Input Produksi" → WO = Kaos Polo Premium → Proses = Steam → Qty = 20 → Operator = Rini → Simpan. Bundle SUDAH RAPI dan pindah ke QC.' },
      
      { portal: 'produksi', title: '[PROSES 5/6] QC — Inspector Dedi periksa kualitas', menu: 'Papan Lini Produksi › Line B › Catat QC',
        detail: 'QC Inspector Dedi terima 20 pcs dari Steam (sudah rapi). Periksa 1 per 1: ukuran, jahitan, warna, label posisi. Hasil: 18 pcs PASS, 2 pcs FAIL (jahitan kerah kurang rapi). Klik "Catat QC" → WO = Kaos Polo Premium → Qty PASS = 18 → Qty FAIL = 2 → Kode Defect = "jaitan-lepas" → Simpan. 18 pcs pindah ke Packing. 2 pcs pindah ke Rework.' },
      
      { portal: 'produksi', title: '[PROSES 5a/6] REWORK — Perbaiki 2 pcs defect', menu: 'Papan Lini Produksi › Line B › Tambah Rework',
        detail: 'Klik "Tambah Rework" → WO = Kaos Polo Premium → Qty = 2 pcs → Defect = jaitan-lepas → Assign Operator = Andi (operator sewing yang akan perbaiki) → Simpan. Operator Andi perbaiki jahitan kerah 2 pcs. Setelah selesai, kirim ke QC lagi. QC re-check: 2 pcs PASS. Total yang lulus QC sekarang: 18 + 2 = 20 pcs.' },
      
      { portal: 'produksi', title: '[PROSES 6/6] PACKING — Operator Wati kemas', menu: 'Papan Lini Produksi › Line B › Input Produksi',
        detail: 'Operator Wati terima 20 pcs yang LULUS QC. Lipat polo, masukkan polybag (10 pcs per bag), masukkan karton. Selesai 20 pcs: Klik "Input Produksi" → WO = Kaos Polo Premium → Proses = Packing → Qty = 20 → Operator = Wati → Simpan. 20 pcs siap kirim ke customer.' },
      
      { portal: 'produksi', title: '[ULANGI] Proses 1-6 untuk 80 pcs sisanya', menu: 'Papan Lini Produksi',
        detail: 'Ulangi langkah Proses 1 sampai 6 untuk bundle berikutnya (20 pcs per bundle) sampai semua 100 pcs selesai. Total akan ada 5 bundle (5 × 20 pcs = 100 pcs). Catat output setiap bundle selesai per proses.' },
      
      // FASE 3: PENUTUPAN
      { portal: 'produksi', title: '[PENUTUPAN 1] Verifikasi Progress WO 100%', menu: 'Work Order › Detail WO › Tab Progress',
        detail: 'Buka WO. Cek: qty_produced = 100 ✓, qty_passed_qc = 98 ✓ (2 pcs rework tadi sudah pass), qty_packed = 98 ✓. Semua angka cocok → WO siap ditutup.' },
      
      { portal: 'produksi', title: '[PENUTUPAN 2] Tutup WO (Mark as Completed)', menu: 'Work Order › Detail WO › Ubah Status',
        detail: 'Klik dropdown Status → Pilih "Completed" → Klik "Update Status". WO status: Completed. Material reservation dilepas. WO tidak muncul lagi di daftar WO aktif. Data WO masuk laporan historis.' },
      
      // FASE 4: DOKUMENTASI
      { portal: 'shift', title: '[DOKUMENTASI 1] Shift Handover Akhir Shift', menu: 'Produksi › Eksekusi › Shift Handover',
        detail: 'Klik "Buat Handover Baru". Shift = Shift 1 (07:00-15:00). Checklist 5 item: (1) Target ✓, (2) Quality ✓ (2 pcs rework minor), (3) Downtime ✓ (no downtime), (4) Material ✓, (5) K3 ✓. Issues: Catat "2 pcs rework jaitan kerah (sudah diperbaiki)". Priority = Low. Pending Tasks = (kosong). Klik "Simpan Handover". Supervisor Shift 2 nanti akan "Sign Off".' },
      
      { portal: 'produksi', title: '[DOKUMENTASI 2] Penelusuran WO (Traceability)', menu: 'Produksi › Penelusuran WO',
        detail: 'Masukkan WO Number. Sistem tampilkan timeline lengkap: Created → Released → Material Issued → Rajut 100pcs → Linking 100pcs → Sewing 100pcs → Steam 100pcs → QC 98 pass + 2 fail → Rework 2pcs pass → Packing 98pcs → Completed. Data operator per proses tersimpan untuk audit.' },
    ],
    expectedResults: [
      'WO status: Completed (100% selesai)',
      'Output final: 98 pcs packed (2 pcs rework berhasil, 0 reject)',
      'LKP PDF tersimpan dan sudah dibagikan ke operator',
      'Setiap proses tercatat dengan operator & timestamp lengkap',
      'Shift Handover terdokumentasi dengan issue rework minor',
      'Full traceability tersedia untuk audit customer',
      'Material stock gudang berkurang sesuai BOM (benang 30kg, kancing 200, label 100)',
    ],
    keyLearnings: [
      '✅ URUTAN PROSES WAJIB: Rajut → Linking → Sewing → STEAM → QC → Packing',
      '✅ QC hanya dilakukan SETELAH Steam (garmen harus sudah rapi dulu)',
      '✅ Catat output SETIAP bundle selesai (20 pcs) di setiap proses — jangan tunggu akhir shift',
      '✅ Item yang gagal QC masuk Rework (bukan langsung reject) — beri kesempatan perbaikan',
      '✅ Rework maksimal 2x — jika gagal 2x baru reject total',
      '✅ Shift Handover wajib setiap shift untuk dokumentasi dan serah terima',
      '✅ Penelusuran WO (Traceability) penting untuk audit customer atau investigasi complain',
    ],
  },
  {
    id: 's10',
    code: 'S10',
    title: 'Workflow Payroll Lengkap — Dari Absensi Hingga Slip Gaji (Step-by-Step Detail)',
    description:
      'Skenario lengkap proses payroll bulanan dari persiapan data absensi di awal bulan hingga distribusi slip gaji ke karyawan. Panduan ini sangat detail untuk HRD dan staff keuangan yang baru pertama kali menjalankan payroll.',
    difficulty: 'menengah',
    estimatedTime: '~1 bulan penuh (persiapan sepanjang bulan) + 3-5 hari (proses payroll run di akhir bulan)',
    personas: ['sdm', 'keuangan'],
    prerequisites: [
      'Master Karyawan lengkap (minimal 5 karyawan) dengan data: NPK, nama, jabatan, departemen, bank account',
      'Payroll Profile per karyawan sudah dikonfigurasi: gaji pokok, tunjangan, BPJS, PPh 21',
      'Supervisor sudah terdaftar untuk approval lembur',
      'CoA Payroll (Beban Gaji, Hutang Gaji, Hutang BPJS, Hutang PPh) sudah di-setup',
      'Periode payroll bulan Januari 2026 belum pernah diproses (fresh start)',
    ],
    steps: [
      // FASE 1: PERSIAPAN (SEPANJANG BULAN)
      { portal: 'sdm', title: '[PERSIAPAN 1] Verifikasi Data Karyawan Lengkap', menu: 'SDM › Data Karyawan',
        detail: 'Buka semua data karyawan aktif (5 karyawan contoh: Andi, Budi, Citra, Dina, Eko). Cek setiap karyawan: (1) NPK unik ✓, (2) Bank account terisi ✓, (3) Jabatan & Departemen benar ✓. Klik tab "Payroll Profile" per karyawan: (1) Gaji Pokok = Rp 5.000.000 ✓, (2) Tunjangan Makan = Rp 600.000 ✓, (3) Tunjangan Transport = Rp 450.000 ✓, (4) BPJS 2%+1% ✓, (5) PPh 21 sesuai bracket 5% ✓. Semua data valid.' },
      
      { portal: 'sdm', title: '[PERSIAPAN 2] Input Absensi SETIAP HARI (Tanggal 1-30 Jan)', menu: 'SDM › Absensi & Kehadiran',
        detail: 'SETIAP HARI sepanjang bulan Januari, input absensi: Tanggal 1 Jan: Semua karyawan Hadir (check-in 08:00, check-out 17:00). Tanggal 5 Jan: Andi Izin (keperluan keluarga). Tanggal 10 Jan: Budi Sakit (upload surat dokter). Tanggal 15 Jan: Citra Lembur 2 jam (19:00 pulang). Tanggal 20 Jan: Dina Alpha (tanpa keterangan). Tanggal 25 Jan: Eko Cuti Tahunan (approved). Input konsisten setiap hari → data absensi lengkap.' },
      
      { portal: 'sdm', title: '[PERSIAPAN 3] Approval Lembur Akhir Bulan', menu: 'SDM › Absensi › Filter Lembur',
        detail: 'Tanggal 28 Januari, buka "Absensi › Filter Lembur bulan ini". Tampil: Citra lembur 2 jam (15 Jan), Eko lembur 3 jam (22 Jan), Budi lembur 1 jam (27 Jan). Total lembur bulan ini: Citra 2 jam, Eko 3 jam, Budi 1 jam. Review semua lembur → klik "Approve" untuk yang valid. Lembur yang di-approve akan dihitung di payroll.' },
      
      { portal: 'sdm', title: '[PERSIAPAN 4] Rekonsiliasi Cuti', menu: 'SDM › Manajemen Cuti & Izin',
        detail: 'Filter "Cuti bulan ini + Status Approved". Tampil: Eko cuti tahunan 1 hari (25 Jan) - approved. Cocokkan dengan absensi: Tanggal 25 Jan → Eko status "Cuti" ✓. Saldo cuti Eko berkurang 1 hari (dari 12 hari → 11 hari). Data konsisten.' },
      
      // FASE 2: PROSES PAYROLL RUN (AKHIR BULAN)
      { portal: 'keuangan', title: '[PAYROLL 1] Validasi Absensi (Pre-Check)', menu: 'Keuangan › Payroll › Periksa Sekarang',
        detail: 'Tanggal 29 Januari, klik "Periksa Sekarang". Sistem scan absensi Januari 2026. Muncul warning: (1) "Dina alpha 1 hari tanggal 20 Jan — konfirmasi?" → Valid, lanjutkan. (2) "Eko lembur 3 jam — perlu approval manager?" → Sudah di-approve, lanjutkan. Semua warning clear. Klik "Lanjutkan ke Payroll Run".' },
      
      { portal: 'keuangan', title: '[PAYROLL 2] Buat Payroll Run Januari 2026', menu: 'Keuangan › Payroll › Periode › Buat Run',
        detail: 'Klik "Buat Payroll Run". Form: (1) Periode = Januari 2026, (2) Cutoff Date = 30 Januari 2026, (3) Payment Date = 5 Februari 2026, (4) Karyawan = Semua Karyawan Aktif (5 orang). Klik "Generate Payroll Run". Sistem proses 1 menit → Generate 5 slip gaji otomatis. Status: Draft.' },
      
      { portal: 'keuangan', title: '[PAYROLL 3] Review Slip Gaji (Sampling)', menu: 'Keuangan › Payroll › Detail Run › Review Slip',
        detail: 'Review 3 slip sebagai sampel: (1) Andi: Gaji Pokok Rp 5.000.000 + Tunjangan Rp 1.050.000 = Bruto Rp 6.050.000. Potongan: BPJS Rp 150.000 + PPh Rp 250.000 + Izin 1 hari Rp 166.667 = Total Potongan Rp 566.667. Gaji Bersih = Rp 5.483.333 ✓. (2) Citra: Bruto + Lembur 2 jam (Rp 57.800) = Rp 6.107.800. Potongan Rp 566.667. Gaji Bersih = Rp 5.541.133 ✓. (3) Dina: Bruto Rp 6.050.000. Potongan: BPJS+PPh+Alpha 1 hari (Rp 166.667) = Rp 733.334. Gaji Bersih = Rp 5.316.666 ✓. Semua perhitungan benar.' },
      
      { portal: 'keuangan', title: '[PAYROLL 4] Finalize Payroll Run', menu: 'Keuangan › Payroll › Detail Run › Finalize',
        detail: 'Setelah review OK, klik "Finalize Payroll Run". Konfirmasi "Ya, Finalize". Sistem: (1) Lock semua slip gaji (tidak bisa edit lagi), (2) Generate jurnal akuntansi: Debit Beban Gaji Rp 30.250.000 → Kredit Hutang Gaji Rp 27.xxxxx, Kredit Hutang BPJS Rp 750.000, Kredit Hutang PPh Rp 1.250.000. (3) Posting jurnal ke General Ledger. (4) Status: Finalized. (5) Slip gaji tersedia di Portal Saya untuk karyawan.' },
      
      // FASE 3: DISTRIBUSI SLIP GAJI
      { portal: 'keuangan', title: '[DISTRIBUSI 1] Download Semua Slip Gaji (ZIP)', menu: 'Keuangan › Payroll › Cetak Slip Gaji',
        detail: 'Klik "Cetak Slip Gaji" → Pilih "Download Semua (ZIP)". File slip_gaji_januari_2026.zip ter-download berisi 5 PDF (Andi.pdf, Budi.pdf, Citra.pdf, Dina.pdf, Eko.pdf). Setiap PDF berisi: Header perusahaan, Data karyawan, Komponen Penghasilan (Gaji Pokok, Tunjangan, Lembur), Komponen Potongan (BPJS, PPh, Alpha), Gaji Bersih, Bank account untuk transfer.' },
      
      { portal: 'keuangan', title: '[DISTRIBUSI 2] Kirim Slip Gaji ke Karyawan (Email)', menu: 'Email (eksternal)',
        detail: 'Buka email perusahaan. Kirim slip gaji per karyawan: To: andi@email.com, Subject: "Slip Gaji Januari 2026", Attachment: Andi.pdf, Body: "Terlampir slip gaji bulan Januari 2026. Gaji akan ditransfer tanggal 5 Februari 2026." Ulangi untuk 4 karyawan lainnya. Semua slip terkirim.' },
      
      { portal: 'saya', title: '[DISTRIBUSI 3] Karyawan Akses Slip di Portal Saya', menu: 'Portal Saya › Slip Gaji Saya',
        detail: 'Karyawan (misal: Andi) login ke sistem. Pilih "Portal Saya" → menu "Slip Gaji Saya". Tampil: Slip Januari 2026. Klik "Download PDF" → Andi.pdf ter-download. Andi bisa simpan untuk keperluan KPR atau BPJS. Karyawan tidak perlu minta HRD lagi.' },
      
      { portal: 'keuangan', title: '[DISTRIBUSI 4] Transfer Gaji ke Bank Karyawan', menu: 'E-Banking (eksternal)',
        detail: 'Finance export data payroll ke Excel. File berisi: NPK, Nama, Bank Account, Gaji Bersih. Upload file ke e-banking perusahaan untuk bulk transfer. Transfer Rp 5.483.333 ke Andi, Rp 5.500.000 ke Budi, dst. Total transfer: Rp 27.xxxxx (sesuai total gaji bersih 5 karyawan). Tanggal transfer: 5 Februari 2026. Bukti transfer di-screenshot.' },
      
      { portal: 'keuangan', title: '[DISTRIBUSI 5] Catat Pembayaran di Sistem', menu: 'Keuangan › Pembayaran › Catat Pembayaran',
        detail: 'Klik "Catat Pembayaran". Tipe = Payroll Payment, Periode = Januari 2026, Total = Rp 27.xxxxx, Tanggal = 5 Feb 2026. Upload bukti transfer (screenshot). Klik "Simpan". Sistem otomatis: (1) Kurangi saldo Kas/Bank Rp 27.xxxxx, (2) Kurangi Hutang Gaji Rp 27.xxxxx. Hutang Gaji di neraca sekarang = 0.' },
      
      // FASE 4: LAPORAN
      { portal: 'sdm', title: '[LAPORAN] Export Laporan Payroll Summary', menu: 'SDM › Laporan SDM › Payroll Summary',
        detail: 'Buka "Laporan Payroll Summary". Filter = Januari 2026. Generate laporan: (1) Total Gaji Bruto: Rp 30.250.000, (2) Total Gaji Bersih: Rp 27.xxxxx, (3) Total BPJS Perusahaan: Rp 1.875.000, (4) Total PPh 21: Rp 1.250.000, (5) Breakdown per Departemen: Produksi Rp 20jt, Gudang Rp 5jt, Admin Rp 5jt. (6) Tren Lembur: 6 jam total (Citra 2, Eko 3, Budi 1). Klik "Export Excel" → kirim ke Direktur via email.' },
    ],
    expectedResults: [
      'Payroll Run Januari 2026 status: Finalized ✓',
      'Slip gaji 5 karyawan ter-generate dengan perhitungan akurat ✓',
      'Semua slip gaji terdistribusi ke karyawan (via email + Portal Saya) ✓',
      'Gaji ditransfer ke bank karyawan tanggal 5 Februari 2026 ✓',
      'Jurnal akuntansi otomatis ter-posting ke General Ledger ✓',
      'Hutang Gaji di neraca = 0 setelah pembayaran ✓',
      'Laporan Payroll Summary siap untuk review manajemen ✓',
    ],
    keyLearnings: [
      '✅ Data karyawan (Payroll Profile) WAJIB lengkap sebelum payroll run',
      '✅ Input absensi SETIAP HARI sepanjang bulan — jangan tunggu akhir bulan (data jadi tidak akurat)',
      '✅ Approval lembur harus dilakukan sebelum payroll run — lembur tanpa approval tidak dibayar',
      '✅ Validasi absensi dengan "Periksa Sekarang" sebelum payroll run untuk deteksi anomali',
      '✅ Review MINIMAL 3-5 slip gaji sebagai sampel sebelum finalize (cek perhitungan manual)',
      '✅ Finalize = LOCK data — tidak bisa diubah lagi. Setelah finalize, slip gaji langsung tersedia di Portal Saya',
      '✅ Karyawan bisa download slip gaji sendiri di Portal Saya — mengurangi beban administrasi HRD',
      '✅ Semua nilai dalam format Rupiah (Rp) dengan pemisah ribuan (titik) — contoh: Rp 5.000.000',
      '✅ Rate lembur: 1.5x gaji per jam untuk weekday, 2x untuk weekend/libur nasional',
      '✅ Gaji pro-rated untuk karyawan baru/resign pertengahan bulan (hitung per hari)',
      '✅ Koreksi slip gaji (jika ada kesalahan setelah finalize) = buat Payroll Run baru (adjustment run), bukan edit slip lama',
      '✅ Slip gaji harus dikirim SEBELUM tanggal transfer agar karyawan tahu berapa yang akan diterima',
    ],
  },
];

/* ─────────────────────────────────────────────────────────
 * Tips, FAQ & Troubleshooting
 * ───────────────────────────────────────────────────────── */
export const TIPS = {
  daily: [
    { icon: 'production', title: 'Produksi', items: [
      'Selalu Release WO sebelum issue material — sistem otomatis reserve',
      'Upload foto LKP segera setelah QC — foto muncul di PDF download berikutnya',
      'Buat Shift Handover di akhir setiap shift — bukan hanya saat ada masalah',
      'Pakai "Copy dari Kemarin" untuk Assign Lini — hemat waktu',
    ]},
    { icon: 'warehouse', title: 'Gudang', items: [
      'Receiving harus sertakan material_id — agar stok ter-update otomatis',
      'Cek low-stock dashboard tiap pagi — antisipasi shortage',
      'Lakukan opname rutin (mingguan/bulanan) — data tetap akurat',
    ]},
    { icon: 'finance', title: 'Keuangan', items: [
      'Jalankan validasi attendance sebelum Run Payroll',
      'Review jurnal otomatis (opname, payroll) sebelum tutup buku',
    ]},
  ],
  faq: [
    { q: 'Mengapa foto LKP belum muncul di PDF?',
      a: 'Foto muncul setelah download ulang. Sistem otomatis re-generate PDF kalau ada upload baru (pdf_stale=True).' },
    { q: 'Bagaimana cara reset password?',
      a: 'Hubungi admin sistem. Admin bisa reset via SDM › Karyawan › User Account.' },
    { q: 'WO tidak bisa di-release, kenapa?',
      a: 'Cek apakah BOM komplit & stok material cukup. Sistem block release kalau material kurang (kecuali force).' },
    { q: 'OEE saya 0, kenapa?',
      a: 'OEE perlu data baseline (target produksi, downtime events). Pastikan SOP punya target & lini punya assignment hari ini.' },
    { q: 'Apakah bisa rollback jurnal?',
      a: 'Ya, lewat Akuntansi › Jurnal › klik jurnal → Reverse. Akan buat jurnal balik (kontra).' },
  ],
  troubleshoot: [
    { issue: 'PDF LKP gagal di-download',
      sol: 'Cek koneksi internet. Klik "Regenerate" di detail LKP. Kalau masih error, lihat log audit di tab Audit.' },
    { issue: 'Stok minus setelah issue',
      sol: 'Pasti ada bug data. Stop issue, lakukan opname segera, lalu adjustment ke GL.' },
    { issue: 'Auto-schedule APS tidak skip libur',
      sol: 'Pastikan Kalender Produksi sudah seed libur nasional + tahun berjalan ada di range.' },
  ],
};
