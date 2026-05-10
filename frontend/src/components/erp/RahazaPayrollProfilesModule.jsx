import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, RefreshCw, Wallet, Users, UserCog, Sparkles } from 'lucide-react';
import { GlassCard, GlassPanel, GlassInput } from '@/components/ui/glass';
import { Button } from '@/components/ui/button';
import { PageHeader, StatTile, EmptyState } from './moduleAtoms';

const SCHEMES = [
  { code: 'pcs', label: 'Borongan Pcs', color: 'text-emerald-300' },
  { code: 'daily', label: 'Harian per Proses×Size', color: 'text-violet-300' },
  { code: 'hourly', label: 'Borongan Jam', color: 'text-blue-300' },
  { code: 'weekly', label: 'Mingguan', color: 'text-amber-300' },
  { code: 'monthly', label: 'Bulanan', color: 'text-primary' },
];
const SCHEME_META = Object.fromEntries(SCHEMES.map(s => [s.code, s]));

const PERIOD_TYPES = [
  { code: 'weekly', label: 'Mingguan' },
  { code: 'monthly', label: 'Bulanan' },
];

const UNITS = [
  { value: 'pcs', label: 'pcs' },
  { value: 'lusin', label: 'lusin' },
];

const WEEK_DAYS = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];

export default function RahazaPayrollProfilesModule({ token }) {
  const [profiles, setProfiles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, e, pr, sz] = await Promise.all([
        fetch('/api/rahaza/payroll-profiles', { headers }).then(r => r.json()),
        fetch('/api/rahaza/employees', { headers }).then(r => r.json()),
        fetch('/api/rahaza/processes', { headers }).then(r => r.json()),
        fetch('/api/rahaza/sizes?active=true&limit=200', { headers }).then(r => r.ok ? r.json() : []),
      ]);
      setProfiles(Array.isArray(p) ? p : []);
      setEmployees(Array.isArray(e) ? e : []);
      setProcesses(Array.isArray(pr) ? pr : []);
      setSizes(Array.isArray(sz) ? sz : []);
    } catch { setError('Gagal memuat data'); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const save = async (body) => {
    setError('');
    const r = await fetch('/api/rahaza/payroll-profiles', { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) { setError(`Gagal simpan (HTTP ${r.status})`); return; }
    setEditing(null); fetchAll();
  };

  const del = async (id) => {
    if (!window.confirm('Hapus profile payroll ini?')) return;
    const r = await fetch(`/api/rahaza/payroll-profiles/${id}`, { method: 'DELETE', headers });
    if (r.ok) fetchAll(); else setError(`Gagal hapus (HTTP ${r.status})`);
  };

  const empsWithoutProfile = employees.filter(e => e.active && !profiles.some(p => p.employee_id === e.id));

  return (
    <div className="space-y-5" data-testid="rahaza-payroll-profiles-page">
      <PageHeader
        icon={UserCog}
        eyebrow="Portal SDM · Penggajian"
        title="Profil Gaji Karyawan"
        subtitle="Konfigurasi skema payroll, periode, dan rate per pegawai. Skema 'Harian per Proses×Size' mendukung rate berbeda per ukuran (Linking, Steam, Sewing dll)."
        actions={
          <>
            <Button variant="ghost" onClick={fetchAll} className="h-9 border border-[var(--glass-border)]" data-testid="pp-refresh"><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh</Button>
            <Button onClick={() => setEditing({ employee_id: '', pay_scheme: 'pcs', period_type: 'monthly', base_rate: 0, overtime_rate: 0, cutoff_config: {}, pcs_process_rates: [], daily_rates_matrix: [], daily_default_unit: 'pcs', daily_lusin_size: 12 })} className="h-9" data-testid="pp-add"><Plus className="w-3.5 h-3.5 mr-1.5" /> Tambah Profil</Button>
          </>
        }
      />

      {error && <div className="bg-[hsl(var(--destructive)/0.12)] border border-[hsl(var(--destructive)/0.22)] rounded-lg p-3 text-sm text-[hsl(var(--destructive))]">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <StatTile label="Total Profile" value={profiles.length} accent="primary" testId="pp-count-total" />
        {SCHEMES.map(s => {
          const n = profiles.filter(p => p.pay_scheme === s.code).length;
          return <StatTile key={s.code} label={s.label} value={n} accent={s.code === 'pcs' ? 'success' : s.code === 'monthly' ? 'primary' : 'default'} />;
        })}
      </div>

      {empsWithoutProfile.length > 0 && (
        <div className="bg-[hsl(var(--warning)/0.10)] border border-[hsl(var(--warning)/0.22)] rounded-lg p-3 text-sm text-[hsl(var(--warning))] flex items-center gap-2">
          <Users className="w-3.5 h-3.5" />
          {empsWithoutProfile.length} pegawai aktif belum punya profile payroll.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" /></div>
      ) : (
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--glass-bg)]">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3">Karyawan</th>
                  <th className="px-3 py-3">Skema</th>
                  <th className="px-3 py-3">Periode</th>
                  <th className="px-3 py-3 text-right">Tarif Dasar</th>
                  <th className="px-3 py-3 text-right">Tarif Lembur</th>
                  <th className="px-3 py-3">Rate Detail</th>
                  <th className="px-3 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {profiles.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Belum ada profile. Tekan "Tambah Profile".</td></tr>
                ) : profiles.map(p => {
                  const sm = SCHEME_META[p.pay_scheme] || SCHEMES[3];
                  const rateDetail = p.pay_scheme === 'daily'
                    ? `${(p.daily_rates_matrix || []).length} matrix · 1 lusin = ${p.daily_lusin_size || 12} pcs`
                    : (() => {
                        const rates = p.pcs_process_rates || [];
                        if (rates.length === 0) return '—';
                        const hourly = rates.filter(r => r.scheme === 'hourly').map(r => r.process_code);
                        const pcs    = rates.filter(r => r.scheme !== 'hourly').map(r => r.process_code);
                        const parts = [];
                        if (hourly.length) parts.push(`Jam: ${hourly.join(', ')}`);
                        if (pcs.length)    parts.push(`Pcs: ${pcs.join(', ')}`);
                        return parts.join(' | ') || `${rates.length} proses`;
                      })();
                  return (
                    <tr key={p.id} className="border-t border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)]" data-testid={`pp-row-${p.employee_code}`}>
                      <td className="px-4 py-2">
                        <div className="font-mono text-xs text-foreground">{p.employee_code}</div>
                        <div className="text-xs text-muted-foreground">{p.employee_name}</div>
                      </td>
                      <td className="px-3 py-2"><span className={`text-xs font-semibold ${sm.color}`}>{sm.label}</span></td>
                      <td className="px-3 py-2 text-xs text-foreground">{p.period_type === 'weekly' ? `Mingguan (${WEEK_DAYS[p.cutoff_config?.week_start_day ?? 1]} start)` : `Bulanan (start day ${p.cutoff_config?.start_day ?? 1})`}</td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">Rp {Number(p.base_rate || 0).toLocaleString('id-ID')}</td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">Rp {Number(p.overtime_rate || 0).toLocaleString('id-ID')}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{rateDetail}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => setEditing({ ...p, daily_rates_matrix: p.daily_rates_matrix || [], daily_default_unit: p.daily_default_unit || 'pcs', daily_lusin_size: p.daily_lusin_size || 12 })} className="inline-flex items-center text-xs text-primary hover:underline mr-3" data-testid={`pp-edit-${p.employee_code}`}><Edit2 className="w-3 h-3 mr-1" />Ubah</button>
                        <button onClick={() => del(p.id)} className="inline-flex items-center text-xs text-red-300 hover:underline" data-testid={`pp-del-${p.employee_code}`}><Trash2 className="w-3 h-3 mr-1" />Hapus</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {editing && (
        <ProfileEditor
          profile={editing}
          employees={employees}
          processes={processes}
          sizes={sizes}
          isNew={!editing.id}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

function ProfileEditor({ profile, employees, processes, sizes, isNew, onClose, onSave }) {
  const [state, setState] = useState(profile);
  useEffect(() => setState(profile), [profile]);
  const update = (k, v) => setState(s => ({ ...s, [k]: v }));
  const updateCutoff = (k, v) => setState(s => ({ ...s, cutoff_config: { ...(s.cutoff_config || {}), [k]: v } }));

  // ─── pcs_process_rates handlers ───
  const addProcRate = () => {
    const defaultScheme = (state.pay_scheme === 'hourly') ? 'hourly' : 'pcs';
    const defaultUnit   = defaultScheme === 'hourly' ? 'jam' : 'pcs';
    setState(s => ({ ...s, pcs_process_rates: [...(s.pcs_process_rates || []), { process_id: '', process_code: '', scheme: defaultScheme, rate: 0, unit: defaultUnit }] }));
  };
  const removeProcRate = (i) => setState(s => ({ ...s, pcs_process_rates: s.pcs_process_rates.filter((_, idx) => idx !== i) }));
  const updateProcRate = (i, k, v) => setState(s => ({
    ...s,
    pcs_process_rates: s.pcs_process_rates.map((r, idx) => {
      if (idx !== i) return r;
      const updated = { ...r, [k]: v };
      // Auto-set unit when scheme changes
      if (k === 'scheme') updated.unit = v === 'hourly' ? 'jam' : 'pcs';
      return updated;
    }),
  }));

  // ─── daily_rates_matrix handlers ───
  const addMatrixRow = () => {
    setState(s => ({ ...s, daily_rates_matrix: [...(s.daily_rates_matrix || []), { process_id: '', process_code: '', size_id: '', size_label: '', rate: 0, unit: s.daily_default_unit || 'pcs' }] }));
  };
  const removeMatrixRow = (i) => setState(s => ({ ...s, daily_rates_matrix: s.daily_rates_matrix.filter((_, idx) => idx !== i) }));
  const updateMatrixRow = (i, k, v) => setState(s => ({ ...s, daily_rates_matrix: s.daily_rates_matrix.map((r, idx) => idx === i ? { ...r, [k]: v } : r) }));

  // Quick action: bulk-add rows for selected processes × all sizes
  const quickFillMatrix = (processIds) => {
    const rows = [];
    processIds.forEach(pid => {
      const p = processes.find(x => x.id === pid);
      if (!p) return;
      // Add row "All sizes"
      rows.push({ process_id: pid, process_code: p.code, size_id: '', size_label: 'All', rate: 0, unit: state.daily_default_unit || 'pcs' });
      // Then per size
      sizes.forEach(s => rows.push({ process_id: pid, process_code: p.code, size_id: s.id, size_label: s.code || s.name, rate: 0, unit: state.daily_default_unit || 'pcs' }));
    });
    setState(s => ({ ...s, daily_rates_matrix: [...(s.daily_rates_matrix || []), ...rows] }));
  };

  const submit = () => {
    if (!state.employee_id) { alert('Pilih karyawan dulu'); return; }
    onSave({
      employee_id: state.employee_id,
      pay_scheme: state.pay_scheme,
      period_type: state.period_type,
      cutoff_config: state.cutoff_config || {},
      base_rate: Number(state.base_rate) || 0,
      overtime_rate: Number(state.overtime_rate) || 0,
      pcs_process_rates: (state.pcs_process_rates || []).filter(r => r.process_id),
      daily_rates_matrix: (state.daily_rates_matrix || []).filter(r => r.process_id),
      daily_default_unit: state.daily_default_unit || 'pcs',
      daily_lusin_size: Number(state.daily_lusin_size) || 12,
      notes: state.notes || '',
    });
  };

  // Helper to compute rate label dynamically
  const rateLabel = state.pay_scheme === 'pcs' ? 'pcs/lusin'
                  : state.pay_scheme === 'hourly' ? 'jam'
                  : state.pay_scheme === 'weekly' ? 'minggu'
                  : state.pay_scheme === 'monthly' ? 'bulan'
                  : state.pay_scheme === 'daily' ? 'unit (sesuai matrix)'
                  : 'unit';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <GlassCard className="p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-foreground mb-4">{isNew ? 'Tambah' : 'Edit'} Profil Gaji</h2>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground uppercase block mb-1">Karyawan</label>
              <select value={state.employee_id || ''} onChange={e => update('employee_id', e.target.value)} disabled={!isNew} className="w-full h-10 px-3 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-sm text-foreground disabled:opacity-60" data-testid="pp-edit-employee">
                <option value="">— Pilih karyawan —</option>
                {employees.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.employee_code} · {e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase block mb-1">Skema Gaji</label>
              <select value={state.pay_scheme} onChange={e => update('pay_scheme', e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-sm text-foreground" data-testid="pp-edit-scheme">
                {SCHEMES.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase block mb-1">Tipe Periode</label>
              <select value={state.period_type} onChange={e => update('period_type', e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-sm text-foreground">
                {PERIOD_TYPES.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
              </select>
            </div>
            <div>
              {state.period_type === 'weekly' ? (
                <>
                  <label className="text-xs text-muted-foreground uppercase block mb-1">Hari Mulai Minggu</label>
                  <select value={state.cutoff_config?.week_start_day ?? 1} onChange={e => updateCutoff('week_start_day', Number(e.target.value))} className="w-full h-10 px-3 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-sm text-foreground">
                    {WEEK_DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </>
              ) : (
                <>
                  <label className="text-xs text-muted-foreground uppercase block mb-1">Tanggal Mulai Bulan</label>
                  <GlassInput type="number" min={1} max={28} value={state.cutoff_config?.start_day ?? 1} onChange={e => updateCutoff('start_day', Number(e.target.value))} />
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground uppercase block mb-1">Tarif Dasar (Rp) — per {rateLabel}</label>
              <GlassInput type="number" min={0} step="100" value={state.base_rate || 0} onChange={e => update('base_rate', e.target.value)} data-testid="pp-edit-base-rate" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase block mb-1">Tarif Lembur (Rp/jam)</label>
              <GlassInput type="number" min={0} step="100" value={state.overtime_rate || 0} onChange={e => update('overtime_rate', e.target.value)} data-testid="pp-edit-ot-rate" />
            </div>
          </div>

          {/* ─── Daily/Pcs: Lusin size + default unit ─── */}
          {(state.pay_scheme === 'daily' || state.pay_scheme === 'pcs') && (
            <div className="bg-violet-50/50 border border-violet-200 rounded-lg p-3 grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="lusin-config">
              <div>
                <label className="text-xs text-violet-900 font-semibold uppercase block mb-1">Jumlah Pcs per 1 Lusin</label>
                <GlassInput type="number" min={1} value={state.daily_lusin_size || 12} onChange={e => update('daily_lusin_size', Number(e.target.value))} data-testid="pp-edit-lusin-size" />
                <p className="text-[10px] text-muted-foreground mt-1">Default 12. Boleh ubah jika produk Anda pakai konvensi berbeda.</p>
              </div>
              {state.pay_scheme === 'daily' && (
                <div>
                  <label className="text-xs text-violet-900 font-semibold uppercase block mb-1">Unit Default Matrix</label>
                  <select value={state.daily_default_unit || 'pcs'} onChange={e => update('daily_default_unit', e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-sm text-foreground" data-testid="pp-edit-default-unit">
                    {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                  <p className="text-[10px] text-muted-foreground mt-1">Saat tambah row matrix baru, unit ini dipakai sebagai default.</p>
                </div>
              )}
            </div>
          )}

          {/* ─── Daily Matrix Editor ─── */}
          {state.pay_scheme === 'daily' && (
            <div data-testid="daily-matrix-editor">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground uppercase flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-violet-500" />
                  Matrix Rate per Proses × Size
                </label>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" className="h-7 px-2 text-xs border border-[var(--glass-border)]" onClick={addMatrixRow} data-testid="pp-matrix-add"><Plus className="w-3 h-3 mr-1" />Tambah Row</Button>
                </div>
              </div>
              {/* Quick fill helper */}
              {(state.daily_rates_matrix || []).length === 0 && processes.length > 0 && (
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-2 text-xs">
                  <p className="font-semibold text-violet-900 mb-2">Quick Fill — Linking, Steam, Sewing × Semua Size</p>
                  <Button
                    onClick={() => {
                      const wanted = processes.filter(p => /linking|steam|sewing/i.test(p.code) || /linking|steam|sewing/i.test(p.name));
                      quickFillMatrix(wanted.map(p => p.id));
                    }}
                    className="h-8 text-xs bg-violet-600 hover:bg-violet-700"
                    data-testid="pp-matrix-quick-fill"
                  >
                    Generate Matrix Otomatis
                  </Button>
                  <span className="ml-2 text-muted-foreground">akan buat {processes.filter(p => /linking|steam|sewing/i.test(p.code) || /linking|steam|sewing/i.test(p.name)).length} proses × {sizes.length + 1} size = {(processes.filter(p => /linking|steam|sewing/i.test(p.code) || /linking|steam|sewing/i.test(p.name)).length) * (sizes.length + 1)} row.</span>
                </div>
              )}
              <div className="space-y-1">
                {(state.daily_rates_matrix || []).map((r, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1.5 items-center" data-testid={`pp-matrix-row-${i}`}>
                    <select value={r.process_id} onChange={e => {
                      const p = processes.find(x => x.id === e.target.value);
                      updateMatrixRow(i, 'process_id', e.target.value);
                      if (p) updateMatrixRow(i, 'process_code', p.code);
                    }} className="col-span-3 h-9 px-2 rounded border border-[var(--glass-border)] bg-[var(--input-surface)] text-xs text-foreground" data-testid={`matrix-process-${i}`}>
                      <option value="">— Proses —</option>
                      {processes.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                    </select>
                    <select value={r.size_id || ''} onChange={e => {
                      const s = sizes.find(x => x.id === e.target.value);
                      updateMatrixRow(i, 'size_id', e.target.value);
                      updateMatrixRow(i, 'size_label', s ? (s.code || s.name) : 'All');
                    }} className="col-span-2 h-9 px-2 rounded border border-[var(--glass-border)] bg-[var(--input-surface)] text-xs text-foreground" data-testid={`matrix-size-${i}`}>
                      <option value="">All Sizes</option>
                      {sizes.map(s => <option key={s.id} value={s.id}>{s.code || s.name}</option>)}
                    </select>
                    <GlassInput type="number" min={0} step="100" placeholder="Rate" value={r.rate} onChange={e => updateMatrixRow(i, 'rate', Number(e.target.value))} className="col-span-3 h-9 text-xs" data-testid={`matrix-rate-${i}`} />
                    <select value={r.unit || 'pcs'} onChange={e => updateMatrixRow(i, 'unit', e.target.value)} className="col-span-2 h-9 px-2 rounded border border-[var(--glass-border)] bg-[var(--input-surface)] text-xs text-foreground" data-testid={`matrix-unit-${i}`}>
                      {UNITS.map(u => <option key={u.value} value={u.value}>per {u.label}</option>)}
                    </select>
                    <button onClick={() => removeMatrixRow(i)} className="col-span-2 h-9 text-red-300 hover:bg-red-400/10 rounded border border-[var(--glass-border)] inline-flex items-center justify-center text-xs" data-testid={`matrix-del-${i}`}><Trash2 className="w-3 h-3 mr-1" />Hapus</button>
                  </div>
                ))}
                {(state.daily_rates_matrix || []).length === 0 && <div className="text-xs text-muted-foreground py-3">Tidak ada row matrix. Tekan "Tambah Row" atau pakai Quick Fill.</div>}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                💡 <b>Lookup priority:</b> exact (process+size) → process saja (size kosong) → tarif dasar.
                Untuk row dengan unit "lusin", sistem auto-convert qty pcs ke lusin (boleh desimal).
              </p>
            </div>
          )}

          {/* ─── PCS/Hourly Process Rates Editor (visible for pcs AND hourly schemes) ─── */}
          {(state.pay_scheme === 'pcs' || state.pay_scheme === 'hourly') && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <label className="text-xs text-muted-foreground uppercase">Rate per Proses</label>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Tiap proses bisa punya skema sendiri: <b>Borongan Pcs</b> (bayar per output) atau <b>Borongan Jam</b> (bayar per jam hadir)
                  </p>
                </div>
                <Button variant="ghost" className="h-7 px-2 text-xs border border-[var(--glass-border)]" onClick={addProcRate}><Plus className="w-3 h-3 mr-1" />Tambah Proses</Button>
              </div>
              <div className="space-y-2">
                {(state.pcs_process_rates || []).map((r, i) => {
                  const isHourly = r.scheme === 'hourly';
                  return (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)]" data-testid={`proc-rate-row-${i}`}>
                      {/* Process selector */}
                      <select value={r.process_id} onChange={e => {
                        const p = processes.find(x => x.id === e.target.value);
                        updateProcRate(i, 'process_id', e.target.value);
                        if (p) updateProcRate(i, 'process_code', p.code);
                      }} className="flex-1 h-9 px-2 rounded border border-[var(--glass-border)] bg-[var(--input-surface)] text-xs text-foreground" data-testid={`proc-rate-proc-${i}`}>
                        <option value="">— Pilih proses —</option>
                        {processes.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                      </select>
                      {/* Scheme toggle */}
                      <select
                        value={r.scheme || 'pcs'}
                        onChange={e => updateProcRate(i, 'scheme', e.target.value)}
                        className={`w-32 h-9 px-2 rounded border border-[var(--glass-border)] text-xs font-semibold
                          ${isHourly ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'}
                          [var(--input-surface)]`}
                        data-testid={`proc-rate-scheme-${i}`}
                      >
                        <option value="pcs">Borongan Pcs</option>
                        <option value="hourly">Borongan Jam</option>
                      </select>
                      {/* Rate */}
                      <div className="flex items-center gap-1">
                        <GlassInput type="number" min={0} step="50" placeholder="Rate" value={r.rate} onChange={e => updateProcRate(i, 'rate', Number(e.target.value))} className="w-28 h-9 text-xs" data-testid={`proc-rate-rate-${i}`} />
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          Rp / {isHourly ? 'jam' : (r.unit || 'pcs')}
                        </span>
                      </div>
                      {/* Unit — only for pcs scheme */}
                      {!isHourly && (
                        <select value={r.unit || 'pcs'} onChange={e => updateProcRate(i, 'unit', e.target.value)} className="w-20 h-9 px-2 rounded border border-[var(--glass-border)] bg-[var(--input-surface)] text-xs text-foreground" data-testid={`proc-rate-unit-${i}`}>
                          {UNITS.map(u => <option key={u.value} value={u.value}>per {u.label}</option>)}
                        </select>
                      )}
                      <button onClick={() => removeProcRate(i)} className="h-9 w-9 text-red-300 hover:bg-red-400/10 rounded border border-[var(--glass-border)] flex-shrink-0 flex items-center justify-center" data-testid={`proc-rate-del-${i}`}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  );
                })}
                {(state.pcs_process_rates || []).length === 0 && (
                  <div className="text-xs text-muted-foreground py-2 px-1">
                    Tidak ada rate per proses. Tarif dasar berlaku untuk semua proses.
                  </div>
                )}
              </div>
              <div className="mt-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20 text-[10px] text-muted-foreground space-y-0.5">
                <p><b className="text-blue-300">Borongan Jam:</b> dibayar dari total jam hadir dalam periode × rate. Cocok untuk <b>Rajut</b> (operator mesin rajut).</p>
                <p><b className="text-emerald-300">Borongan Pcs:</b> dibayar dari total output WIP events × rate. Cocok untuk <b>Linking, Sewing, QC, Packing</b>, dll.</p>
                <p>Proses yang tidak terdaftar di sini menggunakan Tarif Dasar dengan skema global ({state.pay_scheme}).</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-6 justify-end">
          <Button variant="ghost" onClick={onClose} className="border border-[var(--glass-border)]">Batal</Button>
          <Button onClick={submit} data-testid="pp-edit-save">Simpan</Button>
        </div>
      </GlassCard>
    </div>
  );
}
