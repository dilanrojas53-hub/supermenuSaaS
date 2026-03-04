/**
 * AnimatedBackground — "Subtle Aura" Premium Ambient Light.
 *
 * V4.0 PREMIUM REDESIGN:
 *   - Fondo base: #0a0a0a (negro profundo, estilo Uber Eats / Toast)
 *   - Orbes con opacidad máxima 0.07 (ambient hint, NO neón)
 *   - Blur extremo: 160-180px para difusión total
 *   - Sin overlay de cristal (ya no es necesario con opacidades tan bajas)
 *   - El color de marca solo da un "tinte" casi imperceptible al fondo
 *   - Las fotos de los platillos son las protagonistas
 */
import React, { useMemo } from 'react';

interface Props {
  color1?: string;
}

export default function AnimatedBackground({ color1 }: Props) {
  const baseColor = color1 || '#1a1a1a';

  const keyframes = useMemo(() => `
    @keyframes floatOrb {
      0%   { transform: translateZ(0) translate(0, 0); }
      50%  { transform: translateZ(0) translate(8vw, 6vh); }
      100% { transform: translateZ(0) translate(0, 0); }
    }
    @keyframes floatOrbReverse {
      0%   { transform: translateZ(0) translate(0, 0); }
      50%  { transform: translateZ(0) translate(-6vw, -5vh); }
      100% { transform: translateZ(0) translate(0, 0); }
    }
  `, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -50,
        overflow: 'hidden',
        // V4.0: fondo sólido premium — negro profundo estilo Uber Eats
        backgroundColor: '#0a0a0a',
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      {/* Inject keyframes */}
      <style>{keyframes}</style>

      {/* Orbe 1 — tinte de marca ultra-sutil, arriba izquierda */}
      <div
        style={{
          position: 'absolute',
          top: '-30%',
          left: '-15%',
          width: '80vw',
          height: '80vw',
          borderRadius: '50%',
          backgroundColor: baseColor,
          filter: 'blur(160px)',
          WebkitFilter: 'blur(160px)',
          // V4.0: opacidad reducida de 0.25 → 0.07 (ambient hint solamente)
          opacity: 0.07,
          animation: 'floatOrb 30s ease-in-out infinite alternate',
          willChange: 'transform',
          pointerEvents: 'none',
        }}
      />

      {/* Orbe 2 — tinte de marca ultra-sutil, abajo derecha */}
      <div
        style={{
          position: 'absolute',
          bottom: '-30%',
          right: '-15%',
          width: '90vw',
          height: '90vw',
          borderRadius: '50%',
          backgroundColor: baseColor,
          filter: 'blur(180px)',
          WebkitFilter: 'blur(180px)',
          // V4.0: opacidad reducida de 0.20 → 0.05
          opacity: 0.05,
          animation: 'floatOrbReverse 35s ease-in-out infinite alternate',
          willChange: 'transform',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
