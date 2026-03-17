/**
 * send-push — Edge Function para enviar Web Push Notifications
 * Fase 6-B: SmartMenu Delivery
 *
 * Eventos soportados:
 * - rider_assigned: Notifica al rider cuando se le asigna un pedido
 * - order_confirmed: Notifica al cliente que su pedido fue confirmado
 * - rider_on_the_way: Notifica al cliente que el rider está en camino
 * - rider_nearby: Notifica al cliente que el rider está cerca
 * - order_delivered: Notifica al cliente que el pedido fue entregado
 * - unassigned_alert: Notifica al admin que hay pedidos sin asignar
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// VAPID keys — generadas con web-push, almacenadas como secrets en Supabase
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || 'BMCvJ4u39VfN7f4rkDk4WtJ9ZoM1yecD_khBMZxjoTyIzvd-6g5pwEu0lofT9z6ybztlEGa-moLA8rPMYJxazM8';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || 'Px0-euyEt2muDO7UtLNMl2OgpcQiCjESKtq6n8x0QEA';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@digitalatlas.cr';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ─── Utilidades VAPID ─────────────────────────────────────────────────────────

function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  const binary = atob(padded);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

function uint8ArrayToBase64url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function createVapidJwt(audience: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: VAPID_SUBJECT,
  };

  const headerB64 = uint8ArrayToBase64url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const keyData = base64urlToUint8Array(VAPID_PRIVATE_KEY);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${uint8ArrayToBase64url(new Uint8Array(signature))}`;
}

async function sendWebPush(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
}, payload: object): Promise<{ ok: boolean; status: number }> {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const jwt = await createVapidJwt(audience);
  const authHeader = `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`;

  // Cifrar el payload con ECDH + AES-GCM (Web Push Encryption RFC 8291)
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));

  // Generar clave efímera del servidor
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const serverPublicKey = await crypto.subtle.exportKey('raw', serverKeyPair.publicKey);

  // Importar clave pública del cliente
  const clientPublicKey = await crypto.subtle.importKey(
    'raw', base64urlToUint8Array(subscription.p256dh),
    { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );

  // Derivar shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey }, serverKeyPair.privateKey, 256
  );

  // Auth secret del cliente
  const authSecret = base64urlToUint8Array(subscription.auth);

  // HKDF para derivar content encryption key y nonce
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const prk = await crypto.subtle.importKey('raw', sharedSecret, { name: 'HKDF' }, false, ['deriveBits']);
  const ikm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: new TextEncoder().encode('Content-Encoding: auth\0') },
    prk, 256
  );

  const ikmKey = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
  const serverPublicKeyBytes = new Uint8Array(serverPublicKey);
  const clientPublicKeyBytes = base64urlToUint8Array(subscription.p256dh);

  const keyInfo = new Uint8Array([
    ...new TextEncoder().encode('Content-Encoding: aesgcm\0'),
    0x41, // length prefix
    ...clientPublicKeyBytes,
    0x41,
    ...serverPublicKeyBytes,
  ]);

  const nonceInfo = new Uint8Array([
    ...new TextEncoder().encode('Content-Encoding: nonce\0'),
    0x41,
    ...clientPublicKeyBytes,
    0x41,
    ...serverPublicKeyBytes,
  ]);

  const contentKey = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: keyInfo }, ikmKey, 128
  );
  const nonce = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: nonceInfo }, ikmKey, 96
  );

  const aesKey = await crypto.subtle.importKey('raw', contentKey, { name: 'AES-GCM' }, false, ['encrypt']);

  // Padding + encrypt
  const paddedPayload = new Uint8Array([0, 0, ...payloadBytes]);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, aesKey, paddedPayload
  );

  // Construir el body del request
  const body = new Uint8Array([...salt, ...new Uint8Array([0, 0, 16, 0]), ...serverPublicKeyBytes, ...new Uint8Array(encrypted)]);

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aesgcm',
      'Encryption': `salt=${uint8ArrayToBase64url(salt)}`,
      'Crypto-Key': `dh=${uint8ArrayToBase64url(serverPublicKeyBytes)};${authHeader.split(',')[1]}`,
      'TTL': '86400',
    },
    body,
  });

  return { ok: response.ok, status: response.status };
}

// ─── Mensajes por evento ──────────────────────────────────────────────────────

const PUSH_MESSAGES: Record<string, (data: Record<string, string>) => { title: string; body: string; icon?: string }> = {
  rider_assigned: (d) => ({
    title: '🛵 Nuevo pedido asignado',
    body: `Pedido #${d.orderNumber} — ${d.address}. Distancia: ${d.distance}`,
    icon: '/icon-192.png',
  }),
  order_confirmed: (d) => ({
    title: '✅ Pedido confirmado',
    body: `Tu pedido #${d.orderNumber} fue confirmado. ETA: ${d.eta} min`,
    icon: '/icon-192.png',
  }),
  rider_on_the_way: (d) => ({
    title: '🛵 Tu pedido está en camino',
    body: `${d.riderName} está llevando tu pedido. ETA: ${d.eta} min`,
    icon: '/icon-192.png',
  }),
  rider_nearby: (d) => ({
    title: '📍 Tu pedido está cerca',
    body: `${d.riderName} está a menos de 5 minutos`,
    icon: '/icon-192.png',
  }),
  order_delivered: (_d) => ({
    title: '🎉 Pedido entregado',
    body: '¡Tu pedido fue entregado! Gracias por tu preferencia.',
    icon: '/icon-192.png',
  }),
  unassigned_alert: (d) => ({
    title: '⚠️ Pedido sin asignar',
    body: `Pedido #${d.orderNumber} lleva ${d.minutes} min sin rider asignado`,
    icon: '/icon-192.png',
  }),
};

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { event, tenant_id, subscriber_type, subscriber_id, order_id, data = {} } = body;

    if (!event || !tenant_id || !subscriber_type) {
      return new Response(JSON.stringify({ error: 'Missing required fields: event, tenant_id, subscriber_type' }), { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Buscar suscripciones activas para este subscriber
    let query = supabase
      .from('push_subscriptions')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('subscriber_type', subscriber_type);

    if (subscriber_id) query = query.eq('subscriber_id', subscriber_id);
    if (order_id) query = query.or(`order_id.eq.${order_id},order_id.is.null`);

    const { data: subscriptions, error } = await query;

    if (error) {
      console.error('[send-push] Error fetching subscriptions:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!subscriptions?.length) {
      return new Response(JSON.stringify({ sent: 0, message: 'No subscriptions found' }), { status: 200 });
    }

    // Obtener el mensaje para este evento
    const messageFn = PUSH_MESSAGES[event];
    if (!messageFn) {
      return new Response(JSON.stringify({ error: `Unknown event: ${event}` }), { status: 400 });
    }

    const message = messageFn(data);
    const pushPayload = { ...message, data: { event, order_id, ...data } };

    // Enviar a todas las suscripciones
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const result = await sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          pushPayload
        );

        // Si el endpoint ya no es válido (410 Gone), eliminarlo
        if (result.status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }

        return result;
      })
    );

    const sent = results.filter(r => r.status === 'fulfilled' && (r.value as any).ok).length;
    const failed = results.length - sent;

    return new Response(JSON.stringify({ sent, failed, total: results.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    console.error('[send-push] Unexpected error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
