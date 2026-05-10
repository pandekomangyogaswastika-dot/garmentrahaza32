/**
 * Daily Production Report Module
 * Generate laporan produksi harian dengan export PDF
 * - Date picker untuk pilih tanggal
 * - Optional filter by Work Order
 * - Preview data sebelum download
 * - Export PDF dengan charts (pie chart + bar chart)
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileText, Download, Calendar, Filter, AlertCircle, CheckCircle2,
  TrendingUp, Users, Package, Loader2, RefreshCw, X
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL || '';

export default function DailyProductionReportModule({ token }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedWO, setSelectedWO] = useState('');
  const [woList, setWoList] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Load WO list for filter
  useEffect(() => {
    const loadWOs = async () => {
      try {
        const r = await fetch(`${API}/api/rahaza/work-orders?status=in_production&limit=50`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (r.ok) {
          const data = await r.json();
          setWoList(data);
        }
      } catch (err) {
        console.error('Failed to load WOs', err);
      }
    };
    loadWOs();
  }, [token]);

  // Load report data (preview)
  const loadReportData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date: selectedDate });
      if (selectedWO) params.append('wo_id', selectedWO);
      
      const r = await fetch(`${API}/api/rahaza/reports/daily-production/data?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!r.ok) throw new Error('Failed to fetch report data');
      
      const data = await r.json();
      setReportData(data);
      toast.success('Data berhasil dimuat');
    } catch (err) {
      toast.error(`Gagal memuat data: ${err.message}`);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  // Download PDF
  const downloadPDF = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams({ date: selectedDate });
      if (selectedWO) params.append('wo_id', selectedWO);
      
      const r = await fetch(`${API}/api/rahaza/reports/daily-production/pdf?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!r.ok) throw new Error('Failed to generate PDF');
      
      const blob = await r.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Laporan_Produksi_${selectedDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success('PDF berhasil diunduh!');
    } catch (err) {
      toast.error(`Gagal download PDF: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="h-full flex flex-col bg-background" data-testid="daily-production-report-module">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Laporan Produksi Harian</h1>
            <p className="text-sm text-muted-foreground">Export PDF dengan grafik & detail per operator</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-end gap-4 px-6 py-4 border-b border-border bg-muted/20">
        {/* Date Picker */}
        <div className="flex-1 max-w-xs">
          <label className="block text-sm font-medium text-foreground mb-1.5">
            <Calendar className="w-4 h-4 inline-block mr-1" />
            Tanggal
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground
              focus:outline-none focus:ring-2 focus:ring-primary/40"
            data-testid="date-picker"
          />
        </div>

        {/* WO Filter (Optional) */}
        <div className="flex-1 max-w-md">
          <label className="block text-sm font-medium text-foreground mb-1.5">
            <Filter className="w-4 h-4 inline-block mr-1" />
            Filter Work Order (Opsional)
          </label>
          <select
            value={selectedWO}
            onChange={(e) => setSelectedWO(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground
              focus:outline-none focus:ring-2 focus:ring-primary/40"
            data-testid="wo-filter"
          >
            <option value="">-- Semua WO --</option>
            {woList.map(wo => (
              <option key={wo.id} value={wo.id}>
                {wo.wo_number} - {wo.model_name} {wo.size_name}
              </option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={loadReportData}
            disabled={loading}
            className="flex items-center gap-2"
            data-testid="load-preview-btn"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Preview
          </Button>
          <Button
            onClick={downloadPDF}
            disabled={downloading || !reportData}
            variant="default"
            className="flex items-center gap-2 bg-primary"
            data-testid="download-pdf-btn"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download PDF
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6">
        {!reportData && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
              <FileText className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Pilih Tanggal & Klik Preview</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Pilih tanggal laporan dan klik tombol "Preview" untuk melihat data produksi,
              atau langsung "Download PDF" untuk export.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {reportData && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-4 border-l-4 border-l-primary">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Tanggal</p>
                    <p className="text-sm font-bold text-foreground">{formatDate(reportData.date)}</p>
                  </div>
                  <Calendar className="w-8 h-8 text-primary/20" />
                </div>
              </Card>

              <Card className="p-4 border-l-4 border-l-emerald-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Output</p>
                    <p className="text-lg font-bold text-foreground">{reportData.total_output} <span className="text-sm font-normal">pcs</span></p>
                  </div>
                  <Package className="w-8 h-8 text-emerald-500/20" />
                </div>
              </Card>

              <Card className="p-4 border-l-4 border-l-blue-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Target</p>
                    <p className="text-lg font-bold text-foreground">{reportData.target_output} <span className="text-sm font-normal">pcs</span></p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-blue-500/20" />
                </div>
              </Card>

              <Card className={`p-4 border-l-4 ${reportData.achievement_pct >= 100 ? 'border-l-green-500' : 'border-l-amber-500'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Pencapaian</p>
                    <p className={`text-lg font-bold ${reportData.achievement_pct >= 100 ? 'text-green-600' : 'text-amber-600'}`}>
                      {reportData.achievement_pct}%
                    </p>
                  </div>
                  {reportData.achievement_pct >= 100 ? (
                    <CheckCircle2 className="w-8 h-8 text-green-500/20" />
                  ) : (
                    <AlertCircle className="w-8 h-8 text-amber-500/20" />
                  )}
                </div>
              </Card>
            </div>

            {/* Output per Process */}
            <Card className="p-6">
              <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Output per Proses
              </h3>
              <div className="space-y-4">
                {Object.keys(reportData.summary_by_process).length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Tidak ada data produksi untuk tanggal ini.</p>
                ) : (
                  Object.entries(reportData.summary_by_process).map(([code, proc]) => (
                    <div key={code} className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-foreground">{proc.process_name}</h4>
                        <span className="px-3 py-1 bg-primary/10 text-primary text-sm font-bold rounded-full">
                          {proc.total_qty} pcs
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {proc.operators.sort((a, b) => b.qty - a.qty).map(op => (
                          <div key={op.operator_id} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
                            <div>
                              <p className="text-sm font-medium text-foreground">{op.operator_name}</p>
                              <p className="text-xs text-muted-foreground">{op.operator_code}</p>
                            </div>
                            <span className="text-sm font-bold text-foreground">{op.qty} pcs</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Info Note */}
            <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
              <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-semibold mb-1">File PDF akan berisi:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Pie Chart: Distribusi output per proses</li>
                  <li>Bar Chart: Top 5 operator terbaik hari ini</li>
                  <li>Table detail: Nama | Kode | Proses | Output | Catatan (grouped per proses)</li>
                  <li>Ringkasan total: Output vs Target dengan status pencapaian</li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
