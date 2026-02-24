/*
 * Kitchen Bell: Web Audio API hook for new order notifications.
 * Plays a pleasant "ding" sound when a new order arrives.
 * Uses Web Audio API — no external audio files needed.
 */
import { useCallback, useRef } from 'react';

export function useKitchenBell() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playBell = useCallback(() => {
    try {
      // Create or reuse AudioContext
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;

      // Resume if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;

      // Create a pleasant "ding" bell sound
      // First tone (fundamental)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(830, now); // A5-ish
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 1.2);

      // Second tone (harmonic)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1245, now); // E6-ish
      gain2.gain.setValueAtTime(0.15, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.05);
      osc2.stop(now + 0.8);

      // Third tone (shimmer)
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(1660, now); // G#6-ish
      gain3.gain.setValueAtTime(0.08, now);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(now + 0.1);
      osc3.stop(now + 0.6);

    } catch (e) {
      console.warn('Kitchen bell audio failed:', e);
    }
  }, []);

  return { playBell };
}
