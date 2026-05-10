import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { CommandPalette } from './CommandPalette';
import { NotificationBell } from './NotificationBell';
import ModuleHelpDrawer from './userGuide/ModuleHelpDrawer';
import ModuleTour from './userGuide/ModuleTour';
import UserGuideDialog from './userGuide/UserGuideDialog';
import { ProductionUIProvider } from '@/contexts/ProductionUIContext';
import ProductionWizardModule from './ProductionWizardModule';
import QuickInputPanel from './QuickInputPanel';
import ProductionInputFAB from './ProductionInputFAB';
import {
  Search, X, ChevronLeft, Menu, LogOut, Command as CommandIcon,
  HelpCircle, FileSearch,
  // Dashboards
  LayoutDashboard, Gauge, LineChart, Warehouse, UserCog,
  // Management / Admin
  TrendingUp, FileSpreadsheet, Shirt, UserCircle2, Users, ShieldCheck,
  KeyRound, History, Building2, FileCog, BookOpen,
  // Production operational
  LayoutGrid, CalendarClock, ClipboardList, ClipboardSignature, Boxes,
  Hammer, UserCheck, Activity, BarChart4, Siren, AlertTriangle, Truck, Tv2, Zap,
  ClipboardPen, Package, CalendarDays,
  // Production process stages
  Cable, Link2, Scissors, ClipboardCheck, Droplets, PackageOpen, RotateCcw, Waves, Paintbrush,
  // Production master
  Map, Workflow, Timer, Wrench, Factory, HardHat, Ruler, ListTree, BookMarked,
  // Warehouse
  Archive, PackageMinus, PackagePlus, ArrowRightLeft, MapPin, Sparkles, Lock,
  // Finance — Accounting Core
  FolderTree, BookCheck, Scale, Book, CalendarRange, Settings2,
  FileText, Hourglass, Wallet,
  // Finance — Operasional
  ReceiptText, Landmark, Receipt, PieChart, Calculator, HandCoins, Files,
  CreditCard, FilePlus, Banknote, BarChart3, Shield, ShieldAlert,
  // HR
  Clock, Contact, Calendar,
  // AI & Self
  Brain, Target, UserCircle,
} from 'lucide-react';

// Portal labels shown as badge next to brand (top-left). Click brand to go back to selector.
const PORTAL_LABEL = {
  management: 'Manajemen',
  production:  'Produksi',
  warehouse:   'Gudang',
  finance:     'Keuangan',
  hr:          'SDM',
  self:        'Portal Saya',
};

// ── PT Rahaza ERP · Portal-specific navigation (Navigation Refinement Phase 1+2) ──
// Rules:
//   - Bahasa Indonesia untuk label menu (istilah teknis dipertahankan jika tidak ada padanan).
//   - Setiap ikon UNIK agar mudah dibedakan secara visual (rule from UX audit).
//   - Tidak ada moduleId duplikat antar portal (enforced by registry).
//   - Sections mendukung dua mode:
//       { items: [...] }  — list datar (default)
//       { groups: [{label, items}, ...] }  — dikelompokkan dengan sub-header di sidebar
//
// Navigation Refinement Phase 1:
//   - mgmt-products DIHAPUS dari Manajemen (redirect ke prod-models-bom)
//   - wh-material-reservation DIHAPUS dari Gudang (redirect ke prod-material-reservation)
//   - Production: Dashboard digabung (OEE+LineBalance+Rework+APS → tabs dalam prod-dashboard)
//   - Production: Model+BOM+Sizes → prod-models-bom (satu modul bertab)
//   - Production: QUALITY & ANALYTICS digabung ke MONITORING & ANALYTICS
//   - Production: TV Section dihapus dari nav → dipindah ke footer sidebar
//
// Navigation Refinement Phase 2:
//   - Rename: EKSEKUSI → OPERASIONAL HARIAN
//   - Rename: prod-employees → 'Operator & Skill Matrix'
//   - Rename: prod-bulk-mi → 'Material Issue (Bulk)'
//   - Rename: wh-material-issue → 'Material Issue (Single)'
//   - Rename: hr-employees → 'Data Karyawan & Kontrak'
//   - Tambah: mgmt-integrations (API Keys) di SISTEM
const PORTAL_NAV = {
  management: {
    title: 'Manajemen',
    sections: [
      {
        label: 'RINGKASAN',
        items: [
          { id: 'management-dashboard', label: 'Dashboard Eksekutif', icon: LayoutDashboard },
          { id: 'mgmt-overview',        label: 'Ringkasan Bisnis',    icon: TrendingUp },
          { id: 'mgmt-reports',         label: 'Laporan',             icon: FileSpreadsheet },
        ]
      },
      {
        label: 'MASTER DATA',
        items: [
          // mgmt-products DIHAPUS (Phase 1.1) — redirect ke prod-models-bom di Portal Produksi
          { id: 'mgmt-rahaza-customers',  label: 'Data Pelanggan', icon: UserCircle2 },
        ]
      },
      {
        label: 'SISTEM',
        items: [
          { id: 'mgmt-users',         label: 'Manajemen Pengguna',    icon: Users },
          { id: 'mgmt-roles',         label: 'Manajemen Peran',        icon: Shield },
          { id: 'mgmt-role-matrix',   label: 'Matriks Hak Akses',      icon: KeyRound },
          { id: 'mgmt-activity',      label: 'Log Aktivitas',          icon: History },
          { id: 'mgmt-company',       label: 'Pengaturan Perusahaan',  icon: Building2 },
          { id: 'mgmt-pdf',           label: 'Konfigurasi PDF',        icon: FileCog },
          { id: 'mgmt-integrations',  label: 'Integrasi & API Keys',   icon: Zap },
          { id: 'mgmt-help',          label: 'Panduan Penggunaan',     icon: BookOpen },
        ]
      },
    ]
  },

  production: {
    title: 'Produksi',
    sections: [
      {
        label: 'RINGKASAN',
        items: [
          // Dashboard sekarang memiliki 4 tab: Overview, Performa (OEE+LineBalance), Kualitas (Rework), Jadwal (APS)
          { id: 'production-dashboard', label: 'Dashboard Produksi', icon: Gauge },
        ]
      },
      {
        // Phase 2: Rename EKSEKUSI → OPERASIONAL HARIAN
        label: 'OPERASIONAL HARIAN',
        items: [
          { id: 'prod-wizard',              label: 'Production Wizard',        icon: Zap },
          { id: 'prod-orders',              label: 'Order Produksi',           icon: ClipboardList },
          { id: 'prod-work-orders',         label: 'Work Order',               icon: ClipboardSignature },
          { id: 'prod-bundles',             label: 'Penelusuran WO',           icon: FileSearch },
          { id: 'prod-deliveries',          label: 'Pengiriman (Delivery)',    icon: Truck },
          { id: 'prod-rework-board',        label: 'Papan Rework',             icon: Hammer },
          { id: 'prod-assignments',         label: 'Assign Lini Hari Ini',     icon: UserCheck },
          { id: 'prod-bulk-mi',             label: 'Material Issue (Bulk)',    icon: ClipboardPen },
          { id: 'prod-shift-handover',      label: 'Serah Terima Shift',       icon: Package },
          { id: 'prod-material-reservation',label: 'Reservasi Material',       icon: Lock },
        ]
      },
      {
        // Phase 1.4: Gabung MONITORING + QUALITY & ANALYTICS → MONITORING & ANALYTICS (dengan groups)
        label: 'MONITORING & ANALYTICS',
        groups: [
          {
            label: 'Real-time',
            items: [
              { id: 'prod-line-board',    label: 'Production Board',      icon: LayoutGrid },
              { id: 'prod-andon-board',   label: 'Papan Andon',           icon: AlertTriangle },
              { id: 'prod-alert-settings',label: 'Pengaturan Alert',      icon: Siren },
            ]
          },
          {
            label: 'Quality Analytics',
            items: [
              { id: 'prod-pareto',        label: 'Pareto Cacat',           icon: BarChart3 },
              { id: 'prod-fpy',           label: 'First Pass Yield (FPY)', icon: Target },
              { id: 'prod-aql-calculator',label: 'AQL Sampling Tool',      icon: Shield },
            ]
          },
          {
            label: 'Performance Analytics',
            items: [
              { id: 'prod-downtime',      label: 'Log Downtime Mesin',     icon: Activity },
              { id: 'prod-backlog',       label: 'Backlog & Forecast',     icon: TrendingUp },
            ]
          },
          {
            label: 'Reports',
            items: [
              { id: 'prod-daily-report',  label: 'Laporan Produksi Harian (PDF)', icon: FileText },
            ]
          },
        ]
      },
      {
        label: 'PENGIRIMAN',
        items: [
          { id: 'prod-shipments',    label: 'Pengiriman (Surat Jalan)', icon: Truck },
        ]
      },
      {
        label: 'EKSEKUSI PROSES UTAMA',
        groups: [
          {
            label: 'Proses Utama (6 Tahap)',
            items: [
              { id: 'prod-exec-rajut',   label: '1 · Rajut',    icon: Cable },
              { id: 'prod-exec-linking', label: '2 · Linking',  icon: Link2 },
              { id: 'prod-exec-sewing-s1', label: '3a · Sewing S1',  icon: Scissors },
              { id: 'prod-exec-sewing-s2', label: '3b · Sewing S2',  icon: Scissors },
              { id: 'prod-exec-sewing-s3', label: '3c · Sewing S3',  icon: Scissors },
              { id: 'prod-exec-steam',     label: '4 · Steam',       icon: Droplets },
              { id: 'prod-exec-qc',      label: '5 · QC',       icon: ClipboardCheck },
              { id: 'prod-exec-packing', label: '6 · Packing',  icon: PackageOpen },
            ]
          },
          {
            label: 'Sub-Proses',
            items: [
              { id: 'prod-exec-rework',  label: 'Rework',       icon: RotateCcw },
            ]
          },
        ]
      },
      {
        label: 'MASTER DATA',
        items: [
          { id: 'prod-locations',           label: 'Gedung & Zona',          icon: Map },
          { id: 'prod-processes',           label: 'Proses Produksi',        icon: Workflow },
          { id: 'prod-shifts',              label: 'Shift Kerja',            icon: Timer },
          { id: 'prod-machines',            label: 'Mesin Rajut',            icon: Wrench },
          { id: 'prod-lines',               label: 'Lini Produksi',          icon: Factory },
          // Phase 2: Rename → 'Operator & Skill Matrix'
          { id: 'prod-employees',           label: 'Operator & Skill Matrix', icon: HardHat },
          // Phase 1.3: prod-models + prod-bom + prod-sizes → prod-models-bom (satu modul bertab)
          { id: 'prod-models-bom',          label: 'Master Produk & BOM',    icon: Shirt },
          // Phase 28: Style Master 2.0
          { id: 'prod-styles',              label: 'Style Master',           icon: Ruler },
          { id: 'prod-sop',                 label: 'SOP Produksi',           icon: BookMarked },
          { id: 'prod-defect-codes',        label: 'Master Kode Cacat',      icon: ShieldAlert },
          { id: 'prod-production-calendar', label: 'Kalender Produksi',      icon: CalendarDays },
        ]
      },
      {
        label: 'AI INSIGHTS',
        items: [
          { id: 'prod-ai-insights', label: 'AI Insights & Chatbot', icon: Brain },
        ]
      },
    ]
  },

  warehouse: {
    title: 'Gudang',
    sections: [
      {
        label: 'RINGKASAN',
        items: [
          { id: 'warehouse-dashboard', label: 'Dashboard Gudang', icon: Warehouse },
        ]
      },
      {
        label: 'INVENTORI BAHAN & AKSESORIS',
        items: [
          { id: 'wh-materials',      label: 'Master Material',          icon: Boxes },
          { id: 'wh-stock',          label: 'Stok & Pergerakan',        icon: Archive },
          { id: 'wh-material-issue', label: 'Material Issue (Single)', icon: PackageMinus },
        ]
      },
      {
        label: 'INVENTORI PRODUK JADI',
        items: [
          { id: 'wh-fg', label: 'Inventory Produk Jadi', icon: Archive },
        ]
      },
      {
        label: 'OPERASIONAL GUDANG',
        items: [
          { id: 'wh-purchase-orders', label: 'Purchase Order (PO)', icon: FileText },
          { id: 'wh-receiving', label: 'Penerimaan Barang', icon: PackagePlus },
          { id: 'wh-putaway',   label: 'Put-Away',          icon: ArrowRightLeft },
          { id: 'wh-opname',    label: 'Stok Opname',       icon: ClipboardCheck },
          { id: 'wh-bin',       label: 'Lokasi / Bin',      icon: MapPin },
          { id: 'wh-accessory', label: 'Aksesoris',         icon: Sparkles },
          // wh-material-reservation DIHAPUS (Phase 1.1) — redirect ke prod-material-reservation
        ]
      },
    ]
  },

  finance: {
    title: 'Keuangan',
    sections: [
      {
        label: 'RINGKASAN',
        items: [
          { id: 'finance-dashboard', label: 'Dashboard Keuangan', icon: LineChart },
        ]
      },
      {
        label: 'PIUTANG (AR)',
        items: [
          { id: 'fin-ar-invoices', label: 'Invoice Penjualan (AR)', icon: ReceiptText },
          { id: 'fin-ar',          label: 'Daftar Piutang',         icon: HandCoins },
          { id: 'fin-invoices',    label: 'Rekap Invoice',          icon: Files },
        ]
      },
      {
        label: 'HUTANG (AP)',
        items: [
          { id: 'fin-ap',             label: 'Hutang Vendor',    icon: CreditCard },
          { id: 'fin-manual-invoice', label: 'Invoice Manual',   icon: FilePlus },
          { id: 'fin-approval',       label: 'Persetujuan Invoice', icon: ShieldAlert },
        ]
      },
      {
        label: 'KAS & PEMBAYARAN',
        items: [
          { id: 'fin-cash',     label: 'Kas & Bank',  icon: Landmark },
          { id: 'fin-payments', label: 'Pembayaran',  icon: Banknote },
          { id: 'fin-expenses', label: 'Pengeluaran', icon: Receipt },
        ]
      },
      {
        label: 'BIAYA & HPP',
        items: [
          { id: 'fin-cost-centers', label: 'Pusat Biaya',      icon: PieChart },
          { id: 'fin-hpp',          label: 'HPP / Costing',    icon: Calculator },
          { id: 'fin-recap',        label: 'Rekap Keuangan',   icon: BarChart3 },
        ]
      },
      {
        label: 'AKUNTANSI',
        groups: [
          {
            label: 'Master & Jurnal',
            items: [
              { id: 'fin-coa',              label: 'Bagan Akun (COA)',   icon: FolderTree },
              { id: 'fin-journal-entry',    label: 'Jurnal Umum',        icon: BookCheck },
              { id: 'fin-journal-list',     label: 'Daftar Jurnal',      icon: FileText },
              { id: 'fin-posting-profiles', label: 'Profil Posting GL',  icon: Settings2 },
              { id: 'fin-periods',          label: 'Periode Akuntansi',  icon: CalendarRange },
            ]
          },
          {
            label: 'Laporan Keuangan',
            items: [
              { id: 'fin-trial-balance',  label: 'Neraca Saldo (TB)',   icon: Scale },
              { id: 'fin-general-ledger', label: 'Buku Besar (GL)',     icon: Book },
              { id: 'fin-pnl',            label: 'Laba Rugi (P&L)',     icon: TrendingUp },
              { id: 'fin-balance-sheet',  label: 'Neraca',              icon: BarChart3 },
            ]
          },
          {
            label: 'Arus Kas & Aging',
            items: [
              { id: 'fin-cash-flow', label: 'Laporan Arus Kas', icon: Wallet },
              { id: 'fin-ap-aging',  label: 'Aging Hutang (AP)', icon: Hourglass },
            ]
          },
        ]
      },
    ]
  },

  hr: {
    title: 'SDM',
    sections: [
      {
        label: 'RINGKASAN',
        items: [
          { id: 'hr-dashboard', label: 'Dashboard SDM', icon: UserCog },
        ]
      },
      {
        label: 'KARYAWAN',
        items: [
          // Phase 2: Rename 'Master Karyawan' → 'Data Karyawan & Kontrak'
          { id: 'hr-employees', label: 'Data Karyawan & Kontrak', icon: Users },
        ]
      },
      {
        label: 'KEHADIRAN',
        items: [
          { id: 'hr-attendance', label: 'Absensi Harian', icon: Clock },
          { id: 'hr-leave',      label: 'Izin & Cuti',    icon: Calendar },
        ]
      },
      {
        label: 'PENGGAJIAN',
        items: [
          { id: 'hr-payroll-profiles', label: 'Profil Gaji Karyawan', icon: Contact },
          { id: 'hr-payroll-run',      label: 'Penggajian & Slip',    icon: Banknote },
        ]
      },
      {
        label: 'LAPORAN & ANALYTICS',
        items: [
          { id: 'hr-reports', label: 'Laporan & Analitik SDM', icon: BarChart3 },
        ]
      },
      {
        label: 'AI INSIGHTS',
        items: [
          { id: 'hr-ai-insights', label: 'AI Insights SDM', icon: Brain },
        ]
      },
    ]
  },

  self: {
    title: 'Portal Saya',
    sections: [
      {
        label: 'INFORMASI PRIBADI',
        items: [
          { id: 'self-dashboard', label: 'Kehadiran & Payslip Saya', icon: UserCircle },
        ]
      },
    ]
  },
};

// Helper: apakah section mengandung moduleId (support items & groups)
function sectionContainsModule(section, moduleId) {
  if (!section) return false;
  if (section.items?.some(i => i.id === moduleId)) return true;
  if (section.groups?.some(g => g.items?.some(i => i.id === moduleId))) return true;
  return false;
}

// Helper: flatten section → list of items (menggabungkan groups)
function sectionFlatItems(section) {
  if (!section) return [];
  if (section.items?.length) return section.items;
  if (section.groups?.length) return section.groups.flatMap(g => g.items || []);
  return [];
}

// Helper: cari label menu berdasarkan currentModule (untuk topbar title)
export function findModuleLabel(portal, moduleId) {
  const nav = PORTAL_NAV[portal];
  if (!nav) return moduleId;
  for (const sec of nav.sections) {
    const all = sectionFlatItems(sec);
    const found = all.find(it => it.id === moduleId);
    if (found) return found.label;
  }
  return moduleId;
}

export default function PortalShell({ portal, user, token, onBack, onLogout, onPortalChange, children, currentModule, onModuleChange }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tourSteps, setTourSteps] = useState(null); // null = not active
  const [guideOpen, setGuideOpen] = useState(false);
  const searchRef = useRef(null);
  const searchTimeout = useRef(null);

  const nav = PORTAL_NAV[portal] || PORTAL_NAV.management;

  // ── Global module suggestions (semua portal) untuk Command Palette ──
  const moduleSuggestions = useMemo(() => {
    const out = [];
    Object.entries(PORTAL_NAV).forEach(([pid, p]) => {
      p.sections.forEach(sec => {
        const pushItem = (item, groupLabel = null) => {
          out.push({
            id: item.id,
            label: item.label,
            portal: PORTAL_LABEL[pid] || pid,
            portalId: pid,
            section: groupLabel ? `${sec.label} · ${groupLabel}` : sec.label,
            icon: item.icon,
          });
        };
        sec.items?.forEach(it => pushItem(it));
        sec.groups?.forEach(g => g.items?.forEach(it => pushItem(it, g.label)));
      });
    });
    return out;
  }, []);

  // ── Section-based nav (user's model): top pills = sections, left sidebar = items of active section ──
  const activeSectionIndex = Math.max(
    0,
    nav.sections.findIndex(s => sectionContainsModule(s, currentModule))
  );
  const activeSection = nav.sections[activeSectionIndex] || nav.sections[0];

  const handleSectionPillClick = (sectionLabel) => {
    const target = nav.sections.find(s => s.label === sectionLabel);
    if (!target) return;
    const firstItem = target.items?.[0] || target.groups?.[0]?.items?.[0];
    if (!firstItem) return;
    onModuleChange(firstItem.id);
    setMobileOpen(false);
  };

  // Close search on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSearchInput = useCallback((q) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); setSearchOpen(false); return; }
    setSearchOpen(true);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/global-search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch (e) {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }, [token]);

  const handleSearchSelect = (result) => {
    onModuleChange(result.module);
    setSearchQuery('');
    setSearchResults([]);
    setSearchOpen(false);
  };

  // ── Render helper for sidebar nav item (uniform across flat items & grouped items)
  const renderNavItem = (item) => {
    const Icon = item.icon;
    const isActive = currentModule === item.id;
    if (item.external && item.href) {
      if (collapsed) {
        return (
          <a
            key={item.id}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="relative w-full grid place-items-center h-10 rounded-xl transition-colors duration-150 text-foreground/60 hover:bg-[var(--glass-bg-hover)] hover:text-foreground"
            title={item.label}
            data-testid={`nav-item-${item.id}`}
          >
            <Icon className="w-4 h-4" />
          </a>
        );
      }
      return (
        <a
          key={item.id}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="relative w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-[background-color,color] duration-150 text-foreground/60 hover:bg-[var(--glass-bg-hover)] hover:text-foreground/85"
          data-testid={`nav-item-${item.id}`}
        >
          <Icon className="w-4 h-4 shrink-0" strokeWidth={2} />
          <span className="truncate">{item.label}</span>
        </a>
      );
    }
    if (collapsed) {
      return (
        <button
          key={item.id}
          onClick={() => { onModuleChange(item.id); setMobileOpen(false); }}
          className={`relative w-full grid place-items-center h-10 rounded-xl transition-colors duration-150
            ${isActive ? 'bg-[var(--nav-pill-active)] text-[hsl(var(--primary))]' : 'text-foreground/60 hover:bg-[var(--glass-bg-hover)] hover:text-foreground'}`}
          title={item.label}
          data-testid={`nav-item-${item.id}`}
        >
          {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[hsl(var(--primary))]" />}
          <Icon className="w-4 h-4" />
        </button>
      );
    }
    return (
      <button
        key={item.id}
        onClick={() => { onModuleChange(item.id); setMobileOpen(false); }}
        className={`relative w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm
          transition-[background-color,color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${isActive
            ? 'bg-[var(--nav-pill-active)] text-foreground'
            : 'text-foreground/60 hover:bg-[var(--glass-bg-hover)] hover:text-foreground/85'
          }`}
        data-testid={`nav-item-${item.id}`}
      >
        {isActive && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[hsl(var(--primary))]" aria-hidden="true" />
        )}
        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[hsl(var(--primary))]' : ''}`} strokeWidth={2} />
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  // Wrap content with ProductionUIProvider if in production portal
  const contentWrapper = portal === 'production' ? (
    <ProductionUIProvider>
      {children}
      <ProductionInputFAB />
      <Suspense fallback={null}>
        <ProductionWizardModule token={token} isGlobalMount={true} />
        <QuickInputPanel token={token} />
      </Suspense>
    </ProductionUIProvider>
  ) : children;

  return (
    <div className="flex flex-col h-screen" data-testid={`portal-shell-${portal}`}>
      {/* ╔═══════════════════════════════════════════════════════════════════╗
          ║  TOP BAR — Brand + Portal Badge + SECTION pills + Search + Theme   ║
          ╚═══════════════════════════════════════════════════════════════════╝ */}
      <header className="sticky top-0 z-40 border-b border-[var(--glass-border)] bg-[var(--card-surface)] backdrop-blur-[var(--glass-blur-strong)]">
        <div className="flex items-center gap-3 px-3 sm:px-5 py-2.5">
          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-1.5 rounded-lg text-foreground/60 hover:text-foreground hover:bg-[var(--nav-pill-active)] transition-colors duration-150"
            onClick={() => setMobileOpen(true)}
            data-testid="mobile-menu-btn"
            aria-label="Buka menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Brand + Portal badge (click brand → back to portal selector) */}
          <button
            onClick={onBack}
            className="flex items-center gap-2.5 shrink-0 group transition-opacity duration-150 hover:opacity-80"
            data-testid="portal-back-btn"
            aria-label="Kembali ke pilih portal"
            title="Klik untuk ganti portal"
          >
            <div className="w-9 h-9 rounded-[12px] bg-gradient-to-br from-[hsl(var(--primary)/0.20)] to-[hsl(var(--accent)/0.20)] border border-[hsl(var(--primary)/0.30)] grid place-items-center text-[hsl(var(--primary))] group-hover:scale-105 transition-transform duration-150 shadow-[var(--shadow-glow-blue)]">
              {/* PT Rahaza knit/sweater mark (SVG inline) */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20.38 3.46 16 2 12 5.5 8 2 3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
              </svg>
            </div>
            <div className="hidden md:flex flex-col leading-tight text-left">
              <span className="text-[10px] uppercase tracking-wider text-foreground/40 font-semibold">Portal</span>
              <span className="text-sm font-semibold text-foreground -mt-0.5">{PORTAL_LABEL[portal] || portal}</span>
            </div>
            <ChevronLeft className="hidden md:block w-3.5 h-3.5 text-foreground/30 ml-0.5 group-hover:text-foreground/60 transition-colors duration-150" />
          </button>

          {/* Section pill nav — THE MENU (sections of current portal) */}
          <nav
            className="hidden md:inline-flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--nav-pill-bg)] backdrop-blur-xl p-1 overflow-x-auto max-w-[55vw]"
            data-testid="section-pill-nav"
            aria-label="Menu portal"
          >
            {nav.sections.map((s, idx) => {
              const active = idx === activeSectionIndex;
              return (
                <button
                  key={s.label}
                  onClick={() => handleSectionPillClick(s.label)}
                  className={`relative inline-flex items-center gap-2 rounded-full px-3 lg:px-4 py-1.5 text-xs lg:text-sm font-medium whitespace-nowrap
                    transition-[background-color,color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]
                    ${active
                      ? 'bg-[var(--nav-pill-active)] text-foreground shadow-[var(--shadow-glow-blue)]'
                      : 'text-foreground/60 hover:text-foreground hover:bg-[var(--nav-pill-active)]/60'
                    }`}
                  data-testid={`section-pill-${idx}`}
                  aria-pressed={active}
                  aria-label={`Menu ${s.label}`}
                >
                  <span className={active ? 'text-[hsl(var(--primary))]' : ''}>
                    {formatSectionLabel(s.label)}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Global Search */}
          <div ref={searchRef} className="relative hidden sm:block w-56 lg:w-72">
            <div className="flex items-center gap-2 border border-[var(--glass-border)] rounded-full px-3 py-1.5 bg-[var(--nav-pill-bg)] backdrop-blur-xl focus-within:border-[hsl(var(--primary)/0.4)] transition-colors duration-150">
              <Search className="w-3.5 h-3.5 text-foreground/40 shrink-0" />
              <input
                type="text"
                placeholder="Cari order, WO, SKU..."
                className="flex-1 bg-transparent text-xs text-foreground placeholder:text-foreground/40 focus:outline-none"
                value={searchQuery}
                onChange={e => handleSearchInput(e.target.value)}
                onFocus={() => searchQuery && setSearchOpen(true)}
                data-testid="topbar-global-search-input"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchOpen(false); }} data-testid="search-clear-btn" aria-label="Bersihkan pencarian">
                  <X className="w-3.5 h-3.5 text-foreground/40 hover:text-foreground/70" />
                </button>
              )}
            </div>

            {searchOpen && (
              <div className="absolute top-full mt-1.5 left-0 right-0 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--popover-surface)] backdrop-blur-[var(--glass-blur-strong)] shadow-[var(--shadow-soft)] z-50 overflow-hidden">
                {searchLoading ? (
                  <div className="px-4 py-3 text-xs text-foreground/50 text-center">Mencari...</div>
                ) : searchResults.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-foreground/40 text-center">Tidak ada hasil untuk "{searchQuery}"</div>
                ) : (
                  <div className="max-h-80 overflow-y-auto">
                    {searchResults.map((r, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSearchSelect(r)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--glass-bg-hover)] text-left transition-colors duration-150 border-b border-[var(--glass-border)] last:border-0"
                        data-testid={`search-result-${idx}`}
                      >
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 bg-[var(--nav-pill-active)] text-foreground/70 uppercase">{r.type}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{r.label}</p>
                          {r.sub && <p className="text-[10px] text-foreground/50 truncate">{r.sub}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Theme + user + logout */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Command Palette trigger (Cmd+K) */}
            <button
              onClick={() => setCmdkOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-2.5 rounded-full border border-[var(--glass-border)] bg-[var(--nav-pill-bg)] text-foreground/60 hover:text-foreground hover:bg-[var(--nav-pill-active)] transition-colors duration-150"
              data-testid="topbar-cmdk-trigger"
              title="Buka Command Palette (Ctrl/Cmd + K)"
              aria-label="Buka Command Palette"
            >
              <CommandIcon className="w-3.5 h-3.5" />
              <span className="hidden lg:inline text-[10px] font-semibold tracking-wider uppercase">⌘ K</span>
            </button>
            {/* Help button — opens module-specific help drawer */}
            <button
              onClick={() => setHelpOpen(true)}
              className="h-9 w-9 rounded-full border border-[hsl(var(--primary)/0.30)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.15)] transition-colors duration-150 grid place-items-center"
              data-testid="topbar-help-btn"
              title="Bantuan modul ini (?)"
              aria-label="Buka bantuan modul"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            {/* Panduan lengkap (full guide modal) */}
            <button
              onClick={() => setGuideOpen(true)}
              className="hidden md:grid h-9 w-9 rounded-full border border-[var(--glass-border)] bg-[var(--nav-pill-bg)] text-foreground/60 hover:text-foreground hover:bg-[var(--nav-pill-active)] transition-colors duration-150 place-items-center"
              data-testid="topbar-guide-btn"
              title="Panduan Penggunaan ERP lengkap"
              aria-label="Buka panduan lengkap"
            >
              <BookOpen className="w-4 h-4" />
            </button>
            <ThemeToggle />
            <NotificationBell
              token={token}
              onNavigateModule={(moduleId) => { if (moduleId) onModuleChange(moduleId); }}
            />
            <div className="hidden md:flex items-center gap-2 pl-2 ml-1 border-l border-[var(--glass-border)]" data-testid="topbar-user-info">
              <div className="w-8 h-8 rounded-full bg-[hsl(var(--primary)/0.15)] border border-[hsl(var(--primary)/0.25)] grid place-items-center text-[hsl(var(--primary))] text-xs font-bold">
                {user?.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="hidden lg:block leading-tight">
                <p className="text-xs font-medium text-foreground truncate max-w-[140px]">{user?.name || 'Pengguna'}</p>
                <p className="text-[10px] text-foreground/50 capitalize">{user?.role || ''}</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="h-9 w-9 rounded-full border border-[var(--glass-border)] bg-[var(--nav-pill-bg)] text-foreground/60 hover:text-foreground hover:bg-[var(--nav-pill-active)] transition-colors duration-150 grid place-items-center"
              data-testid="topbar-logout-btn"
              title="Keluar"
              aria-label="Keluar"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ╔═══════════════════════════════════════════════════════════════════╗
          ║  BODY — Side Nav (items of active section) + Main Content         ║
          ╚═══════════════════════════════════════════════════════════════════╝ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar — flat list of items belonging to ACTIVE section */}
        <aside
          className={`${collapsed ? 'md:w-[72px]' : 'md:w-[240px]'}
            fixed md:static inset-y-0 left-0 z-30 w-[260px]
            transition-[width,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
            ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
          data-testid="portal-sidebar"
        >
          <div className="h-full flex flex-col bg-[var(--card-surface)] backdrop-blur-[var(--glass-blur-strong)] border-r border-[var(--glass-border)]">
            {/* Sidebar header: active section name + collapse toggle */}
            <div className="px-3 py-3 flex items-center justify-between border-b border-[var(--glass-border)]">
              {!collapsed && (
                <div className="flex items-center gap-2 min-w-0 px-1">
                  <div className="w-1 h-4 rounded-full bg-[hsl(var(--primary))] shrink-0" />
                  <span className="text-[11px] font-semibold tracking-wider text-foreground/70 uppercase truncate" data-testid="sidebar-active-section">
                    {formatSectionLabel(activeSection?.label || '')}
                  </span>
                </div>
              )}
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="hidden md:grid place-items-center h-7 w-7 rounded-lg text-foreground/50 hover:text-foreground hover:bg-[var(--nav-pill-active)] transition-colors duration-150"
                data-testid="sidebar-toggle-btn"
                aria-label={collapsed ? 'Perluas menu' : 'Ciutkan menu'}
              >
                <Menu className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setMobileOpen(false)}
                className="md:hidden grid place-items-center h-7 w-7 rounded-lg text-foreground/50 hover:text-foreground hover:bg-[var(--nav-pill-active)]"
                aria-label="Tutup menu"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Mobile: show section dropdown at top of sidebar */}
            {mobileOpen && (
              <div className="md:hidden p-2 border-b border-[var(--glass-border)]">
                <select
                  value={activeSection?.label || ''}
                  onChange={e => handleSectionPillClick(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-xs text-foreground"
                  data-testid="mobile-section-select"
                >
                  {nav.sections.map(s => (
                    <option key={s.label} value={s.label}>{formatSectionLabel(s.label)}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Items (flat list OR grouped) of active section */}
            <nav className="flex-1 overflow-y-auto py-2 px-2" data-testid="sidebar-items">
              {activeSection?.groups?.length ? (
                <div className="space-y-3">
                  {activeSection.groups.map((g) => (
                    <div key={g.label}>
                      {!collapsed && (
                        <div className="px-3 pt-2 pb-1.5 flex items-center gap-1.5" data-testid={`sidebar-group-header-${g.label}`}>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/40">{g.label}</span>
                          <div className="flex-1 h-px bg-[var(--glass-border)]" aria-hidden="true" />
                        </div>
                      )}
                      {collapsed && (
                        <div className="mx-2 my-1 h-px bg-[var(--glass-border)]" aria-hidden="true" />
                      )}
                      <div className="space-y-0.5">
                        {(g.items || []).map(renderNavItem)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {(activeSection?.items || []).map(renderNavItem)}
                  {(!activeSection?.items || activeSection.items.length === 0) && (
                    <div className="px-3 py-6 text-center text-xs text-foreground/40">Belum ada item di menu ini.</div>
                  )}
                </div>
              )}
            </nav>

            {/* Sidebar footer: Recent modules + TV link + breadcrumb */}
            {!collapsed && (
              <div className="px-3 py-2 border-t border-[var(--glass-border)] space-y-1">
                {/* Recent modules */}
                <RecentModulesFooter
                  portal={portal}
                  currentModule={currentModule}
                  onModuleChange={onModuleChange}
                />
                <p className="text-[10px] text-foreground/40 truncate" data-testid="topbar-module-title">
                  {findModuleLabel(portal, currentModule)}
                </p>
                {/* Phase 1.5: TV link moved from sidebar section to footer */}
                <a
                  href="/tv"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[10px] text-foreground/40 hover:text-foreground/70 transition-colors duration-150 group"
                  data-testid="sidebar-tv-link"
                >
                  <Tv2 className="w-3 h-3 group-hover:text-[hsl(var(--primary))]" />
                  <span>Mode TV Lantai Produksi</span>
                </a>
              </div>
            )}
          </div>
        </aside>

        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-[var(--overlay-bg)] z-20 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto p-4 sm:p-6">
            {contentWrapper}
          </div>
        </main>
      </div>

      {/* ── Command Palette (Cmd+K) ─────────────────────────────────────── */}
      <CommandPalette
        open={cmdkOpen}
        onOpenChange={setCmdkOpen}
        currentPortal={portal}
        onSelectPortal={(pid) => { onPortalChange?.(pid); }}
        onSelectModule={(mid) => { onModuleChange?.(mid); }}
        onLogout={onLogout}
        moduleSuggestions={moduleSuggestions}
      />

      {/* ── Module Help Drawer (?) ──────────────────────────────────────── */}
      <ModuleHelpDrawer
        open={helpOpen}
        onOpenChange={setHelpOpen}
        moduleId={currentModule}
        onStartTour={(steps) => setTourSteps(steps)}
      />

      {/* ── Module Tour (interactive overlay) ───────────────────────────── */}
      {tourSteps && (
        <ModuleTour steps={tourSteps} onClose={() => setTourSteps(null)} />
      )}

      {/* ── Full User Guide Dialog (📖) ─────────────────────────────────── */}
      <UserGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  );
}

/* ── Recent Modules Footer \u2014 shows last 5 visited modules for quick nav \u2500\u2500\u2500 */
function RecentModulesFooter({ portal, currentModule, onModuleChange }) {
  const STORAGE_KEY = `erp_recent_${portal}`;
  const MAX = 5;

  const [recent, setRecent] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  });

  // Update recent list when module changes
  useEffect(() => {
    if (!currentModule) return;
    setRecent(prev => {
      const next = [currentModule, ...prev.filter(m => m !== currentModule)].slice(0, MAX);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModule, portal]);

  // Show only those NOT currently active, max 4 items
  const shown = recent.filter(m => m !== currentModule).slice(0, 4);
  if (shown.length === 0) return null;

  return (
    <div className="mb-1">
      <p className="text-[10px] text-foreground/30 uppercase tracking-wider mb-1">Terakhir</p>
      <div className="space-y-0.5">
        {shown.map(modId => (
          <button
            key={modId}
            onClick={() => onModuleChange?.(modId)}
            className="w-full text-left px-2 py-1 rounded-md text-[11px] text-foreground/50 hover:text-foreground hover:bg-[var(--glass-bg-hover)] transition-colors duration-150 truncate"
            data-testid={`recent-module-${modId}`}
            title={modId}
          >
            {Object.keys(PORTAL_NAV).reduce((found, pid) => {
              if (found !== modId) return found;
              return findModuleLabel(pid, modId);
            }, modId)}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── helper: tampilkan label section lebih enak dibaca (ALL CAPS → Title Case),
   preserve akronim di dalam tanda kurung DAN daftar akronim terkenal ── */
const KNOWN_ACRONYMS = new Set(['HPP', 'AR', 'AP', 'SOP', 'BOM', 'OEE', 'QC', 'APS', 'KPI', 'ERP', 'TV', 'HR', 'WO']);
function formatSectionLabel(label) {
  if (!label) return '';
  return label
    .split(' ')
    .map(w => {
      if (!w) return '';
      // preserve acronyms within parens, e.g. (AR), (AP), (HPP), (F1)
      if (/^\(.+\)$/.test(w)) return w.toUpperCase();
      // preserve known acronyms (case-insensitive match)
      if (KNOWN_ACRONYMS.has(w.toUpperCase())) return w.toUpperCase();
      // everything else → Title Case (first letter upper, rest lower)
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}
