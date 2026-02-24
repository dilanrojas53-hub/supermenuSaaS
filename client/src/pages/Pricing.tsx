/*
 * Página de Precios — Smart Menu by Digital Atlas
 * 3 planes: Básico, Pro (destacado), Premium en Colones (₡).
 * CTAs abren WhatsApp con mensaje predefinido.
 */
import { motion } from 'framer-motion';
import { Check, ArrowLeft, Crown, Star, Zap } from 'lucide-react';
import { Link } from 'wouter';
import PoweredByFooter from '@/components/PoweredByFooter';

const LOGO_WHITE = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663241686300/OmbbPNnVFlwOoZKI.png";
const WHATSAPP_NUMBER = '50662014922';

interface Plan {
  name: string;
  tier: string;
  price: string;
  period: string;
  description: string;
  icon: typeof Zap;
  features: string[];
  highlighted: boolean;
  color: string;
  bgGradient: string;
}

const PLANS: Plan[] = [
  {
    name: 'Básico',
    tier: 'basic',
    price: '₡9.900',
    period: '/mes',
    description: 'Ideal para empezar a digitalizar tu menú y recibir pedidos por WhatsApp.',
    icon: Zap,
    features: [
      'Menú digital con fotos y precios',
      'Código QR descargable',
      'Pagos por WhatsApp',
      'Tema visual personalizable',
      'Logo y branding propio',
      'Soporte por WhatsApp',
    ],
    highlighted: false,
    color: '#92400E',
    bgGradient: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
  },
  {
    name: 'Pro',
    tier: 'pro',
    price: '₡19.900',
    period: '/mes',
    description: 'Para restaurantes que quieren vender más con inteligencia y control total.',
    icon: Star,
    features: [
      'Todo lo del plan Básico',
      'Panel KDS en vivo con alertas',
      'Motor de Neuro-Ventas (badges)',
      'Upsell automático inteligente',
      'Menú bilingüe ES/EN',
      'Checkout con SINPE Móvil',
      'Platillo de la Semana destacado',
      'Soporte prioritario',
    ],
    highlighted: true,
    color: '#D97706',
    bgGradient: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
  },
  {
    name: 'Premium',
    tier: 'premium',
    price: '₡29.900',
    period: '/mes',
    description: 'Control total con datos y analítica para tomar decisiones basadas en números.',
    icon: Crown,
    features: [
      'Todo lo del plan Pro',
      'Dashboard de Analítica completo',
      'Ventas del día y tendencias',
      'Platillo estrella y ticket promedio',
      'Notificaciones de prueba social',
      'Contador de visitas al menú',
      'Reportes exportables',
      'Soporte VIP dedicado',
    ],
    highlighted: false,
    color: '#7C3AED',
    bgGradient: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)',
  },
];

function buildWhatsAppUrl(planName: string): string {
  const message = encodeURIComponent(
    `Hola, vengo de la página web y quiero contratar el Plan ${planName}`
  );
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;
}

export default function Pricing() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFF8F0' }}>

      {/* ═══════════════ HEADER ═══════════════ */}
      <div
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)',
        }}
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
                <span className="text-sm font-medium" style={{ fontFamily: "'Nunito', sans-serif" }}>
                  Inicio
                </span>
              </span>
            </Link>
            <img
              src={LOGO_WHITE}
              alt="Digital Atlas"
              className="w-auto"
              style={{ height: '28px' }}
            />
          </div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <h1
              className="text-3xl md:text-4xl font-bold text-white mb-3"
              style={{ fontFamily: "'Lora', serif" }}
            >
              Planes y Precios
            </h1>
            <p className="text-gray-300 max-w-md mx-auto" style={{ fontFamily: "'Nunito', sans-serif" }}>
              Elegí el plan que mejor se adapte a tu restaurante. Sin contratos, cancelá cuando quieras.
            </p>
          </motion.div>
        </div>
      </div>

      {/* ═══════════════ PLANS ═══════════════ */}
      <div className="px-4 -mt-6 pb-16 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map((plan, i) => {
            const Icon = plan.icon;
            const isHighlighted = plan.highlighted;

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
                {isHighlighted && (
                  <div className="absolute top-0 right-0 bg-amber-500 text-white text-xs font-bold px-4 py-1.5 rounded-bl-xl">
                    MÁS POPULAR
                  </div>
                )}

                <div className="p-6">
                  {/* Icon + Name */}
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{
                        backgroundColor: isHighlighted ? 'rgba(217, 119, 6, 0.2)' : `${plan.color}15`,
                      }}
                    >
                      <Icon
                        size={20}
                        style={{ color: isHighlighted ? '#D97706' : plan.color }}
                      />
                    </div>
                    <h3
                      className={`text-xl font-bold ${isHighlighted ? 'text-white' : ''}`}
                      style={{
                        fontFamily: "'Lora', serif",
                        color: isHighlighted ? '#fff' : plan.color,
                      }}
                    >
                      {plan.name}
                    </h3>
                  </div>

                  {/* Price */}
                  <div className="mb-4">
                    <span
                      className={`text-4xl font-bold ${isHighlighted ? 'text-white' : ''}`}
                      style={{
                        fontFamily: "'Lora', serif",
                        color: isHighlighted ? '#fff' : '#1a1a2e',
                      }}
                    >
                      {plan.price}
                    </span>
                    <span
                      className={`text-sm ml-1 ${isHighlighted ? 'text-gray-300' : 'text-gray-500'}`}
                      style={{ fontFamily: "'Nunito', sans-serif" }}
                    >
                      {plan.period}
                    </span>
                  </div>

                  {/* Description */}
                  <p
                    className={`text-sm mb-6 leading-relaxed ${
                      isHighlighted ? 'text-gray-300' : 'text-gray-500'
                    }`}
                    style={{ fontFamily: "'Nunito', sans-serif" }}
                  >
                    {plan.description}
                  </p>

                  {/* Features */}
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, j) => (
                      <li key={j} className="flex items-start gap-2.5">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{
                            backgroundColor: isHighlighted ? 'rgba(217, 119, 6, 0.3)' : `${plan.color}15`,
                          }}
                        >
                          <Check
                            size={12}
                            style={{ color: isHighlighted ? '#FCD34D' : plan.color }}
                            strokeWidth={3}
                          />
                        </div>
                        <span
                          className={`text-sm ${isHighlighted ? 'text-gray-200' : 'text-gray-600'}`}
                          style={{ fontFamily: "'Nunito', sans-serif" }}
                        >
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <a
                    href={buildWhatsAppUrl(plan.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <button
                      className={`w-full py-3.5 rounded-xl font-bold text-base transition-all active:scale-[0.97] ${
                        isHighlighted
                          ? 'shadow-lg shadow-amber-500/30'
                          : 'border-2'
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

        {/* FAQ / Trust */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-16 text-center"
        >
          <p className="text-sm text-amber-700/50 mb-2" style={{ fontFamily: "'Nunito', sans-serif" }}>
            Sin contratos de permanencia. Cancelá cuando quieras.
          </p>
          <p className="text-sm text-amber-700/50" style={{ fontFamily: "'Nunito', sans-serif" }}>
            ¿Tenés preguntas?{' '}
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hola, tengo una pregunta sobre los planes de Smart Menu')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-600 font-semibold underline"
            >
              Escribinos por WhatsApp
            </a>
          </p>
        </motion.div>
      </div>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <PoweredByFooter />
    </div>
  );
}
