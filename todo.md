# Smart Menu — SaaS Tiers + Bug Fixes

## Correcciones de Interfaz
- [ ] Eliminar botón "Volver al inicio" de AdminLogin.tsx
- [ ] Renderizar logo del restaurante en hero section de MenuPage.tsx
- [ ] Eliminar atributo capture del input file SINPE en CartDrawer.tsx

## Lógica de Suscripciones (SaaS Tiers)
- [ ] Migrar BD: añadir columna plan_tier ('basic','pro','premium') a tenants
- [ ] Actualizar types.ts con plan_tier
- [ ] Feature flagging en AdminDashboard: ocultar tabs según plan
- [ ] Feature flagging en MenuPage: ocultar badges y i18n según plan
- [ ] Super Admin: selector de plan y fecha de vencimiento por tenant

## Feature Flagging Rules
- Basic: Sin KDS, sin Analítica, sin badges Neuro-Ventas. Todo por WhatsApp.
- Pro: KDS + badges Neuro-Ventas + i18n. Sin Analítica.
- Premium: Todo habilitado.

## Épica V3: Post-Orden, Cuenta Abierta, Seguridad SINPE

### Pre-requisitos BD
- [x] ALTER TABLE orders: confirmar status enum (NUEVO, EN PREPARACION, LISTO, COMPLETADO)
- [x] ALTER TABLE orders: ADD has_new_items boolean default false
- [x] ALTER TABLE orders: ADD sinpe_receipt_url text nullable (already existed)
- [x] ALTER TABLE orders: ADD payment_verified boolean default false

### Fase 1: Live Tracking
- [x] Crear página /order-status/:orderId con Supabase Realtime
- [x] Animaciones por estado (reloj arena, fuego, check verde)
- [x] FAB flotante "Ver mi orden activa" en MenuPage (localStorage)
- [x] Redirigir a OrderStatus después de confirmar orden en CartDrawer

### Fase 2: Cuenta Abierta
- [x] Botón "+ Agregar más platillos" en OrderStatus
- [x] Checkout reutilizado con motor de IA para nuevos items
- [x] UPDATE orden existente (concatenar items, sumar total + ai_upsell_revenue)
- [x] Flag has_new_items = true al hacer UPDATE
- [x] Alerta parpadeante "NUEVOS ITEMS" en Kanban admin

### No tocar (Fase 3 — futuro)
- [ ] Seguridad SINPE: subida de comprobante, validación admin
