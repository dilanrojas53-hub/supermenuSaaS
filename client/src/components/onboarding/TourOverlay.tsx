/**
 * TourOverlay.tsx
 * Overlay del tour: resalta el elemento target, oscurece el fondo,
 * y posiciona el TourStepCard cerca del elemento destacado.
 * Funciona en mobile y desktop. Se adapta al cambio de tamaño.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useOnboarding } from '@/lib/onboarding';
import TourStepCard from './TourStepCard';

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8; // px de padding alrededor del elemento resaltado

export default function TourOverlay() {
  const {
    isTourActive,
    activeSteps,
    currentStepIndex,
    nextStep,
    prevStep,
    closeTour,
    skipTour,
  } = useOnboarding();

  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null);
  const rafRef = useRef<number | null>(null);

  const currentStep = activeSteps[currentStepIndex];

  const updateHighlight = useCallback(() => {
    if (!currentStep?.target) {
      setHighlightRect(null);
      return;
    }

    // Buscar por data-help-anchor o selector CSS
    let el: Element | null = null;
    if (currentStep.target.startsWith('[')) {
      el = document.querySelector(currentStep.target);
    } else {
      el = document.querySelector(`[data-help-anchor="${currentStep.target}"]`)
        ?? document.querySelector(currentStep.target);
    }

    if (!el) {
      setHighlightRect(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    setHighlightRect({
      top: rect.top - PADDING,
      left: rect.left - PADDING,
      width: rect.width + PADDING * 2,
      height: rect.height + PADDING * 2,
    });
  }, [currentStep]);

  // Update highlight on step change and window resize
  useEffect(() => {
    if (!isTourActive) return;

    updateHighlight();

    const handleResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateHighlight);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isTourActive, updateHighlight]);

  if (!isTourActive || !currentStep) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  return (
    <div
      className="fixed inset-0 z-[9000] pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Guía: ${currentStep.title}`}
    >
      {/* ── Backdrop con hole ── */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-auto"
        onClick={closeTour}
        style={{ cursor: 'default' }}
      >
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {highlightRect && (
              <rect
                x={highlightRect.left}
                y={highlightRect.top}
                width={highlightRect.width}
                height={highlightRect.height}
                rx={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#tour-mask)"
        />
      </svg>

      {/* ── Highlight border glow ── */}
      {highlightRect && (
        <div
          className="absolute rounded-xl pointer-events-none"
          style={{
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
            boxShadow: '0 0 0 2px rgba(245,158,11,0.8), 0 0 20px rgba(245,158,11,0.3)',
            border: '2px solid rgba(245,158,11,0.6)',
            transition: 'all 0.25s ease',
          }}
        />
      )}

      {/* ── Step card ── */}
      <div className="absolute pointer-events-auto" style={computeCardPosition(highlightRect, currentStep.placement, vw, vh)}>
        <TourStepCard
          step={currentStep}
          stepIndex={currentStepIndex}
          totalSteps={activeSteps.length}
          onNext={nextStep}
          onPrev={prevStep}
          onClose={closeTour}
          onSkip={skipTour}
        />
      </div>
    </div>
  );
}

// ─── Position calculator ──────────────────────────────────────────────────────

const CARD_W = 320;
const CARD_H = 200; // estimate
const GAP = 16;

function computeCardPosition(
  rect: HighlightRect | null,
  placement: string | undefined,
  vw: number,
  vh: number
): React.CSSProperties {
  // No target or center → center of screen
  if (!rect || placement === 'center' || !placement) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  let top: number;
  let left: number;

  switch (placement) {
    case 'bottom':
      top = rect.top + rect.height + GAP;
      left = rect.left + rect.width / 2 - CARD_W / 2;
      break;
    case 'top':
      top = rect.top - CARD_H - GAP;
      left = rect.left + rect.width / 2 - CARD_W / 2;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - CARD_H / 2;
      left = rect.left + rect.width + GAP;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - CARD_H / 2;
      left = rect.left - CARD_W - GAP;
      break;
    default:
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  // Clamp to viewport
  left = Math.max(12, Math.min(left, vw - CARD_W - 12));
  top = Math.max(12, Math.min(top, vh - CARD_H - 12));

  // On mobile, always center horizontally
  if (vw < 640) {
    left = Math.max(12, (vw - CARD_W) / 2);
  }

  return { top, left };
}
