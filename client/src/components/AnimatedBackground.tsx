/**
 * AnimatedBackground — GPU-Accelerated Premium VFX.
 *
 * Bulletproof approach:
 *   - Dark base (#0a0a0a) ensures orbes are always visible
 *   - mix-blend-mode: screen makes orbes glow against dark background
 *   - blur(100px) — reduced from 120px to prevent total transparency
 *   - ALL critical styles are inline (no Tailwind purging risk)
 *   - transform: translateZ(0) forces GPU acceleration
 *   - pointer-events: none on EVERY element
 *
 * Fallback colors: Magenta (#ff0055), Cyan (#00e5ff), Orange (#ffaa00)
 * These are overridden by restaurant theme colors when available.
 */
import { memo } from 'react';
import type { ThemeAnimation } from '@/lib/types';

interface AnimatedBackgroundProps {
  animation: ThemeAnimation | null | undefined;
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
}

function AnimatedBackground({
  animation,
  primaryColor,
  secondaryColor,
}: AnimatedBackgroundProps) {
  // Resolve colors: use animation config → props → super-bright fallbacks
  const color1 = animation?.color1 || primaryColor || '#ff0055';
  const color2 = animation?.color2 || secondaryColor || '#00e5ff';
  // Third color: blend of the two or bright orange fallback
  const color3 = primaryColor ? mixColors(color1, color2) : '#ffaa00';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: -10,
        backgroundColor: '#0a0a0a',
      }}
      aria-hidden="true"
    >
      {/* Orbe 1: Magenta/Primary — top-left, drifts right-down */}
      <div
        style={{
          position: 'absolute',
          width: '60vw',
          height: '60vw',
          borderRadius: '50%',
          backgroundColor: color1,
          filter: 'blur(100px)',
          WebkitFilter: 'blur(100px)',
          opacity: 0.5,
          mixBlendMode: 'screen',
          transform: 'translateZ(0)',
          willChange: 'transform',
          top: '-10%',
          left: '-10%',
          animation: 'orbe1Move 20s ease-in-out infinite alternate',
          pointerEvents: 'none',
        }}
      />

      {/* Orbe 2: Cyan/Secondary — bottom-right, drifts left-up */}
      <div
        style={{
          position: 'absolute',
          width: '60vw',
          height: '60vw',
          borderRadius: '50%',
          backgroundColor: color2,
          filter: 'blur(100px)',
          WebkitFilter: 'blur(100px)',
          opacity: 0.5,
          mixBlendMode: 'screen',
          transform: 'translateZ(0)',
          willChange: 'transform',
          bottom: '-10%',
          right: '-10%',
          animation: 'orbe2Move 25s ease-in-out infinite alternate-reverse',
          pointerEvents: 'none',
        }}
      />

      {/* Orbe 3: Orange/Mix — center, breathes with scale */}
      <div
        style={{
          position: 'absolute',
          width: '60vw',
          height: '60vw',
          borderRadius: '50%',
          backgroundColor: color3,
          filter: 'blur(100px)',
          WebkitFilter: 'blur(100px)',
          opacity: 0.5,
          mixBlendMode: 'screen',
          transform: 'translateZ(0)',
          willChange: 'transform',
          top: '20%',
          left: '20%',
          animation: 'orbe3Breathe 22s ease-in-out infinite alternate',
          pointerEvents: 'none',
        }}
      />

      {/* Overlay — darkens + slight blur for text legibility */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.40)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      />

      {/* Keyframes — inline <style> to avoid any purging */}
      <style>{`
        @keyframes orbe1Move {
          0% {
            transform: translateZ(0) translate(0, 0) scale(1);
          }
          50% {
            transform: translateZ(0) translate(20vw, 15vh) scale(1.1);
          }
          100% {
            transform: translateZ(0) translate(10vw, 25vh) scale(1.05);
          }
        }
        @keyframes orbe2Move {
          0% {
            transform: translateZ(0) translate(0, 0) scale(1);
          }
          50% {
            transform: translateZ(0) translate(-15vw, -20vh) scale(1.1);
          }
          100% {
            transform: translateZ(0) translate(-8vw, -30vh) scale(0.95);
          }
        }
        @keyframes orbe3Breathe {
          0% {
            transform: translateZ(0) translate(0, 0) scale(1);
          }
          50% {
            transform: translateZ(0) translate(-5vw, 5vh) scale(1.3);
          }
          100% {
            transform: translateZ(0) translate(3vw, -3vh) scale(1.1);
          }
        }
      `}</style>
    </div>
  );
}

/** Simple color mixer — averages two hex colors for the third orbe */
function mixColors(hex1: string, hex2: string): string {
  try {
    const c1 = hex1.replace('#', '');
    const c2 = hex2.replace('#', '');
    if (c1.length < 6 || c2.length < 6) return '#ffaa00';
    const r = Math.round((parseInt(c1.substring(0, 2), 16) + parseInt(c2.substring(0, 2), 16)) / 2);
    const g = Math.round((parseInt(c1.substring(2, 4), 16) + parseInt(c2.substring(2, 4), 16)) / 2);
    const b = Math.round((parseInt(c1.substring(4, 6), 16) + parseInt(c2.substring(4, 6), 16)) / 2);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch {
    return '#ffaa00';
  }
}

export default memo(AnimatedBackground);
