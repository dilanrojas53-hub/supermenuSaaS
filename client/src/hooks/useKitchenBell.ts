/*
 * useKitchenBell v3 — Alarma persistente de dos fases
 *
 * FASE 1 (alerta): Sonido urgente tipo "¡NUEVO PEDIDO!" al detectar el pedido.
 *   - Tres tonos descendentes D6→A5→F5 con ataque duro, duración 1.5s
 *
 * FASE 2 (recordatorio): Cada 10 segundos mientras haya pedidos sin atender.
 *   - Doble "pip" suave (C5 × 2), duración 1.5s
 *
 * La alarma se detiene cuando el admin/cocina llama a stopAlarm().
 *
 * CORRECCIONES DE INTERMITENCIA:
 *   - AudioContext singleton con resume() garantizado antes de cada sonido
 *   - unlocked flag global para no depender del primer gesto en cada instancia
 *   - Intervalo de recordatorio gestionado internamente (no en el componente)
 *   - AdminDashboard ahora también escucha INSERT (no solo UPDATE)
 *   - Detección por IDs (Set) en lugar de conteo para evitar falsos negativos
 *   - Expone: playBell (alias de startAlarm), startAlarm, stopAlarm, isAlarming
 */
import { useCallback, useEffect, useRef, useState } from 'react';

// ── Singleton AudioContext ────────────────────────────────────────────────────
let sharedCtx: AudioContext | null = null;
let unlocked = false;

function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    sharedCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return sharedCtx;
}

async function ensureUnlocked(): Promise<AudioContext> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { /* silencioso */ }
  }
  unlocked = ctx.state === 'running';
  return ctx;
}

// Desbloquear en el primer gesto del usuario (crítico para iOS/Android PWA)
let listenersSetup = false;
function setupUnlockListeners() {
  if (listenersSetup) return;
  listenersSetup = true;
  const handler = () => { ensureUnlocked().catch(() => {}); };
  const events = ['touchstart', 'touchend', 'mousedown', 'keydown', 'click', 'pointerdown'];
  events.forEach(e => document.addEventListener(e, handler, { once: false, passive: true }));
}

// ── Síntesis de sonidos ───────────────────────────────────────────────────────

/**
 * FASE 1 — Alerta urgente: tres tonos descendentes D6→A5→F5
 * Duración total: ~1.5s
 */
function playAlertSound(ctx: AudioContext) {
  const now = ctx.currentTime;

  // Tres tonos descendentes: D6 (1175Hz), A5 (880Hz), F5 (698Hz)
  const freqs = [1175, 880, 698];
  const offsets = [0, 0.35, 0.70];

  freqs.forEach((freq, i) => {
    const t = now + offsets[i];

    // Oscilador principal (square para "punch" urgente)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.45);

    // Armónico suave (sine) para dar cuerpo
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, t);
    gain2.gain.setValueAtTime(0, t);
    gain2.gain.linearRampToValueAtTime(0.12, t + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t);
    osc2.stop(t + 0.35);
  });
}

/**
 * FASE 2 — Recordatorio: doble "pip" suave (C5 × 2)
 * Duración total: ~1.5s
 */
function playReminderSound(ctx: AudioContext) {
  const now = ctx.currentTime;

  [0, 0.55].forEach(offset => {
    const t = now + offset;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523, t); // C5
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.45);

    // Shimmer suave C6
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1046, t); // C6
    gain2.gain.setValueAtTime(0, t);
    gain2.gain.linearRampToValueAtTime(0.08, t + 0.015);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t);
    osc2.stop(t + 0.30);
  });
}

// ── Hook principal ────────────────────────────────────────────────────────────
export function useKitchenBell() {
  const [isAlarming, setIsAlarming] = useState(false);
  const alarmingRef = useRef(false);
  const reminderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Registrar listeners de desbloqueo al montar
  useEffect(() => {
    setupUnlockListeners();
  }, []);

  // Limpiar intervalo al desmontar
  useEffect(() => {
    return () => {
      if (reminderIntervalRef.current) {
        clearInterval(reminderIntervalRef.current);
        reminderIntervalRef.current = null;
      }
    };
  }, []);

  const stopAlarm = useCallback(() => {
    alarmingRef.current = false;
    setIsAlarming(false);
    if (reminderIntervalRef.current) {
      clearInterval(reminderIntervalRef.current);
      reminderIntervalRef.current = null;
    }
  }, []);

  const startAlarm = useCallback(async () => {
    // Si ya está sonando, no reiniciar (evita duplicados)
    if (alarmingRef.current) return;

    alarmingRef.current = true;
    setIsAlarming(true);

    try {
      const ctx = await ensureUnlocked();

      // FASE 1: Sonido de alerta urgente inmediato
      playAlertSound(ctx);

      // FASE 2: Recordatorio cada 10 segundos mientras siga activo
      if (reminderIntervalRef.current) clearInterval(reminderIntervalRef.current);
      reminderIntervalRef.current = setInterval(async () => {
        if (!alarmingRef.current) {
          clearInterval(reminderIntervalRef.current!);
          reminderIntervalRef.current = null;
          return;
        }
        try {
          const c = await ensureUnlocked();
          playReminderSound(c);
        } catch (e) {
          console.warn('[KitchenBell] reminder sound failed:', e);
        }
      }, 10000);
    } catch (e) {
      console.warn('[KitchenBell] startAlarm failed:', e);
      alarmingRef.current = false;
      setIsAlarming(false);
    }
  }, []);

  // playBell es alias de startAlarm para compatibilidad con código existente
  const playBell = startAlarm;

  return { playBell, startAlarm, stopAlarm, isAlarming };
}
