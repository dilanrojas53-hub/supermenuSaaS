/**
 * AnimatedBackground — Immersive animated backgrounds for restaurant menus.
 * Modes: 'bokeh' (floating blurred circles), 'mesh' (animated gradient), 'particles' (constellation network).
 * Pure CSS + Canvas. No external libraries. Battery-friendly with requestAnimationFrame throttling.
 */
import { useRef, useEffect, useCallback, memo } from 'react';
import type { ThemeAnimation, AnimationSpeed } from '@/lib/types';

interface AnimatedBackgroundProps {
  animation: ThemeAnimation | null;
  /** Fallback primary color if no animation config */
  primaryColor?: string;
  /** Render mode: 'hero' = full intensity for hero section, 'page' = subtle background */
  mode?: 'hero' | 'page';
  className?: string;
}

// Speed → duration mapping (ms per animation cycle)
const SPEED_MAP: Record<AnimationSpeed, number> = {
  slow: 40000,
  medium: 25000,
  fast: 15000,
};

// Hex to RGB helper
function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [
    parseInt(c.substring(0, 2), 16) || 0,
    parseInt(c.substring(2, 4), 16) || 0,
    parseInt(c.substring(4, 6), 16) || 0,
  ];
}

// Lighten a hex color by a factor (0–1)
function lightenHex(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  const lr = Math.round(r + (255 - r) * factor);
  const lg = Math.round(g + (255 - g) * factor);
  const lb = Math.round(b + (255 - b) * factor);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

// ─── BOKEH ───
function BokehCanvas({ color1, color2, speed, intensity, mode }: {
  color1: string; color2: string; speed: AnimationSpeed; intensity: number; mode: 'hero' | 'page';
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * (window.devicePixelRatio > 1 ? 1.5 : 1);
      canvas.height = canvas.offsetHeight * (window.devicePixelRatio > 1 ? 1.5 : 1);
    };
    resize();
    window.addEventListener('resize', resize);

    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    const particleCount = Math.floor((mode === 'hero' ? 14 : 8) * intensity);
    const speedFactor = SPEED_MAP[speed] / 30000;

    // Generate particles
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random(),
      y: Math.random(),
      radius: 20 + Math.random() * 60,
      vx: (Math.random() - 0.5) * 0.0003 / speedFactor,
      vy: -(0.0001 + Math.random() * 0.0003) / speedFactor,
      color: Math.random() > 0.5 ? rgb1 : rgb2,
      alpha: 0.08 + Math.random() * 0.15 * intensity,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: 0.005 + Math.random() * 0.01,
    }));

    let lastTime = 0;
    const FPS = 30;
    const interval = 1000 / FPS;

    const animate = (time: number) => {
      animRef.current = requestAnimationFrame(animate);
      const delta = time - lastTime;
      if (delta < interval) return;
      lastTime = time - (delta % interval);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;

        // Wrap around
        if (p.y < -0.1) { p.y = 1.1; p.x = Math.random(); }
        if (p.x < -0.1) p.x = 1.1;
        if (p.x > 1.1) p.x = -0.1;

        const cx = p.x * canvas.width;
        const cy = p.y * canvas.height;
        const r = p.radius * (1 + Math.sin(p.pulse) * 0.2);
        const a = p.alpha * (0.8 + Math.sin(p.pulse) * 0.2);

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, ${a})`);
        grad.addColorStop(1, `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, 0)`);

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [color1, color2, speed, intensity, mode]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none' }}
    />
  );
}

// ─── MESH GRADIENT ───
function MeshGradient({ color1, color2, speed, intensity, mode }: {
  color1: string; color2: string; speed: AnimationSpeed; intensity: number; mode: 'hero' | 'page';
}) {
  const duration = SPEED_MAP[speed];
  const opacity = mode === 'hero' ? Math.min(intensity * 0.8, 0.7) : Math.min(intensity * 0.4, 0.3);
  const c1Light = lightenHex(color1, 0.3);
  const c2Light = lightenHex(color2, 0.3);

  return (
    <div className="absolute inset-0" style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {/* Layer 1: rotating gradient blob */}
      <div
        className="absolute"
        style={{
          width: '140%',
          height: '140%',
          top: '-20%',
          left: '-20%',
          background: `
            radial-gradient(ellipse at 20% 50%, ${color1}${Math.round(opacity * 255).toString(16).padStart(2, '0')} 0%, transparent 50%),
            radial-gradient(ellipse at 80% 20%, ${color2}${Math.round(opacity * 255).toString(16).padStart(2, '0')} 0%, transparent 50%),
            radial-gradient(ellipse at 60% 80%, ${c1Light}${Math.round(opacity * 200).toString(16).padStart(2, '0')} 0%, transparent 50%),
            radial-gradient(ellipse at 30% 80%, ${c2Light}${Math.round(opacity * 180).toString(16).padStart(2, '0')} 0%, transparent 50%)
          `,
          animation: `meshRotate ${duration}ms ease-in-out infinite alternate`,
        }}
      />
      {/* Layer 2: counter-rotating blob */}
      <div
        className="absolute"
        style={{
          width: '120%',
          height: '120%',
          top: '-10%',
          left: '-10%',
          background: `
            radial-gradient(ellipse at 70% 30%, ${color1}${Math.round(opacity * 180).toString(16).padStart(2, '0')} 0%, transparent 45%),
            radial-gradient(ellipse at 30% 70%, ${color2}${Math.round(opacity * 160).toString(16).padStart(2, '0')} 0%, transparent 45%)
          `,
          animation: `meshRotateReverse ${duration * 1.3}ms ease-in-out infinite alternate`,
        }}
      />
      <style>{`
        @keyframes meshRotate {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.1); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes meshRotateReverse {
          0% { transform: rotate(0deg) scale(1.05); }
          50% { transform: rotate(-180deg) scale(0.95); }
          100% { transform: rotate(-360deg) scale(1.05); }
        }
      `}</style>
    </div>
  );
}

// ─── PARTICLES (Constellation) ───
function ParticlesCanvas({ color1, color2, speed, intensity, mode }: {
  color1: string; color2: string; speed: AnimationSpeed; intensity: number; mode: 'hero' | 'page';
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * (window.devicePixelRatio > 1 ? 1.5 : 1);
      canvas.height = canvas.offsetHeight * (window.devicePixelRatio > 1 ? 1.5 : 1);
    };
    resize();
    window.addEventListener('resize', resize);

    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    const particleCount = Math.floor((mode === 'hero' ? 40 : 25) * intensity);
    const connectionDistance = mode === 'hero' ? 120 : 100;
    const speedFactor = SPEED_MAP[speed] / 30000;

    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0004 / speedFactor,
      vy: (Math.random() - 0.5) * 0.0004 / speedFactor,
      radius: 1.5 + Math.random() * 2,
      color: Math.random() > 0.5 ? rgb1 : rgb2,
    }));

    let lastTime = 0;
    const FPS = 30;
    const interval = 1000 / FPS;

    const animate = (time: number) => {
      animRef.current = requestAnimationFrame(animate);
      const delta = time - lastTime;
      if (delta < interval) return;
      lastTime = time - (delta % interval);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update positions
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
        p.x = Math.max(0, Math.min(1, p.x));
        p.y = Math.max(0, Math.min(1, p.y));
      }

      const lineAlpha = 0.08 * intensity;
      const dotAlpha = 0.3 * intensity;

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = (particles[i].x - particles[j].x) * canvas.width;
          const dy = (particles[i].y - particles[j].y) * canvas.height;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDistance) {
            const alpha = lineAlpha * (1 - dist / connectionDistance);
            const c = particles[i].color;
            ctx.strokeStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(particles[i].x * canvas.width, particles[i].y * canvas.height);
            ctx.lineTo(particles[j].x * canvas.width, particles[j].y * canvas.height);
            ctx.stroke();
          }
        }
      }

      // Draw dots
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, ${dotAlpha})`;
        ctx.fill();
      }
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [color1, color2, speed, intensity, mode]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none' }}
    />
  );
}

// ─── MAIN COMPONENT ───
function AnimatedBackground({ animation, primaryColor = '#F59E0B', mode = 'hero', className = '' }: AnimatedBackgroundProps) {
  // Build effective config: use provided animation or generate a subtle default from primaryColor
  const config = animation || {
    type: 'mesh' as const,
    color1: primaryColor,
    color2: lightenHex(primaryColor, 0.4),
    speed: 'slow' as const,
    intensity: mode === 'hero' ? 0.4 : 0.2,
  };

  const effectiveIntensity = mode === 'page' ? config.intensity * 0.4 : config.intensity;

  return (
    <div
      className={`absolute inset-0 overflow-hidden ${className}`}
      style={{ pointerEvents: 'none', zIndex: 0 }}
      aria-hidden="true"
    >
      {config.type === 'bokeh' && (
        <BokehCanvas
          color1={config.color1}
          color2={config.color2}
          speed={config.speed}
          intensity={effectiveIntensity}
          mode={mode}
        />
      )}
      {config.type === 'mesh' && (
        <MeshGradient
          color1={config.color1}
          color2={config.color2}
          speed={config.speed}
          intensity={effectiveIntensity}
          mode={mode}
        />
      )}
      {config.type === 'particles' && (
        <ParticlesCanvas
          color1={config.color1}
          color2={config.color2}
          speed={config.speed}
          intensity={effectiveIntensity}
          mode={mode}
        />
      )}
    </div>
  );
}

export default memo(AnimatedBackground);
