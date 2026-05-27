/**
 * OrderTypesTab — Configuración de tipos de pedido y flujo de estados por restaurante
 * Usa la tabla delivery_settings (campos: orders_enabled, dine_in_orders_enabled,
 * takeout_orders_enabled, delivery_orders_enabled, closed_message,
 * enable_prep_step, enable_billing_step)
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Tenant } from '@/lib/types';
import { ClipboardList, Save, Info, Loader2, Check, GitBranch } from 'lucide-react';

interface OrderTypesTabProps { tenant: Tenant; }

interface OrderConfig {
  orders_enabled: boolean;
  dine_in_orders_enabled: boolean;
  takeout_orders_enabled: boolean;
  delivery_orders_enabled: boolean;
  closed_message: string;
  enable_prep_step: boolean;
  enable_billing_step: boolean;
}

const DEFAULT_CONFIG: OrderConfig = {
  orders_enabled: true,
  dine_in_orders_enabled: true,
  takeout_orders_enabled: true,
  delivery_orders_enabled: false,
  closed_message: 'Por el momento no estamos recibiendo pedidos desde el menú.',
  enable_prep_step: true,
  enable_billing_step: true,
};

const CARD = 'bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4';

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button onClick={() => !disabled && onChange(!checked)} disabled={disabled} className="flex-shrink-0 disabled:opacity-40">
      <div className="relative w-11 h-6 rounded-full transition-colors" style={{ backgroundColor: checked ? '#22C55E' : '#475569' }}>
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </div>
    </button>
  );
}

function TypeCard({
  emoji,
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  emoji: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-4 rounded-xl transition-all"
      style={{
        backgroundColor: checked ? 'rgba(34,197,94,0.06)' : 'var(--bg-base)',
        border: checked ? '1px solid rgba(34,197,94,0.25)' : '1px solid var(--border)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{emoji}</span>
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
          <p className="text-xs text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

/** Visualización del flujo de estados activos */
function FlowPreview({ enablePrep, enableBilling }: { enablePrep: boolean; enableBilling: boolean }) {
  const steps = [
    { key: 'new', label: 'Nuevos', color: '#3B82F6', always: true },
    { key: 'prep', label: 'En prep.', color: '#F97316', always: false, active: enablePrep },
    { key: 'ready', label: 'Listos', color: '#22C55E', always: true },
    { key: 'billing', label: 'Cobro', color: '#F59E0B', always: false, active: enableBilling },
  ];

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((step, i) => {
        const isActive = step.always || step.active;
        return (
          <div key={step.key} className="flex items-center gap-1">
            <div
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                backgroundColor: isActive ? `${step.color}18` : 'rgba(255,255,255,0.03)',
                border: isActive ? `1px solid ${step.color}40` : '1px solid rgba(255,255,255,0.08)',
                color: isActive ? step.color : '#475569',
                textDecoration: isActive ? 'none' : 'line-through',
                opacity: isActive ? 1 : 0.5,
              }}
            >
              {step.label}
            </div>
            {i < steps.length - 1 && (
              <span className="text-[10px]" style={{ color: '#475569' }}>→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OrderTypesTab({ tenant }: OrderTypesTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [config, setConfig] = useState<OrderConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('delivery_settings')
        .select('orders_enabled, dine_in_orders_enabled, takeout_orders_enabled, delivery_orders_enabled, closed_message, enable_prep_step, enable_billing_step')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      if (data) {
        setConfig({
          orders_enabled: data.orders_enabled ?? DEFAULT_CONFIG.orders_enabled,
          dine_in_orders_enabled: data.dine_in_orders_enabled ?? DEFAULT_CONFIG.dine_in_orders_enabled,
          takeout_orders_enabled: data.takeout_orders_enabled ?? DEFAULT_CONFIG.takeout_orders_enabled,
          delivery_orders_enabled: data.delivery_orders_enabled ?? DEFAULT_CONFIG.delivery_orders_enabled,
          closed_message: data.closed_message ?? DEFAULT_CONFIG.closed_message,
          enable_prep_step: data.enable_prep_step ?? DEFAULT_CONFIG.enable_prep_step,
          enable_billing_step: data.enable_billing_step ?? DEFAULT_CONFIG.enable_billing_step,
        });
      }
      setLoading(false);
    };
    load();
  }, [tenant.id]);

  const set = (field: keyof OrderConfig, value: boolean | string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  // Cuántos tipos están activos
  const activeCount = [
    config.dine_in_orders_enabled,
    config.takeout_orders_enabled,
    config.delivery_orders_enabled,
  ].filter(Boolean).length;

  const handleSave = async () => {
    if (config.orders_enabled && activeCount === 0) {
      toast.error('Debe haber al menos un tipo de pedido activo para recibir pedidos.');
      return;
    }

    setSaving(true);
    const payload = {
      orders_enabled: config.orders_enabled,
      dine_in_orders_enabled: config.dine_in_orders_enabled,
      takeout_orders_enabled: config.takeout_orders_enabled,
      delivery_orders_enabled: config.delivery_orders_enabled,
      closed_message: config.closed_message,
      enable_prep_step: config.enable_prep_step,
      enable_billing_step: config.enable_billing_step,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('delivery_settings')
      .select('id')
      .eq('tenant_id', tenant.id)
      .maybeSingle();

    let error;
    if (existing) {
      ({ error } = await supabase
        .from('delivery_settings')
        .update(payload)
        .eq('tenant_id', tenant.id));
    } else {
      ({ error } = await supabase
        .from('delivery_settings')
        .insert({ ...payload, tenant_id: tenant.id }));
    }

    setSaving(false);
    if (error) {
      toast.error('Error al guardar: ' + error.message);
    } else {
      setSaved(true);
      toast.success('Configuración guardada ✅');
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const activeTypes: string[] = [];
  if (config.dine_in_orders_enabled) activeTypes.push('🍽️ Mesa');
  if (config.takeout_orders_enabled) activeTypes.push('🛍️ Para llevar');
  if (config.delivery_orders_enabled) activeTypes.push('🛵 Delivery');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(249,115,22,0.15))' }}>
          <ClipboardList size={18} style={{ color: '#F59E0B' }} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Tipos de pedido y flujo</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Configura cómo tus clientes ordenan y cómo tu equipo procesa los pedidos.
          </p>
        </div>
      </div>

      {/* Card 1: Switch global */}
      <div className={CARD}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">Recibir pedidos desde el menú</p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Permite activar o pausar todos los pedidos desde el menú público.
            </p>
          </div>
          <ToggleSwitch
            checked={config.orders_enabled}
            onChange={v => set('orders_enabled', v)}
          />
        </div>

        {!config.orders_enabled && (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
              Mensaje para los clientes
            </label>
            <textarea
              value={config.closed_message}
              onChange={e => set('closed_message', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none resize-none"
              placeholder="Por el momento no estamos recibiendo pedidos desde el menú."
            />
          </div>
        )}
      </div>

      {/* Card 2: Tipos de pedido */}
      <div className={CARD}>
        <div className="mb-1">
          <p className="text-sm font-bold text-[var(--text-primary)]">Tipos de pedido disponibles</p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Activa los tipos que tu restaurante ofrece. Al menos uno debe estar activo.
          </p>
        </div>

        <TypeCard
          emoji="🍽️"
          title="Pedido en mesa"
          description="Permite que los clientes pidan desde una mesa o para consumo en el local."
          checked={config.dine_in_orders_enabled}
          onChange={v => set('dine_in_orders_enabled', v)}
          disabled={!config.orders_enabled}
        />
        <TypeCard
          emoji="🛍️"
          title="Pedido para llevar"
          description="Permite que los clientes ordenen y retiren en el local."
          checked={config.takeout_orders_enabled}
          onChange={v => set('takeout_orders_enabled', v)}
          disabled={!config.orders_enabled}
        />
        <TypeCard
          emoji="🛵"
          title="Delivery"
          description="Permite que los clientes pidan a domicilio."
          checked={config.delivery_orders_enabled}
          onChange={v => set('delivery_orders_enabled', v)}
          disabled={!config.orders_enabled}
        />

        {config.orders_enabled && activeCount === 0 && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
            style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5' }}>
            <Info size={13} className="mt-0.5 flex-shrink-0" />
            <span>Debe haber al menos un tipo de pedido activo para recibir pedidos.</span>
          </div>
        )}
      </div>

      {/* Card 3: Flujo de estados */}
      <div className={CARD}>
        <div className="flex items-start gap-3 mb-2">
          <GitBranch size={16} style={{ color: '#F59E0B', marginTop: 2, flexShrink: 0 }} />
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">Flujo de estados del pedido</p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Elige cuántos pasos tiene el proceso interno. <strong>Nuevos</strong> y <strong>Listos</strong> son siempre obligatorios.
            </p>
          </div>
        </div>

        {/* Preview del flujo */}
        <div className="px-3 py-3 rounded-xl" style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#64748b' }}>Vista previa del flujo</p>
          <FlowPreview enablePrep={config.enable_prep_step} enableBilling={config.enable_billing_step} />
        </div>

        {/* Toggle En preparación */}
        <div
          className="flex items-center justify-between gap-4 px-4 py-4 rounded-xl transition-all"
          style={{
            backgroundColor: config.enable_prep_step ? 'rgba(249,115,22,0.06)' : 'var(--bg-base)',
            border: config.enable_prep_step ? '1px solid rgba(249,115,22,0.25)' : '1px solid var(--border)',
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🍳</span>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Paso "En preparación"</p>
              <p className="text-xs text-[var(--text-secondary)]">
                El mesero/admin acepta el pedido y lo envía a cocina antes de marcarlo listo.
                {!config.enable_prep_step && <span className="text-amber-400 font-medium"> Al desactivar, los pedidos pasan directo de Nuevos → Listos.</span>}
              </p>
            </div>
          </div>
          <ToggleSwitch checked={config.enable_prep_step} onChange={v => set('enable_prep_step', v)} />
        </div>

        {/* Toggle Cobro */}
        <div
          className="flex items-center justify-between gap-4 px-4 py-4 rounded-xl transition-all"
          style={{
            backgroundColor: config.enable_billing_step ? 'rgba(245,158,11,0.06)' : 'var(--bg-base)',
            border: config.enable_billing_step ? '1px solid rgba(245,158,11,0.25)' : '1px solid var(--border)',
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">💵</span>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Paso "Cobro"</p>
              <p className="text-xs text-[var(--text-secondary)]">
                Muestra el tab de cobro en el panel del mesero para registrar pagos en efectivo, tarjeta o SINPE.
                {!config.enable_billing_step && <span className="text-amber-400 font-medium"> Al desactivar, el tab de cobro no aparece en el panel.</span>}
              </p>
            </div>
          </div>
          <ToggleSwitch checked={config.enable_billing_step} onChange={v => set('enable_billing_step', v)} />
        </div>
      </div>

      {/* Preview de tipos */}
      <div className={CARD}>
        <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Vista previa del cliente</p>
        {!config.orders_enabled ? (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
            style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5' }}>
            <span>🔒</span>
            <span>Los pedidos están pausados. Los clientes verán el mensaje de cierre.</span>
          </div>
        ) : activeTypes.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)]">Sin tipos activos — los clientes no podrán ordenar.</p>
        ) : activeTypes.length === 1 ? (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
            style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#86EFAC' }}>
            <Check size={13} className="mt-0.5 flex-shrink-0" />
            <span>
              Solo hay un tipo activo ({activeTypes[0]}), se seleccionará automáticamente — sin fricción para el cliente.
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
            style={{ backgroundColor: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', color: '#93C5FD' }}>
            <Info size={13} className="mt-0.5 flex-shrink-0" />
            <span>
              Los clientes verán: {activeTypes.join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* Botón guardar */}
      <button
        onClick={handleSave}
        disabled={saving || (config.orders_enabled && activeCount === 0)}
        className="w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: '#F59E0B', color: '#000' }}
      >
        {saving ? (
          <><Loader2 size={16} className="animate-spin" /> Guardando...</>
        ) : saved ? (
          <><Check size={16} /> ¡Guardado!</>
        ) : (
          <><Save size={16} /> Guardar cambios</>
        )}
      </button>
    </div>
  );
}
