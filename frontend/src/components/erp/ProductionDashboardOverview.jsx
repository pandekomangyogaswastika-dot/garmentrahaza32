/**
 * ProductionDashboardOverview — Enhanced with Dashboard→LineBoard Integration
 *
 * Improvements (Gap Analysis):
 *  D2-A: Expandable WIP rows → per-PO breakdown with deadline indicator
 *  D2-B: +Input button navigates to LineBoard (not QuickInput Panel)
 *        pre-selects PO with highest WIP for that process
 *  D2-C: Bottleneck KPI click → LineBoard pre-filtered to top-WIP PO
 *  D2-D: Urgent deadline display next to bottleneck indicator
 *
 * Data source: GET /api/rahaza/wip/summary-per-po
 * (replaces /wip/summary — richer, includes per-PO breakdown)
 */
import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, Factory, Activity, AlertTriangle, Layers,
  LayoutGrid, Plus, ChevronDown, ChevronRight, Calendar,
  Clock, TrendingUp, Package, ArrowRight, ExternalLink,
  Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatCard, ChartCard, HeroCrystalCard } from './dashboardAtoms';
import NextActionWidget from './NextActionWidget';
import SetupWizard from './SetupWizard';

const fmtNum = (v) => Number(v || 0).toLocaleString('id-ID');

/** Navigate to LineBoard, optionally pre-select order + highlight process */
function gotoLineBoard(onNavigate, orderId = null, processCode = null) {
  if (orderId)      sessionStorage.setItem('lineboard_preselect_order_id', orderId);
  if (processCode)  sessionStorage.setItem('lineboard_preselect_process_code', processCode);
  if (onNavigate)   onNavigate('prod-line-board');
}

// ── Deadline badge ────────────────────────────────────────────────────────────
function DeadlineBadge({ days, size = 'sm' }) {
  if (days === null || days === undefined) return null;
  const baseClass = size === 'xs'
    ? 'inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-semibold'
    : 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold';

  if (days < 0)
    return <span className={`${baseClass} bg-red-500/20 text-red-400 border border-red-500/30`}><Flame className="w-2.5 h-2.5" />Terlambat {Math.abs(days)}h</span>;
  if (days === 0)
    return <span className={`${baseClass} bg-red-500/20 text-red-400 border border-red-500/30`}><AlertTriangle className="w-2.5 h-2.5" />Hari ini!</span>;
  if (days <= 3)
    return <span className={`${baseClass} bg-orange-500/20 text-orange-400 border border-orange-500/30`}><Clock className="w-2.5 h-2.5" />{days}h lagi</span>;
  if (days <= 7)
    return <span className={`${baseClass} bg-yellow-500/20 text-yellow-400 border border-yellow-500/30`}><Calendar className="w-2.5 h-2.5" />{days}h lagi</span>;
  return <span className={`${baseClass} bg-foreground/5 text-foreground/40`}>{days}h lagi</span>;
}

// ── Per-PO breakdown row ──────────────────────────────────────────────────────
function PoBreakdownRow({ po, processCode, onNavigate, rank }) {
  const isUrgent  = po.is_urgent;
  const isOverdue = po.is_overdue;
  const highlight = isOverdue || isUrgent;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors
        ${highlight
          ? 'bg-orange-500/5 border border-orange-500/20 hover:bg-orange-500/10'
          : 'bg-foreground/3 border border-transparent hover:bg-[var(--glass-bg-hover)]'
        }`}
    >
      {/* Rank */}
      <span className="text-[9px] font-bold text-foreground/30 w-4 shrink-0 text-center">#{rank}</span>

      {/* Order info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-foreground truncate">{po.order_number}</span>
          <span className="text-foreground/50 truncate max-w-[120px]">{po.customer_name}</span>
        </div>
        {po.delivery_date && (
          <div className="flex items-center gap-1 mt-0.5">
            <Calendar className="w-2.5 h-2.5 text-foreground/30 shrink-0" />
            <span className="text-foreground/40">{po.delivery_date}</span>
            <DeadlineBadge days={po.days_until_deadline} size="xs" />
          </div>
        )}
      </div>

      {/* WIP qty */}
      <div className="text-right shrink-0">
        <span className={`font-bold tabular-nums ${highlight ? 'text-orange-400' : 'text-foreground'}`}>
          {fmtNum(po.wip_qty)}
        </span>
        <span className="text-foreground/40 ml-0.5 text-[9px]">pcs</span>
      </div>

      {/* CTA: Open LineBoard pre-filtered */}
      <button
        onClick={() => gotoLineBoard(onNavigate, po.order_id, processCode)}
        className="shrink-0 flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[10px] font-semibold
          bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.20)]
          transition-colors border border-[hsl(var(--primary)/0.20)]"
        title={`Buka LineBoard untuk ${po.order_number}`}
        data-testid={`po-lineboard-btn-${po.order_id}`}
      >
        <ArrowRight className="w-3 h-3" />
        <span className="hidden sm:inline">Board</span>
      </button>
    </div>
  );
}

// ── Expandable WIP process row ────────────────────────────────────────────────
function WipProcessRow({ p, idx, isBottleneck, maxWip, onNavigate }) {
  const [expanded, setExpanded] = useState(false);

  const total    = p.total_output + p.wip_qty;
  const outPct   = total > 0 ? (p.total_output / total) * 100 : 0;
  const wipPct   = total > 0 ? (p.wip_qty / total) * 100 : 0;
  const intensity = maxWip > 0 ? (p.wip_qty / maxWip) : 0;
  const hasPOs    = (p.po_breakdown || []).length > 0;
  const topPO     = p.top_wip_po;

  // Best PO to pre-select when clicking +Input or bottleneck
  const actionOrderId = topPO?.order_id || null;

  return (
    <div
      className={`rounded-xl border transition-colors duration-200
        ${isBottleneck
          ? 'border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.04)]'
          : 'border-[var(--glass-border)] bg-transparent'
        }`}
      data-testid={`wip-row-${p.process_code}`}
    >
      {/* Main row (always visible) */}
      <div className="p-3">
        <div className="flex items-center justify-between text-xs mb-2">
          {/* Left: index + name + bottleneck badge + expand */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold text-foreground/35 font-mono w-5 shrink-0">#{idx + 1}</span>
            <span className="font-semibold text-foreground">{p.process_code}</span>

            {isBottleneck && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px]
                font-semibold bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]
                border border-[hsl(var(--warning)/0.25)]"
              >
                <AlertTriangle className="w-2.5 h-2.5" /> Bottleneck
              </span>
            )}

            {/* Urgent deadline badge (from urgent_po) */}
            {p.urgent_po && p.wip_qty > 0 && (
              <DeadlineBadge days={p.urgent_po.days_until_deadline} size="xs" />
            )}

            {/* Expand/collapse button if has POs */}
            {hasPOs && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium
                  text-foreground/50 hover:text-foreground hover:bg-[var(--glass-bg-hover)] transition-colors"
                data-testid={`expand-row-${p.process_code}`}
                aria-label={expanded ? 'Ciutkan breakdown PO' : 'Lihat breakdown PO'}
              >
                {expanded
                  ? <ChevronDown className="w-3 h-3" />
                  : <ChevronRight className="w-3 h-3" />
                }
                <span className="hidden sm:inline">{expanded ? 'Tutup' : `${p.po_breakdown.length} PO`}</span>
              </button>
            )}
          </div>

          {/* Right: WIP + Output + Input button */}
          <div className="flex items-center gap-3 tabular-nums shrink-0">
            <span className="text-foreground/60">
              WIP <span className="font-bold text-foreground">{fmtNum(p.wip_qty)}</span>
            </span>
            <span className="text-foreground/60">
              Output <span className="font-bold text-foreground">{fmtNum(p.total_output)}</span>
            </span>

            {/* D2-B: +Input → LineBoard (not QuickInput) */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => gotoLineBoard(onNavigate, actionOrderId, p.process_code)}
              className="h-7 px-2 text-xs rounded-lg bg-white/5 hover:bg-white/10 border border-white/10"
              data-testid={`overview-row-input-button-${p.process_code}`}
              title={actionOrderId
                ? `Input produksi di LineBoard (PO ${topPO?.order_number})`
                : 'Buka LineBoard untuk input produksi'}
            >
              <Plus className="w-3 h-3 mr-1" />
              <span className="hidden md:inline">Input</span>
            </Button>
          </div>
        </div>

        {/* Bar strip */}
        <div className="h-2.5 rounded-full overflow-hidden bg-[var(--glass-bg)] flex">
          <div
            className="h-full bg-[hsl(var(--success))] transition-[width] duration-500"
            style={{ width: `${outPct}%` }}
            title={`Output selesai: ${fmtNum(p.total_output)} pcs`}
          />
          <div
            className="h-full transition-[width,background-color] duration-500"
            style={{
              width: `${wipPct}%`,
              background: isBottleneck
                ? 'hsl(var(--warning))'
                : `hsl(var(--primary) / ${0.4 + intensity * 0.6})`,
            }}
            title={`WIP: ${fmtNum(p.wip_qty)} pcs`}
          />
        </div>

        {/* Urgent PO quick info (collapsed, one-liner) */}
        {!expanded && p.urgent_po && p.wip_qty > 0 && (
          <div className="flex items-center justify-between mt-1.5 text-[10px] text-foreground/45">
            <span>
              PO tertinggi: <span className="text-foreground/70 font-medium">{p.top_wip_po?.order_number}</span>
              {p.top_wip_po?.customer_name && (
                <span className="ml-1">· {p.top_wip_po.customer_name}</span>
              )}
            </span>
            {p.top_wip_po && (
              <button
                onClick={() => gotoLineBoard(onNavigate, p.top_wip_po.order_id, p.process_code)}
                className="flex items-center gap-0.5 text-[hsl(var(--primary))] hover:underline"
                data-testid={`quick-lineboard-btn-${p.process_code}`}
              >
                <ExternalLink className="w-2.5 h-2.5" />
                Buka Board
              </button>
            )}
          </div>
        )}
      </div>

      {/* D2-A: Expanded per-PO breakdown panel */}
      {expanded && hasPOs && (
        <div className="px-3 pb-3 border-t border-[var(--glass-border)] pt-2.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wider">
              Kontribusi WIP per PO — {p.process_code}
            </p>
            <button
              onClick={() => gotoLineBoard(onNavigate, null, p.process_code)}
              className="flex items-center gap-1 text-[10px] text-[hsl(var(--primary))] hover:underline"
              data-testid={`open-lineboard-all-${p.process_code}`}
            >
              <LayoutGrid className="w-2.5 h-2.5" />
              Lihat semua di LineBoard
            </button>
          </div>
          <div className="space-y-1.5">
            {p.po_breakdown.map((po, rank) => (
              <PoBreakdownRow
                key={po.order_id}
                po={po}
                processCode={p.process_code}
                onNavigate={onNavigate}
                rank={rank + 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ProductionDashboardOverview({ token, onNavigate }) {
  const [summary, setSummary]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [updatedAt, setUpdatedAt] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [naeNonce, setNaeNonce]   = useState(0);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      // Use new per-PO endpoint (richer data, same WIP formula)
      const res = await fetch('/api/rahaza/wip/summary-per-po', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.processes || []);
        setUpdatedAt(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => {
    const t = setInterval(fetchSummary, 30000); // 30s refresh (heavier query)
    return () => clearInterval(t);
  }, [fetchSummary]);

  // Derived KPIs
  const wipValues  = summary.map(s => s.wip_qty);
  const maxWip     = Math.max(0, ...wipValues);
  const bottleneck = maxWip > 0 ? summary.find(s => s.wip_qty === maxWip) : null;
  const totalOutput = summary.reduce((a, s) => a + s.total_output, 0);
  const totalWip    = summary.reduce((a, s) => a + s.wip_qty, 0);
  const totalFlow   = totalOutput + totalWip;
  const efficiency  = totalFlow > 0 ? Math.round((totalOutput / totalFlow) * 100) : 0;

  // D2-D: Most urgent deadline across all processes with WIP
  const allUrgentPos = summary
    .flatMap(p => (p.po_breakdown || []))
    .filter(po => po.days_until_deadline !== null && po.wip_qty > 0);
  const globalUrgentPo = allUrgentPos.length > 0
    ? allUrgentPos.reduce((a, b) => (a.days_until_deadline <= b.days_until_deadline ? a : b))
    : null;

  // D2-C: Navigate to LineBoard with bottleneck's top PO pre-selected
  const handleBottleneckClick = () => {
    const orderId = bottleneck?.top_wip_po?.order_id || null;
    gotoLineBoard(onNavigate, orderId, bottleneck?.process_code || null);
  };

  return (
    <div className="space-y-5" data-testid="production-dashboard">
      {/* Hero */}
      <HeroCrystalCard
        testId="prod-hero"
        eyebrow="Portal Produksi"
        title="Dashboard WIP Real-time"
        description="Monitoring Work-In-Progress per proses (Rajut → Linking → Sewing → Steam → QC → Packing). Klik proses untuk lihat breakdown per PO. Auto-refresh 30 detik."
      >
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={fetchSummary}
            className="h-9 bg-[hsl(var(--primary))] hover:brightness-110"
            data-testid="prod-dash-refresh"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Memuat...' : 'Refresh'}
          </Button>
          {/* D2-D: Urgent PO banner in hero */}
          {globalUrgentPo && (
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border
                ${globalUrgentPo.is_overdue || globalUrgentPo.days_until_deadline <= 3
                  ? 'bg-red-500/10 border-red-500/25 text-red-400'
                  : 'bg-yellow-500/10 border-yellow-500/25 text-yellow-400'
                }`}
            >
              <Flame className="w-3.5 h-3.5 shrink-0" />
              <span>Deadline mendesak:</span>
              <span className="font-bold">{globalUrgentPo.order_number}</span>
              <span className="text-foreground/50">{globalUrgentPo.customer_name}</span>
              <DeadlineBadge days={globalUrgentPo.days_until_deadline} size="xs" />
              <button
                onClick={() => gotoLineBoard(onNavigate, globalUrgentPo.order_id, null)}
                className="ml-1 underline underline-offset-2 hover:no-underline"
                data-testid="urgent-po-lineboard-btn"
              >
                Lihat Board
              </button>
            </div>
          )}
          {updatedAt && (
            <span className="text-xs text-foreground/50">Diperbarui: {updatedAt}</span>
          )}
        </div>
      </HeroCrystalCard>

      {/* Next-Action Widget */}
      <NextActionWidget
        key={naeNonce}
        token={token}
        portal="production"
        onNavigate={(moduleId) => onNavigate && onNavigate(moduleId)}
        onOpenSetupWizard={() => setWizardOpen(true)}
        maxCards={5}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          testId="kpi-total-output"
          icon={Factory}
          label="Total Output"
          value={fmtNum(totalOutput)}
          sub="pcs tercatat semua proses"
          accent="success"
        />
        <StatCard
          testId="kpi-total-wip"
          icon={Layers}
          label="Total WIP"
          value={fmtNum(totalWip)}
          sub="pcs masih dalam proses"
          accent="primary"
        />
        <StatCard
          testId="kpi-efficiency"
          icon={Activity}
          label="Flow Efficiency"
          value={`${efficiency}%`}
          sub={`${fmtNum(totalOutput)} / ${fmtNum(totalFlow)}`}
          accent={efficiency >= 70 ? 'success' : 'warning'}
        />

        {/* D2-C + D2-D: Bottleneck card — click → LineBoard + shows urgent deadline */}
        <div
          onClick={bottleneck ? handleBottleneckClick : undefined}
          className={bottleneck ? 'cursor-pointer' : ''}
          data-testid="kpi-bottleneck"
          title={bottleneck ? `Klik untuk buka LineBoard di PO ${bottleneck.top_wip_po?.order_number || ''}` : ''}
        >
          <StatCard
            testId="kpi-bottleneck-inner"
            icon={AlertTriangle}
            label={bottleneck
              ? `Bottleneck: ${bottleneck.process_code}`
              : 'Bottleneck'
            }
            value={bottleneck
              ? `${fmtNum(bottleneck.wip_qty)} pcs`
              : 'Tidak ada'
            }
            sub={bottleneck
              ? (bottleneck.urgent_po
                  ? `⚡ ${bottleneck.urgent_po.order_number} · ${bottleneck.urgent_po.days_until_deadline !== null ? bottleneck.urgent_po.days_until_deadline + 'h deadline' : 'No deadline'}`
                  : bottleneck.top_wip_po
                    ? `PO: ${bottleneck.top_wip_po.order_number}`
                    : `WIP ${fmtNum(bottleneck.wip_qty)} pcs`
                )
              : 'WIP seimbang'
            }
            accent={bottleneck ? 'warning' : 'success'}
          />
          {bottleneck && (
            <div className="mt-1 flex items-center gap-1 text-[10px] text-[hsl(var(--primary))] pl-1">
              <LayoutGrid className="w-3 h-3" />
              <span>Klik → Buka LineBoard</span>
            </div>
          )}
        </div>
      </div>

      {/* WIP Flow Diagram — expandable rows */}
      <ChartCard
        title="WIP per Proses (alur Rajut → Packing)"
        subtitle="Klik angka proses untuk lihat breakdown per PO + deadline. +Input langsung ke LineBoard."
        actions={
          <Button
            variant="ghost"
            onClick={() => gotoLineBoard(onNavigate)}
            className="h-8 text-xs border border-[var(--glass-border)]"
            data-testid="prod-line-board-cta"
          >
            <LayoutGrid className="w-3.5 h-3.5 mr-1.5" />
            Buka Line Board
          </Button>
        }
      >
        {summary.length === 0 ? (
          <div className="text-center py-10 text-foreground/40 text-sm">
            {loading
              ? 'Memuat data...'
              : 'Belum ada event produksi yang tercatat.'}
          </div>
        ) : (
          <div className="space-y-2">
            {summary.map((p, i) => (
              <WipProcessRow
                key={p.process_code || i}
                p={p}
                idx={i}
                isBottleneck={!!(bottleneck && bottleneck.process_code === p.process_code && p.wip_qty > 0)}
                maxWip={maxWip}
                onNavigate={onNavigate}
              />
            ))}

            {/* Legend */}
            <div className="flex items-center gap-4 pt-2 mt-1 border-t border-[var(--glass-border)] text-[10px] text-foreground/50">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--success))]" />
                Output selesai
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--primary))]" />
                WIP normal
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--warning))]" />
                WIP bottleneck
              </div>
              <div className="flex items-center gap-1.5 ml-auto">
                <ChevronRight className="w-3 h-3" />
                Klik row untuk breakdown PO
              </div>
            </div>

            {/* Quick access: Top urgent POs across all processes */}
            {allUrgentPos.filter(p => p.is_urgent || p.is_overdue).length > 0 && (
              <div className="mt-2 pt-3 border-t border-[var(--glass-border)]">
                <div className="flex items-center gap-2 mb-2">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <p className="text-xs font-semibold text-foreground/70">PO Deadline Mendesak (≤ 7 hari)</p>
                </div>
                <div className="space-y-1">
                  {allUrgentPos
                    .filter(p => p.is_urgent || p.is_overdue)
                    .sort((a, b) => (a.days_until_deadline ?? 999) - (b.days_until_deadline ?? 999))
                    .slice(0, 5)
                    .map((po, idx) => (
                      <div key={`${po.order_id}-${idx}`}
                        className="flex items-center justify-between text-[10px] px-2 py-1.5 rounded-lg
                          bg-orange-500/5 border border-orange-500/15"
                      >
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-3 h-3 text-orange-400 shrink-0" />
                          <span className="font-semibold text-foreground">{po.order_number}</span>
                          <span className="text-foreground/50">{po.customer_name}</span>
                          <DeadlineBadge days={po.days_until_deadline} size="xs" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-foreground/50">{fmtNum(po.wip_qty)} pcs WIP</span>
                          <button
                            onClick={() => gotoLineBoard(onNavigate, po.order_id, null)}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[hsl(var(--primary))]
                              bg-[hsl(var(--primary)/0.10)] hover:bg-[hsl(var(--primary)/0.20)] transition-colors"
                            data-testid={`urgent-lineboard-${po.order_id}`}
                          >
                            <ArrowRight className="w-2.5 h-2.5" />
                            Board
                          </button>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        )}
      </ChartCard>

      {/* Setup Wizard */}
      <SetupWizard
        open={wizardOpen}
        token={token}
        onClose={() => setWizardOpen(false)}
        onNavigate={(moduleId) => onNavigate && onNavigate(moduleId)}
        onComplete={() => { setNaeNonce(n => n + 1); fetchSummary(); }}
      />
    </div>
  );
}
