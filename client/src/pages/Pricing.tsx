/*
 * Pricing.tsx — Página de Precios de SuperMenu
 * Planes: Esencial (basic) | Operación (pro) | Growth (premium)
 * Add-on: Delivery OS (separable, compatible con cualquier plan)
 * Features agrupadas por valor: Núcleo → Operación → Crecimiento → Analítica
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowLeft, Crown, Star, Zap, Truck, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'wouter';
import PoweredByFooter from '@/components/PoweredByFooter';
import { PLAN_META, DELIVERY_OS_META, formatPlanPrice } from '@/lib/plans';

const LOGO_WHITE = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663241686300/OmbbPNnVFlwOoZKI.png";
const WHATSAPP_NUMBER = '50662014922';

interface FeatureGroup {
  label: string;
  features: {
    text: string;
    plans: ('basic' | 'pro' | 'premium')[];
    highlight?: boolean;
  }[];
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    label: 'A. Núcleo comercial',
    features: [
      { text: 'Menú digital con fotos y precios',          plans: ['basic', 'pro', 'premium'] },
      { text: 'Código QR descargable',                     plans: ['basic', 'pro', 'premium'] },
      { text: 'Branding básico (logo, colores, fuente)',   plans: ['basic', 'pro', 'premium'] },
      { text: 'Pedidos directos desde el menú',            plans: ['basic', 'pro', 'premium'] },
      { text: 'Checkout completo',                         plans: ['basic', 'pro', 'premium'] },
      { text: 'Pagos SINPE Móvil y Efectivo',              plans: ['basic', 'pro', 'premium'] },
      { text: 'Historial básico de pedidos',               plans: ['basic', 'pro', 'premium'] },
    ],
  },
  {
    label: 'B. Operación interna',
    features: [
      { text: 'Panel de pedidos en vivo (Kanban)',         plans: ['pro', 'premium'], highlight: true },
      { text: 'Panel de meseros con login propio',         plans: ['pro', 'premium'], highlight: true },
      { text: 'Quick Add de pedidos desde el staff',       plans: ['pro', 'premium'] },
      { text: 'Solicitudes rápidas (agua, ayuda…)',        plans: ['pro', 'premium'] },
      { text: 'KDS — Pantalla de cocina en tiempo real',   plans: ['pro', 'premium'], highlight: true },
      { text: 'Gestión de equipo (roles y accesos)',       plans: ['pro', 'premium'] },
      { text: 'Modificadores de productos',                plans: ['pro', 'premium'] },
      { text: 'Temas avanzados y branding premium',        plans: ['pro', 'premium'] },
      { text: 'Menú bilingüe ES/EN',                       plans: ['pro', 'premium'] },
      { text: 'Analítica básica (ventas, ticket promedio)', plans: ['pro', 'premium'] },
    ],
  },
  {
    label: 'C. Conversión y crecimiento',
    features: [
      { text: 'Neuro-Badges (escasez y urgencia)',         plans: ['premium'], highlight: true },
      { text: 'Plato destacado en el menú',                plans: ['premium'] },
      { text: 'Upsell estático por producto',              plans: ['premium'] },
      { text: 'Upsell con IA (GPT-4o-mini)',               plans: ['premium'], highlight: true },
      { text: 'Social Proof (pedidos recientes)',          plans: ['premium'] },
    ],
  },
  {
    label: 'D. Analítica y control',
    features: [
      { text: 'Analítica avanzada (horas pico, tendencias)', plans: ['premium'], highlight: true },
      { text: 'Rendimiento del equipo por mesero',         plans: ['premium'], highlight: true },
      { text: 'Corte Z diario + exportación + WhatsApp',   plans: ['premium'], highlight: true },
    ],
  },
];

const DELIVERY_FEATURES = [
  'Checkout con dirección de delivery',
  'Mapa de cobertura y zonas',
  'ETA estimado al cliente',
  'App del Rider (login + pedidos asignados)',
  'Panel de Dispatch (asignar riders)',
  'Tracking en tiempo real para el cliente',
  'Zonas y tarifas configurables',
  'Analítica específica de delivery',
  'Historial completo de entregas',
];

function buildWhatsAppUrl(planName: string, isAnnual: boolean): string {
  const periodo = isAnnual ? 'Anual' : 'Mensual';
  const message = encodeURIComponent(
    `Hola, vengo de la página web y quiero contratar el Plan ${planName} en pago ${periodo}`
  );
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;
}

const PLAN_ICONS = { basic: Zap, pro: Star, premium: Crown };
const PLAN_GRADIENTS: Record<string, string> = {
  basic:   'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
  pro:     'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
  premium: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)',
};
const PLAN_TEXT_DARK: Record<string, boolean> = { basic: true, pro: false, premium: true };

export default function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [showDeliveryDetails, setShowDeliveryDetails] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>('A. Núcleo comercial');
  const plans = ['basic', 'pro', 'premium'] as const;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFF8F0' }}>

      {/* ═══ HEADER ═══ */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)' }}>
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        <div className="relative z-10 px-6 pt-8 pb-14 max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-10">
            <Link href="/">
              <span className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors">
                <ArrowLeft size={18} />
                <span className="text-sm font-medium" style={{ fontFamily: "'Nunito', sans-serif" }}>Inicio</span>
              </span>
            </Link>
            <img src={LOGO_WHITE} alt="SuperMenu" className="w-auto" style={{ height: '28px' }} />
          </div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-3" style={{ fontFamily: "'Lora', serif" }}>
              Planes y Precios
            </h1>
            <p className="text-gray-300 max-w-lg mx-auto mb-8" style={{ fontFamily: "'Nunito', sans-serif" }}>
              Tres planes con lógica de producto real. Cada uno incluye lo del anterior.
              El add-on <strong className="text-sky-400">Delivery OS</strong> es separable y compatible con cualquier plan.
            </p>
            <div className="flex items-center justify-center gap-4">
              <span className={`text-sm font-semibold transition-colors ${!isAnnual ? 'text-white' : 'text-gray-400'}`} style={{ fontFamily: "'Nunito', sans-serif" }}>Mensual</span>
              <button onClick={() => setIsAnnual(!isAnnual)} className="relative w-14 h-7 rounded-full transition-colors duration-300 focus:outline-none" style={{ backgroundColor: isAnnual ? '#D97706' : 'rgba(255,255,255,0.2)' }} aria-label="Toggle facturación anual">
                <motion.div className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md" animate={{ left: isAnnual ? '30px' : '2px' }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
              </button>
              <span className={`text-sm font-semibold transition-colors ${isAnnual ? 'text-white' : 'text-gray-400'}`} style={{ fontFamily: "'Nunito', sans-serif" }}>Anual</span>
              <AnimatePresence>
                {isAnnual && (
                  <motion.span initial={{ opacity: 0, scale: 0.8, x: -10 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.8, x: -10 }}
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{ backgroundColor: 'rgba(16,185,129,0.2)', color: '#34D399', border: '1px solid rgba(16,185,129,0.3)', fontFamily: "'Nunito', sans-serif" }}>
                    Ahorrás 20%
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ═══ PLAN CARDS ═══ */}
      <div className="px-4 -mt-8 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((tier, idx) => {
            const meta = PLAN_META[tier];
            const Icon = PLAN_ICONS[tier];
            const isDark = !PLAN_TEXT_DARK[tier];
            const price = isAnnual ? Math.round(meta.annualPrice / 12) : meta.monthlyPrice;
            return (
              <motion.div key={tier} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="rounded-2xl overflow-hidden shadow-xl relative"
                style={{ background: PLAN_GRADIENTS[tier], border: meta.highlighted ? '2px solid #D97706' : '1px solid rgba(0,0,0,0.08)', boxShadow: meta.highlighted ? '0 8px 32px rgba(217,119,6,0.3)' : '0 4px 20px rgba(0,0,0,0.1)' }}>
                {meta.badge && (
                  <div className="absolute top-0 left-0 right-0 text-center py-1.5 text-[11px] font-black tracking-widest" style={{ backgroundColor: '#D97706', color: 'white' }}>
                    {meta.badge}
                  </div>
                )}
                <div className={`p-6 ${meta.badge ? 'pt-10' : ''}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: meta.color, boxShadow: `0 4px 12px ${meta.color}40` }}>
                      <Icon size={18} className="text-white" />
                    </div>
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white/60' : 'text-black/40'}`}>Plan</p>
                      <h2 className={`text-lg font-black ${isDark ? 'text-white' : 'text-gray-900'}`} style={{ fontFamily: "'Lora', serif" }}>{meta.displayName}</h2>
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="flex items-end gap-1">
                      <span className={`text-3xl font-black ${isDark ? 'text-white' : 'text-gray-900'}`} style={{ fontFamily: "'Nunito', sans-serif" }}>{formatPlanPrice(price)}</span>
                      <span className={`text-sm mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>/mes</span>
                    </div>
                    {isAnnual && <p className="text-xs font-semibold mt-1" style={{ color: '#34D399' }}>Ahorrás {formatPlanPrice(meta.annualSavings)} al año</p>}
                  </div>
                  <p className={`text-sm mb-5 leading-relaxed ${isDark ? 'text-white/70' : 'text-gray-600'}`} style={{ fontFamily: "'Nunito', sans-serif" }}>{meta.description}</p>
                  <a href={buildWhatsAppUrl(meta.displayName, isAnnual)} target="_blank" rel="noopener noreferrer"
                    className="block w-full text-center py-3 rounded-xl text-sm font-black transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{ backgroundColor: meta.highlighted ? '#D97706' : meta.color, color: 'white', boxShadow: `0 4px 14px ${meta.color}50`, fontFamily: "'Nunito', sans-serif" }}>
                    Contratar {meta.displayName}
                  </a>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ═══ TABLA DE FEATURES ═══ */}
      <div className="px-4 mt-12 max-w-5xl mx-auto">
        <h2 className="text-xl font-black text-gray-900 mb-2 text-center" style={{ fontFamily: "'Lora', serif" }}>¿Qué incluye cada plan?</h2>
        <p className="text-sm text-gray-500 text-center mb-8" style={{ fontFamily: "'Nunito', sans-serif" }}>Features agrupadas por valor. Cada plan incluye todo lo del anterior.</p>

        {/* Header columnas */}
        <div className="grid grid-cols-4 gap-2 mb-3 px-4">
          <div className="col-span-1" />
          {plans.map(tier => (
            <div key={tier} className="text-center">
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: PLAN_META[tier].color, fontFamily: "'Nunito', sans-serif" }}>{PLAN_META[tier].shortName}</span>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {FEATURE_GROUPS.map(group => (
            <div key={group.label} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
              <button className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedGroup(expandedGroup === group.label ? null : group.label)}>
                <span className="text-sm font-black text-gray-800" style={{ fontFamily: "'Nunito', sans-serif" }}>{group.label}</span>
                {expandedGroup === group.label ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </button>
              <AnimatePresence>
                {expandedGroup === group.label && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="border-t border-gray-100">
                      {group.features.map((feature, i) => (
                        <div key={i} className={`grid grid-cols-4 gap-2 px-5 py-3 items-center ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                          <div className="col-span-1">
                            <span className={`text-xs ${feature.highlight ? 'font-bold text-gray-800' : 'text-gray-600'}`} style={{ fontFamily: "'Nunito', sans-serif" }}>
                              {feature.text}
                              {feature.highlight && (
                                <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>PLUS</span>
                              )}
                            </span>
                          </div>
                          {plans.map(tier => (
                            <div key={tier} className="flex justify-center">
                              {feature.plans.includes(tier)
                                ? <Check size={16} style={{ color: PLAN_META[tier].color }} strokeWidth={2.5} />
                                : <span className="w-4 h-0.5 rounded-full bg-gray-200 inline-block" />
                              }
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ ADD-ON DELIVERY OS ═══ */}
      <div className="px-4 mt-10 max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
          className="rounded-2xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0c1a2e 0%, #0f3460 100%)', border: '1px solid rgba(14,165,233,0.3)', boxShadow: '0 8px 32px rgba(14,165,233,0.15)' }}>
          <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#0EA5E9', boxShadow: '0 4px 12px rgba(14,165,233,0.4)' }}>
                    <Truck size={18} className="text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-black text-white" style={{ fontFamily: "'Lora', serif" }}>Delivery OS</h3>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(14,165,233,0.2)', color: '#38BDF8', border: '1px solid rgba(14,165,233,0.3)' }}>ADD-ON</span>
                    </div>
                    <p className="text-xs text-sky-400/70 mt-0.5">Compatible con cualquier plan</p>
                  </div>
                </div>
                <p className="text-sm text-white/70 mb-4 leading-relaxed" style={{ fontFamily: "'Nunito', sans-serif" }}>{DELIVERY_OS_META.description}</p>
                <button onClick={() => setShowDeliveryDetails(!showDeliveryDetails)} className="flex items-center gap-1.5 text-xs font-bold text-sky-400 hover:text-sky-300 transition-colors" style={{ fontFamily: "'Nunito', sans-serif" }}>
                  {showDeliveryDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {showDeliveryDetails ? 'Ocultar' : 'Ver'} módulos incluidos
                </button>
                <AnimatePresence>
                  {showDeliveryDetails && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden mt-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {DELIVERY_FEATURES.map((f, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Check size={13} className="text-sky-400 flex-shrink-0" strokeWidth={2.5} />
                            <span className="text-xs text-white/70" style={{ fontFamily: "'Nunito', sans-serif" }}>{f}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="md:text-right flex-shrink-0">
                <div className="mb-1">
                  <span className="text-2xl font-black text-white" style={{ fontFamily: "'Nunito', sans-serif" }}>
                    {formatPlanPrice(isAnnual ? Math.round(DELIVERY_OS_META.annualPrice / 12) : DELIVERY_OS_META.monthlyPrice)}
                  </span>
                  <span className="text-sm text-white/50">/mes</span>
                </div>
                {isAnnual && <p className="text-xs font-semibold mb-3" style={{ color: '#34D399' }}>Ahorrás {formatPlanPrice(DELIVERY_OS_META.annualSavings)} al año</p>}
                <a href={buildWhatsAppUrl('Delivery OS', isAnnual)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{ backgroundColor: '#0EA5E9', color: 'white', boxShadow: '0 4px 14px rgba(14,165,233,0.4)', fontFamily: "'Nunito', sans-serif" }}>
                  <Plus size={16} />
                  Agregar Delivery OS
                </a>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ═══ FOOTER NOTE ═══ */}
      <div className="px-4 mt-10 mb-12 max-w-2xl mx-auto text-center">
        <p className="text-sm text-gray-500 mb-2" style={{ fontFamily: "'Nunito', sans-serif" }}>
          Sin contratos. Cancelá cuando quieras. Soporte por WhatsApp incluido en todos los planes.
        </p>
        <p className="text-xs text-gray-400" style={{ fontFamily: "'Nunito', sans-serif" }}>
          ¿Tenés dudas?{' '}
          <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="font-bold underline" style={{ color: '#D97706' }}>
            Escribinos al WhatsApp
          </a>
          {' '}y te asesoramos sin compromiso.
        </p>
      </div>

      <PoweredByFooter />
    </div>
  );
}
