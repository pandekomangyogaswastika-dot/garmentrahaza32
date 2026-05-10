import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Edit2, Trash2, Eye, ArrowRight, X, ClipboardList, Scale, AlertTriangle, CheckCircle2, Box, Printer, FileText, Download, RefreshCw, History, PrinterCheck } from 'lucide-react';
import { GlassCard, GlassPanel, GlassInput } from '@/components/ui/glass';
import { Button } from '@/components/ui/button';
import Modal from './Modal';
import { DataTable } from './DataTableV2';
import { PageHeader } from './moduleAtoms';
import { openWorkOrderBundleTickets } from './bundleTickets';
import LKPDialog from './LKPDialog';
import { toast } from 'sonner';

const WO_STATUS_COLORS = {
  draft:         { bg: 'bg-slate-400/15',   border: 'border-slate-300/25',   text: 'text-slate-300',   label: 'Draft' },
  released:      { bg: 'bg-blue-400/15',    border: 'border-blue-300/25',    text: 'text-blue-300',    label: 'Released' },
  in_production: { bg: 'bg-primary/15',     border: 'border-primary/25',     text: 'text-primary',     label: 'In Production' },
  completed:     { bg: 'bg-emerald-400/15', border: 'border-emerald-300/25', text: 'text-emerald-300', label: 'Completed' },
  cancelled:     { bg: 'bg-red-400/15',     border: 'border-red-300/25',     text: 'text-red-300',     label: 'Cancelled' },
};
const PRIORITY_COLORS = {
  normal: { bg: 'bg-foreground/5',   text: 'text-foreground/60',  label: 'Normal' },
  high:   { bg: 'bg-amber-400/15',   text: 'text-amber-300',      label: 'High' },
  urgent: { bg: 'bg-red-400/15',     text: 'text-red-300',        label: 'Urgent' },
};

function StatusBadge({ status }) {
  const s = WO_STATUS_COLORS[status] || WO_STATUS_COLORS.draft;
  return <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.border} border ${s.text}`}>{s.label}</span>;
}
function PriorityBadge({ priority }) {
  const p = PRIORITY_COLORS[priority] || PRIORITY_COLORS.normal;
  return <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded ${p.bg} ${p.text}`}>{p.label}</span>;
}

function ProgressBar({ percent }) {
  const pct = Math.min(100, Math.max(0, Number(percent) || 0));
  return (
    <div className="w-full">
      <div className="h-1.5 bg-[var(--glass-bg)] rounded-full overflow-hidden">
        <div className="h-full bg-[hsl(var(--primary))] transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{pct}%</div>
    </div>
  );
}

export default function RahazaWorkOrdersModule({ token, onNavigate }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState([]);
  const [models, setModels] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [orders, setOrders] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({
    order_id: '', model_id: '', size_id: '', qty: 1, priority: 'normal',
    target_start_date: '', target_end_date: '', notes: '',
    process_rates: []
  });
  const [processRatesForm, setProcessRatesForm] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  // LKP state
  const [lkpDialog, setLkpDialog] = useState(null); // wo to create LKP for
  const [lkpList, setLkpList] = useState([]);
  const [lkpAuditOpen, setLkpAuditOpen] = useState(null); // lkp object
  const [lkpLoading, setLkpLoading] = useState(false);
  // LKP Bulk Print state
  const [bulkLkpOpen, setBulkLkpOpen] = useState(false);
  const [bulkLkpData, setBulkLkpData] = useState(null);
  const [bulkLkpLoading, setBulkLkpLoading] = useState(false);
  // Material Planning state (P9)
  const [matPlanModal, setMatPlanModal] = useState(null); // 'initial' | 'final' | null
  const [matPlanWO, setMatPlanWO] = useState(null); // WO object for material planning
  const [matPlanMaterials, setMatPlanMaterials] = useState([]); // [{material_name, qty_prepared/qty_remaining, unit}]
  const [matPlanSaveAsBom, setMatPlanSaveAsBom] = useState(false);
  const [matPlanSaving, setMatPlanSaving] = useState(false);
  const [allMaterials, setAllMaterials] = useState([]); // Master materials list for dropdown
  const [addMaterialModalOpen, setAddMaterialModalOpen] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ name: '', type: 'yarn', unit: 'kg', color: '' });
  const [addingMaterial, setAddingMaterial] = useState(false);

  // M12: Memoize headers to prevent unnecessary re-renders / effect cycles
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/rahaza/work-orders`, { headers });
      if (r.ok) setList(await r.json());
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => {
    const h = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch('/api/rahaza/work-orders-statuses', { headers: h }).then(r => r.ok ? r.json() : []),
      fetch('/api/rahaza/models', { headers: h }).then(r => r.ok ? r.json() : []),
      fetch('/api/rahaza/sizes',  { headers: h }).then(r => r.ok ? r.json() : []),
      fetch('/api/rahaza/orders', { headers: h }).then(r => r.ok ? r.json() : []),
      fetch('/api/rahaza/processes', { headers: h }).then(r => r.ok ? r.json() : []),
      fetch('/api/rahaza/materials', { headers: h }).then(r => r.ok ? r.json() : []),
    ]).then(([st, m, s, o, procs, mats]) => {
      setStatuses(st); setModels(m); setSizes(s); setOrders(o);
      setProcesses(procs.filter(p => !p.is_rework));
      setAllMaterials(mats);
    });
  }, [token]);

  const openBulkLkp = async () => {
    setBulkLkpLoading(true);
    setBulkLkpOpen(true);
    try {
      const res = await fetch('/api/rahaza/lkp-bulk-today', { headers });
      if (res.ok) setBulkLkpData(await res.json());
    } finally {
      setBulkLkpLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ order_id: '', model_id: '', size_id: '', qty: 1, priority: 'normal', target_start_date: '', target_end_date: '', notes: '', process_rates: [] });
    setProcessRatesForm(processes.map(p => ({ process_id: p.id, process_code: p.code, process_name: p.name, rate: '', unit: 'pcs' })));
    setFormError('');
    setModalOpen(true);
  };
  const openEdit = async (wo) => {
    const r = await fetch(`/api/rahaza/work-orders/${wo.id}`, { headers });
    if (!r.ok) return;
    const full = await r.json();
    setEditing(full);
    setForm({
      order_id: full.order_id || '', model_id: full.model_id || '', size_id: full.size_id || '',
      qty: full.qty || 1, priority: full.priority || 'normal',
      target_start_date: full.target_start_date || '', target_end_date: full.target_end_date || '',
      notes: full.notes || '', process_rates: full.process_rates || [],
    });
    // Pre-fill rates form
    const existingRates = full.process_rates || [];
    setProcessRatesForm(processes.map(p => {
      const existing = existingRates.find(r => r.process_id === p.id || r.process_code === p.code);
      return { process_id: p.id, process_code: p.code, process_name: p.name, rate: existing ? String(existing.rate) : '', unit: existing?.unit || 'pcs' };
    }));
    setFormError('');
    setModalOpen(true);
  };
  const openDetail = async (wo) => {
    const r = await fetch(`/api/rahaza/work-orders/${wo.id}`, { headers });
    if (r.ok) {
      const detailData = await r.json();
      setDetail(detailData);
      fetchLkpList(detailData.id);
    }
  };

  const saveWO = async () => {
    setSaving(true); setFormError('');
    try {
      // Build process_rates from form
      const process_rates = processRatesForm
        .filter(r => r.rate !== '' && Number(r.rate) > 0)
        .map(r => ({ process_id: r.process_id, process_code: r.process_code, process_name: r.process_name, rate: Number(r.rate), unit: r.unit || 'pcs' }));
      const payload = {
        order_id: form.order_id || null,
        model_id: form.model_id, size_id: form.size_id,
        qty: Number(form.qty), priority: form.priority,
        target_start_date: form.target_start_date || null,
        target_end_date:   form.target_end_date   || null,
        notes: form.notes,
        process_rates,
      };
      if (!editing) {
        if (!payload.model_id || !payload.size_id || !(payload.qty > 0)) {
          throw new Error('Model, Size, dan Qty > 0 wajib diisi.');
        }
      }
      const url = editing ? `/api/rahaza/work-orders/${editing.id}` : '/api/rahaza/work-orders';
      const method = editing ? 'PUT' : 'POST';
      const body = editing
        ? { qty: payload.qty, priority: payload.priority, target_start_date: payload.target_start_date, target_end_date: payload.target_end_date, notes: payload.notes, process_rates }
        : payload;
      const r = await fetch(url, { method, headers, body: JSON.stringify(body) });
      if (!r.ok) {
        const STATUS_MSG = { 400:'Data WO tidak valid.', 403:'Tidak ada akses.', 404:'Data tidak ditemukan.', 409:'Konflik data.' };
        throw new Error(STATUS_MSG[r.status] || `Gagal menyimpan (HTTP ${r.status})`);
      }
      setModalOpen(false);
      fetchList();
    } catch (err) { setFormError(err.message); }
    finally { setSaving(false); }
  };

  const transition = async (wo, newStatus) => {
    if (!window.confirm(`Ubah status ke ${newStatus}?`)) return;
    const r = await fetch(`/api/rahaza/work-orders/${wo.id}/status`, { method: 'POST', headers, body: JSON.stringify({ status: newStatus }) });
    if (r.ok) { fetchList(); if (detail?.id === wo.id) openDetail(wo); }
    else { alert(`Gagal transisi status (HTTP ${r.status}).`); }
  };
  const deleteWO = async (wo) => {
    if (!window.confirm(`Hapus WO ${wo.wo_number}?`)) return;
    await fetch(`/api/rahaza/work-orders/${wo.id}`, { method: 'DELETE', headers });
    fetchList();
  };

  // ── LKP (Lembar Kerja Produksi) ──
  const fetchLkpList = useCallback(async (woId) => {
    if (!woId) return;
    setLkpLoading(true);
    try {
      const r = await fetch(`/api/rahaza/work-orders/${woId}/lkp`, { headers });
      if (r.ok) setLkpList(await r.json());
    } finally { setLkpLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const downloadLkpPdf = async (lkp) => {
    try {
      const r = await fetch(`/api/rahaza/lkp/${lkp.id}/pdf`, { headers });
      if (!r.ok) { toast.error('Gagal mengunduh PDF'); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lkp.lkp_number}_v${lkp.version}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF diunduh');
      // refresh to update download_count
      if (detail?.id) fetchLkpList(detail.id);
    } catch {
      toast.error('Gagal mengunduh PDF');
    }
  };

  // H1: Use blob URL for preview — JWT never appears in browser address bar / history
  const previewLkpPdf = async (lkp) => {
    try {
      const r = await fetch(`/api/rahaza/lkp/${lkp.id}/pdf`, { headers });
      if (!r.ok) throw new Error('fetch failed');
      const blob = await r.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener');
      // Revoke after 60s to free memory
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      if (detail?.id) setTimeout(() => fetchLkpList(detail.id), 1500);
    } catch {
      toast.error('Gagal membuka PDF');
    }
  };

  const regenerateLkp = async (lkp) => {
    if (!window.confirm('Regenerate PDF ini? (Foto/master akan di-refresh)')) return;
    const r = await fetch(`/api/rahaza/lkp/${lkp.id}/regenerate`, { method: 'POST', headers });
    if (r.ok) { toast.success('LKP regenerated'); if (detail?.id) fetchLkpList(detail.id); }
    else toast.error('Gagal regenerate');
  };

  const openLkpAudit = async (lkp) => {
    try {
      const r = await fetch(`/api/rahaza/lkp/${lkp.id}`, { headers });
      if (r.ok) setLkpAuditOpen(await r.json());
    } catch {}
  };

  // ── P9: Material Planning (BOM Dinamis) ──

  // Helper: build material rows from BOM snapshot × WO qty
  const _buildRowsFromBOM = (snap, woQty) => {
    if (!snap) return null;
    const rows = [];
    (snap.yarn_materials || []).forEach(y => {
      rows.push({
        material_id: y.material_id || '',
        material_name: y.name || '',
        qty_prepared: y.qty_kg ? (parseFloat(y.qty_kg) * woQty).toFixed(3) : '',
        unit: 'kg',
      });
    });
    (snap.accessory_materials || []).forEach(a => {
      rows.push({
        material_id: a.material_id || '',
        material_name: a.name || '',
        qty_prepared: a.qty ? (parseFloat(a.qty) * woQty).toFixed(2) : '',
        unit: a.unit || 'pcs',
      });
    });
    return rows.length > 0 ? rows : null;
  };

  // Reset material plan rows from BOM (called by "Isi dari BOM" button)
  const fillFromBOM = () => {
    if (!matPlanWO) return;
    const rows = _buildRowsFromBOM(matPlanWO.bom_snapshot, matPlanWO.qty);
    setMatPlanMaterials(rows || [{ material_id: '', material_name: '', qty_prepared: '', unit: 'kg' }]);
  };

  const openMatPlanInitial = (wo) => {
    setMatPlanWO(wo);
    setMatPlanModal('initial');
    // Priority: existing saved materials → BOM snapshot → blank row
    const existing = wo.material_plan?.initial_materials || [];
    if (existing.length > 0) {
      setMatPlanMaterials(existing.map(m => ({ ...m })));
    } else {
      // Auto-fill from BOM snapshot if available
      const bomRows = _buildRowsFromBOM(wo.bom_snapshot, wo.qty);
      setMatPlanMaterials(bomRows || [{ material_id: '', material_name: '', qty_prepared: '', unit: 'kg' }]);
    }
  };

  const openMatPlanFinal = (wo) => {
    setMatPlanWO(wo);
    setMatPlanModal('final');
    setMatPlanSaveAsBom(false);
    // Pre-fill from initial_materials with qty_remaining empty
    const initial = wo.material_plan?.initial_materials || [];
    if (initial.length > 0) {
      setMatPlanMaterials(initial.map(m => ({
        material_id: m.material_id,
        material_name: m.material_name,
        qty_prepared: m.qty_prepared,
        qty_remaining: '',
        unit: m.unit
      })));
    } else {
      setMatPlanMaterials([{ material_name: '', qty_prepared: '', qty_remaining: '', unit: 'kg' }]);
    }
  };

  const addMatPlanRow = () => {
    setMatPlanMaterials([...matPlanMaterials, { material_id: '', material_name: '', qty_prepared: '', qty_remaining: '', unit: 'kg' }]);
  };

  const updateMatPlanRow = (idx, field, value) => {
    const updated = [...matPlanMaterials];
    updated[idx][field] = value;
    setMatPlanMaterials(updated);
  };

  const removeMatPlanRow = (idx) => {
    setMatPlanMaterials(matPlanMaterials.filter((_, i) => i !== idx));
  };

  const submitMatPlan = async () => {
    if (!matPlanWO || !matPlanModal) return;
    setMatPlanSaving(true);
    try {
      const endpoint = matPlanModal === 'initial' 
        ? `/api/rahaza/work-orders/${matPlanWO.id}/material-plan-initial`
        : `/api/rahaza/work-orders/${matPlanWO.id}/material-plan-final`;
      
      const body = matPlanModal === 'initial'
        ? { materials: matPlanMaterials.filter(m => m.material_name && m.qty_prepared) }
        : { materials: matPlanMaterials.filter(m => m.material_name), save_as_bom: matPlanSaveAsBom };

      const r = await fetch(endpoint, { method: 'PUT', headers, body: JSON.stringify(body) });
      if (r.ok) {
        toast.success(matPlanModal === 'initial' ? 'Material planning awal tersimpan' : 'Material planning akhir tersimpan');
        setMatPlanModal(null);
        setMatPlanWO(null);
        fetchList();
        if (detail?.id === matPlanWO.id) openDetail(matPlanWO);
      } else {
        const data = await r.json();
        toast.error(data.detail || 'Gagal menyimpan material planning');
      }
    } catch (e) {
      toast.error('Error menyimpan material planning');
    } finally {
      setMatPlanSaving(false);
    }
  };

  // ── Add Material Function (Quick Add from Modal) ──
  const openAddMaterialModal = () => {
    setNewMaterial({ name: '', type: 'yarn', unit: 'kg', color: '' });
    setAddMaterialModalOpen(true);
  };

  const submitAddMaterial = async () => {
    if (!newMaterial.name.trim()) {
      toast.error('Nama material wajib diisi');
      return;
    }
    setAddingMaterial(true);
    try {
      const r = await fetch('/api/rahaza/materials/quick-add', {
        method: 'POST',
        headers,
        body: JSON.stringify(newMaterial)
      });
      if (r.ok) {
        const created = await r.json();
        toast.success(`Material "${created.name}" berhasil ditambahkan`);
        // Refresh materials list
        const refreshRes = await fetch('/api/rahaza/materials', { headers });
        if (refreshRes.ok) {
          const mats = await refreshRes.json();
          setAllMaterials(mats);
        }
        setAddMaterialModalOpen(false);
      } else {
        const data = await r.json();
        toast.error(data.detail || 'Gagal menambahkan material');
      }
    } catch (e) {
      toast.error('Error menambahkan material');
    } finally {
      setAddingMaterial(false);
    }
  };

  // Phase 17A: Generate Bundles dari WO
  const [bundleGenModal, setBundleGenModal] = useState(null); // { wo, loading, result, force }
  const openBundleGen = (wo) => setBundleGenModal({ wo, loading: false, result: null, force: false });
  const submitBundleGen = async () => {
    if (!bundleGenModal) return;
    setBundleGenModal((s) => ({ ...s, loading: true }));
    try {
      const url = `/api/rahaza/work-orders/${bundleGenModal.wo.id}/generate-bundles${bundleGenModal.force ? '?force=true' : ''}`;
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({}) });
      const data = await r.json();
      if (!r.ok) {
        setBundleGenModal((s) => ({ ...s, loading: false, error: data.detail || 'Gagal' }));
        return;
      }
      setBundleGenModal((s) => ({ ...s, loading: false, result: data, error: null }));
      fetchList();
    } catch (e) {
      setBundleGenModal((s) => ({ ...s, loading: false, error: e.message }));
    }
  };

  if (loading && list.length === 0) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
    </div>
  );

  return (
    <div className="space-y-5" data-testid="rahaza-work-orders-page">
      <PageHeader
        icon={ClipboardList}
        eyebrow="Portal Produksi"
        title="Work Order (WO)"
        subtitle="Perintah produksi per item. Bisa digenerate otomatis dari Order, atau dibuat manual untuk stok internal."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={openBulkLkp} data-testid="bulk-lkp-btn" className="flex items-center gap-1.5">
              <PrinterCheck className="w-4 h-4" /> Cetak LKP Massal
            </Button>
            <Button onClick={openCreate} data-testid="wo-add-btn"><Plus className="w-4 h-4 mr-1.5" /> WO Manual</Button>
          </div>
        }
      />

      <DataTable
        tableId="work-orders"
        loading={loading}
        rows={list}
        searchFields={['wo_number', 'order_number_snapshot', 'customer_snapshot', 'model_code', 'model_name', 'size_code', 'status']}
        initialFilters={{ status: 'not_completed' }}
        initialSort={{ key: 'target_end_date', dir: 'asc' }}
        filters={[
          { key: 'status', label: 'Status', type: 'select',
            options: [
              { value: 'not_completed', label: '🔄 Belum Selesai (default)' },
              ...statuses.map(s => ({ value: s.value, label: s.label })),
            ] },
          { key: 'priority', label: 'Prioritas', type: 'select',
            options: [
              { value: 'low', label: 'Rendah' },
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'Tinggi' },
              { value: 'urgent', label: 'Urgent' },
            ] },
        ]}
        columns={[
          { key: 'wo_number', label: 'No. WO', sortable: true,
            render: (r, v) => <span className="font-mono text-xs">{v}</span> },
          { key: 'order_customer', label: 'Order / Customer', sortable: true,
            accessor: (r) => r.order_number_snapshot || r.customer_snapshot || '',
            render: (r) => (
              <div>
                {r.order_number_snapshot
                  ? <div className="font-medium text-xs">{r.order_number_snapshot}</div>
                  : <div className="text-xs text-foreground/50 italic">Manual</div>}
                <div className="text-[11px] text-foreground/60">{r.customer_snapshot || (r.is_internal ? 'Produksi Internal' : '—')}</div>
              </div>
            ) },
          { key: 'model_size', label: 'Model · Size', sortable: true,
            accessor: (r) => `${r.model_code}·${r.size_code}`,
            render: (r) => (
              <div>
                <div className="font-medium">{r.model_code}</div>
                <div className="text-[11px] text-foreground/60">{r.model_name} · {r.size_code}</div>
              </div>
            ) },
          { key: 'qty', label: 'Target', align: 'right', sortable: true,
            render: (r) => <span className="font-semibold">{r.qty} pcs</span> },
          { key: 'progress_pct', label: 'Progress', sortable: true,
            render: (r) => <div className="min-w-[100px]"><ProgressBar percent={r.progress_pct || 0} /></div> },
          { key: 'yarn', label: 'Yarn',
            render: (r) => {
              const hasBom = !!(r.bom_snapshot && r.bom_snapshot.bom_id);
              const yarnTotal = r.total_yarn_kg_required || 0;
              return hasBom
                ? <div className="flex items-center gap-1 text-xs"><Scale className="w-3 h-3 text-primary" /><span className="font-mono">{yarnTotal.toFixed(3)} kg</span></div>
                : <div className="flex items-center gap-1 text-xs text-amber-400" title="BOM belum didefinisikan"><AlertTriangle className="w-3 h-3" /> No BOM</div>;
            } },
          { key: 'priority', label: 'Prioritas',
            render: (r) => <PriorityBadge priority={r.priority} /> },
          { key: 'target_end_date', label: 'Due Date', sortable: true,
            render: (r) => {
              if (!r.target_end_date) return <span className="text-foreground/30 text-xs">—</span>;
              const d = new Date(r.target_end_date);
              const today = new Date(); today.setHours(0,0,0,0);
              const diff = Math.ceil((d - today) / 86400000);
              const cls = diff < 0 ? 'text-red-400 font-semibold' : diff <= 3 ? 'text-amber-400 font-medium' : 'text-foreground/70';
              return <span className={`text-xs ${cls}`}>{d.toLocaleDateString('id-ID', {day:'2-digit',month:'short'})} {diff < 0 ? `(+${-diff}hr)` : diff === 0 ? '(hari ini)' : ''}</span>;
            } },
          { key: 'status', label: 'Status',
            render: (r) => <StatusBadge status={r.status} /> },
        ]}
        emptyTitle="Belum ada Work Order"
        emptyDescription="Generate dari Order Produksi (1 klik) atau buat WO manual."
        emptyIcon={ClipboardList}
        emptyAction={
          <>
            <Button
              onClick={() => onNavigate && onNavigate('prod-orders')}
              className="h-9"
              data-testid="wo-empty-cta-orders"
              disabled={!onNavigate}
            >
              <ArrowRight className="w-4 h-4 mr-1.5" /> Buka Order Produksi
            </Button>
            <Button
              variant="outline"
              onClick={openCreate}
              className="h-9"
              data-testid="wo-empty-cta-manual"
            >
              <Plus className="w-4 h-4 mr-1.5" /> WO Manual
            </Button>
          </>
        }
        emptyHelp="Cara tercepat: buka 'Order Produksi' → pilih order → klik ikon Work Order → sistem akan buat WO per item dengan BOM snapshot otomatis."
        exportFilename={`work-orders-${new Date().toISOString().slice(0,10)}.csv`}
        rowActions={(wo) => (
          <div className="inline-flex items-center gap-1">
            <button onClick={() => openDetail(wo)} className="p-1.5 rounded hover:bg-[var(--glass-bg-hover)] text-muted-foreground hover:text-foreground" title="Detail" data-testid={`wo-detail-${wo.wo_number}`}><Eye className="w-3.5 h-3.5" /></button>
            {(wo.status === 'released' || wo.status === 'in_production') && (
              <>
                <button
                  onClick={() => openBundleGen(wo)}
                  className="p-1.5 rounded hover:bg-[hsl(var(--primary)/0.12)] text-muted-foreground hover:text-[hsl(var(--primary))]"
                  title="Generate Bundles"
                  data-testid={`wo-bundles-${wo.wo_number}`}
                >
                  <Box className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => openWorkOrderBundleTickets(wo, token)}
                  className="p-1.5 rounded hover:bg-[hsl(var(--primary)/0.12)] text-muted-foreground hover:text-[hsl(var(--primary))]"
                  title="Print semua bundle ticket WO ini"
                  data-testid={`wo-print-tickets-${wo.wo_number}`}
                >
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {wo.status === 'draft' && (
              <>
                <button onClick={() => openEdit(wo)} className="p-1.5 rounded hover:bg-[var(--glass-bg-hover)] text-muted-foreground hover:text-foreground" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => deleteWO(wo)} className="p-1.5 rounded hover:bg-red-400/10 text-muted-foreground hover:text-red-400" title="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
              </>
            )}
          </div>
        )}
      />

      {/* Create / Edit Modal */}
      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} title={editing ? `Edit WO ${editing.wo_number}` : 'Work Order Manual'} size="md">
          <div className="space-y-4" data-testid="wo-form">
            {formError && <div className="bg-red-400/10 border border-red-300/20 rounded-lg p-3 text-sm text-red-300">{formError}</div>}
            {!editing && (
              <>
                <div>
                  <label className="block text-xs font-medium text-foreground/70 mb-1">Order Terkait (opsional)</label>
                  <select value={form.order_id} onChange={e => setForm({...form, order_id: e.target.value})}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-sm text-foreground"
                    data-testid="wo-field-order">
                    <option value="">— Tidak Terkait / Internal —</option>
                    {orders.filter(o => ['draft','confirmed','in_production'].includes(o.status)).map(o => (
                      <option key={o.id} value={o.id}>{o.order_number} · {o.customer_name || 'Internal'}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground/70 mb-1">Model <span className="text-red-400">*</span></label>
                    <select value={form.model_id} onChange={e => setForm({...form, model_id: e.target.value})}
                      className="w-full h-10 px-3 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-sm text-foreground"
                      data-testid="wo-field-model">
                      <option value="">— Pilih Model —</option>
                      {models.filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground/70 mb-1">Size <span className="text-red-400">*</span></label>
                    <select value={form.size_id} onChange={e => setForm({...form, size_id: e.target.value})}
                      className="w-full h-10 px-3 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-sm text-foreground"
                      data-testid="wo-field-size">
                      <option value="">— Pilih Size —</option>
                      {sizes.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">Qty (pcs) <span className="text-red-400">*</span></label>
                <GlassInput type="number" value={form.qty} onChange={e => setForm({...form, qty: e.target.value})} data-testid="wo-field-qty" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">Prioritas</label>
                <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-sm text-foreground"
                  data-testid="wo-field-priority">
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">Target Mulai</label>
                <GlassInput type="date" value={form.target_start_date} onChange={e => setForm({...form, target_start_date: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">Target Selesai</label>
                <GlassInput type="date" value={form.target_end_date} onChange={e => setForm({...form, target_end_date: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">Catatan</label>
              <GlassInput value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Opsional" />
            </div>

            {/* ── Rate Borongan per Proses ── */}
            {processRatesForm.length > 0 && (
              <div className="border border-[var(--glass-border)] rounded-xl p-3 bg-[var(--card-surface)]/50">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-xs font-semibold text-foreground">Rate Borongan per Proses</h4>
                    <p className="text-[10px] text-muted-foreground">Opsional — jika tidak diisi, sistem gunakan rate dari Profil Gaji karyawan.</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {processRatesForm.map((pr, idx) => (
                    <div key={pr.process_id} className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-foreground/70 w-28 flex-shrink-0">{pr.process_name}</span>
                      <input
                        type="number"
                        min={0}
                        step={50}
                        placeholder="Rate..."
                        value={pr.rate}
                        onChange={e => {
                          const updated = [...processRatesForm];
                          updated[idx] = { ...updated[idx], rate: e.target.value };
                          setProcessRatesForm(updated);
                        }}
                        className="flex-1 h-8 px-2 text-sm border border-[var(--glass-border)] bg-[var(--input-surface)] rounded-md focus:outline-none focus:ring-1 focus:ring-primary/40"
                        data-testid={`rate-field-${pr.process_code}`}
                      />
                      <select
                        value={pr.unit}
                        onChange={e => {
                          const updated = [...processRatesForm];
                          updated[idx] = { ...updated[idx], unit: e.target.value };
                          setProcessRatesForm(updated);
                        }}
                        className="h-8 px-2 text-xs border border-[var(--glass-border)] bg-[var(--input-surface)] rounded-md"
                      >
                        <option value="pcs">/ pcs</option>
                        <option value="lusin">/ lusin</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>Batal</Button>
              <Button onClick={saveWO} disabled={saving} data-testid="wo-save-btn">
                {saving ? 'Menyimpan...' : (editing ? 'Simpan Perubahan' : 'Buat WO')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Detail Modal */}
      {detail && (
        <Modal onClose={() => setDetail(null)} title={`Detail ${detail.wo_number}`} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={detail.status} /></div>
              <div><span className="text-muted-foreground">Prioritas:</span> <PriorityBadge priority={detail.priority} /></div>
              <div><span className="text-muted-foreground">Order:</span> <b>{detail.order_number_snapshot || 'Manual'}</b></div>
              <div><span className="text-muted-foreground">Customer:</span> <b>{detail.customer_snapshot || (detail.is_internal ? 'Produksi Internal' : '—')}</b></div>
              <div><span className="text-muted-foreground">Model:</span> <b>{detail.model_code} · {detail.model_name}</b></div>
              <div><span className="text-muted-foreground">Size:</span> <b>{detail.size_code}</b></div>
              <div><span className="text-muted-foreground">Qty:</span> <b>{detail.qty} pcs</b></div>
              <div><span className="text-muted-foreground">Completed:</span> <b>{detail.completed_qty || 0} pcs ({detail.progress_pct || 0}%)</b></div>
              <div><span className="text-muted-foreground">Target mulai:</span> <b>{detail.target_start_date || '—'}</b></div>
              <div><span className="text-muted-foreground">Target selesai:</span> <b>{detail.target_end_date || '—'}</b></div>
            </div>

            {/* Progress breakdown per process */}
            {detail.progress_breakdown?.length > 0 && (
              <GlassPanel className="p-0 overflow-hidden">
                <div className="px-3 py-2 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs text-muted-foreground font-semibold">Progress Per Proses</div>
                <table className="w-full text-sm">
                  <tbody>
                    {detail.progress_breakdown.map(p => (
                      <tr key={p.process_id} className="border-t border-[var(--glass-border)]">
                        <td className="px-3 py-2 w-32 font-mono text-xs text-muted-foreground">#{p.order_seq} {p.process_code}</td>
                        <td className="px-3 py-2 text-foreground">{p.process_name}</td>
                        <td className="px-3 py-2 text-right font-semibold">{p.total_output} pcs</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GlassPanel>
            )}

            {/* BOM Snapshot */}
            {detail.bom_snapshot ? (
              <GlassPanel className="p-0 overflow-hidden">
                <div className="px-3 py-2 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold text-foreground">BOM Snapshot</span>
                  <span className="ml-auto text-xs text-muted-foreground">{detail.bom_snapshot.total_yarn_kg_per_pcs} kg/pcs → <b className="text-primary">{detail.total_yarn_kg_required} kg total</b></span>
                </div>
                <div className="p-3 space-y-2">
                  {(detail.bom_snapshot.yarn_materials || []).length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Benang</div>
                      <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
                        {detail.bom_snapshot.yarn_materials.map((y, i) => (
                          <><span key={`yn-${i}`} className="text-foreground">{y.code} · {y.name}</span><span key={`yq-${i}`} className="font-mono text-foreground/80">{y.qty_kg} kg</span></>
                        ))}
                      </div>
                    </div>
                  )}
                  {(detail.bom_snapshot.accessory_materials || []).length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Aksesoris</div>
                      <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
                        {detail.bom_snapshot.accessory_materials.map((a, i) => (
                          <><span key={`an-${i}`} className="text-foreground">{a.code} · {a.name}</span><span key={`aq-${i}`} className="font-mono text-foreground/80">{a.qty} {a.unit}</span></>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </GlassPanel>
            ) : (
              <div className="bg-amber-400/10 border border-amber-300/20 rounded-lg p-3 text-sm text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">BOM belum didefinisikan</div>
                  <div className="text-xs text-amber-300/80 mt-0.5">WO ini tidak punya snapshot material. Isi BOM untuk model & size ini di menu “BOM Produk”, kemudian buat ulang WO.</div>
                </div>
              </div>
            )}

            {/* P9: Material Planning Section */}
            {(detail.status === 'in_production' || detail.status === 'completed') && (
              <GlassPanel className="p-0 overflow-hidden" data-testid="material-planning-section">
                <div className="px-3 py-2 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] flex items-center gap-2">
                  <Scale className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Material Planning (BOM Dinamis)</span>
                </div>
                <div className="p-3 space-y-3">
                  {/* Material Plan Initial */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">Material Awal (Estimasi)</span>
                      {!detail.material_plan?.initial_materials?.length && (
                        <Button size="sm" variant="outline" onClick={() => openMatPlanInitial(detail)} data-testid="mat-plan-initial-btn">
                          Input Material Awal
                        </Button>
                      )}
                    </div>
                    {detail.material_plan?.initial_materials?.length > 0 ? (
                      <div className="space-y-1 text-sm">
                        {detail.material_plan.initial_materials.map((m, i) => (
                          <div key={i} className="flex items-center justify-between px-2 py-1 bg-[var(--glass-bg)] rounded">
                            <span>{m.material_name}</span>
                            <span className="font-mono text-primary">{m.qty_prepared} {m.unit}</span>
                          </div>
                        ))}
                        <div className="text-[10px] text-muted-foreground pt-1">
                          Set oleh {detail.material_plan.initial_set_by} pada {new Date(detail.material_plan.initial_set_at).toLocaleString('id-ID')}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-foreground/50 italic">Belum diisi</div>
                    )}
                  </div>

                  {/* Material Plan Final */}
                  <div className="border-t border-[var(--glass-border)] pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">Material Akhir (Aktual)</span>
      {!detail.material_plan?.final_materials?.length && (
                        <Button size="sm" variant="outline" onClick={() => openMatPlanFinal(detail)} data-testid="mat-plan-final-btn">
                          Input Material Akhir
                        </Button>
                      )}
                    </div>
                    {detail.material_plan?.final_materials?.length > 0 ? (
                      <div className="space-y-2 text-sm">
                        {detail.material_plan.final_materials.map((m, i) => (
                          <div key={i} className="px-2 py-2 bg-emerald-400/5 border border-emerald-300/20 rounded">
                            <div className="flex items-center justify-between font-medium">
                              <span>{m.material_name}</span>
                              <span className="text-emerald-300">{m.qty_used} {m.unit} terpakai</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 space-x-3">
                              <span>Disiapkan: {m.qty_prepared} {m.unit}</span>
                              <span>Sisa: {m.qty_remaining} {m.unit}</span>
                              <span>Per pcs: {m.qty_per_pcs} {m.unit}/pcs</span>
                              <span className="text-emerald-300">Eff: {m.efficiency_pct}%</span>
                            </div>
                          </div>
                        ))}
                        <div className="text-[10px] text-muted-foreground pt-1">
                          Set oleh {detail.material_plan.final_set_by} pada {new Date(detail.material_plan.final_set_at).toLocaleString('id-ID')}
                        </div>
                      </div>
                    ) : detail.material_plan?.initial_materials?.length > 0 ? (
                      <div className="text-xs text-amber-300/80 italic">Menunggu WO selesai untuk input aktual</div>
                    ) : (
                      <div className="text-xs text-amber-300/70 italic">Belum ada data material. Klik "Input Material Akhir" untuk catat penggunaan aktual &amp; buat BOM otomatis.</div>
                    )}
                  </div>
                </div>
              </GlassPanel>
            )}

            {/* Status transitions */}
            <div className="border-t border-[var(--glass-border)] pt-3">
              <div className="text-xs text-muted-foreground mb-2">Transisi status:</div>
              <div className="flex flex-wrap gap-2">
                {(statuses.find(s => s.value === detail.status)?.allowed_next || []).map(ns => (
                  <Button key={ns} variant="ghost" onClick={() => transition(detail, ns)} className="gap-1.5 border border-[var(--glass-border)]" data-testid={`wo-transition-${ns}`}>
                    <ArrowRight className="w-3.5 h-3.5" /> {WO_STATUS_COLORS[ns]?.label || ns}
                  </Button>
                ))}
                {(statuses.find(s => s.value === detail.status)?.allowed_next || []).length === 0 && (
                  <div className="text-xs text-muted-foreground">Tidak ada transisi lanjutan.</div>
                )}
              </div>
            </div>

            {/* ── LKP (Lembar Kerja Produksi) Section ── */}
            <GlassPanel className="p-0 overflow-hidden" data-testid="lkp-section">
              <div className="px-3 py-2 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Lembar Kerja Produksi (LKP)</span>
                <span className="ml-auto text-[10px] text-muted-foreground">PDF guide untuk operator (SOP, BOM, QC, packing, foto produk)</span>
              </div>
              <div className="p-3 space-y-2">
                {lkpLoading ? (
                  <div className="text-xs text-muted-foreground">Memuat daftar LKP...</div>
                ) : lkpList.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    Belum ada Lembar Kerja Produksi untuk WO ini.
                    Buat LKP untuk memberi operator panduan lengkap (SOP, instruksi kerja, QC, packing).
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {lkpList.map(lkp => (
                      <div key={lkp.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs"
                        data-testid={`lkp-row-${lkp.lkp_number}`}>
                        <span className="font-mono text-primary font-semibold">{lkp.lkp_number}</span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-300/20 text-[10px]">
                          v{lkp.version}
                        </span>
                        {lkp.status === 'revoked' && (
                          <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-300/20 text-[10px]">
                            REVOKED
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          oleh {lkp.created_by_name} · {new Date(lkp.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                        <span className="text-muted-foreground">· {lkp.download_count || 0}× cetak</span>
                        <div className="ml-auto flex items-center gap-1">
                          <button onClick={() => previewLkpPdf(lkp)}
                            className="p-1.5 rounded hover:bg-[var(--glass-bg-hover)] text-muted-foreground hover:text-foreground"
                            title="Preview PDF"
                            data-testid={`lkp-preview-${lkp.lkp_number}`}>
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => downloadLkpPdf(lkp)}
                            className="p-1.5 rounded hover:bg-[var(--glass-bg-hover)] text-muted-foreground hover:text-foreground"
                            title="Download PDF"
                            data-testid={`lkp-download-${lkp.lkp_number}`}>
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => regenerateLkp(lkp)}
                            className="p-1.5 rounded hover:bg-[var(--glass-bg-hover)] text-muted-foreground hover:text-foreground"
                            title="Regenerate (refresh foto/master)"
                            data-testid={`lkp-regenerate-${lkp.lkp_number}`}>
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => openLkpAudit(lkp)}
                            className="p-1.5 rounded hover:bg-[var(--glass-bg-hover)] text-muted-foreground hover:text-foreground"
                            title="Audit Log"
                            data-testid={`lkp-audit-${lkp.lkp_number}`}>
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Button onClick={() => setLkpDialog(detail)} className="gap-1.5" variant="outline"
                  data-testid="lkp-create-btn">
                  <Plus className="w-3.5 h-3.5" /> Buat Lembar Kerja Baru
                </Button>
              </div>
            </GlassPanel>
          </div>
        </Modal>
      )}

      {/* LKP Create Dialog */}
      {lkpDialog && (
        <LKPDialog
          wo={lkpDialog}
          token={token}
          onClose={() => setLkpDialog(null)}
          onCreated={() => { if (detail?.id) fetchLkpList(detail.id); }}
        />
      )}

      {/* LKP Audit Log Modal */}
      {lkpAuditOpen && (
        <Modal onClose={() => setLkpAuditOpen(null)} title={`Audit Log · ${lkpAuditOpen.lkp_number}`} size="md">
          <div className="space-y-2" data-testid="lkp-audit-modal">
            <div className="text-xs text-muted-foreground mb-2">
              <b>Versi {lkpAuditOpen.version}</b> · Status {lkpAuditOpen.status} · Total download: {lkpAuditOpen.download_count || 0}×
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-[var(--glass-border)]">
              {(lkpAuditOpen.audit_log || []).map((a, i) => (
                <div key={i} className="px-3 py-2 border-b border-[var(--glass-border)] last:border-b-0 flex items-start gap-3 text-xs">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                    a.action === 'created' ? 'bg-emerald-500/15 text-emerald-300' :
                    a.action === 'downloaded' ? 'bg-blue-500/15 text-blue-300' :
                    a.action === 'regenerated' ? 'bg-amber-500/15 text-amber-300' :
                    'bg-red-500/15 text-red-300'
                  }`}>{a.action}</span>
                  <span className="flex-1">
                    <b>{a.user_name}</b> · v{a.version}
                    <br/>
                    <span className="text-muted-foreground">{new Date(a.timestamp).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' })}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* Phase 17A/17B: Generate Bundles Modal */}
      {bundleGenModal && (
        <Modal
          onClose={() => setBundleGenModal(null)}
          title={`Generate Bundles · ${bundleGenModal.wo.wo_number}`}
          size="md"
          data-testid="wo-bundlegen-modal"
        >
          <div className="space-y-4">
            <div className="text-sm text-foreground/80">
              WO <b className="text-foreground">{bundleGenModal.wo.wo_number}</b> — {bundleGenModal.wo.model_code} / {bundleGenModal.wo.size_code} · <b className="text-foreground">{bundleGenModal.wo.qty} pcs</b>
            </div>
            <div className="rounded-lg border border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.04)] p-3 text-xs text-foreground/80">
              <div className="font-semibold text-foreground mb-1">Apa yang terjadi saat generate bundles?</div>
              Sistem membagi <b>{bundleGenModal.wo.qty} pcs</b> menjadi bundle (default ukuran <b>30 pcs</b>, bisa diatur di master Model).
              Tiap bundle mendapat nomor unik (mis. <span className="font-mono">BDL-YYYYMMDD-0001</span>) dan QR ticket yang bisa dicetak untuk traceability per proses.
            </div>

            {bundleGenModal.error && (
              <div className="rounded-lg border border-red-300/25 bg-red-400/10 p-3 text-xs text-red-300">
                {bundleGenModal.error}
              </div>
            )}

            {!bundleGenModal.result && (
              <label className="flex items-start gap-2 text-xs text-foreground/80">
                <input
                  type="checkbox"
                  checked={!!bundleGenModal.force}
                  onChange={(e) => setBundleGenModal((s) => ({ ...s, force: e.target.checked }))}
                  data-testid="wo-bundlegen-force"
                />
                <span>
                  <b>Regenerate</b> (admin only) — hapus bundle yang masih status <span className="font-mono">created</span> lalu buat ulang.
                  Bundle yang sudah ada event produksi tidak akan disentuh.
                </span>
              </label>
            )}

            {bundleGenModal.result ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-emerald-300/25 bg-emerald-400/10 p-3 text-xs text-emerald-300 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    Berhasil membuat <b>{bundleGenModal.result.generated}</b> bundle (ukuran {bundleGenModal.result.bundle_size} pcs) untuk total {bundleGenModal.result.total_qty} pcs.
                  </div>
                </div>
                <div className="max-h-48 overflow-auto border border-[var(--glass-border)] rounded-lg divide-y divide-[var(--glass-border)]">
                  {(bundleGenModal.result.bundles || []).map((b) => (
                    <div key={b.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span className="font-mono text-foreground">{b.bundle_number}</span>
                      <span className="text-muted-foreground">{b.qty} pcs</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => openWorkOrderBundleTickets(bundleGenModal.wo, token)}
                    className="h-9"
                    data-testid="wo-bundlegen-print"
                  >
                    <Printer className="w-4 h-4 mr-1.5" /> Cetak Bundle Tickets
                  </Button>
                  <Button onClick={() => setBundleGenModal(null)} className="h-9">
                    Selesai
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => setBundleGenModal(null)} disabled={bundleGenModal.loading}>Batal</Button>
                <Button
                  onClick={submitBundleGen}
                  disabled={bundleGenModal.loading}
                  data-testid="wo-bundlegen-submit"
                >
                  {bundleGenModal.loading ? 'Memproses...' : (bundleGenModal.force ? 'Regenerate Bundles' : 'Generate Bundles')}
                </Button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Bulk LKP Print Modal */}
      {bulkLkpOpen && (
        <Modal onClose={() => setBulkLkpOpen(false)} title="Cetak LKP Massal">
          <div className="space-y-4 min-w-[520px] max-w-2xl" data-testid="bulk-lkp-modal">
            {bulkLkpLoading ? (
              <div className="text-center py-8 text-foreground/50">Memuat data WO aktif...</div>
            ) : !bulkLkpData ? (
              <div className="text-center py-8 text-foreground/50">Gagal memuat data</div>
            ) : (
              <>
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Total WO Aktif', val: bulkLkpData.total, color: 'text-foreground' },
                    { label: 'Sudah Ada LKP', val: bulkLkpData.total_with_lkp, color: 'text-emerald-400' },
                    { label: 'Belum Ada LKP', val: bulkLkpData.total_without_lkp, color: 'text-amber-400' },
                  ].map(c => (
                    <div key={c.label} className="p-3 rounded-xl border border-[var(--glass-border)] bg-[var(--card-surface)] text-center">
                      <p className={`text-2xl font-bold ${c.color}`}>{c.val}</p>
                      <p className="text-xs text-foreground/50 mt-0.5">{c.label}</p>
                    </div>
                  ))}
                </div>

                {/* WO Table */}
                <div className="max-h-80 overflow-y-auto rounded-xl border border-[var(--glass-border)]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[var(--card-surface)]">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-foreground/50">WO</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-foreground/50">Model</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-foreground/50">Line</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-foreground/50">Qty</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-foreground/50">LKP</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-foreground/50">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkLkpData.work_orders.map((wo, i) => (
                        <tr key={wo.wo_id} className={`border-t border-[var(--glass-border)] ${i % 2 === 0 ? '' : 'bg-foreground/[0.02]'}`} data-testid={`bulk-lkp-row-${wo.wo_id}`}>
                          <td className="px-3 py-2 font-mono text-xs">{wo.wo_number}</td>
                          <td className="px-3 py-2 text-xs">{wo.model_code}</td>
                          <td className="px-3 py-2 text-xs">{wo.line_code}</td>
                          <td className="px-3 py-2 text-xs text-right">{wo.qty}</td>
                          <td className="px-3 py-2 text-center">
                            {wo.has_lkp
                              ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300">v{wo.latest_version}</span>
                              : <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300">Belum</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {wo.has_lkp && wo.latest_lkp_id ? (
                              <a
                                href={`/api/rahaza/lkp/${wo.latest_lkp_id}/pdf?auth=${token}`}
                                target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.25)] border border-[hsl(var(--primary)/0.2)] transition-colors"
                                data-testid={`print-lkp-${wo.wo_id}`}
                              >
                                <Printer className="w-3 h-3" /> Cetak
                              </a>
                            ) : (
                              <button
                                onClick={() => { setBulkLkpOpen(false); setLkpDialog(bulkLkpData.work_orders.find(w => w.wo_id === wo.wo_id)); }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-foreground/5 text-foreground/50 hover:bg-foreground/10 border border-[var(--glass-border)] transition-colors"
                                data-testid={`create-lkp-${wo.wo_id}`}
                              >
                                <Plus className="w-3 h-3" /> Buat LKP
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Bulk Print All with LKP */}
                {bulkLkpData.total_with_lkp > 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                    <PrinterCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <p className="text-xs text-foreground/70 flex-1">
                      {bulkLkpData.total_with_lkp} WO sudah punya LKP — klik setiap tombol "Cetak" di atas, atau buka PDF masing-masing secara terpisah.
                    </p>
                  </div>
                )}
                {bulkLkpData.total_without_lkp > 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <p className="text-xs text-foreground/70">
                      {bulkLkpData.total_without_lkp} WO belum punya LKP. Klik "Buat LKP" pada baris yang belum ada.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </Modal>
      )}

      {/* P9: Material Planning Initial Modal */}
      {matPlanModal === 'initial' && matPlanWO && (
        <Modal isOpen={true} onClose={() => setMatPlanModal(null)} title={`Material Awal - ${matPlanWO.wo_number}`} maxWidth="max-w-3xl">
          <div className="space-y-4">
            {/* BOM auto-fill info banner */}
            {matPlanWO.bom_snapshot?.bom_id ? (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-emerald-400/25 bg-emerald-400/8">
                <div className="flex items-center gap-2 text-sm text-emerald-300/90">
                  <span className="text-base">✅</span>
                  <span>
                    Diisi otomatis dari <strong>BOM Snapshot</strong> ({matPlanWO.bom_snapshot.yarn_materials?.length || 0} benang, {matPlanWO.bom_snapshot.accessory_materials?.length || 0} aksesoris).
                    Qty = BOM per pcs × <strong>{matPlanWO.qty} pcs</strong>.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={fillFromBOM}
                  className="shrink-0 text-xs px-2 py-1 rounded border border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10 transition-colors"
                  data-testid="mat-fill-from-bom"
                >
                  Reset dari BOM
                </button>
              </div>
            ) : (
              <div className="text-sm text-foreground/70">
                Input estimasi material yang disiapkan untuk WO ini (opsional).
                Dapat diisi sekarang atau nanti saat produksi dimulai.
              </div>
            )}

            <div className="space-y-3">
              {matPlanMaterials.map((mat, idx) => (
                <div key={idx} className="space-y-2 p-3 bg-[var(--glass-bg)] rounded-lg border border-[var(--glass-border)]">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-foreground/60 block mb-1">Material</label>
                      <select
                        value={mat.material_id || ''}
                        onChange={(e) => {
                          const selectedMat = allMaterials.find(m => m.id === e.target.value);
                          if (selectedMat) {
                            updateMatPlanRow(idx, 'material_id', selectedMat.id);
                            updateMatPlanRow(idx, 'material_name', selectedMat.name);
                            updateMatPlanRow(idx, 'unit', selectedMat.unit);
                          }
                        }}
                        className="w-full px-3 py-2 bg-background/50 border border-[var(--glass-border)] rounded text-sm"
                        data-testid={`mat-initial-select-${idx}`}
                      >
                        <option value="">-- Pilih Material --</option>
                        {allMaterials.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.code}) - {m.unit}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-32">
                      <label className="text-xs text-foreground/60 block mb-1">Qty</label>
                      <input
                        type="number"
                        placeholder="0"
                        value={mat.qty_prepared}
                        onChange={(e) => updateMatPlanRow(idx, 'qty_prepared', e.target.value)}
                        className="w-full px-3 py-2 bg-background/50 border border-[var(--glass-border)] rounded text-sm"
                        data-testid={`mat-initial-qty-${idx}`}
                      />
                    </div>
                    <div className="w-24">
                      <label className="text-xs text-foreground/60 block mb-1">Unit</label>
                      <input
                        type="text"
                        value={mat.unit}
                        readOnly
                        className="w-full px-2 py-2 bg-background/30 border border-[var(--glass-border)] rounded text-sm text-foreground/50"
                      />
                    </div>
                    {matPlanMaterials.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeMatPlanRow(idx)} className="text-red-400 hover:text-red-300 mt-5">
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  {mat.material_name && (
                    <div className="text-xs text-primary/70">→ {mat.material_name}</div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={addMatPlanRow} className="flex-1" data-testid="mat-add-row">
                <Plus className="w-4 h-4 mr-1.5" /> Tambah Material
              </Button>
              <Button variant="outline" onClick={openAddMaterialModal} className="flex-1" data-testid="mat-add-new-material">
                <Plus className="w-4 h-4 mr-1.5" /> Tambah Material Baru
              </Button>
            </div>

            <div className="flex gap-2 pt-4 border-t border-[var(--glass-border)]">
              <Button variant="outline" onClick={() => setMatPlanModal(null)} disabled={matPlanSaving}>
                Skip (Isi Nanti)
              </Button>
              <Button onClick={submitMatPlan} disabled={matPlanSaving} data-testid="mat-initial-submit" className="flex-1">
                {matPlanSaving ? 'Menyimpan...' : 'Simpan Rencana Material'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* P9: Material Planning Final Modal */}
      {matPlanModal === 'final' && matPlanWO && (
        <Modal isOpen={true} onClose={() => setMatPlanModal(null)} title={`Material Akhir - ${matPlanWO.wo_number}`} maxWidth="max-w-4xl">
          <div className="space-y-4">
            <div className="text-sm text-foreground/70">
              Input sisa material yang tidak terpakai. Sistem akan hitung: <strong>Terpakai = Disiapkan - Sisa</strong>
            </div>

            <div className="space-y-3">
              {matPlanMaterials.map((mat, idx) => {
                const qtyUsed = mat.qty_prepared && mat.qty_remaining 
                  ? Math.max(0, parseFloat(mat.qty_prepared) - parseFloat(mat.qty_remaining))
                  : null;
                const qtyPerPcs = qtyUsed && matPlanWO.qty ? (qtyUsed / matPlanWO.qty).toFixed(4) : null;
                const effPct = mat.qty_prepared && qtyUsed 
                  ? ((qtyUsed / parseFloat(mat.qty_prepared)) * 100).toFixed(1)
                  : null;
                
                return (
                  <div key={idx} className="p-3 bg-[var(--glass-bg)] rounded-lg border border-[var(--glass-border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 font-medium text-sm">{mat.material_name || `Material ${idx + 1}`}</div>
                      <span className="text-xs text-foreground/50">{mat.unit}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <label className="text-[11px] text-foreground/60 block mb-1">Disiapkan</label>
                        <input
                          type="number"
                          value={mat.qty_prepared}
                          onChange={(e) => updateMatPlanRow(idx, 'qty_prepared', e.target.value)}
                          className="w-full px-3 py-2 bg-background/50 border border-[var(--glass-border)] rounded text-sm"
                          data-testid={`mat-final-prepared-${idx}`}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-foreground/60 block mb-1">Sisa (Tidak Terpakai)</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={mat.qty_remaining}
                          onChange={(e) => updateMatPlanRow(idx, 'qty_remaining', e.target.value)}
                          className="w-full px-3 py-2 bg-background/50 border border-[var(--glass-border)] rounded text-sm"
                          data-testid={`mat-final-remaining-${idx}`}
                        />
                      </div>
                    </div>
                    {qtyUsed !== null && (
                      <div className="mt-2 p-2 bg-primary/5 rounded text-xs space-y-0.5">
                        <div>→ <strong>Terpakai:</strong> {qtyUsed.toFixed(2)} {mat.unit}</div>
                        {qtyPerPcs && <div>→ <strong>Per pcs:</strong> {qtyPerPcs} {mat.unit}/pcs</div>}
                        {effPct && <div>→ <strong>Efisiensi:</strong> {effPct}%</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {matPlanWO.model_id && matPlanWO.size_id && (
              <div className="flex items-center gap-2 p-3 bg-emerald-400/5 border border-emerald-300/25 rounded-lg">
                <input
                  type="checkbox"
                  id="save-as-bom"
                  checked={matPlanSaveAsBom}
                  onChange={(e) => setMatPlanSaveAsBom(e.target.checked)}
                  className="w-4 h-4"
                  data-testid="mat-save-as-bom"
                />
                <label htmlFor="save-as-bom" className="text-sm text-foreground/80 cursor-pointer">
                  <strong>Simpan sebagai BOM baru</strong> untuk model <strong>{matPlanWO.model_name} {matPlanWO.size_name}</strong>
                </label>
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t border-[var(--glass-border)]">
              <Button variant="outline" onClick={() => setMatPlanModal(null)} disabled={matPlanSaving}>
                Batal
              </Button>
              <Button onClick={submitMatPlan} disabled={matPlanSaving} data-testid="mat-final-submit" className="flex-1">
                {matPlanSaving ? 'Menyimpan...' : 'Simpan Material Akhir'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Material Modal */}
      {addMaterialModalOpen && (
        <Modal isOpen={true} onClose={() => setAddMaterialModalOpen(false)} title="Tambah Material Baru" maxWidth="max-w-md">
          <div className="space-y-4">
            <div className="text-sm text-foreground/70">
              Material baru akan ditambahkan ke master data dan langsung tersedia untuk dipilih.
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1.5">
                Nama Material <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder="contoh: Benang Wol Hitam"
                value={newMaterial.name}
                onChange={(e) => setNewMaterial({...newMaterial, name: e.target.value})}
                className="w-full px-3 py-2 bg-background/50 border border-[var(--glass-border)] rounded"
                autoFocus
                data-testid="new-material-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1.5">Tipe</label>
                <select
                  value={newMaterial.type}
                  onChange={(e) => setNewMaterial({...newMaterial, type: e.target.value})}
                  className="w-full px-3 py-2 bg-background/50 border border-[var(--glass-border)] rounded"
                  data-testid="new-material-type"
                >
                  <option value="yarn">Benang (Yarn)</option>
                  <option value="fabric">Kain (Fabric)</option>
                  <option value="accessory">Aksesoris</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1.5">Unit</label>
                <select
                  value={newMaterial.unit}
                  onChange={(e) => setNewMaterial({...newMaterial, unit: e.target.value})}
                  className="w-full px-3 py-2 bg-background/50 border border-[var(--glass-border)] rounded"
                  data-testid="new-material-unit"
                >
                  <option value="kg">kg</option>
                  <option value="m">meter</option>
                  <option value="pcs">pcs</option>
                  <option value="roll">roll</option>
                  <option value="cone">cone</option>
                  <option value="yard">yard</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1.5">Warna (opsional)</label>
              <input
                type="text"
                placeholder="contoh: Hitam, Merah"
                value={newMaterial.color}
                onChange={(e) => setNewMaterial({...newMaterial, color: e.target.value})}
                className="w-full px-3 py-2 bg-background/50 border border-[var(--glass-border)] rounded"
                data-testid="new-material-color"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddMaterialModalOpen(false)} disabled={addingMaterial}>
                Batal
              </Button>
              <Button onClick={submitAddMaterial} disabled={addingMaterial} className="flex-1" data-testid="submit-new-material">
                {addingMaterial ? 'Menambahkan...' : 'Tambah Material'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
