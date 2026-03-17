/**
 * Map.tsx — MapView component
 *
 * Usa el módulo compartido gmapsLoader.ts para cargar Google Maps.
 * Esto evita el conflicto de doble carga con LiveTrackingMap.tsx.
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
 */
/// <reference types="@types/google.maps" />
import React, { useEffect, useRef } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";
import { loadGoogleMapsScript } from "@/lib/gmapsLoader";

declare global {
  interface Window {
    google?: typeof google;
  }
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
      await loadGoogleMapsScript();
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
