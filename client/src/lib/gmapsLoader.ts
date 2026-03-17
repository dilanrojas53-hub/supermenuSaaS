/**
 * gmapsLoader.ts — Módulo singleton para cargar Google Maps JS API
 *
 * IMPORTANTE: Google Maps solo puede cargarse UNA vez por página.
 * Si se carga con diferentes parámetros (libraries), lanza error.
 * Este módulo centraliza la carga con TODAS las librerías necesarias.
 *
 * Libraries incluidas: marker, places, geocoding, geometry, drawing
 */

const GMAPS_SCRIPT_ID = "gmaps-singleton-script";
const GMAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

// Singleton: una sola promesa para toda la app
let _loadPromise: Promise<void> | null = null;

export function loadGoogleMapsScript(): Promise<void> {
  // Ya cargado
  if (typeof window !== "undefined" && (window as any).google?.maps) {
    return Promise.resolve();
  }

  // Carga en progreso — reutilizar la misma promesa
  if (_loadPromise) {
    return _loadPromise;
  }

  // Script ya en DOM (ej: HMR, doble mount)
  if (document.getElementById(GMAPS_SCRIPT_ID)) {
    _loadPromise = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if ((window as any).google?.maps) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
    return _loadPromise;
  }

  if (!GMAPS_API_KEY) {
    console.error("[gmapsLoader] VITE_GOOGLE_MAPS_API_KEY no está configurada.");
    return Promise.reject(new Error("VITE_GOOGLE_MAPS_API_KEY no configurada"));
  }

  _loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = GMAPS_SCRIPT_ID;
    // Todas las librerías necesarias en un solo script
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry,drawing`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      _loadPromise = null;
      reject(new Error("Error cargando Google Maps script"));
    };
    // NUNCA llamar script.remove() — el script debe permanecer en el DOM
    document.head.appendChild(script);
  });

  return _loadPromise;
}
