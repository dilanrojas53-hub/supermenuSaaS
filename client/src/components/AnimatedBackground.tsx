/**
 * AnimatedBackground — "Subtle Aura" Premium Ambient Light.
 *
 * Design rules:
 *   - Uses the restaurant's primary_color for ALL orbes (no hardcoded magenta/cyan)
 *   - Opacity capped at 0.10–0.15 (ambient, NOT radiactive)
 *   - No mix-blend-mode:screen (uses normal blending)
 *   - blur(120-140px) for extreme diffusion
 *   - Overlay rgba(0,0,0,0.6) + backdrop-blur(10px) for text contrast
 *   - pointer-events:none on EVERYTHING
 *   - Fallback: subtle gray #333333 if no restaurant color
 */
import React, { useMemo } from 'react';

interface Props {
  color1?: string;
}

export default function AnimatedBackground({ color1 }: Props) {
  const baseColor = color1 || '#333333';

  const keyframes = useMemo(() => `
    @keyframes floatOrb {
      0% {
        transform: translateZ(0) translate(0, 0);
      }
      50% {
        transform: translateZ(0) translate(10vw, 8vh);
      }
      100% {
        transform: translateZ(0) translate(0, 0);
      }
    }
    @keyframes floatOrbReverse {
      0% {
        transform: translateZ(0) translate(0, 0);
      }
      50% {
        transform: translateZ(0) translate(-8vw, -6vh);
      }
      100% {
        transform: translateZ(0) translate(0, 0);
      }
    }
  `, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -50,
        overflow: 'hidden',
        backgroundColor: '#050505',
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      {/* Inject keyframes */}
      <style>{keyframes}</style>

      {/* Overlay de cristal — oscurece para contraste de texto */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.35)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      />

      {/* Orbe 1 — Arriba Izquierda */}
      <div
        style={{
          position: 'absolute',
          top: '-20%',
          left: '-10%',
          width: '85vw',
          height: '85vw',
          borderRadius: '50%',
          backgroundColor: baseColor,
          filter: 'blur(120px)',
          WebkitFilter: 'blur(120px)',
          opacity: 0.25,
          animation: 'floatOrb 25s ease-in-out infinite alternate',
          willChange: 'transform',
          pointerEvents: 'none',
        }}
      />

      {/* Orbe 2 — Abajo Derecha (mismo color, diferente posición) */}
      <div
        style={{
          position: 'absolute',
          bottom: '-20%',
          right: '-10%',
          width: '95vw',
          height: '95vw',
          borderRadius: '50%',
          backgroundColor: baseColor,
          filter: 'blur(140px)',
          WebkitFilter: 'blur(140px)',
          opacity: 0.20,
          animation: 'floatOrbReverse 30s ease-in-out infinite alternate',
          willChange: 'transform',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
