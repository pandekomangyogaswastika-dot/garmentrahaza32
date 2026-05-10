import { useState } from 'react';
import { motion } from 'framer-motion';
import { GlassCard, GlassPanel } from '@/components/ui/glass';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import {
  BarChart3, Factory, Warehouse, Landmark, UserCog,
  Lock, LogOut, ChevronRight, UserCircle, BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import UserGuideDialog from './userGuide/UserGuideDialog';

// Role → Portals mapping. Admin & Owner = full access.
// Supervisor = produksi + gudang. HR = HR portal. Accounting = Finance.
// NB: ikon tiap portal dipilih agar distinct (tidak duplikat) — lihat UX audit.
const PORTALS = [
  {
    id: 'management',
    name: 'Portal Manajemen',
    description: 'Dashboard eksekutif, master produk/pelanggan, laporan, dan administrasi sistem.',
    icon: BarChart3,
    accent: 'primary',
    roles: ['admin', 'owner', 'manager_produksi', 'manager_keuangan', 'manager_hr'],
  },
  {
    id: 'production',
    name: 'Portal Produksi',
    description: 'Lini produksi rajut, WIP real-time, proses Rajut–Packing, dan papan rework.',
    icon: Factory,
    accent: 'info',
    roles: ['admin', 'owner', 'supervisor', 'staff_produksi', 'manager_produksi'],
  },
  {
    id: 'warehouse',
    name: 'Portal Gudang',
    description: 'Multi-zona (Gedung A/B), penerimaan, put-away, stok benang/aksesoris/FG, opname.',
    icon: Warehouse,
    accent: 'mint',
    roles: ['admin', 'owner', 'supervisor', 'staff_gudang', 'manager_produksi'],
  },
  {
    id: 'finance',
    name: 'Portal Keuangan',
    description: 'Piutang/Hutang, invoice, pembayaran, cost center, akuntansi penuh, dan HPP.',
    icon: Landmark,
    accent: 'success',
    roles: ['admin', 'owner', 'accounting', 'staff_keuangan', 'manager_keuangan'],
  },
  {
    id: 'hr',
    name: 'Portal SDM',
    description: 'Karyawan, shift & absensi, penggajian multi-skema (borongan pcs/jam, mingguan/bulanan).',
    icon: UserCog,
    accent: 'warning',
    roles: ['admin', 'owner', 'hr', 'staff_hr', 'manager_hr'],
  },
  {
    id: 'self',
    name: 'Portal Saya',
    description: 'Lihat kehadiran dan slip gaji pribadi Anda. Tersedia untuk semua karyawan terdaftar.',
    icon: UserCircle,
    accent: 'self',
    roles: [],  // empty = accessible to all
    allRoles: true,
  },
];

const ACCENT_STYLES = {
  primary: { bg: 'bg-[hsl(var(--primary)/0.15)]', border: 'border-[hsl(var(--primary)/0.30)]', text: 'text-[hsl(var(--primary))]' },
  info:    { bg: 'bg-[hsl(var(--info)/0.15)]',    border: 'border-[hsl(var(--info)/0.30)]',    text: 'text-[hsl(var(--info))]' },
  mint:    { bg: 'bg-[hsl(var(--accent)/0.22)]',  border: 'border-[hsl(var(--accent)/0.35)]',  text: 'text-[hsl(var(--accent-foreground))]' },
  success: { bg: 'bg-[hsl(var(--success)/0.15)]', border: 'border-[hsl(var(--success)/0.30)]', text: 'text-[hsl(var(--success))]' },
  warning: { bg: 'bg-[hsl(var(--warning)/0.15)]', border: 'border-[hsl(var(--warning)/0.30)]', text: 'text-[hsl(var(--warning))]' },
  self:    { bg: 'bg-pink-500/10',                 border: 'border-pink-500/30',                 text: 'text-pink-600' },
};

export default function PortalSelector({ user, onSelectPortal, onLogout }) {
  const userRole = (user?.role || '').toLowerCase();
  const [guideOpen, setGuideOpen] = useState(false);

  const canAccess = (portal) => {
    if (portal.allRoles) return true;  // Portal Saya is for everyone
    if (['superadmin', 'admin', 'owner'].includes(userRole)) return true;
    return portal.roles.includes(userRole);
  };

  const accessiblePortals = PORTALS.filter(canAccess);

  return (
    <div className="min-h-screen bg-ambient noise-overlay" data-testid="portal-selector-page">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 sm:px-10 py-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(var(--primary)/0.20)] to-[hsl(var(--accent)/0.20)] border border-[hsl(var(--primary)/0.30)] flex items-center justify-center shadow-[var(--shadow-glow-blue)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20.38 3.46 16 2 12 5.5 8 2 3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>
            </svg>
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold text-foreground leading-tight">PT Rahaza Global Indonesia</div>
            <div className="text-xs text-foreground/50 leading-tight">ERP Rajut — Sistem Manufaktur Rajut</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => setGuideOpen(true)}
            className="text-foreground/70 hover:text-foreground hover:bg-[var(--glass-bg-hover)] gap-2"
            data-testid="portal-selector-guide-btn"
            aria-label="Buka Panduan Penggunaan"
          >
            <BookOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Panduan</span>
          </Button>
          <ThemeToggle data-testid="portal-theme-toggle-btn" />
          <Button
            variant="ghost"
            onClick={onLogout}
            className="text-foreground/60 hover:text-foreground hover:bg-[var(--glass-bg-hover)] gap-2"
            data-testid="portal-selector-logout-btn"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Keluar</span>
          </Button>
        </div>
      </div>

      <UserGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-6 sm:px-10 pt-8 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-2" data-testid="portal-selector-title">
            Pilih Portal
          </h1>
          <p className="text-foreground/50 text-base mb-10">
            Selamat datang, {user?.name || 'Pengguna'}. Silakan pilih portal sesuai tugas Anda.
          </p>
        </motion.div>

        {/* Portal cards grid — uniform heights via grid-auto-rows:1fr + h-full */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 auto-rows-fr">
          {PORTALS.map((portal, idx) => {
            const Icon = portal.icon;
            const hasAccess = canAccess(portal);
            const a = ACCENT_STYLES[portal.accent] || ACCENT_STYLES.primary;

            return (
              <motion.div
                key={portal.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.05 * idx }}
                className="h-full"
              >
                <GlassCard
                  hover={hasAccess}
                  className={`p-6 h-full min-h-[200px] flex flex-col cursor-${hasAccess ? 'pointer' : 'default'} group relative ${
                    !hasAccess ? 'opacity-50' : ''
                  }`}
                  onClick={() => hasAccess && onSelectPortal(portal.id)}
                  data-testid={`portal-selector-${portal.id}-card`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 border ${
                    hasAccess ? `${a.bg} ${a.border}` : 'bg-white/5 border-white/10'
                  }`}>
                    {hasAccess
                      ? <Icon className={`w-5 h-5 ${a.text}`} strokeWidth={2} />
                      : <Lock className="w-5 h-5 text-foreground/30" />
                    }
                  </div>

                  <h3 className="text-base font-semibold text-foreground mb-1.5" data-testid={`portal-${portal.id}-name`}>{portal.name}</h3>
                  <p className="text-sm text-foreground/55 leading-relaxed mb-4 flex-1">{portal.description}</p>

                  {hasAccess ? (
                    <button
                      data-testid={`portal-masuk-btn-${portal.id}`}
                      className="flex items-center gap-1 text-xs font-medium text-[hsl(var(--primary))]/80 group-hover:text-[hsl(var(--primary))] transition-colors bg-transparent border-0 p-0 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); onSelectPortal(portal.id); }}
                      aria-label={`Masuk ke ${portal.name}`}
                    >
                      <span>Masuk</span>
                      <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  ) : (
                    <span className="inline-flex self-start items-center text-xs font-medium text-foreground/40 bg-white/5 border border-white/10 rounded-full px-2.5 py-0.5">
                      Tidak ada akses
                    </span>
                  )}
                </GlassCard>
              </motion.div>
            );
          })}
        </div>

        {/* Your Access */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-10"
        >
          <GlassPanel className="p-5" data-testid="portal-selector-access-panel">
            <h4 className="text-sm font-semibold text-foreground/80 mb-2">Akses Anda</h4>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-foreground/50">
              <div>
                <span className="text-foreground/40">Peran: </span>
                <span className="text-foreground font-medium capitalize" data-testid="access-role">{userRole || '-'}</span>
              </div>
              <div>
                <span className="text-foreground/40">Portal dapat diakses: </span>
                <span className="text-[hsl(var(--primary))] font-medium" data-testid="access-active-count">
                  {accessiblePortals.length} dari {PORTALS.length}
                </span>
              </div>
            </div>
          </GlassPanel>
        </motion.div>
      </div>
    </div>
  );
}
