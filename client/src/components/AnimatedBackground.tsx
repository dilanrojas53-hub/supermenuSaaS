/**
 * AnimatedBackground — GPU-Accelerated Animated Orbes.
 *
 * Uses REAL @keyframes CSS animations (NOT transitions).
 * Accepts dynamic colors from restaurant theme via props.
 * Falls back to warm amber/orange tones if no colors provided.
 *
 * Architecture:
 *   - Fixed container at z-index:-50 with dark base
 *   - 3 orbes with mix-blend-mode:screen, blur(100px), infinite CSS animations
 *   - Overlay for text legibility
 *   - pointer-events:none on everything
 */
import React, { useMemo } from 'react';

interface Props {
  color1?: string;
  color2?: string;
  color3?: string;
}

function lighten(hex: string, amount: number): string {
  try {
    const c = hex.replace('#', '');
    if (c.length < 6) return '#ffaa00';
    const r = Math.min(255, Math.round(parseInt(c.substring(0, 2), 16) * (1 - amount) + 255 * amount));
    const g = Math.min(255, Math.round(parseInt(c.substring(2, 4), 16) * (1 - amount) + 255 * amount));
    const b = Math.min(255, Math.round(parseInt(c.substring(4, 6), 16) * (1 - amount) + 255 * amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch {
    return '#ffaa00';
  }
}

function darken(hex: string, amount: number): string {
  try {
    const c = hex.replace('#', '');
    if (c.length < 6) return '#cc4400';
    const r = Math.round(parseInt(c.substring(0, 2), 16) * (1 - amount));
    const g = Math.round(parseInt(c.substring(2, 4), 16) * (1 - amount));
    const b = Math.round(parseInt(c.substring(4, 6), 16) * (1 - amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch {
    return '#cc4400';
  }
}

export default function AnimatedBackground({ color1, color2, color3 }: Props) {
  // Derive 3 harmonious colors from the restaurant's primary color
  // Fallback: warm amber tones for restaurants
  const c1 = color1 || '#D97706'; // amber-600
  const c2 = color2 || lighten(c1, 0.3);
  const c3 = color3 || darken(c1, 0.3);

  // Generate unique keyframe names to avoid collisions
  const keyframes = useMemo(() => `
    @keyframes orbeFloat1 {
      0% {
        transform: translateZ(0) translate(0, 0) scale(1);
      }
      33% {
        transform: translateZ(0) translate(25vw, 20vh) scale(1.15);
      }
      66% {
        transform: translateZ(0) translate(10vw, 35vh) scale(0.95);
      }
      100% {
        transform: translateZ(0) translate(0, 0) scale(1);
      }
    }
    @keyframes orbeFloat2 {
      0% {
        transform: translateZ(0) translate(0, 0) scale(1);
      }
      33% {
        transform: translateZ(0) translate(-20vw, -25vh) scale(1.1);
      }
      66% {
        transform: translateZ(0) translate(-10vw, -15vh) scale(1.2);
      }
      100% {
        transform: translateZ(0) translate(0, 0) scale(1);
      }
    }
    @keyframes orbeFloat3 {
      0% {
        transform: translateZ(0) translate(0, 0) scale(1);
      }
      33% {
        transform: translateZ(0) translate(-8vw, 10vh) scale(1.3);
      }
      66% {
        transform: translateZ(0) translate(5vw, -5vh) scale(0.9);
      }
      100% {
        transform: translateZ(0) translate(0, 0) scale(1);
      }
    }
  `, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -50,
        overflow: 'hidden',
        backgroundColor: '#050505',
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      {/* Inject keyframes */}
      <style>{keyframes}</style>

      {/* Orbe 1 — Primary color, top-left, floats right-down */}
      <div
        style={{
          position: 'absolute',
          top: '-10%',
          left: '-10%',
          width: '60vw',
          height: '60vw',
          borderRadius: '50%',
          backgroundColor: c1,
          filter: 'blur(100px)',
          WebkitFilter: 'blur(100px)',
          opacity: 0.55,
          mixBlendMode: 'screen' as const,
          animation: 'orbeFloat1 18s ease-in-out infinite',
          willChange: 'transform',
          pointerEvents: 'none' as const,
        }}
      />

      {/* Orbe 2 — Lighter variant, bottom-right, floats left-up */}
      <div
        style={{
          position: 'absolute',
          bottom: '-10%',
          right: '-10%',
          width: '65vw',
          height: '65vw',
          borderRadius: '50%',
          backgroundColor: c2,
          filter: 'blur(100px)',
          WebkitFilter: 'blur(100px)',
          opacity: 0.45,
          mixBlendMode: 'screen' as const,
          animation: 'orbeFloat2 24s ease-in-out infinite',
          willChange: 'transform',
          pointerEvents: 'none' as const,
        }}
      />

      {/* Orbe 3 — Darker variant, center, breathes with scale */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '20%',
          width: '55vw',
          height: '55vw',
          borderRadius: '50%',
          backgroundColor: c3,
          filter: 'blur(100px)',
          WebkitFilter: 'blur(100px)',
          opacity: 0.4,
          mixBlendMode: 'screen' as const,
          animation: 'orbeFloat3 21s ease-in-out infinite',
          willChange: 'transform',
          pointerEvents: 'none' as const,
        }}
      />

      {/* Overlay for text legibility */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.35)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          zIndex: 10,
          pointerEvents: 'none' as const,
        }}
      />
    </div>
  );
}
