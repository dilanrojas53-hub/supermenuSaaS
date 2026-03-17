/**
 * GOOGLE MAPS FRONTEND INTEGRATION
 *
 * Usa VITE_GOOGLE_MAPS_API_KEY (configurada en Vercel).
 * Patrón singleton: el script se carga UNA sola vez y nunca se elimina del DOM.
 *
 * USAGE FROM PARENT COMPONENT:
 * ======
 *
 * const mapRef = useRef<google.maps.Map | null>(null);
 *
 * <MapView
 *   initialCenter={{ lat: 9.9281, lng: -84.0907 }}
 *   initialZoom={12}
 *   onMapReady={(map) => {
 *     mapRef.current = map;
 *   }}
 * />
 *
 * ======
 * Available Libraries: marker, places, geocoding, geometry, drawing
 */
/// <reference types="@types/google.maps" />
import React, { useEffect, useRef } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
  }
}

const GMAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
const GMAPS_SCRIPT_ID = "gmaps-singleton-script";

// Singleton: una sola promesa de carga para toda la app
let _loadPromise: Promise<void> | null = null;

function loadMapScript(): Promise<void> {
  // Ya cargado
  if (window.google?.maps) {
    return Promise.resolve();
  }
  // Carga en progreso — reutilizar la misma promesa
  if (_loadPromise) {
    return _loadPromise;
  }
  // Script ya en DOM (ej: recarga de módulo en HMR)
  if (document.getElementById(GMAPS_SCRIPT_ID)) {
    _loadPromise = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (window.google?.maps) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
    return _loadPromise;
  }

  if (!GMAPS_API_KEY) {
    console.error("[MapView] VITE_GOOGLE_MAPS_API_KEY no está configurada.");
    return Promise.reject(new Error("VITE_GOOGLE_MAPS_API_KEY no configurada"));
  }

  _loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = GMAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry,drawing`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      _loadPromise = null;
      reject(new Error("Error cargando Google Maps script"));
    };
    // IMPORTANTE: NO llamar script.remove() — el script debe permanecer en el DOM
    // para que Google Maps pueda cargar tiles y sub-recursos correctamente
    document.head.appendChild(script);
  });

  return _loadPromise;
}

interface MapViewProps {
  className?: string;
  style?: React.CSSProperties;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
}

export function MapView({
  className,
  style,
  initialCenter = { lat: 9.9281, lng: -84.0907 },
  initialZoom = 12,
  onMapReady,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);

  const init = usePersistFn(async () => {
    try {
      await loadMapScript();
    } catch (err) {
      console.error("[MapView] Error cargando Google Maps:", err);
      return;
    }

    if (!mapContainer.current) {
      console.error("[MapView] Contenedor no encontrado");
      return;
    }

    // Evitar doble inicialización
    if (map.current) return;

    map.current = new window.google!.maps.Map(mapContainer.current, {
      zoom: initialZoom,
      center: initialCenter,
      mapTypeControl: true,
      fullscreenControl: true,
      zoomControl: true,
      streetViewControl: false,
      mapId: "DEMO_MAP_ID",
    });

    if (onMapReady) {
      onMapReady(map.current);
    }
  });

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div
      ref={mapContainer}
      className={cn("w-full", className)}
      style={{ height: "280px", ...style }}
    />
  );
}
