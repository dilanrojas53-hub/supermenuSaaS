/**
 * promoSchedule.ts — Función centralizada de validación de horario de promociones.
 *
 * isPromotionCurrentlyActive(promotion, now?, tenantTimezone?)
 *
 * Reglas:
 * 1. Si is_active = false → inactiva siempre.
 * 2. Validar rango active_from / active_until antes de always_active.
 * 3. Si always_active = true → activa dentro del rango de fechas.
 * 4. Si active_days está vacío o null → tratar como siempre activa dentro del rango.
 * 5. Si active_days tiene valores → el día actual debe estar incluido.
 * 6. Si active_hours_start/end están presentes → la hora actual debe estar en el rango.
 * 7. Promociones que cruzan medianoche se manejan correctamente.
 */

export interface PromotionSchedule {
  is_active: boolean;
  always_active?: boolean | null;
  active_days?: number[] | null;        // 0=domingo, 1=lunes, ..., 6=sábado (JS getDay())
  active_hours_start?: string | null;   // "HH:MM" en 24h
  active_hours_end?: string | null;     // "HH:MM" en 24h
  start_time?: string | null;           // alias legacy
  end_time?: string | null;             // alias legacy
  active_from?: string | null;          // ISO date: válida desde
  active_until?: string | null;         // ISO date: válida hasta
  timezone?: string | null;             // IANA timezone, default 'America/Costa_Rica'
  visible_only_when_active?: boolean | null;
}

const DEFAULT_TIMEZONE = 'America/Costa_Rica';

/**
 * Obtiene la hora y día actuales en la timezone del restaurante.
 */
function getNowInTimezone(timezone: string): { hhmm: string; dayOfWeek: number } {
  try {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    });
    const hhmm = timeStr === '24:00' ? '00:00' : timeStr.slice(0, 5);

    const dayStr = now.toLocaleDateString('en-US', { weekday: 'short', timeZone: timezone });
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = dayMap[dayStr] ?? new Date().getDay();

    return { hhmm, dayOfWeek };
  } catch {
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    return { hhmm, dayOfWeek: now.getDay() };
  }
}

/**
 * Verifica si una hora HH:MM está dentro del rango [start, end].
 * Soporta rangos que cruzan medianoche (start > end).
 */
function isTimeInRange(hhmm: string, start: string, end: string): boolean {
  if (start <= end) {
    return hhmm >= start && hhmm <= end;
  }
  return hhmm >= start || hhmm <= end;
}

/**
 * Determina si una promoción está vigente ahora mismo.
 */
export function isPromotionCurrentlyActive(
  promo: PromotionSchedule,
  now?: Date
): boolean {
  if (!promo.is_active) return false;

  const ref = now ?? new Date();
  if (promo.active_from && new Date(promo.active_from) > ref) return false;
  if (promo.active_until && new Date(promo.active_until) < ref) return false;

  // Importante: always_active NO debe ignorar active_until.
  if (promo.always_active) return true;

  const days = promo.active_days;
  const hasDays = Array.isArray(days) && days.length > 0;
  const timeStart = promo.active_hours_start || promo.start_time;
  const timeEnd = promo.active_hours_end || promo.end_time;
  const tz = promo.timezone || DEFAULT_TIMEZONE;

  if (!hasDays) {
    if (!timeStart || !timeEnd) return true;
    const { hhmm } = getNowInTimezone(tz);
    return isTimeInRange(hhmm, timeStart, timeEnd);
  }

  const { hhmm, dayOfWeek } = getNowInTimezone(tz);
  if (!days.includes(dayOfWeek)) return false;

  if (!timeStart || !timeEnd) return true;

  return isTimeInRange(hhmm, timeStart, timeEnd);
}

/**
 * Determina si una promoción debe ser VISIBLE en el menú público.
 */
export function isPromotionVisible(promo: PromotionSchedule): boolean {
  if (!promo.is_active) return false;
  const visibleOnlyWhenActive = promo.visible_only_when_active ?? true;
  if (!visibleOnlyWhenActive) return true;
  return isPromotionCurrentlyActive(promo);
}

export const DAY_NAMES_ES: Record<number, string> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
};

export const DAY_NAMES_SHORT_ES: Record<number, string> = {
  0: 'Dom',
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
};

/**
 * Formatea los días activos como texto legible.
 */
export function formatActiveDays(days: number[] | null | undefined): string {
  if (!days || days.length === 0) return 'todos los días';
  if (days.length === 7) return 'todos los días';
  return days.map(d => DAY_NAMES_ES[d] ?? d).join(', ');
}
