from pathlib import Path
import re

ADMIN_PATH = Path('client/src/pages/AdminDashboard.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 exact match, found {count}')
    return text.replace(old, new, 1)


def sub_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 regex match, found {count}')
    return updated


admin = ADMIN_PATH.read_text(encoding='utf-8')

# Idempotent: a checkout already containing the generated changes needs no work.
if "supabase.rpc('admin_transition_order'" in admin and 'statusUpdating' in admin:
    print('Admin order flow is already patched.')
    raise SystemExit(0)

admin = replace_once(
    admin,
    "  const [sinpeBlockMode, setSinpeBlockMode] = useState<'always' | 'delivery_only' | 'never'>('always');",
    "  const [sinpeBlockMode, setSinpeBlockMode] = useState<'always' | 'delivery_only' | 'never'>('always');\n  const [statusUpdating, setStatusUpdating] = useState<Set<string>>(new Set());",
    'statusUpdating state',
)

admin = sub_once(
    admin,
    r"  // ── Validar pago SINPE delivery y enviar a cocina en un solo paso ──\n  const handleValidateSinpeDelivery = async \(orderId: string\) => \{.*?\n  \};\n\n  useEffect\(\(\) => \{ fetchOrders\(\); \}, \[fetchOrders\]\);",
    '''  // ── Validar pago SINPE y confirmar que la transición ocurrió realmente ──
  const handleValidateSinpeDelivery = async (orderId: string) => {
    if (statusUpdating.has(orderId)) return;
    setStatusUpdating(prev => new Set(prev).add(orderId));
    try {
      const { data, error } = await supabase.rpc('admin_validate_sinpe_order', {
        p_order_id: orderId,
      });
      if (error) throw error;
      const updated = Array.isArray(data) ? data[0] : data;
      if (!updated || updated.status !== 'en_cocina' || updated.payment_status !== 'paid') {
        throw new Error('La base de datos no confirmó el cambio del pedido');
      }

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updated } as Order : o));
      toast.success('✅ Pago SINPE validado — pedido enviado a cocina');
      stopAlarm();

      const order = orders.find(o => o.id === orderId);
      if (order) {
        const customerPhone = (order as any).delivery_phone || order.customer_phone;
        if (customerPhone) {
          const name = order.customer_name || 'Cliente';
          const shortId = String(order.order_number);
          const waMsg = `¡Hola ${name}! Tu pago SINPE fue verificado ✅.\nTu pedido #${shortId} ya está siendo preparado en cocina. 🍳`;
          const waUrl = buildWhatsAppUrl(customerPhone, waMsg);
          if (waUrl) setTimeout(() => window.open(waUrl, '_blank'), 500);
        }
      }
      await fetchOrders();
    } catch (err: any) {
      const message = err?.message || String(err);
      if (message.includes('not_authorized') || message.includes('JWT') || message.includes('not_authenticated')) {
        toast.error('La sesión de administrador venció. Vuelve a iniciar sesión.');
      } else {
        toast.error('No se pudo validar el pago: ' + message);
      }
      console.error('[Admin] validate SINPE failed', err);
      await fetchOrders();
    } finally {
      setStatusUpdating(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  useEffect(() => { fetchOrders(); }, [fetchOrders]);''',
    'SINPE transition',
)

admin = sub_once(
    admin,
    r"  const handleStatusChange = async \(orderId: string, newStatus: string\) => \{.*?\n  \};\n\n  // ── Entregar al Rider:",
    '''  const handleStatusChange = async (orderId: string, newStatus: string) => {
    if (statusUpdating.has(orderId)) return;
    const order = orders.find(o => o.id === orderId);
    const isDeliveryOrder = (order as any)?.delivery_type === 'delivery';
    if (isDeliveryOrder && newStatus === 'entregado') {
      toast.error('Para delivery, usa el botón "Entregar al Rider". Solo el rider completa la entrega.');
      return;
    }

    setStatusUpdating(prev => new Set(prev).add(orderId));
    try {
      const { data, error } = await supabase.rpc('admin_transition_order', {
        p_order_id: orderId,
        p_new_status: newStatus,
      });
      if (error) throw error;
      const updated = Array.isArray(data) ? data[0] : data;
      if (!updated || updated.status !== newStatus) {
        throw new Error(`La base de datos mantuvo el pedido en ${updated?.status || 'estado desconocido'}`);
      }

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updated } as Order : o));
      const label = ORDER_STATUS_CONFIG[newStatus]?.label || newStatus;
      toast.success(`✅ ${label}`);
      stopAlarm();
      await fetchOrders();

      if (!order) return;
      const deliveryType = (order as any).delivery_type || 'dine_in';
      if (deliveryType === 'delivery') return;
      const customerPhone = (order as any).delivery_phone || order.customer_phone;
      if (!customerPhone) return;
      const name = order.customer_name || 'Cliente';
      const shortId = String(order.order_number);
      if (newStatus === 'listo' && deliveryType === 'takeout') {
        const waMsg = `¡Buenas noticias ${name}! Tu pedido #${shortId} ya está LISTO 🎉.\nYa puedes pasar por él al local.`;
        const waUrl = buildWhatsAppUrl(customerPhone, waMsg);
        if (waUrl) setTimeout(() => window.open(waUrl, '_blank'), 500);
      }
    } catch (err: any) {
      const message = err?.message || String(err);
      if (message.includes('not_authorized') || message.includes('JWT') || message.includes('not_authenticated')) {
        toast.error('La sesión de administrador venció. Vuelve a iniciar sesión.');
      } else if (message.includes('invalid_transition')) {
        toast.error('El pedido cambió en otro dispositivo. Se actualizará la vista.');
      } else {
        toast.error('No se pudo mover el pedido: ' + message);
      }
      console.error('[Admin] order transition failed', err);
      await fetchOrders();
    } finally {
      setStatusUpdating(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  // ── Entregar al Rider:''',
    'status transition',
)

admin = replace_once(
    admin,
    '''              <button key={action.nextStatus}
                onClick={() => handleStatusChange(order.id, action.nextStatus)}
                className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold transition-all active:scale-[0.97] touch-manipulation"
                style={{ backgroundColor: `${action.color}20`, color: action.color, border: `1px solid ${action.color}40` }}>
                <span>{action.icon}</span> {action.label}
              </button>''',
    '''              <button key={action.nextStatus}
                onClick={() => handleStatusChange(order.id, action.nextStatus)}
                disabled={statusUpdating.has(order.id)}
                className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold transition-all active:scale-[0.97] touch-manipulation disabled:opacity-55 disabled:cursor-wait"
                style={{ backgroundColor: `${action.color}20`, color: action.color, border: `1px solid ${action.color}40` }}>
                {statusUpdating.has(order.id)
                  ? <><Loader2 size={12} className="animate-spin" /> Moviendo...</>
                  : <><span>{action.icon}</span> {action.label}</>}
              </button>''',
    'status action button',
)

ADMIN_PATH.write_text(admin, encoding='utf-8')
print('Admin order flow patched successfully.')
