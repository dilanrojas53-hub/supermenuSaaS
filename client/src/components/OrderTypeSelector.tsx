/*
 * OrderTypeSelector — V20.0
 * Selector de tipo de pedido: Comer aquí (activo) / Takeaway (coming soon) / Delivery (coming soon)
 * Se muestra como primer paso del flujo del carrito, antes de customer_info.
 * Los tipos inactivos muestran un badge "Próximamente" y un toast al hacer clic.
 */
import { motion } from 'framer-motion';
import { UtensilsCrossed, Package, Bike, ArrowRight, Clock } from 'lucide-react';
import { toast } from 'sonner';
import type { ThemeSettings } from '@/lib/types';

export type OrderType = 'dine_in' | 'takeaway' | 'delivery';

interface OrderTypeOption {
  type: OrderType;
  icon: React.ReactNode;
  emoji: string;
  title: string;
  subtitle: string;
  active: boolean;
}

interface OrderTypeSelectorProps {
  theme: ThemeSettings;
  lang: string;
  onSelect: (type: OrderType) => void;
}

export default function OrderTypeSelector({ theme, lang, onSelect }: OrderTypeSelectorProps) {
  const es = lang === 'es';

  const options: OrderTypeOption[] = [
    {
      type: 'dine_in',
      icon: <UtensilsCrossed size={32} />,
      emoji: '🍽️',
      title: es ? 'Comer en el local' : 'Dine In',
      subtitle: es ? 'Te llevamos el pedido a tu mesa' : 'We bring your order to your table',
      active: true,
    },
    {
      type: 'takeaway',
      icon: <Package size={32} />,
      emoji: '🛍️',
      title: es ? 'Para llevar' : 'Takeaway',
      subtitle: es ? 'Retira tu pedido en el local' : 'Pick up your order at the restaurant',
      active: false,
    },
    {
      type: 'delivery',
      icon: <Bike size={32} />,
      emoji: '🛵',
      title: es ? 'A domicilio' : 'Delivery',
      subtitle: es ? 'Recíbelo en tu dirección' : 'Get it delivered to your address',
      active: false,
    },
  ];

  const handleClick = (option: OrderTypeOption) => {
    if (!option.active) {
      toast.info(
        es
          ? '🚀 Servicio aún no disponible, ¡muy pronto!'
          : '🚀 Service not available yet, coming soon!',
        { duration: 3000 }
      );
      return;
    }
    onSelect(option.type);
  };

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

      {/* Cards */}
      <div className="space-y-3">
        {options.map((option, i) => (
          <motion.button
            key={option.type}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.3 }}
            onClick={() => handleClick(option)}
            className="w-full text-left relative overflow-hidden"
            style={{
              borderRadius: '1.25rem',
              border: option.active
                ? `2px solid ${theme.primary_color}50`
                : `2px solid ${theme.text_color}10`,
              backgroundColor: option.active
                ? `${theme.primary_color}10`
                : `${theme.text_color}04`,
              opacity: option.active ? 1 : 0.65,
              cursor: option.active ? 'pointer' : 'not-allowed',
              padding: '1.125rem 1.25rem',
            }}
          >
            {/* Coming Soon badge */}
            {!option.active && (
              <div
                className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
                style={{
                  backgroundColor: '#F59E0B20',
                  border: '1px solid #F59E0B50',
                  color: '#F59E0B',
                }}
              >
                <Clock size={10} />
                <span>{es ? 'Próximamente' : 'Coming Soon'}</span>
              </div>
            )}

            <div className="flex items-center gap-4">
              {/* Icon circle */}
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: option.active
                    ? `${theme.primary_color}20`
                    : `${theme.text_color}08`,
                  color: option.active ? theme.primary_color : `${theme.text_color}40`,
                }}
              >
                {option.icon}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0 pr-8">
                <p
                  className="font-bold text-base leading-tight"
                  style={{ color: option.active ? theme.text_color : `${theme.text_color}60` }}
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

              {/* Arrow — only on active */}
              {option.active && (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: theme.primary_color, color: '#fff' }}
                >
                  <ArrowRight size={16} />
                </div>
              )}
            </div>
          </motion.button>
        ))}
      </div>

      {/* Footer note */}
      <p className="text-center text-xs mt-6 opacity-30" style={{ color: theme.text_color }}>
        <span>{es ? 'Más opciones disponibles próximamente' : 'More options coming soon'}</span>
      </p>
    </div>
  );
}
