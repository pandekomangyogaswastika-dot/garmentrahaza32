import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Calendar, CheckCircle2, XCircle, Eye, Settings,
  RefreshCw, CheckCheck, AlertTriangle
} from 'lucide-react';
import { GlassCard, GlassInput } from '@/components/ui/glass';
import { Button } from '@/components/ui/button';
import Modal from './Modal';
import { StatusBadge } from './moduleAtoms';
import { toast } from 'sonner';

// ─── Status badge helper ───────────────────────────────────────────────────
const STATUS_LABELS = {
  draft: 'Draft',
  pending_approval: 'Menunggu',
  approved: 'Disetujui',
  rejected: 'Ditolak',
};
const STATUS_COLORS = {
  draft: 'bg-slate-400/15 text-slate-300 border-slate-300/20',
  pending_approval: 'bg-amber-400/15 text-amber-300 border-amber-300/20',
  approved: 'bg-emerald-400/15 text-emerald-300 border-emerald-300/20',
  rejected: 'bg-red-400/15 text-red-300 border-red-300/20',
};
function LeaveBadge({ status }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_COLORS[status] || STATUS_COLORS.draft}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default function RahazaLeaveModule({ token }) {
  const [leaves, setLeaves] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [activeTab, setActiveTab] = useState('requests');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);

  // Modals
  const [requestModal, setRequestModal] = useState(false);
  const [typeModal, setTypeModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);  // leave object to reject
  const [rejectReason, setRejectReason] = useState('');

  // Forms
  const [requestForm, setRequestForm] = useState({ employee_id: '', leave_type_id: '', from_date: '', to_date: '', reason: '' });
  const [typeForm, setTypeForm] = useState({ code: '', name: '', paid: true, quota_default: 12, description: '' });

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterStatus ? `?status=${filterStatus}` : '';
      const [lr, lt, emps] = await Promise.all([
        fetch(`/api/rahaza/leaves${params}`, { headers }).then(r => r.ok ? r.json() : []),
        fetch('/api/rahaza/leave-types', { headers }).then(r => r.ok ? r.json() : []),
        fetch('/api/rahaza/employees', { headers }).then(r => r.ok ? r.json() : []),
      ]);
      setLeaves(Array.isArray(lr) ? lr : []);
      setLeaveTypes(Array.isArray(lt) ? lt : []);
      setEmployees(Array.isArray(emps) ? emps : []);
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Counts ────────────────────────────────────────────────────────────────
  const pendingCount = leaves.filter(l => l.status === 'pending_approval').length;

  // ─── Actions ───────────────────────────────────────────────────────────────
  const createRequest = async () => {
    setSaving(true);
    try {
      if (!requestForm.employee_id || !requestForm.leave_type_id || !requestForm.from_date || !requestForm.to_date)
        throw new Error('Semua field wajib diisi.');
      const r = await fetch('/api/rahaza/leaves/request', { method: 'POST', headers, body: JSON.stringify(requestForm) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${r.status}`); }
      toast.success('Request cuti berhasil dibuat');
      setRequestModal(false);
      setRequestForm({ employee_id: '', leave_type_id: '', from_date: '', to_date: '', reason: '' });
      fetchData();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const createLeaveType = async () => {
    setSaving(true);
    try {
      if (!typeForm.code || !typeForm.name) throw new Error('Code & nama wajib diisi.');
      const r = await fetch('/api/rahaza/leave-types', { method: 'POST', headers, body: JSON.stringify(typeForm) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${r.status}`); }
      toast.success('Leave type berhasil dibuat');
      setTypeModal(false);
      setTypeForm({ code: '', name: '', paid: true, quota_default: 12, description: '' });
      fetchData();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const openDetail = async (leave) => {
    const r = await fetch(`/api/rahaza/leaves/${leave.id}`, { headers });
    if (r.ok) { setSelectedLeave(await r.json()); setDetailModal(true); }
  };

  /* Approve single — no window.confirm */
  const approveLeave = async (leave) => {
    const r = await fetch(`/api/rahaza/leaves/${leave.id}/approve`, { method: 'POST', headers });
    if (r.ok) {
      toast.success(`Cuti ${leave.employee_name} disetujui ✓`);
      fetchData();
      if (detailModal && selectedLeave?.id === leave.id) openDetail(leave);
    } else toast.error('Gagal approve request');
  };

  /* Reject — uses inline modal, no prompt() */
  const openReject = (leave) => { setRejectModal(leave); setRejectReason(''); };
  const confirmReject = async () => {
    if (!rejectModal) return;
    const r = await fetch(`/api/rahaza/leaves/${rejectModal.id}/reject`, {
      method: 'POST', headers, body: JSON.stringify({ reason: rejectReason || 'Ditolak oleh atasan' }),
    });
    if (r.ok) {
      toast.success(`Cuti ${rejectModal.employee_name} ditolak.`);
      setRejectModal(null);
      fetchData();
      if (detailModal && selectedLeave?.id === rejectModal.id) openDetail(rejectModal);
    } else toast.error('Gagal tolak request');
  };

  const deleteLeave = async (leave) => {
    const r = await fetch(`/api/rahaza/leaves/${leave.id}`, { method: 'DELETE', headers });
    if (r.ok) { toast.success('Request dihapus'); fetchData(); setDetailModal(false); }
    else toast.error('Gagal menghapus request');
  };

  /* Setujui Semua Tertunda */
  const bulkApproveAll = async () => {
    setBulkApproving(true);
    try {
      const r = await fetch('/api/rahaza/leaves/bulk-approve', { method: 'POST', headers, body: JSON.stringify({}) });
      if (r.ok) {
        const d = await r.json();
        toast.success(d.message || `${d.approved} request cuti disetujui.`);
        fetchData();
      } else toast.error('Gagal bulk approve.');
    } finally { setBulkApproving(false); }
  };

  // ─── Filtered list ─────────────────────────────────────────────────────────
  const leaveRequests = filterStatus ? leaves.filter(l => l.status === filterStatus) : leaves;

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-5" data-testid="leave-management-page">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Manajemen Izin &amp; Cuti</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Kelola pengajuan cuti karyawan dengan workflow approval dan tracking saldo cuti.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeTab === 'requests' && (
            <>
              {/* Pending count + bulk approve */}
              {pendingCount > 0 && (
                <Button
                  variant="ghost"
                  className="h-9 border border-emerald-400/30 bg-emerald-400/8 text-emerald-400 hover:bg-emerald-400/15 gap-1.5"
                  onClick={bulkApproveAll}
                  disabled={bulkApproving}
                  data-testid="leave-bulk-approve"
                  title={`Setujui semua ${pendingCount} request yang menunggu`}
                >
                  {bulkApproving
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : <CheckCheck className="w-3.5 h-3.5" />}
                  Setujui Semua
                  <span className="bg-emerald-400 text-black text-[10px] font-bold rounded-full w-4 h-4 grid place-items-center">{pendingCount}</span>
                </Button>
              )}

              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="h-9 px-3 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-sm text-foreground"
                data-testid="leave-filter-status"
              >
                <option value="">Semua Status</option>
                <option value="pending_approval">Menunggu ({pendingCount})</option>
                <option value="approved">Disetujui</option>
                <option value="rejected">Ditolak</option>
              </select>
              <Button onClick={() => setRequestModal(true)} data-testid="leave-request-btn">
                <Plus className="w-4 h-4 mr-1.5" /> Request Cuti
              </Button>
            </>
          )}
          {activeTab === 'types' && (
            <Button onClick={() => setTypeModal(true)} data-testid="leave-type-btn">
              <Plus className="w-4 h-4 mr-1.5" /> Tambah Tipe
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--glass-border)]">
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'requests' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          data-testid="tab-requests"
        >
          <Calendar className="w-4 h-4" />
          Request Cuti
          {pendingCount > 0 && (
            <span className="bg-amber-400 text-black text-[10px] font-bold rounded-full w-4 h-4 grid place-items-center">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('types')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'types' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          data-testid="tab-types"
        >
          <Settings className="w-4 h-4" />
          Tipe Cuti
        </button>
      </div>

      {/* Leave Requests Tab */}
      {activeTab === 'requests' && (
        <GlassCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--glass-border)]">
                <tr className="text-left text-muted-foreground">
                  <th className="pb-3 pl-4 font-semibold">Karyawan</th>
                  <th className="pb-3 font-semibold">Tipe Cuti</th>
                  <th className="pb-3 font-semibold">Tanggal</th>
                  <th className="pb-3 font-semibold">Durasi</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 pr-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                {leaveRequests.length === 0 && (
                  <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <Calendar className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>Belum ada request cuti{filterStatus ? ` dengan status "${filterStatus}"` : ''}.</p>
                  </td></tr>
                )}
                {leaveRequests.map((leave, idx) => (
                  <tr key={leave.id}
                    className={`border-b border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] transition-colors ${
                      idx % 2 === 0 ? 'bg-[var(--glass-bg)]/30' : ''
                    }`}
                    data-testid={`leave-row-${leave.id}`}
                  >
                    <td className="py-3 pl-4">
                      <div className="font-medium">{leave.employee_name}</div>
                      <div className="text-xs text-muted-foreground">{leave.employee_code}</div>
                    </td>
                    <td className="py-3">
                      <div>{leave.leave_type_name}</div>
                      <div className="text-xs text-muted-foreground">{leave.is_paid ? 'Paid' : 'Unpaid'}</div>
                    </td>
                    <td className="py-3 text-xs">
                      {new Date(leave.from_date).toLocaleDateString('id-ID')} –{' '}
                      {new Date(leave.to_date).toLocaleDateString('id-ID')}
                    </td>
                    <td className="py-3 font-semibold">{leave.duration_days} hari</td>
                    <td className="py-3"><LeaveBadge status={leave.status} /></td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openDetail(leave)}
                          data-testid={`leave-view-${leave.id}`} title="Detail">
                          <Eye className="w-4 h-4" />
                        </Button>
                        {leave.status === 'pending_approval' && (
                          <>
                            {/* ✓ Setujui — satu klik, tanpa dialog */}
                            <button
                              onClick={() => approveLeave(leave)}
                              data-testid={`leave-approve-${leave.id}`}
                              title="Setujui"
                              className="h-7 px-2 rounded border border-emerald-400/30 bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 transition-colors flex items-center gap-1 text-xs font-semibold"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Setujui
                            </button>
                            {/* ✗ Tolak — buka modal alasan */}
                            <button
                              onClick={() => openReject(leave)}
                              data-testid={`leave-reject-${leave.id}`}
                              title="Tolak"
                              className="h-7 px-2 rounded border border-red-400/30 bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors flex items-center gap-1 text-xs font-semibold"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Tolak
                            </button>
                          </>
                        )}
                        {(leave.status === 'draft' || leave.status === 'rejected') && (
                          <button
                            onClick={() => deleteLeave(leave)}
                            className="h-7 px-2 rounded border border-[var(--glass-border)] bg-[var(--glass-bg)] text-foreground/50 hover:text-red-400 hover:border-red-400/30 transition-colors text-xs"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Leave Types Tab */}
      {activeTab === 'types' && (
        <GlassCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--glass-border)]">
                <tr className="text-left text-muted-foreground">
                  <th className="pb-3 pl-4 font-semibold">Kode</th>
                  <th className="pb-3 font-semibold">Nama</th>
                  <th className="pb-3 font-semibold">Paid/Unpaid</th>
                  <th className="pb-3 font-semibold">Quota Default</th>
                  <th className="pb-3 pr-4 font-semibold">Deskripsi</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                {leaveTypes.length === 0 && (
                  <tr><td colSpan={5} className="py-12 text-center text-muted-foreground"><Settings className="w-12 h-12 mx-auto mb-2 opacity-30" /><p>Belum ada tipe cuti.</p></td></tr>
                )}
                {leaveTypes.map((lt, idx) => (
                  <tr key={lt.id} className={`border-b border-[var(--glass-border)] ${idx % 2 === 0 ? 'bg-[var(--glass-bg)]/30' : ''}`} data-testid={`leave-type-${lt.code}`}>
                    <td className="py-3 pl-4 font-mono text-xs font-semibold">{lt.code}</td>
                    <td className="py-3 font-medium">{lt.name}</td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${lt.paid ? 'bg-emerald-400/15 text-emerald-300' : 'bg-slate-400/15 text-slate-300'}`}>
                        {lt.paid ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td className="py-3">{lt.quota_default} hari/tahun</td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">{lt.description || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* ─── Request Leave Modal ─── */}
      {requestModal && (
        <Modal onClose={() => setRequestModal(false)} title="Request Cuti Baru">
          <div className="space-y-4">
            <div><label className="block text-sm font-medium mb-1.5">Karyawan *</label>
              <select value={requestForm.employee_id} onChange={e => setRequestForm({ ...requestForm, employee_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-foreground text-sm" data-testid="request-form-employee">
                <option value="">Pilih karyawan...</option>
                {employees.filter(e => e.active).map(emp => <option key={emp.id} value={emp.id}>{emp.employee_code} - {emp.name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium mb-1.5">Tipe Cuti *</label>
              <select value={requestForm.leave_type_id} onChange={e => setRequestForm({ ...requestForm, leave_type_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-foreground text-sm" data-testid="request-form-type">
                <option value="">Pilih tipe cuti...</option>
                {leaveTypes.filter(lt => lt.active).map(lt => <option key={lt.id} value={lt.id}>{lt.name} ({lt.paid ? 'Paid' : 'Unpaid'})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1.5">Dari Tanggal *</label><GlassInput type="date" value={requestForm.from_date} onChange={e => setRequestForm({ ...requestForm, from_date: e.target.value })} data-testid="request-form-from" /></div>
              <div><label className="block text-sm font-medium mb-1.5">Sampai Tanggal *</label><GlassInput type="date" value={requestForm.to_date} onChange={e => setRequestForm({ ...requestForm, to_date: e.target.value })} data-testid="request-form-to" /></div>
            </div>
            <div><label className="block text-sm font-medium mb-1.5">Alasan</label>
              <textarea value={requestForm.reason} onChange={e => setRequestForm({ ...requestForm, reason: e.target.value })} placeholder="Alasan pengajuan cuti..." className="w-full px-3 py-2 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-foreground text-sm" rows={3} data-testid="request-form-reason" />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-[var(--glass-border)]">
              <Button variant="secondary" onClick={() => setRequestModal(false)}>Batal</Button>
              <Button onClick={createRequest} disabled={saving} data-testid="request-form-submit">{saving ? 'Menyimpan...' : 'Ajukan Request'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Create Leave Type Modal ─── */}
      {typeModal && (
        <Modal onClose={() => setTypeModal(false)} title="Tambah Tipe Cuti Baru">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1.5">Kode *</label><GlassInput value={typeForm.code} onChange={e => setTypeForm({ ...typeForm, code: e.target.value.toUpperCase() })} placeholder="TAHUNAN" data-testid="type-form-code" /></div>
              <div><label className="block text-sm font-medium mb-1.5">Nama *</label><GlassInput value={typeForm.name} onChange={e => setTypeForm({ ...typeForm, name: e.target.value })} placeholder="Cuti Tahunan" data-testid="type-form-name" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1.5">Paid/Unpaid</label>
                <select value={typeForm.paid ? 'paid' : 'unpaid'} onChange={e => setTypeForm({ ...typeForm, paid: e.target.value === 'paid' })} className="w-full px-3 py-2 rounded-lg border border-[var(--glass-border)] bg-[var(--input-surface)] text-foreground text-sm" data-testid="type-form-paid">
                  <option value="paid">Paid</option><option value="unpaid">Unpaid</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1.5">Quota Default (hari/tahun)</label><GlassInput type="number" value={typeForm.quota_default} onChange={e => setTypeForm({ ...typeForm, quota_default: Number(e.target.value) })} data-testid="type-form-quota" /></div>
            </div>
            <div><label className="block text-sm font-medium mb-1.5">Deskripsi</label><GlassInput value={typeForm.description} onChange={e => setTypeForm({ ...typeForm, description: e.target.value })} placeholder="Opsional" /></div>
            <div className="flex justify-end gap-2 pt-4 border-t border-[var(--glass-border)]">
              <Button variant="secondary" onClick={() => setTypeModal(false)}>Batal</Button>
              <Button onClick={createLeaveType} disabled={saving} data-testid="type-form-submit">{saving ? 'Menyimpan...' : 'Buat Tipe Cuti'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Detail Modal ─── */}
      {detailModal && selectedLeave && (
        <Modal onClose={() => setDetailModal(false)} title={`Detail Request Cuti`} size="lg">
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-muted-foreground">Karyawan:</span><span className="ml-2 font-semibold">{selectedLeave.employee_name}</span></div>
              <div><span className="text-muted-foreground">Status:</span><span className="ml-2"><LeaveBadge status={selectedLeave.status} /></span></div>
              <div><span className="text-muted-foreground">Tipe:</span><span className="ml-2">{selectedLeave.leave_type_name}</span></div>
              <div><span className="text-muted-foreground">Durasi:</span><span className="ml-2 font-semibold">{selectedLeave.duration_days} hari</span></div>
              <div><span className="text-muted-foreground">Dari:</span><span className="ml-2">{selectedLeave.from_date}</span></div>
              <div><span className="text-muted-foreground">Sampai:</span><span className="ml-2">{selectedLeave.to_date}</span></div>
            </div>
            {selectedLeave.reason && <div className="bg-[var(--glass-bg)] rounded-lg p-3 text-xs text-foreground/80"><span className="text-muted-foreground font-medium">Alasan:</span> {selectedLeave.reason}</div>}
            {selectedLeave.rejected_reason && <div className="bg-red-400/8 border border-red-400/20 rounded-lg p-3 text-xs text-red-300"><span className="font-medium">Alasan Tolak:</span> {selectedLeave.rejected_reason}</div>}
            {selectedLeave.approved_by_name && <div className="text-xs text-muted-foreground">Disetujui oleh: {selectedLeave.approved_by_name}</div>}
            <div className="flex justify-end gap-2 pt-4 border-t border-[var(--glass-border)]">
              {selectedLeave.status === 'pending_approval' && (
                <>
                  <button onClick={() => { approveLeave(selectedLeave); setDetailModal(false); }} className="h-8 px-3 rounded border border-emerald-400/30 bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 transition-colors text-xs font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Setujui
                  </button>
                  <button onClick={() => { openReject(selectedLeave); setDetailModal(false); }} className="h-8 px-3 rounded border border-red-400/30 bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors text-xs font-semibold flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> Tolak
                  </button>
                </>
              )}
              {(selectedLeave.status === 'draft' || selectedLeave.status === 'rejected') && (
                <button onClick={() => deleteLeave(selectedLeave)} className="h-8 px-3 rounded border border-red-400/30 bg-red-400/10 text-red-400 text-xs font-semibold">Hapus</button>
              )}
              <Button variant="ghost" onClick={() => setDetailModal(false)} className="border border-[var(--glass-border)]">Tutup</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Reject Reason Modal ─── */}
      {rejectModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h3 className="font-semibold text-foreground">Alasan Penolakan</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Tolak request cuti <strong>{rejectModal.employee_name}</strong> ({rejectModal.duration_days} hari)?
            </p>
            <GlassInput
              placeholder="Masukkan alasan (opsional)"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              autoFocus
              data-testid="reject-reason-input"
            />
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" onClick={() => setRejectModal(null)} className="border border-[var(--glass-border)]">Batal</Button>
              <button
                onClick={confirmReject}
                className="h-9 px-4 rounded-lg border border-red-400/30 bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors text-sm font-semibold"
                data-testid="reject-confirm-btn"
              >
                Ya, Tolak
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
