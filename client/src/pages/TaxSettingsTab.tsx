/**
 * TaxSettingsTab — Configuración de IVA y Cargo de Servicio de Mesa
 * Permite al admin configurar:
 *   - IVA: habilitado/deshabilitado, tasa, si los precios ya incluyen IVA
 *   - Cargo de servicio: habilitado/deshabilitado, tasa, a qué pedidos aplica, base de cálculo
 * Los cambios se guardan en la tabla tax_settings de Supabase.
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Tenant } from '@/lib/types';
import { Receipt, Percent, Save, RefreshCw, Info, ChevronDown } from 'lucide-react';
import { calculateOrderTotals, DEFAULT_TAX_SETTINGS, type TaxSettings } from '@/lib/orderTotals';

interface TaxSettingsTabProps {
  tenant: Tenant;
}

const CARD = 'bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6';
const LABEL = 'block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide';
const INPUT = 'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none';
const SELECT = 'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none appearance-none';

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center gap-2 group flex-shrink-0">
      <div className="relative w-11 h-6 rounded-full transition-colors" style={{ backgroundColor: checked ? '#22C55E' : '#475569' }}>
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </div>
    </button>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(249,115,22,0.15))' }}>
        <span style={{ color: '#F59E0B' }}>{icon}</span>
      </div>
      <div>
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
        {subtitle && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function TaxSettingsTab({ tenant }: TaxSettingsTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS);
  const [previewAmount] = useState(10000); // Ejemplo: pedido de ₡10,000

  // Cargar configuración actual
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('tax_settings')
        .select('*')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      if (data) {
        setForm({
          tax_enabled: data.tax_enabled ?? DEFAULT_TAX_SETTINGS.tax_enabled,
          tax_rate: data.tax_rate ?? DEFAULT_TAX_SETTINGS.tax_rate,
          prices_include_tax: data.prices_include_tax ?? DEFAULT_TAX_SETTINGS.prices_include_tax,
          service_enabled: data.service_enabled ?? DEFAULT_TAX_SETTINGS.service_enabled,
          service_rate: data.service_rate ?? DEFAULT_TAX_SETTINGS.service_rate,
          service_applies_to: data.service_applies_to ?? DEFAULT_TAX_SETTINGS.service_applies_to,
          service_calculation_base: data.service_calculation_base ?? DEFAULT_TAX_SETTINGS.service_calculation_base,
        });
      }
      setLoading(false);
    };
    load();
  }, [tenant.id]);

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      tenant_id: tenant.id,
      tax_enabled: form.tax_enabled,
      tax_rate: form.tax_rate,
      prices_include_tax: form.prices_include_tax,
      service_enabled: form.service_enabled,
      service_rate: form.service_rate,
      service_applies_to: form.service_applies_to,
      service_calculation_base: form.service_calculation_base,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('tax_settings')
      .upsert(payload, { onConflict: 'tenant_id' });
    if (error) {
      toast.error('Error al guardar: ' + error.message);
    } else {
      toast.success('✅ Configuración de IVA guardada');
    }
    setSaving(false);
  };

  // Preview en tiempo real
  const preview = calculateOrderTotals({
    itemsSubtotal: previewAmount,
    orderType: 'dine_in',
    hasTable: true,
    taxSettings: form,
    discountAmount: 0,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw size={20} className="animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl" data-help-anchor="tax-tab">
      {/* Header */}
      <div className="mb-2">
        <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Receipt size={20} className="text-amber-400" /> IVA y Cargo de Servicio
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Configura cómo se calculan los impuestos y el cargo de servicio de mesa en los pedidos.
        </p>
      </div>

      {/* ── Sección IVA ── */}
      <div className={CARD}>
        <SectionHeader
          icon={<Percent size={16} />}
          title="Impuesto al Valor Agregado (IVA)"
          subtitle="Configura la tasa de IVA que aplica a los pedidos"
        />

        <div className="space-y-5">
          {/* Toggle IVA habilitado */}
          <div className="flex items-center justify-between py-3 px-4 rounded-xl" style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">IVA habilitado</p>
              <p className="text-xs text-[var(--text-secondary)]">Activar el cálculo de IVA en los pedidos</p>
            </div>
            <ToggleSwitch checked={form.tax_enabled} onChange={v => setForm(f => ({ ...f, tax_enabled: v }))} />
          </div>

          {form.tax_enabled && (
            <>
              {/* Tasa de IVA */}
              <div>
                <label className={LABEL}>Tasa de IVA (%)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={form.tax_rate}
                    onChange={e => setForm(f => ({ ...f, tax_rate: parseFloat(e.target.value) || 0 }))}
                    className={INPUT}
                    style={{ maxWidth: 120 }}
                  />
                  <span className="text-sm text-[var(--text-secondary)]">% (Costa Rica: 13%)</span>
                </div>
              </div>

              {/* Precios incluyen IVA */}
              <div className="flex items-start justify-between py-3 px-4 rounded-xl" style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                <div className="flex-1 mr-4">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Los precios ya incluyen IVA</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {form.prices_include_tax
                      ? 'El IVA se desglosará del precio (ej: ₡1,000 → base ₡885 + IVA ₡115)'
                      : 'El IVA se sumará al precio (ej: ₡1,000 + IVA ₡130 = ₡1,130)'}
                  </p>
                </div>
                <ToggleSwitch checked={form.prices_include_tax} onChange={v => setForm(f => ({ ...f, prices_include_tax: v }))} />
              </div>

              {/* Info box */}
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs" style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: '#93C5FD' }}>
                <Info size={13} className="mt-0.5 flex-shrink-0" />
                <span>
                  En Costa Rica, los precios de restaurantes <strong>generalmente incluyen IVA del 13%</strong>.
                  Activa esta opción si tus precios ya tienen el IVA incorporado.
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Sección Cargo de Servicio ── */}
      <div className={CARD}>
        <SectionHeader
          icon={<Receipt size={16} />}
          title="Cargo de Servicio de Mesa"
          subtitle="Porcentaje adicional por servicio en mesa (típicamente 10% en CR)"
        />

        <div className="space-y-5">
          {/* Toggle servicio habilitado */}
          <div className="flex items-center justify-between py-3 px-4 rounded-xl" style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Cargo de servicio habilitado</p>
              <p className="text-xs text-[var(--text-secondary)]">Agregar cargo de servicio a los pedidos</p>
            </div>
            <ToggleSwitch checked={form.service_enabled} onChange={v => setForm(f => ({ ...f, service_enabled: v }))} />
          </div>

          {form.service_enabled && (
            <>
              {/* Tasa de servicio */}
              <div>
                <label className={LABEL}>Tasa de servicio (%)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={form.service_rate}
                    onChange={e => setForm(f => ({ ...f, service_rate: parseFloat(e.target.value) || 0 }))}
                    className={INPUT}
                    style={{ maxWidth: 120 }}
                  />
                  <span className="text-sm text-[var(--text-secondary)]">% (Costa Rica: 10%)</span>
                </div>
              </div>

              {/* A qué pedidos aplica */}
              <div>
                <label className={LABEL}>Aplica a</label>
                <div className="relative">
                  <select
                    value={form.service_applies_to}
                    onChange={e => setForm(f => ({ ...f, service_applies_to: e.target.value as TaxSettings['service_applies_to'] }))}
                    className={SELECT}
                  >
                    <option value="dine_in_only">Solo pedidos en mesa (Dine-in)</option>
                    <option value="all_orders">Todos los pedidos (mesa, takeout, delivery)</option>
                    <option value="disabled">Deshabilitado</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
                </div>
              </div>

              {/* Base de cálculo */}
              <div>
                <label className={LABEL}>Base de cálculo del servicio</label>
                <div className="relative">
                  <select
                    value={form.service_calculation_base}
                    onChange={e => setForm(f => ({ ...f, service_calculation_base: e.target.value as TaxSettings['service_calculation_base'] }))}
                    className={SELECT}
                  >
                    <option value="subtotal_before_tax">Sobre el subtotal (antes de IVA)</option>
                    <option value="subtotal_after_tax">Sobre el subtotal + IVA</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Preview en tiempo real ── */}
      <div className={CARD} style={{ borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.04)' }}>
        <SectionHeader
          icon={<Receipt size={16} />}
          title="Vista previa del desglose"
          subtitle={`Ejemplo con un pedido de mesa de ₡${previewAmount.toLocaleString()}`}
        />
        <div className="space-y-2">
          {preview.breakdown.map((line, i) => (
            <div
              key={i}
              className={`flex justify-between items-center ${line.type === 'total' ? 'pt-2 border-t font-bold' : ''}`}
              style={line.type === 'total' ? { borderColor: 'var(--border)' } : {}}
            >
              <span className={`text-sm ${line.type === 'total' ? 'text-[var(--text-primary)] font-bold' : line.type === 'tax_included' ? 'text-blue-400' : line.type === 'service' ? 'text-amber-400' : 'text-[var(--text-secondary)]'}`}>
                {line.type === 'tax_included' ? '↳ ' : ''}{line.label}
              </span>
              <span className={`text-sm font-semibold ${line.type === 'total' ? 'text-amber-400 text-base' : line.negative ? 'text-green-400' : line.type === 'tax_included' ? 'text-blue-400' : 'text-[var(--text-primary)]'}`}>
                {line.negative ? '-' : ''}₡{line.amount.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Botón guardar */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #F59E0B, #F97316)', color: '#fff', boxShadow: '0 4px 14px rgba(245,158,11,0.3)' }}
      >
        <Save size={16} />
        {saving ? 'Guardando...' : 'Guardar configuración de IVA'}
      </button>
    </div>
  );
}
