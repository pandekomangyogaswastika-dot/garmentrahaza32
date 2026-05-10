import React, { useState, useEffect } from 'react';
import { 
  Truck, Plus, Search, Calendar, Package, 
  CheckCircle2, XCircle, Clock, Eye, Trash2,
  AlertCircle, ChevronRight, FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const API_BASE = import.meta.env.VITE_API_BASE_URL || process.env.REACT_APP_BACKEND_URL || '';

export default function RahazaDeliveriesModule() {
  const [deliveries, setDeliveries] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    order_id: '',
    delivery_date: new Date().toISOString().split('T')[0],
    do_number: '',
    notes: '',
    items: []
  });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderWOs, setOrderWOs] = useState([]);

  useEffect(() => {
    fetchDeliveries();
    fetchOrders();
  }, [statusFilter]);

  const fetchDeliveries = async () => {
    setLoading(true);
    try {
      let url = `${API_BASE}/api/rahaza/deliveries?limit=100`;
      if (statusFilter !== 'all') {
        url += `&status=${statusFilter}`;
      }
      const res = await fetch(url, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error('Failed to fetch deliveries');
      const data = await res.json();
      setDeliveries(data.items || []);
    } catch (err) {
      console.error('Error fetching deliveries:', err);
      toast.error('Gagal memuat data pengiriman');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      // Fetch orders with completed WOs
      const res = await fetch(`${API_BASE}/api/rahaza/orders?status=in_production&limit=100`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error('Failed to fetch orders');
      const data = await res.json();
      setOrders(data.items || []);
    } catch (err) {
      console.error('Error fetching orders:', err);
    }
  };

  const handleOrderSelect = async (orderId) => {
    setFormData({ ...formData, order_id: orderId, items: [] });
    
    // Fetch completed WOs for this order
    try {
      const res = await fetch(`${API_BASE}/api/rahaza/work-orders?order_id=${orderId}&status=completed&limit=100`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error('Failed to fetch WOs');
      const data = await res.json();
      const wos = data.items || [];
      setOrderWOs(wos);
      
      // Find the selected order
      const order = orders.find(o => o.id === orderId);
      setSelectedOrder(order);
      
      // Get already delivered qty per model+size
      const deliveriesRes = await fetch(`${API_BASE}/api/rahaza/orders/${orderId}/deliveries`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (deliveriesRes.ok) {
        const deliveriesData = await deliveriesRes.json();
        const confirmedDeliveries = (deliveriesData.deliveries || []).filter(d => d.status === 'confirmed');
        
        // Calculate delivered per model+size
        const deliveredMap = {};
        confirmedDeliveries.forEach(dlv => {
          (dlv.items || []).forEach(item => {
            const key = `${item.model_id}_${item.size_id || 'none'}`;
            deliveredMap[key] = (deliveredMap[key] || 0) + (item.qty_requested || 0);
          });
        });
        
        // Auto-populate items from completed WOs
        const items = wos.map(wo => {
          const key = `${wo.model_id}_${wo.size_id || 'none'}`;
          const delivered = deliveredMap[key] || 0;
          const remaining = wo.qty - delivered;
          
          return {
            model_id: wo.model_id,
            model_code: wo.model_code,
            model_name: wo.model_name,
            size_id: wo.size_id,
            size_code: wo.size_code || wo.size_name || '',
            size_name: wo.size_name || wo.size_code || '',
            qty_completed: wo.qty,
            qty_delivered: delivered,
            qty_remaining: remaining,
            qty_requested: remaining > 0 ? remaining : 0, // Default to remaining
            work_order_id: wo.id
          };
        }).filter(item => item.qty_remaining > 0); // Only show items with remaining qty
        
        setFormData({ ...formData, order_id: orderId, items });
      }
      
      if (wos.length === 0) {
        toast.error('Order ini belum memiliki WO yang completed. Tunggu produksi selesai dulu.');
      }
    } catch (err) {
      console.error('Error fetching WOs:', err);
      toast.error('Gagal memuat data Work Order');
    }
  };

  const handleItemQtyChange = (index, newQty) => {
    const items = [...formData.items];
    const item = items[index];
    const qty = parseInt(newQty) || 0;
    
    if (qty > item.qty_remaining) {
      toast.error(`Qty maksimal untuk ${item.model_code} size ${item.size_code}: ${item.qty_remaining} pcs`);
      return;
    }
    
    items[index].qty_requested = qty;
    setFormData({ ...formData, items });
  };

  const handleCreateDelivery = async () => {
    // Validation
    if (!formData.order_id) {
      toast.error('Pilih order/PO terlebih dahulu');
      return;
    }
    
    const itemsToSend = formData.items.filter(item => item.qty_requested > 0);
    if (itemsToSend.length === 0) {
      toast.error('Minimal 1 item dengan qty > 0');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/rahaza/deliveries`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          items: itemsToSend
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to create delivery');
      }
      
      toast.success(data.message || 'Delivery berhasil dibuat! Status: Draft. Confirm untuk mengurangi inventory.');
      setShowCreateModal(false);
      resetForm();
      fetchDeliveries();
    } catch (err) {
      console.error('Error creating delivery:', err);
      toast.error(err.message || 'Gagal membuat delivery');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelivery = async (deliveryId) => {
    if (!window.confirm('Yakin konfirmasi delivery ini? FG inventory akan berkurang dan tidak bisa diubah lagi.')) {
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/rahaza/deliveries/${deliveryId}/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to confirm delivery');
      }
      
      toast.success(data.message || 'Delivery confirmed! FG inventory berkurang.');
      setShowDetailModal(false);
      fetchDeliveries();
    } catch (err) {
      console.error('Error confirming delivery:', err);
      toast.error(err.message || 'Gagal confirm delivery');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDelivery = async (deliveryId) => {
    if (!window.confirm('Yakin hapus delivery ini?')) {
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/rahaza/deliveries/${deliveryId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to delete delivery');
      }
      
      toast.success('Delivery berhasil dihapus');
      setShowDetailModal(false);
      fetchDeliveries();
    } catch (err) {
      console.error('Error deleting delivery:', err);
      toast.error(err.message || 'Gagal hapus delivery');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      order_id: '',
      delivery_date: new Date().toISOString().split('T')[0],
      do_number: '',
      notes: '',
      items: []
    });
    setSelectedOrder(null);
    setOrderWOs([]);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'draft':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          <Clock className="w-3 h-3 mr-1" />
          Draft
        </Badge>;
      case 'confirmed':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Confirmed
        </Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
          <XCircle className="w-3 h-3 mr-1" />
          Cancelled
        </Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredDeliveries = deliveries.filter(d => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.delivery_number?.toLowerCase().includes(q) ||
      d.order_number?.toLowerCase().includes(q) ||
      d.customer_name?.toLowerCase().includes(q) ||
      d.do_number?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Truck className="w-8 h-8 text-blue-600" />
            Pengiriman (Delivery)
          </h1>
          <p className="text-muted-foreground mt-1">
            Kelola pengiriman barang jadi ke customer dengan validasi inventory
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Buat Delivery Baru
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Delivery</p>
                <p className="text-2xl font-bold">{deliveries.length}</p>
              </div>
              <Package className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Draft</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {deliveries.filter(d => d.status === 'draft').length}
                </p>
              </div>
              <Clock className="w-8 h-8 text-yellow-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Confirmed</p>
                <p className="text-2xl font-bold text-green-600">
                  {deliveries.filter(d => d.status === 'confirmed').length}
                </p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Qty Terkirim</p>
                <p className="text-2xl font-bold">
                  {deliveries
                    .filter(d => d.status === 'confirmed')
                    .reduce((sum, d) => sum + (d.total_qty || 0), 0)
                    .toLocaleString()} pcs
                </p>
              </div>
              <Truck className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Cari delivery number, order, customer, DO number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Deliveries List */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Pengiriman</CardTitle>
          <CardDescription>
            {filteredDeliveries.length} delivery ditemukan
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredDeliveries.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 mx-auto text-muted-foreground opacity-50 mb-4" />
              <p className="text-muted-foreground">Belum ada delivery</p>
              <Button onClick={() => setShowCreateModal(true)} variant="outline" className="mt-4">
                Buat Delivery Pertama
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDeliveries.map((delivery) => (
                <div
                  key={delivery.id}
                  className="border rounded-lg p-4 hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => {
                    setSelectedDelivery(delivery);
                    setShowDetailModal(true);
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{delivery.delivery_number}</h3>
                        {getStatusBadge(delivery.status)}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Order</p>
                          <p className="font-medium">{delivery.order_number}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Customer</p>
                          <p className="font-medium">{delivery.customer_name}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Tanggal Kirim</p>
                          <p className="font-medium flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(delivery.delivery_date).toLocaleDateString('id-ID')}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Total Qty</p>
                          <p className="font-medium">{delivery.total_qty?.toLocaleString()} pcs</p>
                        </div>
                      </div>
                      {delivery.do_number && (
                        <p className="text-sm text-muted-foreground mt-2">
                          DO: {delivery.do_number}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Delivery Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buat Delivery Baru</DialogTitle>
            <DialogDescription>
              Pilih order dan isi qty pengiriman. Sistem akan validasi otomatis.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Order Selection */}
            <div>
              <Label>Pilih Order / PO *</Label>
              <Select value={formData.order_id} onValueChange={handleOrderSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih order..." />
                </SelectTrigger>
                <SelectContent>
                  {orders.map(order => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.order_number} - {order.customer_name} ({order.total_qty} pcs)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Delivery Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tanggal Pengiriman *</Label>
                <Input
                  type="date"
                  value={formData.delivery_date}
                  onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                />
              </div>
              <div>
                <Label>DO Number (External)</Label>
                <Input
                  placeholder="DO-2026-XXX"
                  value={formData.do_number}
                  onChange={(e) => setFormData({ ...formData, do_number: e.target.value })}
                />
              </div>
            </div>

            {/* Items */}
            {formData.items.length > 0 && (
              <div>
                <Label className="mb-2 block">Item Pengiriman *</Label>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-3">Model</th>
                        <th className="text-left p-3">Size</th>
                        <th className="text-right p-3">Produksi</th>
                        <th className="text-right p-3">Terkirim</th>
                        <th className="text-right p-3">Sisa</th>
                        <th className="text-right p-3">Qty Kirim *</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.items.map((item, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-3">
                            <div>
                              <p className="font-medium">{item.model_name}</p>
                              <p className="text-xs text-muted-foreground">{item.model_code}</p>
                            </div>
                          </td>
                          <td className="p-3">{item.size_code || item.size_name || '-'}</td>
                          <td className="p-3 text-right">{item.qty_completed?.toLocaleString()}</td>
                          <td className="p-3 text-right">{item.qty_delivered?.toLocaleString()}</td>
                          <td className="p-3 text-right font-semibold">{item.qty_remaining?.toLocaleString()}</td>
                          <td className="p-3">
                            <Input
                              type="number"
                              min="0"
                              max={item.qty_remaining}
                              value={item.qty_requested}
                              onChange={(e) => handleItemQtyChange(idx, e.target.value)}
                              className="w-24 text-right"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted font-semibold">
                      <tr>
                        <td colSpan="5" className="p-3 text-right">Total Qty Kirim:</td>
                        <td className="p-3 text-right">
                          {formData.items.reduce((sum, item) => sum + (item.qty_requested || 0), 0).toLocaleString()} pcs
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  💡 Tip: Qty maksimal = Sisa yang belum dikirim
                </p>
              </div>
            )}

            {formData.order_id && formData.items.length === 0 && (
              <div className="text-center py-8 border rounded-lg bg-muted/50">
                <AlertCircle className="w-12 h-12 mx-auto text-yellow-500 mb-2" />
                <p className="font-medium">Tidak ada item yang bisa dikirim</p>
                <p className="text-sm text-muted-foreground">
                  Semua qty dari order ini sudah dikirim atau belum ada WO completed.
                </p>
              </div>
            )}

            {/* Notes */}
            <div>
              <Label>Catatan</Label>
              <Textarea
                placeholder="Catatan tambahan untuk pengiriman ini..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCreateModal(false);
              resetForm();
            }}>
              Batal
            </Button>
            <Button 
              onClick={handleCreateDelivery} 
              disabled={loading || !formData.order_id || formData.items.filter(i => i.qty_requested > 0).length === 0}
            >
              {loading ? 'Menyimpan...' : 'Buat Delivery'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Delivery Modal */}
      {selectedDelivery && (
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Detail Delivery
              </DialogTitle>
              <DialogDescription>
                {selectedDelivery.delivery_number}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <span className="font-medium">Status:</span>
                {getStatusBadge(selectedDelivery.status)}
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Order Number</Label>
                  <p className="font-medium">{selectedDelivery.order_number}</p>
                </div>
                <div>
                  <Label>Customer</Label>
                  <p className="font-medium">{selectedDelivery.customer_name}</p>
                </div>
                <div>
                  <Label>Tanggal Kirim</Label>
                  <p className="font-medium">
                    {new Date(selectedDelivery.delivery_date).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>
                <div>
                  <Label>DO Number</Label>
                  <p className="font-medium">{selectedDelivery.do_number || '-'}</p>
                </div>
              </div>

              {/* Items */}
              <div>
                <Label className="mb-2 block">Item Detail</Label>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-3">Model</th>
                        <th className="text-left p-3">Size</th>
                        <th className="text-right p-3">Qty</th>
                        <th className="text-left p-3">FG Code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedDelivery.items || []).map((item, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-3">
                            <div>
                              <p className="font-medium">{item.model_name}</p>
                              <p className="text-xs text-muted-foreground">{item.model_code}</p>
                            </div>
                          </td>
                          <td className="p-3">{item.size_code || item.size_name || '-'}</td>
                          <td className="p-3 text-right font-semibold">{item.qty_requested?.toLocaleString()}</td>
                          <td className="p-3 text-xs text-muted-foreground">{item.fg_code}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted font-semibold">
                      <tr>
                        <td colSpan="2" className="p-3 text-right">Total:</td>
                        <td className="p-3 text-right">{selectedDelivery.total_qty?.toLocaleString()} pcs</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Notes */}
              {selectedDelivery.notes && (
                <div>
                  <Label>Catatan</Label>
                  <p className="text-sm p-3 bg-muted rounded">{selectedDelivery.notes}</p>
                </div>
              )}

              {/* Metadata */}
              <div className="text-xs text-muted-foreground space-y-1 pt-4 border-t">
                <p>Dibuat oleh: {selectedDelivery.created_by_name} pada {new Date(selectedDelivery.created_at).toLocaleString('id-ID')}</p>
                {selectedDelivery.confirmed_at && (
                  <p>Dikonfirmasi oleh: {selectedDelivery.confirmed_by_name} pada {new Date(selectedDelivery.confirmed_at).toLocaleString('id-ID')}</p>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              {selectedDelivery.status === 'draft' && (
                <>
                  <Button 
                    variant="destructive" 
                    onClick={() => handleDeleteDelivery(selectedDelivery.id)}
                    disabled={loading}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Hapus
                  </Button>
                  <Button 
                    onClick={() => handleConfirmDelivery(selectedDelivery.id)}
                    disabled={loading}
                    className="gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {loading ? 'Processing...' : 'Confirm Delivery'}
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={() => setShowDetailModal(false)}>
                Tutup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
