/**
 * ProductionWizardModule — Production Wizard (P0 Automation)
 * Menggabungkan Order → WO → Release jadi 1 wizard 3-step.
 * Fitur:
 *   - Step 1: Data Order (customer, model, size, qty) + inline model creation
 *   - Step 2: Preview WO + BOM status + input material TOTAL per WO jika tidak ada BOM
 *   - Step 3: Konfirmasi & Mulai Produksi
 */
import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Wand2, Package, FileText, CheckCircle2, AlertCircle, ChevronRight,
  ChevronLeft, Calendar, User, Boxes, Plus, X, AlertTriangle,
  CheckCircle, Leaf, Info, Search, Layers, Scissors, Coins, Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { GlassCard, GlassInput } from '@/components/ui/glass';
import { useProductionUI } from '@/contexts/ProductionUIContext';
import { toast } from 'sonner';

// ── Stepper ───────────────────────────────────────────────────────────────────
const WizardStepper = ({ currentStep }) => {
  const steps = [
    { id: 1, label: 'Data Order', icon: FileText },
    { id: 2, label: 'Preview WO', icon: Package },
    { id: 3, label: 'Rate Borongan', icon: Coins },
    { id: 4, label: 'Konfirmasi', icon: CheckCircle2 },
  ];
  return (
    <div className="hidden md:block w-[220px] pr-4 border-r border-border/60" data-testid="wizard-stepper">
      <div className="space-y-3">
        {steps.map((step) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const isDone = currentStep > step.id;
          return (
            <div key={step.id} className="flex items-start gap-3 py-3">
              <div className={`h-8 w-8 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                isActive ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_12px_hsl(var(--primary)/0.5)]'
                : isDone ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'border-border bg-[var(--glass-bg)] text-muted-foreground'
              }`} data-testid={`wizard-step-dot-${step.id}`}>
                {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <div className="flex-1">
                <div className={`text-sm font-medium ${isActive ? 'text-foreground' : isDone ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                  {step.label}
                </div>
                <div className="text-xs text-muted-foreground">Step {step.id}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Inline Model Creation Form ────────────────────────────────────────────────
const InlineModelCreateForm = ({ token, onCreated, onCancel }) => {
  const [form, setForm] = useState({ code: '', name: '', category: 'Sweater', description: '' });
  const [saving, setSaving] = useState(false);
  const categories = ['Sweater', 'Cardigan', 'Polo', 'Jacket', 'Kids', 'Lainnya'];

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('Kode dan Nama wajib diisi');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/rahaza/models', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const newModel = await res.json();
      toast.success(`Model "${newModel.code}" berhasil dibuat`);
      onCreated(newModel);
    } catch (e) {
      toast.error('Gagal membuat model: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Plus className="w-3 h-3" /> Tambah Model Baru
        </span>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">Kode *</label>
          <GlassInput
            placeholder="e.g. SWT-NEW"
            value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">Nama *</label>
          <GlassInput
            placeholder="Nama model"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">Kategori</label>
          <select
            className="w-full h-8 px-2 rounded-lg border border-border bg-[var(--input-surface)] text-sm"
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
          >
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">Deskripsi</label>
          <GlassInput
            placeholder="Opsional"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 text-xs">Batal</Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs">
          {saving ? 'Menyimpan...' : 'Simpan Model'}
        </Button>
      </div>
    </div>
  );
};

// ── Inline Customer Creation Form ────────────────────────────────────────────
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

// ── Step 1: Data Order ────────────────────────────────────────────────────────
const Step1OrderData = ({ form, setForm, customers, models, sizes, token, onModelsRefresh }) => {
  const [showCreateModel, setShowCreateModel] = useState(null); // idx of item showing create form
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);

  const handleModelCreated = (idx, newModel) => {
    onModelsRefresh(newModel);
    const newItems = [...form.items];
    newItems[idx].model_id = newModel.id;
    setForm(f => ({ ...f, items: newItems }));
    setShowCreateModel(null);
  };

  const handleCustomerCreated = (newCustomer) => {
    // Add to local customers list (parent will re-fetch on mount)
    setForm(f => ({ ...f, customer_id: newCustomer.id }));
    setShowCreateCustomer(false);
  };

  return (
    <div className="space-y-4" data-testid="production-wizard-step-order">
      {/* Jenis Order */}
      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-1.5">Jenis Order</label>
        <div className="flex gap-3">
          <button
            onClick={() => setForm(f => ({ ...f, is_internal: false }))}
            className={`flex-1 h-10 rounded-[var(--radius-control)] border transition-all ${
              !form.is_internal ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-[var(--glass-bg)] text-muted-foreground hover:bg-[var(--glass-bg-hover)]'
            }`}
            data-testid="wizard-order-type-customer"
          >
            <User className="w-4 h-4 inline mr-2" />Customer
          </button>
          <button
            onClick={() => setForm(f => ({ ...f, is_internal: true, customer_id: '' }))}
            className={`flex-1 h-10 rounded-[var(--radius-control)] border transition-all ${
              form.is_internal ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-[var(--glass-bg)] text-muted-foreground hover:bg-[var(--glass-bg-hover)]'
            }`}
            data-testid="wizard-order-type-internal"
          >
            <Boxes className="w-4 h-4 inline mr-2" />Internal
          </button>
        </div>
      </div>

      {!form.is_internal && (
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1.5">
            Pelanggan <span className="text-red-400">*</span>
          </label>
          <select
            className="w-full h-10 px-3 rounded-[var(--radius-control)] border border-border bg-[var(--input-surface)] text-foreground"
            value={form.customer_id}
            onChange={e => {
              if (e.target.value === '__create_new__') {
                setShowCreateCustomer(true);
                return;
              }
              setForm(f => ({ ...f, customer_id: e.target.value }));
            }}
            data-testid="wizard-customer-select"
          >
            <option value="">— Pilih Pelanggan —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__create_new__" className="text-primary font-medium">✚ Tambah Customer Baru...</option>
          </select>
          {showCreateCustomer && (
            <InlineCustomerCreateForm
              token={token}
              onCreated={handleCustomerCreated}
              onCancel={() => setShowCreateCustomer(false)}
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1.5">
            <Calendar className="w-3.5 h-3.5 inline mr-1" />Tanggal Order
          </label>
          <GlassInput type="date" value={form.order_date}
            onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))}
            data-testid="wizard-order-date" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1.5">Deadline</label>
          <GlassInput type="date" value={form.due_date}
            onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
            data-testid="wizard-due-date" />
        </div>
      </div>

      {/* Item Order */}
      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-1.5">
          Item Order <span className="text-red-400">*</span>
        </label>
        <GlassCard className="p-3 space-y-3">
          {form.items.map((item, idx) => (
            <div key={idx} className="space-y-2">
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-start">
                <div>
                  <select
                    className="w-full h-9 px-2 rounded-lg border border-border bg-[var(--input-surface)] text-sm"
                    value={item.model_id}
                    onChange={e => {
                      if (e.target.value === '__create_new__') {
                        setShowCreateModel(idx);
                        return;
                      }
                      const newItems = [...form.items];
                      newItems[idx].model_id = e.target.value;
                      setForm(f => ({ ...f, items: newItems }));
                    }}
                    data-testid={`wizard-item-model-${idx}`}
                  >
                    <option value="">— Pilih Model —</option>
                    {models.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                    <option value="__create_new__" className="text-primary font-medium">✚ Tambah Model Baru...</option>
                  </select>
                </div>
                <select
                  className="h-9 w-24 px-2 rounded-lg border border-border bg-[var(--input-surface)] text-sm"
                  value={item.size_id}
                  onChange={e => {
                    const newItems = [...form.items];
                    newItems[idx].size_id = e.target.value;
                    setForm(f => ({ ...f, items: newItems }));
                  }}
                  data-testid={`wizard-item-size-${idx}`}
                >
                  <option value="">Size</option>
                  {sizes.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
                </select>
                <div className="flex items-center gap-1">
                  <GlassInput
                    type="number" placeholder="Qty" min="1"
                    value={item.qty}
                    onChange={e => {
                      const newItems = [...form.items];
                      newItems[idx].qty = e.target.value;
                      setForm(f => ({ ...f, items: newItems }));
                    }}
                    onBlur={e => {
                      // Always normalize on blur - strip leading zeros and any non-digit junk
                      const val = e.target.value;
                      if (val !== '' && val !== null && val !== undefined) {
                        const n = parseInt(val, 10);
                        const normalized = Number.isNaN(n) ? '' : n;
                        if (String(item.qty) !== String(normalized)) {
                          const newItems = [...form.items];
                          newItems[idx].qty = normalized;
                          setForm(f => ({ ...f, items: newItems }));
                        }
                      }
                    }}
                    className="w-20 h-9 text-sm"
                    data-testid={`wizard-item-qty-${idx}`}
                  />
                  {form.items.length > 1 && (
                    <button onClick={() => {
                      const newItems = form.items.filter((_, i) => i !== idx);
                      setForm(f => ({ ...f, items: newItems }));
                    }} className="text-muted-foreground hover:text-red-400 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              {/* Inline model create form */}
              {showCreateModel === idx && (
                <InlineModelCreateForm
                  token={token}
                  onCreated={(m) => handleModelCreated(idx, m)}
                  onCancel={() => setShowCreateModel(null)}
                />
              )}
            </div>
          ))}
          <Button
            size="sm" variant="ghost"
            onClick={() => setForm(f => ({ ...f, items: [...f.items, { model_id: '', size_id: '', qty: '' }] }))}
            data-testid="wizard-add-item-btn"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Tambah Item
          </Button>
        </GlassCard>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-1.5">Catatan</label>
        <textarea
          className="w-full h-20 px-3 py-2 rounded-[var(--radius-control)] border border-border bg-[var(--input-surface)] text-foreground text-sm resize-none"
          placeholder="Catatan order (opsional)"
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          data-testid="wizard-order-notes"
        />
      </div>
    </div>
  );
};

// ── Material Type Badge ───────────────────────────────────────────────────────
const MatTypeBadge = ({ type }) => {
  if (type === 'yarn') return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-blue-400/15 text-blue-300 border border-blue-400/20">
      <Layers className="w-2.5 h-2.5" /> Benang
    </span>
  );
  if (type === 'accessory') return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-400/15 text-amber-300 border border-amber-400/20">
      <Scissors className="w-2.5 h-2.5" /> Aksesoris
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-muted/30 text-muted-foreground">
      {type || 'Lainnya'}
    </span>
  );
};

// ── Helper: Normalize Number Input (strip leading zeros) ──────────────────────
const normalizeNumberInput = (val, opts = { type: 'int' }) => {
  if (val === '' || val === null || val === undefined) return '';
  const n = opts.type === 'float' ? parseFloat(val) : parseInt(val, 10);
  if (Number.isNaN(n)) return '';
  return String(n);
};

// ── Material Searchable Combobox (Portal-based to avoid Dialog clipping) ──────
const MaterialCombobox = ({ value, onChange, materials, placeholder = "Cari / pilih bahan..." }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const selectedMat = materials.find(m => m.id === value);

  // Close on outside click — use document handler so it works across portal
  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape + reposition on scroll/resize
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onReposition = () => {
      if (triggerRef.current) {
        const r = triggerRef.current.getBoundingClientRect();
        setMenuPos({ top: r.bottom + 4, left: r.left, width: r.width });
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, [open]);

  const filtered = query.trim()
    ? materials.filter(m =>
        m.name?.toLowerCase().includes(query.toLowerCase()) ||
        m.code?.toLowerCase().includes(query.toLowerCase())
      )
    : materials;

  const menu = open ? (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: menuPos.top,
        left: menuPos.left,
        width: Math.max(menuPos.width, 280),
        zIndex: 9999,
      }}
      className="bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
      data-testid="material-combobox-menu"
    >
      <div className="p-1.5 border-b border-border/60">
        <input
          autoFocus
          className="w-full h-7 px-2 text-xs rounded bg-[var(--input-surface)] border border-border/40 outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="Ketik untuk cari..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onClick={e => e.stopPropagation()}
          data-testid="material-combobox-search"
        />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground italic">Tidak ada hasil</div>
        ) : filtered.map(m => (
          <div
            key={m.id}
            onClick={() => { onChange(m); setOpen(false); setQuery(''); }}
            className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-primary/10 transition-colors ${value === m.id ? 'bg-primary/10' : ''}`}
            data-testid={`material-option-${m.id}`}
          >
            <MatTypeBadge type={m.type} />
            <span className="text-xs text-foreground flex-1">{m.name}</span>
            <span className="text-[10px] text-muted-foreground">{m.unit}</span>
          </div>
        ))}
        <div
          onClick={() => { onChange({ id: '__new__' }); setOpen(false); setQuery(''); }}
          className="flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-primary/10 text-primary border-t border-border/40"
          data-testid="material-combobox-add-new"
        >
          <Plus className="w-3 h-3" />
          <span className="text-xs font-medium">Tambah Bahan Baru ke Master Data...</span>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="relative">
      <div
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 h-8 px-2 rounded-lg border border-border bg-[var(--input-surface)] cursor-pointer hover:border-primary/50 transition-colors"
        data-testid="material-combobox-trigger"
      >
        {selectedMat ? (
          <>
            <MatTypeBadge type={selectedMat.type} />
            <span className="text-xs text-foreground flex-1 truncate">{selectedMat.name}</span>
            <span className="text-[10px] text-muted-foreground">{selectedMat.code}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground flex-1">{placeholder}</span>
        )}
        <Search className="w-3 h-3 text-muted-foreground shrink-0" />
      </div>
      {menu && createPortal(menu, document.body)}
    </div>
  );
};

// ── Inline Material Create Form ───────────────────────────────────────────────
const InlineMaterialCreateForm = ({ token, onCreated, onCancel }) => {
  const [form, setForm] = useState({ code: '', name: '', type: 'yarn', unit: 'kg' });
  const [saving, setSaving] = useState(false);
  const unitsByType = {
    yarn: ['kg', 'gram', 'cone', 'spool'],
    accessory: ['pcs', 'lusin', 'gross', 'set', 'meter', 'cm'],
    fg: ['pcs', 'kodi', 'lusin'],
    packaging: ['pcs', 'roll', 'lembar'],
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nama material wajib'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/rahaza/materials/quick-add', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const mat = await res.json();
      toast.success(`Bahan "${mat.name}" ditambahkan ke master data`);
      onCreated(mat);
    } catch (e) { toast.error('Gagal: ' + e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Plus className="w-3 h-3" /> Tambah Bahan Baru ke Master Data
        </span>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">Nama Bahan *</label>
          <GlassInput placeholder="e.g. Benang Akrilik No.7" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-xs" />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">Kode (opsional)</label>
          <GlassInput placeholder="Auto-generate jika kosong" value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="h-8 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">Kategori *</label>
          <select className="w-full h-8 px-2 rounded-lg border border-border bg-[var(--input-surface)] text-xs"
            value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, unit: unitsByType[e.target.value]?.[0] || 'kg' }))}>
            <option value="yarn">🧵 Benang (Yarn)</option>
            <option value="accessory">✂️ Aksesoris</option>
            <option value="packaging">📦 Packaging</option>
            <option value="fg">Finished Goods</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">Satuan *</label>
          <select className="w-full h-8 px-2 rounded-lg border border-border bg-[var(--input-surface)] text-xs"
            value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
            {(unitsByType[form.type] || ['kg', 'pcs']).map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 text-xs">Batal</Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs">
          {saving ? 'Menyimpan...' : 'Simpan & Pilih'}
        </Button>
      </div>
    </div>
  );
};

// ── Material Input Row (per bahan, qty = total untuk WO) ─────────────────────
const MaterialSelectRow = ({ mat, idx, materials, token, onMaterialsChange, allMaterials, onNewMaterial, woQty }) => {
  const [showCreate, setShowCreate] = useState(false);

  const update = (field, val) => {
    onMaterialsChange(idx, { ...mat, [field]: val });
  };

  const handleMaterialSelect = (selected) => {
    if (selected.id === '__new__') {
      setShowCreate(true);
      return;
    }
    onMaterialsChange(idx, {
      ...mat,
      material_id: selected.id,
      material_name: selected.name,
      material_code: selected.code,
      material_type: selected.type || 'yarn',
      unit: selected.unit || (selected.type === 'accessory' ? 'pcs' : 'kg'),
    });
  };

  const handleNewCreated = (newMat) => {
    onNewMaterial(newMat);
    onMaterialsChange(idx, {
      ...mat,
      material_id: newMat.id,
      material_name: newMat.name,
      material_code: newMat.code,
      material_type: newMat.type || 'yarn',
      unit: newMat.unit || 'kg',
    });
    setShowCreate(false);
  };

  const selectedMat = allMaterials.find(m => m.id === mat.material_id);
  const unitLabel = mat.unit || (mat.material_type === 'accessory' ? 'pcs' : 'kg');

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[2fr_auto_auto_auto] gap-1.5 items-center">
        <MaterialCombobox
          value={mat.material_id}
          onChange={handleMaterialSelect}
          materials={allMaterials}
          placeholder="Pilih bahan dari master data..."
        />
        <div className="flex items-center gap-1">
          <GlassInput
            type="number" placeholder="Jumlah" min="0" step="0.001"
            value={mat.total_qty_for_wo}
            onChange={e => update('total_qty_for_wo', e.target.value)}
            onBlur={e => {
              // Remove leading zeros on blur
              const val = e.target.value;
              if (val && val !== '') {
                const normalized = parseFloat(val) || '';
                if (String(normalized) !== val) {
                  update('total_qty_for_wo', normalized);
                }
              }
            }}
            className="w-24 h-8 text-xs"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">{unitLabel}</span>
        </div>
        <div className="text-[10px] text-muted-foreground whitespace-nowrap">
          {mat.total_qty_for_wo && woQty > 0 ? (
            <span className="text-primary/80">
              ≈ {(parseFloat(mat.total_qty_for_wo) / woQty).toFixed(4)} {unitLabel}/pcs
            </span>
          ) : <span>untuk {woQty} pcs</span>}
        </div>
        <button onClick={() => onMaterialsChange(idx, null)}
          className="text-muted-foreground hover:text-red-400 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {showCreate && (
        <InlineMaterialCreateForm
          token={token}
          onCreated={handleNewCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}
    </div>
  );
};

// ── Step 2: Preview WO + BOM Input ────────────────────────────────────────────
const Step2Preview = ({ previewData, loading, materialInputs, setMaterialInputs, token, allMaterials, onNewMaterial }) => {
  const [expandedBOM, setExpandedBOM] = useState({});

  const toggleBOMInput = (idx) => {
    setExpandedBOM(prev => ({ ...prev, [idx]: !prev[idx] }));
    if (!materialInputs[idx] || materialInputs[idx].length === 0) {
      setMaterialInputs(prev => ({
        ...prev,
        [idx]: [{ material_id: '', material_name: '', material_type: 'yarn', total_qty_for_wo: '', unit: 'kg' }]
      }));
    }
  };

  const updateMaterialRow = (idx, rowIdx, value) => {
    setMaterialInputs(prev => {
      const rows = [...(prev[idx] || [])];
      if (value === null) {
        rows.splice(rowIdx, 1);
      } else {
        rows[rowIdx] = value;
      }
      return { ...prev, [idx]: rows };
    });
  };

  const addMaterialRow = (idx) => {
    setMaterialInputs(prev => ({
      ...prev,
      [idx]: [...(prev[idx] || []), { material_id: '', material_name: '', material_type: 'yarn', total_qty_for_wo: '', unit: 'kg' }]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="production-wizard-step-preview">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Menghitung preview...</p>
        </div>
      </div>
    );
  }

  if (!previewData) {
    return (
      <div className="text-center text-muted-foreground py-12" data-testid="production-wizard-step-preview">
        <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p>Preview belum tersedia</p>
      </div>
    );
  }

  const noBomItems = (previewData.items || []).filter(it => !it.has_bom);

  return (
    <div className="space-y-4" data-testid="production-wizard-step-preview">
      {/* Summary */}
      <GlassCard className="p-4">
        <div className="text-sm font-semibold text-foreground mb-3">Ringkasan</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Work Orders</div>
            <div className="text-2xl font-bold text-primary">{previewData.wo_count || 0}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Item</div>
            <div className="text-2xl font-bold text-foreground">{previewData.items?.length || 0}</div>
          </div>
        </div>
      </GlassCard>

      {noBomItems.length > 0 && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-400/10 border border-amber-300/20">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-300/90">
            <strong>{noBomItems.length} item tidak memiliki BOM.</strong>{' '}
            Input estimasi bahan di bawah agar BOM terbentuk otomatis.
            Atau biarkan kosong, input aktual di WO setelah produksi selesai.
          </div>
        </div>
      )}

      <div>
        <div className="text-sm font-semibold text-foreground mb-2">Detail WO yang akan dibuat:</div>
        <div className="space-y-3">
          {(previewData.items || []).map((item, idx) => (
            <GlassCard key={idx} className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {item.model_code || '—'} · {item.size_code || '—'}
                  </div>
                  <div className="text-xs text-muted-foreground">{item.model_name}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono text-primary font-bold">{item.qty} pcs</div>
                  {item.has_bom ? (
                    <div className="flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle className="w-3 h-3" />
                      BOM: {item.bom_yarn_count} benang · {item.bom_accessory_count} aksesoris
                    </div>
                  ) : (
                    <button
                      onClick={() => toggleBOMInput(idx)}
                      className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      {expandedBOM[idx] ? 'Tutup input bahan' : 'Input estimasi bahan (opsional)'}
                    </button>
                  )}
                </div>
              </div>

              {!item.has_bom && expandedBOM[idx] && (
                <div className="border-t border-border/40 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
                      <Leaf className="w-3.5 h-3.5 text-primary" />
                      Estimasi bahan untuk WO ini (total {item.qty} pcs)
                    </span>
                  </div>
                  <div className="bg-primary/5 rounded p-2 text-[11px] text-primary/80 flex items-center gap-1.5">
                    <Info className="w-3 h-3 shrink-0" />
                    Input total bahan untuk <strong>{item.qty} pcs</strong>.
                    Sistem akan hitung otomatis qty per-pcs untuk BOM.
                    Bahan benang (yarn) dan aksesoris bisa dicampur.
                  </div>

                  <div className="space-y-2">
                    {(materialInputs[idx] || []).map((mat, mIdx) => (
                      <MaterialSelectRow
                        key={mIdx}
                        mat={mat}
                        idx={mIdx}
                        token={token}
                        allMaterials={allMaterials}
                        onMaterialsChange={(rIdx, val) => updateMaterialRow(idx, rIdx, val)}
                        onNewMaterial={onNewMaterial}
                        woQty={item.qty}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => addMaterialRow(idx)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors py-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah bahan lagi
                  </button>
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Step 3: Rate Borongan (matrix per item × process) ─────────────────────────
const Step3RateSetup = ({
  form,
  models,
  sizes,
  rateProcs,
  rateMatrix,
  setRateMatrix,
  setRatesEnabled,
  ratesEnabled,
  loadingProcs,
}) => {
  const updateCell = (key, procId, field, value) => {
    setRateMatrix(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [procId]: { ...(prev[key]?.[procId] || {}), [field]: value },
      },
    }));
  };

  const copyFirstRowToAll = () => {
    const itemKeys = (form.items || [])
      .filter(i => i.model_id && i.size_id && Number(i.qty) > 0)
      .map(i => `${i.model_id}_${i.size_id}`);
    if (itemKeys.length < 2) return;
    const firstKey = itemKeys[0];
    const firstRow = rateMatrix[firstKey] || {};
    setRateMatrix(prev => {
      const next = { ...prev };
      itemKeys.slice(1).forEach(k => {
        next[k] = JSON.parse(JSON.stringify(firstRow));
      });
      return next;
    });
  };

  const validItems = (form.items || []).filter(i => i.model_id && i.size_id && Number(i.qty) > 0);

  return (
    <div className="space-y-4" data-testid="production-wizard-step-rate">
      <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-400/5 border border-amber-300/20">
        <Coins className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm text-amber-200/90 font-medium mb-1">Rate Borongan per Proses (Opsional)</div>
          <p className="text-[11px] text-muted-foreground">
            Atur rate borongan per item (model × size) per proses. Pre-filled dari profil gaji karyawan.
            Jika dikosongkan (0), sistem akan memakai rate dari <strong>profil gaji</strong> saat kalkulasi payroll.
            Rate ini bisa diubah lagi di modul Work Orders setelah produksi mulai.
          </p>
          <label className="mt-2 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={ratesEnabled}
              onChange={e => setRatesEnabled(e.target.checked)}
              className="h-3.5 w-3.5"
              data-testid="wizard-rate-enable"
            />
            <span className="text-xs text-foreground">
              Set borongan sekarang (recommended)
            </span>
          </label>
        </div>
        {ratesEnabled && validItems.length > 1 && (
          <button
            onClick={copyFirstRowToAll}
            className="flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg border border-border hover:bg-muted/50 text-muted-foreground transition-colors"
            data-testid="wizard-rate-copy-first"
            title="Salin baris pertama ke semua item"
          >
            <Copy className="w-3 h-3" /> Salin baris 1 ke semua
          </button>
        )}
      </div>

      {!ratesEnabled ? (
        <div className="text-center py-12 text-sm text-muted-foreground italic" data-testid="wizard-rate-disabled-msg">
          Rate borongan dinonaktifkan. Sistem akan memakai rate default dari profil gaji.
        </div>
      ) : loadingProcs ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (rateProcs.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground italic">
          Tidak ada proses aktif yang ditemukan.
        </div>
      ) : (
        <div className="overflow-auto border border-border rounded-lg">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="bg-card">
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
              {validItems.map((it, rowIdx) => {
                const key = `${it.model_id}_${it.size_id}`;
                const modelName = models.find(m => m.id === it.model_id)?.name || '—';
                const sizeName = sizes.find(s => s.id === it.size_id)?.code || sizes.find(s => s.id === it.size_id)?.name || '—';
                return (
                  <tr key={key} className={rowIdx % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                    <td className="px-3 py-2 border-b border-r border-border sticky left-0 bg-inherit"
                        data-testid={`wizard-rate-row-${rowIdx}`}>
                      <div className="font-semibold text-foreground">{modelName}</div>
                      <div className="text-[10px] text-muted-foreground">{sizeName} · {it.qty} pcs</div>
                    </td>
                    {rateProcs.map(p => {
                      const cell = (rateMatrix[key] || {})[p.id] || {};
                      return (
                        <td key={p.id} className="px-1.5 py-1.5 border-b border-r border-border text-center">
                          <input
                            type="number"
                            min={0}
                            step={50}
                            value={cell.rate ?? ''}
                            onChange={e => updateCell(key, p.id, 'rate', e.target.value)}
                            onBlur={e => {
                              const norm = normalizeNumberInput(e.target.value, { type: 'float' });
                              if (String(cell.rate ?? '') !== norm) {
                                updateCell(key, p.id, 'rate', norm);
                              }
                            }}
                            placeholder="0"
                            className="w-full h-8 px-2 text-center text-xs rounded-lg border border-input bg-background text-foreground
                              focus:outline-none focus:ring-1 focus:ring-primary/50"
                            data-testid={`wizard-rate-cell-${rowIdx}-${p.code}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

// ── Step 4: Konfirmasi ────────────────────────────────────────────────────────
const Step4Confirm = ({ previewData, materialInputs, confirmed, setConfirmed, ratesEnabled, rateMatrix }) => {
  const itemsWithBomInput = Object.values(materialInputs).filter(
    mats => mats?.some(m => m.material_name && parseFloat(m.qty_per_pcs) > 0)
  ).length;

  const itemsWithRates = ratesEnabled
    ? Object.values(rateMatrix).filter(row =>
        Object.values(row || {}).some(c => parseFloat(c?.rate || 0) > 0)
      ).length
    : 0;

  return (
    <div className="space-y-4" data-testid="production-wizard-step-confirm">
      <div className="bg-[hsl(var(--info))]/10 border border-[hsl(var(--info))]/20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[hsl(var(--info))] shrink-0 mt-0.5" />
          <div className="text-sm text-foreground/90 space-y-1">
            <div>Wizard akan membuat <strong>{previewData?.wo_count || 0} Work Order</strong> dan
            langsung di-release ke produksi.</div>
            {itemsWithBomInput > 0 && (
              <div className="text-emerald-400">
                ✓ BOM akan dibuat otomatis untuk {itemsWithBomInput} item berdasarkan estimasi bahan yang diisi.
              </div>
            )}
            {ratesEnabled && itemsWithRates > 0 && (
              <div className="text-amber-300">
                ✓ Rate borongan akan disimpan untuk {itemsWithRates} item.
              </div>
            )}
            {ratesEnabled && itemsWithRates === 0 && (
              <div className="text-muted-foreground">
                ℹ️ Tidak ada rate yang diisi — sistem akan memakai rate dari profil gaji.
              </div>
            )}
            {!ratesEnabled && (
              <div className="text-muted-foreground">
                ℹ️ Set rate borongan dilewati — sistem akan memakai rate dari profil gaji.
              </div>
            )}
          </div>
        </div>
      </div>

      <GlassCard className="p-4">
        <div className="text-sm font-semibold text-foreground mb-3">Checklist Validasi</div>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
            className="mt-0.5"
            data-testid="wizard-confirm-checkbox"
          />
          <span className="text-sm text-foreground/90">
            Saya sudah mengecek target qty, deadline, dan rate. Data sudah benar.
          </span>
        </label>
      </GlassCard>

      <div className="text-xs text-muted-foreground">
        <strong>Catatan:</strong> Setelah eksekusi, Order akan muncul di modul Order Produksi
        dengan status <em>In Production</em> dan WO akan tersedia di modul Work Orders
        dengan status <em>Released</em>.
        {Object.keys(materialInputs).length > 0 && itemsWithBomInput === 0 && (
          <span className="block mt-1 text-amber-300/80">
            ⚠ Ada item tanpa BOM yang tidak diisi estimasi bahannya.
            Anda dapat input aktual bahan setelah WO selesai melalui detail Work Order.
          </span>
        )}
      </div>
    </div>
  );
};

// ── Main Wizard Component ─────────────────────────────────────────────────────
export default function ProductionWizardModule({ token, isGlobalMount = false }) {
  const { wizardOpen, wizardInitial, openWizard, closeWizard } = useProductionUI();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    is_internal: false,
    customer_id: '',
    order_date: new Date().toISOString().split('T')[0],
    due_date: '',
    items: [{ model_id: '', size_id: '', qty: '' }],
    notes: '',
  });
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [materialInputs, setMaterialInputs] = useState({}); // { itemIdx: [{material_name, qty_per_pcs, unit}] }
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Master data
  const [customers, setCustomers] = useState([]);
  const [models, setModels] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [allMaterials, setAllMaterials] = useState([]); // master data bahan

  // Rate setup (Step 3)
  const [rateProcs, setRateProcs] = useState([]);
  const [rateMatrix, setRateMatrix] = useState({}); // { "model_size_key": { proc_id: { rate, unit, process_code } } }
  const [ratesEnabled, setRatesEnabled] = useState(true);
  const [loadingProcs, setLoadingProcs] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (wizardOpen) {
      fetchMasterData();
      if (wizardInitial) setForm(f => ({ ...f, ...wizardInitial }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardOpen]);

  const fetchMasterData = async () => {
    try {
      const [c, m, s, mats] = await Promise.all([
        fetch('/api/rahaza/customers?active=true&limit=200', { headers }).then(r => r.json()),
        fetch('/api/rahaza/models?active=true&limit=200', { headers }).then(r => r.json()),
        fetch('/api/rahaza/sizes?active=true&limit=200', { headers }).then(r => r.json()),
        fetch('/api/rahaza/materials?limit=500', { headers }).then(r => r.json()),
      ]);
      setCustomers(Array.isArray(c) ? c : c.items || []);
      setModels(Array.isArray(m) ? m : m.items || []);
      setSizes(Array.isArray(s) ? s : s.items || []);
      setAllMaterials(Array.isArray(mats) ? mats : mats.items || []);
    } catch (e) {
      console.error('Failed to fetch master data:', e);
    }
  };

  const handleModelsRefresh = (newModel) => {
    setModels(prev => [...prev, newModel]);
  };

  const handleNewMaterial = (newMat) => {
    setAllMaterials(prev => [...prev, newMat]);
  };

  const validateStep1 = () => {
    if (!form.is_internal && !form.customer_id) {
      setError('Pilih pelanggan atau centang Produksi Internal.');
      return false;
    }
    const validItems = form.items.filter(i => i.model_id && i.size_id && Number(i.qty) > 0);
    if (validItems.length === 0) {
      setError('Minimal 1 item dengan model, size, dan qty > 0.');
      return false;
    }
    setError('');
    return true;
  };

  const loadRateSetupData = async () => {
    setLoadingProcs(true);
    try {
      const [procsRes, profilesRes] = await Promise.all([
        fetch('/api/rahaza/processes', { headers }),
        fetch('/api/rahaza/payroll-profiles?limit=200', { headers }),
      ]);
      const procs = procsRes.ok ? (await procsRes.json()).filter(p => p.active && !p.is_rework) : [];
      const profiles = profilesRes.ok ? await profilesRes.json() : [];

      // Build default rate map from profiles: process_id → { rate, unit }
      const profileDefaults = {};
      for (const prof of (profiles.items || profiles || [])) {
        for (const r of (prof.pcs_process_rates || [])) {
          if (!profileDefaults[r.process_id] && r.rate > 0) {
            profileDefaults[r.process_id] = { rate: r.rate, unit: r.unit || 'pcs' };
          }
        }
      }
      setRateProcs(procs);

      // Build initial matrix: only initialise keys not already filled (preserve user edits)
      const validItems = (form.items || []).filter(i => i.model_id && i.size_id && Number(i.qty) > 0);
      setRateMatrix(prev => {
        const next = { ...prev };
        for (const it of validItems) {
          const key = `${it.model_id}_${it.size_id}`;
          if (next[key]) continue; // preserve user edits
          next[key] = {};
          for (const p of procs) {
            const def = profileDefaults[p.id] || { rate: 0, unit: p.code === 'RAJUT' ? 'jam' : 'pcs' };
            next[key][p.id] = {
              rate: def.rate || 0,
              unit: def.unit,
              process_code: p.code,
              process_name: p.name,
            };
          }
        }
        return next;
      });
    } catch (e) {
      console.error('Failed to load rate setup:', e);
    } finally {
      setLoadingProcs(false);
    }
  };

  const handleNext = async () => {
    if (step === 1) {
      if (!validateStep1()) return;
      setPreviewLoading(true);
      try {
        const cleanedItems = form.items
          .filter(i => i.model_id && i.size_id && Number(i.qty) > 0)
          .map(i => ({ model_id: i.model_id, size_id: i.size_id, qty: Number(i.qty) }));
        const res = await fetch('/api/rahaza/wizard/preview-production', {
          method: 'POST', headers,
          body: JSON.stringify({ items: cleanedItems }),
        });
        if (!res.ok) throw new Error('Preview gagal');
        const data = await res.json();
        setPreviewData(data);
        setMaterialInputs({});
        setStep(2);
      } catch (e) {
        toast.error('Gagal mendapatkan preview: ' + e.message);
      } finally {
        setPreviewLoading(false);
      }
    } else if (step === 2) {
      // Going to step 3 — load rate setup data
      await loadRateSetupData();
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  };

  const handleBack = () => { if (step > 1) setStep(step - 1); };

  const handleSubmit = async () => {
    if (!confirmed) { setError('Centang konfirmasi terlebih dahulu.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const cleanedItems = form.items
        .filter(i => i.model_id && i.size_id && Number(i.qty) > 0)
        .map((i, idx) => {
          // Attach material inputs for items without BOM
          const mats = (materialInputs[idx] || [])
            .filter(m => m.material_name && parseFloat(m.total_qty_for_wo) > 0)
            .map(m => ({
              material_id: m.material_id || '',
              material_name: m.material_name,
              material_code: m.material_code || '',
              material_type: m.material_type || 'yarn',
              total_qty_for_wo: parseFloat(m.total_qty_for_wo),
              unit: m.unit || 'kg',
            }));
          // Attach process rates for this item if rate setup was enabled
          const rateKey = `${i.model_id}_${i.size_id}`;
          const rateRow = rateMatrix[rateKey] || {};
          const process_rates = ratesEnabled
            ? Object.entries(rateRow)
                .map(([procId, cell]) => ({
                  process_id: procId,
                  process_code: cell?.process_code || '',
                  rate: parseFloat(cell?.rate) || 0,
                  unit: cell?.unit || 'pcs',
                }))
                .filter(r => r.rate > 0)
            : [];
          return {
            model_id: i.model_id,
            size_id: i.size_id,
            qty: Number(i.qty),
            materials: mats.length > 0 ? mats : undefined,
            process_rates: process_rates.length > 0 ? process_rates : undefined,
          };
        });

      const payload = {
        is_internal: form.is_internal,
        customer_id: form.customer_id || null,
        order_date: form.order_date,
        due_date: form.due_date || null,
        items: cleanedItems,
        notes: form.notes,
        auto_release_wo: true,
        auto_generate_bundles: false,
      };

      const res = await fetch('/api/rahaza/wizard/start-production', {
        method: 'POST', headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }
      const result = await res.json();
      const bomMsg = result.wos?.filter(w => w.has_bom).length || 0;
      toast.success(
        `✅ Produksi dimulai! Order ${result.order_number} · ${result.wos_created} WO dibuat${bomMsg > 0 ? ` · ${bomMsg} BOM terbentuk` : ''}`
      );
      handleClose();
    } catch (e) {
      toast.error('Gagal memulai produksi: ' + e.message);
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setForm({
      is_internal: false,
      customer_id: '',
      order_date: new Date().toISOString().split('T')[0],
      due_date: '',
      items: [{ model_id: '', size_id: '', qty: '' }],
      notes: '',
    });
    setPreviewData(null);
    setMaterialInputs({});
    setConfirmed(false);
    setError('');
    setRateMatrix({});
    setRateProcs([]);
    setRatesEnabled(true);
    closeWizard();
  };

  if (!wizardOpen) {
    if (isGlobalMount) return null;
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shadow-[0_0_24px_hsl(var(--primary)/0.2)]">
          <Wand2 className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-display font-semibold text-foreground mb-2">Production Wizard</h2>
          <p className="text-muted-foreground text-sm max-w-md">
            Mulai produksi baru dengan cepat: isi data order, review WO, dan konfirmasi dalam 3 langkah.
          </p>
        </div>
        <div className="grid grid-cols-4 gap-3 text-left max-w-2xl w-full">
          {[
            { step: 1, icon: FileText, label: 'Data Order', desc: 'Isi customer, model, size, dan qty.' },
            { step: 2, icon: Package, label: 'Preview WO', desc: 'Review WO + input estimasi bahan jika belum ada BOM.' },
            { step: 3, icon: Coins, label: 'Rate Borongan', desc: 'Atur rate per item (model × size) per proses.' },
            { step: 4, icon: CheckCircle2, label: 'Konfirmasi', desc: 'Konfirmasi & mulai produksi. WO langsung di-release.' },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.step} className="rounded-[var(--radius-lg)] border border-border/50 bg-[var(--glass-bg)] p-4">
                <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-2">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <p className="text-xs font-semibold text-foreground mb-1">Step {s.step}: {s.label}</p>
                <p className="text-[11px] text-muted-foreground">{s.desc}</p>
              </div>
            );
          })}
        </div>
        <Button
          size="lg" className="gap-2 px-8 shadow-[var(--shadow-glow-blue)]"
          onClick={openWizard} data-testid="production-wizard-open-button"
        >
          <Wand2 className="w-5 h-5" /> Mulai Wizard Produksi
        </Button>
        <p className="text-xs text-muted-foreground">
          Atau gunakan tombol ✨ di pojok kanan bawah · Shortcut:{' '}
          <kbd className="px-1.5 py-0.5 rounded border border-border text-[10px] font-mono bg-[var(--glass-bg)]">Alt+I</kbd>
        </p>
      </div>
    );
  }

  if (!isGlobalMount) return null;

  return (
    <Dialog open={wizardOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[980px] max-h-[85vh] overflow-hidden flex flex-col" data-testid="production-wizard-dialog">
        <DialogHeader className="pb-2 border-b border-border/60">
          <DialogTitle className="text-xl font-display flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            Production Wizard
          </DialogTitle>
          <DialogDescription>
            Mulai produksi dengan 1 klik: Order → WO → Release
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 flex-1 overflow-hidden">
          <WizardStepper currentStep={step} />

          <div className="flex-1 overflow-y-auto pr-2 relative">
            {error && (
              <div className="bg-red-400/10 border border-red-300/20 rounded-lg p-3 mb-4 text-sm text-red-300">
                {error}
              </div>
            )}
            {step === 1 && (
              <Step1OrderData
                form={form} setForm={setForm}
                customers={customers} models={models} sizes={sizes}
                token={token} onModelsRefresh={handleModelsRefresh}
              />
            )}
            {step === 2 && (
              <Step2Preview
                previewData={previewData} loading={previewLoading}
                materialInputs={materialInputs} setMaterialInputs={setMaterialInputs}
                token={token} allMaterials={allMaterials} onNewMaterial={handleNewMaterial}
              />
            )}
            {step === 3 && (
              <Step3RateSetup
                form={form}
                previewData={previewData}
                models={models}
                sizes={sizes}
                rateProcs={rateProcs}
                rateMatrix={rateMatrix}
                setRateMatrix={setRateMatrix}
                ratesEnabled={ratesEnabled}
                setRatesEnabled={setRatesEnabled}
                loadingProcs={loadingProcs}
              />
            )}
            {step === 4 && (
              <Step4Confirm
                previewData={previewData}
                materialInputs={materialInputs}
                confirmed={confirmed} setConfirmed={setConfirmed}
                ratesEnabled={ratesEnabled}
                rateMatrix={rateMatrix}
              />
            )}
          </div>
        </div>

        <DialogFooter className="pt-3 border-t border-border/60">
          {step > 1 && (
            <Button variant="ghost" onClick={handleBack} disabled={submitting} data-testid="production-wizard-back-button">
              <ChevronLeft className="w-4 h-4 mr-1" /> Kembali
            </Button>
          )}
          <div className="flex-1" />
          {step < 4 && (
            <Button onClick={handleNext} disabled={previewLoading || loadingProcs} data-testid="production-wizard-next-button">
              Lanjut <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {step === 4 && (
            <Button
              onClick={handleSubmit}
              disabled={!confirmed || submitting}
              data-testid="production-wizard-confirm-button"
            >
              {submitting ? 'Memproses...' : 'Mulai Produksi'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
