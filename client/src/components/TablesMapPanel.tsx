/**
 * TablesMapPanel — Mapa visual de mesas del restaurante
 * - Admin: ve todas las mesas, puede liberar mesas manualmente
 * - Staff: ve el estado de mesas en tiempo real
 * - Mesas rojas = ocupadas, verdes = libres
 * - Click en mesa ocupada muestra el pedido activo
 */
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, RefreshCw, X, ChefHat, Clock, UtensilsCrossed } from 'lucide-react';
import { formatPrice } from '@/lib/types';

interface RestaurantTable {
  id: string;
  table_number: string;
  label: string | null;
  capacity: number | null;
  is_occupied: boolean;
  current_order_id: string | null;
  sort_order: number;
}

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

interface ActiveOrder {
  id: string;
  order_number: number;
  customer_name: string;
  items: OrderItem[];
  total: number;
  status: string;
  created_at: string;
  payment_method: string;
  payment_status: string;
}

interface Props {
  tenant: { id: string; slug?: string; name: string };
}

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_cocina: 'En cocina',
  listo: 'Listo',
  entregado: 'Entregado',
};

const STATUS_COLORS: Record<string, string> = {
  pendiente: '#F59E0B',
  en_cocina: '#F97316',
  listo: '#22c55e',
  entregado: '#6366f1',
};

export default function TablesMapPanel({ tenant }: Props) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [liberating, setLiberating] = useState(false);

  const fetchTables = useCallback(async () => {
    const { data } = await supabase
      .from('restaurant_tables')
      .select('id, table_number, label, capacity, is_occupied, current_order_id, sort_order')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('table_number', { ascending: true });
    setTables((data || []) as RestaurantTable[]);
    setLoading(false);
  }, [tenant.id]);

  useEffect(() => {
    fetchTables();

    // Realtime subscription para actualizaciones en tiempo real
    const channel = supabase
      .channel(`tables_${tenant.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'restaurant_tables',
        filter: `tenant_id=eq.${tenant.id}`,
      }, () => {
        fetchTables();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchTables, tenant.id]);

  const handleTableClick = async (table: RestaurantTable) => {
    setSelectedTable(table);
    if (table.is_occupied && table.current_order_id) {
      setLoadingOrder(true);
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, items, total, status, created_at, payment_method, payment_status')
        .eq('id', table.current_order_id)
        .single();
      setActiveOrder(data as ActiveOrder | null);
      setLoadingOrder(false);
    } else {
      setActiveOrder(null);
    }
  };

  const handleLiberateTable = async (tableId: string) => {
    if (!confirm('¿Liberar esta mesa? Esto la marcará como disponible.')) return;
    setLiberating(true);
    const { error } = await supabase
      .from('restaurant_tables')
      .update({ is_occupied: false, current_order_id: null, occupied_at: null })
      .eq('id', tableId);
    setLiberating(false);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Mesa liberada');
    setSelectedTable(null);
    setActiveOrder(null);
    fetchTables();
  };

  const occupiedCount = tables.filter(t => t.is_occupied).length;
  const freeCount = tables.filter(t => !t.is_occupied).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="text-amber-400 animate-spin" />
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="text-center py-16">
        <UtensilsCrossed size={36} className="text-slate-700 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-400">No hay mesas configuradas</p>
        <p className="text-xs text-slate-600 mt-1">
          Ve a Configuración → Mesas del Restaurante para agregar mesas.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header con estadísticas */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-xs font-bold text-red-400">{occupiedCount} ocupadas</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span className="text-xs font-bold text-green-400">{freeCount} libres</span>
          </div>
        </div>
        <button
          onClick={fetchTables}
          className="p-2 rounded-xl bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
          title="Actualizar"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Mapa de mesas */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 mb-6">
        {tables.map(table => (
          <button
            key={table.id}
            onClick={() => handleTableClick(table)}
            className="relative flex flex-col items-center justify-center p-4 rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              backgroundColor: table.is_occupied
                ? 'rgba(239,68,68,0.12)'
                : 'rgba(34,197,94,0.08)',
              border: `2px solid ${table.is_occupied ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.3)'}`,
              boxShadow: table.is_occupied
                ? '0 4px 16px rgba(239,68,68,0.15)'
                : '0 4px 16px rgba(34,197,94,0.08)',
            }}
          >
            {/* Indicador de estado */}
            <div
              className="w-3 h-3 rounded-full mb-2"
              style={{
                backgroundColor: table.is_occupied ? '#ef4444' : '#22c55e',
                boxShadow: `0 0 8px ${table.is_occupied ? 'rgba(239,68,68,0.6)' : 'rgba(34,197,94,0.5)'}`,
              }}
            />
            {/* Número de mesa */}
            <span
              className="text-lg font-black leading-none"
              style={{ color: table.is_occupied ? '#fca5a5' : '#86efac' }}
            >
              {table.table_number}
            </span>
            {/* Etiqueta */}
            {table.label && (
              <span className="text-[9px] mt-0.5 font-medium" style={{ color: table.is_occupied ? 'rgba(252,165,165,0.7)' : 'rgba(134,239,172,0.7)' }}>
                {table.label}
              </span>
            )}
            {/* Capacidad */}
            {table.capacity && (
              <span className="text-[9px] mt-0.5" style={{ color: 'rgba(148,163,184,0.6)' }}>
                {table.capacity} pax
              </span>
            )}
            {/* Estado texto */}
            <span
              className="text-[9px] font-bold mt-1.5 px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: table.is_occupied ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.15)',
                color: table.is_occupied ? '#fca5a5' : '#86efac',
              }}
            >
              {table.is_occupied ? 'OCUPADA' : 'LIBRE'}
            </span>
          </button>
        ))}
      </div>

      {/* Panel de detalle de mesa seleccionada */}
      {selectedTable && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              backgroundColor: selectedTable.is_occupied ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.06)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-base"
                style={{
                  backgroundColor: selectedTable.is_occupied ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.15)',
                  color: selectedTable.is_occupied ? '#fca5a5' : '#86efac',
                }}
              >
                {selectedTable.table_number}
              </div>
              <div>
                <p className="text-sm font-black text-white">
                  Mesa {selectedTable.table_number}
                  {selectedTable.label && <span className="text-slate-400 font-normal ml-1">· {selectedTable.label}</span>}
                </p>
                <p className="text-xs" style={{ color: selectedTable.is_occupied ? '#fca5a5' : '#86efac' }}>
                  {selectedTable.is_occupied ? '🔴 Ocupada' : '🟢 Libre'}
                  {selectedTable.capacity && ` · ${selectedTable.capacity} pax`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedTable.is_occupied && (
                <button
                  onClick={() => handleLiberateTable(selectedTable.id)}
                  disabled={liberating}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 transition-colors disabled:opacity-50"
                >
                  {liberating ? 'Liberando...' : '✓ Liberar mesa'}
                </button>
              )}
              <button
                onClick={() => { setSelectedTable(null); setActiveOrder(null); }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Contenido del detalle */}
          <div className="p-5">
            {!selectedTable.is_occupied ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                  <UtensilsCrossed size={20} className="text-green-400" />
                </div>
                <p className="text-sm font-bold text-green-400">Mesa disponible</p>
                <p className="text-xs text-slate-500 mt-1">No hay pedidos activos en esta mesa</p>
              </div>
            ) : loadingOrder ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="text-amber-400 animate-spin" />
              </div>
            ) : activeOrder ? (
              <div className="space-y-4">
                {/* Info del pedido */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black text-white">Pedido #{activeOrder.order_number}</p>
                    <p className="text-xs text-slate-400">{activeOrder.customer_name}</p>
                  </div>
                  <div className="text-right">
                    <div
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: `${STATUS_COLORS[activeOrder.status] || '#64748b'}20`,
                        color: STATUS_COLORS[activeOrder.status] || '#94a3b8',
                        border: `1px solid ${STATUS_COLORS[activeOrder.status] || '#64748b'}40`,
                      }}
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: STATUS_COLORS[activeOrder.status] || '#64748b' }}
                      />
                      {STATUS_LABELS[activeOrder.status] || activeOrder.status}
                    </div>
                  </div>
                </div>

                {/* Tiempo transcurrido */}
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock size={11} />
                  <span>
                    {Math.floor((Date.now() - new Date(activeOrder.created_at).getTime()) / 60000)} min en mesa
                  </span>
                  <span className="text-slate-700">·</span>
                  <span className="capitalize">{activeOrder.payment_method}</span>
                </div>

                {/* Items del pedido */}
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ backgroundColor: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="px-4 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <div className="flex items-center gap-2">
                      <ChefHat size={12} className="text-amber-400" />
                      <p className="text-xs font-bold text-slate-300">Pedido</p>
                    </div>
                  </div>
                  <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                    {(Array.isArray(activeOrder.items) ? activeOrder.items : []).map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0"
                            style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}
                          >
                            {item.quantity}
                          </span>
                          <span className="text-xs text-slate-200">{item.name}</span>
                        </div>
                        <span className="text-xs text-slate-400">{formatPrice(item.price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(15,23,42,0.4)' }}>
                    <span className="text-xs font-bold text-slate-300">Total</span>
                    <span className="text-sm font-black text-amber-400">{formatPrice(activeOrder.total)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-xs text-slate-500">No se encontró el pedido activo</p>
                <button
                  onClick={() => handleLiberateTable(selectedTable.id)}
                  className="mt-3 px-4 py-2 rounded-lg text-xs font-bold bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 transition-colors"
                >
                  Liberar mesa manualmente
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
