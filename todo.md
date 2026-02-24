# Smart Menu v1.0 — 7 Correcciones Críticas

## Fase 1: Ética y Lógica de Negocio
- [ ] 1. Prueba Social Real: Eliminar nombres aleatorios de SocialProofToast, conectar a tabla orders (últimas 2h)
- [ ] 2. Estado SINPE: Si receipt_url no es nulo, estado inicial = 'pago_en_revision' en vez de 'pendiente'
- [ ] 3. KDS con Botones: Agregar botones [Aprobar] [A Cocina] [Listo] dentro de cada tarjeta de pedido

## Fase 2: Seguridad y Operación
- [ ] 4. Supabase Auth: Eliminar credenciales hardcoded, implementar login real por tenant
- [ ] 5. Alerta Sonora: Web Audio API 'ding' en KDS cuando llega pedido nuevo

## Fase 3: Expansión y Control
- [ ] 6. i18n ES/EN: Toggle de idioma en menú público para textos de interfaz
- [ ] 7. Control de Suscripción: Campo subscription_expires_at en tenants, visible en Super Admin
