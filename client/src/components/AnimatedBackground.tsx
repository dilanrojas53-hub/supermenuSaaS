import React from 'react';

export default function AnimatedBackground() {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: -50, overflow: 'hidden', backgroundColor: '#050505', pointerEvents: 'none' }}>
      {/* Cristal oscuro */}
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 10, backdropFilter: 'blur(30px)' }}></div>

      {/* Orbe Magenta */}
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', backgroundColor: '#ff0055', filter: 'blur(90px)', opacity: 0.6, mixBlendMode: 'screen' as const, transition: 'transform 20s ease-in-out', transform: 'translate(20vw, 20vh)' }}></div>
      
      {/* Orbe Cyan */}
      <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '70vw', height: '70vw', borderRadius: '50%', backgroundColor: '#00e5ff', filter: 'blur(100px)', opacity: 0.5, mixBlendMode: 'screen' as const, transition: 'transform 25s ease-in-out', transform: 'translate(-20vw, -20vh)' }}></div>
    </div>
  );
}
