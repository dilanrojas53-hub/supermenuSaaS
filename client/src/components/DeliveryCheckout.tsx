/**
 * DeliveryCheckout.tsx — Fase 1: Flujo separado de checkout para delivery
 *
 * Responsabilidades:
 * - Captura dirección (texto libre + geocodificación real)
 * - Captura referencia/señas, teléfono de contacto
 * - Valida cobertura por radio contra delivery_settings del tenant
 * - Calcula ETA inicial
 * - Persiste delivery_destination en Supabase
 * - Retorna los datos listos para el INSERT en orders
 *
 * NO toca el flujo de dine_in ni takeout.
 * Se activa únicamente cuando deliveryType === 'delivery'.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Phone, Navigation, Loader2, CheckCircle, AlertCircle, Clock, ChevronRight, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  geocodeAddress,
  reverseGeocode,
  checkCoverageAndEta,
  buildMapsLink,
} from '@/lib/maps';
import type { ThemeSettings, Tenant, DeliverySettings, DeliveryDestination } from '@/lib/types';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface DeliveryCheckoutData {
  destinationId: string;
  addressLine: string;
  referenceNotes: string;
  customerPhone: string;
  lat: number | null;
  lon: number | null;
  formattedAddress: string | null;
  distanceKm: number | null;
  etaMinutes: number | null;
  isWithinCoverage: boolean;
  mapsLink: string | null;
}

interface DeliveryCheckoutProps {
  theme: ThemeSettings;
  tenant: Tenant;
  lang: string;
  onComplete: (data: DeliveryCheckoutData) => void;
  onCancel: () => void;
  /** Pre-filled customer phone from customer_info step */
  prefilledPhone?: string;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function DeliveryCheckout({
  theme,
  tenant,
  lang,
  onComplete,
  onCancel,
  prefilledPhone = '',
}: DeliveryCheckoutProps) {
  const es = lang === 'es';

  // Delivery settings del tenant
  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [deliveryNotAvailable, setDeliveryNotAvailable] = useState(false);

  // Formulario
  const [addressLine, setAddressLine] = useState('');
  const [referenceNotes, setReferenceNotes] = useState('');
  const [contactPhone, setContactPhone] = useState(prefilledPhone);

  // Geocodificación
  type GeoState = 'idle' | 'geocoding' | 'success' | 'error' | 'out_of_coverage';
  const [geoState, setGeoState] = useState<GeoState>('idle');
  const [geocodedAddress, setGeocodedAddress] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [isWithinCoverage, setIsWithinCoverage] = useState<boolean | null>(null);
  const [geoError, setGeoError] = useState<string>('');

  // GPS
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  // Flag para evitar que el debounce re-geocodifique cuando GPS establece la dirección
  const gpsSetAddressRef = useRef(false);

  // Submitting
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ─── Cargar delivery_settings del tenant ─────────────────────────────────

  useEffect(() => {
    async function loadSettings() {
      setLoadingSettings(true);
      const { data, error } = await supabase
        .from('delivery_settings')
        .select('*')
        .eq('tenant_id', tenant.id)
        .single();

      if (error || !data) {
        setDeliveryNotAvailable(true);
        setLoadingSettings(false);
        return;
      }

      const settings = data as DeliverySettings;
      if (!settings.delivery_enabled) {
        setDeliveryNotAvailable(true);
        setLoadingSettings(false);
        return;
      }

      setDeliverySettings(settings);
      setLoadingSettings(false);
    }
    loadSettings();
  }, [tenant.id]);

  // ─── Geocodificar dirección ───────────────────────────────────────────────

  const handleGeocode = useCallback(async () => {
    if (!addressLine.trim() || !deliverySettings) return;
    if (!deliverySettings.restaurant_lat || !deliverySettings.restaurant_lon) {
      // Sin coords del restaurante, no podemos validar cobertura
      // Guardamos la dirección sin validación
      setGeoState('success');
      setGeocodedAddress(addressLine);
      setIsWithinCoverage(true); // Asumimos dentro si no hay config
      setEtaMinutes(deliverySettings.base_eta_minutes);
      return;
    }

    setGeoState('geocoding');
    setGeoError('');

    const result = await geocodeAddress(addressLine);
    if (!result) {
      setGeoState('error');
      setGeoError(es
        ? 'No pudimos encontrar esa dirección. Intentá ser más específico.'
        : 'Could not find that address. Try to be more specific.');
      return;
    }

    const coverage = checkCoverageAndEta(
      result.lat,
      result.lon,
      deliverySettings.restaurant_lat,
      deliverySettings.restaurant_lon,
      deliverySettings.coverage_radius_km,
      deliverySettings.base_eta_minutes
    );

    setCoords({ lat: result.lat, lon: result.lon });
    setGeocodedAddress(result.formattedAddress);
    setDistanceKm(coverage.distanceKm);
    setEtaMinutes(coverage.etaMinutes);
    setIsWithinCoverage(coverage.isWithinCoverage);

    if (!coverage.isWithinCoverage) {
      setGeoState('out_of_coverage');
    } else {
      setGeoState('success');
    }
  }, [addressLine, deliverySettings, es]);

  // Debounce geocoding al escribir (no disparar si GPS estableció la dirección)
  useEffect(() => {
    // Si GPS acaba de establecer la dirección, saltamos el debounce una vez
    if (gpsSetAddressRef.current) {
      gpsSetAddressRef.current = false;
      return;
    }
    if (addressLine.length < 10) {
      setGeoState('idle');
      setGeocodedAddress(null);
      setCoords(null);
      setIsWithinCoverage(null);
      return;
    }
    const timer = setTimeout(() => {
      handleGeocode();
    }, 1200);
    return () => clearTimeout(timer);
  }, [addressLine, handleGeocode]);

  // ─── GPS ──────────────────────────────────────────────────────────────────

  const handleRequestGPS = () => {
    if (!navigator.geolocation) {
      setGpsError(es
        ? '⚠️ Tu navegador no soporta geolocalización.'
        : '⚠️ Your browser does not support geolocation.');
      return;
    }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setGpsLoading(false);

        // Reverse geocode para obtener dirección legible
        const address = await reverseGeocode(latitude, longitude);
        if (address) {
          gpsSetAddressRef.current = true; // Evitar que el debounce re-geocodifique
          setAddressLine(address);
        }
        setCoords({ lat: latitude, lon: longitude });

        if (deliverySettings?.restaurant_lat && deliverySettings?.restaurant_lon) {
          const coverage = checkCoverageAndEta(
            latitude, longitude,
            deliverySettings.restaurant_lat,
            deliverySettings.restaurant_lon,
            deliverySettings.coverage_radius_km,
            deliverySettings.base_eta_minutes
          );
          setDistanceKm(coverage.distanceKm);
          setEtaMinutes(coverage.etaMinutes);
          setIsWithinCoverage(coverage.isWithinCoverage);
          setGeocodedAddress(address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          setGeoState(coverage.isWithinCoverage ? 'success' : 'out_of_coverage');
        } else {
          setGeocodedAddress(address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          setGeoState('success');
          setIsWithinCoverage(true);
          setEtaMinutes(deliverySettings?.base_eta_minutes ?? 30);
        }
      },
      (err) => {
        setGpsLoading(false);
        setGpsError(err.code === 1
          ? (es ? '⚠️ Permiso de ubicación denegado.' : '⚠️ Location permission denied.')
          : (es ? '⚠️ Error al obtener ubicación.' : '⚠️ Error getting location.'));
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  // ─── Submit: persiste delivery_destination y retorna datos ───────────────

  const handleSubmit = async () => {
    if (!addressLine.trim()) return;
    if (!contactPhone.trim()) return;
    if (isWithinCoverage === false) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      // Insertar delivery_destination en Supabase
      const { data: dest, error: destError } = await supabase
        .from('delivery_destinations')
        .insert({
          tenant_id: tenant.id,
          customer_name: '', // Se llenará con customer_name del order
          customer_phone: contactPhone.trim(),
          address_line: addressLine.trim(),
          reference_notes: referenceNotes.trim() || null,
          lat: coords?.lat ?? null,
          lon: coords?.lon ?? null,
          formatted_address: geocodedAddress ?? null,
          distance_km: distanceKm ?? null,
          eta_minutes: etaMinutes ?? null,
          is_within_coverage: isWithinCoverage ?? true,
        })
        .select('id')
        .single();

      if (destError || !dest) {
        throw new Error(destError?.message || 'Error al guardar dirección');
      }

      const mapsLink = coords ? buildMapsLink(coords.lat, coords.lon) : null;

      onComplete({
        destinationId: dest.id,
        addressLine: addressLine.trim(),
        referenceNotes: referenceNotes.trim(),
        customerPhone: contactPhone.trim(),
        lat: coords?.lat ?? null,
        lon: coords?.lon ?? null,
        formattedAddress: geocodedAddress,
        distanceKm,
        etaMinutes,
        isWithinCoverage: isWithinCoverage ?? true,
        mapsLink,
      });
    } catch (err: any) {
      setSubmitError(es
        ? 'Error al guardar la dirección. Intenta de nuevo.'
        : 'Error saving address. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    addressLine.trim().length >= 5 &&
    contactPhone.trim().length >= 7 &&
    isWithinCoverage !== false &&
    geoState !== 'geocoding' &&
    !submitting;

  // ─── Render ───────────────────────────────────────────────────────────────

  const inputStyle = (active: boolean) => ({
    backgroundColor: `${theme.text_color}06`,
    border: `1.5px solid ${active ? theme.primary_color : `${theme.text_color}15`}`,
    color: theme.text_color,
  });

  if (loadingSettings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin" style={{ color: theme.primary_color }} />
      </div>
    );
  }

  if (deliveryNotAvailable) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: `${theme.text_color}10` }}>
          <AlertCircle size={28} style={{ color: `${theme.text_color}60` }} />
        </div>
        <div>
          <p className="font-bold text-base" style={{ color: theme.text_color }}>
            {es ? 'Delivery no disponible' : 'Delivery not available'}
          </p>
          <p className="text-sm mt-1" style={{ color: `${theme.text_color}60` }}>
            {es
              ? 'Este restaurante no tiene delivery activo en este momento.'
              : 'This restaurant does not have delivery active at this time.'}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ backgroundColor: `${theme.text_color}10`, color: theme.text_color }}
        >
          {es ? 'Volver' : 'Go back'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-5 pb-5">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${theme.primary_color}20` }}>
          <MapPin size={20} style={{ color: theme.primary_color }} />
        </div>
        <div>
          <p className="font-bold text-base" style={{ color: theme.text_color }}>
            {es ? '¿A dónde te lo enviamos?' : 'Where should we deliver?'}
          </p>
          {deliverySettings && (
            <p className="text-xs" style={{ color: `${theme.text_color}60` }}>
              {es
                ? `Cobertura: ${deliverySettings.coverage_radius_km} km · Tarifa: ${deliverySettings.delivery_fee > 0 ? `₡${deliverySettings.delivery_fee.toLocaleString()}` : 'Gratis'}`
                : `Coverage: ${deliverySettings.coverage_radius_km} km · Fee: ${deliverySettings.delivery_fee > 0 ? `₡${deliverySettings.delivery_fee.toLocaleString()}` : 'Free'}`}
            </p>
          )}
        </div>
      </div>

      {/* GPS button */}
      <button
        onClick={handleRequestGPS}
        disabled={gpsLoading}
        className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all w-full"
        style={{
          backgroundColor: `${theme.primary_color}12`,
          border: `1.5px dashed ${theme.primary_color}50`,
          color: theme.primary_color,
        }}
      >
        {gpsLoading
          ? <Loader2 size={18} className="animate-spin flex-shrink-0" />
          : <Navigation size={18} className="flex-shrink-0" />}
        <span className="text-sm font-semibold">
          {gpsLoading
            ? (es ? 'Obteniendo ubicación...' : 'Getting location...')
            : (es ? 'Usar mi ubicación actual' : 'Use my current location')}
        </span>
      </button>
      {gpsError && (
        <p className="text-xs px-1" style={{ color: '#EF4444' }}>{gpsError}</p>
      )}

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ backgroundColor: `${theme.text_color}12` }} />
        <span className="text-xs font-medium" style={{ color: `${theme.text_color}40` }}>
          {es ? 'o escribí la dirección' : 'or type the address'}
        </span>
        <div className="flex-1 h-px" style={{ backgroundColor: `${theme.text_color}12` }} />
      </div>

      {/* Address input */}
      <div>
        <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
          {es ? 'Dirección *' : 'Address *'}
        </label>
        <div className="relative">
          <textarea
            value={addressLine}
            onChange={e => setAddressLine(e.target.value)}
            placeholder={es
              ? 'Ej: 100m norte del parque central, Barrio Los Ángeles, San José'
              : 'E.g.: 100m north of central park, Los Angeles neighborhood, San José'}
            rows={2}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none transition-all"
            style={inputStyle(addressLine.length > 0)}
          />
          {geoState === 'geocoding' && (
            <div className="absolute right-3 top-3">
              <Loader2 size={16} className="animate-spin" style={{ color: theme.primary_color }} />
            </div>
          )}
        </div>

        {/* Geocoding feedback */}
        <AnimatePresence>
          {geoState === 'success' && geocodedAddress && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg"
              style={{ backgroundColor: '#10B98115', border: '1px solid #10B98130' }}
            >
              <CheckCircle size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#10B981' }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium" style={{ color: '#10B981' }}>
                  {es ? 'Dirección encontrada' : 'Address found'}
                </p>
                <p className="text-xs mt-0.5 truncate" style={{ color: `${theme.text_color}70` }}>
                  {geocodedAddress}
                </p>
                {distanceKm !== null && (
                  <p className="text-xs mt-0.5" style={{ color: `${theme.text_color}60` }}>
                    {es ? `${distanceKm.toFixed(1)} km del restaurante` : `${distanceKm.toFixed(1)} km from restaurant`}
                  </p>
                )}
              </div>
            </motion.div>
          )}
          {geoState === 'out_of_coverage' && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg"
              style={{ backgroundColor: '#EF444415', border: '1px solid #EF444430' }}
            >
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#EF4444' }} />
              <div>
                <p className="text-xs font-medium" style={{ color: '#EF4444' }}>
                  {es ? 'Fuera de zona de cobertura' : 'Outside coverage area'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: `${theme.text_color}60` }}>
                  {es
                    ? `Esta dirección está a ${distanceKm?.toFixed(1)} km. El radio de entrega es ${deliverySettings?.coverage_radius_km} km.`
                    : `This address is ${distanceKm?.toFixed(1)} km away. Delivery radius is ${deliverySettings?.coverage_radius_km} km.`}
                </p>
              </div>
            </motion.div>
          )}
          {geoState === 'error' && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 px-3 py-2 rounded-lg"
              style={{ backgroundColor: '#F59E0B15', border: '1px solid #F59E0B30' }}
            >
              <p className="text-xs" style={{ color: '#F59E0B' }}>{geoError}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Reference notes */}
      <div>
        <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
          {es ? 'Señas adicionales (color de casa, número, referencia)' : 'Additional notes (house color, number, landmark)'}
        </label>
        <input
          type="text"
          value={referenceNotes}
          onChange={e => setReferenceNotes(e.target.value)}
          placeholder={es ? 'Ej: Casa amarilla, portón negro, frente a la pulpería' : 'E.g.: Yellow house, black gate, next to the store'}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
          style={inputStyle(referenceNotes.length > 0)}
        />
      </div>

      {/* Contact phone */}
      <div>
        <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
          {es ? 'WhatsApp para coordinar entrega *' : 'WhatsApp for delivery coordination *'}
        </label>
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl transition-all"
          style={inputStyle(contactPhone.length > 0)}>
          <Phone size={16} className="flex-shrink-0" style={{ color: `${theme.text_color}40` }} />
          <input
            type="tel"
            value={contactPhone}
            onChange={e => setContactPhone(e.target.value)}
            placeholder="8888-8888"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: theme.text_color }}
          />
        </div>
      </div>

      {/* ETA preview */}
      {etaMinutes !== null && isWithinCoverage && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ backgroundColor: `${theme.primary_color}12`, border: `1px solid ${theme.primary_color}25` }}
        >
          <Clock size={18} style={{ color: theme.primary_color }} />
          <div>
            <p className="text-sm font-bold" style={{ color: theme.primary_color }}>
              {es ? `Tiempo estimado: ~${etaMinutes} min` : `Estimated time: ~${etaMinutes} min`}
            </p>
            {deliverySettings && deliverySettings.delivery_fee > 0 && (
              <p className="text-xs mt-0.5" style={{ color: `${theme.text_color}60` }}>
                {es
                  ? `Tarifa de delivery: ₡${deliverySettings.delivery_fee.toLocaleString()}`
                  : `Delivery fee: ₡${deliverySettings.delivery_fee.toLocaleString()}`}
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* Submit error */}
      {submitError && (
        <p className="text-xs px-1" style={{ color: '#EF4444' }}>{submitError}</p>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
          style={{ backgroundColor: `${theme.text_color}10`, color: theme.text_color }}
        >
          {es ? 'Volver' : 'Back'}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-2 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all"
          style={{
            backgroundColor: canSubmit ? theme.primary_color : `${theme.text_color}15`,
            color: canSubmit ? '#fff' : `${theme.text_color}40`,
            flex: 2,
          }}
        >
          {submitting
            ? <Loader2 size={16} className="animate-spin" />
            : <ChevronRight size={16} />}
          <span>{es ? 'Confirmar dirección' : 'Confirm address'}</span>
        </button>
      </div>
    </div>
  );
}
