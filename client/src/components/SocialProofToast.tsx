/*
 * Neuro-Ventas: Toast de Prueba Social en tiempo real.
 * Simula notificaciones de otros comensales ordenando.
 * "María acaba de pedir Casado con Carne en Salsa"
 * Aparece cada 15-25 segundos, desaparece tras 4 segundos.
 * Sesgo: Prueba Social + Urgencia + Efecto Bandwagon.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag } from 'lucide-react';
import type { MenuItem, ThemeSettings } from '@/lib/types';

interface SocialProofToastProps {
  items: MenuItem[];
  theme: ThemeSettings;
}

const NAMES = [
  'María', 'Carlos', 'Ana', 'José', 'Laura',
  'Diego', 'Sofía', 'Andrés', 'Valeria', 'Luis',
  'Gabriela', 'Fernando', 'Daniela', 'Roberto', 'Camila',
  'Alejandro', 'Isabella', 'Marco', 'Paula', 'Esteban',
];

const TIME_LABELS = [
  'hace un momento',
  'hace 2 minutos',
  'hace 3 minutos',
  'hace 5 minutos',
];

export default function SocialProofToast({ items, theme }: SocialProofToastProps) {
  const [visible, setVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Only use items that have badges (popular items)
  const popularItems = useMemo(() => {
    return items.filter(i => i.badge === 'mas_pedido' || i.badge === 'chef_recomienda' || i.is_featured);
  }, [items]);

  const showToast = useCallback(() => {
    if (popularItems.length === 0) return;
    setCurrentIndex(prev => (prev + 1) % popularItems.length);
    setVisible(true);
    setTimeout(() => setVisible(false), 4000);
  }, [popularItems]);

  useEffect(() => {
    if (popularItems.length === 0) return;

    // First toast after 8 seconds
    const initialTimer = setTimeout(() => {
      showToast();
    }, 8000);

    // Subsequent toasts every 18-28 seconds
    const interval = setInterval(() => {
      showToast();
    }, 18000 + Math.random() * 10000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [popularItems, showToast]);

  if (popularItems.length === 0) return null;

  const item = popularItems[currentIndex % popularItems.length];
  const name = NAMES[currentIndex % NAMES.length];
  const timeLabel = TIME_LABELS[currentIndex % TIME_LABELS.length];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: -100, y: 0 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: -100 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="fixed top-4 left-4 right-4 z-40 max-w-sm"
        >
          <div
            className="flex items-center gap-3 p-3 rounded-2xl backdrop-blur-md"
            style={{
              backgroundColor: `${theme.background_color}F0`,
              boxShadow: `0 4px 20px ${theme.primary_color}15, 0 1px 3px rgba(0,0,0,0.1)`,
              border: `1px solid ${theme.primary_color}15`,
            }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${theme.primary_color}12` }}
            >
              <ShoppingBag size={16} style={{ color: theme.primary_color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold leading-tight" style={{ color: theme.text_color }}>
                <span style={{ color: theme.primary_color }}>{name}</span> pidió{' '}
                <span className="font-bold">{item.name}</span>
              </p>
              <p className="text-[10px] opacity-50 mt-0.5" style={{ color: theme.text_color }}>
                {timeLabel}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
