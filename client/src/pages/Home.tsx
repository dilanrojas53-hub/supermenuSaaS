/*
 * Landing Page Comercial — Digital Atlas Menu V21.0 (Premium Full Edition)
 * Fusiona la estética High-End con toda la funcionalidad de la V19.4
 */
import { motion } from 'framer-motion';
import {
  MapPin, ChevronRight, Loader2, Utensils,
  Zap, BarChart3, Globe2, Smartphone, QrCode,
  TrendingUp, ShieldCheck, MessageCircle,
  Users, Bell, ClipboardList, CreditCard, Palette, UserCheck, Sparkles
} from 'lucide-react';
import { Link } from 'wouter';
import { useAllTenants } from '@/hooks/useTenantData';
import PoweredByFooter from '@/components/PoweredByFooter';

const LOGO_WHITE = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663241686300/OmbbPNnVFlwOoZKI.png";

const BENEFITS = [
  { icon: Smartphone, title: "Menú Digital Premium", desc: "Tu menú en el celular del cliente con fotos, precios y pedido directo. Sin apps, solo un QR.", badge: null },
  { icon: Zap, title: "Motor de Neuro-Ventas IA", desc: "Badges de escasez, prueba social y sugerencias de upsell generadas por GPT-4 que aumentan el ticket hasta un 35%.", badge: "IA" },
  { icon: BarChart3, title: "Panel KDS en Vivo", desc: "Pedidos en tiempo real con alertas sonoras. Kanban de cocina: Nuevos → En Cocina → Listos → Entregados.", badge: null },
  { icon: Users, title: "Gestión de Meseros", desc: "Panel exclusivo para el equipo con login propio, vista Kanban restringida, Quick Add y registro de cobros.", badge: "Nuevo" },
  { icon: Bell, title: "Notificaciones Sonoras PWA", desc: "Alerta de campana cuando llega un nuevo pedido. Funciona instalado como app en iOS y Android.", badge: "PWA" },
  { icon: UserCheck, title: "Rendimiento del Equipo", desc: "Analítica diaria por mesero: pedidos completados, cobrados, tiempo promedio y revenue generado.", badge: "Nuevo" },
  { icon: Globe2, title: "Menú Bilingüe ES/EN", desc: "Atrae turistas con traducción automática. Un toggle y tu menú se muestra en inglés al instante.", badge: null },
  { icon: TrendingUp, title: "Analítica de Ventas", desc: "Dashboard con ventas del día, tendencias, platillo estrella, ticket promedio, horas pico y Corte Z.", badge: null },
  { icon: ShieldCheck, title: "Pagos SINPE / Efectivo / Tarjeta", desc: "Checkout integrado con SINPE Móvil. El cliente sube su comprobante y el admin lo aprueba desde el KDS.", badge: null },
  { icon: Palette, title: "27 Temas Visuales", desc: "Diseñador de temas con 27 presets para restaurantes: Caribeño, Vintage, Sports Bar, Lujoso y más.", badge: null },
  { icon: CreditCard, title: "Cobros por Mesa", desc: "Tabs de Por Cobrar y Cobrados para meseros y admin. Seguimiento de pagos pendientes en tiempo real.", badge: null },
  { icon: ClipboardList, title: "Historial Inteligente", desc: "Registro completo de pedidos con filtros por fecha, método de pago, mesero y estado de cobro.", badge: null },
];

const containerFade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
};

const itemFadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

export default function Home() {
  const { tenants, loading } = useAllTenants();

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-slate-200 selection:bg-amber-500/30 font-['Nunito']">
      
      {/* ═══════════════ HERO SECTION ═══════════════ */}
      <section className="relative pt-12 pb-24 overflow-hidden">
        {/* Background Lights */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-amber-600/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-[10%] right-[-5%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[100px]" />
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-6">
          <div className="flex flex-col items-center text-center">
            
            <motion.img 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              src={LOGO_WHITE} 
              alt="Digital Atlas" 
              className="h-10 mb-10"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-8 backdrop-blur-md"
            >
              <Sparkles size={14} className="text-amber-400" />
              <span className="text-amber-200 text-[11px] font-bold tracking-[0.15em] uppercase">
                Plataforma SaaS para Restaurantes
              </span>
            </motion.div>

            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight leading-[1.1]"
              style={{ fontFamily: "'Nunito', serif" }}
            >
              Convierte tu menú en una <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
                máquina de ventas
              </span>
            </motion.h1>

            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="max-w-xl text-lg text-slate-400 leading-relaxed mb-10"
            >
              Menú digital con IA, pedidos en vivo, gestión de meseros y pagos SINPE Móvil. 
              Todo lo que necesitas para vender más, desde <span className="text-white font-semibold">₡19.900/mes</span>.
            </motion.p>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4 w-full justify-center"
            >
              <Link href="/pricing" className="px-10 py-4 bg-amber-600 hover:bg-amber-500 text-white font-extrabold rounded-2xl transition-all shadow-[0_0_20px_rgba(217,119,6,0.3)] active:scale-95 text-center">
                Ver Planes y Precios
              </Link>
              <a href="https://wa.me/50662014922?text=Hola..." target="_blank" rel="noopener noreferrer" className="px-10 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl border border-white/10 backdrop-blur-md transition-all flex items-center justify-center gap-2">
                <MessageCircle size={20} />
                Solicitar Demo
              </a>
            </motion.div>

            {/* Stats Bar */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex justify-around gap-4 mt-16 py-8 border-t border-white/10 w-full"
            >
              {[
                { v: '+35%', l: 'Ticket promedio' },
                { v: '12+', l: 'Features incluidas' },
                { v: '₡19.9k', l: 'Desde / mes' }
              ].map((s, i) => (
                <div key={i} className="text-center">
                  <div className="text-2xl font-bold text-amber-400 mb-1" style={{ fontFamily: "'Nunito', serif" }}>{s.v}</div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{s.l}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════ BENEFITS GRID ═══════════════ */}
      <section className="py-20 relative">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-16 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" style={{ fontFamily: "'Nunito', serif" }}>
              Todo lo que necesitas para vender más
            </h2>
            <p className="text-slate-500 max-w-md mx-auto">Una plataforma completa diseñada para el mercado de Costa Rica</p>
          </div>

          <motion.div 
            variants={containerFade}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {BENEFITS.map((b, i) => (
              <motion.div
                key={i}
                variants={itemFadeUp}
                className="group relative p-8 rounded-[2rem] bg-gradient-to-br from-white/[0.05] to-transparent border border-white/10 hover:border-amber-500/50 hover:bg-white/[0.07] transition-all duration-500"
              >
                {b.badge && (
                  <span className="absolute top-6 right-6 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-500 text-black">
                    {b.badge}
                  </span>
                )}
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <b.icon size={24} className="text-amber-500" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2" style={{ fontFamily: "'Nunito', serif" }}>
                  {b.title}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {b.desc}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS (STEPS) ═══════════════ */}
      <section className="py-24 bg-white/[0.02]">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-white mb-16" style={{ fontFamily: "'Nunito', serif" }}>
            Activa tu menú en 3 pasos
          </h2>
          <div className="space-y-10">
            {[
              { s: '01', t: 'Creamos tu menú digital', d: 'Subimos tus platillos, fotos y precios. Configuramos tu tema visual y personal de meseros.', i: QrCode },
              { s: '02', t: 'Imprimís tu código QR', d: 'Descargá el QR y colócalo en cada mesa. Los clientes escanean y ordenan desde su celular.', i: Smartphone },
              { s: '03', t: 'Recibís pedidos al instante', d: 'Los pedidos llegan al KDS con alerta sonora. Tus meseros gestionan, cobran y el admin ve todo.', i: Zap }
            ].map((step, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="flex gap-6 items-start"
              >
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-lg shadow-amber-900/20">
                  <step.i size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-[10px] font-black text-amber-500 tracking-[0.2em]">{step.s}</span>
                    <h3 className="text-xl font-bold text-white" style={{ fontFamily: "'Nunito', serif" }}>{step.t}</h3>
                  </div>
                  <p className="text-slate-400 text-sm leading-relaxed">{step.d}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ DEMO RESTAURANTS (DYNAMIC) ═══════════════ */}
      <section className="py-24 px-6 max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4" style={{ fontFamily: "'Nunito', serif" }}>
            Restaurantes que confían en nosotros
          </h2>
          <p className="text-slate-500 text-sm">Explorá la experiencia real de nuestros clientes</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
              <Loader2 size={32} className="text-amber-500" />
            </motion.div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tenants.map((tenant, index) => (
              <motion.div
                key={tenant.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Link href={`/${tenant.slug}`}>
                  <div className="group rounded-[2.5rem] overflow-hidden bg-white/[0.03] border border-white/5 hover:border-amber-500/30 transition-all active:scale-[0.98]">
                    <div className="h-44 relative overflow-hidden">
                      {tenant.hero_image_url ? (
                        <img src={tenant.hero_image_url} alt={tenant.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                      ) : (
                        <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                          <Utensils size={40} className="text-slate-700" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B] via-transparent to-transparent" />
                    </div>
                    <div className="p-6 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-white mb-1" style={{ fontFamily: "'Nunito', serif" }}>{tenant.name}</h3>
                        <p className="text-slate-400 text-xs line-clamp-1 mb-2">{tenant.description || 'Restaurante asociado'}</p>
                        {tenant.address && (
                          <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                            <MapPin size={10} className="text-amber-500" />
                            <span className="truncate">{tenant.address}</span>
                          </div>
                        )}
                      </div>
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-black transition-colors">
                        <ChevronRight size={20} />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* ═══════════════ FINAL CTA ═══════════════ */}
      <section className="py-32 px-6">
        <motion.div 
          whileInView={{ opacity: 1, scale: 1 }}
          initial={{ opacity: 0, scale: 0.95 }}
          className="max-w-4xl mx-auto rounded-[3rem] p-12 md:p-20 text-center relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)' }}
        >
          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-black text-black mb-6 tracking-tight">
              ¿Listo para dar el salto?
            </h2>
            <p className="text-black/70 text-lg mb-10 font-medium max-w-md mx-auto">
              Únete a los restaurantes que ya están transformando su servicio con Digital Atlas.
            </p>
            <Link href="/pricing" className="inline-block px-12 py-5 bg-black text-white font-bold rounded-2xl hover:scale-105 transition-transform shadow-2xl">
              Comenzar ahora — ₡19.900/mes
            </Link>
          </div>
          {/* Abstract circle decoration */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        </motion.div>
      </section>

      <PoweredByFooter />
    </div>
  );
}