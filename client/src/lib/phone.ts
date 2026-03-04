/**
 * phone.ts — Utilidades de formateo de teléfono para Smart Menu.
 *
 * REGLA CRÍTICA: Los teléfonos NUNCA se tratan como números.
 * Se convierten a String y se limpian con regex para preservar
 * todos los dígitos, incluyendo ceros intermedios.
 *
 * Formateo CR: wa.me siempre inicia con 506.
 * Si el número limpio tiene 8 dígitos → antepone 506.
 * Ejemplo: "6201-4922" → "50662014922"
 */

/**
 * Limpia un teléfono preservando todos los dígitos.
 * Convierte a String primero para evitar pérdida de ceros.
 */
export function cleanPhone(raw: string | number | null | undefined): string {
  if (raw == null) return '';
  return String(raw).replace(/[^0-9]/g, '');
}

/**
 * Formatea un teléfono para usar en links wa.me.
 * Antepone 506 si el número limpio tiene 8 dígitos (CR).
 */
export function waPhone(raw: string | number | null | undefined): string {
  const digits = cleanPhone(raw);
  if (!digits) return '';
  // Si ya tiene prefijo internacional (10+ dígitos), usar tal cual
  if (digits.length >= 10) return digits;
  // Si tiene 8 dígitos (número CR), anteponer 506
  if (digits.length === 8) return `506${digits}`;
  // Cualquier otro caso, devolver como está
  return digits;
}

/**
 * Construye un link de WhatsApp completo con mensaje pre-cargado.
 *
 * FIX ENCODING (V3.0): Se normaliza el mensaje a NFC antes de aplicar
 * encodeURIComponent para eliminar rombos negros (caracteres corruptos)
 * causados por representaciones Unicode inconsistentes (NFD vs NFC).
 * Esto garantiza que emojis, tildes y caracteres especiales del español
 * lleguen correctamente al destinatario de WhatsApp.
 */
export function buildWhatsAppUrl(
  phone: string | number | null | undefined,
  message: string
): string {
  const formatted = waPhone(phone);
  if (!formatted) return '';
  // Normalizar a NFC para representación Unicode consistente
  const safeMessage = message.normalize('NFC');
  return `https://wa.me/${formatted}?text=${encodeURIComponent(safeMessage)}`;
}
