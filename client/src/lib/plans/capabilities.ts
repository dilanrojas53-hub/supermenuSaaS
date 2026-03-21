/**
 * capabilities.ts — Fuente de verdad de todas las capacidades de SuperMenu
 *
 * Cada capability representa una funcionalidad concreta del producto.
 * Los planes se definen como conjuntos de capabilities en planMatrix.ts.
 *
 * GRUPOS:
 *   A. core         — Núcleo comercial (siempre incluido)
 *   B. operations   — Operación interna del restaurante
 *   C. growth       — Conversión y crecimiento
 *   D. analytics    — Analítica y control
 *   E. delivery     — Delivery OS (add-on separable)
 */

// ── Tipo principal ────────────────────────────────────────────────────────────

export type Capability =
  // A. Núcleo comercial
  | 'core_menu'           // Menú digital con fotos, precios, categorías
  | 'core_qr'             // Código QR descargable
  | 'core_branding'       // Logo y branding básico (colores, fuente)
  | 'direct_ordering'     // Pedidos directos desde el menú
  | 'checkout'            // Checkout completo (SINPE / Efectivo)
  | 'payments_basic'      // Pagos básicos: SINPE Móvil y efectivo
  | 'order_history'       // Historial básico de pedidos

  // B. Operación interna
  | 'orders_panel'        // Panel Kanban de pedidos en vivo
  | 'staff_panel'         // Panel de meseros con login propio
  | 'quick_add'           // Quick Add de pedidos desde el staff
  | 'quick_requests'      // Solicitudes rápidas (agua, servilletas, ayuda)
  | 'kds'                 // Kitchen Display System (pantalla de cocina)
  | 'team_management'     // Gestión de equipo (riders, meseros, roles)
  | 'modifiers'           // Modificadores de productos
  | 'advanced_branding'   // Temas avanzados y branding premium

  // C. Conversión y crecimiento
  | 'neuro_badges'        // Badges de escasez / urgencia (neuro-ventas)
  | 'featured_dish'       // Plato destacado en el menú
  | 'upsell_static'       // Upsell estático por producto
  | 'upsell_ai'           // Upsell con IA (GPT-4o-mini)
  | 'social_proof'        // Social proof toast (pedidos recientes)
  | 'i18n'                // Menú bilingüe ES/EN

  // D. Analítica y control
  | 'analytics_basic'     // Dashboard básico: ventas, ticket promedio
  | 'analytics_advanced'  // Analítica avanzada: horas pico, top productos, tendencias
  | 'team_performance'    // Rendimiento del equipo por mesero
  | 'smart_closing'       // Corte Z diario + exportación + WhatsApp

  // E. Delivery OS (add-on)
  | 'delivery_checkout'   // Checkout con dirección de delivery
  | 'delivery_coverage'   // Cobertura y zonas de delivery
  | 'delivery_eta'        // ETA estimado al cliente
  | 'delivery_rider_app'  // App del rider (login, pedidos asignados)
  | 'delivery_dispatch'   // Panel de dispatch (asignar riders)
  | 'delivery_tracking'   // Tracking en tiempo real para el cliente
  | 'delivery_zones'      // Zonas y tarifas configurables
  | 'delivery_analytics'  // Analítica específica de delivery
  | 'delivery_history';   // Historial completo de pedidos delivery

// ── Metadata de capabilities ──────────────────────────────────────────────────

export interface CapabilityMeta {
  key: Capability;
  label: string;
  description: string;
  group: 'core' | 'operations' | 'growth' | 'analytics' | 'delivery';
}

export const CAPABILITY_META: Record<Capability, CapabilityMeta> = {
  // A. Núcleo comercial
  core_menu:         { key: 'core_menu',         group: 'core',       label: 'Menú digital',              description: 'Menú con fotos, precios y categorías' },
  core_qr:           { key: 'core_qr',           group: 'core',       label: 'Código QR',                 description: 'QR descargable para mesas' },
  core_branding:     { key: 'core_branding',     group: 'core',       label: 'Branding básico',           description: 'Logo, colores y tipografía' },
  direct_ordering:   { key: 'direct_ordering',   group: 'core',       label: 'Pedidos directos',          description: 'Pedidos desde el menú sin mesero' },
  checkout:          { key: 'checkout',           group: 'core',       label: 'Checkout completo',         description: 'Flujo de pago integrado' },
  payments_basic:    { key: 'payments_basic',     group: 'core',       label: 'Pagos (SINPE / Efectivo)',  description: 'SINPE Móvil y efectivo' },
  order_history:     { key: 'order_history',      group: 'core',       label: 'Historial de pedidos',      description: 'Registro básico de pedidos' },

  // B. Operación interna
  orders_panel:      { key: 'orders_panel',       group: 'operations', label: 'Panel de pedidos',          description: 'Kanban de pedidos en vivo' },
  staff_panel:       { key: 'staff_panel',        group: 'operations', label: 'Panel de meseros',          description: 'Login y panel exclusivo para meseros' },
  quick_add:         { key: 'quick_add',          group: 'operations', label: 'Quick Add',                 description: 'Agregar pedidos rápidamente desde el staff' },
  quick_requests:    { key: 'quick_requests',     group: 'operations', label: 'Solicitudes rápidas',       description: 'Agua, servilletas, ayuda desde la mesa' },
  kds:               { key: 'kds',                group: 'operations', label: 'KDS (Pantalla de cocina)',  description: 'Kitchen Display System en tiempo real' },
  team_management:   { key: 'team_management',    group: 'operations', label: 'Gestión de equipo',         description: 'Riders, meseros y roles' },
  modifiers:         { key: 'modifiers',          group: 'operations', label: 'Modificadores',             description: 'Opciones y variantes de productos' },
  advanced_branding: { key: 'advanced_branding',  group: 'operations', label: 'Temas avanzados',           description: 'Temas premium y branding personalizado' },

  // C. Conversión y crecimiento
  neuro_badges:      { key: 'neuro_badges',       group: 'growth',     label: 'Neuro-Badges',              description: 'Badges de escasez y urgencia' },
  featured_dish:     { key: 'featured_dish',      group: 'growth',     label: 'Plato destacado',           description: 'Destacar un plato en el menú' },
  upsell_static:     { key: 'upsell_static',      group: 'growth',     label: 'Upsell estático',           description: 'Sugerencias de upsell por producto' },
  upsell_ai:         { key: 'upsell_ai',          group: 'growth',     label: 'Upsell con IA',             description: 'Upsell inteligente con GPT-4o-mini' },
  social_proof:      { key: 'social_proof',       group: 'growth',     label: 'Social Proof',              description: 'Toast de pedidos recientes' },
  i18n:              { key: 'i18n',               group: 'growth',     label: 'Menú bilingüe ES/EN',       description: 'Traducción automática del menú' },

  // D. Analítica y control
  analytics_basic:   { key: 'analytics_basic',    group: 'analytics',  label: 'Analítica básica',          description: 'Ventas, ticket promedio, conversión' },
  analytics_advanced:{ key: 'analytics_advanced', group: 'analytics',  label: 'Analítica avanzada',        description: 'Horas pico, top productos, tendencias' },
  team_performance:  { key: 'team_performance',   group: 'analytics',  label: 'Rendimiento del equipo',    description: 'Métricas por mesero' },
  smart_closing:     { key: 'smart_closing',      group: 'analytics',  label: 'Corte Inteligente',         description: 'Corte Z diario, exportación y WhatsApp' },

  // E. Delivery OS
  delivery_checkout: { key: 'delivery_checkout',  group: 'delivery',   label: 'Checkout delivery',         description: 'Dirección y datos de entrega' },
  delivery_coverage: { key: 'delivery_coverage',  group: 'delivery',   label: 'Cobertura',                 description: 'Mapa de cobertura de delivery' },
  delivery_eta:      { key: 'delivery_eta',       group: 'delivery',   label: 'ETA',                       description: 'Tiempo estimado de entrega' },
  delivery_rider_app:{ key: 'delivery_rider_app', group: 'delivery',   label: 'App del Rider',             description: 'App para repartidores' },
  delivery_dispatch: { key: 'delivery_dispatch',  group: 'delivery',   label: 'Dispatch',                  description: 'Asignación de riders a pedidos' },
  delivery_tracking: { key: 'delivery_tracking',  group: 'delivery',   label: 'Tracking en vivo',          description: 'Seguimiento en tiempo real' },
  delivery_zones:    { key: 'delivery_zones',     group: 'delivery',   label: 'Zonas y tarifas',           description: 'Configuración de zonas de cobertura' },
  delivery_analytics:{ key: 'delivery_analytics', group: 'delivery',   label: 'Analítica delivery',        description: 'Métricas específicas de delivery' },
  delivery_history:  { key: 'delivery_history',   group: 'delivery',   label: 'Historial delivery',        description: 'Registro completo de entregas' },
};
