/*
 * OrderTypeSelector — V22.0
 * - Naming estandarizado: emite 'takeout' (no 'takeaway')
 * - dineInEnabled prop controla si Mesa está disponible
 * - Tipos con enabled=false se OCULTAN (no "Próximamente") — solo se muestran los activos
 * - Si solo hay 1 tipo activo, el componente llama onSelect automáticamente (sin fricción)
 */
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { UtensilsCrossed, Package, Bike, ArrowRight } from 'lucide-react';
import type { ThemeSettings } from '@/lib/types';

export type OrderType = 'dine_in' | 'takeout' | 'delivery';

interface OrderTypeOption {
  type: OrderType;
  icon: React.ReactNode;
  emoji: string;
  title: string;
  subtitle: string;
}

interface OrderTypeSelectorProps {
  theme: ThemeSettings;
  lang: string;
  onSelect: (type: OrderType) => void;
  /** When true, dine_in option is shown */
  dineInEnabled?: boolean;
  /** When true, takeout option is shown */
  takeawayEnabled?: boolean;
  /** When true, delivery option is shown */
  deliveryEnabled?: boolean;
}

export default function OrderTypeSelector({
  theme,
  lang,
  onSelect,
  dineInEnabled = true,
  takeawayEnabled = false,
  deliveryEnabled = false,
}: OrderTypeSelectorProps) {
  const es = lang === 'es';

  const allOptions: (OrderTypeOption & { enabled: boolean })[] = [
    {
      type: 'dine_in',
      icon: <UtensilsCrossed size={32} />,
      emoji: '🍽️',
      title: es ? 'Comer en el local' : 'Dine In',
      subtitle: es ? 'Te llevamos el pedido a tu mesa' : 'We bring your order to your table',
      enabled: dineInEnabled,
    },
    {
      type: 'takeout',
      icon: <Package size={32} />,
      emoji: '🛍️',
      title: es ? 'Para llevar' : 'Takeout',
      subtitle: es ? 'Retira tu pedido en el local' : 'Pick up your order at the restaurant',
      enabled: takeawayEnabled,
    },
    {
      type: 'delivery',
      icon: <Bike size={32} />,
      emoji: '🛵',
      title: es ? 'A domicilio' : 'Delivery',
      subtitle: es ? 'Recíbelo en tu dirección' : 'Get it delivered to your address',
      enabled: deliveryEnabled,
    },
  ];

  // Solo mostrar los tipos habilitados
  const options = allOptions.filter(o => o.enabled);

  // Auto-selección si solo hay 1 tipo activo
  useEffect(() => {
    if (options.length === 1) {
      onSelect(options[0].type);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si no hay opciones activas, mostrar mensaje
  if (options.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <p className="text-sm opacity-50" style={{ color: theme.text_color }}>
          {es ? 'No hay tipos de pedido disponibles en este momento.' : 'No order types available at this time.'}
        </p>
      </div>
    );
  }

  // Si solo hay 1, no renderizar nada (el useEffect ya lo seleccionó)
  if (options.length === 1) {
    return null;
  }

  return (
    <div className="flex-1 overflow-y-auto p-5">
      {/* Heading */}
      <div className="mb-6 text-center">
        <h3
          className="text-xl font-bold mb-1"
          style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
        >
          {es ? '¿Cómo querés tu pedido?' : 'How would you like your order?'}
        </h3>
        <p className="text-sm opacity-50" style={{ color: theme.text_color }}>
          {es ? 'Seleccioná una opción para continuar' : 'Select an option to continue'}
        </p>
      </div>

      {/* Cards — solo los activos */}
      <div className="space-y-3">
        {options.map((option, i) => (
          <motion.button
            key={option.type}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.3 }}
            onClick={() => onSelect(option.type)}
            className="w-full text-left relative overflow-hidden"
            style={{
              borderRadius: '1.25rem',
              border: `2px solid ${theme.primary_color}50`,
              backgroundColor: `${theme.primary_color}10`,
              cursor: 'pointer',
              padding: '1.125rem 1.25rem',
            }}
          >
            <div className="flex items-center gap-4">
              {/* Icon circle */}
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: `${theme.primary_color}20`,
                  color: theme.primary_color,
                }}
              >
                {option.icon}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0 pr-8">
                <p
                  className="font-bold text-base leading-tight"
                  style={{ color: theme.text_color }}
                >
                  {option.emoji} <span>{option.title}</span>
                </p>
                <p
                  className="text-sm mt-0.5 leading-snug"
                  style={{ color: `${theme.text_color}50` }}
                >
                  <span>{option.subtitle}</span>
                </p>
              </div>

              {/* Arrow */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: theme.primary_color, color: '#fff' }}
              >
                <ArrowRight size={16} />
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
