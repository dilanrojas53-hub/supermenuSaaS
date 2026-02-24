/*
 * Landing Page Comercial — Smart Menu by Digital Atlas
 * Hero persuasivo, beneficios clave, restaurantes demo, CTA a /pricing.
 * Footer con branding "Powered by Digital Atlas".
 */
import { motion } from 'framer-motion';
import {
  MapPin, ChevronRight, Loader2, Utensils,
  Zap, BarChart3, Globe2, Smartphone, QrCode,
  TrendingUp, ShieldCheck, MessageCircle
} from 'lucide-react';
import { Link } from 'wouter';
import { useAllTenants } from '@/hooks/useTenantData';
import { TENANT_HERO_IMAGES } from '@/lib/types';
import PoweredByFooter from '@/components/PoweredByFooter';

const DIGITAL_ATLAS_LOGO = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663241686300/JpWMbxFFjqBmTDvA.webp";

const BENEFITS = [
  {
    icon: Smartphone,
    title: "Menú Digital Premium",
    desc: "Tu menú en el celular del cliente con fotos, precios y pedido directo. Sin apps, solo un QR.",
  },
  {
    icon: Zap,
    title: "Motor de Neuro-Ventas",
    desc: "Badges de escasez, prueba social y upsell automático que aumentan el ticket promedio hasta un 35%.",
  },
  {
    icon: BarChart3,
    title: "Panel KDS en Vivo",
    desc: "Recibe pedidos en tiempo real con alertas sonoras. Aprueba pagos y gestiona tu cocina desde el celular.",
  },
  {
    icon: Globe2,
    title: "Menú Bilingüe ES/EN",
    desc: "Atrae turistas con traducción automática. Un toggle y tu menú se muestra en inglés al instante.",
  },
  {
    icon: TrendingUp,
    title: "Analítica de Ventas",
    desc: "Dashboard con ventas del día, platillo estrella, ticket promedio y visitas. Datos para decidir mejor.",
  },
  {
    icon: ShieldCheck,
    title: "Pago SINPE Móvil",
    desc: "Checkout integrado con SINPE Móvil. El cliente sube su comprobante y tú lo apruebas desde el KDS.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.1 },
  }),
};

export default function Home() {
  const { tenants, loading } = useAllTenants();

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFF8F0' }}>

      {/* ═══════════════ HERO SECTION ═══════════════ */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)',
          }}
        />
        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative z-10 px-6 pt-10 pb-16 max-w-2xl mx-auto">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3 mb-12"
          >
            <img
              src={DIGITAL_ATLAS_LOGO}
              alt="Digital Atlas"
              className="h-8 w-auto"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          </motion.div>

          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
              <Utensils size={14} className="text-amber-400" />
              <span className="text-amber-300 text-xs font-semibold tracking-wide uppercase">
                Plataforma SaaS para Restaurantes
              </span>
            </div>

            <h1
              className="text-4xl md:text-5xl font-bold text-white leading-[1.1] mb-5"
              style={{ fontFamily: "'Lora', serif" }}
            >
              Convierte tu menú en una{' '}
              <span className="text-amber-400">máquina de ventas</span>
            </h1>

            <p
              className="text-lg text-gray-300 leading-relaxed mb-8 max-w-lg"
              style={{ fontFamily: "'Nunito', sans-serif" }}
            >
              Menú digital con neuro-ventas, pedidos en vivo, pagos SINPE Móvil y analítica.
              Todo lo que tu restaurante necesita para vender más, desde ₡9.900/mes.
            </p>
          </motion.div>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <Link href="/pricing">
              <button
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-base transition-all active:scale-[0.97] shadow-lg shadow-amber-500/25"
                style={{
                  backgroundColor: '#D97706',
                  color: '#fff',
                  fontFamily: "'Nunito', sans-serif",
                }}
              >
                Ver Planes y Precios
              </button>
            </Link>
            <a
              href="https://wa.me/50600000000?text=Hola%2C%20vengo%20de%20la%20p%C3%A1gina%20web%20y%20quiero%20una%20demo%20de%20Smart%20Menu"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto"
            >
              <button
                className="w-full px-8 py-3.5 rounded-xl font-bold text-base transition-all active:scale-[0.97] border-2 border-white/20 text-white hover:bg-white/5"
                style={{ fontFamily: "'Nunito', sans-serif" }}
              >
                <span className="flex items-center justify-center gap-2">
                  <MessageCircle size={18} />
                  Solicitar Demo
                </span>
              </button>
            </a>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="flex gap-8 mt-12 pt-8 border-t border-white/10"
          >
            {[
              { value: '+35%', label: 'Ticket promedio' },
              { value: '< 2min', label: 'Setup inicial' },
              { value: '₡9.900', label: 'Desde / mes' },
            ].map((stat, i) => (
              <div key={i}>
                <p className="text-2xl font-bold text-amber-400" style={{ fontFamily: "'Lora', serif" }}>
                  {stat.value}
                </p>
                <p className="text-xs text-gray-400 mt-0.5" style={{ fontFamily: "'Nunito', sans-serif" }}>
                  {stat.label}
                </p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ BENEFITS SECTION ═══════════════ */}
      <section className="px-6 py-16 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2
            className="text-3xl font-bold text-amber-900 mb-3"
            style={{ fontFamily: "'Lora', serif" }}
          >
            Todo lo que necesitas para vender más
          </h2>
          <p className="text-amber-700/60 max-w-md mx-auto" style={{ fontFamily: "'Nunito', sans-serif" }}>
            Una plataforma completa diseñada para el mercado de Costa Rica
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {BENEFITS.map((benefit, i) => {
            const Icon = benefit.icon;
            return (
              <motion.div
                key={i}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="p-6 rounded-2xl bg-white border border-amber-100/80 hover:shadow-lg hover:shadow-amber-100/50 transition-all duration-300"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: '#FEF3C7' }}
                >
                  <Icon size={22} className="text-amber-700" />
                </div>
                <h3
                  className="text-base font-bold text-amber-900 mb-2"
                  style={{ fontFamily: "'Lora', serif" }}
                >
                  {benefit.title}
                </h3>
                <p className="text-sm text-amber-700/60 leading-relaxed" style={{ fontFamily: "'Nunito', sans-serif" }}>
                  {benefit.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS ═══════════════ */}
      <section className="px-6 py-16 bg-amber-50/50">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2
              className="text-3xl font-bold text-amber-900 mb-3"
              style={{ fontFamily: "'Lora', serif" }}
            >
              Activa tu menú en 3 pasos
            </h2>
          </motion.div>

          <div className="space-y-6">
            {[
              {
                step: '01',
                title: 'Creamos tu menú digital',
                desc: 'Subimos tus platillos, fotos y precios. Configuramos tu tema visual y colores de marca.',
                icon: QrCode,
              },
              {
                step: '02',
                title: 'Imprimís tu código QR',
                desc: 'Descargá el QR desde tu panel admin y colocalo en cada mesa. Los clientes escanean y ordenan.',
                icon: Smartphone,
              },
              {
                step: '03',
                title: 'Recibís pedidos al instante',
                desc: 'Los pedidos llegan a tu panel KDS con alerta sonora. Aprobá el pago SINPE y enviá a cocina.',
                icon: Zap,
              },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={i}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  className="flex gap-5 items-start"
                >
                  <div className="flex-shrink-0">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md"
                      style={{ backgroundColor: '#D97706' }}
                    >
                      <Icon size={24} className="text-white" />
                    </div>
                  </div>
                  <div className="pt-1">
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className="text-xs font-bold text-amber-400 tracking-widest">{item.step}</span>
                      <h3
                        className="text-lg font-bold text-amber-900"
                        style={{ fontFamily: "'Lora', serif" }}
                      >
                        {item.title}
                      </h3>
                    </div>
                    <p className="text-sm text-amber-700/60 leading-relaxed" style={{ fontFamily: "'Nunito', sans-serif" }}>
                      {item.desc}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════ DEMO RESTAURANTS ═══════════════ */}
      <section className="px-6 py-16 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <h2
            className="text-3xl font-bold text-amber-900 mb-3"
            style={{ fontFamily: "'Lora', serif" }}
          >
            Restaurantes que confían en nosotros
          </h2>
          <p className="text-amber-700/60 text-sm" style={{ fontFamily: "'Nunito', sans-serif" }}>
            Explorá los menús de nuestros clientes y probá la experiencia
          </p>
        </motion.div>

        {loading ? (
          <div className="flex justify-center py-12">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            >
              <Loader2 size={32} className="text-amber-700" />
            </motion.div>
          </div>
        ) : (
          <div className="space-y-4">
            {tenants.map((tenant, index) => {
              const heroImage = TENANT_HERO_IMAGES[tenant.slug] || '';

              return (
                <motion.div
                  key={tenant.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                >
                  <Link href={`/${tenant.slug}`}>
                    <div
                      className="rounded-2xl overflow-hidden transition-all active:scale-[0.98]"
                      style={{
                        backgroundColor: '#fff',
                        boxShadow: '0 4px 24px rgba(139, 109, 71, 0.12)',
                      }}
                    >
                      {/* Image */}
                      <div className="h-40 relative overflow-hidden">
                        {heroImage ? (
                          <img
                            src={heroImage}
                            alt={tenant.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-amber-100 flex items-center justify-center">
                            <Utensils size={40} className="text-amber-300" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                      </div>

                      {/* Content */}
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h3
                            className="text-lg font-bold text-amber-900 leading-tight"
                            style={{ fontFamily: "'Lora', serif" }}
                          >
                            {tenant.name}
                          </h3>
                          {tenant.description && (
                            <p className="text-sm text-amber-700/60 mt-0.5 line-clamp-1" style={{ fontFamily: "'Nunito', sans-serif" }}>
                              {tenant.description}
                            </p>
                          )}
                          {tenant.address && (
                            <div className="flex items-center gap-1 mt-1.5 text-amber-600/50 text-xs">
                              <MapPin size={11} />
                              <span className="truncate">{tenant.address}</span>
                            </div>
                          )}
                        </div>
                        <ChevronRight size={20} className="text-amber-400 flex-shrink-0 ml-2" />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══════════════ FINAL CTA ═══════════════ */}
      <section className="px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-lg mx-auto text-center p-8 rounded-3xl"
          style={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
          }}
        >
          <h2
            className="text-2xl font-bold text-white mb-3"
            style={{ fontFamily: "'Lora', serif" }}
          >
            ¿Listo para vender más?
          </h2>
          <p className="text-gray-300 text-sm mb-6" style={{ fontFamily: "'Nunito', sans-serif" }}>
            Activá tu menú digital hoy y empezá a recibir pedidos desde el celular de tus clientes.
          </p>
          <Link href="/pricing">
            <button
              className="px-8 py-3.5 rounded-xl font-bold text-base transition-all active:scale-[0.97] shadow-lg shadow-amber-500/25"
              style={{
                backgroundColor: '#D97706',
                color: '#fff',
                fontFamily: "'Nunito', sans-serif",
              }}
            >
              Ver Planes desde ₡9.900/mes
            </button>
          </Link>
        </motion.div>
      </section>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <PoweredByFooter />
    </div>
  );
}
