/**
 * DeliveryFeeAdjuster.tsx
 * Mini-componente inline para que el admin confirme o ajuste
 * el costo de envío de un pedido delivery específico.
 *
 * Lógica:
 * - Si delivery_fee_pending = true (tarifa "por confirmar"), muestra el formulario de entrada.
 * - Si delivery_fee_final ya tiene valor, lo muestra con opción de editar.
 * - Al guardar, actualiza delivery_fee_final y delivery_fee_pending = false.
 */
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Pencil, Check, X, DollarSign, AlertCircle } from 'lucide-react';
import { formatPrice } from '@/lib/types';

interface DeliveryFeeAdjusterProps {
  orderId: string;
  orderNumber: number;
  currentFee: number | null;
  feePending: boolean;
}

export default function DeliveryFeeAdjuster({
  orderId,
  orderNumber,
  currentFee,
  feePending,
}: DeliveryFeeAdjusterProps) {
  const [editing, setEditing] = useState(feePending && currentFee === null);
  const [inputVal, setInputVal] = useState(currentFee != null ? String(currentFee) : '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const fee = parseInt(inputVal.replace(/[^0-9]/g, '')) || 0;
    if (fee < 0) { toast.error('El costo de envío no puede ser negativo.'); return; }
    setSaving(true);
    const { error } = await supabase
      .from('orders')
      .update({ delivery_fee_final: fee, delivery_fee_pending: false })
      .eq('id', orderId);
    setSaving(false);
    if (error) {
      toast.error('Error al guardar el costo de envío.');
    } else {
      toast.success(`Costo de envío del pedido #${orderNumber} actualizado: ${formatPrice(fee)}`);
      setEditing(false);
    }
  };

  // Si no hay tarifa pendiente y ya tiene valor, mostrar badge con opción de editar
  if (!editing && currentFee != null) {
    return (
      <div
        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg mb-2"
        style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}
      >
        <div className="flex items-center gap-1.5">
          <DollarSign size={11} className="text-blue-400" />
          <span className="text-xs text-blue-300 font-semibold">Envío: {formatPrice(currentFee)}</span>
        </div>
        <button
          onClick={() => { setInputVal(String(currentFee)); setEditing(true); }}
          className="p-1 rounded text-blue-400 hover:text-blue-200 transition-colors"
          title="Ajustar costo de envío"
        >
          <Pencil size={11} />
        </button>
      </div>
    );
  }

  // Si hay tarifa pendiente (por confirmar) o está editando
  if (feePending || editing) {
    return (
      <div
        className="px-2.5 py-2 rounded-lg mb-2 space-y-2"
        style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}
      >
        <div className="flex items-center gap-1.5">
          <AlertCircle size={11} className="text-amber-400 flex-shrink-0" />
          <span className="text-xs text-amber-300 font-semibold">Costo de envío por confirmar</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-amber-300 font-bold">₡</span>
            <input
              type="number"
              min="0"
              step="100"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
              placeholder="0"
              className="w-full pl-6 pr-2 py-1.5 rounded-lg text-sm font-bold text-amber-200 outline-none"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)' }}
              autoFocus
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="p-1.5 rounded-lg transition-all hover:opacity-80 disabled:opacity-50"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.3)' }}
            title="Confirmar costo"
          >
            <Check size={14} />
          </button>
          {currentFee != null && (
            <button
              onClick={() => setEditing(false)}
              className="p-1.5 rounded-lg transition-all hover:opacity-80"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171', border: '1px solid rgba(239,68,68,0.25)' }}
              title="Cancelar"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {inputVal && parseInt(inputVal) > 0 && (
          <p className="text-xs text-amber-300/70">
            Se guardará como: <strong>{formatPrice(parseInt(inputVal))}</strong>
          </p>
        )}
      </div>
    );
  }

  // Sin tarifa y sin pendiente — mostrar botón para agregar
  return (
    <button
      onClick={() => setEditing(true)}
      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg mb-2 text-xs font-semibold transition-all hover:opacity-80"
      style={{ background: 'rgba(100,116,139,0.08)', color: 'var(--text-secondary)', border: '1px dashed rgba(100,116,139,0.3)' }}
    >
      <DollarSign size={11} /> Agregar costo de envío
    </button>
  );
}
