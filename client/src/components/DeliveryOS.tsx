/**
 * DeliveryOS.tsx — Módulo exclusivo de Delivery para el AdminDashboard
 *
 * Subtabs: General | Cobertura | Tarifas | Pagos | Flujo | Riders | Operaciones | Historial
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Truck, MapPin, DollarSign, CreditCard, Settings2, Users, Activity, Clock,
  Plus, Trash2, Save, AlertCircle, CheckCircle2, ToggleLeft, ToggleRight,
  Zap, ChefHat, Package, Navigation, Bike, Info, X
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Tenant } from '@/lib/types';
import {
  type DeliveryConfig,
  type DeliveryDistanceRange,
  DEFAULT_DELIVERY_CONFIG,
  validateDistanceRanges,
  validatePaymentConfig,
  generateRangeId,
  COMPLETION_MODE_LABELS,
  DISPATCH_TRIGGER_LABELS,
  SINPE_BLOCK_MODE_LABELS,
} from '@/lib/deliveryConfig';
import DeliveryDispatchPanel from './DeliveryDispatchPanel';
import DeliveryOpsPanel from './DeliveryOpsPanel';
import DeliveryHistoryPanel from './DeliveryHistoryPanel';
import DeliveryZonesPanel from './DeliveryZonesPanel';

// ─── Tipos internos ────────────────────────────────────────────────────────────

type DeliveryOSTab =
  | 'general'
  | 'cobertura'
  | 'tarifas'
  | 'pagos'
  | 'flujo'
  | 'riders'
  | 'operaciones'
  | 'historial';

const SUBTABS: { key: DeliveryOSTab; label: string; icon: React.ReactNode }[] = [
  { key: 'general',     label: 'General',      icon: <Settings2 size={14} /> },
  { key: 'cobertura',   label: 'Cobertura',    icon: <MapPin size={14} /> },
  { key: 'tarifas',     label: 'Tarifas',      icon: <DollarSign size={14} /> },
  { key: 'pagos',       label: 'Pagos',        icon: <CreditCard size={14} /> },
  { key: 'flujo',       label: 'Flujo',        icon: <Zap size={14} /> },
  { key: 'riders',      label: 'Riders',       icon: <Bike size={14} /> },
  { key: 'operaciones', label: 'Operaciones',  icon: <Activity size={14} /> },
  { key: 'historial',   label: 'Historial',    icon: <Clock size={14} /> },
];

// ─── Toggle Switch ─────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  description,
  accent = '#F97316',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  accent?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{description}</p>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="flex-shrink-0 relative w-11 h-6 rounded-full transition-all duration-200 focus:outline-none"
        style={{
          backgroundColor: checked ? accent : 'rgba(255,255,255,0.12)',
          boxShadow: checked ? `0 0 0 3px ${accent}33` : 'none',
        }}
        aria-checked={checked}
        role="switch"
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200"
          style={{ left: checked ? '22px' : '2px' }}
        />
      </button>
    </div>
  );
}

// ─── Input con label ───────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>{hint}</p>}
    </div>
  );
}

function Input({
  value,
  onChange,
  type = 'text',
  placeholder,
  min,
  max,
  step,
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      }}
    />
  );
}

// ─── Sección con título ────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
  accent = '#F97316',
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div
      className="rounded-xl p-5 space-y-4"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
      }}
    >
      {(title || icon) && (
        <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
          {icon && <span style={{ color: accent }}>{icon}</span>}
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Botón de guardar ──────────────────────────────────────────────────────────

function SaveButton({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
      style={{ background: 'linear-gradient(135deg,#F97316,#EF4444)', color: '#fff' }}
    >
      <Save size={14} />
      {saving ? 'Guardando...' : 'Guardar cambios'}
    </button>
  );
}

// ─── Hook para cargar/guardar config ──────────────────────────────────────────

function useDeliveryConfig(tenantId: string) {
  const [config, setConfig] = useState<DeliveryConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('delivery_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (data) {
      setConfig({
        tenant_id: tenantId,
        delivery_enabled: data.delivery_enabled ?? DEFAULT_DELIVERY_CONFIG.delivery_enabled,
        orders_enabled: data.orders_enabled ?? DEFAULT_DELIVERY_CONFIG.orders_enabled,
        dine_in_orders_enabled: data.dine_in_orders_enabled ?? DEFAULT_DELIVERY_CONFIG.dine_in_orders_enabled,
        takeout_orders_enabled: data.takeout_orders_enabled ?? DEFAULT_DELIVERY_CONFIG.takeout_orders_enabled,
        delivery_orders_enabled: data.delivery_orders_enabled ?? DEFAULT_DELIVERY_CONFIG.delivery_orders_enabled,
        closed_message: data.closed_message ?? DEFAULT_DELIVERY_CONFIG.closed_message,
        restaurant_lat: data.restaurant_lat ?? null,
        restaurant_lon: data.restaurant_lon ?? null,
        coverage_radius_km: data.coverage_radius_km ?? DEFAULT_DELIVERY_CONFIG.coverage_radius_km,
        delivery_fee: data.delivery_fee ?? DEFAULT_DELIVERY_CONFIG.delivery_fee,
        base_km: data.base_km ?? DEFAULT_DELIVERY_CONFIG.base_km,
        distance_ranges: data.distance_ranges ?? [],
        allow_manual_fee: data.allow_manual_fee ?? DEFAULT_DELIVERY_CONFIG.allow_manual_fee,
        manual_fee_message: data.manual_fee_message ?? DEFAULT_DELIVERY_CONFIG.manual_fee_message,
        fee_variability_msg: data.fee_variability_msg ?? DEFAULT_DELIVERY_CONFIG.fee_variability_msg,
        fee_presets: data.fee_presets ?? DEFAULT_DELIVERY_CONFIG.fee_presets,
        sinpe_enabled: data.sinpe_enabled ?? DEFAULT_DELIVERY_CONFIG.sinpe_enabled,
        efectivo_enabled: data.efectivo_enabled ?? DEFAULT_DELIVERY_CONFIG.efectivo_enabled,
        tarjeta_enabled: data.tarjeta_enabled ?? DEFAULT_DELIVERY_CONFIG.tarjeta_enabled,
        requires_payment_before_kitchen: data.requires_payment_before_kitchen ?? DEFAULT_DELIVERY_CONFIG.requires_payment_before_kitchen,
        requires_manual_approval: data.requires_manual_approval ?? DEFAULT_DELIVERY_CONFIG.requires_manual_approval,
        rider_dispatch_trigger: data.rider_dispatch_trigger ?? DEFAULT_DELIVERY_CONFIG.rider_dispatch_trigger,
        rider_dispatch_minutes_before: data.rider_dispatch_minutes_before ?? DEFAULT_DELIVERY_CONFIG.rider_dispatch_minutes_before,
        completion_mode: data.completion_mode ?? DEFAULT_DELIVERY_CONFIG.completion_mode,
        base_eta_minutes: data.base_eta_minutes ?? DEFAULT_DELIVERY_CONFIG.base_eta_minutes,
        base_prep_minutes: data.base_prep_minutes ?? DEFAULT_DELIVERY_CONFIG.base_prep_minutes,
        extra_prep_minutes: data.extra_prep_minutes ?? DEFAULT_DELIVERY_CONFIG.extra_prep_minutes,
        min_pickup_minutes: data.min_pickup_minutes ?? DEFAULT_DELIVERY_CONFIG.min_pickup_minutes,
        commit_buffer_pct: data.commit_buffer_pct ?? DEFAULT_DELIVERY_CONFIG.commit_buffer_pct,
        max_wait_minutes: data.max_wait_minutes ?? DEFAULT_DELIVERY_CONFIG.max_wait_minutes,
        min_order_amount: data.min_order_amount ?? DEFAULT_DELIVERY_CONFIG.min_order_amount,
      });
    } else {
      setConfig({ tenant_id: tenantId, ...DEFAULT_DELIVERY_CONFIG });
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const save = async (partial?: Partial<DeliveryConfig>) => {
    if (!config) return;
    const toSave = partial ? { ...config, ...partial } : config;
    setSaving(true);
    const { error } = await supabase
      .from('delivery_settings')
      .upsert({ ...toSave, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
    setSaving(false);
    if (error) {
      toast.error('Error al guardar: ' + error.message);
    } else {
      toast.success('Configuración guardada ✅');
      if (partial) setConfig(prev => prev ? { ...prev, ...partial } : prev);
    }
  };

  return { config, setConfig, loading, saving, save };
}

// ─── Subtab: General ──────────────────────────────────────────────────────────

function TabGeneral({ config, setConfig, saving, onSave }: {
  config: DeliveryConfig;
  setConfig: React.Dispatch<React.SetStateAction<DeliveryConfig | null>>;
  saving: boolean;
  onSave: () => void;
}) {
  const update = (patch: Partial<DeliveryConfig>) => setConfig(prev => prev ? { ...prev, ...patch } : prev);

  return (
    <div className="space-y-4">
      <Section title="Estado del Delivery" icon={<Truck size={16} />} accent="#F97316">
        <Toggle
          checked={config.delivery_enabled}
          onChange={v => update({ delivery_enabled: v })}
          label="Delivery activo"
          description="Activa o desactiva el módulo de domicilio completo."
          accent="#F97316"
        />
        <div className="border-t" style={{ borderColor: 'var(--border)' }} />
        <Toggle
          checked={config.orders_enabled}
          onChange={v => update({ orders_enabled: v })}
          label="Aceptar pedidos desde el menú"
          description="ON = el menú cliente puede recibir pedidos. OFF = solo el admin sigue activo."
          accent="#10B981"
        />
        {!config.orders_enabled && (
          <div
            className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
            <span style={{ color: 'var(--text-secondary)' }}>
              El menú cliente mostrará el mensaje de cocina cerrada. El panel admin sigue funcionando con normalidad.
            </span>
          </div>
        )}
      </Section>

      <Section title="Control por Canal" icon={<Package size={16} />} accent="#8B5CF6">
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          Cierra canales específicos sin afectar los demás.
        </p>
        <Toggle
          checked={config.dine_in_orders_enabled}
          onChange={v => update({ dine_in_orders_enabled: v })}
          label="Mesa / Dine-in"
          description="Pedidos desde mesa con QR."
          accent="#3B82F6"
        />
        <div className="border-t" style={{ borderColor: 'var(--border)' }} />
        <Toggle
          checked={config.takeout_orders_enabled}
          onChange={v => update({ takeout_orders_enabled: v })}
          label="Para llevar / Takeout"
          description="Pedidos para recoger en el restaurante."
          accent="#8B5CF6"
        />
        <div className="border-t" style={{ borderColor: 'var(--border)' }} />
        <Toggle
          checked={config.delivery_orders_enabled}
          onChange={v => update({ delivery_orders_enabled: v })}
          label="Domicilio / Delivery"
          description="Pedidos a domicilio."
          accent="#F97316"
        />
      </Section>

      <Section title="Mensaje de Cocina Cerrada" icon={<ChefHat size={16} />} accent="#EF4444">
        <Field
          label="Mensaje visible al cliente cuando los pedidos están cerrados"
          hint="Se muestra en el menú cliente cuando orders_enabled = OFF o el canal específico está cerrado."
        >
          <textarea
            value={config.closed_message}
            onChange={e => update({ closed_message: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 resize-none"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            placeholder="Por el momento no estamos recibiendo pedidos desde el menú."
          />
        </Field>
      </Section>

      <div className="flex justify-end">
        <SaveButton onClick={onSave} saving={saving} />
      </div>
    </div>
  );
}

// ─── Subtab: Cobertura ────────────────────────────────────────────────────────

function TabCobertura({ config, setConfig, saving, onSave }: {
  config: DeliveryConfig;
  setConfig: React.Dispatch<React.SetStateAction<DeliveryConfig | null>>;
  saving: boolean;
  onSave: () => void;
}) {
  const update = (patch: Partial<DeliveryConfig>) => setConfig(prev => prev ? { ...prev, ...patch } : prev);
  const [locating, setLocating] = useState(false);

  const handleDetectLocation = () => {
    if (!navigator.geolocation) { toast.error('Geolocalización no disponible'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        update({ restaurant_lat: pos.coords.latitude, restaurant_lon: pos.coords.longitude });
        setLocating(false);
        toast.success('Ubicación capturada ✅');
      },
      () => { setLocating(false); toast.error('No se pudo obtener la ubicación'); }
    );
  };

  return (
    <div className="space-y-4">
      <Section title="Ubicación del Restaurante" icon={<Navigation size={16} />} accent="#3B82F6">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitud">
            <Input
              type="number"
              value={config.restaurant_lat ?? ''}
              onChange={v => update({ restaurant_lat: parseFloat(v) || null })}
              placeholder="9.9281"
              step={0.0001}
            />
          </Field>
          <Field label="Longitud">
            <Input
              type="number"
              value={config.restaurant_lon ?? ''}
              onChange={v => update({ restaurant_lon: parseFloat(v) || null })}
              placeholder="-84.0907"
              step={0.0001}
            />
          </Field>
        </div>
        <button
          onClick={handleDetectLocation}
          disabled={locating}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
          style={{
            backgroundColor: 'rgba(59,130,246,0.12)',
            border: '1px solid rgba(59,130,246,0.25)',
            color: '#60A5FA',
          }}
        >
          <Navigation size={14} />
          {locating ? 'Detectando...' : 'Detectar mi ubicación actual'}
        </button>
        {config.restaurant_lat && config.restaurant_lon && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <CheckCircle2 size={13} className="text-green-400" />
            <span style={{ color: 'var(--text-secondary)' }}>
              Ubicación configurada: {config.restaurant_lat.toFixed(4)}, {config.restaurant_lon.toFixed(4)}
            </span>
          </div>
        )}
      </Section>

      <Section title="Radio de Cobertura" icon={<MapPin size={16} />} accent="#F97316">
        <Field
          label="Radio máximo de cobertura (km)"
          hint="Pedidos fuera de este radio serán rechazados o marcados como 'por confirmar'."
        >
          <Input
            type="number"
            value={config.coverage_radius_km}
            onChange={v => update({ coverage_radius_km: parseFloat(v) || 5 })}
            min={1}
            max={50}
            step={0.5}
          />
        </Field>
        <Field label="Monto mínimo de pedido (₡)" hint="Pedidos por debajo de este monto no pueden hacer delivery.">
          <Input
            type="number"
            value={config.min_order_amount}
            onChange={v => update({ min_order_amount: parseInt(v) || 0 })}
            min={0}
            step={500}
          />
        </Field>
      </Section>

      <Section title="Zonas de Cobertura" icon={<MapPin size={16} />} accent="#8B5CF6">
        <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
          Dibuja zonas de cobertura personalizadas en el mapa.
        </p>
        {config.delivery_enabled ? (
          <DeliveryZonesPanel tenant={{ id: config.tenant_id } as any} />
        ) : (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            <Info size={13} className="text-amber-400" />
            <span style={{ color: 'var(--text-secondary)' }}>Activa el delivery para configurar zonas.</span>
          </div>
        )}
      </Section>

      <div className="flex justify-end">
        <SaveButton onClick={onSave} saving={saving} />
      </div>
    </div>
  );
}

// ─── Subtab: Tarifas ──────────────────────────────────────────────────────────

function TabTarifas({ config, setConfig, saving, onSave }: {
  config: DeliveryConfig;
  setConfig: React.Dispatch<React.SetStateAction<DeliveryConfig | null>>;
  saving: boolean;
  onSave: () => void;
}) {
  const update = (patch: Partial<DeliveryConfig>) => setConfig(prev => prev ? { ...prev, ...patch } : prev);
  const [newRange, setNewRange] = useState({ min_km: 0, max_km: 2, fee: 1000 });

  const addRange = () => {
    const ranges = [...(config.distance_ranges || [])];
    const validation = validateDistanceRanges([...ranges, { ...newRange, id: generateRangeId() }]);
    if (!validation.valid) { toast.error(validation.error); return; }
    update({
      distance_ranges: [...ranges, { ...newRange, id: generateRangeId() }]
        .sort((a, b) => a.min_km - b.min_km),
    });
    setNewRange({ min_km: newRange.max_km, max_km: newRange.max_km + 2, fee: newRange.fee + 500 });
  };

  const removeRange = (id: string) => {
    update({ distance_ranges: (config.distance_ranges || []).filter(r => r.id !== id) });
  };

  const updateRange = (id: string, patch: Partial<DeliveryDistanceRange>) => {
    update({
      distance_ranges: (config.distance_ranges || []).map(r => r.id === id ? { ...r, ...patch } : r),
    });
  };

  return (
    <div className="space-y-4">
      <Section title="Tarifa Base" icon={<DollarSign size={16} />} accent="#10B981">
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          Se usa cuando no hay rangos configurados o como referencia visual.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tarifa base (₡)" hint="Tarifa cuando no hay rangos configurados.">
            <Input
              type="number"
              value={config.delivery_fee}
              onChange={v => update({ delivery_fee: parseInt(v) || 0 })}
              min={0}
              step={100}
            />
          </Field>
          <Field label="Km incluidos en tarifa base" hint="Distancia cubierta por la tarifa base.">
            <Input
              type="number"
              value={config.base_km}
              onChange={v => update({ base_km: parseFloat(v) || 0 })}
              min={0}
              step={0.5}
            />
          </Field>
        </div>
      </Section>

      <Section title="Tarifas Escalonadas por Distancia" icon={<DollarSign size={16} />} accent="#F97316">
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          Define rangos de distancia con tarifa específica. Si hay rangos configurados, se usan en lugar de la tarifa base.
        </p>

        {/* Rangos existentes */}
        {(config.distance_ranges || []).length > 0 ? (
          <div className="space-y-2 mb-4">
            {(config.distance_ranges || [])
              .sort((a, b) => a.min_km - b.min_km)
              .map(range => (
                <div
                  key={range.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-1 flex-1">
                    <input
                      type="number"
                      value={range.min_km}
                      onChange={e => updateRange(range.id, { min_km: parseFloat(e.target.value) || 0 })}
                      className="w-16 px-2 py-1 rounded text-xs text-center focus:outline-none"
                      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>km —</span>
                    <input
                      type="number"
                      value={range.max_km}
                      onChange={e => updateRange(range.id, { max_km: parseFloat(e.target.value) || 0 })}
                      className="w-16 px-2 py-1 rounded text-xs text-center focus:outline-none"
                      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>km →</span>
                    <span className="text-xs font-bold text-orange-400">₡</span>
                    <input
                      type="number"
                      value={range.fee}
                      onChange={e => updateRange(range.id, { fee: parseInt(e.target.value) || 0 })}
                      className="w-20 px-2 py-1 rounded text-xs text-center focus:outline-none"
                      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <button
                    onClick={() => removeRange(range.id)}
                    className="p-1 rounded transition-colors hover:bg-red-500/10"
                    style={{ color: '#EF4444' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
          </div>
        ) : (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs mb-4"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}
          >
            <Info size={13} className="text-amber-400" />
            <span style={{ color: 'var(--text-secondary)' }}>Sin rangos configurados. Se usará la tarifa base.</span>
          </div>
        )}

        {/* Agregar nuevo rango */}
        <div
          className="p-3 rounded-lg space-y-3"
          style={{ backgroundColor: 'rgba(249,115,22,0.06)', border: '1px dashed rgba(249,115,22,0.3)' }}
        >
          <p className="text-xs font-bold" style={{ color: '#FB923C' }}>Agregar rango</p>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={newRange.min_km}
                onChange={e => setNewRange(p => ({ ...p, min_km: parseFloat(e.target.value) || 0 }))}
                className="w-16 px-2 py-1.5 rounded text-xs text-center focus:outline-none"
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>km —</span>
              <input
                type="number"
                value={newRange.max_km}
                onChange={e => setNewRange(p => ({ ...p, max_km: parseFloat(e.target.value) || 0 }))}
                className="w-16 px-2 py-1.5 rounded text-xs text-center focus:outline-none"
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>km → ₡</span>
              <input
                type="number"
                value={newRange.fee}
                onChange={e => setNewRange(p => ({ ...p, fee: parseInt(e.target.value) || 0 }))}
                className="w-20 px-2 py-1.5 rounded text-xs text-center focus:outline-none"
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <button
              onClick={addRange}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{ background: 'linear-gradient(135deg,#F97316,#EF4444)', color: '#fff' }}
            >
              <Plus size={12} /> Agregar
            </button>
          </div>
        </div>
      </Section>

      <Section title="Costo por Confirmar" icon={<AlertCircle size={16} />} accent="#8B5CF6">
        <Toggle
          checked={config.allow_manual_fee}
          onChange={v => update({ allow_manual_fee: v })}
          label="Permitir costo por confirmar"
          description="Si la distancia cae fuera de todos los rangos, el pedido entra como 'costo por confirmar' en lugar de rechazarse."
          accent="#8B5CF6"
        />
        {config.allow_manual_fee && (
          <Field label="Mensaje al cliente cuando el costo está por confirmar">
            <Input
              value={config.manual_fee_message}
              onChange={v => update({ manual_fee_message: v })}
              placeholder="El costo de envío será confirmado por el restaurante."
            />
          </Field>
        )}
      </Section>

      <Section title="Presets y Mensajes" icon={<DollarSign size={16} />} accent="#10B981">
        <Field
          label="Mensaje de variabilidad visible al cliente"
          hint="Se muestra en el checkout para informar que el costo puede variar."
        >
          <Input
            value={config.fee_variability_msg}
            onChange={v => update({ fee_variability_msg: v })}
            placeholder="El costo de envío puede variar según la distancia exacta."
          />
        </Field>
        <Field
          label="Presets de tarifa para el rider (₡, separados por coma)"
          hint="El rider puede seleccionar uno de estos valores al asignar el pedido."
        >
          <Input
            value={(config.fee_presets || []).join(',')}
            onChange={v => {
              const vals = v.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x) && x > 0);
              if (vals.length > 0) update({ fee_presets: vals });
            }}
            placeholder="1000,1500,2000,2500,3000"
          />
        </Field>
      </Section>

      <div className="flex justify-end">
        <SaveButton onClick={onSave} saving={saving} />
      </div>
    </div>
  );
}

// ─── Subtab: Pagos ────────────────────────────────────────────────────────────

function TabPagos({ config, setConfig, saving, onSave }: {
  config: DeliveryConfig;
  setConfig: React.Dispatch<React.SetStateAction<DeliveryConfig | null>>;
  saving: boolean;
  onSave: () => void;
}) {
  const update = (patch: Partial<DeliveryConfig>) => setConfig(prev => prev ? { ...prev, ...patch } : prev);

  const activeCount = [config.sinpe_enabled, config.efectivo_enabled, config.tarjeta_enabled].filter(Boolean).length;
  const validation = validatePaymentConfig(config);

  return (
    <div className="space-y-4">
      <Section title="Métodos de Pago para Delivery" icon={<CreditCard size={16} />} accent="#10B981">
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          El cliente solo verá los métodos que actives aquí. Estos ajustes son exclusivos para delivery y no afectan dine-in ni takeout.
        </p>

        <Toggle
          checked={config.sinpe_enabled}
          onChange={v => update({ sinpe_enabled: v })}
          label="SINPE Móvil"
          description="El cliente sube comprobante. El admin valida antes de enviar a cocina (si está configurado)."
          accent="#10B981"
        />
        <div className="border-t" style={{ borderColor: 'var(--border)' }} />
        <Toggle
          checked={config.efectivo_enabled}
          onChange={v => update({ efectivo_enabled: v })}
          label="Efectivo"
          description="El cliente paga al rider al recibir el pedido."
          accent="#F59E0B"
        />
        <div className="border-t" style={{ borderColor: 'var(--border)' }} />
        <Toggle
          checked={config.tarjeta_enabled}
          onChange={v => update({ tarjeta_enabled: v })}
          label="Tarjeta"
          description="El rider lleva datáfono o se procesa en línea."
          accent="#3B82F6"
        />

        {!validation.valid && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs mt-2"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <AlertCircle size={13} className="text-red-400" />
            <span style={{ color: '#F87171' }}>{validation.error}</span>
          </div>
        )}

        {validation.valid && activeCount > 0 && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs mt-2"
            style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}
          >
            <CheckCircle2 size={13} className="text-green-400" />
            <span style={{ color: 'var(--text-secondary)' }}>
              {activeCount} método{activeCount > 1 ? 's' : ''} activo{activeCount > 1 ? 's' : ''} para delivery.
            </span>
          </div>
        )}
      </Section>
      {/* ─── Bloqueo SINPE ─────────────────────────────────────────────── */}
      {config.sinpe_enabled && (
        <Section title="Comportamiento SINPE" icon={<Settings2 size={16} />} accent="#8B5CF6">
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            Controla qué pasa con el pedido mientras el pago SINPE no ha sido verificado por el admin.
          </p>
          <div className="space-y-2">
            {(Object.entries(SINPE_BLOCK_MODE_LABELS) as [DeliveryConfig['sinpe_block_mode'], string][]).map(([key, label]) => (
              <label
                key={key}
                className="flex items-start gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all"
                style={{
                  backgroundColor: (config.sinpe_block_mode ?? 'always') === key ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${(config.sinpe_block_mode ?? 'always') === key ? 'rgba(139,92,246,0.4)' : 'var(--border)'}`,
                }}
              >
                <input
                  type="radio"
                  name="sinpe_block_mode"
                  checked={(config.sinpe_block_mode ?? 'always') === key}
                  onChange={() => setConfig(prev => prev ? { ...prev, sinpe_block_mode: key } : prev)}
                  className="mt-0.5 accent-purple-500"
                />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
                  {key === 'always' && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>El pedido queda en espera hasta que el admin valide el comprobante.</p>}
                  {key === 'delivery_only' && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Solo delivery queda bloqueado; dine-in y takeout avanzan sin verificar.</p>}
                  {key === 'never' && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>El pedido entra a cocina de inmediato; el admin verifica el pago después.</p>}
                </div>
              </label>
            ))}
          </div>
        </Section>
      )}

      <div className="flex justify-end">
        <SaveButton
          onClick={() => {
            if (!validation.valid) { toast.error(validation.error); return; }
            onSave();
          }}
          saving={saving}
        />
      </div>
    </div>
  );
}

// ─── Subtab: Flujo ────────────────────────────────────────────────────────────

function TabFlujo({ config, setConfig, saving, onSave }: {
  config: DeliveryConfig;
  setConfig: React.Dispatch<React.SetStateAction<DeliveryConfig | null>>;
  saving: boolean;
  onSave: () => void;
}) {
  const update = (patch: Partial<DeliveryConfig>) => setConfig(prev => prev ? { ...prev, ...patch } : prev);

  return (
    <div className="space-y-4">
      <Section title="Reglas de Entrada a Cocina" icon={<ChefHat size={16} />} accent="#3B82F6">
        <Toggle
          checked={config.requires_manual_approval}
          onChange={v => update({ requires_manual_approval: v })}
          label="Requiere aprobación manual antes de cocina"
          description="El admin debe aprobar cada pedido antes de que entre a cocina."
          accent="#8B5CF6"
        />
        <div className="border-t" style={{ borderColor: 'var(--border)' }} />
        <Toggle
          checked={config.requires_payment_before_kitchen}
          onChange={v => update({ requires_payment_before_kitchen: v })}
          label="Requiere validación de pago antes de cocina"
          description="El pedido no entra a cocina hasta que el pago SINPE sea verificado por el admin."
          accent="#F59E0B"
        />
      </Section>

      <Section title="Asignación de Rider" icon={<Bike size={16} />} accent="#F97316">
        <Field label="¿Cuándo entra el pedido al flujo del rider?">
          <div className="space-y-2 mt-1">
            {(Object.entries(DISPATCH_TRIGGER_LABELS) as [DeliveryConfig['rider_dispatch_trigger'], string][]).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all"
                style={{
                  backgroundColor: config.rider_dispatch_trigger === key ? 'rgba(249,115,22,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${config.rider_dispatch_trigger === key ? 'rgba(249,115,22,0.4)' : 'var(--border)'}`,
                }}
              >
                <input
                  type="radio"
                  name="dispatch_trigger"
                  value={key}
                  checked={config.rider_dispatch_trigger === key}
                  onChange={() => update({ rider_dispatch_trigger: key })}
                  className="accent-orange-500"
                />
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>
              </label>
            ))}
          </div>
        </Field>
        {config.rider_dispatch_trigger === 'x_minutes_before' && (
          <Field label="Minutos antes de terminar preparación" hint="El rider es asignado X minutos antes de que el pedido esté listo.">
            <Input
              type="number"
              value={config.rider_dispatch_minutes_before}
              onChange={v => update({ rider_dispatch_minutes_before: parseInt(v) || 5 })}
              min={1}
              max={30}
            />
          </Field>
        )}
      </Section>

      <Section title="Completado del Pedido" icon={<CheckCircle2 size={16} />} accent="#10B981">
        <Field label="¿Cuándo se considera completado el pedido?">
          <div className="space-y-2 mt-1">
            {(Object.entries(COMPLETION_MODE_LABELS) as [DeliveryConfig['completion_mode'], string][]).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all"
                style={{
                  backgroundColor: config.completion_mode === key ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${config.completion_mode === key ? 'rgba(16,185,129,0.4)' : 'var(--border)'}`,
                }}
              >
                <input
                  type="radio"
                  name="completion_mode"
                  value={key}
                  checked={config.completion_mode === key}
                  onChange={() => update({ completion_mode: key })}
                  className="accent-green-500"
                />
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>
              </label>
            ))}
          </div>
        </Field>
        <div
          className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}
        >
          <Info size={13} className="text-green-400 shrink-0 mt-0.5" />
          <span style={{ color: 'var(--text-secondary)' }}>
            Esto afecta el estado final del pedido, historial, analítica y lo que ve el cliente en seguimiento.
          </span>
        </div>
      </Section>

      <div className="flex justify-end">
        <SaveButton onClick={onSave} saving={saving} />
      </div>
    </div>
  );
}

// ─── Subtab: Tiempos (dentro de Flujo o separado) ─────────────────────────────

function TabTiempos({ config, setConfig, saving, onSave }: {
  config: DeliveryConfig;
  setConfig: React.Dispatch<React.SetStateAction<DeliveryConfig | null>>;
  saving: boolean;
  onSave: () => void;
}) {
  const update = (patch: Partial<DeliveryConfig>) => setConfig(prev => prev ? { ...prev, ...patch } : prev);

  return (
    <div className="space-y-4">
      <Section title="Tiempos de Preparación" icon={<Clock size={16} />} accent="#F59E0B">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tiempo base de preparación (min)" hint="Tiempo estimado estándar para preparar un pedido.">
            <Input
              type="number"
              value={config.base_prep_minutes}
              onChange={v => update({ base_prep_minutes: parseInt(v) || 20 })}
              min={5}
              max={120}
            />
          </Field>
          <Field label="Minutos extra manuales" hint="Tiempo adicional que el admin puede añadir por pedido.">
            <Input
              type="number"
              value={config.extra_prep_minutes}
              onChange={v => update({ extra_prep_minutes: parseInt(v) || 0 })}
              min={0}
              max={60}
            />
          </Field>
          <Field label="ETA total estimado (min)" hint="Tiempo total que el cliente ve como estimado de entrega.">
            <Input
              type="number"
              value={config.base_eta_minutes}
              onChange={v => update({ base_eta_minutes: parseInt(v) || 30 })}
              min={10}
              max={180}
            />
          </Field>
          <Field label="Tiempo mínimo pickup (min)" hint="Tiempo mínimo para pedidos para recoger.">
            <Input
              type="number"
              value={config.min_pickup_minutes}
              onChange={v => update({ min_pickup_minutes: parseInt(v) || 15 })}
              min={5}
              max={120}
            />
          </Field>
        </div>
      </Section>

      <Section title="Políticas de Orquestación" icon={<Zap size={16} />} accent="#8B5CF6">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Buffer de capacidad (%)" hint="No commitear si la capacidad supera este %.">
            <Input
              type="number"
              value={config.commit_buffer_pct}
              onChange={v => update({ commit_buffer_pct: parseInt(v) || 80 })}
              min={50}
              max={100}
              step={5}
            />
          </Field>
          <Field label="Espera máxima (min)" hint="Pedidos en waitlist se auto-promueven después de este tiempo.">
            <Input
              type="number"
              value={config.max_wait_minutes}
              onChange={v => update({ max_wait_minutes: parseInt(v) || 20 })}
              min={5}
              max={120}
              step={5}
            />
          </Field>
        </div>
      </Section>

      <div className="flex justify-end">
        <SaveButton onClick={onSave} saving={saving} />
      </div>
    </div>
  );
}

// ─── Componente principal: DeliveryOS ─────────────────────────────────────────

export function DeliveryOS({ tenant }: { tenant: Tenant }) {
  const [activeTab, setActiveTab] = useState<DeliveryOSTab>('general');
  const { config, setConfig, loading, saving, save } = useDeliveryConfig(tenant.id);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!config) return null;

  const handleSave = () => save();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Truck size={22} className="text-orange-400" />
            Delivery OS
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Módulo exclusivo de domicilio — todo lo relacionado a delivery vive aquí.
          </p>
        </div>
        {/* Status badge */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{
            backgroundColor: config.delivery_enabled ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${config.delivery_enabled ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.25)'}`,
            color: config.delivery_enabled ? '#34D399' : '#F87171',
          }}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${config.delivery_enabled ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
          {config.delivery_enabled ? 'Delivery activo' : 'Delivery inactivo'}
        </div>
      </div>

      {/* Subtab nav */}
      <div
        className="flex gap-1 flex-wrap p-1 rounded-xl"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        {SUBTABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
            style={
              activeTab === tab.key
                ? { backgroundColor: '#F97316', color: '#fff', boxShadow: '0 2px 8px rgba(249,115,22,0.35)' }
                : { color: 'var(--text-secondary)' }
            }
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Subtab content */}
      <div>
        {activeTab === 'general' && (
          <TabGeneral config={config} setConfig={setConfig} saving={saving} onSave={handleSave} />
        )}
        {activeTab === 'cobertura' && (
          <TabCobertura config={config} setConfig={setConfig} saving={saving} onSave={handleSave} />
        )}
        {activeTab === 'tarifas' && (
          <TabTarifas config={config} setConfig={setConfig} saving={saving} onSave={handleSave} />
        )}
        {activeTab === 'pagos' && (
          <TabPagos config={config} setConfig={setConfig} saving={saving} onSave={handleSave} />
        )}
        {activeTab === 'flujo' && (
          <div className="space-y-4">
            <TabFlujo config={config} setConfig={setConfig} saving={saving} onSave={handleSave} />
            <TabTiempos config={config} setConfig={setConfig} saving={saving} onSave={handleSave} />
          </div>
        )}
        {activeTab === 'riders' && (
          <div className="space-y-4">
            <div
              className="rounded-xl p-5"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Bike size={16} className="text-amber-400" /> Riders de Delivery
              </h3>
              <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                Gestiona los repartidores. Cada rider accede con su PIN desde{' '}
                <span className="text-amber-400 font-mono">/rider/{tenant.slug}</span>
              </p>
              <DeliveryDispatchPanel tenant={tenant} />
            </div>
          </div>
        )}
        {activeTab === 'operaciones' && (
          <DeliveryOpsPanel tenant={tenant} />
        )}
        {activeTab === 'historial' && (
          <DeliveryHistoryPanel tenant={tenant} />
        )}
      </div>
    </div>
  );
}
