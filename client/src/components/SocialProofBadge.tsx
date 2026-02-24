/*
 * Neuro-Ventas: Badges de Prueba Social con animaciones.
 * - "Más pedido" → pulso + contador de pedidos hoy
 * - "Se agota rápido" → parpadeo urgente + unidades restantes
 * - "Nuevo" → brillo shimmer
 * - "Chef recomienda" → sello dorado con estrella
 * Sesgos cognitivos: Prueba Social, Escasez, Novedad, Autoridad.
 */
import { motion } from 'framer-motion';
import { Flame, Zap, Sparkles, Award, Users, Clock } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import type { ThemeSettings } from '@/lib/types';

interface SocialProofBadgeProps {
  badge: string;
  theme: ThemeSettings;
  itemId: string;
  compact?: boolean;
}

// Deterministic pseudo-random based on item ID
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export default function SocialProofBadge({ badge, theme, itemId, compact = false }: SocialProofBadgeProps) {
  const [showCounter, setShowCounter] = useState(false);

  // Deterministic values based on itemId
  const seed = useMemo(() => hashCode(itemId), [itemId]);
  const ordersToday = useMemo(() => 15 + (seed % 35), [seed]);
  const unitsLeft = useMemo(() => 2 + (seed % 5), [seed]);
  const minutesAgo = useMemo(() => 2 + (seed % 12), [seed]);

  useEffect(() => {
    const timer = setTimeout(() => setShowCounter(true), 800);
    return () => clearTimeout(timer);
  }, []);

  if (badge === 'mas_pedido') {
    return (
      <div className="flex flex-col gap-1">
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
          style={{
            background: 'linear-gradient(135deg, #FF6B35, #F7931E)',
            color: '#fff',
            boxShadow: '0 2px 8px rgba(255, 107, 53, 0.35)',
          }}
        >
          <Flame size={12} />
          <span>Más pedido</span>
        </motion.div>
        {showCounter && !compact && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1 text-[10px] font-medium pl-1 opacity-70"
            style={{ color: theme.text_color }}
          >
            <Users size={10} />
            <span>{ordersToday} personas lo pidieron hoy</span>
          </motion.div>
        )}
      </div>
    );
  }

  if (badge === 'se_agota_rapido') {
    return (
      <div className="flex flex-col gap-1">
        <motion.div
          animate={{ opacity: [1, 0.7, 1] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
          style={{
            background: 'linear-gradient(135deg, #E53E3E, #C53030)',
            color: '#fff',
            boxShadow: '0 2px 8px rgba(229, 62, 62, 0.35)',
          }}
        >
          <Zap size={12} />
          <span>Se agota rápido</span>
        </motion.div>
        {showCounter && !compact && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1 text-[10px] font-medium pl-1"
            style={{ color: '#E53E3E' }}
          >
            <Clock size={10} />
            <span>Solo quedan {unitsLeft} disponibles</span>
          </motion.div>
        )}
      </div>
    );
  }

  if (badge === 'nuevo') {
    return (
      <div className="flex flex-col gap-1">
        <motion.div
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #38A169, #2F855A)',
            color: '#fff',
            boxShadow: '0 2px 8px rgba(56, 161, 105, 0.35)',
          }}
        >
          {/* Shimmer effect */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
            }}
            animate={{ x: ['-100%', '200%'] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut', repeatDelay: 1 }}
          />
          <Sparkles size={12} />
          <span className="relative z-10">Nuevo</span>
        </motion.div>
        {showCounter && !compact && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1 text-[10px] font-medium pl-1 opacity-70"
            style={{ color: theme.text_color }}
          >
            <Sparkles size={10} />
            <span>Agregado esta semana</span>
          </motion.div>
        )}
      </div>
    );
  }

  if (badge === 'chef_recomienda') {
    return (
      <div className="flex flex-col gap-1">
        <motion.div
          animate={{ rotate: [0, -2, 2, 0] }}
          transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
          style={{
            background: 'linear-gradient(135deg, #D69E2E, #B7791F)',
            color: '#fff',
            boxShadow: '0 2px 8px rgba(214, 158, 46, 0.35)',
          }}
        >
          <Award size={12} />
          <span>Chef recomienda</span>
        </motion.div>
        {showCounter && !compact && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1 text-[10px] font-medium pl-1 opacity-70"
            style={{ color: theme.text_color }}
          >
            <Users size={10} />
            <span>Pedido hace {minutesAgo} min</span>
          </motion.div>
        )}
      </div>
    );
  }

  return null;
}
