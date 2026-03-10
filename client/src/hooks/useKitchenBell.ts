/*
 * Kitchen Bell v2: Web Audio API hook for new order notifications.
 * PWA-safe: desbloquea el AudioContext en el primer toque del usuario
 * para que funcione correctamente en apps instaladas en el celular (iOS/Android).
 * No requiere archivos de audio externos.
 */
import { useCallback, useEffect, useRef } from 'react';

// Singleton AudioContext compartido entre instancias del hook
let sharedCtx: AudioContext | null = null;
let unlocked = false;

function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    sharedCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return sharedCtx;
}

// Desbloquear el AudioContext en el primer gesto del usuario.
// Crítico para PWA instaladas en iOS y Android donde el autoplay está bloqueado.
function unlockAudio() {
  if (unlocked) return;
  try {
    const ctx = getAudioContext();
    const resume = () => {
      ctx.resume().then(() => {
        unlocked = true;
        // Reproducir un buffer vacío para confirmar el desbloqueo
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      }).catch(() => {/* silencioso */});
    };
    if (ctx.state === 'suspended') {
      resume();
    } else {
      unlocked = true;
    }
  } catch { /* silencioso */ }
}

export function useKitchenBell() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Registrar listener de desbloqueo al montar el componente
  useEffect(() => {
    const events = ['touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
    const handler = () => {
      unlockAudio();
    };
    events.forEach(e => document.addEventListener(e, handler, { once: false, passive: true }));
    return () => {
      events.forEach(e => document.removeEventListener(e, handler));
    };
  }, []);

  const playBell = useCallback(() => {
    try {
      const ctx = getAudioContext();
      audioCtxRef.current = ctx;

      const doPlay = () => {
        const now = ctx.currentTime;

        // Tono 1 — fundamental (A5 ~830Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(830, now);
        gain1.gain.setValueAtTime(0.35, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 1.4);

        // Tono 2 — armónico (E6 ~1245Hz)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1245, now);
        gain2.gain.setValueAtTime(0.2, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.05);
        osc2.stop(now + 1.0);

        // Tono 3 — shimmer (G#6 ~1660Hz)
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(1660, now);
        gain3.gain.setValueAtTime(0.1, now);
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc3.connect(gain3);
        gain3.connect(ctx.destination);
        osc3.start(now + 0.1);
        osc3.stop(now + 0.7);

        // Segundo "ding" para mayor urgencia
        const osc4 = ctx.createOscillator();
        const gain4 = ctx.createGain();
        osc4.type = 'sine';
        osc4.frequency.setValueAtTime(830, now + 0.5);
        gain4.gain.setValueAtTime(0.25, now + 0.5);
        gain4.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
        osc4.connect(gain4);
        gain4.connect(ctx.destination);
        osc4.start(now + 0.5);
        osc4.stop(now + 1.8);
      };

      if (ctx.state === 'suspended') {
        ctx.resume().then(doPlay).catch(e => console.warn('Kitchen bell resume failed:', e));
      } else {
        doPlay();
      }
    } catch (e) {
      console.warn('Kitchen bell audio failed:', e);
    }
  }, []);

  return { playBell };
}
