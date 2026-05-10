import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { AlertTriangle, Package, MapPin, TrendingDown, RefreshCw, ArrowRight, Thermometer } from 'lucide-react';
import { toast } from '../ui/sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const KPI = ({ label, value, sub, icon: Icon, color }) => (
  <div className="bg-white dark:bg-[var(--card-surface)] border border-border rounded-xl p-4 flex items-start gap-4 shadow-sm">
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
      <Icon size={18} className="text-white" />
    </div>
    <div>
      <p className="text-2xl font-bold text-gray-900 dark:text-foreground">{value}</p>
      <p className="text-xs font-medium text-gray-600 dark:text-foreground/75 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const ZONE_COLORS = [
  'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500',
  'bg-violet-500', 'bg-purple-500', 'bg-rose-500', 'bg-orange-500',
];

function utilColor(pct) {
  if (pct >= 85) return 'bg-red-500/80 border-red-400';
  if (pct >= 55) return 'bg-amber-500/80 border-amber-400';
  return 'bg-emerald-500/80 border-emerald-400';
}

export default function WarehouseDashboard({ token }) {
  const [kpi, setKpi] = useState({ total_items: 0, total_locations: 0, pending_gr: 0, pending_putaway: 0 });
  const [lowStock, setLowStock] = useState([]);
  const [reorderAlerts, setReorderAlerts] = useState([]);
  const [stockByLoc, setStockByLoc] = useState([]);
  const [loading, setLoading] = useState(true);
  const hdrs = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lowRes, reorderRes, rahaStockRes] = await Promise.allSettled([
        axios.get(`${API}/api/rahaza/materials?low_stock=true`, { headers: hdrs }),
        axios.get(`${API}/api/rahaza/materials/reorder-alerts`, { headers: hdrs }),
        axios.get(`${API}/api/rahaza/material-stock`, { headers: hdrs }),
      ]);
      if (lowRes.status === 'fulfilled') setLowStock(lowRes.value.data || []);
      if (reorderRes.status === 'fulfilled') setReorderAlerts(reorderRes.value.data || []);

      // Build heatmap from rahaza material-stock (has location_code/name already enriched)
      const stocks = rahaStockRes.status === 'fulfilled' ? (rahaStockRes.value.data || []) : [];
      const locMap = {};
      for (const s of stocks) {
        const lid = s.location_id || 'unknown';
        if (!locMap[lid]) locMap[lid] = {
          location_id: lid,
          total_qty: 0,
          item_count: 0,
          name: s.location_code || s.location_name || lid.slice(0, 8) || 'Unknown',
        };
        locMap[lid].total_qty += parseFloat(s.qty || 0);
        locMap[lid].item_count += 1;
      }
      const byLoc = Object.values(locMap)
        .sort((a, b) => b.total_qty - a.total_qty);
      setStockByLoc(byLoc);

      // Derive KPI from stock data
      const totalSku = stocks.length;
      const totalLocs = byLoc.length;
      setKpi(prev => ({ ...prev, total_items: totalSku, total_locations: totalLocs }));
    } catch (err) {
      toast.error('Gagal memuat data dashboard');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const maxQty = stockByLoc.reduce((m, l) => Math.max(m, l.total_qty), 1);
  const criticalCount = lowStock.length + reorderAlerts.length;

  return (
    <div className="space-y-6 p-1" data-testid="warehouse-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Dashboard Gudang</h2>
          <p className="text-sm text-foreground/55 mt-0.5">Ringkasan real-time Portal Gudang</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-xs text-foreground/65 hover:text-foreground px-3 py-1.5 bg-[var(--card-surface)] hover:bg-[var(--card-surface-hover)] rounded-lg border border-border transition-colors"
          data-testid="dashboard-refresh-btn"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total SKU" value={kpi.total_items ?? stockByLoc.reduce((s,l)=>s+l.item_count,0)} icon={Package} color="bg-blue-500/80" />
        <KPI label="Lokasi Aktif" value={kpi.total_locations ?? stockByLoc.length} icon={MapPin} color="bg-teal-500/80" />
        <KPI label="GR Pending" value={kpi.pending_gr ?? '–'} icon={RefreshCw} color="bg-violet-500/80" />
        <KPI
          label="Stok Kritis"
          value={criticalCount}
          sub={criticalCount > 0 ? `${criticalCount} material perlu perhatian` : 'Semua aman'}
          icon={AlertTriangle}
          color={criticalCount > 0 ? 'bg-red-500/80' : 'bg-emerald-500/80'}
        />
      </div>

      {/* U1 — Low-stock & Reorder Alert Panel */}
      {criticalCount > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4" data-testid="low-stock-panel">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-red-500" />
            <span className="text-sm font-semibold text-red-600 dark:text-red-300">Stok Kritis & Reorder Alert ({criticalCount})</span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {[...lowStock.map(m => ({ ...m, _type: 'low' })), ...reorderAlerts.map(m => ({ ...m, _type: 'reorder' }))]
              .slice(0, 12)
              .map((m, i) => (
              <div key={`${m._type}-${m.code || m.id || i}`} className="flex items-center justify-between bg-[var(--card-surface)] border border-border rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${m._type === 'low' ? 'bg-red-500/20 text-red-600 dark:text-red-300' : 'bg-amber-500/20 text-amber-600 dark:text-amber-300'}`}>
                    {m._type === 'low' ? 'LOW' : 'REORDER'}
                  </span>
                  <span className="text-xs text-foreground truncate font-medium">{m.code}</span>
                  <span className="text-xs text-foreground/55 truncate hidden sm:block">{m.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs font-mono text-red-600 dark:text-red-300">
                    {m.current_qty ?? 0} {m.unit}
                  </span>
                  <TrendingDown size={13} className="text-red-500" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* U6 — Stock Heatmap by Location */}
      <div className="bg-[var(--card-surface)] border border-border rounded-xl p-4" data-testid="stock-heatmap">
        <div className="flex items-center gap-2 mb-4">
          <Thermometer size={16} className="text-cyan-500" />
          <span className="text-sm font-semibold text-foreground">Heatmap Stok per Lokasi</span>
          <span className="ml-auto text-xs text-foreground/45">{stockByLoc.length} lokasi</span>
        </div>
        {stockByLoc.length === 0 ? (
          <div className="text-center py-8 text-foreground/40 text-sm">Belum ada data stok per lokasi</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {stockByLoc.map((loc, i) => {
              const pct = maxQty > 0 ? Math.round((loc.total_qty / maxQty) * 100) : 0;
              return (
                <div
                  key={loc.location_id}
                  className={`border rounded-xl p-3 transition-all hover:scale-105 cursor-default ${utilColor(pct)}`}
                  title={`${loc.name}: ${loc.total_qty} unit, ${loc.item_count} SKU`}
                  data-testid={`heatmap-loc-${i}`}
                >
                  <div className="text-xs font-bold text-white truncate">{loc.name}</div>
                  <div className="text-lg font-bold text-white mt-1">{loc.total_qty.toLocaleString()}</div>
                  <div className="text-[10px] text-white/85">{loc.item_count} SKU · {pct}%</div>
                  <div className="mt-2 h-1.5 rounded-full bg-white/20">
                    <div className="h-full rounded-full bg-white/80" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
          <span className="text-[10px] font-medium text-gray-700 dark:text-foreground/75">Utilisasi:</span>
          {[['bg-emerald-500/80', '< 55%'], ['bg-amber-500/80', '55–85%'], ['bg-red-500/80', '> 85%']].map(([c, l]) => (
            <div key={l} className="flex items-center gap-1">
              <div className={`w-2.5 h-2.5 rounded-sm ${c}`} />
              <span className="text-[10px] font-medium text-gray-700 dark:text-foreground/80">{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
