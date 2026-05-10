import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Package, Eye, RefreshCw, Search, Box, CheckCircle2, Clock,
  AlertTriangle, XCircle, FileSearch, X as IconClose, Calendar,
  TrendingUp, Zap, Tag, ArrowRight,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/glass';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from './DataTableV2';
import { PageHeader } from './moduleAtoms';
import Modal from './Modal';
import { toast } from 'sonner';

/* ───────────────────────────────────────────────────────────────────────
   PT Rahaza ERP · WO Traceability Module (Replaces Bundle Tracking)
   
   Penelusuran WO (Work Order) - event-based tracking untuk WO/PO system.
   Filters: status, pending rework, urgent, search (WO#, Order#, Model)
   Shows: progress per process, pending rework, priority, due date
──────────────────────────────────────────────────────────────────────── */

const STATUS_META = {
  draft:         { label: 'Draft',         color: 'bg-slate-400/15 text-slate-300 border-slate-300/25', icon: Clock },
  released:      { label: 'Released',      color: 'bg-sky-400/15 text-sky-300 border-sky-300/25', icon: Package },
  in_production: { label: 'In Production', color: 'bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] border-[hsl(var(--primary)/0.25)]', icon: TrendingUp },
  completed:     { label: 'Completed',     color: 'bg-emerald-400/15 text-emerald-300 border-emerald-300/25', icon: CheckCircle2 },
  cancelled:     { label: 'Cancelled',     color: 'bg-foreground/10 text-foreground/60 border-foreground/20', icon: XCircle },
};

const PRIORITY_META = {
  normal: { label: 'Normal', color: 'text-foreground/60' },
  high:   { label: 'High',   color: 'text-amber-400' },
  urgent: { label: 'Urgent', color: 'text-red-400' },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.draft;
  const Icon = m.icon || Clock;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${m.color}`}>
      <Icon className="w-3 h-3" />
      {m.label}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.normal;
  return (
    <span className={`text-[10px] font-semibold ${m.color}`}>
      {priority === 'urgent' && <Zap className="w-3 h-3 inline mr-0.5" />}
      {m.label}
    </span>
  );
}

export default function RahazaWOTraceabilityModule({ token, onNavigate }) {
  const [wos, setWos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRework, setFilterRework] = useState(false);
  const [filterUrgent, setFilterUrgent] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [detailWo, setDetailWo] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const searchInputRef = useRef(null);

  const fetchWOs = useCallback(async () => {
    setLoading(true);
    try {
      const qp = new URLSearchParams();
      if (filterStatus) qp.set('status', filterStatus);
      if (filterRework) qp.set('has_pending_rework', 'true');
      if (filterUrgent) qp.set('urgent', 'true');
      if (searchValue.trim()) qp.set('q', searchValue.trim());
      
      const res = await fetch(`/api/rahaza/work-orders/traceability?${qp.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setWos(data.items || []);
      } else {
        toast.error('Gagal memuat data WO');
      }
    } catch (e) {
      toast.error(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [token, filterStatus, filterRework, filterUrgent, searchValue]);

  useEffect(() => {
    fetchWOs();
  }, [fetchWOs]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      fetchWOs();
    }, 300);
    return () => clearTimeout(t);
  }, [searchValue]);

  const openDetail = async (wo) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/rahaza/work-orders/${wo.id}/detail-trace`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDetailWo(data);
      } else {
        toast.error('Gagal memuat detail WO');
      }
    } catch (e) {
      toast.error(`Error: ${e.message}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailWo(null);
  };

  // Stats
  const stats = useMemo(() => {
    const total = wos.length;
    const inProduction = wos.filter(w => w.status === 'in_production').length;
    const completed = wos.filter(w => w.status === 'completed').length;
    const withRework = wos.filter(w => w.pending_rework_pcs > 0).length;
    return { total, inProduction, completed, withRework };
  }, [wos]);

  // Table columns
  const columns = [
    {
      key: 'wo_number',
      label: 'WO #',
      render: (wo) => (
        <div className="font-mono text-xs font-semibold text-foreground">
          {wo.wo_number}
          {wo.priority === 'urgent' && (
            <Zap className="w-3 h-3 inline ml-1 text-red-400" />
          )}
        </div>
      ),
      minWidth: '140px',
    },
    {
      key: 'order_number',
      label: 'Order',
      render: (wo) => (
        <div className="text-xs">
          <div className="font-semibold text-foreground">{wo.order_number || '—'}</div>
          <div className="text-[10px] text-muted-foreground truncate" title={wo.customer_snapshot}>
            {wo.customer_snapshot || '—'}
          </div>
        </div>
      ),
      minWidth: '150px',
    },
    {
      key: 'model',
      label: 'Model · Size',
      render: (wo) => (
        <div className="text-xs">
          <div className="font-medium text-foreground">{wo.model_name || '—'}</div>
          <div className="text-[10px] text-muted-foreground">{wo.size_name || '—'}</div>
        </div>
      ),
      minWidth: '130px',
    },
    {
      key: 'qty',
      label: 'Qty',
      render: (wo) => (
        <div className="text-right font-mono text-xs font-semibold text-foreground">
          {wo.qty} <span className="text-muted-foreground text-[10px]">pcs</span>
        </div>
      ),
      minWidth: '80px',
    },
    {
      key: 'status',
      label: 'Status',
      render: (wo) => <StatusBadge status={wo.status} />,
      minWidth: '130px',
    },
    {
      key: 'progress',
      label: 'Progress',
      render: (wo) => (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${wo.progress_pct}%` }}
              />
            </div>
            <span className="text-[10px] font-mono font-semibold text-foreground tabular-nums">
              {wo.progress_pct}%
            </span>
          </div>
          <div className="text-[9px] text-muted-foreground">
            {wo.current_process || '—'}
          </div>
        </div>
      ),
      minWidth: '150px',
    },
    {
      key: 'pending_rework',
      label: 'Pending Rework',
      render: (wo) => (
        wo.pending_rework_pcs > 0 ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
            <AlertTriangle className="w-3 h-3" />
            {wo.pending_rework_pcs} pcs
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/60">—</span>
        )
      ),
      minWidth: '120px',
    },
    {
      key: 'due_date',
      label: 'Due Date',
      render: (wo) => (
        wo.target_end_date ? (
          <div className="text-[10px]">
            <Calendar className="w-3 h-3 inline mr-1 text-muted-foreground" />
            <span className="text-foreground">{wo.target_end_date}</span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground/60">—</span>
        )
      ),
      minWidth: '110px',
    },
    {
      key: 'actions',
      label: 'Aksi',
      render: (wo) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => openDetail(wo)}
          className="text-xs"
          data-testid={`view-detail-${wo.id}`}
        >
          <Eye className="w-3.5 h-3.5 mr-1" />
          Detail
        </Button>
      ),
      minWidth: '100px',
    },
  ];

  return (
    <div className="space-y-4" data-testid="wo-traceability-module">
      {/* Header */}
      <PageHeader
        icon={FileSearch}
        title="Penelusuran WO"
        subtitle="Tracking Work Order (WO/PO-based) — progress per proses, pending rework, dan status"
        badge="WO/PO System"
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <GlassCard className="p-4" hover={false}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-400/15 border border-sky-400/25">
              <Package className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Total WO
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-foreground">
                {stats.total}
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4" hover={false}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/15 border border-primary/25">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                In Production
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-foreground">
                {stats.inProduction}
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4" hover={false}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-400/15 border border-emerald-400/25">
              <CheckCircle2 className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Completed
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-foreground">
                {stats.completed}
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4" hover={false}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-400/15 border border-red-400/25">
              <AlertTriangle className="w-5 h-5 text-red-300" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Has Rework
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-foreground">
                {stats.withRework}
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Filters & Search */}
      <GlassCard className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="flex-1 min-w-[250px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Cari WO #, Order #, atau Model..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="pl-10 text-sm"
                data-testid="wo-search-input"
              />
            </div>
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            data-testid="status-filter"
          >
            <option value="">Semua Status</option>
            <option value="released">Released</option>
            <option value="in_production">In Production</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Toggle Filters */}
          <Button
            size="sm"
            variant={filterRework ? 'default' : 'outline'}
            onClick={() => setFilterRework(v => !v)}
            data-testid="rework-filter"
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
            Has Pending Rework
          </Button>

          <Button
            size="sm"
            variant={filterUrgent ? 'default' : 'outline'}
            onClick={() => setFilterUrgent(v => !v)}
            data-testid="urgent-filter"
          >
            <Zap className="w-3.5 h-3.5 mr-1" />
            Urgent
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={fetchWOs}
            data-testid="refresh-btn"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </GlassCard>

      {/* Table */}
      <GlassCard className="p-4">
        <DataTable
          rows={wos}
          columns={columns}
          loading={loading}
          emptyTitle="Tidak ada WO yang ditemukan"
          emptyDescription="Belum ada Work Order terdaftar atau sesuai filter."
          onRowClick={(wo) => openDetail(wo)}
        />
      </GlassCard>

      {/* Detail Modal */}
      {detailWo && (
        <WODetailModal
          wo={detailWo}
          loading={detailLoading}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function WODetailModal({ wo, loading, onClose }) {
  if (loading || !wo) {
    return (
      <Modal isOpen={true} onClose={onClose} title="Loading...">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Modal>
    );
  }

  const woData = wo.wo;
  const timeline = wo.process_timeline || [];
  const qcRework = wo.qc_rework_summary || {};

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Detail WO: ${woData.wo_number}`}
      size="large"
    >
      <div className="space-y-6">
        {/* WO Header */}
        <div className="grid grid-cols-2 gap-4 pb-4 border-b border-border">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Order Number
            </div>
            <div className="text-sm font-semibold text-foreground">
              {woData.order_number_snapshot || '—'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Model · Size
            </div>
            <div className="text-sm font-semibold text-foreground">
              {woData.model_name || '—'} · {woData.size_name || '—'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Quantity
            </div>
            <div className="text-sm font-semibold text-foreground font-mono">
              {woData.qty} pcs
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Status
            </div>
            <StatusBadge status={woData.status} />
          </div>
        </div>

        {/* Process Timeline */}
        <div>
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <ArrowRight className="w-4 h-4" />
            Process Timeline
          </h3>
          <div className="space-y-2">
            {timeline.map((proc, idx) => (
              <div
                key={proc.process_code}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border"
              >
                <div className="flex-1">
                  <div className="text-xs font-semibold text-foreground">
                    {proc.process_name}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {proc.output_qty} / {woData.qty} pcs
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        proc.status === 'completed' ? 'bg-emerald-500' :
                        proc.status === 'in_progress' ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                      style={{ width: `${proc.progress_pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-foreground w-10 text-right">
                    {proc.progress_pct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* QC/Rework Summary */}
        {(qcRework.qc_pass > 0 || qcRework.qc_fail > 0) && (
          <div>
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              QC & Rework Summary
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
                <div className="text-[10px] uppercase tracking-wide text-emerald-400 mb-1">
                  QC Pass
                </div>
                <div className="text-xl font-bold font-mono text-emerald-300">
                  {qcRework.qc_pass} pcs
                </div>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25">
                <div className="text-[10px] uppercase tracking-wide text-red-400 mb-1">
                  QC Fail
                </div>
                <div className="text-xl font-bold font-mono text-red-300">
                  {qcRework.qc_fail} pcs
                </div>
              </div>
              <div className="p-3 rounded-lg bg-sky-500/10 border border-sky-500/25">
                <div className="text-[10px] uppercase tracking-wide text-sky-400 mb-1">
                  Rework Pass
                </div>
                <div className="text-xl font-bold font-mono text-sky-300">
                  {qcRework.rework_pass} pcs
                </div>
              </div>
              <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/25">
                <div className="text-[10px] uppercase tracking-wide text-orange-400 mb-1">
                  Pending Rework
                </div>
                <div className="text-xl font-bold font-mono text-orange-300">
                  {qcRework.pending_rework_pcs} pcs
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
