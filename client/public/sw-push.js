/**
 * sw-push.js — Service Worker para Web Push Notifications
 * SmartMenu Delivery — Fase 6-B
 *
 * Maneja:
 * - push: Mostrar notificación cuando llega un evento push
 * - notificationclick: Abrir la URL correcta al hacer clic
 * - notificationclose: Tracking de cierre (opcional)
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'SmartMenu', body: event.data.text() };
  }

  const { title, body, icon = '/icon-192.png', data = {} } = payload;

  const options = {
    body,
    icon,
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data,
    actions: [],
    requireInteraction: false,
    tag: data.order_id || 'smartmenu-push',
    renotify: true,
  };

  // Acciones según el tipo de evento
  if (data.event === 'rider_assigned') {
    options.actions = [
      { action: 'open_rider', title: '🗺️ Ver pedido' },
      { action: 'dismiss', title: 'Cerrar' },
    ];
    options.requireInteraction = true;
  } else if (data.event === 'rider_on_the_way' || data.event === 'rider_nearby') {
    options.actions = [
      { action: 'track_order', title: '📍 Rastrear' },
    ];
  } else if (data.event === 'unassigned_alert') {
    options.actions = [
      { action: 'open_admin', title: '⚡ Asignar ahora' },
    ];
    options.requireInteraction = true;
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action;

  let urlToOpen = '/';

  if (action === 'open_rider' || data.event === 'rider_assigned') {
    // Rider: abrir la RiderApp
    urlToOpen = data.rider_url || '/';
  } else if (action === 'track_order' || ['rider_on_the_way', 'rider_nearby', 'order_delivered', 'order_confirmed'].includes(data.event)) {
    // Cliente: abrir el OrderStatusPage
    urlToOpen = data.order_url || `/order-status/${data.order_id}`;
  } else if (action === 'open_admin' || data.event === 'unassigned_alert') {
    // Admin: abrir el panel de pedidos
    urlToOpen = data.admin_url || '/admin';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una ventana abierta con esa URL, enfocarla
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no, abrir una nueva ventana
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

self.addEventListener('notificationclose', (event) => {
  // Opcional: tracking de notificaciones cerradas sin clic
  console.log('[sw-push] Notification closed:', event.notification.tag);
});
