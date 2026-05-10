/**
 * LineBoardModule — Compact Employee-First Production Board
 *
 * UX Flow:
 *   1. Pilih PO
 *   2. Board horizontal: kolom per proses
 *      - Header proses + total qty tersedia
 *      - Baris per karyawan assigned + tombol [+Input]
 *      - Tombol [+Karyawan]
 *   3. Modal input:
 *      - Operator: sudah terpilih (locked)
 *      - Pilih WO: dropdown/radio → tampil "Model · SKU/Size — Tersedia: X pcs"
 *      - Qty: lusin + pcs
 *      - Catatan (opsional)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, Plus, Lock, CheckCircle2, AlertTriangle,
  Package, BarChart3, RefreshCw, X, UserPlus, Loader2,
  Scissors, User, ArrowRight, ChevronRight, ClipboardCheck, Wrench,
  Camera, ImageOff,
} from 'lucide-react';
import LusinPcsInput from './LusinPcsInput';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL || '';

const PROCESS_FLOW = ['RAJUT', 'LINKING', 'SEWING_S1', 'SEWING_S2', 'SEWING_S3', 'STEAM', 'QC', 'PACKING'];
const SEWING_CODES = new Set(['SEWING_S1', 'SEWING_S2', 'SEWING_S3']);

// Color config — uses strong accent colors only on border/badge for dark mode compat
const PC = {
  RAJUT:     { border: 'border-violet-500',  badge: 'bg-violet-500',   text: 'text-violet-400 dark:text-violet-300',  dot: 'bg-violet-500' },
  LINKING:   { border: 'border-blue-500',    badge: 'bg-blue-500',     text: 'text-blue-400 dark:text-blue-300',      dot: 'bg-blue-500' },
  SEWING_S1: { border: 'border-pink-500',    badge: 'bg-pink-500',     text: 'text-pink-400 dark:text-pink-300',      dot: 'bg-pink-500' },
  SEWING_S2: { border: 'border-rose-500',    badge: 'bg-rose-500',     text: 'text-rose-400 dark:text-rose-300',      dot: 'bg-rose-500' },
  SEWING_S3: { border: 'border-red-500',     badge: 'bg-red-500',      text: 'text-red-400 dark:text-red-300',        dot: 'bg-red-500' },
  STEAM:     { border: 'border-cyan-500',    badge: 'bg-cyan-500',     text: 'text-cyan-400 dark:text-cyan-300',      dot: 'bg-cyan-500' },
  QC:        { border: 'border-amber-500',   badge: 'bg-amber-500',    text: 'text-amber-400 dark:text-amber-300',    dot: 'bg-amber-500' },
  PACKING:   { border: 'border-emerald-500', badge: 'bg-emerald-500',  text: 'text-emerald-400 dark:text-emerald-300',dot: 'bg-emerald-500' },
};

const pcOf = (code) => PC[code] || PC.RAJUT;

// ── Model Photo Card ────────────────────────────────────────────────────────
function ModelPhotoCard({ model, token }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [hasImage, setHasImage] = useState(model.has_image || false);
  const fileRef = useRef(null);

  // Try loading image on mount
  useEffect(() => {
    if (hasImage && model.id) {
      setImgSrc(`${API}/api/rahaza/models/${model.id}/image?t=${Date.now()}`);
    }
  }, [model.id, hasImage]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API}/api/rahaza/models/${model.id}/image-local`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setHasImage(true);
      setImgSrc(`${data.image_url}?t=${Date.now()}`);
      toast.success(`Foto model ${model.code} berhasil diupload`);
    } catch (e) {
      toast.error('Upload gagal: ' + e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0">
      <div
        className={`relative w-[56px] h-[64px] rounded-lg overflow-hidden border cursor-pointer group transition-all ${
          hasImage ? 'border-border' : 'border-dashed border-border/60 hover:border-primary/50'
        }`}
        onClick={() => !hasImage && fileRef.current?.click()}
        title={hasImage ? `${model.code} – ${model.name}` : `Upload foto untuk ${model.code}`}
      >
        {hasImage && imgSrc ? (
          <>
            <img
              src={imgSrc}
              alt={model.code}
              className="w-full h-full object-cover"
              onError={() => { setHasImage(false); setImgSrc(null); }}
            />
            {/* Overlay on hover to change photo */}
            <div
              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
              onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
            >
              <Camera className="w-4 h-4 text-white" />
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-muted/30">
            {uploading ? (
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            ) : (
              <>
                <ImageOff className="w-4 h-4 text-muted-foreground/50 mb-0.5" />
                <Camera className="w-3 h-3 text-primary/60" />
              </>
            )}
          </div>
        )}
      </div>
      <div className="text-center max-w-[64px]">
        <div className="text-[9px] font-semibold text-foreground truncate leading-tight">{model.code}</div>
        {model.size_name && (
          <div className="text-[8px] text-muted-foreground">{model.size_name}</div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  );
}

// ── Model Photos Strip ───────────────────────────────────────────────────────
function ModelPhotosStrip({ boardData, token }) {
  if (!boardData?.wos?.length) return null;

  // Deduplicate models (unique model_id + size_id combos)
  const uniqueModels = [];
  const seen = new Set();
  for (const wo of boardData.wos) {
    const key = `${wo.model_id}_${wo.size_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueModels.push({
        id: wo.model_id,
        code: wo.model_name || wo.wo_number,
        name: wo.model_name || '',
        size_name: wo.size_name || wo.size_id,
        has_image: wo.has_image || false,
      });
    }
  }
  if (!uniqueModels.length) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/10 border-b border-border overflow-x-auto">
      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
        <Camera className="w-3 h-3 inline mr-1" />Foto Produk:
      </span>
      <div className="flex items-end gap-3">
        {uniqueModels.map(m => (
          <ModelPhotoCard key={`${m.id}_${m.size_name}`} model={m} token={token} />
        ))}
      </div>
      <span className="text-[9px] text-muted-foreground/50 whitespace-nowrap shrink-0 ml-1">
        Klik foto/ikon kamera untuk upload
      </span>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function Bar({ value, total, dotClass }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${dotClass} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-muted-foreground tabular-nums">{value}/{total}</span>
    </div>
  );
}

// ── Employee row inside a process column ──────────────────────────────────────
/** Return "Dewi A." from "Dewi Anjani", or full name if single word */
function shortName(full = '') {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function EmpRow({ emp, availTotal, locked, onInput, onRemove }) {
  const displayName = shortName(emp.employee_name);
  const fullLabel   = `${emp.employee_name}${emp.employee_code ? ` · ${emp.employee_code}` : ''}`;
  return (
    <div className="flex items-center gap-1.5 py-1.5 px-2 rounded-lg hover:bg-muted/40 transition-colors group"
      data-testid={`emp-row-${emp.employee_id}`}
      title={fullLabel}>
      {/* Avatar */}
      <div className="w-6 h-6 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
        {(emp.employee_name?.[0] || '?').toUpperCase()}
      </div>
      {/* Name + code */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-foreground leading-tight truncate">{displayName}</p>
        {emp.employee_code && (
          <p className="text-[9px] text-muted-foreground/70 leading-none">{emp.employee_code}</p>
        )}
      </div>
      {/* Actions */}
      {locked ? (
        <Lock className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
      ) : (
        <button
          onClick={() => onInput(emp)}
          className="flex-shrink-0 flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-1 rounded-md
            bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          data-testid={`input-emp-${emp.employee_id}`}
          title={`Input produksi: ${emp.employee_name}`}
        >
          <Plus className="w-3 h-3" /> Input
        </button>
      )}
      <button
        onClick={() => onRemove(emp.assignment_id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive ml-0.5"
        title="Hapus karyawan dari proses ini"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Add Employee Dropdown ─────────────────────────────────────────────────────
function AddEmpDropdown({ orderId, processId, token, assignedIds, onAssigned }) {
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/rahaza/employees?limit=200`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEmployees(r.ok ? await r.json() : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [token]);

  useEffect(() => { if (open && employees.length === 0) load(); }, [open, employees.length, load]);

  const filtered = employees.filter(e => {
    if (assignedIds.includes(e.id)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return e.name?.toLowerCase().includes(q) || e.employee_code?.toLowerCase().includes(q);
  });

  async function assign(emp) {
    setError('');
    try {
      const r = await fetch(`${API}/api/rahaza/process-assignments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, process_id: processId, employee_id: emp.id }),
      });
      if (!r.ok) { const d = await r.json(); setError(d.detail || 'Gagal'); return; }
      setOpen(false); setSearch('');
      onAssigned();
    } catch { setError('Error jaringan'); }
  }

  return (
    <div className="relative mt-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-center gap-1 text-[10px] font-medium py-1.5 px-2
          rounded-lg border border-dashed border-border text-muted-foreground
          hover:border-primary hover:text-primary transition-colors"
        data-testid={`add-emp-${processId}`}
      >
        <UserPlus className="w-3 h-3" /> Tambah Karyawan
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-lg z-30 overflow-hidden"
          >
            <div className="p-2 border-b border-border">
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari nama / kode..."
                className="w-full text-xs border border-input rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            {error && <p className="text-[10px] text-destructive px-2 py-1">{error}</p>}
            <div className="max-h-40 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              ) : filtered.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-3 px-2">
                  {employees.length === 0 ? 'Belum ada data' : 'Tidak ditemukan'}
                </p>
              ) : filtered.map(emp => (
                <button key={emp.id} onClick={() => assign(emp)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors border-b border-border/40 last:border-0"
                  data-testid={`assign-emp-${emp.id}`}
                >
                  <p className="text-xs font-medium text-foreground">{emp.name}</p>
                  <p className="text-[10px] text-muted-foreground">{emp.employee_code} · {emp.job_title || '-'}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Process Column (single) ────────────────────────────────────────────────────
function ProcessCol({ proc, boardData, orderId, token, onInput, onRefresh, highlighted = false }) {
  const pcode = proc.code;
  const c = pcOf(pcode);
  const assigned = boardData?.assigned_employees || [];
  const woRows = boardData?.wo_rows || [];

  const totalAvail = woRows.reduce((s, r) => s + (!r.locked ? r.available : 0), 0);
  const totalInput = woRows.reduce((s, r) => s + r.this_process_input, 0);
  const totalQty = woRows.reduce((s, r) => s + r.wo_qty, 0);
  const allLocked = woRows.length > 0 && woRows.every(r => r.locked);

  async function removeEmp(aid) {
    try {
      await fetch(`${API}/api/rahaza/process-assignments/${aid}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      onRefresh();
    } catch { /* ignore */ }
  }

  return (
    <div
      className={`flex-shrink-0 w-48 flex flex-col rounded-xl border bg-card overflow-visible border-t-2 ${c.border}
        ${highlighted ? 'ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-background shadow-[0_0_16px_2px_hsl(var(--primary)/0.3)] animate-pulse-once' : ''}
      `}
      data-testid={`process-col-${pcode}`}
    >
      {/* Header */}
      <div className="px-3 pt-2.5 pb-2 border-b border-border">
        <div className="flex items-center gap-1.5 mb-1">
          <div className={`w-2 h-2 rounded-full ${c.dot} flex-shrink-0`} />
          <span className="text-xs font-bold text-foreground truncate">{proc.name}</span>
          {allLocked && <Lock className="w-3 h-3 text-muted-foreground ml-auto flex-shrink-0" />}
        </div>
        <Bar value={totalInput} total={totalQty} dotClass={c.dot} />
        <div className="flex justify-between mt-1">
          {totalAvail > 0 ? (
            <span className={`text-[9px] font-medium ${c.text}`}>
              {totalAvail} pcs tersedia
            </span>
          ) : (
            <span className="text-[9px] text-muted-foreground">
              {allLocked ? 'Menunggu proses sebelumnya' : 'Semua ter-input'}
            </span>
          )}
        </div>
      </div>

      {/* Employee list */}
      <div className="flex-1 px-2 pt-1.5 pb-2 space-y-0.5 overflow-visible">
        {assigned.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/60 text-center py-2 italic">
            Belum ada karyawan
          </p>
        ) : assigned.map(emp => (
          <EmpRow
            key={emp.assignment_id}
            emp={emp}
            availTotal={totalAvail}
            locked={allLocked || totalAvail === 0}
            onInput={(e) => onInput(e, proc, woRows)}
            onRemove={removeEmp}
          />
        ))}
        <AddEmpDropdown
          orderId={orderId}
          processId={proc.id}
          token={token}
          assignedIds={assigned.map(a => a.employee_id)}
          onAssigned={onRefresh}
        />
      </div>
    </div>
  );
}

// ── QC Column with Rework Badge (R5) ───────────────────────────────────────
function QCCol({ proc, boardData, orderId, token, onInput, onRefresh, onQcRework, highlighted = false }) {
  const pcode = proc.code;
  const c = pcOf(pcode);
  const assigned = boardData?.assigned_employees || [];
  const woRows = boardData?.wo_rows || [];

  const totalAvail = woRows.reduce((s, r) => s + (!r.locked ? r.available : 0), 0);
  const totalInput = woRows.reduce((s, r) => s + r.this_process_input, 0);
  const totalQty = woRows.reduce((s, r) => s + r.wo_qty, 0);
  const allLocked = woRows.length > 0 && woRows.every(r => r.locked);
  
  // R5: Calculate total pending rework
  const totalPendingRework = woRows.reduce((s, r) => s + (r.pending_rework_pcs || 0), 0);

  async function removeEmp(aid) {
    try {
      await fetch(`${API}/api/rahaza/process-assignments/${aid}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      onRefresh();
    } catch { /* ignore */ }
  }

  return (
    <div
      className={`flex-shrink-0 w-48 flex flex-col rounded-xl border bg-card overflow-visible border-t-2 ${c.border}
        ${highlighted ? 'ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-background shadow-[0_0_16px_2px_hsl(var(--primary)/0.3)] animate-pulse-once' : ''}
      `}
      data-testid={`process-col-${pcode}`}
    >
      {/* Header */}
      <div className="px-3 pt-2.5 pb-2 border-b border-border">
        <div className="flex items-center gap-1.5 mb-1">
          <div className={`w-2 h-2 rounded-full ${c.dot} flex-shrink-0`} />
          <span className="text-xs font-bold text-foreground truncate">{proc.name}</span>
          {allLocked && <Lock className="w-3 h-3 text-muted-foreground ml-auto flex-shrink-0" />}
          {/* R5: Pending Rework Badge */}
          {totalPendingRework > 0 && (
            <span className="ml-auto flex-shrink-0 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30"
              data-testid="pending-rework-badge"
              title="Pending rework pieces across all WOs">
              <AlertTriangle className="w-2.5 h-2.5" /> {totalPendingRework}
            </span>
          )}
        </div>
        <Bar value={totalInput} total={totalQty} dotClass={c.dot} />
        <div className="flex justify-between mt-1">
          {totalAvail > 0 ? (
            <span className={`text-[9px] font-medium ${c.text}`}>
              {totalAvail} pcs tersedia
            </span>
          ) : (
            <span className="text-[9px] text-muted-foreground">
              {allLocked ? 'Menunggu proses sebelumnya' : 'Semua ter-input'}
            </span>
          )}
          {/* R5: Rework action hint */}
          {totalPendingRework > 0 && (
            <button
              onClick={() => onQcRework && onQcRework('rework', woRows)}
              className="text-[9px] font-semibold text-red-400 hover:text-red-300 underline"
              data-testid="qc-rework-action"
              title="Process pending rework"
            >
              Proses Rework
            </button>
          )}
          {/* R5: QC Event button */}
          {totalAvail > 0 && (
            <button
              onClick={() => onQcRework && onQcRework('qc', woRows)}
              className="text-[9px] font-semibold text-amber-400 hover:text-amber-300 underline"
              data-testid="qc-event-action"
              title="Input QC pass/fail"
            >
              QC Event
            </button>
          )}
        </div>
      </div>

      {/* Employee list */}
      <div className="flex-1 px-2 pt-1.5 pb-2 space-y-0.5 overflow-visible">
        {assigned.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/60 text-center py-2 italic">
            Belum ada karyawan
          </p>
        ) : assigned.map(emp => (
          <EmpRow
            key={emp.assignment_id}
            emp={emp}
            availTotal={totalAvail}
            locked={allLocked || totalAvail === 0}
            onInput={(e) => onInput(e, proc, woRows)}
            onRemove={removeEmp}
          />
        ))}
        <AddEmpDropdown
          orderId={orderId}
          processId={proc.id}
          token={token}
          assignedIds={assigned.map(a => a.employee_id)}
          onAssigned={onRefresh}
        />
      </div>
    </div>
  );
}

// ── Sewing Group Column (S1, S2, S3 stacked) ─────────────────────────────────
function SewingGroupCol({ sewingProcs, boardData, orderId, token, onInput, onRefresh, highlighted = false }) {
  return (
    <div
      className={`flex-shrink-0 w-48 flex flex-col rounded-xl border border-t-2 border-pink-500 bg-card overflow-visible
        ${highlighted ? 'ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-background shadow-[0_0_16px_2px_hsl(var(--primary)/0.3)]' : ''}
      `}
      data-testid="process-col-SEWING"
    >
      {/* Group header */}
      <div className="px-3 pt-2.5 pb-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Scissors className="w-3.5 h-3.5 text-pink-400 dark:text-pink-300 flex-shrink-0" />
          <span className="text-xs font-bold text-foreground">SEWING</span>
          <span className="ml-auto text-[9px] text-muted-foreground">S1→S2→S3</span>
        </div>
      </div>

      {/* Sub-processes */}
      <div className="flex-1 divide-y divide-border overflow-visible">
        {sewingProcs.map((proc, idx) => {
          const pdata = boardData?.[proc.id];
          const c = pcOf(proc.code);
          const assigned = pdata?.assigned_employees || [];
          const woRows = pdata?.wo_rows || [];
          const totalAvail = woRows.reduce((s, r) => s + (!r.locked ? r.available : 0), 0);
          const totalInput = woRows.reduce((s, r) => s + r.this_process_input, 0);
          const totalQty = woRows.reduce((s, r) => s + r.wo_qty, 0);
          const allLocked = woRows.length > 0 && woRows.every(r => r.locked);

          async function removeEmp(aid) {
            try {
              await fetch(`${API}/api/rahaza/process-assignments/${aid}`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
              });
              onRefresh();
            } catch { /* ignore */ }
          }

          return (
            <div key={proc.id} className="px-2 pt-2 pb-1.5 overflow-visible">
              {/* Sub header */}
              <div className="flex items-center gap-1 mb-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                <span className={`text-[10px] font-bold ${c.text}`}>S{idx + 1}: {proc.name}</span>
                <span className="ml-auto text-[9px] text-muted-foreground">{totalInput}/{totalQty}</span>
              </div>
              {totalAvail > 0 && (
                <p className={`text-[9px] font-medium ${c.text} mb-1`}>{totalAvail} pcs tersedia</p>
              )}
              {/* Employees */}
              <div className="space-y-0.5 overflow-visible">
                {assigned.length === 0 ? (
                  <p className="text-[9px] text-muted-foreground/60 italic text-center py-1">Belum ada karyawan</p>
                ) : assigned.map(emp => (
                  <EmpRow
                    key={emp.assignment_id}
                    emp={emp}
                    availTotal={totalAvail}
                    locked={allLocked || totalAvail === 0}
                    onInput={(e) => onInput(e, proc, woRows)}
                    onRemove={removeEmp}
                  />
                ))}
                <AddEmpDropdown
                  orderId={orderId}
                  processId={proc.id}
                  token={token}
                  assignedIds={assigned.map(a => a.employee_id)}
                  onAssigned={onRefresh}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Input Modal (Employee-first + WO picker) ──────────────────────────────────
function InputModal({ open, onClose, employee, process, woRows, token, onSuccess }) {
  const [selectedWoId, setSelectedWoId] = useState('');
  const [qty, setQty] = useState(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Available WOs (not locked, available > 0)
  const availableWos = useMemo(() =>
    (woRows || []).filter(r => !r.locked && r.available > 0),
    [woRows]
  );

  useEffect(() => {
    if (open) {
      setQty(0); setNotes(''); setError('');
      // Auto-select if only 1 WO available
      if (availableWos.length === 1) {
        setSelectedWoId(availableWos[0].wo_id);
      } else {
        setSelectedWoId('');
      }
    }
  }, [open, availableWos]);

  if (!open || !employee || !process) return null;

  const selectedWo = availableWos.find(r => r.wo_id === selectedWoId);
  const maxQty = selectedWo?.available || 0;
  const c = pcOf(process.code);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedWoId) { setError('Pilih item (WO) terlebih dahulu'); return; }
    if (qty <= 0) { setError('Qty harus lebih dari 0'); return; }
    if (qty > maxQty) { setError(`Melebihi kapasitas tersedia (${maxQty} pcs)`); return; }
    setLoading(true); setError('');
    try {
      const lusin = Math.floor(qty / 12);
      const pcs_extra = qty % 12;
      const r = await fetch(`${API}/api/rahaza/lineboard/quick-output`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_order_id: selectedWoId,
          process_code: process.code,
          process_id: process.id,
          operator_id: employee.employee_id,
          lusin, pcs_extra, qty_pcs: qty,
          notes,
        }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.detail || 'Gagal simpan output'); setLoading(false); return; }
      onSuccess();
      onClose();
    } catch { setError('Error jaringan'); }
    setLoading(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && onClose()}
          data-testid="input-modal"
        >
          <motion.div
            initial={{ scale: 0.96, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 8 }}
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
          >
            {/* Header */}
            <div className={`px-5 py-4 border-b border-border border-l-4 ${c.border}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${c.badge}`}>
                      {process.name}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-foreground">Catat Output</h3>
                  {/* Operator info */}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[9px] font-bold flex items-center justify-center">
                      {employee.employee_name?.[0]?.toUpperCase()}
                    </div>
                    <span className="text-xs text-foreground font-medium">{employee.employee_name}</span>
                    {employee.employee_code && (
                      <span className="text-[10px] text-muted-foreground">· {employee.employee_code}</span>
                    )}
                  </div>
                </div>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors mt-0.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* WO / Item Selector */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2">
                  Pilih Item
                  <span className="ml-1 text-muted-foreground font-normal text-[10px]">({availableWos.length} tersedia)</span>
                </label>
                {availableWos.length === 0 ? (
                  <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Tidak ada item yang bisa di-input untuk proses ini</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {availableWos.map(wo => (
                      <button
                        key={wo.wo_id}
                        type="button"
                        onClick={() => { setSelectedWoId(wo.wo_id); setQty(0); }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all
                          ${selectedWoId === wo.wo_id
                            ? `border-primary bg-primary/10 ring-1 ring-primary/30`
                            : 'border-border bg-background hover:border-primary/40 hover:bg-muted/30'
                          }`}
                        data-testid={`wo-option-${wo.wo_id}`}
                      >
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            {wo.model_name || '—'}
                            {wo.size_name && <span className="ml-1.5 text-muted-foreground font-normal">· {wo.size_name}</span>}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{wo.wo_number}</p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <span className={`text-[11px] font-bold ${c.text}`}>{wo.available}</span>
                          <span className="text-[9px] text-muted-foreground ml-0.5">pcs</span>
                          {selectedWoId === wo.wo_id && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-1 ml-auto" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Qty input — show only after WO selected */}
              {selectedWo && (
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2">
                    Qty Output
                    <span className="ml-1 text-muted-foreground font-normal">(maks {maxQty} pcs)</span>
                  </label>
                  <LusinPcsInput value={qty} onChange={setQty} max={maxQty} />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Catatan (opsional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Keterangan..."
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-2.5 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 px-4 py-2.5 text-sm border border-border rounded-xl hover:bg-muted/50 transition-colors text-foreground">
                  Batal
                </button>
                <button type="submit"
                  disabled={loading || qty <= 0 || !selectedWoId}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl text-white bg-primary
                    hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="submit-output-btn"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Simpan'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── QC Event Modal ─────────────────────────────────────────────────────────────
function QCModal({ open, woRows, token, onClose, onSuccess }) {
  const [selectedWoId, setSelectedWoId] = useState('');
  const [qtyPass, setQtyPass] = useState(0);
  const [qtyFail, setQtyFail] = useState(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setSelectedWoId(''); setQtyPass(0); setQtyFail(0); setNotes(''); setError(''); }
  }, [open]);

  const selectedWo = woRows.find(w => w.wo_id === selectedWoId);
  const maxAvail = selectedWo ? (selectedWo.available || 0) : 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedWoId) return setError('Pilih Work Order terlebih dahulu.');
    if (qtyPass <= 0 && qtyFail <= 0) return setError('Minimal qty pass atau fail harus > 0.');
    if (qtyPass + qtyFail > maxAvail) return setError(`Total qty (${qtyPass + qtyFail}) melebihi tersedia (${maxAvail} pcs).`);
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/api/rahaza/execution/qc-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ work_order_id: selectedWoId, qty_pass: qtyPass, qty_fail: qtyFail, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Gagal menyimpan QC event');
      toast.success(`QC dicatat: Pass ${qtyPass} pcs · Fail ${qtyFail} pcs`);
      onSuccess();
      onClose();
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
          >
            {/* Header */}
            <div className="px-5 py-4 bg-amber-500/10 border-b border-amber-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                    <ClipboardCheck className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">QC Event</h2>
                    <p className="text-[10px] text-muted-foreground">Catat pass / fail per Work Order</p>
                  </div>
                </div>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* WO Selector */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2">
                  Pilih Work Order
                  <span className="ml-1 text-muted-foreground font-normal text-[10px]">({woRows.length} WO)</span>
                </label>
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {woRows.length === 0 ? (
                    <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border">
                      <Lock className="w-4 h-4 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Tidak ada item tersedia untuk QC</p>
                    </div>
                  ) : woRows.map(wo => (
                    <button key={wo.wo_id} type="button"
                      onClick={() => { setSelectedWoId(wo.wo_id); setQtyPass(0); setQtyFail(0); }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all
                        ${selectedWoId === wo.wo_id
                          ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30'
                          : 'border-border bg-background hover:border-amber-500/40 hover:bg-muted/30'
                        }`}
                      data-testid={`qc-wo-option-${wo.wo_id}`}
                    >
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          {wo.model_name || '—'}
                          {wo.size_name && <span className="ml-1.5 text-muted-foreground font-normal">· {wo.size_name}</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{wo.wo_number}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <span className="text-[11px] font-bold text-amber-400">{wo.available}</span>
                        <span className="text-[9px] text-muted-foreground ml-0.5">pcs</span>
                        {selectedWoId === wo.wo_id && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 mt-1 ml-auto" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedWo && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-green-400 mb-1.5">
                        Qty Pass <span className="font-normal text-muted-foreground">(pcs)</span>
                      </label>
                      <input type="number" min="0" max={maxAvail} value={qtyPass}
                        onChange={e => setQtyPass(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground
                          focus:outline-none focus:ring-2 focus:ring-green-500/40 tabular-nums"
                        data-testid="qc-qty-pass"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-red-400 mb-1.5">
                        Qty Fail <span className="font-normal text-muted-foreground">(pcs)</span>
                      </label>
                      <input type="number" min="0" max={maxAvail} value={qtyFail}
                        onChange={e => setQtyFail(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground
                          focus:outline-none focus:ring-2 focus:ring-red-500/40 tabular-nums"
                        data-testid="qc-qty-fail"
                      />
                    </div>
                  </div>
                  {(qtyPass > 0 || qtyFail > 0) && (
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-lg text-xs">
                      <span className="text-muted-foreground">Total</span>
                      <span className={`font-bold ${qtyPass + qtyFail > maxAvail ? 'text-destructive' : 'text-foreground'}`}>
                        {qtyPass + qtyFail} / {maxAvail} pcs
                      </span>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Catatan (opsional)</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Keterangan..."
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground
                    focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-2.5 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 px-4 py-2.5 text-sm border border-border rounded-xl hover:bg-muted/50 transition-colors text-foreground">
                  Batal
                </button>
                <button type="submit"
                  disabled={loading || (!qtyPass && !qtyFail) || !selectedWoId}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl text-white bg-amber-500
                    hover:bg-amber-500/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="submit-qc-btn"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Simpan QC'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


// ── Rework Modal ──────────────────────────────────────────────────────────────
function ReworkModal({ open, woRows, token, onClose, onSuccess }) {
  const [selectedWoId, setSelectedWoId] = useState('');
  const [qtyIn, setQtyIn] = useState(0);
  const [qtyOut, setQtyOut] = useState(0);
  const [qtyFail, setQtyFail] = useState(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Only show WOs with pending rework
  const reworkWos = woRows.filter(w => (w.pending_rework_pcs || 0) > 0);

  useEffect(() => {
    if (open) {
      setSelectedWoId(''); setQtyIn(0); setQtyOut(0); setQtyFail(0); setNotes(''); setError('');
    }
  }, [open]);

  const selectedWo = reworkWos.find(w => w.wo_id === selectedWoId);
  const maxIn = selectedWo ? (selectedWo.pending_rework_pcs || 0) : 0;
  const maxOut = Math.max(0, qtyIn - qtyFail);
  const maxFail = Math.max(0, qtyIn - qtyOut);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedWoId) return setError('Pilih Work Order terlebih dahulu.');
    if (qtyIn <= 0) return setError('Qty masuk rework harus lebih dari 0.');
    if (qtyOut <= 0 && qtyFail <= 0) return setError('Minimal qty keluar atau gagal harus > 0.');
    if (qtyOut + qtyFail > qtyIn) return setError(`Qty keluar (${qtyOut}) + gagal (${qtyFail}) melebihi qty masuk (${qtyIn}).`);
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/api/rahaza/execution/rework-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ work_order_id: selectedWoId, qty_in: qtyIn, qty_out: qtyOut, qty_fail: qtyFail, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Gagal menyimpan rework event');
      toast.success(`Rework dicatat: In ${qtyIn} · Pass ${qtyOut} · Fail ${qtyFail} pcs`);
      onSuccess();
      onClose();
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
          >
            {/* Header */}
            <div className="px-5 py-4 bg-red-500/10 border-b border-red-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                    <Wrench className="w-4 h-4 text-red-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">Proses Rework</h2>
                    <p className="text-[10px] text-muted-foreground">Input hasil rework per Work Order</p>
                  </div>
                </div>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* WO Selector */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2">
                  Pilih Work Order
                  <span className="ml-1 text-muted-foreground font-normal text-[10px]">
                    ({reworkWos.length} WO dengan pending rework)
                  </span>
                </label>
                {reworkWos.length === 0 ? (
                  <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <p className="text-xs text-muted-foreground">Tidak ada pending rework saat ini</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {reworkWos.map(wo => (
                      <button key={wo.wo_id} type="button"
                        onClick={() => { setSelectedWoId(wo.wo_id); setQtyIn(0); setQtyOut(0); setQtyFail(0); }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all
                          ${selectedWoId === wo.wo_id
                            ? 'border-red-500 bg-red-500/10 ring-1 ring-red-500/30'
                            : 'border-border bg-background hover:border-red-500/40 hover:bg-muted/30'
                          }`}
                        data-testid={`rework-wo-option-${wo.wo_id}`}
                      >
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            {wo.model_name || '—'}
                            {wo.size_name && <span className="ml-1.5 text-muted-foreground font-normal">· {wo.size_name}</span>}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{wo.wo_number}</p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <span className="text-[11px] font-bold text-red-400">{wo.pending_rework_pcs}</span>
                          <span className="text-[9px] text-muted-foreground ml-0.5">pcs pending</span>
                          {selectedWoId === wo.wo_id && <CheckCircle2 className="w-3.5 h-3.5 text-red-400 mt-1 ml-auto" />}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedWo && (
                <>
                  {/* Info: pending */}
                  <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs flex justify-between">
                    <span className="text-muted-foreground">Pending rework</span>
                    <span className="font-bold text-red-400">{maxIn} pcs</span>
                  </div>
                  {/* Inputs */}
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">
                      Qty Masuk Rework <span className="font-normal text-muted-foreground">(maks {maxIn} pcs)</span>
                    </label>
                    <input type="number" min="1" max={maxIn} value={qtyIn || ''}
                      onChange={e => { const v = Math.min(maxIn, Math.max(0, parseInt(e.target.value) || 0)); setQtyIn(v); setQtyOut(0); setQtyFail(0); }}
                      className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground
                        focus:outline-none focus:ring-2 focus:ring-primary/40 tabular-nums"
                      data-testid="rework-qty-in"
                    />
                  </div>
                  {qtyIn > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-green-400 mb-1.5">
                          Qty Keluar OK <span className="font-normal text-muted-foreground">(pcs)</span>
                        </label>
                        <input type="number" min="0" max={maxOut} value={qtyOut || ''}
                          onChange={e => setQtyOut(Math.min(maxOut + qtyFail - qtyFail, Math.max(0, parseInt(e.target.value) || 0)))}
                          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground
                            focus:outline-none focus:ring-2 focus:ring-green-500/40 tabular-nums"
                          data-testid="rework-qty-out"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-red-400 mb-1.5">
                          Qty Gagal/Scrap <span className="font-normal text-muted-foreground">(pcs)</span>
                        </label>
                        <input type="number" min="0" max={maxFail + qtyFail} value={qtyFail || ''}
                          onChange={e => setQtyFail(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground
                            focus:outline-none focus:ring-2 focus:ring-red-500/40 tabular-nums"
                          data-testid="rework-qty-fail"
                        />
                      </div>
                    </div>
                  )}
                  {qtyIn > 0 && (qtyOut > 0 || qtyFail > 0) && (
                    <div className={`px-3 py-2 rounded-lg text-xs flex justify-between
                      ${qtyOut + qtyFail > qtyIn ? 'bg-destructive/10 border border-destructive/20' : 'bg-muted/30'}`}>
                      <span className="text-muted-foreground">Total keluar + gagal</span>
                      <span className={`font-bold ${qtyOut + qtyFail > qtyIn ? 'text-destructive' : 'text-foreground'}`}>
                        {qtyOut + qtyFail} / {qtyIn} pcs
                      </span>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Catatan (opsional)</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Keterangan..."
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground
                    focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-2.5 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 px-4 py-2.5 text-sm border border-border rounded-xl hover:bg-muted/50 transition-colors text-foreground">
                  Batal
                </button>
                <button type="submit"
                  disabled={loading || qtyIn <= 0 || (qtyOut <= 0 && qtyFail <= 0) || !selectedWoId}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl text-white bg-red-500
                    hover:bg-red-500/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="submit-rework-btn"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Simpan Rework'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


// ── Main ──────────────────────────────────────────────────────────────────────
export default function LineBoardModule({ token }) {
  const [poList, setPoList]           = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [highlightProcess, setHighlightProcess] = useState(''); // D3: pre-highlight
  const [boardData, setBoardData]     = useState(null);
  const [processes, setProcesses]     = useState([]);
  const [loadingPo, setLoadingPo]     = useState(false);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [refreshKey, setRefreshKey]   = useState(0);
  const [modal, setModal] = useState({ open: false, employee: null, process: null, woRows: [] });
  const [qcModal, setQcModal] = useState({ open: false, woRows: [] });
  const [reworkModal, setReworkModal] = useState({ open: false, woRows: [] });

  // D3: Read preselect keys from sessionStorage (set by Dashboard navigation)
  useEffect(() => {
    const preOrderId   = sessionStorage.getItem('lineboard_preselect_order_id');
    const preProcess   = sessionStorage.getItem('lineboard_preselect_process_code');
    if (preOrderId) {
      setSelectedOrderId(preOrderId);
      sessionStorage.removeItem('lineboard_preselect_order_id');
    }
    if (preProcess) {
      setHighlightProcess(preProcess);
      sessionStorage.removeItem('lineboard_preselect_process_code');
      // Auto-clear highlight after 4s
      setTimeout(() => setHighlightProcess(''), 4000);
    }
  }, []);

  // Load PO list
  useEffect(() => {
    const load = async () => {
      setLoadingPo(true);
      try {
        const r = await fetch(`${API}/api/rahaza/lineboard/po-list`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = r.ok ? await r.json() : [];
        setPoList(data);
        if (data.length > 0 && !selectedOrderId) setSelectedOrderId(data[0].order_id);
      } catch { /* ignore */ }
      setLoadingPo(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, refreshKey]);

  // Load board for selected PO
  useEffect(() => {
    if (!selectedOrderId) return;
    const load = async () => {
      setLoadingBoard(true);
      try {
        const r = await fetch(`${API}/api/rahaza/lineboard/board/${selectedOrderId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = r.ok ? await r.json() : null;
        setBoardData(data);
        setProcesses(data?.processes?.filter(p => !p.is_rework) || []);
      } catch { /* ignore */ }
      setLoadingBoard(false);
    };
    load();
  }, [selectedOrderId, token, refreshKey]);

  const refresh = () => setRefreshKey(k => k + 1);

  function openModal(employee, proc, woRows) {
    setModal({ open: true, employee, process: proc, woRows });
  }
  function closeModal() {
    setModal({ open: false, employee: null, process: null, woRows: [] });
  }
  
  // R5: QC/Rework modal handler
  function handleQcRework(action, woRows) {
    if (action === 'qc') {
      setQcModal({ open: true, woRows: woRows || [] });
    } else if (action === 'rework') {
      setReworkModal({ open: true, woRows: woRows || [] });
    }
  }

  const order = boardData?.order;
  const board = boardData?.board || {};
  const nonSewing = processes.filter(p => !SEWING_CODES.has(p.code));
  const sewingProcs = processes.filter(p => SEWING_CODES.has(p.code));
  const hasSewing = sewingProcs.length > 0;

  const columnOrder = [
    ...nonSewing.filter(p => ['RAJUT', 'LINKING'].includes(p.code)),
    ...(hasSewing ? [{ _sewing: true }] : []),
    ...nonSewing.filter(p => ['STEAM', 'QC', 'PACKING'].includes(p.code)),
  ];

  return (
    <div className="h-full flex flex-col" data-testid="lineboard-module">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/60 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <BarChart3 className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">Production Board</h1>
            <p className="text-[10px] text-muted-foreground">Input per karyawan · per proses · per item</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loadingPo ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : (
            <div className="relative">
              <select
                value={selectedOrderId}
                onChange={e => setSelectedOrderId(e.target.value)}
                className="appearance-none pl-3 pr-7 py-1.5 text-xs border border-border rounded-xl
                  bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                data-testid="po-selector"
              >
                <option value="">-- Pilih PO --</option>
                {poList.map(po => (
                  <option key={po.order_id} value={po.order_id}>
                    {po.order_number} · {po.customer_name}
                    {' '}({po.wo_count} WO)
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            </div>
          )}
          <button onClick={refresh}
            className="p-1.5 rounded-xl border border-border hover:bg-muted/50 transition-colors"
            data-testid="refresh-btn">
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loadingBoard ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* PO summary strip */}
      {order && (
        <div className="flex items-center gap-4 px-4 py-2 bg-muted/20 border-b border-border text-[11px]">
          <span className="font-semibold text-foreground">{order.customer_name}</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground">Total: <span className="font-semibold text-foreground">{order.total_qty} pcs</span></span>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground">Deadline: <span className="font-semibold text-foreground">{order.delivery_date || '-'}</span></span>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground">Packing: <span className="font-semibold text-emerald-500">{order.packing_output} pcs</span></span>
          <div className="flex-1 flex items-center gap-2 ml-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, order.overall_pct)}%` }} />
            </div>
            <span className="font-bold text-primary text-[10px]">{order.overall_pct}%</span>
          </div>
        </div>
      )}

      {/* D3: "Came from Dashboard" hint banner when process is pre-highlighted */}
      {highlightProcess && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-[hsl(var(--primary)/0.08)] border-b border-[hsl(var(--primary)/0.20)] text-[10px] text-[hsl(var(--primary))]">
          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))] animate-pulse shrink-0" />
          <span>Dari Dashboard: proses <strong>{highlightProcess}</strong> ditandai sebagai bottleneck. Kolom tersebut disorot.</span>
        </div>
      )}

      {/* Model Photos Strip */}
      {selectedOrderId && boardData && (
        <ModelPhotosStrip boardData={boardData} token={token} />
      )}

      {/* Empty state */}
      {!selectedOrderId && !loadingPo && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <Package className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">Pilih PO untuk melihat board</p>
          <p className="text-xs text-muted-foreground">
            {poList.length === 0 ? 'Belum ada PO aktif' : `${poList.length} PO aktif tersedia`}
          </p>
        </div>
      )}

      {/* Board */}
      {selectedOrderId && (
        <div className="flex-1 overflow-auto p-4">
          {loadingBoard ? (
            <div className="flex items-center justify-center h-40 gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Memuat board...</span>
            </div>
          ) : (
            <div className="flex gap-3 min-w-max pb-4 items-start">
              {/* Flow arrow spacer */}
              {columnOrder.map((col, idx) => (
                <div key={col._sewing ? 'sewing' : col.id} className="flex items-start gap-3">
                  {/* Arrow between cols */}
                  {idx > 0 && (
                    <div className="flex-shrink-0 self-center mt-8">
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
                    </div>
                  )}
                  {col._sewing ? (
                    <SewingGroupCol
                      sewingProcs={sewingProcs}
                      boardData={board}
                      orderId={selectedOrderId}
                      token={token}
                      onInput={openModal}
                      onRefresh={refresh}
                      highlighted={
                        highlightProcess
                          ? sewingProcs.some(p => p.code === highlightProcess)
                          : false
                      }
                    />
                  ) : col.code === 'QC' ? (
                    <QCCol
                      proc={col}
                      boardData={board[col.id]}
                      orderId={selectedOrderId}
                      token={token}
                      onInput={openModal}
                      onRefresh={refresh}
                      onQcRework={handleQcRework}
                      highlighted={highlightProcess === col.code}
                    />
                  ) : (
                    <ProcessCol
                      proc={col}
                      boardData={board[col.id]}
                      orderId={selectedOrderId}
                      token={token}
                      onInput={openModal}
                      onRefresh={refresh}
                      highlighted={highlightProcess === col.code}
                    />
                  )}
                </div>
              ))}
              {columnOrder.length === 0 && (
                <p className="text-sm text-muted-foreground">Tidak ada proses aktif</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      {boardData && (
        <div className="flex items-center gap-4 px-4 py-1.5 border-t border-border bg-muted/10 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1"><Lock className="w-2.5 h-2.5" />Terkunci</span>
          <span className="flex items-center gap-1"><ArrowRight className="w-2.5 h-2.5" />Klik [+Input] di nama karyawan untuk mencatat output</span>
          <span className="flex items-center gap-1"><User className="w-2.5 h-2.5" />Output otomatis tercatat atas nama karyawan yang dipilih</span>
        </div>
      )}

      {/* Input Modal */}
      <InputModal
        open={modal.open}
        onClose={closeModal}
        employee={modal.employee}
        process={modal.process}
        woRows={modal.woRows}
        token={token}
        onSuccess={refresh}
      />

      {/* QC Event Modal */}
      <QCModal
        open={qcModal.open}
        woRows={qcModal.woRows}
        token={token}
        onClose={() => setQcModal({ open: false, woRows: [] })}
        onSuccess={refresh}
      />

      {/* Rework Modal */}
      <ReworkModal
        open={reworkModal.open}
        woRows={reworkModal.woRows}
        token={token}
        onClose={() => setReworkModal({ open: false, woRows: [] })}
        onSuccess={refresh}
      />
    </div>
  );
}
