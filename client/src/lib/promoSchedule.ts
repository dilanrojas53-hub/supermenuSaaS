/**
 * promoSchedule.ts — Función centralizada de validación de horario de promociones.
 *
 * isPromotionCurrentlyActive(promotion, now?, tenantTimezone?)
 *
 * Reglas:
 * 1. Si is_active = false → inactiva siempre.
 * 2. Si always_active = true → activa (mientras is_active = true).
 * 3. Si active_days está vacío o null → tratar como siempre activa (compatibilidad).
 * 4. Si active_days tiene valores → el día actual (en la timezone del restaurante) debe estar incluido.
 * 5. Si active_hours_start/end están presentes → la hora actual debe estar en el rango.
 * 6. Promociones que cruzan medianoche (start > end) se manejan correctamente.
 * 7. Si active_hours_start/end son null → activa todo el día en los días configurados.
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
    // Obtener la hora en formato HH:MM en la timezone dada
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    });
    // toLocaleTimeString puede devolver "24:00" → normalizar a "00:00"
    const hhmm = timeStr === '24:00' ? '00:00' : timeStr.slice(0, 5);

    // Obtener el día de la semana en la timezone dada (0=domingo)
    const dayStr = now.toLocaleDateString('en-US', { weekday: 'short', timeZone: timezone });
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = dayMap[dayStr] ?? new Date().getDay();

    return { hhmm, dayOfWeek };
  } catch {
    // Fallback si la timezone no es válida
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
    // Rango normal: 18:00 – 22:00
    return hhmm >= start && hhmm <= end;
  } else {
    // Rango que cruza medianoche: 22:00 – 02:00
    return hhmm >= start || hhmm <= end;
  }
}

/**
 * Función principal: determina si una promoción está activa en este momento.
 *
 * @param promo - Objeto con los campos de programación de la promoción.
 * @param now   - Fecha/hora de referencia (por defecto: ahora). Útil para tests.
 * @returns true si la promoción está vigente ahora mismo.
 */
export function isPromotionCurrentlyActive(
  promo: PromotionSchedule,
  now?: Date
): boolean {
  // 1. Inactiva manualmente
  if (!promo.is_active) return false;

  // 2. Siempre activa
  if (promo.always_active) return true;

  // 3. Rango de fechas (active_from / active_until)
  const ref = now ?? new Date();
  if (promo.active_from && new Date(promo.active_from) > ref) return false;
  if (promo.active_until && new Date(promo.active_until) < ref) return false;

  // 4. Si no hay días configurados → compatibilidad: tratar como siempre activa
  const days = promo.active_days;
  const hasDays = Array.isArray(days) && days.length > 0;
  if (!hasDays) {
    // Sin días → solo validar horario si existe
    const timeStart = promo.active_hours_start || promo.start_time;
    const timeEnd = promo.active_hours_end || promo.end_time;
    if (!timeStart || !timeEnd) return true;
    const tz = promo.timezone || DEFAULT_TIMEZONE;
    const { hhmm } = getNowInTimezone(tz);
    return isTimeInRange(hhmm, timeStart, timeEnd);
  }

  // 5. Validar día de la semana
  const tz = promo.timezone || DEFAULT_TIMEZONE;
  const { hhmm, dayOfWeek } = getNowInTimezone(tz);
  if (!days.includes(dayOfWeek)) return false;

  // 6. Validar horario (si está configurado)
  const timeStart = promo.active_hours_start || promo.start_time;
  const timeEnd = promo.active_hours_end || promo.end_time;
  if (!timeStart || !timeEnd) return true; // Activa todo el día

  return isTimeInRange(hhmm, timeStart, timeEnd);
}

/**
 * Determina si una promoción debe ser VISIBLE en el menú público.
 * Si visible_only_when_active = true (default), solo se muestra cuando está activa.
 * Si visible_only_when_active = false, se muestra siempre pero no se puede aplicar.
 */
export function isPromotionVisible(promo: PromotionSchedule): boolean {
  if (!promo.is_active) return false;
  const visibleOnlyWhenActive = promo.visible_only_when_active ?? true;
  if (!visibleOnlyWhenActive) return true; // Siempre visible (aunque fuera de horario)
  return isPromotionCurrentlyActive(promo);
}

/**
 * Nombres de días en español para mostrar en la UI.
 */
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
 * Ej: [5, 6] → "viernes, sábado"
 */
export function formatActiveDays(days: number[] | null | undefined): string {
  if (!days || days.length === 0) return 'todos los días';
  if (days.length === 7) return 'todos los días';
  return days.map(d => DAY_NAMES_ES[d] ?? d).join(', ');
}
