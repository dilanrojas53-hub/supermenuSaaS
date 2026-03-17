/**
 * usePushNotifications — Hook para Web Push Notifications
 * Fase 6-B: SmartMenu Delivery
 *
 * Maneja:
 * - Solicitud de permiso al usuario
 * - Registro de suscripción en push_subscriptions (amarrada a tenant + subscriber)
 * - Disparo de eventos push via Edge Function send-push
 * - Limpieza de suscripción al desmontar
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// VAPID public key — debe coincidir con la configurada en send-push
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
  || 'BMCvJ4u39VfN7f4rkDk4WtJ9ZoM1yecD_khBMZxjoTyIzvd-6g5pwEu0lofT9z6ybztlEGa-moLA8rPMYJxazM8';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(Array.from(rawData).map(c => c.charCodeAt(0)));
}

export type PushSubscriberType = 'rider' | 'client' | 'admin';

interface UsePushNotificationsOptions {
  tenantId: string;
  subscriberType: PushSubscriberType;
  subscriberId: string;   // riderId, orderId, adminId, etc.
  orderId?: string;       // Para clientes: amarrar la suscripción al pedido
  riderId?: string;       // Para riders: FK a rider_profiles
  autoSubscribe?: boolean; // Si true, solicita permiso automáticamente al montar
}

export function usePushNotifications(opts: UsePushNotificationsOptions) {
  const { tenantId, subscriberType, subscriberId, orderId, riderId, autoSubscribe = false } = opts;

  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verificar si el browser soporta push
  const isSupported = typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;

  // ─── Registrar suscripción en Supabase ─────────────────────────────────────
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !tenantId || !subscriberId) return false;
    setLoading(true);
    setError(null);

    try {
      // 1. Solicitar permiso
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setError('Permiso de notificaciones denegado');
        return false;
      }

      // 2. Registrar o recuperar el Service Worker
      const registration = await navigator.serviceWorker.ready;

      // 3. Crear suscripción Push
      const pushSub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const subJson = pushSub.toJSON();
      const keys = subJson.keys as { p256dh: string; auth: string };

      // 4. Guardar en Supabase (upsert por subscriber_type + subscriber_id + tenant_id)
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .upsert({
          tenant_id: tenantId,
          subscriber_type: subscriberType,
          subscriber_id: subscriberId,
          endpoint: pushSub.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          order_id: orderId || null,
          rider_id: riderId || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'subscriber_type,subscriber_id,tenant_id',
        });

      if (dbError) throw dbError;

      setSubscribed(true);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[usePushNotifications] subscribe error:', msg);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported, tenantId, subscriberId, subscriberType, orderId, riderId]);

  // ─── Cancelar suscripción ──────────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const pushSub = await registration.pushManager.getSubscription();
      if (pushSub) await pushSub.unsubscribe();

      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('subscriber_type', subscriberType)
        .eq('subscriber_id', subscriberId);

      setSubscribed(false);
    } catch (err) {
      console.error('[usePushNotifications] unsubscribe error:', err);
    }
  }, [isSupported, tenantId, subscriberType, subscriberId]);

  // ─── Disparar evento push via Edge Function ────────────────────────────────
  const sendPush = useCallback(async (
    event: string,
    targetSubscriberType: PushSubscriberType,
    targetSubscriberId: string,
    data: Record<string, string> = {}
  ) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const anonKey = (supabase as any).supabaseKey as string;

      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token
            ? `Bearer ${session.access_token}`
            : `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          event,
          tenant_id: tenantId,
          subscriber_type: targetSubscriberType,
          subscriber_id: targetSubscriberId,
          order_id: orderId,
          data,
        }),
      });

      const result = await response.json();
      return result;
    } catch (err) {
      console.error('[usePushNotifications] sendPush error:', err);
      return null;
    }
  }, [tenantId, orderId]);

  // ─── Auto-subscribe al montar ──────────────────────────────────────────────
  useEffect(() => {
    if (autoSubscribe && isSupported && permission === 'default' && tenantId && subscriberId) {
      subscribe();
    }
  }, [autoSubscribe, isSupported, permission, tenantId, subscriberId, subscribe]);

  // ─── Verificar si ya hay suscripción activa ────────────────────────────────
  useEffect(() => {
    if (!isSupported || !tenantId || !subscriberId) return;
    (async () => {
      const registration = await navigator.serviceWorker.ready;
      const pushSub = await registration.pushManager.getSubscription();
      if (pushSub) setSubscribed(true);
    })();
  }, [isSupported, tenantId, subscriberId]);

  return {
    isSupported,
    permission,
    subscribed,
    loading,
    error,
    subscribe,
    unsubscribe,
    sendPush,
  };
}
