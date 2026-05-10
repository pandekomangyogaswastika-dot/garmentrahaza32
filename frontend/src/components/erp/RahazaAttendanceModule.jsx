import { useState, useEffect, useCallback } from 'react';
import { Save, RefreshCw, Clock as ClockIcon, ChevronLeft, ChevronRight, Copy, CheckCircle2, UserCheck, UserX, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassCard, GlassInput } from '@/components/ui/glass';
import { PageHeader, StatTile, EmptyState } from './moduleAtoms';
import { toast } from 'sonner';

const STATUS_OPTS = [
  { code: 'hadir', label: 'Hadir',  color: 'text-emerald-400' },
  { code: 'izin',  label: 'Izin',   color: 'text-amber-400' },
  { code: 'sakit', label: 'Sakit',  color: 'text-orange-400' },
  { code: 'alfa',  label: 'Alfa',   color: 'text-red-400' },
  { code: 'cuti',  label: 'Cuti',   color: 'text-blue-400' },
  { code: 'libur', label: 'Libur',  color: 'text-slate-400' },
];

const ABSENT_STATUSES = [
  { code: 'sakit', label: 'Sakit' },
  { code: 'izin',  label: 'Izin' },
  { code: 'cuti',  label: 'Cuti' },
  { code: 'alpa',  label: 'Tidak Hadir (Alpa)' },
  { code: 'absen', label: 'Tidak Hadir' },
];

// ─── Phase 24E: format tanggal DD/MM/YYYY ─────────────────────────────
function formatDateID(isoDate) {
  if (!isoDate) return '-';
  const s = String(isoDate).slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function RahazaAttendanceModule({ token }) {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [defaultPresenting, setDefaultPresenting] = useState(false);
  const [showAbsentModal, setShowAbsentModal] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchGrid = useCallback(async (d = date) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/rahaza/attendance/grid?date=${d}`, { headers });
      if (r.ok) {
        const data = await r.json();
        setRows(data.rows || []);
        setShifts(data.shifts || []);
      }
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, token]);

  useEffect(() => { fetchGrid(); }, [fetchGrid]);

  const changeDate = (newDate) => {
    setDate(newDate);
  };

  const update = (empId, patch) => setRows(prev => prev.map(r => r.employee_id === empId ? { ...r, ...patch } : r));
  const setAll = (status) => setRows(prev => prev.map(r => ({ ...r, status })));

  /* ─── Phase 24D: Hadirkan Semua (Default Present) ─── */
  const hadirkanSemuaDefault = async () => {
    if (!window.confirm(`Generate default HADIR untuk SEMUA karyawan aktif pada tanggal ${formatDateID(date)}?\n\nKaryawan yang sudah ada record-nya akan di-skip.`)) return;
    setDefaultPresenting(true);
    try {
      const res = await fetch(`/api/rahaza/attendance/default-present`, {
        method: 'POST', headers,
        body: JSON.stringify({ date, default_hours: 8 }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`✓ ${data.created} karyawan ditandai HADIR (${data.skipped} sudah ada). Total: ${data.total_employees} karyawan aktif.`);
        fetchGrid();
      } else {
        toast.error(data.detail || 'Gagal generate hadir massal');
      }
    } catch (e) {
      toast.error('Error: ' + e.message);
    }
    setDefaultPresenting(false);
  };

  /* Salin Kemarin — load yesterday's grid and pre-populate today's */
  const salinKemarin = async () => {
    const yesterday = addDays(date, -1);
    setCopying(true);
    try {
      const r = await fetch(`/api/rahaza/attendance/grid?date=${yesterday}`, { headers });
      if (!r.ok) { toast.error('Gagal memuat absensi kemarin.'); return; }
      const data = await r.json();
      const yesterdayMap = {};
      (data.rows || []).forEach(row => { yesterdayMap[row.employee_id] = row; });
      setRows(prev => prev.map(row => {
        const y = yesterdayMap[row.employee_id];
        if (!y) return row;
        return { ...row, status: y.status || 'hadir', shift_id: y.shift_id || '', hours_worked: y.hours_worked || 0, overtime_hours: y.overtime_hours || 0 };
      }));
      const copied = Object.keys(yesterdayMap).length;
      toast.success(`${copied} absensi dari ${formatDateID(yesterday)} berhasil disalin sebagai template. Simpan untuk konfirmasi.`);
    } finally { setCopying(false); }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      // Backend expects 'rows' key (see _build_att_doc and bulk_attendance)
      const body = {
        rows: rows.map(r => ({
          employee_id: r.employee_id,
          date,
          status: r.status || 'hadir',
          shift_id: r.shift_id || null,
          hours_worked: Number(r.hours_worked) || 0,
          overtime_hours: Number(r.overtime_hours) || 0,
          notes: r.notes || '',
        })),
      };
      const res = await fetch('/api/rahaza/attendance/bulk', {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success('Absensi berhasil disimpan.');
        fetchGrid();
      } else {
        toast.error('Gagal menyimpan absensi.');
      }
    } finally { setSaving(false); }
  };

  const counts = rows.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  const totalHours = rows.reduce((s, r) => s + (Number(r.hours_worked) || 0), 0);
  const totalOT = rows.reduce((s, r) => s + (Number(r.overtime_hours) || 0), 0);
  const isToday = date === today;

  return (
    <div className="space-y-5" data-testid="rahaza-attendance-page">
      <PageHeader
        testId="attendance-header"
        icon={ClockIcon}
        eyebrow="Portal SDM"
        title="Absensi Harian"
        subtitle="Default semua karyawan HADIR. Admin tinggal tandai yang tidak hadir. Format tanggal: DD/MM/YYYY."
        actions={
          <>
            {/* ─── Navigasi Harian: ← tanggal → ─── */}
            <div className="flex items-center gap-1 border border-[var(--glass-border)] rounded-lg overflow-hidden bg-[var(--glass-bg)]">
              <button
                onClick={() => changeDate(addDays(date, -1))}
                className="h-9 w-9 grid place-items-center text-foreground/60 hover:text-foreground hover:bg-[var(--glass-bg-hover)] transition-colors"
                title="Hari sebelumnya"
                data-testid="att-prev-day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <GlassInput
                type="date"
                value={date}
                onChange={e => changeDate(e.target.value)}
                className="h-9 w-40 border-0 rounded-none bg-transparent"
                data-testid="att-date"
                title={formatDateID(date)}
              />
              <button
                onClick={() => changeDate(addDays(date, 1))}
                disabled={date >= today}
                className="h-9 w-9 grid place-items-center text-foreground/60 hover:text-foreground hover:bg-[var(--glass-bg-hover)] transition-colors disabled:opacity-40"
                title="Hari berikutnya"
                data-testid="att-next-day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* ─── Phase 24D: Hadirkan Semua (Default) ─── */}
            <Button
              variant="ghost"
              className="h-9 border border-emerald-400/30 bg-emerald-400/10 text-emerald-700 hover:bg-emerald-400/20 gap-1.5"
              onClick={hadirkanSemuaDefault}
              disabled={defaultPresenting || loading}
              title="Generate record HADIR untuk semua karyawan aktif yang belum ada record di tanggal ini"
              data-testid="att-default-present"
            >
              <UserCheck className="w-3.5 h-3.5" />
              {defaultPresenting ? 'Generating...' : 'Hadirkan Semua'}
            </Button>

            {/* ─── Tandai Tidak Hadir Massal ─── */}
            <Button
              variant="ghost"
              className="h-9 border border-red-400/30 bg-red-400/10 text-red-700 hover:bg-red-400/20 gap-1.5"
              onClick={() => setShowAbsentModal(true)}
              data-testid="att-mark-absent"
            >
              <UserX className="w-3.5 h-3.5" />
              Tandai Tidak Hadir
            </Button>

            {/* Salin Kemarin */}
            <Button
              variant="ghost"
              className="h-9 border border-[var(--glass-border)] gap-1.5"
              onClick={salinKemarin}
              disabled={copying || loading}
              title="Salin absensi dari hari sebelumnya sebagai template"
              data-testid="att-copy-yesterday"
            >
              <Copy className="w-3.5 h-3.5" />
              {copying ? 'Menyalin...' : 'Salin Kemarin'}
            </Button>

            <Button variant="ghost" className="h-9 border border-[var(--glass-border)]" onClick={() => fetchGrid()} data-testid="att-refresh">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Muat Ulang
            </Button>
            <Button onClick={saveAll} disabled={saving || rows.length === 0} className="h-9 gap-1.5" data-testid="attendance-save">
              {saving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Menyimpan...</> : <><Save className="w-3.5 h-3.5" />Simpan Semua</>}
            </Button>
          </>
        }
      />

      {!isToday && (
        <div className="flex items-center justify-between bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-2">
          <span className="text-xs text-amber-400">Menampilkan absensi historis untuk <strong>{formatDateID(date)}</strong>. Perubahan akan menimpa data yang sudah ada.</span>
          <button onClick={() => changeDate(today)} className="text-xs text-amber-400 underline hover:no-underline">Kembali ke hari ini</button>
        </div>
      )}

      {/* Status counters */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {STATUS_OPTS.map(s => (
          <StatTile key={s.code} label={s.label} value={counts[s.code] || 0} accent={
            s.code === 'hadir' ? 'success' : s.code === 'alfa' ? 'danger' : s.code === 'libur' ? 'muted' : 'primary'
          } testId={`att-count-${s.code}`} />
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatTile label="Total Karyawan" value={rows.length} accent="primary" />
        <StatTile label="Total Jam Kerja" value={totalHours.toFixed(1)} suffix="jam" accent="default" />
        <StatTile label="Total Lembur" value={totalOT.toFixed(1)} suffix="jam" accent="warning" />
        <StatTile label="Tanggal" value={formatDateID(date)} accent="muted" testId="att-current-date" />
      </div>

      {/* Quick-set chips */}
      <GlassCard className="p-3" hover={false}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-foreground/60 font-medium">Set cepat semua →</span>
          {STATUS_OPTS.map(s => (
            <button key={s.code}
              onClick={() => setAll(s.code)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] ${s.color} transition-colors duration-150`}
              data-testid={`att-setall-${s.code}`}
            >{s.label}</button>
          ))}
          <div className="w-px h-4 bg-[var(--glass-border)] mx-1" />
          <button
            onClick={() => { setAll('hadir'); saveAll(); }}
            className="px-3 py-1 rounded-full text-[11px] font-semibold border border-emerald-400/30 bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 transition-colors duration-150 flex items-center gap-1"
            data-testid="att-setall-hadir-save"
            title="Set semua Hadir dan langsung simpan"
          >
            <CheckCircle2 className="w-3 h-3" /> Tandai Hadir & Simpan
          </button>
        </div>
      </GlassCard>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-9 w-9 border-b-2 border-[hsl(var(--primary))]" /></div>
      ) : rows.length === 0 ? (
        <GlassCard hover={false} className="p-0"><EmptyState icon={ClockIcon} title="Belum ada karyawan aktif" description="Tambahkan master karyawan terlebih dahulu untuk input absensi." /></GlassCard>
      ) : (
        <GlassCard className="p-0 overflow-hidden" hover={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--glass-bg)]">
                <tr className="text-left text-[10px] uppercase tracking-wider text-foreground/50">
                  <th className="px-4 py-3">Karyawan</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Shift</th>
                  <th className="px-3 py-3 text-right">Jam Kerja</th>
                  <th className="px-3 py-3 text-right">Lembur</th>
                  <th className="px-3 py-3">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.employee_id} className="border-t border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] transition-colors" data-testid={`att-row-${r.employee_code}`}>
                    <td className="px-4 py-2">
                      <div className="font-mono text-xs text-foreground">{r.employee_code}</div>
                      <div className="text-xs text-foreground/60">{r.employee_name}</div>
                    </td>
                    <td className="px-3 py-2">
                      <select value={r.status || 'hadir'} onChange={e => update(r.employee_id, { status: e.target.value })} className="h-8 px-2 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-xs text-foreground">
                        {STATUS_OPTS.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select value={r.shift_id || ''} onChange={e => update(r.employee_id, { shift_id: e.target.value })} className="h-8 px-2 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-xs text-foreground">
                        <option value="">—</option>
                        {shifts.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={0} step="0.5" value={r.hours_worked || 0} onChange={e => update(r.employee_id, { hours_worked: e.target.value })} className="w-20 h-8 px-2 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-xs text-foreground text-right font-mono" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={0} step="0.5" value={r.overtime_hours || 0} onChange={e => update(r.employee_id, { overtime_hours: e.target.value })} className="w-20 h-8 px-2 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-xs text-foreground text-right font-mono" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={r.notes || ''} onChange={e => update(r.employee_id, { notes: e.target.value })} placeholder="—" className="w-full h-8 px-2 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-xs text-foreground" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* ─── Phase 24D: Modal Tandai Tidak Hadir Massal ─── */}
      {showAbsentModal && (
        <MarkAbsentModal
          rows={rows}
          date={date}
          token={token}
          onClose={() => setShowAbsentModal(false)}
          onDone={() => { setShowAbsentModal(false); fetchGrid(); }}
        />
      )}
    </div>
  );
}

// ─── Phase 24D: MarkAbsentModal ──────────────────────────────────────
function MarkAbsentModal({ rows, date, token, onClose, onDone }) {
  const [selected, setSelected] = useState(new Set());
  const [status, setStatus] = useState('sakit');
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const filtered = rows.filter(r =>
    !filter || (r.employee_code || '').toLowerCase().includes(filter.toLowerCase()) ||
    (r.employee_name || '').toLowerCase().includes(filter.toLowerCase())
  );

  const toggle = (id) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };
  const selectAll = () => setSelected(new Set(filtered.map(r => r.employee_id)));
  const clearAll = () => setSelected(new Set());

  const submit = async () => {
    if (selected.size === 0) { toast.error('Pilih minimal 1 karyawan'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rahaza/attendance/mark-absent`, {
        method: 'POST', headers,
        body: JSON.stringify({
          date, employee_ids: Array.from(selected), status, notes,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`✓ ${selected.size} karyawan ditandai ${status} pada ${formatDateID(date)} (${data.updated} update, ${data.created} new).`);
        onDone();
      } else {
        toast.error(data.detail || 'Gagal mark absent');
      }
    } catch (e) { toast.error(e.message); }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose} data-testid="mark-absent-modal">
      <GlassCard className="p-6 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <UserX className="w-5 h-5 text-red-500" />
              Tandai Tidak Hadir Massal
            </h2>
            <p className="text-xs text-muted-foreground">Tanggal: <span className="font-semibold">{formatDateID(date)}</span></p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-black/10 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3 flex-shrink-0">
          <div>
            <label className="text-xs text-muted-foreground uppercase block mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="w-full h-9 px-2 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-sm" data-testid="absent-modal-status">
              {ABSENT_STATUSES.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase block mb-1">Catatan</label>
            <GlassInput value={notes} onChange={e => setNotes(e.target.value)} placeholder="opsional, mis. demam tinggi" className="h-9" data-testid="absent-modal-notes" />
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2 flex-shrink-0">
          <GlassInput value={filter} onChange={e => setFilter(e.target.value)} placeholder="Cari karyawan…" className="flex-1 h-8 text-xs" data-testid="absent-modal-filter" />
          <button onClick={selectAll} className="text-xs text-primary hover:brightness-110 px-2" data-testid="absent-modal-select-all">Pilih Semua ({filtered.length})</button>
          <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground px-2">Bersihkan</button>
        </div>

        <div className="flex-1 overflow-y-auto border border-[var(--glass-border)] rounded-lg bg-[var(--glass-bg)]">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Tidak ada karyawan.</div>
          ) : (
            <ul className="divide-y divide-[var(--glass-border)]">
              {filtered.map(r => (
                <li key={r.employee_id} className={`flex items-center gap-2 px-3 py-2 hover:bg-[var(--glass-bg-hover)] cursor-pointer ${selected.has(r.employee_id) ? 'bg-red-50/30' : ''}`} onClick={() => toggle(r.employee_id)} data-testid={`absent-emp-${r.employee_code}`}>
                  <input type="checkbox" checked={selected.has(r.employee_id)} onChange={() => toggle(r.employee_id)} className="accent-red-500" />
                  <span className="font-mono text-xs text-foreground/80">{r.employee_code}</span>
                  <span className="text-sm text-foreground flex-1">{r.employee_name}</span>
                  {r.status && r.status !== 'hadir' && (
                    <span className="text-[10px] uppercase text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2">{r.status}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-4 flex-shrink-0">
          <span className="text-xs text-muted-foreground"><Sparkles className="w-3 h-3 inline mr-1" />{selected.size} karyawan terpilih</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={submitting} className="border border-[var(--glass-border)]">Batal</Button>
            <Button onClick={submit} disabled={submitting || selected.size === 0} className="bg-red-600 hover:bg-red-700" data-testid="absent-modal-submit">
              {submitting ? 'Memproses...' : `Tandai ${selected.size} Karyawan`}
            </Button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
