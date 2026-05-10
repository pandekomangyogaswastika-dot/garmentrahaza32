import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Edit2, Trash2, Eye, ArrowRight, X, Factory, CheckCircle2, XCircle, Clock, ClipboardList, History, Package, ChevronRight, Info, Loader2, Copy } from 'lucide-react';
import { GlassCard, GlassPanel, GlassInput } from '@/components/ui/glass';
import { Button } from '@/components/ui/button';
import Modal from './Modal';
import { AuditHistoryDrawer } from './AuditHistoryDrawer';
import { DataTable } from './DataTableV2';
import { PageHeader } from './moduleAtoms';
import { toast } from 'sonner';

const STATUS_COLORS = {
  draft:         { bg: 'bg-slate-400/15',  border: 'border-slate-300/25',  text: 'text-slate-300',   label: 'Draft' },
  confirmed:     { bg: 'bg-blue-400/15',   border: 'border-blue-300/25',   text: 'text-blue-300',    label: 'Confirmed' },
  in_production: { bg: 'bg-primary/15',    border: 'border-primary/25',    text: 'text-primary',     label: 'In Production' },
  completed:     { bg: 'bg-emerald-400/15',border: 'border-emerald-300/25',text: 'text-emerald-300', label: 'Completed' },
  closed:        { bg: 'bg-foreground/10', border: 'border-foreground/20', text: 'text-foreground/70', label: 'Closed' },
  cancelled:     { bg: 'bg-red-400/15',    border: 'border-red-300/25',    text: 'text-red-300',     label: 'Cancelled' },
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.border} border ${s.text}`}>
      {s.label}
    </span>
  );
}

// ── Inline Customer Creation Form ─────────────────────────────────────────────
const InlineCustomerCreateForm = ({ token, onCreated, onCancel }) => {
  const [form, setForm] = useState({
    code: '', name: '', company_type: 'company', npwp: '', phone: '', email: '', address: '',
    payment_terms: 'net_30', payment_terms_custom: '', credit_limit: 0, notes: ''
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('Kode dan Nama wajib diisi');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/rahaza/customers', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const newCustomer = await res.json();
      toast.success(`Customer "${newCustomer.name}" berhasil dibuat`);
      onCreated(newCustomer);
    } catch (e) {
      toast.error('Gagal membuat customer: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Plus className="w-3 h-3" /> Tambah Customer Baru
        </span>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">Kode *</label>
          <GlassInput
            placeholder="CUST-001"
            value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">Nama *</label>
          <GlassInput
            placeholder="Nama customer"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">Tipe</label>
          <select
            className="w-full h-8 px-2 rounded-lg border border-border bg-[var(--input-surface)] text-sm"
            value={form.company_type}
            onChange={e => setForm(f => ({ ...f, company_type: e.target.value }))}
          >
            <option value="company">Perusahaan</option>
            <option value="personal">Perorangan</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">NPWP</label>
          <GlassInput
            placeholder="Opsional"
            value={form.npwp}
            onChange={e => setForm(f => ({ ...f, npwp: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">Telepon</label>
          <GlassInput
            placeholder="Opsional"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">Email</label>
          <GlassInput
            placeholder="Opsional"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-[10px] text-muted-foreground mb-0.5">Alamat</label>
        <GlassInput
          placeholder="Opsional"
          value={form.address}
          onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
          className="h-8 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">Term Bayar</label>
          <select
            className="w-full h-8 px-2 rounded-lg border border-border bg-[var(--input-surface)] text-sm"
            value={form.payment_terms}
            onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}
          >
            <option value="cash">Cash / Tunai</option>
            <option value="net_7">Net 7 hari</option>
            <option value="net_14">Net 14 hari</option>
            <option value="net_30">Net 30 hari</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">Limit Kredit (Rp)</label>
          <GlassInput
            type="number"
            placeholder="0"
            value={form.credit_limit}
            onChange={e => setForm(f => ({ ...f, credit_limit: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 text-xs">Batal</Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs">
          {saving ? 'Menyimpan...' : 'Simpan Customer'}
        </Button>
      </div>
    </div>
  );
};

export default function RahazaOrdersModule({ token, onNavigate }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
  const [auditOrder, setAuditOrder] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [models, setModels] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);

  const [form, setForm] = useState({
    order_date: new Date().toISOString().slice(0,10),
    due_date: '',
    customer_id: '',
    is_internal: false,
    notes: '',
    items: [],
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rahaza/orders`, { headers });
      if (res.ok) setOrders(await res.json());
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => {
    const h = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch('/api/rahaza/customers', { headers: h }).then(r => r.ok ? r.json() : []),
      fetch('/api/rahaza/models', { headers: h }).then(r => r.ok ? r.json() : []),
      fetch('/api/rahaza/sizes', { headers: h }).then(r => r.ok ? r.json() : []),
      fetch('/api/rahaza/orders-statuses', { headers: h }).then(r => r.ok ? r.json() : []),
    ]).then(([c, m, s, st]) => { setCustomers(c); setModels(m); setSizes(s); setStatuses(st); });
  }, [token]);

  const openCreate = () => {
    setEditing(null);
    setShowCreateCustomer(false);
    setForm({
      order_date: new Date().toISOString().slice(0,10),
      due_date: '', customer_id: '', is_internal: false, notes: '',
      items: [{ model_id: '', size_id: '', qty: 1 }],
    });
    setFormError('');
    setModalOpen(true);
  };
  const openEdit = async (order) => {
    const res = await fetch(`/api/rahaza/orders/${order.id}`, { headers });
    if (!res.ok) return;
    const full = await res.json();
    setEditing(full);
    setShowCreateCustomer(false);
    setForm({
      order_date: full.order_date || '',
      due_date: full.due_date || '',
      customer_id: full.customer_id || '',
      is_internal: !!full.is_internal,
      notes: full.notes || '',
      items: (full.items || []).map(i => ({ id: i.id, model_id: i.model_id, size_id: i.size_id, qty: i.qty, notes: i.notes || '' })),
    });
    setFormError('');
    setModalOpen(true);
  };
  const openDetail = async (order) => {
    const res = await fetch(`/api/rahaza/orders/${order.id}`, { headers });
    if (res.ok) setDetailOrder(await res.json());
  };

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { model_id: '', size_id: '', qty: 1 }] }));
  const updateItem = (idx, key, val) => setForm(f => ({
    ...f, items: f.items.map((it, i) => i === idx ? { ...it, [key]: val } : it),
  }));
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const handleSave = async () => {
    setSaving(true); setFormError('');
    try {
      const payload = { ...form };
      payload.items = payload.items.filter(i => i.model_id && i.size_id && Number(i.qty) > 0).map(i => ({ ...i, qty: Number(i.qty) }));
      if (payload.items.length === 0) {
        throw new Error('Tambahkan minimal 1 item pesanan.');
      }
      if (!payload.is_internal && !payload.customer_id) {
        throw new Error('Pilih pelanggan atau centang "Produksi Internal".');
      }
      const url = editing ? `/api/rahaza/orders/${editing.id}` : '/api/rahaza/orders';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
      if (!res.ok) {
        const STATUS_MSG = { 400:'Data tidak valid.', 403:'Tidak ada akses.', 404:'Tidak ditemukan.', 409:'Konflik data.' };
        throw new Error(STATUS_MSG[res.status] || `Gagal menyimpan (HTTP ${res.status})`);
      }
      setModalOpen(false);
      fetchOrders();
    } catch (err) { setFormError(err.message); }
    finally { setSaving(false); }
  };

  const transition = async (order, newStatus) => {
    if (!window.confirm(`Ubah status ke ${newStatus}?`)) return;
    const res = await fetch(`/api/rahaza/orders/${order.id}/status`, {
      method: 'POST', headers, body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) { fetchOrders(); if (detailOrder?.id === order.id) openDetail(order); }
    else { alert('Gagal transisi status'); }
  };

  const handleDelete = async (order) => {
    if (!window.confirm(`Hapus order ${order.order_number}?`)) return;
    await fetch(`/api/rahaza/orders/${order.id}`, { method: 'DELETE', headers });
    fetchOrders();
  };

  const [generating, setGenerating] = useState(null); // order.id while generating

  // ── Rate Setup Modal state ────────────────────────────────────────────────
  const [rateModal, setRateModal]         = useState(null);  // { order } | null
  const [rateProcs, setRateProcs]         = useState([]);    // active processes
  const [rateMatrix, setRateMatrix]       = useState({});    // { item_id: { proc_id: {rate, unit} } }
  const [rateModalLoading, setRateModalLoading] = useState(false);

  const openRateModal = useCallback(async (order) => {
    setRateModalLoading(true);
    setRateModal({ order });
    const h = { Authorization: `Bearer ${token}` };
    try {
      // Load processes and payroll profile defaults in parallel
      const [procsRes, profilesRes] = await Promise.all([
        fetch('/api/rahaza/processes', { headers: h }),
        fetch('/api/rahaza/payroll-profiles?limit=200', { headers: h }),
      ]);
      const procs    = procsRes.ok    ? (await procsRes.json()).filter(p => p.active && !p.is_rework) : [];
      const profiles = profilesRes.ok ? await profilesRes.json() : [];

      // Build default rate map from profiles: process_code → {rate, unit}
      const profileDefaults = {};
      for (const prof of (profiles.items || profiles || [])) {
        for (const r of (prof.pcs_process_rates || [])) {
          if (!profileDefaults[r.process_id] && r.rate > 0) {
            profileDefaults[r.process_id] = { rate: r.rate, unit: r.unit || 'pcs', scheme: r.scheme || 'pcs' };
          }
        }
      }

      setRateProcs(procs);

      // Build initial matrix: item_id → proc_id → {rate, unit}
      const items = order.items || [];
      const matrix = {};
      for (const it of items) {
        matrix[it.id] = {};
        for (const p of procs) {
          const def = profileDefaults[p.id] || { rate: 0, unit: p.code === 'RAJUT' ? 'jam' : 'pcs' };
          matrix[it.id][p.id] = { rate: def.rate || 0, unit: def.unit, process_code: p.code, process_name: p.name };
        }
      }
      setRateMatrix(matrix);
    } catch { /* use empty defaults */ }
    setRateModalLoading(false);
  }, [token]);

  const generateWO = async (order) => {
    // Open rate setup modal instead of window.confirm
    const full = await (await fetch(`/api/rahaza/orders/${order.id}`, { headers })).json();
    openRateModal(full || order);
  };

  const confirmGenerateWO = async () => {
    const order = rateModal?.order;
    if (!order) return;
    setGenerating(order.id);
    try {
      // Build item_rates from matrix
      const item_rates = (order.items || []).map(it => ({
        item_id: it.id,
        process_rates: rateProcs
          .map(p => {
            const cell = (rateMatrix[it.id] || {})[p.id] || {};
            return {
              process_id:   p.id,
              process_code: p.code,
              rate:         parseFloat(cell.rate) || 0,
              unit:         cell.unit || 'pcs',
            };
          })
          .filter(r => r.rate > 0),
      }));
      const res = await fetch(`/api/rahaza/orders/${order.id}/generate-work-orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ item_rates }),
      });
      if (!res.ok) {
        const STATUS_MSG = { 400: 'Order tidak bisa di-generate.', 403: 'Tidak ada akses.', 404: 'Order tidak ditemukan.' };
        throw new Error(STATUS_MSG[res.status] || `Gagal generate WO (HTTP ${res.status})`);
      }
      const data = await res.json();
      setRateModal(null);
      if (data.total_created === 0 && data.skipped?.length > 0) {
        alert(`ℹ️ Semua item sudah memiliki WO aktif (${data.skipped.length} item dilewati).\n\nWO sudah tersedia di modul Work Order. Gunakan filter untuk melihat WO dari order ini.`);
      } else {
        alert(`✅ Generate WO selesai.\nDibuat: ${data.total_created} WO${data.skipped?.length > 0 ? `\nDilewati: ${data.skipped.length} item (sudah punya WO aktif)` : ''}`);
      }
      fetchOrders();
      if (detailOrder?.id === order.id) openDetail(order);
    } catch (err) {
      alert(err.message);
    } finally {
      setGenerating(null);
    }
  };

  // Copy first item's rates to all items
  const copyFirstRowToAll = () => {
    const items = rateModal?.order?.items || [];
    if (items.length < 2) return;
    const firstRow = rateMatrix[items[0].id] || {};
    setRateMatrix(prev => {
      const next = { ...prev };
      for (const it of items.slice(1)) {
        next[it.id] = { ...firstRow };
      }
      return next;
    });
  };

  const updateRateCell = (itemId, procId, field, value) => {
    setRateMatrix(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {}),
        [procId]: { ...(prev[itemId]?.[procId] || {}), [field]: value },
      },
    }));
  };

  if (loading && orders.length === 0) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
    </div>
  );

  return (
    <div className="space-y-5" data-testid="rahaza-orders-page">
      <PageHeader
        icon={Package}
        eyebrow="Portal Produksi"
        title="Order Produksi"
        subtitle="Order dari pelanggan atau produksi untuk stok. Setiap order berisi satu atau lebih item (Model + Size + Qty)."
        actions={<Button onClick={openCreate} data-testid="orders-add-btn"><Plus className="w-4 h-4 mr-1.5" /> Order Baru</Button>}
      />

      <DataTable
        tableId="orders"
        loading={loading}
        rows={orders}
        searchFields={['order_number', 'customer_name', 'status', 'notes']}
        filters={[
          { key: 'status', label: 'Status', type: 'select',
            options: statuses.map(s => ({ value: s.value, label: s.label })) },
          { key: 'order_date', label: 'Tanggal', type: 'date-range' },
        ]}
        columns={[
          { key: 'order_number', label: 'No. Order', sortable: true,
            render: (r, v) => <span className="font-mono text-xs">{v}</span> },
          { key: 'order_date', label: 'Tanggal', sortable: true,
            render: (r, v) => <span className="text-foreground/70">{v || '—'}</span> },
          { key: 'customer_name', label: 'Pelanggan', sortable: true,
            accessor: (r) => r.customer_name || (r.is_internal ? 'Produksi Internal' : '-') },
          { key: 'item_count', label: 'Items', align: 'right', sortable: true,
            accessor: (r) => r.item_count || 0 },
          { key: 'total_qty', label: 'Total Qty', align: 'right', sortable: true,
            render: (r) => <span className="font-semibold">{r.total_qty || 0} pcs</span> },
          { key: 'due_date', label: 'Due', sortable: true,
            render: (r, v) => <span className="text-foreground/70">{v || '—'}</span> },
          { key: 'wo_count', label: 'WO', align: 'right', sortable: true,
            render: (r) => (
              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                r.wo_count > 0 ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
              }`}>
                {r.wo_count || 0} WO
              </span>
            )},
          { key: 'status', label: 'Status',
            render: (r) => <StatusBadge status={r.status} /> },
        ]}
        emptyTitle="Belum ada Order Produksi"
        emptyDescription="Buat order pertama untuk memulai alur produksi."
        emptyIcon={Package}
        emptyAction={
          <Button
            onClick={openCreate}
            className="h-9"
            data-testid="orders-empty-cta-create"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Buat Order Pertama
          </Button>
        }
        emptyHelp="Alur lengkap: Order → generate Work Order → Material Issue → produksi. Tanpa Order, tidak ada WO, dan produksi tidak tercatat."
        exportFilename={`orders-${new Date().toISOString().slice(0,10)}.csv`}
        rowActions={(o) => (
          <div className="inline-flex items-center gap-1">
            <button onClick={() => openDetail(o)} className="p-1.5 rounded hover:bg-[var(--glass-bg-hover)] text-muted-foreground hover:text-foreground" title="Detail" data-testid={`order-detail-${o.order_number}`}><Eye className="w-3.5 h-3.5" /></button>
            {['draft','confirmed','in_production'].includes(o.status) && o.wo_count === 0 && (
              <button
                onClick={() => generateWO(o)}
                disabled={generating === o.id}
                className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary disabled:opacity-50"
                title="Generate Work Order"
                data-testid={`order-generate-wo-${o.order_number}`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
              </button>
            )}
            {o.status === 'draft' && (
              <>
                <button onClick={() => openEdit(o)} className="p-1.5 rounded hover:bg-[var(--glass-bg-hover)] text-muted-foreground hover:text-foreground" title="Edit" data-testid={`order-edit-${o.order_number}`}><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => handleDelete(o)} className="p-1.5 rounded hover:bg-red-400/10 text-muted-foreground hover:text-red-400" title="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
              </>
            )}
          </div>
        )}
      />

      {/* Create/Edit Modal */}
      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} title={editing ? `Edit Order ${editing.order_number}` : 'Order Baru'} size="lg">
          <div className="space-y-4" data-testid="orders-form">
            {formError && <div className="bg-red-400/10 border border-red-300/20 rounded-lg p-3 text-sm text-red-300">{formError}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">Tanggal Order</label>
                <GlassInput type="date" value={form.order_date} onChange={e => setForm({...form, order_date: e.target.value})} data-testid="order-field-order_date" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">Due Date (target selesai)</label>
                <GlassInput type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} data-testid="order-field-due_date" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_internal" checked={form.is_internal}
                onChange={e => setForm({...form, is_internal: e.target.checked, customer_id: e.target.checked ? '' : form.customer_id})}
                className="h-4 w-4" data-testid="order-field-is_internal" />
              <label htmlFor="is_internal" className="text-sm text-foreground cursor-pointer">Produksi Internal (tanpa pelanggan, untuk stok sendiri)</label>
            </div>
            {!form.is_internal && (
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">Pelanggan <span className="text-red-400">*</span></label>
                <select value={form.customer_id} onChange={e => {
                  if (e.target.value === '__create_new__') {
                    setShowCreateCustomer(true);
                    return;
                  }
                  setForm({...form, customer_id: e.target.value});
                }}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-sm text-foreground"
                  data-testid="order-field-customer_id">
                  <option value="">— Pilih Pelanggan —</option>
                  {customers.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                  <option value="__create_new__" className="text-primary font-medium">✚ Tambah Customer Baru...</option>
                </select>
                {showCreateCustomer && (
                  <InlineCustomerCreateForm
                    token={token}
                    onCreated={(newCustomer) => {
                      setForm({...form, customer_id: newCustomer.id});
                      setCustomers(prev => [...prev, newCustomer]);
                      setShowCreateCustomer(false);
                    }}
                    onCancel={() => setShowCreateCustomer(false)}
                  />
                )}
              </div>
            )}

            {/* Items */}
            <div className="border-t border-[var(--glass-border)] pt-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-foreground">Item Pesanan</label>
                <button onClick={addItem} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1" data-testid="order-add-item-btn"><Plus className="w-3 h-3" /> Tambah Item</button>
              </div>
              <div className="space-y-2">
                {form.items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-center">
                    <select value={it.model_id} onChange={e => updateItem(idx, 'model_id', e.target.value)}
                      className="h-9 px-2 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-sm text-foreground"
                      data-testid={`order-item-${idx}-model`}>
                      <option value="">— Model —</option>
                      {models.filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}
                    </select>
                    <select value={it.size_id} onChange={e => updateItem(idx, 'size_id', e.target.value)}
                      className="h-9 px-2 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-sm text-foreground"
                      data-testid={`order-item-${idx}-size`}>
                      <option value="">— Size —</option>
                      {sizes.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
                    </select>
                    <GlassInput type="number" value={it.qty} onChange={e => updateItem(idx, 'qty', e.target.value)}
                      onBlur={e => {
                        // Strip leading zeros
                        const val = e.target.value;
                        if (val && val !== '') {
                          const normalized = parseInt(val, 10);
                          if (!Number.isNaN(normalized) && String(normalized) !== val) {
                            updateItem(idx, 'qty', normalized);
                          }
                        }
                      }}
                      placeholder="Qty" data-testid={`order-item-${idx}-qty`} />
                    <button onClick={() => removeItem(idx)} className="p-1.5 rounded hover:bg-red-400/10 text-muted-foreground hover:text-red-400">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">Catatan</label>
              <GlassInput value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Opsional" />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>Batal</Button>
              <Button onClick={handleSave} disabled={saving} data-testid="order-save-btn">
                {saving ? 'Menyimpan...' : (editing ? 'Simpan Perubahan' : 'Buat Order')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Detail modal */}
      {detailOrder && (
        <Modal onClose={() => setDetailOrder(null)} title={`Detail Order ${detailOrder.order_number}`} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={detailOrder.status} /></div>
              <div><span className="text-muted-foreground">Tanggal:</span> <b>{detailOrder.order_date}</b></div>
              <div><span className="text-muted-foreground">Pelanggan:</span> <b>{detailOrder.customer_name || (detailOrder.is_internal ? 'Produksi Internal' : '-')}</b></div>
              <div><span className="text-muted-foreground">Due:</span> <b>{detailOrder.due_date || '-'}</b></div>
            </div>
            <GlassPanel className="p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[var(--glass-bg)]"><tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">Model</th><th className="px-3 py-2">Size</th><th className="px-3 py-2 text-right">Qty</th>
                </tr></thead>
                <tbody>
                  {(detailOrder.items || []).map(it => (
                    <tr key={it.id} className="border-t border-[var(--glass-border)]">
                      <td className="px-3 py-2">{it.model_code} · {it.model_name}</td>
                      <td className="px-3 py-2">{it.size_code}</td>
                      <td className="px-3 py-2 text-right font-semibold">{it.qty} pcs</td>
                    </tr>
                  ))}
                  <tr className="border-t border-[var(--glass-border)] bg-[var(--glass-bg)]">
                    <td colSpan={2} className="px-3 py-2 font-semibold">Total</td>
                    <td className="px-3 py-2 text-right font-bold text-primary">{detailOrder.total_qty} pcs</td>
                  </tr>
                </tbody>
              </table>
            </GlassPanel>

            {/* Status actions */}
            <div className="border-t border-[var(--glass-border)] pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">Aksi:</div>
                <Button
                  variant="ghost"
                  onClick={() => setAuditOrder(detailOrder)}
                  className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                  data-testid="order-audit-btn"
                  title="Lihat riwayat perubahan"
                >
                  <History className="w-3.5 h-3.5" />
                  Riwayat
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {['draft','confirmed','in_production'].includes(detailOrder.status) && detailOrder.wo_count === 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => generateWO(detailOrder)}
                    disabled={generating === detailOrder.id}
                    className="gap-1.5 border border-primary/40 text-primary hover:bg-primary/10"
                    data-testid="order-generate-wo-detail"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    {generating === detailOrder.id ? 'Generating...' : 'Generate Work Orders'}
                  </Button>
                )}
                {detailOrder.wo_count > 0 && (
                  <div className="text-xs text-muted-foreground italic">
                    WO sudah tersedia ({detailOrder.wo_count} WO). Gunakan filter di modul Work Order untuk melihat detailnya.
                  </div>
                )}
                {(statuses.find(s => s.value === detailOrder.status)?.allowed_next || []).map(ns => (
                  <Button key={ns} variant="ghost" onClick={() => transition(detailOrder, ns)} className="gap-1.5 border border-[var(--glass-border)]" data-testid={`order-transition-${ns}`}>
                    <ArrowRight className="w-3.5 h-3.5" /> {STATUS_COLORS[ns]?.label || ns}
                  </Button>
                ))}
                {(statuses.find(s => s.value === detailOrder.status)?.allowed_next || []).length === 0 && !['draft','confirmed','in_production'].includes(detailOrder.status) && (
                  <div className="text-xs text-muted-foreground">Tidak ada transisi lanjutan.</div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Phase 12.3 — Audit history drawer */}
      <AuditHistoryDrawer
        open={!!auditOrder}
        onClose={() => setAuditOrder(null)}
        token={token}
        entityType="rahaza_order"
        entityId={auditOrder?.id}
        entityLabel={auditOrder ? `Order ${auditOrder.order_number}` : ''}
      />

      {/* ── Rate Setup Modal (Generate WO) ───────────────────────────────── */}
      {rateModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setRateModal(null)}
          data-testid="rate-setup-modal"
        >
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-bold text-foreground">
                    Set Rate Borongan — {rateModal.order?.order_number}
                  </h2>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Rate per proses per item (model × size). Pre-filled dari profil gaji. Kosongkan jika ikut profil.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyFirstRowToAll}
                  className="flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg border border-border hover:bg-muted/50 text-muted-foreground transition-colors"
                  title="Salin baris pertama ke semua item"
                  data-testid="copy-first-row"
                >
                  <Copy className="w-3 h-3" /> Salin baris 1 ke semua
                </button>
                <button onClick={() => setRateModal(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Matrix body */}
            <div className="flex-1 overflow-auto p-4">
              {rateModalLoading ? (
                <div className="flex items-center justify-center h-32 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Memuat data...</span>
                </div>
              ) : (
                <table className="w-full text-xs border-separate border-spacing-0">
                  <thead>
                    <tr className="sticky top-0 bg-card z-10">
                      <th className="text-left px-3 py-2 border-b border-r border-border text-foreground font-semibold min-w-36 sticky left-0 bg-card">
                        Item (Model · Size)
                      </th>
                      {rateProcs.map(p => (
                        <th key={p.id} className="px-2 py-2 border-b border-r border-border text-center min-w-24">
                          <div className="font-semibold text-foreground">{p.code}</div>
                          <div className="text-[9px] text-muted-foreground font-normal">{p.code === 'RAJUT' ? 'Rp/jam' : 'Rp/pcs'}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(rateModal.order?.items || []).map((it, rowIdx) => {
                      const modelName = models.find(m => m.id === it.model_id)?.name || it.model_name || it.model_id;
                      const sizeName  = sizes.find(s => s.id === it.size_id)?.code || sizes.find(s => s.id === it.size_id)?.name || it.size_name || it.size_id;
                      return (
                        <tr key={it.id} className={rowIdx % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                          <td className="px-3 py-2 border-b border-r border-border sticky left-0 bg-inherit" data-testid={`rate-row-${it.id}`}>
                            <div className="font-semibold text-foreground">{modelName}</div>
                            <div className="text-[10px] text-muted-foreground">{sizeName} · {it.qty} pcs</div>
                          </td>
                          {rateProcs.map(p => {
                            const cell = (rateMatrix[it.id] || {})[p.id] || {};
                            return (
                              <td key={p.id} className="px-1.5 py-1.5 border-b border-r border-border text-center">
                                <input
                                  type="number"
                                  min={0}
                                  step={50}
                                  value={cell.rate || ''}
                                  onChange={e => updateRateCell(it.id, p.id, 'rate', e.target.value)}
                                  onBlur={e => {
                                    // Strip leading zeros
                                    const val = e.target.value;
                                    if (val && val !== '') {
                                      const normalized = parseFloat(val);
                                      if (!Number.isNaN(normalized) && String(normalized) !== val) {
                                        updateRateCell(it.id, p.id, 'rate', normalized);
                                      }
                                    }
                                  }}
                                  placeholder="0"
                                  className="w-full h-8 px-2 text-center text-xs rounded-lg border border-input bg-background text-foreground
                                    focus:outline-none focus:ring-1 focus:ring-primary/50"
                                  data-testid={`rate-cell-${it.id}-${p.id}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Info + Footer */}
            <div className="flex-shrink-0 border-t border-border px-5 py-3 space-y-2">
              <div className="flex items-start gap-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/15">
                <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground">
                  <b className="text-blue-300">Rate per proses per item (model × size)</b> — rate yang berbeda antar kolom mencerminkan perbedaan kompleksitas per model/size.
                  Jika dikosongkan (0), sistem akan menggunakan rate dari <b>profil gaji karyawan</b> saat kalkulasi payroll.
                  Rate ini bisa diedit lagi via menu <b>Work Orders</b>.
                </p>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setRateModal(null)}
                  className="px-4 py-2 text-sm border border-border rounded-xl hover:bg-muted/50 text-foreground transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={confirmGenerateWO}
                  disabled={!!generating}
                  className="px-5 py-2 text-sm font-semibold rounded-xl text-white bg-primary hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center gap-2"
                  data-testid="confirm-generate-wo-btn"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Factory className="w-4 h-4" />}
                  Generate Work Orders
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
