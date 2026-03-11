/*
 * Página de Precios — Digital Atlas Menu V19.4
 * Básico ₡19.900 | Pro ₡29.900 | Premium ₡44.900
 * Toggle Mensual / Anual con 20% de descuento.
 * Features distribuidas lógicamente por plan.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowLeft, Crown, Star, Zap, Lock } from 'lucide-react';
import { Link } from 'wouter';
import PoweredByFooter from '@/components/PoweredByFooter';

const LOGO_WHITE = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663241686300/OmbbPNnVFlwOoZKI.png";
const WHATSAPP_NUMBER = '50662014922';

interface PlanFeature {
  text: string;
  highlight?: boolean;
}

interface PlanData {
  name: string;
  tier: string;
  monthlyPrice: string;
  annualPrice: string;
  annualSavings: string;
  description: string;
  icon: typeof Zap;
  features: PlanFeature[];
  highlighted: boolean;
  color: string;
  bgGradient: string;
  badge?: string;
}

const PLANS: PlanData[] = [
  {
    name: 'Básico',
    tier: 'basic',
    monthlyPrice: '₡19.900',
    annualPrice: '₡191.040',
    annualSavings: 'Ahorra ₡47.760',
    description: 'Ideal para empezar a digitalizar tu menú y recibir pedidos directamente desde la mesa.',
    icon: Zap,
    features: [
      { text: 'Menú digital con fotos y precios' },
      { text: 'Código QR descargable' },
      { text: 'Pedidos en tiempo real (KDS básico)' },
      { text: 'Checkout SINPE Móvil / Efectivo' },
      { text: '27 temas visuales personalizables' },
      { text: 'Logo y branding propio' },
      { text: 'Panel admin con historial de pedidos' },
      { text: 'Soporte por WhatsApp' },
    ],
    highlighted: false,
    color: '#92400E',
    bgGradient: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
  },
  {
    name: 'Pro',
    tier: 'pro',
    monthlyPrice: '₡29.900',
    annualPrice: '₡287.040',
    annualSavings: 'Ahorra ₡71.760',
    description: 'Para restaurantes que quieren vender más con IA, equipo de meseros y control total de cobros.',
    icon: Star,
    badge: 'MÁS POPULAR',
    features: [
      { text: 'Todo lo del plan Básico' },
      { text: 'Motor de Neuro-Ventas (badges escasez)', highlight: true },
      { text: 'Upsell IA con GPT-4 por pedido', highlight: true },
      { text: 'Gestión de meseros con login propio', highlight: true },
      { text: 'Panel Kanban exclusivo para meseros', highlight: true },
      { text: 'Quick Add de pedidos desde el staff' },
      { text: 'Tabs Por Cobrar / Cobrados (staff + admin)' },
      { text: 'Notificaciones sonoras PWA (iOS/Android)', highlight: true },
      { text: 'Menú bilingüe ES/EN' },
      { text: 'Enlace de acceso directo por mesero' },
      { text: 'Soporte prioritario' },
    ],
    highlighted: true,
    color: '#D97706',
    bgGradient: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
  },
  {
    name: 'Premium',
    tier: 'premium',
    monthlyPrice: '₡44.900',
    annualPrice: '₡431.040',
    annualSavings: 'Ahorra ₡107.760',
    description: 'Control total con analítica avanzada, rendimiento del equipo y herramientas de decisión.',
    icon: Crown,
    features: [
      { text: 'Todo lo del plan Pro' },
      { text: 'Dashboard de Analítica completo', highlight: true },
      { text: 'Rendimiento del Equipo por mesero', highlight: true },
      { text: 'Pedidos completados, cobrados y tiempo promedio', highlight: true },
      { text: 'Tendencias de ventas (7 días)' },
      { text: 'Horas pico y picos de venta' },
      { text: 'Top 5 platillos más vendidos' },
      { text: 'Corte Z diario descargable' },
      { text: 'Envío de Corte Z por WhatsApp', highlight: true },
      { text: 'PIN de seguridad anti-fraude para cancelaciones' },
      { text: 'Soporte VIP dedicado' },
    ],
    highlighted: false,
    color: '#7C3AED',
    bgGradient: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)',
  },
];

function buildWhatsAppUrl(planName: string, isAnnual: boolean): string {
  const periodo = isAnnual ? 'Anual' : 'Mensual';
  const message = encodeURIComponent(
    `Hola, vengo de la página web y quiero contratar el Plan ${planName} en pago ${periodo}`
  );
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;
}

export default function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFF8F0' }}>

      {/* ═══════════════ HEADER ═══════════════ */}
      <div
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)' }}
      >
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative z-10 px-6 pt-8 pb-14 max-w-2xl mx-auto">
          {/* Nav */}
          <div className="flex items-center justify-between mb-10">
            <Link href="/">
              <span className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors">
                <ArrowLeft size={18} />
                <span className="text-sm font-medium" style={{ fontFamily: "'Nunito', sans-serif" }}>Inicio</span>
              </span>
            </Link>
            <img src={LOGO_WHITE} alt="Digital Atlas" className="w-auto" style={{ height: '28px' }} />
          </div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-3" style={{ fontFamily: "'Lora', serif" }}>
              Planes y Precios
            </h1>
            <p className="text-gray-300 max-w-md mx-auto mb-8" style={{ fontFamily: "'Nunito', sans-serif" }}>
              Elegí el plan que mejor se adapte a tu restaurante. Sin contratos, cancelá cuando quieras.
            </p>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-4">
              <span
                className={`text-sm font-semibold transition-colors ${!isAnnual ? 'text-white' : 'text-gray-400'}`}
                style={{ fontFamily: "'Nunito', sans-serif" }}
              >
                Mensual
              </span>
              <button
                onClick={() => setIsAnnual(!isAnnual)}
                className="relative w-14 h-7 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-2 focus:ring-offset-transparent"
                style={{ backgroundColor: isAnnual ? '#D97706' : 'rgba(255,255,255,0.2)' }}
                aria-label="Toggle facturación anual"
              >
                <motion.div
                  className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md"
                  animate={{ left: isAnnual ? '30px' : '2px' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </button>
              <span
                className={`text-sm font-semibold transition-colors ${isAnnual ? 'text-white' : 'text-gray-400'}`}
                style={{ fontFamily: "'Nunito', sans-serif" }}
              >
                Anual
              </span>
              <AnimatePresence>
                {isAnnual && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8, x: -10 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8, x: -10 }}
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.2)',
                      color: '#34D399',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      fontFamily: "'Nunito', sans-serif",
                    }}
                  >
                    20% OFF
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ═══════════════ PLANS ═══════════════ */}
      <div className="px-4 -mt-6 pb-16 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map((plan, i) => {
            const Icon = plan.icon;
            const isHighlighted = plan.highlighted;
            const displayPrice = isAnnual ? plan.annualPrice : plan.monthlyPrice;
            const displayPeriod = isAnnual ? '/año' : '/mes';

            return (
              <motion.div
                key={plan.tier}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={`relative rounded-2xl overflow-hidden ${
                  isHighlighted ? 'md:-mt-4 md:mb-0 ring-2 ring-amber-500/50' : ''
                }`}
                style={{
                  background: plan.bgGradient,
                  boxShadow: isHighlighted
                    ? '0 20px 60px rgba(217, 119, 6, 0.2)'
                    : '0 4px 24px rgba(139, 109, 71, 0.08)',
                }}
              >
                {/* Popular badge */}
                {plan.badge && (
                  <div className="absolute top-0 right-0 bg-amber-500 text-white text-xs font-bold px-4 py-1.5 rounded-bl-xl">
                    {plan.badge}
                  </div>
                )}

                <div className="p-6">
                  {/* Icon + Name */}
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: isHighlighted ? 'rgba(217, 119, 6, 0.2)' : `${plan.color}15` }}
                    >
                      <Icon size={20} style={{ color: isHighlighted ? '#D97706' : plan.color }} />
                    </div>
                    <h3
                      className="text-xl font-bold"
                      style={{ fontFamily: "'Lora', serif", color: isHighlighted ? '#fff' : plan.color }}
                    >
                      {plan.name}
                    </h3>
                  </div>

                  {/* Price */}
                  <div className="mb-2">
                    <span
                      className="text-4xl font-bold inline-block"
                      style={{ fontFamily: "'Lora', serif", color: isHighlighted ? '#fff' : '#1a1a2e' }}
                    >
                      {displayPrice}
                    </span>
                    <span
                      className={`text-sm ml-1 ${isHighlighted ? 'text-gray-300' : 'text-gray-500'}`}
                      style={{ fontFamily: "'Nunito', sans-serif" }}
                    >
                      {displayPeriod}
                    </span>
                  </div>

                  <AnimatePresence>
                    {isAnnual && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <span
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold"
                          style={{
                            backgroundColor: isHighlighted ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)',
                            color: isHighlighted ? '#34D399' : '#059669',
                            border: `1px solid ${isHighlighted ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.2)'}`,
                            fontFamily: "'Nunito', sans-serif",
                          }}
                        >
                          {plan.annualSavings}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Description */}
                  <p
                    className={`text-sm mb-6 leading-relaxed ${isHighlighted ? 'text-gray-300' : 'text-gray-500'}`}
                    style={{ fontFamily: "'Nunito', sans-serif", marginTop: isAnnual ? 0 : 16 }}
                  >
                    {plan.description}
                  </p>

                  {/* Features */}
                  <ul className="space-y-2.5 mb-8">
                    {plan.features.map((feature, j) => (
                      <li key={j} className="flex items-start gap-2.5">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{
                            backgroundColor: feature.highlight
                              ? (isHighlighted ? 'rgba(251,191,36,0.25)' : `${plan.color}25`)
                              : (isHighlighted ? 'rgba(217, 119, 6, 0.3)' : `${plan.color}15`),
                          }}
                        >
                          <Check
                            size={12}
                            style={{ color: feature.highlight ? (isHighlighted ? '#FCD34D' : plan.color) : (isHighlighted ? '#FCD34D' : plan.color) }}
                            strokeWidth={3}
                          />
                        </div>
                        <span
                          className={`text-sm ${
                            feature.highlight
                              ? (isHighlighted ? 'text-amber-200 font-semibold' : 'text-gray-800 font-semibold')
                              : (isHighlighted ? 'text-gray-200' : 'text-gray-600')
                          }`}
                          style={{ fontFamily: "'Nunito', sans-serif" }}
                        >
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <a
                    href={buildWhatsAppUrl(plan.name, isAnnual)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <button
                      className={`w-full py-3.5 rounded-xl font-bold text-base transition-all active:scale-[0.97] ${
                        isHighlighted ? 'shadow-lg shadow-amber-500/30' : 'border-2'
                      }`}
                      style={{
                        backgroundColor: isHighlighted ? '#D97706' : 'transparent',
                        color: isHighlighted ? '#fff' : plan.color,
                        borderColor: isHighlighted ? 'transparent' : `${plan.color}40`,
                        fontFamily: "'Nunito', sans-serif",
                      }}
                    >
                      Contratar {plan.name}
                    </button>
                  </a>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Comparison note */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-10 p-5 rounded-2xl border border-amber-200/60 bg-amber-50/80"
        >
          <div className="flex items-start gap-3">
            <Lock size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900 mb-1" style={{ fontFamily: "'Nunito', sans-serif" }}>
                ¿Qué incluye cada plan?
              </p>
              <p className="text-xs text-amber-700/70 leading-relaxed" style={{ fontFamily: "'Nunito', sans-serif" }}>
                <strong>Básico</strong> cubre el menú digital y pedidos básicos.{' '}
                <strong>Pro</strong> agrega IA, gestión de meseros y notificaciones PWA.{' '}
                <strong>Premium</strong> suma analítica avanzada, rendimiento del equipo y Corte Z.
                Todos los planes incluyen configuración inicial sin costo adicional.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Trust */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-10 text-center"
        >
          <p className="text-sm text-amber-700/50 mb-2" style={{ fontFamily: "'Nunito', sans-serif" }}>
            Sin contratos de permanencia. Cancelá cuando quieras.
          </p>
          <p className="text-xs text-amber-600/40" style={{ fontFamily: "'Nunito', sans-serif" }}>
            Precios en colones costarricenses (₡). IVA incluido.
          </p>
        </motion.div>
      </div>

      <PoweredByFooter />
    </div>
  );
}
