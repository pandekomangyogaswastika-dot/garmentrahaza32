import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  FileDown, Plus, Trash2, Star, Check, X, Settings, Download,
  ChevronDown, ChevronRight, Save, Edit2, Info, Sparkles, Layout,
  Image as ImageIcon, Type, Globe2, Palette, RefreshCcw, ExternalLink,
  Loader2, Upload, Wand2, FileType,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';

const PDF_TYPE_LABELS = {
  // Phase 23 advanced types
  'lkp':                    'Lembar Kerja Produksi (LKP)',
  'payslip':                'Slip Gaji',
  'shift-report':           'Laporan Shift / Handover',
  // Existing types
  'production-po':          'SPP (Surat Perintah Produksi)',
  'vendor-shipment':        'Surat Jalan Material',
  'buyer-shipment-dispatch':'Surat Jalan Buyer (Dispatch)',
  'production-report':      'Laporan Produksi Lengkap',
  'report-production':      'Report: Produksi',
  'report-progress':        'Report: Progres',
  'report-financial':       'Report: Keuangan',
  'report-shipment':        'Report: Pengiriman',
  'report-defect':          'Report: Defect',
  'report-return':          'Report: Retur',
  'report-missing-material':'Report: Material Hilang',
  'report-replacement':     'Report: Pengganti',
  'report-accessory':       'Report: Aksesoris',
};

const PDF_TYPE_GROUPS = {
  'Dokumen Operasional ✨': ['lkp', 'payslip', 'shift-report'],
  'Dokumen': ['production-po', 'vendor-shipment', 'buyer-shipment-dispatch', 'production-report'],
  'Laporan': ['report-production', 'report-progress', 'report-financial', 'report-shipment', 'report-defect', 'report-return', 'report-missing-material', 'report-replacement', 'report-accessory'],
};

const ADVANCED_TYPES = new Set(['lkp', 'payslip', 'shift-report']);

const DATE_FORMATS = [
  { value: 'DD/MM/YYYY',   label: '31/12/2025' },
  { value: 'DD-MM-YYYY',   label: '31-12-2025' },
  { value: 'YYYY-MM-DD',   label: '2025-12-31' },
  { value: 'MM/DD/YYYY',   label: '12/31/2025 (US)' },
  { value: 'DD MMM YYYY',  label: '31 Des 2025' },
  { value: 'DD MMMM YYYY', label: '31 Desember 2025' },
];

const PAGE_SIZES = [
  { value: 'A4',     label: 'A4 (210 × 297 mm)' },
  { value: 'A5',     label: 'A5 (148 × 210 mm)' },
  { value: 'LETTER', label: 'Letter (216 × 279 mm)' },
];

const ORIENTATIONS = [
  { value: 'portrait',  label: 'Portrait (Berdiri)' },
  { value: 'landscape', label: 'Landscape (Mendatar)' },
];

const NUMBER_GROUPING = [
  { value: '.', label: '1.000.000 (Indonesia)' },
  { value: ',', label: '1,000,000 (US)' },
  { value: ' ', label: '1 000 000 (Eropa)' },
];

const DECIMAL_SEP = [
  { value: ',', label: ', (koma)' },
  { value: '.', label: '. (titik)' },
];

const TAB_LIST = [
  { key: 'columns',  label: 'Kolom & Section', icon: Layout    },
  { key: 'header',   label: 'Header & Footer', icon: Type      },
  { key: 'branding', label: 'Branding & Halaman', icon: Palette },
  { key: 'format',   label: 'Format & Bahasa', icon: Globe2    },
  { key: 'labels',   label: 'Custom Labels',   icon: Sparkles  },
];

// ───────────────────────── Reusable inputs ─────────────────────────
const TextInput = ({ value, onChange, placeholder, ...rest }) => (
  <input
    type="text"
    value={value || ''}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-full px-3 py-2 bg-[var(--input-surface,white)] border border-[var(--glass-border,#e2e8f0)] rounded-lg text-sm focus:ring-2 focus:ring-ring focus:border-primary/30 outline-none transition-colors"
    {...rest}
  />
);

const NumberInput = ({ value, onChange, ...rest }) => (
  <input
    type="number"
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    className="w-full px-3 py-2 bg-[var(--input-surface,white)] border border-[var(--glass-border,#e2e8f0)] rounded-lg text-sm focus:ring-2 focus:ring-ring focus:border-primary/30 outline-none"
    {...rest}
  />
);

const SelectInput = ({ value, onChange, options, ...rest }) => (
  <select
    value={value || ''}
    onChange={(e) => onChange(e.target.value)}
    className="w-full px-3 py-2 bg-[var(--input-surface,white)] border border-[var(--glass-border,#e2e8f0)] rounded-lg text-sm focus:ring-2 focus:ring-ring focus:border-primary/30 outline-none cursor-pointer"
    {...rest}
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
);

const ToggleSwitch = ({ value, onChange, disabled }) => (
  <button
    type="button"
    onClick={() => !disabled && onChange(!value)}
    disabled={disabled}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${value ? 'bg-primary' : 'bg-secondary'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    data-testid="toggle-switch"
  >
    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow ${value ? 'translate-x-[18px]' : 'translate-x-1'}`} />
  </button>
);

const FieldLabel = ({ children, hint }) => (
  <label className="block text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
    {children}
    {hint && <span className="text-[10px] font-normal text-muted-foreground">{hint}</span>}
  </label>
);

// ───────────────────────── Section / Tab Editors ─────────────────────────
function ColumnsAndSectionsTab({ columns, formColumns, setFormColumns, sections, formSections, setFormSections, isAdvanced }) {
  const requiredCols = (columns || []).filter(c => c.required).map(c => c.key);
  const requiredSecs = (sections || []).filter(s => s.required).map(s => s.key);

  const toggleCol = (k) => {
    if (requiredCols.includes(k)) return;
    setFormColumns(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  };
  const toggleSec = (k) => {
    if (requiredSecs.includes(k)) return;
    setFormSections(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  };

  return (
    <div className="space-y-5">
      {/* Sections */}
      {isAdvanced && sections.length > 0 && (
        <div data-testid="sections-editor">
          <div className="flex items-center justify-between mb-2">
            <FieldLabel hint={`${formSections.length} dari ${sections.length} aktif`}>Section yang ditampilkan</FieldLabel>
            <div className="flex gap-2 text-xs">
              <button onClick={() => setFormSections(sections.map(s => s.key))} className="text-primary hover:brightness-110" data-testid="sections-select-all">Semua</button>
              <span className="text-muted-foreground">|</span>
              <button onClick={() => setFormSections(sections.filter(s => s.required).map(s => s.key))} className="text-muted-foreground hover:text-foreground" data-testid="sections-required-only">Hanya Wajib</button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-[var(--glass-bg,#f8fafc)] rounded-lg border border-border p-3">
            {sections.map(s => {
              const on = formSections.includes(s.key);
              const req = s.required;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleSec(s.key)}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-all text-sm ${on ? 'bg-primary/10 border-primary/30 text-foreground' : 'bg-white border-border text-muted-foreground hover:border-primary/20'}`}
                  data-testid={`section-toggle-${s.key}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${on ? 'bg-primary text-white' : 'border border-border'}`}>
                      {on && <Check className="w-3 h-3" />}
                    </div>
                    <span className="truncate">{s.label_id}</span>
                  </div>
                  {req && <span className="text-[10px] text-amber-600 font-medium">wajib</span>}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            <Info className="w-3 h-3 inline mr-1" />
            Section wajib akan otomatis aktif. Section opsional dapat disembunyikan dari output PDF.
          </p>
        </div>
      )}

      {/* Columns (only if type has columns defined) */}
      {columns.length > 0 && (
        <div data-testid="columns-editor">
          <div className="flex items-center justify-between mb-2">
            <FieldLabel hint={`${formColumns.length} dari ${columns.length} dipilih`}>{isAdvanced ? 'Field tambahan (opsional)' : 'Kolom yang ditampilkan'}</FieldLabel>
            <div className="flex gap-2 text-xs">
              <button onClick={() => setFormColumns(columns.map(c => c.key))} className="text-primary hover:brightness-110" data-testid="columns-select-all">Semua</button>
              <span className="text-muted-foreground">|</span>
              <button onClick={() => setFormColumns(columns.filter(c => c.required).map(c => c.key))} className="text-muted-foreground hover:text-foreground" data-testid="columns-required-only">Hanya Wajib</button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 bg-[var(--glass-bg,#f8fafc)] rounded-lg border border-border p-3 max-h-[260px] overflow-y-auto">
            {columns.map(c => {
              const on = formColumns.includes(c.key);
              const req = c.required;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggleCol(c.key)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-left transition-all text-xs ${on ? 'bg-primary/10 border-primary/30 text-foreground' : 'bg-white border-border text-muted-foreground hover:border-primary/20'}`}
                  data-testid={`column-toggle-${c.key}`}
                >
                  <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 ${on ? 'bg-primary text-white' : 'border border-border'}`}>
                    {on && <Check className="w-2.5 h-2.5" />}
                  </div>
                  <span className="truncate">{c.label}</span>
                  {req && <span className="text-amber-500 flex-shrink-0">*</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderFooterTab({ form, update }) {
  const h = form.header || {};
  const f = form.footer || {};
  return (
    <div className="space-y-5" data-testid="header-footer-editor">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Type className="w-4 h-4 text-primary" /> Header (Kop Dokumen)
        </h4>
        <div className="space-y-3 bg-[var(--glass-bg,#f8fafc)] rounded-lg border border-border p-4">
          <div>
            <FieldLabel>Baris 1 (Nama Perusahaan)</FieldLabel>
            <TextInput value={h.line1} onChange={(v) => update('header', { ...h, line1: v })} placeholder="PT RAHAZA GLOBAL INDONESIA" data-testid="header-line1" />
          </div>
          <div>
            <FieldLabel>Baris 2 (Tagline / Alamat)</FieldLabel>
            <TextInput value={h.line2} onChange={(v) => update('header', { ...h, line2: v })} placeholder="Industri Garmen — Jl. Industri No. 1, Bandung" data-testid="header-line2" />
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm text-foreground">Tampilkan Logo</span>
            <ToggleSwitch value={h.show_logo !== false} onChange={(v) => update('header', { ...h, show_logo: v })} />
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Type className="w-4 h-4 text-primary" /> Footer
        </h4>
        <div className="space-y-3 bg-[var(--glass-bg,#f8fafc)] rounded-lg border border-border p-4">
          <div>
            <FieldLabel hint="Tampil di bagian bawah halaman">Teks Custom Footer</FieldLabel>
            <TextInput value={f.text} onChange={(v) => update('footer', { ...f, text: v })} placeholder="Dokumen ini bersifat resmi & rahasia" data-testid="footer-text" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Tampilkan Nomor Halaman</span>
            <ToggleSwitch value={f.show_page_number !== false} onChange={(v) => update('footer', { ...f, show_page_number: v })} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Tampilkan Meta Cetak</span>
            <ToggleSwitch value={f.show_print_meta !== false} onChange={(v) => update('footer', { ...f, show_print_meta: v })} />
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandingTab({ form, update, token }) {
  const b = form.branding || {};
  const p = form.page || {};
  const margins = p.margins || { top: 18, bottom: 16, left: 14, right: 14 };
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const onUploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Logo maksimal 2MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API}/api/pdf-smart-config/upload-logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      update('branding', { ...b, logo_object_path: data.object_path });
    } catch (err) {
      alert('Upload gagal: ' + err.message);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-5" data-testid="branding-editor">
      {/* Logo & Color */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-primary" /> Logo & Warna
        </h4>
        <div className="space-y-3 bg-[var(--glass-bg,#f8fafc)] rounded-lg border border-border p-4">
          <div>
            <FieldLabel hint="PNG/JPG/WEBP, maksimal 2MB">Logo Perusahaan</FieldLabel>
            <div className="flex items-center gap-3">
              <input
                type="file"
                ref={fileRef}
                onChange={onUploadLogo}
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                data-testid="logo-file-input"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium bg-primary text-white rounded-lg hover:brightness-110 disabled:opacity-50 transition-colors"
                data-testid="logo-upload-btn"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {uploading ? 'Mengunggah…' : (b.logo_object_path ? 'Ganti Logo' : 'Pilih Logo')}
              </button>
              {b.logo_object_path && (
                <>
                  <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-1">
                    <Check className="w-3 h-3 inline mr-1" />Logo terpasang
                  </span>
                  <button
                    type="button"
                    onClick={() => update('branding', { ...b, logo_object_path: '' })}
                    className="text-xs text-red-600 hover:text-red-700"
                    data-testid="logo-remove-btn"
                  >
                    Hapus
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel hint="Warna utama header">Primary Color</FieldLabel>
              <div className="flex gap-2">
                <input type="color" value={b.primary_color || '#0f4c81'} onChange={(e) => update('branding', { ...b, primary_color: e.target.value })} className="h-9 w-12 border border-border rounded cursor-pointer" data-testid="branding-primary-color" />
                <TextInput value={b.primary_color} onChange={(v) => update('branding', { ...b, primary_color: v })} placeholder="#0f4c81" />
              </div>
            </div>
            <div>
              <FieldLabel hint="Aksen / sekunder">Accent Color</FieldLabel>
              <div className="flex gap-2">
                <input type="color" value={b.accent_color || '#0f6b8e'} onChange={(e) => update('branding', { ...b, accent_color: e.target.value })} className="h-9 w-12 border border-border rounded cursor-pointer" data-testid="branding-accent-color" />
                <TextInput value={b.accent_color} onChange={(v) => update('branding', { ...b, accent_color: v })} placeholder="#0f6b8e" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Watermark */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-primary" /> Watermark (Opsional)
        </h4>
        <div className="space-y-3 bg-[var(--glass-bg,#f8fafc)] rounded-lg border border-border p-4">
          <div>
            <FieldLabel hint="Mis. RAHASIA, CONFIDENTIAL, DRAFT">Teks Watermark</FieldLabel>
            <TextInput value={b.watermark_text} onChange={(v) => update('branding', { ...b, watermark_text: v })} placeholder="(kosongkan untuk tidak ada watermark)" data-testid="watermark-text" />
          </div>
          <div>
            <FieldLabel hint={`${Math.round((b.watermark_opacity ?? 0.08) * 100)}%`}>Transparansi</FieldLabel>
            <input
              type="range"
              min="0.04" max="0.4" step="0.02"
              value={b.watermark_opacity ?? 0.08}
              onChange={(e) => update('branding', { ...b, watermark_opacity: Number(e.target.value) })}
              className="w-full accent-primary"
              data-testid="watermark-opacity"
            />
          </div>
        </div>
      </div>

      {/* Page */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <FileType className="w-4 h-4 text-primary" /> Ukuran Halaman & Margin
        </h4>
        <div className="space-y-3 bg-[var(--glass-bg,#f8fafc)] rounded-lg border border-border p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Ukuran</FieldLabel>
              <SelectInput value={p.size || 'A4'} onChange={(v) => update('page', { ...p, size: v })} options={PAGE_SIZES} data-testid="page-size" />
            </div>
            <div>
              <FieldLabel>Orientasi</FieldLabel>
              <SelectInput value={p.orientation || 'portrait'} onChange={(v) => update('page', { ...p, orientation: v })} options={ORIENTATIONS} data-testid="page-orientation" />
            </div>
          </div>
          <div>
            <FieldLabel hint="dalam mm">Margin</FieldLabel>
            <div className="grid grid-cols-4 gap-2">
              {['top', 'bottom', 'left', 'right'].map(side => (
                <div key={side}>
                  <span className="text-[10px] text-muted-foreground uppercase">{side}</span>
                  <NumberInput value={margins[side]} onChange={(v) => update('page', { ...p, margins: { ...margins, [side]: v ?? 0 } })} data-testid={`margin-${side}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormatLanguageTab({ form, update }) {
  const fmt = form.format || {};
  return (
    <div className="space-y-5" data-testid="format-language-editor">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-primary" /> Bahasa
        </h4>
        <div className="bg-[var(--glass-bg,#f8fafc)] rounded-lg border border-border p-4">
          <div className="flex gap-2">
            {[{ v: 'id', label: 'Bahasa Indonesia' }, { v: 'en', label: 'English' }].map(o => (
              <button
                key={o.v}
                type="button"
                onClick={() => update('language', o.v)}
                className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${form.language === o.v ? 'bg-primary text-white border-primary' : 'bg-white border-border text-muted-foreground hover:border-primary/30'}`}
                data-testid={`language-${o.v}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            <Info className="w-3 h-3 inline mr-1" />
            Mengubah bahasa akan mengganti semua label default ke bahasa terpilih.
          </p>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Type className="w-4 h-4 text-primary" /> Format Angka & Tanggal
        </h4>
        <div className="space-y-3 bg-[var(--glass-bg,#f8fafc)] rounded-lg border border-border p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Format Tanggal</FieldLabel>
              <SelectInput value={fmt.date_format || 'DD/MM/YYYY'} onChange={(v) => update('format', { ...fmt, date_format: v })} options={DATE_FORMATS} data-testid="date-format" />
            </div>
            <div>
              <FieldLabel>Mata Uang (Simbol)</FieldLabel>
              <TextInput value={fmt.currency_symbol} onChange={(v) => update('format', { ...fmt, currency_symbol: v })} placeholder="Rp" data-testid="currency-symbol" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Pemisah Ribuan</FieldLabel>
              <SelectInput value={fmt.number_grouping || '.'} onChange={(v) => update('format', { ...fmt, number_grouping: v })} options={NUMBER_GROUPING} data-testid="number-grouping" />
            </div>
            <div>
              <FieldLabel>Pemisah Desimal</FieldLabel>
              <SelectInput value={fmt.decimal_separator || ','} onChange={(v) => update('format', { ...fmt, decimal_separator: v })} options={DECIMAL_SEP} data-testid="decimal-separator" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomLabelsTab({ customizable, customLabels, setCustomLabels, language }) {
  if (!customizable || customizable.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-40" />
        Tidak ada label yang dapat dikustomisasi untuk tipe ini.
      </div>
    );
  }
  const updateLabel = (key, lang, val) => {
    setCustomLabels(prev => {
      const cur = prev[key] && typeof prev[key] === 'object' ? prev[key] : {};
      return { ...prev, [key]: { ...cur, [lang]: val } };
    });
  };

  return (
    <div className="space-y-3" data-testid="custom-labels-editor">
      <div className="flex items-center justify-between">
        <FieldLabel>Override Label</FieldLabel>
        <button
          onClick={() => setCustomLabels({})}
          className="text-xs text-muted-foreground hover:text-red-600"
          data-testid="reset-custom-labels"
        >
          Reset ke Default
        </button>
      </div>
      <div className="bg-[var(--glass-bg,#f8fafc)] rounded-lg border border-border p-3 max-h-[420px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left py-2 px-2 font-medium">Field</th>
              <th className="text-left py-2 px-2 font-medium">Default ({language === 'en' ? 'EN' : 'ID'})</th>
              <th className="text-left py-2 px-2 font-medium">Custom ID</th>
              <th className="text-left py-2 px-2 font-medium">Custom EN</th>
            </tr>
          </thead>
          <tbody>
            {customizable.map(f => {
              const cur = customLabels[f.key] || {};
              const customId = typeof cur === 'object' ? cur.id || '' : (cur || '');
              const customEn = typeof cur === 'object' ? cur.en || '' : '';
              const defaultText = language === 'en' ? f.default_en : f.default_id;
              return (
                <tr key={f.key} className="border-t border-border">
                  <td className="py-2 px-2 font-mono text-[10px] text-muted-foreground">{f.key.replace(/^[a-z-]+\./, '')}</td>
                  <td className="py-2 px-2 text-muted-foreground">{defaultText}</td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={customId}
                      onChange={(e) => updateLabel(f.key, 'id', e.target.value)}
                      placeholder={f.default_id}
                      className="w-full px-2 py-1 border border-border rounded text-xs"
                      data-testid={`label-id-${f.key}`}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={customEn}
                      onChange={(e) => updateLabel(f.key, 'en', e.target.value)}
                      placeholder={f.default_en}
                      className="w-full px-2 py-1 border border-border rounded text-xs"
                      data-testid={`label-en-${f.key}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────────────────────── Live Preview Pane ─────────────────────────
function LivePreviewPane({ pdfType, formState, token, onTrigger }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!ADVANCED_TYPES.has(pdfType)) {
      setPdfUrl(null);
      setError('Live Preview hanya tersedia untuk tipe advanced (LKP, Slip Gaji, Shift Report).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/pdf-smart-config/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_type: pdfType, config: formState }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      // revoke previous URL
      setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [pdfType, formState, token]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { refresh(); }, 700);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(formState), pdfType, onTrigger]);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  return (
    <div className="flex flex-col h-full bg-slate-50" data-testid="live-preview-pane">
      <div className="px-4 py-2.5 border-b border-border bg-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Live Preview</span>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-40"
            title="Refresh preview"
            data-testid="preview-refresh-btn"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
          </button>
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
              title="Buka di tab baru"
              data-testid="preview-open-newtab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {pdfUrl && (
            <a
              href={pdfUrl}
              download={`preview_${pdfType}.pdf`}
              className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
              title="Download preview"
              data-testid="preview-download-btn"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden bg-slate-100">
        {error ? (
          <div className="h-full flex items-center justify-center p-6 text-center">
            <div>
              <X className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-sm text-red-700">{error}</p>
              <button onClick={refresh} className="mt-3 text-xs text-primary hover:brightness-110" data-testid="preview-retry">Coba Ulang</button>
            </div>
          </div>
        ) : pdfUrl ? (
          <object data={pdfUrl + '#zoom=85&navpanes=0'} type="application/pdf" className="w-full h-full" data-testid="preview-iframe">
            <p className="p-6 text-sm text-muted-foreground">PDF tidak bisa ditampilkan di sini. <a className="text-primary underline" href={pdfUrl} target="_blank" rel="noreferrer">Buka di tab baru</a>.</p>
          </object>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            {loading ? 'Memuat preview…' : 'Memuat preview…'}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Main Module ─────────────────────────
export default function PDFConfigModule({ token }) {
  const [configs, setConfigs] = useState([]);
  const [columns, setColumns] = useState([]);    // for non-advanced types
  const [typeMeta, setTypeMeta] = useState(null);    // for advanced types: { sections, customizable_labels, default_config }
  const [selectedType, setSelectedType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editConfig, setEditConfig] = useState(null);
  const [activeTab, setActiveTab] = useState('columns');
  const [expandedGroups, setExpandedGroups] = useState({ 'Dokumen Operasional ✨': true, 'Dokumen': true, 'Laporan': false });
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDefault, setFormDefault] = useState(false);
  const [formColumns, setFormColumns] = useState([]);
  const [formSections, setFormSections] = useState([]);
  const [formAdvanced, setFormAdvanced] = useState({
    header: { line1: '', line2: '', show_logo: true },
    footer: { text: '', show_page_number: true, show_print_meta: true },
    branding: { logo_object_path: '', primary_color: '', accent_color: '', watermark_text: '', watermark_opacity: 0.08 },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 18, bottom: 16, left: 14, right: 14 } },
    format: { currency_symbol: 'Rp', date_format: 'DD/MM/YYYY', number_grouping: '.', decimal_separator: ',' },
    language: 'id',
    custom_labels: {},
  });

  const isAdvanced = ADVANCED_TYPES.has(selectedType);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  // ─── Fetch list ───
  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/pdf-export-configs`, { headers });
      const data = await res.json();
      setConfigs(Array.isArray(data) ? data : []);
    } catch (e) { console.error('Failed to fetch PDF configs:', e); }
  }, [headers]);

  const fetchTypeMetadata = useCallback(async (type) => {
    if (!type) return;
    try {
      // Always get columns from old endpoint (works for all types)
      const colRes = await fetch(`${API}/api/pdf-export-columns?type=${type}`, { headers });
      const colData = await colRes.json();
      setColumns(colData.columns || []);
      // For advanced types, also get sections + customizable labels
      if (ADVANCED_TYPES.has(type)) {
        const metaRes = await fetch(`${API}/api/pdf-smart-config/types/${type}`, { headers });
        const meta = await metaRes.json();
        setTypeMeta(meta);
      } else {
        setTypeMeta(null);
      }
    } catch (e) { console.error('Failed to fetch type meta:', e); }
  }, [headers]);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  // ─── Modal openers ───
  const resetForm = () => {
    setFormName('');
    setFormDefault(false);
    setFormColumns([]);
    setFormSections([]);
    setFormAdvanced({
      header: { line1: '', line2: '', show_logo: true },
      footer: { text: '', show_page_number: true, show_print_meta: true },
      branding: { logo_object_path: '', primary_color: '', accent_color: '', watermark_text: '', watermark_opacity: 0.08 },
      page: { size: 'A4', orientation: 'portrait', margins: { top: 18, bottom: 16, left: 14, right: 14 } },
      format: { currency_symbol: 'Rp', date_format: 'DD/MM/YYYY', number_grouping: '.', decimal_separator: ',' },
      language: 'id',
      custom_labels: {},
    });
  };

  const openCreateModal = async (type) => {
    resetForm();
    setSelectedType(type);
    setEditConfig(null);
    setActiveTab('columns');
    await fetchTypeMetadata(type);
    setShowModal(true);
  };

  const openEditModal = async (cfg) => {
    setSelectedType(cfg.pdf_type);
    setEditConfig(cfg);
    setFormName(cfg.name || '');
    setFormDefault(cfg.is_default || false);
    setFormColumns(cfg.columns || []);
    setFormSections(cfg.sections || []);
    setFormAdvanced({
      header: cfg.header || { line1: '', line2: '', show_logo: true },
      footer: cfg.footer || { text: '', show_page_number: true, show_print_meta: true },
      branding: cfg.branding || { logo_object_path: '', primary_color: '', accent_color: '', watermark_text: '', watermark_opacity: 0.08 },
      page: cfg.page || { size: 'A4', orientation: 'portrait', margins: { top: 18, bottom: 16, left: 14, right: 14 } },
      format: cfg.format || { currency_symbol: 'Rp', date_format: 'DD/MM/YYYY', number_grouping: '.', decimal_separator: ',' },
      language: cfg.language || 'id',
      custom_labels: cfg.custom_labels || {},
    });
    setActiveTab('columns');
    await fetchTypeMetadata(cfg.pdf_type);
    setShowModal(true);
  };

  // When metadata loads on create-mode and user hasn't selected, prefill all sections + columns
  useEffect(() => {
    if (showModal && !editConfig) {
      if (typeMeta?.sections && formSections.length === 0) {
        setFormSections(typeMeta.sections.filter(s => s.default_on !== false).map(s => s.key));
      }
      if (columns.length > 0 && formColumns.length === 0) {
        // For advanced types, do NOT auto-fill columns (they're optional). For others, auto-fill all.
        if (!isAdvanced) {
          setFormColumns(columns.map(c => c.key));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeMeta, columns, showModal, editConfig]);

  // ─── Form payload (for live preview) ───
  const formPayload = useMemo(() => ({
    sections: formSections,
    header: formAdvanced.header,
    footer: formAdvanced.footer,
    branding: formAdvanced.branding,
    page: formAdvanced.page,
    format: formAdvanced.format,
    language: formAdvanced.language,
    custom_labels: formAdvanced.custom_labels,
    columns: formColumns,
  }), [formSections, formAdvanced, formColumns]);

  // ─── Save ───
  const handleSave = async () => {
    if (!formName.trim()) { alert('Nama preset harus diisi'); return; }
    if (!isAdvanced && formColumns.length === 0) { alert('Pilih minimal 1 kolom'); return; }
    setSaving(true);
    try {
      const body = {
        pdf_type: selectedType,
        name: formName,
        is_default: formDefault,
        columns: formColumns,
        ...(isAdvanced ? {
          sections: formSections,
          header: formAdvanced.header,
          footer: formAdvanced.footer,
          branding: formAdvanced.branding,
          page: formAdvanced.page,
          format: formAdvanced.format,
          language: formAdvanced.language,
          custom_labels: formAdvanced.custom_labels,
        } : {}),
      };
      const url = editConfig
        ? `${API}/api/pdf-export-configs/${editConfig.id}`
        : `${API}/api/pdf-export-configs`;
      const res = await fetch(url, { method: editConfig ? 'PUT' : 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || JSON.stringify(err));
      }
      setShowModal(false);
      fetchConfigs();
      setTestResult({ ok: true, msg: editConfig ? 'Preset berhasil diupdate' : 'Preset berhasil dibuat' });
      setTimeout(() => setTestResult(null), 3500);
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus preset PDF ini?')) return;
    try {
      await fetch(`${API}/api/pdf-export-configs/${id}`, { method: 'DELETE', headers });
      fetchConfigs();
    } catch (e) { alert('Error: ' + e.message); }
  };

  const handleSetDefault = async (cfg) => {
    try {
      await fetch(`${API}/api/pdf-export-configs/${cfg.id}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ is_default: !cfg.is_default })
      });
      fetchConfigs();
    } catch (e) { alert('Error: ' + e.message); }
  };

  const handleTestExport = async (type) => {
    setTestResult(null);
    try {
      if (ADVANCED_TYPES.has(type)) {
        // For advanced types, generate preview download via smart-config endpoint
        const defaultConfig = configs.find(c => c.pdf_type === type && c.is_default);
        const res = await fetch(`${API}/api/pdf-smart-config/preview`, {
          method: 'POST',
          headers, body: JSON.stringify({ pdf_type: type, config_id: defaultConfig?.id || null }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const burl = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = burl; a.download = `test_${type}.pdf`; a.click();
        URL.revokeObjectURL(burl);
        setTestResult({ type, ok: true, msg: 'PDF preview berhasil diunduh (data dummy)' });
      } else {
        const defaultConfig = configs.find(c => c.pdf_type === type && c.is_default);
        let url = `${API}/api/export-pdf?type=${type}`;
        if (defaultConfig) url += `&config_id=${defaultConfig.id}`;
        const res = await fetch(url, { headers });
        if (res.ok) {
          const blob = await res.blob();
          const burl = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = burl; a.download = `test_${type}.pdf`; a.click();
          URL.revokeObjectURL(burl);
          setTestResult({ type, ok: true, msg: 'PDF berhasil diunduh' });
        } else {
          const err = await res.json().catch(() => ({}));
          setTestResult({ type, ok: false, msg: err.detail || `HTTP ${res.status}` });
        }
      }
    } catch (e) { setTestResult({ type, ok: false, msg: e.message }); }
  };

  const getConfigsForType = (type) => configs.filter(c => c.pdf_type === type);
  const getDefaultForType = (type) => configs.find(c => c.pdf_type === type && c.is_default);
  const toggleGroup = (g) => setExpandedGroups(prev => ({ ...prev, [g]: !prev[g] }));

  return (
    <div className="space-y-6" data-testid="pdf-config-module">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3" data-testid="pdf-config-title">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Settings className="w-6 h-6 text-primary" />
            </div>
            Smart PDF Configuration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Atur kolom, section, header/footer, branding, format, dan bahasa untuk setiap dokumen PDF. Preset default otomatis dipakai saat export.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-[var(--glass-bg,#f8fafc)] rounded-lg px-3 py-2 border border-border">
          <Info className="w-4 h-4" />
          <span data-testid="preset-count">{configs.length} preset tersimpan</span>
        </div>
      </div>

      {/* Type groups */}
      {Object.entries(PDF_TYPE_GROUPS).map(([group, types]) => (
        <div key={group} className="bg-[var(--card-surface,white)] rounded-xl border border-border overflow-hidden shadow-sm">
          <button
            onClick={() => toggleGroup(group)}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-[var(--glass-bg,#f8fafc)] hover:bg-[var(--glass-bg-hover,#f1f5f9)] transition-colors"
            data-testid={`group-toggle-${group.replace(/[^a-z]/gi, '').toLowerCase()}`}
          >
            <div className="flex items-center gap-3">
              {expandedGroups[group] ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              <span className="text-sm font-semibold text-foreground uppercase tracking-wide">{group}</span>
              <span className="text-xs bg-secondary text-muted-foreground rounded-full px-2 py-0.5">{types.length}</span>
            </div>
          </button>
          {expandedGroups[group] && (
            <div className="divide-y divide-border">
              {types.map(type => {
                const typeConfigs = getConfigsForType(type);
                const defaultCfg = getDefaultForType(type);
                const advanced = ADVANCED_TYPES.has(type);
                return (
                  <div key={type} className="px-5 py-4 hover:bg-[var(--glass-bg,#f8fafc)]/50 transition-colors" data-testid={`pdf-type-row-${type}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <FileDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm font-medium text-foreground">{PDF_TYPE_LABELS[type] || type}</span>
                          {advanced && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5">
                              <Sparkles className="w-2.5 h-2.5" />
                              ADVANCED
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {defaultCfg ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                              <Star className="w-3 h-3 fill-current" />
                              Default: {defaultCfg.name}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Default sistem (no preset)</span>
                          )}
                          {typeConfigs.length > 0 && (
                            <span className="text-xs text-muted-foreground">{typeConfigs.length} preset</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleTestExport(type)}
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title={advanced ? 'Test Preview (data dummy)' : 'Test Export PDF'}
                          data-testid={`test-export-${type}`}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openCreateModal(type)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary bg-primary/10 hover:bg-primary/15 rounded-lg px-3 py-1.5 transition-colors"
                          data-testid={`create-preset-${type}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Buat Preset
                        </button>
                      </div>
                    </div>
                    {typeConfigs.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {typeConfigs.map(cfg => (
                          <div key={cfg.id} className="flex items-center justify-between bg-[var(--card-surface,white)] border border-border rounded-lg px-3 py-2" data-testid={`preset-card-${cfg.id}`}>
                            <div className="flex items-center gap-3 min-w-0">
                              <button
                                onClick={() => handleSetDefault(cfg)}
                                className={`p-1 rounded-md transition-colors ${cfg.is_default ? 'text-amber-500 bg-amber-50' : 'text-muted-foreground hover:text-amber-400 hover:bg-amber-50'}`}
                                title={cfg.is_default ? 'Lepas dari default' : 'Jadikan default'}
                                data-testid={`toggle-default-${cfg.id}`}
                              >
                                <Star className={`w-4 h-4 ${cfg.is_default ? 'fill-current' : ''}`} />
                              </button>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{cfg.name}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                                  {cfg.columns?.length > 0 && <span>{cfg.columns.length} kolom</span>}
                                  {cfg.sections?.length > 0 && <span>· {cfg.sections.length} section</span>}
                                  {cfg.language && <span className="uppercase">· {cfg.language}</span>}
                                  {cfg.branding?.logo_object_path && <span>· logo ✓</span>}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEditModal(cfg)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Edit" data-testid={`edit-preset-${cfg.id}`}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDelete(cfg.id)} className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Hapus" data-testid={`delete-preset-${cfg.id}`}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Result toast */}
      {testResult && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border ${testResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`} data-testid="test-result-toast">
          {testResult.ok ? <Check className="w-5 h-5 text-emerald-500" /> : <X className="w-5 h-5 text-red-500" />}
          <div>
            <p className="text-sm font-medium">{testResult.ok ? 'Berhasil' : 'Gagal'}</p>
            <p className="text-xs opacity-80">{testResult.msg}</p>
          </div>
          <button onClick={() => setTestResult(null)} className="p-1 hover:bg-black/5 rounded"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 backdrop-blur-sm" data-testid="preset-modal-backdrop">
          <div className={`bg-white shadow-2xl w-full ${isAdvanced ? 'max-w-7xl' : 'max-w-2xl'} my-4 mx-4 rounded-2xl overflow-hidden flex flex-col`} data-testid="preset-modal">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-primary/5 to-violet-500/5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
                  <Settings className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-foreground truncate" data-testid="modal-title">
                    {editConfig ? 'Edit Preset' : 'Buat Preset Baru'}
                  </h2>
                  <p className="text-xs text-muted-foreground truncate">{PDF_TYPE_LABELS[selectedType] || selectedType}</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-black/5 rounded-lg transition-colors flex-shrink-0" data-testid="modal-close">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Body: split layout */}
            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
              {/* Left: form */}
              <div className={`flex flex-col ${isAdvanced ? 'lg:w-2/5' : 'w-full'} border-r border-border min-h-0`}>
                {/* Common fields */}
                <div className="px-6 pt-4 pb-3 space-y-3 border-b border-border bg-[var(--glass-bg,#f8fafc)] flex-shrink-0">
                  <div>
                    <FieldLabel>Nama Preset</FieldLabel>
                    <TextInput value={formName} onChange={setFormName} placeholder="mis. Default ID, English Compact" data-testid="preset-name-input" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground flex items-center gap-2">
                      <Star className={`w-4 h-4 ${formDefault ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                      Set sebagai default
                    </span>
                    <ToggleSwitch value={formDefault} onChange={setFormDefault} />
                  </div>
                </div>

                {/* Tabs */}
                {isAdvanced ? (
                  <>
                    <div className="px-3 pt-2 flex gap-1 overflow-x-auto bg-white border-b border-border flex-shrink-0">
                      {TAB_LIST.map(t => {
                        const Icon = t.icon;
                        const active = activeTab === t.key;
                        return (
                          <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors whitespace-nowrap ${active ? 'text-primary bg-primary/5 border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
                            data-testid={`tab-${t.key}`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex-1 overflow-y-auto px-6 py-4">
                      {activeTab === 'columns' && (
                        <ColumnsAndSectionsTab
                          columns={columns}
                          formColumns={formColumns}
                          setFormColumns={setFormColumns}
                          sections={typeMeta?.sections || []}
                          formSections={formSections}
                          setFormSections={setFormSections}
                          isAdvanced={isAdvanced}
                        />
                      )}
                      {activeTab === 'header' && (
                        <HeaderFooterTab form={formAdvanced} update={(k, v) => setFormAdvanced(prev => ({ ...prev, [k]: v }))} />
                      )}
                      {activeTab === 'branding' && (
                        <BrandingTab form={formAdvanced} update={(k, v) => setFormAdvanced(prev => ({ ...prev, [k]: v }))} token={token} />
                      )}
                      {activeTab === 'format' && (
                        <FormatLanguageTab form={formAdvanced} update={(k, v) => setFormAdvanced(prev => ({ ...prev, [k]: v }))} />
                      )}
                      {activeTab === 'labels' && (
                        <CustomLabelsTab
                          customizable={typeMeta?.customizable_labels || []}
                          customLabels={formAdvanced.custom_labels}
                          setCustomLabels={(v) => setFormAdvanced(prev => ({ ...prev, custom_labels: typeof v === 'function' ? v(prev.custom_labels) : v }))}
                          language={formAdvanced.language}
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    <ColumnsAndSectionsTab
                      columns={columns}
                      formColumns={formColumns}
                      setFormColumns={setFormColumns}
                      sections={[]}
                      formSections={formSections}
                      setFormSections={setFormSections}
                      isAdvanced={false}
                    />
                  </div>
                )}

                {/* Footer */}
                <div className="px-6 py-3 border-t border-border bg-[var(--glass-bg,#f8fafc)] flex items-center justify-end gap-3 flex-shrink-0">
                  <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg transition-colors" data-testid="modal-cancel">
                    Batal
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:brightness-110 disabled:opacity-50 transition-colors"
                    data-testid="modal-save"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Menyimpan…' : (editConfig ? 'Simpan Perubahan' : 'Simpan Preset')}
                  </button>
                </div>
              </div>

              {/* Right: live preview (advanced types only) */}
              {isAdvanced && (
                <div className="lg:w-3/5 flex flex-col min-h-[300px]">
                  <LivePreviewPane pdfType={selectedType} formState={formPayload} token={token} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
