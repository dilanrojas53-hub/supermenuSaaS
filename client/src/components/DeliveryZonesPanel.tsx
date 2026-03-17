/**
 * DeliveryZonesPanel.tsx — Fase 5a+5b Delivery
 * Panel de configuración de zonas de cobertura con tarifas por zona.
 *
 * IMPORTANTE: Usa MapView (proxy Manus) en lugar de cargar Google Maps directamente.
 * El proxy autentica automáticamente sin necesitar VITE_GOOGLE_MAPS_API_KEY.
 * Librerías disponibles: marker, places, geocoding, geometry, drawing
 *
 * Features:
 * - Crear zonas circulares (centro + radio) o poligonales
 * - Tarifa de delivery por zona
 * - Monto mínimo de pedido por zona
 * - ETA estimado por zona
 * - Vista de lista + mapa Google Maps
 * - Activar/desactivar zonas
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { formatPrice } from '@/lib/types';
import { MapView } from '@/components/Map';
import {
  MapPin, Plus, Trash2, Edit2, Save, X, Loader2,
  ToggleLeft, ToggleRight, Circle, Hexagon, DollarSign, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface Tenant { id: string; slug: string; name: string; }

interface DeliveryZone {
  id: string;
  name: string;
  zone_type: 'circle' | 'polygon';
  center_lat: number | null;
  center_lon: number | null;
  radius_km: number | null;
  polygon_coords: [number, number][] | null;
  delivery_fee: number;
  min_order_amount: number;
  estimated_minutes: number;
  is_active: boolean;
  sort_order: number;
}

const DEFAULT_FORM = {
  name: '',
  zone_type: 'circle' as 'circle' | 'polygon',
  center_lat: '',
  center_lon: '',
  radius_km: '3',
  delivery_fee: '1500',
  min_order_amount: '0',
  estimated_minutes: '30',
};

const ZONE_COLORS = ['#3B82F6', '#F59E0B', '#22C55E', '#F97316', '#8B5CF6'];

export default function DeliveryZonesPanel({ tenant }: { tenant: Tenant }) {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const circlesRef = useRef<google.maps.Circle[]>([]);

  // ─── Cargar zonas ──────────────────────────────────────────────────────────
  const fetchZones = useCallback(async () => {
    const { data } = await supabase
      .from('delivery_zones')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('sort_order');
    if (data) setZones(data);
    setLoading(false);
  }, [tenant.id]);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  // ─── Dibujar zonas en el mapa cuando cambian ───────────────────────────────
  const drawZones = useCallback((map: google.maps.Map) => {
    // Limpiar círculos anteriores
    circlesRef.current.forEach(c => c.setMap(null));
    circlesRef.current = [];

    zones
      .filter(z => z.is_active && z.zone_type === 'circle' && z.center_lat && z.center_lon && z.radius_km)
      .forEach((zone, i) => {
        const color = ZONE_COLORS[i % ZONE_COLORS.length];
        const circle = new window.google!.maps.Circle({
          map,
          center: { lat: zone.center_lat!, lng: zone.center_lon! },
          radius: zone.radius_km! * 1000,
          fillColor: color,
          fillOpacity: 0.15,
          strokeColor: color,
          strokeOpacity: 0.8,
          strokeWeight: 2,
        });
        circlesRef.current.push(circle);
      });

    // Centrar en primera zona activa con coordenadas
    const firstWithCoords = zones.find(z => z.center_lat && z.center_lon);
    if (firstWithCoords?.center_lat && firstWithCoords?.center_lon) {
      map.setCenter({ lat: firstWithCoords.center_lat, lng: firstWithCoords.center_lon });
    }
  }, [zones]);

  // Re-dibujar cuando cambian las zonas y el mapa ya está listo
  useEffect(() => {
    if (googleMapRef.current) {
      drawZones(googleMapRef.current);
    }
  }, [zones, drawZones]);

  // ─── Callback cuando el mapa está listo ───────────────────────────────────
  const handleMapReady = useCallback((map: google.maps.Map) => {
    googleMapRef.current = map;
    // Aplicar estilos oscuros
    map.setOptions({
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#1a1f2e' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1f2e' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#8b9db5' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3347' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1623' }] },
      ],
    });
    drawZones(map);
  }, [drawZones]);

  // ─── Detectar ubicación actual para el form ────────────────────────────────
  const detectLocation = () => {
    if (!navigator.geolocation) { toast.error('Geolocalización no disponible'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      setForm(f => ({
        ...f,
        center_lat: pos.coords.latitude.toFixed(6),
        center_lon: pos.coords.longitude.toFixed(6),
      }));
      toast.success('Ubicación detectada');
    }, () => toast.error('No se pudo obtener la ubicación'));
  };

  // ─── Guardar zona ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name) { toast.error('El nombre es obligatorio'); return; }
    if (form.zone_type === 'circle' && (!form.center_lat || !form.center_lon)) {
      toast.error('Las coordenadas del centro son obligatorias'); return;
    }
    setSaving(true);
    const payload = {
      tenant_id: tenant.id,
      name: form.name,
      zone_type: form.zone_type,
      center_lat: form.center_lat ? parseFloat(form.center_lat) : null,
      center_lon: form.center_lon ? parseFloat(form.center_lon) : null,
      radius_km: form.radius_km ? parseFloat(form.radius_km) : null,
      delivery_fee: parseFloat(form.delivery_fee) || 0,
      min_order_amount: parseFloat(form.min_order_amount) || 0,
      estimated_minutes: parseInt(form.estimated_minutes) || 30,
      updated_at: new Date().toISOString(),
    };
    if (editingId) {
      const { error } = await supabase.from('delivery_zones').update(payload).eq('id', editingId);
      if (error) { toast.error('Error: ' + error.message); setSaving(false); return; }
      toast.success('Zona actualizada');
    } else {
      const { error } = await supabase.from('delivery_zones').insert({ ...payload, sort_order: zones.length });
      if (error) { toast.error('Error: ' + error.message); setSaving(false); return; }
      toast.success('Zona creada');
    }
    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
    fetchZones();
  };

  const handleEdit = (zone: DeliveryZone) => {
    setEditingId(zone.id);
    setForm({
      name: zone.name,
      zone_type: zone.zone_type,
      center_lat: zone.center_lat?.toString() || '',
      center_lon: zone.center_lon?.toString() || '',
      radius_km: zone.radius_km?.toString() || '3',
      delivery_fee: zone.delivery_fee.toString(),
      min_order_amount: zone.min_order_amount.toString(),
      estimated_minutes: zone.estimated_minutes.toString(),
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta zona?')) return;
    await supabase.from('delivery_zones').delete().eq('id', id);
    toast.success('Zona eliminada');
    fetchZones();
  };

  const handleToggle = async (zone: DeliveryZone) => {
    await supabase.from('delivery_zones').update({ is_active: !zone.is_active }).eq('id', zone.id);
    fetchZones();
  };

  return (
    <div className="space-y-4">
      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold">Zonas de cobertura</h3>
          <p className="text-slate-400 text-xs mt-0.5">Define las áreas donde hacés delivery y la tarifa por zona</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm(DEFAULT_FORM); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all"
          style={{ background: 'linear-gradient(135deg,#3B82F6,#2563EB)' }}
        >
          <Plus size={14} /> Nueva zona
        </button>
      </div>

      {/* ─── Mapa Google Maps (VITE_GOOGLE_MAPS_API_KEY) ──────────────── */}
      <div
        style={{
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <MapView
          initialCenter={{ lat: 9.9281, lng: -84.0907 }}
          initialZoom={12}
          onMapReady={handleMapReady}
        />
      </div>

      {/* ─── Form ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl p-5 space-y-4"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-white font-bold text-sm">{editingId ? 'Editar zona' : 'Nueva zona'}</h4>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Nombre */}
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400 mb-1 block">Nombre de la zona</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Zona Centro, Zona Norte"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>

              {/* Tipo */}
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400 mb-1 block">Tipo de zona</label>
                <div className="flex gap-2">
                  {[
                    { key: 'circle', label: 'Círculo', icon: <Circle size={14} /> },
                    { key: 'polygon', label: 'Polígono', icon: <Hexagon size={14} /> },
                  ].map(t => (
                    <button
                      key={t.key}
                      onClick={() => setForm(f => ({ ...f, zone_type: t.key as 'circle' | 'polygon' }))}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                        form.zone_type === t.key
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.zone_type === 'circle' && (
                <>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Latitud del centro</label>
                    <input
                      value={form.center_lat}
                      onChange={e => setForm(f => ({ ...f, center_lat: e.target.value }))}
                      placeholder="9.9281"
                      type="number" step="any"
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder-slate-500 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Longitud del centro</label>
                    <input
                      value={form.center_lon}
                      onChange={e => setForm(f => ({ ...f, center_lon: e.target.value }))}
                      placeholder="-84.0907"
                      type="number" step="any"
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder-slate-500 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      onClick={detectLocation}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1.5 transition-colors"
                    >
                      <MapPin size={12} /> Usar mi ubicación actual
                    </button>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Radio (km)</label>
                    <input
                      value={form.radius_km}
                      onChange={e => setForm(f => ({ ...f, radius_km: e.target.value }))}
                      placeholder="3"
                      type="number" step="0.5" min="0.5"
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder-slate-500 outline-none focus:border-blue-500"
                    />
                  </div>
                </>
              )}

              {form.zone_type === 'polygon' && (
                <div className="sm:col-span-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-amber-300 text-xs">
                    Los polígonos se configuran directamente en el mapa. Próximamente disponible el editor visual de polígonos.
                  </p>
                </div>
              )}

              {/* Tarifa */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Tarifa de delivery (₡)</label>
                <input
                  value={form.delivery_fee}
                  onChange={e => setForm(f => ({ ...f, delivery_fee: e.target.value }))}
                  placeholder="1500"
                  type="number" min="0"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>

              {/* Mínimo */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Pedido mínimo (₡)</label>
                <input
                  value={form.min_order_amount}
                  onChange={e => setForm(f => ({ ...f, min_order_amount: e.target.value }))}
                  placeholder="0"
                  type="number" min="0"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>

              {/* ETA */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">ETA estimado (min)</label>
                <input
                  value={form.estimated_minutes}
                  onChange={e => setForm(f => ({ ...f, estimated_minutes: e.target.value }))}
                  placeholder="30"
                  type="number" min="5"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all"
                style={{ background: 'linear-gradient(135deg,#22C55E,#16A34A)' }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editingId ? 'Actualizar' : 'Crear zona'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); }}
                className="px-4 py-2 rounded-xl text-sm font-bold text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Lista de zonas ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="text-blue-400 animate-spin" />
        </div>
      ) : zones.length === 0 ? (
        <div className="text-center py-10 text-slate-500 text-sm">
          <MapPin size={32} className="mx-auto mb-3 opacity-30" />
          <p>Sin zonas configuradas</p>
          <p className="text-xs mt-1">Crea tu primera zona de cobertura</p>
        </div>
      ) : (
        <div className="space-y-2">
          {zones.map((zone, i) => {
            const color = ZONE_COLORS[i % ZONE_COLORS.length];
            return (
              <div
                key={zone.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${zone.is_active ? color + '40' : 'rgba(255,255,255,0.07)'}`,
                  opacity: zone.is_active ? 1 : 0.5,
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <div>
                    <p className="text-white text-sm font-bold">{zone.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-slate-400 text-xs flex items-center gap-1">
                        <MapPin size={10} />
                        {zone.zone_type === 'circle' ? `${zone.radius_km} km radio` : 'Polígono'}
                      </span>
                      <span className="text-slate-400 text-xs flex items-center gap-1">
                        <DollarSign size={10} />
                        {formatPrice(zone.delivery_fee)}
                      </span>
                      <span className="text-slate-400 text-xs flex items-center gap-1">
                        <Clock size={10} />
                        ~{zone.estimated_minutes} min
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleToggle(zone)} className="text-slate-500 hover:text-white transition-colors">
                    {zone.is_active ? <ToggleRight size={18} className="text-green-400" /> : <ToggleLeft size={18} />}
                  </button>
                  <button onClick={() => handleEdit(zone)} className="p-1.5 rounded text-slate-500 hover:text-blue-400 transition-colors">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => handleDelete(zone.id)} className="p-1.5 rounded text-slate-500 hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
