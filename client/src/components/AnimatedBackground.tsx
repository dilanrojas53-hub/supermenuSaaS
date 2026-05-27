/**
 * AnimatedBackground — lightweight global ambient background.
 *
 * Performance note:
 * This component is mounted globally, including admin, menu, staff and kitchen.
 * The previous version animated two huge blurred orbs every frame, which could make
 * desktop scrolling and admin interactions feel janky. This version keeps the same
 * premium dark ambience without continuous GPU-heavy blur animation.
 */
interface Props {
  color1?: string;
}

export default function AnimatedBackground({ color1 }: Props) {
  const baseColor = color1 || '#1a1a1a';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -50,
        overflow: 'hidden',
        backgroundColor: '#0a0a0a',
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      <div
        style={{
          position: 'absolute',
          top: '-26%',
          left: '-18%',
          width: '58vw',
          height: '58vw',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${baseColor} 0%, transparent 68%)`,
          opacity: 0.08,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-28%',
          right: '-18%',
          width: '62vw',
          height: '62vw',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${baseColor} 0%, transparent 68%)`,
          opacity: 0.05,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
