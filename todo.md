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
