/*
 * Design: "Warm Craft" — Landing page / directorio de restaurantes.
 * Muestra todos los tenants activos con links a sus menús.
 * Estilo artesanal cálido con textura de fondo.
 */
import { motion } from 'framer-motion';
import { MapPin, ChevronRight, Loader2, Utensils } from 'lucide-react';
import { Link } from 'wouter';
import { useAllTenants } from '@/hooks/useTenantData';
import { TENANT_HERO_IMAGES } from '@/lib/types';

export default function Home() {
  const { tenants, loading } = useAllTenants();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFF8F0' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        >
          <Loader2 size={32} className="text-amber-700" />
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: '#FFF8F0',
        backgroundImage: `url(https://private-us-east-1.manuscdn.com/sessionFile/LmxDH7UEpgKfSjGvBRWUVQ/sandbox/Hg7EvMZapJ560UeySRsbNJ-img-4_1771925494000_na1fn_d2FybS10ZXh0dXJlLWJn.jpg?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvTG14REg3VUVwZ0tmU2pHdkJSV1VWUS9zYW5kYm94L0hnN0V2TVphcEo1NjBVZXlTUnNiTkotaW1nLTRfMTc3MTkyNTQ5NDAwMF9uYTFmbl9kMkZ5YlMxMFpYaDBkWEpsTFdKbi5qcGc~eC1vc3MtcHJvY2Vzcz1pbWFnZS9yZXNpemUsd18xOTIwLGhfMTkyMC9mb3JtYXQsd2VicC9xdWFsaXR5LHFfODAiLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=JlT6wZ725duM3AnVkrLVTEbFA8NKn14apqpDS-3oJlIA49A6bags4aWt4~dAvoIpmEgj8gU2dcADAYmM5O7OQVr89KFVFfN3-qMOiLyuDaZw1JGGrcqHRFjZagwF28V-~dw-wVw~opofTaEwX3DnWIpSacCYMOxzTk8SxsdUzNnJbNPCPYV6jFSwLT7fZI4S2RDYzUOHy3xpw8bgfb2MF2veIB1da-L4LRXKWw-Wg6ODaLVRPwZw2VR5CisVOe0ihvtVu5GAEfBje8eLR8V0r7VWIpeUeayLXXV4-nbTkE5nMiFux0g~9hbZ6NqkZVzDlzxcLmW-1cGEem4J7IgRKg__)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Header */}
      <div className="pt-12 pb-8 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-center gap-2 mb-3">
            <Utensils size={28} className="text-amber-700" />
          </div>
          <h1
            className="text-3xl font-bold text-amber-900 mb-2"
            style={{ fontFamily: "'Lora', serif" }}
          >
            Smart Menu
          </h1>
          <p className="text-amber-700/70 text-sm max-w-xs mx-auto leading-relaxed" style={{ fontFamily: "'Nunito', sans-serif" }}>
            Descubre los mejores restaurantes y ordena desde tu celular
          </p>
        </motion.div>
      </div>

      {/* Restaurant Cards */}
      <div className="px-4 pb-12 space-y-4 max-w-lg mx-auto">
        {tenants.map((tenant, index) => {
          const heroImage = TENANT_HERO_IMAGES[tenant.slug] || '';

          return (
            <motion.div
              key={tenant.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
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
                      <h2
                        className="text-lg font-bold text-amber-900 leading-tight"
                        style={{ fontFamily: "'Lora', serif" }}
                      >
                        {tenant.name}
                      </h2>
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

      {/* Footer */}
      <div className="text-center py-6 opacity-40">
        <p className="text-xs text-amber-900" style={{ fontFamily: "'Nunito', sans-serif" }}>
          Powered by Smart Menu Platform
        </p>
      </div>
    </div>
  );
}
