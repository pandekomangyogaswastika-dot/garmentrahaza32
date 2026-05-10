import { useEffect, useState, useRef } from 'react';
import { Sparkles, Loader2, Check, ExternalLink, AlertCircle } from 'lucide-react';
import MasterDataCRUD from './MasterDataCRUD';

const API = process.env.REACT_APP_BACKEND_URL || '';

const JOB_TITLES = [
  'Operator Rajut', 'Operator Linking', 'Operator Sewing Obras', 'Operator Sewing',
  'Operator QC', 'Operator Steam', 'Operator Packing',
  'Operator Washer', 'Operator Sontek', 'Supervisor', 'Staff Gudang', 'Staff Admin', 'Lainnya',
];

// ─── Phase 24C: Live Preview kode karyawan otomatis ─────────────────────
function EmployeeCodePreview({ form, setForm, token }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const shouldPreview = !form.employee_code && form.name && form.name.trim().length >= 2;

  useEffect(() => {
    if (!shouldPreview) { setPreview(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/api/rahaza/employees/preview-code`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, joined_at: form.joined_at || null }),
        });
        if (res.ok) {
          const data = await res.json();
          setPreview(data);
        }
      } catch (e) { /* ignore */ }
      setLoading(false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name, form.joined_at, shouldPreview, token]);

  if (!shouldPreview && !preview) return null;

  return (
    <div className="p-3 bg-gradient-to-br from-violet-50 to-blue-50 border border-violet-200 rounded-lg" data-testid="employee-code-preview">
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-violet-900">Kode Karyawan Otomatis</p>
          {loading ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Menghitung...
            </p>
          ) : preview ? (
            <>
              <p className="text-base font-mono font-bold text-violet-900 mt-0.5" data-testid="preview-code-value">{preview.code}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Format: <code>{preview.format}</code> · {preview.components.prefix}-{preview.components.join_date_part}-{preview.components.initials}
              </p>
              <button
                type="button"
                onClick={() => setForm({ ...form, employee_code: preview.code })}
                className="mt-2 text-[11px] inline-flex items-center gap-1 px-2 py-1 bg-violet-600 text-white rounded hover:bg-violet-700 transition-colors"
                data-testid="apply-preview-code"
              >
                <Check className="w-3 h-3" />
                Pakai Kode Ini
              </button>
              <span className="ml-2 text-[10px] text-muted-foreground">
                atau biarkan kosong — sistem akan generate otomatis saat simpan
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Info banner untuk profil gaji ────────────────────────────────────────
function PayrollProfileInfo() {
  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg" data-testid="payroll-profile-info">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-amber-900">Pengaturan Gaji</p>
          <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
            Skema gaji, rate borongan, dan detail penggajian karyawan diatur di modul{' '}
            <strong>Profil Gaji (HR Portal)</strong> — bukan di sini.
            Setelah karyawan ditambah, buka Portal HR → Profil Gaji untuk mengatur rate.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RahazaEmployeesModule({ token }) {
  const [locs, setLocs] = useState([]);
  const [payrollMap, setPayrollMap] = useState({});

  useEffect(() => {
    fetch(`${API}/api/rahaza/locations`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(setLocs).catch(() => {});
  }, [token]);

  useEffect(() => {
    // Load payroll profiles to show status per employee
    fetch(`${API}/api/rahaza/payroll-profiles?limit=500`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const map = {};
        (data || []).forEach(p => { if (p.employee_id) map[p.employee_id] = true; });
        setPayrollMap(map);
      }).catch(() => {});
  }, [token]);

  const locOptions = locs.filter(l => l.active).map(l => ({ value: l.id, label: `${l.code} · ${l.name}` }));

  return (
    <MasterDataCRUD
      title="Karyawan & Operator"
      description="Master karyawan (operator mesin, supervisor, staff). Kosongkan Kode untuk auto-generate format RHZ-DDMMYY-INISIAL. Pengaturan gaji dikelola di Portal HR → Profil Gaji."
      endpoint={`${API}/api/rahaza/employees`}
      token={token}
      testIdPrefix="rahaza-employee"
      columns={[
        { key: 'employee_code', label: 'Kode' },
        { key: 'name', label: 'Nama' },
        { key: 'job_title', label: 'Jabatan' },
        { key: 'joined_at', label: 'Tgl Masuk', render: v => {
            if (!v) return '-';
            const d = String(v).slice(0, 10);
            try { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; } catch { return d; }
        }},
        { key: 'location_name', label: 'Lokasi', render: v => v || '-' },
        { key: 'id', label: 'Profil Gaji',
          render: (v) => payrollMap[v]
            ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium"><Check className="w-3 h-3" />Ada Profil</span>
            : <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium"><AlertCircle className="w-3 h-3" />Belum Ada</span>
        },
      ]}
      fields={[
        { key: 'name', label: 'Nama Lengkap', required: true, placeholder: 'mis. Budi Santoso' },
        { key: 'joined_at', label: 'Tanggal Masuk Kerja', type: 'text', placeholder: 'YYYY-MM-DD (default: hari ini)',
          help: 'Tanggal ini dipakai untuk auto-generate kode (contoh: 2026-05-05 → RHZ-050526-XX).' },
        { key: 'employee_code', label: 'Kode Karyawan (opsional)', placeholder: 'Kosongkan untuk auto-generate',
          help: 'Format otomatis: RHZ-DDMMYY-Inisial. Isi manual jika ingin override.' },
        { key: 'job_title', label: 'Jabatan', type: 'select', options: JOB_TITLES.map(j => ({ value: j, label: j })) },
        { key: 'location_id', label: 'Lokasi Utama', type: 'select', options: locOptions },
        { key: 'phone', label: 'No. Telepon', placeholder: 'Opsional' },
      ]}
      defaultItem={{
        name: '', joined_at: new Date().toISOString().slice(0, 10),
        employee_code: '', job_title: 'Operator Rajut',
        location_id: '', phone: '',
        wage_scheme: 'borongan_pcs', base_rate: 0  // kept for backend compat, hidden from UI
      }}
      formExtra={({ form, setForm }) => (
        <>
          <EmployeeCodePreview form={form} setForm={setForm} token={token} />
          <PayrollProfileInfo />
        </>
      )}
    />
  );
}
