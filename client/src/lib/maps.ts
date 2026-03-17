/**
 * maps.ts — Google Maps API wrapper para SmartMenu Delivery
 * Fase 1: Geocodificación, cálculo de distancia (Haversine), ETA
 *
 * Usa la Google Maps Geocoding API con la clave propia del proyecto.
 * No depende de proxies externos.
 */

const GMAPS_API_KEY: string =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) ||
  'AIzaSyCH8uwXit1G0LqobY-BOPKEwnaHV-qXkss';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface GeocodedAddress {
  formattedAddress: string;
  lat: number;
  lon: number;
  placeId: string;
}

export interface CoverageResult {
  isWithinCoverage: boolean;
  distanceKm: number;
  etaMinutes: number;
}

// ─── Geocodificación ──────────────────────────────────────────────────────────

/**
 * Geocodifica una dirección de texto usando Google Maps Geocoding API.
 * Retorna null si no se puede geocodificar.
 */
export async function geocodeAddress(address: string): Promise<GeocodedAddress | null> {
  if (!address.trim()) return null;

  try {
    const encoded = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${GMAPS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (data.status !== 'OK' || !data.results?.length) return null;

    const result = data.results[0];
    const loc = result.geometry.location;

    return {
      formattedAddress: result.formatted_address,
      lat: loc.lat,
      lon: loc.lng,
      placeId: result.place_id,
    };
  } catch {
    return null;
  }
}

/**
 * Geocodificación inversa: convierte coordenadas a dirección legible.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GMAPS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (data.status !== 'OK' || !data.results?.length) return null;

    return data.results[0].formatted_address;
  } catch {
    return null;
  }
}

// ─── Distancia (Haversine) ────────────────────────────────────────────────────

/**
 * Calcula la distancia en km entre dos puntos usando la fórmula de Haversine.
 * No requiere llamada a API — cálculo local.
 */
export function haversineDistanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ─── Cobertura y ETA ─────────────────────────────────────────────────────────

/**
 * Verifica si una dirección está dentro del radio de cobertura del restaurante
 * y calcula el ETA estimado.
 *
 * @param destLat - Latitud del cliente
 * @param destLon - Longitud del cliente
 * @param restaurantLat - Latitud del restaurante
 * @param restaurantLon - Longitud del restaurante
 * @param coverageRadiusKm - Radio de cobertura en km
 * @param baseEtaMinutes - ETA base del restaurante (tiempo de preparación + entrega base)
 * @returns CoverageResult con isWithinCoverage, distanceKm y etaMinutes
 */
export function checkCoverageAndEta(
  destLat: number,
  destLon: number,
  restaurantLat: number,
  restaurantLon: number,
  coverageRadiusKm: number,
  baseEtaMinutes: number
): CoverageResult {
  const distanceKm = haversineDistanceKm(restaurantLat, restaurantLon, destLat, destLon);
  const isWithinCoverage = distanceKm <= coverageRadiusKm;

  // ETA = base + (distancia * factor de tiempo por km)
  // Asumimos ~3 minutos por km en zona urbana
  const travelMinutes = Math.ceil(distanceKm * 3);
  const etaMinutes = baseEtaMinutes + travelMinutes;

  return { isWithinCoverage, distanceKm, etaMinutes };
}

// ─── URL de Google Maps ───────────────────────────────────────────────────────

/**
 * Genera un link de Google Maps para una ubicación.
 */
export function buildMapsLink(lat: number, lon: number): string {
  return `https://maps.google.com/?q=${lat},${lon}`;
}

/**
 * Genera un link de Google Maps Directions desde el restaurante al cliente.
 */
export function buildDirectionsLink(
  fromLat: number, fromLon: number,
  toLat: number, toLon: number
): string {
  return `https://www.google.com/maps/dir/${fromLat},${fromLon}/${toLat},${toLon}`;
}
