# Checkpoint V18.0 — SuperMenu SaaS
**Fecha:** 2026-03-10  
**Commit HEAD:** `ee6deca` — fix(staff): V18.0.1 Add missing StaffDashboard import in App.tsx  
**Branch:** main (sincronizado con origin/main)  
**Deploy:** https://atlas-smartmenu.com — Vercel (activo y verificado)

---

## Estado del Repositorio

| Commit | Descripción |
|---|---|
| `ee6deca` | fix(staff): V18.0.1 Add missing StaffDashboard import in App.tsx |
| `145bdc0` | feat(staff): V18.0 Staff Role - login, Kanban, Quick Add, PIN anti-fraude, trazabilidad |
| `32f19ba` | fix(fab): V17.2.2 Keep active order FAB visible when SINPE payment pending after delivery |
| `169ab92` | fix(checkout): V17.2.1 WhatsApp only on payment verified, contextual delivery messages |
| `36f85e5` | feat(checkout): V17.2 Async SINPE upload, delayed payment UX, Admin payment tracking tabs |
| `f5743e7` | fix: mover Vinos (Botella) y Vinos por Copa al tab de Bebidas |
| `af9805a` | V18.0: Fix tema por restaurante + 27 temas por tipo de restaurante |

---

## Base de Datos — Supabase

**Project ID:** `zddytyncmnivfbvehrth`  
**URL:** https://zddytyncmnivfbvehrth.supabase.co

### Tablas

| Tabla | Descripción |
|---|---|
| `tenants` | Restaurantes. Columnas clave: `slug`, `admin_pin`, `sinpe_number`, `sinpe_owner`, `whatsapp_number` |
| `orders` | Pedidos. Columnas clave: `payment_status` (pending/paid), `payment_method`, `delivered_at`, `handled_by` (uuid), `handled_by_name` (text) |
| `staff` | Meseros. Columnas: `id`, `tenant_id`, `name`, `username`, `password_hash`, `role`, `is_active`, `created_at` |
| `categories` | Categorías de menú por tenant |
| `menu_items` | Items del menú por categoría |
| `theme_settings` | Temas por tenant: `primary_color`, `background_color`, `surface_color`, `text_color`, `badge_color`, `theme_preset_key` |
| `upsell_feedback` | Feedback de sugerencias AI de upsell |

---

## Archivos Clave del Proyecto

| Archivo | Líneas | Descripción |
|---|---|---|
| `client/src/pages/AdminDashboard.tsx` | 2571 | Panel admin: Pedidos, Historial, Menú, Categorías, Config, Tema, Analítica, QR, **Equipo (Staff)** |
| `client/src/components/CartDrawer.tsx` | 1598 | Checkout: selección de método de pago, SINPE sin comprobante inmediato, nota de pago diferido |
| `client/src/pages/OrderStatusPage.tsx` | 775 | Estado del pedido del cliente: timeline, SINPE dropzone async, mensaje de entregado contextual |
| `client/src/pages/StaffDashboard.tsx` | 619 | Dashboard de meseros: login por username, Kanban restringido, Quick Add, PIN anti-fraude |
| `client/src/pages/MenuPage.tsx` | 509 | Menú público: aplica colores de Supabase, FAB de pedido activo, DRINK_CATEGORIES |
| `client/src/lib/themes.ts` | 338 | 27 presets de temas por tipo de restaurante, `applyRestaurantTheme()` |
| `client/src/lib/types.ts` | 275 | Tipos TypeScript: `Order`, `MenuItem`, `Category`, `ThemeSettings` con `payment_status` |
| `client/src/components/ActiveOrderFAB.tsx` | ~80 | FAB flotante: se mantiene visible si SINPE pendiente post-entrega, muestra 📱 |
| `client/src/App.tsx` | ~60 | Rutas: `/`, `/:slug`, `/admin/:slug`, `/staff/:slug`, `/order-status/:id`, `/super-admin` |

---

## Funcionalidades Implementadas

### V18.0 — Staff Role (última épica)
- **Pestaña "Equipo"** en Admin: crear/editar/eliminar meseros, configurar PIN de seguridad
- **StaffDashboard** en `/staff/:slug`: login por username, Kanban Nuevos/En Cocina/Listos
- **Quick Add**: mesero puede agregar pedidos rápidos desde su vista
- **PIN anti-fraude**: cancelar pedido requiere PIN del admin
- **Trazabilidad**: `handled_by_name` se guarda en la orden al avanzarla

### V17.2 — Hybrid Dine-In Checkout & Async SINPE
- Checkout: nota "El pago se realiza al finalizar tu comida"
- SINPE sin comprobante en el checkout — se confirma el pedido directo
- `payment_status: 'pending'` guardado en Supabase al crear la orden
- **OrderStatusPage**: SINPE dropzone async — cliente sube comprobante mientras espera
- **Admin**: tabs "Por Cobrar" / "Cobrados", botón "Marcar como Pagado", timer de alerta post-entrega
- **FAB**: se mantiene visible si SINPE pendiente aunque el pedido esté entregado

### V17.2.1 — Mensajes WhatsApp Contextuales
- WhatsApp de pago verificado solo al presionar "Marcar como Pagado" (no al mandar a cocina)
- Mensaje contextual al entregar: recordatorio de pago según método (SINPE/efectivo/tarjeta)
- OrderStatusPage muestra "¡Buen provecho!" + recordatorio contextual post-entrega

### V18.0 Temas — Fix crítico
- MenuPage lee colores directamente de Supabase (no localStorage)
- 27 presets de temas por tipo de restaurante en `themes.ts`
- 5 color pickers en el Admin (fondo, superficie, texto, principal, badges)
- Cada restaurante muestra su propia identidad visual

### Corrección de categorías
- "Vinos (Botella)" y "Vinos por Copa" movidos al Tab de Bebidas
- `DRINK_CATEGORIES` actualizado en `MenuPage.tsx`

---

## Restaurantes Activos

| Restaurante | Slug | Tema |
|---|---|---|
| Flor & Sal | `flor-y-sal` | Blanco/crema + Verde `#0f7646` |
| Marisquería Tío Toñón | `marisqueria-tio-tonon` | Gris azulado + Azul marino |
| Burger Lab CR | `burger-lab-cr` | Marrón oscuro + Ámbar/dorado |
| La Casona Tica | `la-casona-tica` | Crema cálido + Verde oliva |
| Marisquería El Pacífico | `marisqueria-el-pacifico` | Blanco + Azul cielo |
| The Patty Factory | `the-patty-factory` | Gris oscuro + Turquesa caribeño |

---

## Rutas del Sistema

| Ruta | Descripción |
|---|---|
| `/:slug` | Menú público del restaurante |
| `/admin/:slug` | Panel de administración |
| `/staff/:slug` | Panel de meseros (login por username) |
| `/order-status/:orderId` | Estado del pedido del cliente |
| `/super-admin` | Panel superadmin |
