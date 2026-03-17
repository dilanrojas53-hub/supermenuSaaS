/**
 * LiveTrackingMap.tsx — Fase 4 Delivery
 * Mapa Google Maps con tracking en tiempo real del rider para el admin.
 *
 * Features:
 * - Carga Google Maps JS API con la clave propia del proyecto
 * - Muestra marcador del restaurante (origen)
 * - Muestra marcador del cliente (destino)
 * - Muestra marcador del rider con actualización en tiempo real
 * - Dibuja ruta origen → rider → destino
 * - Suscripción Supabase Realtime a rider_profiles para posición del rider
 * - ETA dinámico recalculado cuando el rider actualiza su posición
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Navigation, Clock, MapPin, Bike, X } from 'lucide-react';
import { loadGoogleMapsScript } from '@/lib/gmapsLoader';


interface LiveTrackingMapProps {
  orderId: string;
  riderId: string;
  restaurantLat: number;
  restaurantLon: number;
  clientLat: number;
  clientLon: number;
  clientAddress: string;
  orderNumber: number;
  onClose: () => void;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function LiveTrackingMap({
  orderId,
  riderId,
  restaurantLat,
  restaurantLon,
  clientLat,
  clientLon,
  clientAddress,
  orderNumber,
  onClose,
}: LiveTrackingMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const riderMarkerRef = useRef<google.maps.Marker | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const [riderPos, setRiderPos] = useState<{ lat: number; lon: number } | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // ─── Cargar Google Maps ───────────────────────────────────────────────────
  useEffect(() => {
    loadGoogleMapsScript().then(() => setMapReady(true));
  }, []);

  // ─── Inicializar mapa ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: restaurantLat, lng: restaurantLon },
      zoom: 13,
      disableDefaultUI: true,
      zoomControl: true,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2d3748' }] },
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a202c' }] },
        { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#374151' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      ],
    });
    mapInstanceRef.current = map;

    // Marcador restaurante (origen)
    new google.maps.Marker({
      position: { lat: restaurantLat, lng: restaurantLon },
      map,
      title: 'Restaurante',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#F97316',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2,
      },
    });

    // Marcador cliente (destino)
    new google.maps.Marker({
      position: { lat: clientLat, lng: clientLon },
      map,
      title: clientAddress,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#22C55E',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2,
      },
    });

    // DirectionsRenderer para la ruta
    const renderer = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: '#3B82F6',
        strokeWeight: 4,
        strokeOpacity: 0.8,
      },
    });
    renderer.setMap(map);
    directionsRendererRef.current = renderer;

    // Ajustar bounds para mostrar ambos puntos
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: restaurantLat, lng: restaurantLon });
    bounds.extend({ lat: clientLat, lng: clientLon });
    map.fitBounds(bounds, 60);
  }, [mapReady, restaurantLat, restaurantLon, clientLat, clientLon, clientAddress]);

  // ─── Actualizar ruta cuando el rider se mueve ─────────────────────────────
  const updateRoute = useCallback((riderLat: number, riderLon: number) => {
    if (!mapInstanceRef.current || !directionsRendererRef.current) return;

    const directionsService = new google.maps.DirectionsService();
    directionsService.route({
      origin: { lat: riderLat, lng: riderLon },
      destination: { lat: clientLat, lng: clientLon },
      travelMode: google.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status === 'OK' && result) {
        directionsRendererRef.current!.setDirections(result);
        const leg = result.routes[0]?.legs[0];
        if (leg?.duration?.value) {
          setEta(Math.ceil(leg.duration.value / 60));
        }
      }
    });

    // Actualizar o crear marcador del rider
    if (!riderMarkerRef.current) {
      riderMarkerRef.current = new google.maps.Marker({
        position: { lat: riderLat, lng: riderLon },
        map: mapInstanceRef.current,
        title: 'Repartidor',
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="16" fill="#3B82F6" stroke="white" stroke-width="2"/>
              <text x="18" y="23" text-anchor="middle" font-size="18">🛵</text>
            </svg>
          `)}`,
          scaledSize: new google.maps.Size(36, 36),
          anchor: new google.maps.Point(18, 18),
        },
      });
    } else {
      riderMarkerRef.current.setPosition({ lat: riderLat, lng: riderLon });
    }
  }, [clientLat, clientLon]);

  // ─── Cargar posición inicial del rider ────────────────────────────────────
  useEffect(() => {
    supabase
      .from('rider_profiles')
      .select('current_lat, current_lon, last_location_at')
      .eq('id', riderId)
      .single()
      .then(({ data }) => {
        if (data?.current_lat && data?.current_lon) {
          setRiderPos({ lat: data.current_lat, lon: data.current_lon });
          setLastUpdate(data.last_location_at ? new Date(data.last_location_at) : null);
        }
      });
  }, [riderId]);

  // ─── Realtime: escuchar actualizaciones de posición del rider ─────────────
  useEffect(() => {
    const channel = supabase
      .channel(`rider-location-${riderId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rider_profiles',
        filter: `id=eq.${riderId}`,
      }, (payload) => {
        const { current_lat, current_lon, last_location_at } = payload.new as any;
        if (current_lat && current_lon) {
          setRiderPos({ lat: current_lat, lon: current_lon });
          setLastUpdate(last_location_at ? new Date(last_location_at) : new Date());
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [riderId]);

  // ─── Actualizar mapa cuando cambia la posición del rider ─────────────────
  useEffect(() => {
    if (riderPos && mapReady) {
      updateRoute(riderPos.lat, riderPos.lon);
    }
  }, [riderPos, mapReady, updateRoute]);

  const formatLastUpdate = (d: Date | null) => {
    if (!d) return 'Sin datos';
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return `hace ${diff}s`;
    return `hace ${Math.floor(diff / 60)}m`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Navigation size={16} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Tracking — Pedido #{orderNumber}</p>
              <p className="text-xs text-gray-400 truncate max-w-xs">{clientAddress}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-colors"
          >
            <X size={16} className="text-gray-300" />
          </button>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 px-4 py-2 bg-gray-850 border-b border-gray-700/50 bg-gray-800/50">
          <div className="flex items-center gap-1.5">
            <Clock size={13} className="text-purple-400" />
            <span className="text-xs text-gray-300">
              {eta !== null ? `ETA: ${eta} min` : 'Calculando…'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Bike size={13} className="text-blue-400" />
            <span className="text-xs text-gray-300">
              {riderPos ? `Actualizado ${formatLastUpdate(lastUpdate)}` : 'Sin posición del rider'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <div className={`w-2 h-2 rounded-full ${riderPos ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-xs text-gray-400">{riderPos ? 'En vivo' : 'Sin señal'}</span>
          </div>
        </div>

        {/* Mapa */}
        <div className="relative">
          <div ref={mapRef} className="w-full h-80" />
          {!mapReady && (
            <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-gray-400">Cargando mapa…</p>
              </div>
            </div>
          )}
          {!riderPos && mapReady && (
            <div className="absolute bottom-3 left-3 bg-yellow-500/90 text-black text-xs font-bold px-3 py-1.5 rounded-lg">
              ⚠️ Rider sin GPS activo
            </div>
          )}
        </div>

        {/* Leyenda */}
        <div className="flex items-center gap-4 px-4 py-2.5 bg-gray-800/50 border-t border-gray-700/50">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-[11px] text-gray-400">Restaurante</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-[11px] text-gray-400">Rider</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-[11px] text-gray-400">Cliente</span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <MapPin size={11} className="text-gray-500" />
            <span className="text-[11px] text-gray-500 truncate max-w-[180px]">{clientAddress}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
