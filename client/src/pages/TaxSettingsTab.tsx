/**
 * TaxSettingsTab — Configuración de IVA, Servicio de Mesa y Empaque
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Tenant } from '@/lib/types';
import { Receipt, Percent, Save, ChevronDown, Package, Info } from 'lucide-react';
import { calculateOrderTotals, DEFAULT_TAX_SETTINGS, type TaxSettings } from '@/lib/orderTotals';

interface TaxSettingsTabProps { tenant: Tenant; }

const CARD = 'bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 space-y-5';
const LABEL = 'block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide';
const INPUT = 'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none';
const SELECT = 'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none appearance-none';

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex-shrink-0">
      <div className="relative w-11 h-6 rounded-full transition-colors" style={{ backgroundColor: checked ? '#22C55E' : '#475569' }}>
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </div>
    </button>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-2">
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

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs" style={{ backgroundColor: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', color: '#93C5FD' }}>
      <Info size={13} className="mt-0.5 flex-shrink-0 text-blue-400" />
      <span>{children}</span>
    </div>
  );
}

function RowToggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl" style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)' }}>
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
        {description && <p className="text-xs text-[var(--text-secondary)]">{description}</p>}
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  );
}

export default function TaxSettingsTab({ tenant }: TaxSettingsTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS);
  const [previewAmount] = useState(10000);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('tax_settings').select('*').eq('tenant_id', tenant.id).maybeSingle();
      if (data) {
        setForm({
          tax_enabled: data.tax_enabled ?? DEFAULT_TAX_SETTINGS.tax_enabled,
          tax_rate: data.tax_rate ?? DEFAULT_TAX_SETTINGS.tax_rate,
          prices_include_tax: data.prices_include_tax ?? DEFAULT_TAX_SETTINGS.prices_include_tax,
          prices_include_service: data.prices_include_service ?? DEFAULT_TAX_SETTINGS.prices_include_service,
          service_enabled: data.service_enabled ?? DEFAULT_TAX_SETTINGS.service_enabled,
          service_rate: data.service_rate ?? DEFAULT_TAX_SETTINGS.service_rate,
          service_applies_to: data.service_applies_to ?? DEFAULT_TAX_SETTINGS.service_applies_to,
          service_calculation_base: data.service_calculation_base ?? DEFAULT_TAX_SETTINGS.service_calculation_base,
          packaging_enabled: data.packaging_enabled ?? DEFAULT_TAX_SETTINGS.packaging_enabled,
          packaging_amount: data.packaging_amount ?? DEFAULT_TAX_SETTINGS.packaging_amount,
          packaging_per: data.packaging_per ?? DEFAULT_TAX_SETTINGS.packaging_per,
          packaging_applies_to: data.packaging_applies_to ?? DEFAULT_TAX_SETTINGS.packaging_applies_to,
        });
      }
      setLoading(false);
    };
    load();
  }, [tenant.id]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('tax_settings').upsert({
      tenant_id: tenant.id,
      tax_enabled: form.tax_enabled,
      tax_rate: form.tax_rate,
      prices_include_tax: form.prices_include_tax,
      prices_include_service: form.prices_include_service,
      service_enabled: form.service_enabled,
      service_rate: form.service_rate,
      service_applies_to: form.service_applies_to,
      service_calculation_base: form.service_calculation_base,
      packaging_enabled: form.packaging_enabled,
      packaging_amount: form.packaging_amount,
      packaging_per: form.packaging_per,
      packaging_applies_to: form.packaging_applies_to,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' });
    if (error) toast.error('Error al guardar: ' + error.message);
    else toast.success('Configuracion guardada');
    setSaving(false);
  };

  const previewDineIn = calculateOrderTotals({ itemsSubtotal: previewAmount, orderType: 'dine_in', hasTable: true, taxSettings: form, discountAmount: 0, itemCount: 2 });
  const previewTakeout = calculateOrderTotals({ itemsSubtotal: previewAmount, orderType: 'takeout', hasTable: false, taxSettings: form, discountAmount: 0, itemCount: 2 });

  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* IVA */}
      <div className={CARD}>
        <SectionHeader icon={<Percent size={16} />} title="Impuesto al Valor Agregado (IVA)" subtitle="Configuracion del IVA aplicable a los pedidos" />
        <RowToggle label="IVA habilitado" description="Mostrar y calcular IVA en los pedidos" checked={form.tax_enabled} onChange={v => setForm(f => ({ ...f, tax_enabled: v }))} />
        {form.tax_enabled && (
          <>
            <div>
              <label className={LABEL}>Tasa de IVA (%)</label>
              <div className="flex items-center gap-3">
                <input type="number" min={0} max={100} step={0.5} value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: parseFloat(e.target.value) || 0 }))} className={INPUT} style={{ maxWidth: 120 }} />
                <span className="text-sm text-[var(--text-secondary)]">% (Costa Rica: 13%)</span>
              </div>
            </div>
            <RowToggle label="Los precios del menu ya incluyen IVA" description="Activar si los precios publicados son precios finales con IVA incluido" checked={form.prices_include_tax} onChange={v => setForm(f => ({ ...f, prices_include_tax: v }))} />
            {form.prices_include_tax && <InfoBox>El IVA se desglosara informativamente en el carrito pero no se sumara al total.</InfoBox>}
          </>
        )}
      </div>

      {/* Servicio 10% */}
      <div className={CARD}>
        <SectionHeader icon={<Receipt size={16} />} title="Cargo de Servicio (10%)" subtitle="Configuracion del cargo de servicio de mesa" />
        <RowToggle label="Cargo de servicio habilitado" description="Activar para gestionar el 10% de servicio" checked={form.service_enabled} onChange={v => setForm(f => ({ ...f, service_enabled: v }))} />
        {form.service_enabled && (
          <>
            <div>
              <label className={LABEL}>Tasa de servicio (%)</label>
              <div className="flex items-center gap-3">
                <input type="number" min={0} max={100} step={0.5} value={form.service_rate} onChange={e => setForm(f => ({ ...f, service_rate: parseFloat(e.target.value) || 0 }))} className={INPUT} style={{ maxWidth: 120 }} />
                <span className="text-sm text-[var(--text-secondary)]">% (Costa Rica: 10%)</span>
              </div>
            </div>

            <div className="space-y-3">
              <label className={LABEL}>Los precios del menu ya incluyen el {form.service_rate}% de servicio?</label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: true,  label: 'Si, ya incluido', desc: 'Para llevar/delivery: precio / ' + (1 + form.service_rate / 100).toFixed(2) },
                  { value: false, label: 'No, sin servicio', desc: 'Para mesa: se suma ' + form.service_rate + '% adicional' },
                ] as { value: boolean; label: string; desc: string }[]).map(opt => (
                  <button key={String(opt.value)} onClick={() => setForm(f => ({ ...f, prices_include_service: opt.value }))}
                    className="px-4 py-3 rounded-xl text-left transition-all"
                    style={{ backgroundColor: form.prices_include_service === opt.value ? 'rgba(245,158,11,0.15)' : 'var(--bg-base)', border: `1px solid ${form.prices_include_service === opt.value ? '#F59E0B' : 'var(--border)'}` }}>
                    <p className="text-sm font-semibold" style={{ color: form.prices_include_service === opt.value ? '#F59E0B' : 'var(--text-primary)' }}>{opt.label}</p>
                    <p className="text-xs mt-0.5 text-[var(--text-secondary)]">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {form.prices_include_service ? (
              <InfoBox>
                Modo: servicio incluido en precios. Mesa/local: precio del menu sin cambios. Para llevar / Delivery: precio / {(1 + form.service_rate / 100).toFixed(2)} — el servicio se quita automaticamente.
              </InfoBox>
            ) : (
              <>
                <div>
                  <label className={LABEL}>Aplica a</label>
                  <div className="relative">
                    <select value={form.service_applies_to} onChange={e => setForm(f => ({ ...f, service_applies_to: e.target.value as TaxSettings['service_applies_to'] }))} className={SELECT}>
                      <option value="dine_in_only">Solo pedidos en mesa (Dine-in)</option>
                      <option value="all_orders">Todos los pedidos (mesa, takeout, delivery)</option>
                      <option value="disabled">Deshabilitado</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Base de calculo del servicio</label>
                  <div className="relative">
                    <select value={form.service_calculation_base} onChange={e => setForm(f => ({ ...f, service_calculation_base: e.target.value as TaxSettings['service_calculation_base'] }))} className={SELECT}>
                      <option value="subtotal_before_tax">Sobre el subtotal (antes de IVA)</option>
                      <option value="subtotal_after_tax">Sobre el subtotal + IVA</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Empaque */}
      <div className={CARD}>
        <SectionHeader icon={<Package size={16} />} title="Cargo de Empaque" subtitle="Cobro separado por empaque en pedidos para llevar o delivery" />
        <RowToggle label="Cobro de empaque habilitado" description="Agregar cargo de empaque a pedidos para llevar o delivery" checked={form.packaging_enabled} onChange={v => setForm(f => ({ ...f, packaging_enabled: v }))} />
        {form.packaging_enabled && (
          <>
            <div>
              <label className={LABEL}>Monto del empaque</label>
              <input type="number" min={0} step={50} value={form.packaging_amount} onChange={e => setForm(f => ({ ...f, packaging_amount: parseFloat(e.target.value) || 0 }))} className={INPUT} style={{ maxWidth: 160 }} placeholder="Ej: 500" />
            </div>
            <div className="space-y-3">
              <label className={LABEL}>Cobro por</label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'order', label: 'Por pedido', desc: 'Un cobro fijo por pedido' },
                  { value: 'item',  label: 'Por item',   desc: 'Multiplica por cantidad de items' },
                ] as { value: string; label: string; desc: string }[]).map(opt => (
                  <button key={opt.value} onClick={() => setForm(f => ({ ...f, packaging_per: opt.value as 'order' | 'item' }))}
                    className="px-4 py-3 rounded-xl text-left transition-all"
                    style={{ backgroundColor: form.packaging_per === opt.value ? 'rgba(245,158,11,0.15)' : 'var(--bg-base)', border: `1px solid ${form.packaging_per === opt.value ? '#F59E0B' : 'var(--border)'}` }}>
                    <p className="text-sm font-semibold" style={{ color: form.packaging_per === opt.value ? '#F59E0B' : 'var(--text-primary)' }}>{opt.label}</p>
                    <p className="text-xs mt-0.5 text-[var(--text-secondary)]">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={LABEL}>Aplicar a</label>
              <div className="relative">
                <select value={form.packaging_applies_to} onChange={e => setForm(f => ({ ...f, packaging_applies_to: e.target.value as TaxSettings['packaging_applies_to'] }))} className={SELECT}>
                  <option value="both">Para llevar y Delivery</option>
                  <option value="takeout">Solo Para llevar</option>
                  <option value="delivery">Solo Delivery</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
              </div>
            </div>
            <InfoBox>El empaque es un cargo separado y nunca se confunde con el servicio de mesa.</InfoBox>
          </>
        )}
      </div>

      {/* Vista previa */}
      <div className={CARD} style={{ borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.04)' }}>
        <SectionHeader icon={<Receipt size={16} />} title="Vista previa del desglose" subtitle={`Ejemplo con un pedido de ${previewAmount.toLocaleString()} (2 items)`} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wide">Mesa / Local</p>
            {previewDineIn.breakdown.map((line, i) => (
              <div key={i} className={`flex justify-between items-center ${line.type === 'total' ? 'pt-2 border-t font-bold' : ''}`} style={line.type === 'total' ? { borderColor: 'var(--border)' } : {}}>
                <span className={`text-sm ${line.type === 'total' ? 'text-[var(--text-primary)] font-bold' : line.type === 'tax_included' ? 'text-blue-400' : line.type === 'service' ? 'text-amber-400' : 'text-[var(--text-secondary)]'}`}>
                  {line.type === 'tax_included' ? '> ' : ''}{line.label}
                </span>
                <span className={`text-sm font-semibold ${line.type === 'total' ? 'text-amber-400 text-base' : line.negative ? 'text-green-400' : line.type === 'tax_included' ? 'text-blue-400' : 'text-[var(--text-primary)]'}`}>
                  {line.informative ? 'incluido' : `${line.negative ? '-' : ''}${line.amount.toLocaleString()}`}
                </span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold text-blue-400 uppercase tracking-wide">Para llevar</p>
            {previewTakeout.breakdown.map((line, i) => (
              <div key={i} className={`flex justify-between items-center ${line.type === 'total' ? 'pt-2 border-t font-bold' : ''}`} style={line.type === 'total' ? { borderColor: 'var(--border)' } : {}}>
                <span className={`text-sm ${line.type === 'total' ? 'text-[var(--text-primary)] font-bold' : line.type === 'tax_included' ? 'text-blue-400' : line.type === 'service_stripped' ? 'text-blue-300' : line.type === 'service' ? 'text-amber-400' : line.type === 'packaging' ? 'text-orange-400' : 'text-[var(--text-secondary)]'}`}>
                  {line.type === 'tax_included' ? '> ' : ''}{line.label}
                </span>
                <span className={`text-sm font-semibold ${line.type === 'total' ? 'text-blue-400 text-base' : line.negative ? 'text-green-400' : line.type === 'tax_included' ? 'text-blue-400' : line.type === 'packaging' ? 'text-orange-400' : 'text-[var(--text-primary)]'}`}>
                  {line.informative ? 'incluido' : `${line.negative ? '-' : ''}${line.amount.toLocaleString()}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Boton guardar */}
      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #F59E0B, #F97316)', color: '#fff', boxShadow: '0 4px 14px rgba(245,158,11,0.3)' }}>
        <Save size={16} />
        {saving ? 'Guardando...' : 'Guardar configuracion'}
      </button>
    </div>
  );
}
