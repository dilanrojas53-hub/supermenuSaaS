/**
 * AnimatedBackground — Premium VFX layer.
 *
 * CRITICAL: Every single element has pointer-events:none to prevent click blocking.
 *
 * Two modes:
 *   'mesh'     → "Ambient Mesh Blur": 4 giant orbes with blur(120px), slow organic float.
 *   'bokeh'    → "Premium Bokeh": 15–20 soft glowing circles drifting upward.
 *   'particles'→ Falls back to mesh.
 *
 * Architecture:
 *   Fixed full-viewport container (z-index: -10) + contrast overlay.
 *   ALL layers have pointer-events: none — strictly visual, zero DOM interference.
 *
 * Fallback: If theme_animation is null/undefined, renders a subtle default based on primaryColor.
 */
import { memo, useMemo } from 'react';
import type { ThemeAnimation } from '@/lib/types';

interface AnimatedBackgroundProps {
  animation: ThemeAnimation | null | undefined;
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
}

// ─── Helpers ───

function hexToRgba(hex: string | undefined | null, alpha: number): string {
  if (!hex) return `rgba(0, 0, 0, ${alpha})`;
  const c = hex.replace('#', '');
  if (c.length < 6) return `rgba(0, 0, 0, ${alpha})`;
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lighten(hex: string | undefined | null, factor: number): string {
  if (!hex) return '#666666';
  const c = hex.replace('#', '');
  if (c.length < 6) return '#666666';
  const r = Math.min(255, Math.round(parseInt(c.substring(0, 2), 16) + (255 - parseInt(c.substring(0, 2), 16)) * factor));
  const g = Math.min(255, Math.round(parseInt(c.substring(2, 4), 16) + (255 - parseInt(c.substring(2, 4), 16)) * factor));
  const b = Math.min(255, Math.round(parseInt(c.substring(4, 6), 16) + (255 - parseInt(c.substring(4, 6), 16)) * factor));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Shared style applied to every visual element — prevents click interception */
const NO_POINTER: React.CSSProperties = { pointerEvents: 'none' };

// ─── Ambient Mesh Blur ───

function AmbientMeshBlur({ color1, color2, intensity }: { color1: string; color2: string; intensity: number }) {
  const c1Light = lighten(color1, 0.3);
  const c2Light = lighten(color2, 0.3);
  const opacity = 0.3 + intensity * 0.3;

  return (
    <>
      {/* Orbe 1: Top-left → center */}
      <div
        style={{
          ...NO_POINTER,
          position: 'absolute',
          width: '55vw',
          height: '55vw',
          borderRadius: '50%',
          background: hexToRgba(color1, opacity),
          filter: 'blur(120px)',
          WebkitFilter: 'blur(120px)',
          top: '-10%',
          left: '-15%',
          animation: 'orbe1Float 20s ease-in-out infinite alternate',
          willChange: 'transform',
        }}
      />
      {/* Orbe 2: Bottom-right → upward */}
      <div
        style={{
          ...NO_POINTER,
          position: 'absolute',
          width: '50vw',
          height: '50vw',
          borderRadius: '50%',
          background: hexToRgba(color2, opacity),
          filter: 'blur(120px)',
          WebkitFilter: 'blur(120px)',
          bottom: '-15%',
          right: '-10%',
          animation: 'orbe2Float 25s ease-in-out infinite alternate-reverse',
          willChange: 'transform',
        }}
      />
      {/* Orbe 3: Center, breathes */}
      <div
        style={{
          ...NO_POINTER,
          position: 'absolute',
          width: '45vw',
          height: '45vw',
          borderRadius: '50%',
          background: hexToRgba(c1Light, opacity * 0.7),
          filter: 'blur(120px)',
          WebkitFilter: 'blur(120px)',
          top: '30%',
          left: '25%',
          animation: 'orbe3Breathe 22s ease-in-out infinite alternate',
          willChange: 'transform',
        }}
      />
      {/* Orbe 4: Top-right accent */}
      <div
        style={{
          ...NO_POINTER,
          position: 'absolute',
          width: '40vw',
          height: '40vw',
          borderRadius: '50%',
          background: hexToRgba(c2Light, opacity * 0.5),
          filter: 'blur(120px)',
          WebkitFilter: 'blur(120px)',
          top: '5%',
          right: '10%',
          animation: 'orbe4Drift 28s ease-in-out infinite alternate',
          willChange: 'transform',
        }}
      />

      <style>{`
        @keyframes orbe1Float {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(15vw, 12vh) scale(1.15); }
          100% { transform: translate(8vw, 20vh) scale(1.05); }
        }
        @keyframes orbe2Float {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(-12vw, -18vh) scale(1.1); }
          100% { transform: translate(-6vw, -25vh) scale(0.95); }
        }
        @keyframes orbe3Breathe {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(-5vw, 5vh) scale(1.4); }
          100% { transform: translate(3vw, -3vh) scale(1.1); }
        }
        @keyframes orbe4Drift {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(-10vw, 8vh) scale(1.2); }
          100% { transform: translate(-5vw, 15vh) scale(1.05); }
        }
      `}</style>
    </>
  );
}

// ─── Premium Bokeh ───

function PremiumBokeh({ color1, color2, intensity }: { color1: string; color2: string; intensity: number }) {
  const count = Math.floor(12 + intensity * 8);

  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const useColor1 = i % 3 !== 0;
      const size = 4 + Math.random() * 12;
      const left = Math.random() * 100;
      const duration = 12 + Math.random() * 18;
      const delay = Math.random() * -30;
      const blur = 1 + Math.random() * 3;

      return { useColor1, size, left, duration, delay, blur, key: i };
    });
  }, [count, intensity]);

  return (
    <>
      {particles.map(p => (
        <div
          key={p.key}
          style={{
            ...NO_POINTER,
            position: 'absolute',
            width: `${p.size}px`,
            height: `${p.size}px`,
            borderRadius: '50%',
            background: p.useColor1 ? color1 : color2,
            filter: `blur(${p.blur}px)`,
            opacity: 0,
            left: `${p.left}%`,
            bottom: `-${p.size}px`,
            animation: `bokehRise${p.key % 4} ${p.duration}s ease-in-out ${p.delay}s infinite`,
            willChange: 'transform, opacity',
          }}
        />
      ))}

      <style>{`
        @keyframes bokehRise0 {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          10%  { opacity: ${0.15 + intensity * 0.3}; }
          70%  { opacity: ${0.1 + intensity * 0.2}; }
          100% { transform: translateY(-110vh) translateX(8vw); opacity: 0; }
        }
        @keyframes bokehRise1 {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          15%  { opacity: ${0.2 + intensity * 0.25}; }
          65%  { opacity: ${0.1 + intensity * 0.15}; }
          100% { transform: translateY(-115vh) translateX(-6vw); opacity: 0; }
        }
        @keyframes bokehRise2 {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          12%  { opacity: ${0.15 + intensity * 0.2}; }
          75%  { opacity: ${0.08 + intensity * 0.15}; }
          100% { transform: translateY(-105vh) translateX(10vw); opacity: 0; }
        }
        @keyframes bokehRise3 {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          8%   { opacity: ${0.18 + intensity * 0.22}; }
          80%  { opacity: ${0.05 + intensity * 0.1}; }
          100% { transform: translateY(-120vh) translateX(-5vw); opacity: 0; }
        }
      `}</style>
    </>
  );
}

// ─── Main Component ───

function AnimatedBackground({
  animation,
  primaryColor = '#F59E0B',
  secondaryColor,
  backgroundColor = '#000000',
}: AnimatedBackgroundProps) {
  // SAFE FALLBACK: If animation is null/undefined, build a subtle default from primaryColor
  const config = animation && animation.type && animation.color1
    ? animation
    : {
        type: 'mesh' as const,
        color1: primaryColor || '#F59E0B',
        color2: secondaryColor || lighten(primaryColor, 0.35),
        speed: 'slow' as const,
        intensity: 0.5,
      };

  // 'particles' falls back to 'mesh'
  const effectiveType = config.type === 'particles' ? 'mesh' : config.type;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -10,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      {/* Animation layer — all children also have pointer-events: none */}
      {effectiveType === 'mesh' && (
        <AmbientMeshBlur
          color1={config.color1}
          color2={config.color2}
          intensity={config.intensity}
        />
      )}
      {effectiveType === 'bokeh' && (
        <PremiumBokeh
          color1={config.color1}
          color2={config.color2}
          intensity={config.intensity}
        />
      )}

      {/* Contrast overlay — pointer-events: none is critical here */}
      <div
        style={{
          ...NO_POINTER,
          position: 'absolute',
          inset: 0,
          background: hexToRgba(backgroundColor, 0.75),
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      />
    </div>
  );
}

export default memo(AnimatedBackground);
