/**
 * onboarding/tourRegistry.ts
 * Definición de los 16 tours del admin de SuperMenu.
 * Cada tour tiene pasos cortos, humanos y sin exceso de texto.
 */

import type { TourDefinition, TourModuleKey } from './types';

const tours: TourDefinition[] = [
  // ─── OPERACIÓN ─────────────────────────────────────────────────────────────

  {
    module: 'orders',
    label: 'Pedidos',
    description: 'Gestiona los pedidos activos en tiempo real.',
    icon: '📋',
    steps: [
      {
        title: 'Centro de pedidos',
        body: 'Aquí llegan todos los pedidos activos de tu restaurante en tiempo real.',
        placement: 'center',
      },
      {
        target: '[data-help-anchor="sidebar-orders"]',
        title: 'Acceso rápido',
        body: 'Desde el sidebar siempre puedes volver a Pedidos con un clic.',
        placement: 'right',
      },
      {
        title: 'Estados del pedido',
        body: 'Cada pedido pasa por: Nuevo → En preparación → Listo → Entregado. Muévelos manualmente o activa el flujo automático.',
        placement: 'center',
      },
      {
        title: 'Prioridad',
        body: 'Los pedidos más antiguos aparecen primero. Si hay demora, el sistema lo indica visualmente.',
        placement: 'center',
      },
    ],
  },

  {
    module: 'history',
    label: 'Historial',
    description: 'Consulta pedidos pasados y exporta datos.',
    icon: '🕐',
    steps: [
      {
        title: 'Historial de pedidos',
        body: 'Aquí están todos los pedidos completados o cancelados. Útil para auditoría y seguimiento.',
        placement: 'center',
      },
      {
        title: 'Filtros',
        body: 'Filtra por fecha, estado o cliente para encontrar exactamente lo que necesitas.',
        placement: 'center',
      },
      {
        title: 'Para gerencia',
        body: 'Usa el historial para revisar patrones de venta, tiempos de atención y volumen por turno.',
        placement: 'center',
      },
    ],
  },

  {
    module: 'staff',
    label: 'Equipo',
    description: 'Administra tu personal y sus accesos.',
    icon: '👥',
    steps: [
      {
        title: 'Gestión de equipo',
        body: 'Agrega, edita o desactiva a los miembros de tu equipo. Cada uno tiene su propio acceso.',
        placement: 'center',
      },
      {
        title: 'Roles y acceso',
        body: 'Puedes asignar roles específicos: mesero, cocina, caja. Cada rol ve solo lo que necesita.',
        placement: 'center',
      },
      {
        title: 'Modo operativo',
        body: 'Define si el equipo trabaja en modo compartido (todos ven todo) o exclusivo (cada uno su sección).',
        placement: 'center',
      },
    ],
  },

  {
    module: 'tables',
    label: 'Mesas',
    description: 'Configura y gestiona el mapa de mesas.',
    icon: '🪑',
    steps: [
      {
        title: 'Mapa de mesas',
        body: 'Visualiza el estado de cada mesa: libre, ocupada o con pedido activo.',
        placement: 'center',
      },
      {
        title: 'Crear mesas',
        body: 'Agrega mesas con nombre o número. Puedes organizarlas por zonas: terraza, salón, barra.',
        placement: 'center',
      },
      {
        title: 'Uso operativo',
        body: 'Al asignar una mesa a un pedido, el sistema la marca como ocupada automáticamente.',
        placement: 'center',
      },
    ],
  },

  // ─── CATÁLOGO ──────────────────────────────────────────────────────────────

  {
    module: 'menu',
    label: 'Menú',
    description: 'Gestiona tus productos y su visibilidad.',
    icon: '🍽️',
    steps: [
      {
        title: 'Gestión de productos',
        body: 'Aquí creas, editas y organizas todos los platillos y bebidas de tu menú.',
        placement: 'center',
      },
      {
        title: 'Visibilidad',
        body: 'Activa o desactiva productos sin eliminarlos. Ideal para platillos de temporada o agotados.',
        placement: 'center',
      },
      {
        title: 'Orden lógico',
        body: 'Arrastra los productos para cambiar el orden en que aparecen en el menú del cliente.',
        placement: 'center',
      },
    ],
  },

  {
    module: 'categories',
    label: 'Categorías',
    description: 'Organiza tu menú en secciones claras.',
    icon: '🏷️',
    steps: [
      {
        title: 'Organización del menú',
        body: 'Las categorías agrupan tus productos: Entradas, Platos fuertes, Postres, Bebidas…',
        placement: 'center',
      },
      {
        title: 'Impacto en el cliente',
        body: 'El cliente navega por categorías. Un menú bien organizado vende más.',
        placement: 'center',
      },
      {
        title: 'Orden y visibilidad',
        body: 'Puedes reordenar y ocultar categorías sin perder los productos dentro de ellas.',
        placement: 'center',
      },
    ],
  },

  {
    module: 'modifiers',
    label: 'Modificadores',
    description: 'Extras, guarniciones y opciones de personalización.',
    icon: '⚙️',
    steps: [
      {
        title: '¿Qué son los modificadores?',
        body: 'Son las opciones que el cliente puede elegir al pedir: tamaño, guarnición, extras, sin ingrediente…',
        placement: 'center',
      },
      {
        title: 'Impacto en la venta',
        body: 'Un buen sistema de modificadores aumenta el ticket promedio y reduce errores en cocina.',
        placement: 'center',
      },
      {
        title: 'Grupos de opciones',
        body: 'Crea grupos reutilizables (ej. "Término de la carne") y asígnalos a varios productos.',
        placement: 'center',
      },
    ],
  },

  // ─── NEGOCIO ───────────────────────────────────────────────────────────────

  {
    module: 'analytics',
    label: 'Analítica',
    description: 'Métricas de ventas y comportamiento del negocio.',
    icon: '📊',
    steps: [
      {
        title: 'Métricas clave',
        body: 'Ventas totales, ticket promedio, productos más pedidos y horas pico de tu negocio.',
        placement: 'center',
      },
      {
        title: 'Cómo interpretarlas',
        body: 'Compara períodos para detectar tendencias. Un lunes bajo puede ser normal; dos seguidos, una señal.',
        placement: 'center',
      },
      {
        title: 'Para gerencia',
        body: 'Usa Analítica para tomar decisiones: qué quitar del menú, cuándo abrir más tarde, dónde mejorar.',
        placement: 'center',
      },
    ],
  },

  {
    module: 'performance',
    label: 'Rendimiento del equipo',
    description: 'Team Intelligence: score, alertas y coaching.',
    icon: '🏆',
    steps: [
      {
        title: 'Team Intelligence',
        body: 'Mide el rendimiento de tu equipo de forma objetiva: tiempos, entregas, cobros y consistencia.',
        placement: 'center',
      },
      {
        title: 'Score 0–100',
        body: 'Cada empleado tiene un score calculado a partir de 5 dimensiones. No es un juicio, es una guía.',
        placement: 'center',
      },
      {
        title: 'Alertas gerenciales',
        body: 'El sistema detecta patrones preocupantes: tiempos altos, entregas fallidas, inconsistencias.',
        placement: 'center',
      },
      {
        title: 'Coaching',
        body: 'Para cada empleado ves sus fortalezas y áreas de mejora. Úsalo para conversaciones constructivas.',
        placement: 'center',
      },
    ],
  },

  {
    module: 'customers',
    label: 'Clientes',
    description: 'Base de clientes, historial y segmentación.',
    icon: '👤',
    steps: [
      {
        title: 'Tu base de clientes',
        body: 'Aquí ves a todos los clientes que han interactuado con tu restaurante.',
        placement: 'center',
      },
      {
        title: 'Historial y valor',
        body: 'Consulta cuánto ha gastado cada cliente, cuántas veces ha pedido y cuándo fue su última visita.',
        placement: 'center',
      },
      {
        title: 'Para CRM',
        body: 'Segmenta clientes frecuentes, nuevos o inactivos para campañas o atención personalizada.',
        placement: 'center',
      },
    ],
  },

  {
    module: 'promotions',
    label: 'Promociones',
    description: 'Crea y gestiona promos y cupones.',
    icon: '🎁',
    steps: [
      {
        title: 'Promociones y cupones',
        body: 'Crea descuentos, 2x1, cupones de código o promos automáticas para tus clientes.',
        placement: 'center',
      },
      {
        title: 'Vigencia y usos',
        body: 'Define fechas de inicio y fin, límite de usos totales o por cliente.',
        placement: 'center',
      },
      {
        title: 'Automatizaciones',
        body: 'Activa promos en horarios específicos o para clientes que no han pedido en X días.',
        placement: 'center',
      },
    ],
  },

  {
    module: 'qr',
    label: 'QR',
    description: 'Genera y gestiona códigos QR para tus mesas.',
    icon: '📱',
    steps: [
      {
        title: '¿Para qué sirve el QR?',
        body: 'Genera un código QR que lleva directamente al menú digital de tu restaurante.',
        placement: 'center',
      },
      {
        title: 'Uso operativo',
        body: 'Imprime el QR y colócalo en cada mesa. El cliente lo escanea y ordena sin esperar.',
        placement: 'center',
      },
      {
        title: 'QR por mesa',
        body: 'Puedes generar un QR único por mesa para que el pedido llegue asociado a la mesa correcta.',
        placement: 'center',
      },
    ],
  },

  // ─── SISTEMA ───────────────────────────────────────────────────────────────

  {
    module: 'experience',
    label: 'Experiencia Cliente',
    description: 'Configura login, favoritos, historial y vista del cliente.',
    icon: '✨',
    steps: [
      {
        title: 'Experiencia del cliente',
        body: 'Controla qué funciones del menú digital están activas para tus clientes.',
        placement: 'center',
      },
      {
        title: 'Login y perfiles',
        body: 'Activa el login para que los clientes guarden favoritos, vean su historial y acumulen puntos.',
        placement: 'center',
      },
      {
        title: 'Historial y favoritos',
        body: 'Cuando están activos, el cliente puede repetir pedidos anteriores con un toque.',
        placement: 'center',
      },
      {
        title: 'Vista previa',
        body: 'Usa el botón "Ver menú" para ver exactamente cómo lo ve tu cliente en este momento.',
        placement: 'center',
      },
    ],
  },

  {
    module: 'theme',
    label: 'Tema',
    description: 'Personaliza colores, hero, wordmark y apariencia.',
    icon: '🎨',
    steps: [
      {
        target: '[data-help-anchor="sidebar-theme"]',
        title: 'Personalización visual',
        body: 'Aquí defines cómo se ve tu menú digital: colores, tipografía y estilo general.',
        placement: 'right',
      },
      {
        target: '[data-help-anchor="theme-tab"]',
        title: 'Colores y branding',
        body: 'Elige los colores de acento que representan tu marca. El sistema genera la paleta completa.',
        placement: 'bottom',
        optional: true,
      },
      {
        title: 'Hero image',
        body: 'La imagen principal que ve el cliente al abrir tu menú. Sube una foto atractiva de tu restaurante o platillo estrella.',
        placement: 'center',
      },
      {
        title: 'Wordmark',
        body: 'El logo o nombre de tu restaurante que aparece sobre la imagen hero. Puedes subir tu logo o usar el nombre de texto.',
        placement: 'center',
      },
    ],
  },

  {
    module: 'settings',
    label: 'Configuración',
    description: 'Datos del negocio, seguridad e identidad.',
    icon: '⚙️',
    steps: [
      {
        target: '[data-help-anchor="sidebar-settings"]',
        title: 'Configuración del negocio',
        body: 'Aquí están los datos base de tu restaurante: nombre, dirección, horarios y estado.',
        placement: 'right',
      },
      {
        target: '[data-help-anchor="settings-tab"]',
        title: 'Identidad',
        body: 'Mantén actualizado el nombre, descripción y datos de contacto. Esto aparece en tu menú público.',
        placement: 'bottom',
        optional: true,
      },
      {
        title: 'Estado abierto / cerrado',
        body: 'Controla si tu restaurante acepta pedidos en este momento. Puedes cerrarlo temporalmente sin perder la configuración.',
        placement: 'center',
      },
      {
        title: 'Seguridad',
        body: 'Cambia tu contraseña de admin desde aquí. Recomendamos hacerlo periódicamente.',
        placement: 'center',
      },
    ],
  },

  // ─── DELIVERY OS ───────────────────────────────────────────────────────────

  {
    module: 'delivery',
    label: 'Delivery OS',
    description: 'Configura y opera tu sistema de delivery.',
    icon: '🚀',
    steps: [
      {
        title: 'Delivery OS',
        body: 'Sistema completo para gestionar pedidos a domicilio: cobertura, tarifas, pagos y riders.',
        placement: 'center',
      },
      {
        title: 'Cobertura',
        body: 'Define el radio de entrega desde tu restaurante. El sistema calcula si el cliente está dentro.',
        placement: 'center',
      },
      {
        title: 'Tarifas',
        body: 'Configura el costo de envío: fijo, por distancia o con rangos personalizados.',
        placement: 'center',
      },
      {
        title: 'Métodos de pago',
        body: 'Activa SINPE, efectivo o tarjeta. Puedes requerir pago antes de que entre a cocina.',
        placement: 'center',
      },
      {
        title: 'Flujo de pedidos',
        body: 'Define si los pedidos requieren aprobación manual o entran automáticamente.',
        placement: 'center',
      },
      {
        title: 'Riders',
        body: 'Asigna repartidores a pedidos y define cuándo despacharlos según el tiempo de preparación.',
        placement: 'center',
      },
      {
        title: 'Historial de delivery',
        body: 'Revisa todos los pedidos de delivery: tiempos, rutas y estado de cada entrega.',
        placement: 'center',
      },
    ],
  },
];

/** Mapa indexado por módulo para acceso O(1) */
export const tourRegistry: Record<TourModuleKey, TourDefinition> = Object.fromEntries(
  tours.map(t => [t.module, t])
) as Record<TourModuleKey, TourDefinition>;

/** Lista ordenada de todos los módulos disponibles */
export const ALL_TOUR_MODULES: TourModuleKey[] = tours.map(t => t.module);

export default tourRegistry;
