/**
 * Builds a Luxon-compatible fixed-offset zone string from an offset in hours.
 *
 * Replaces the old inline pattern that appeared in ~25 places across the app:
 *   `UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`
 *
 * That pattern silently broke for any non-integer offset (e.g. India +5:30,
 * Iran +3:30, Nepal +5:45) because Luxon expects "UTC+05:30", not "UTC+5.5" —
 * the latter fails to parse and Luxon falls back to an Invalid DateTime,
 * which then propagates into event positioning, all-day detection, drag/
 * resize math, and recurrence expansion for anyone in those zones.
 *
 * @param {number} offsetHours - timezone offset in hours, may be fractional
 *   (e.g. 5.5 for UTC+5:30, -4 for UTC-4).
 * @returns {string} a zone string Luxon's FixedOffsetZone parser accepts,
 *   e.g. "UTC+05:30", "UTC-04:00".
 */
export function getUserZone(offsetHours) {
  if (typeof offsetHours !== "number" || Number.isNaN(offsetHours)) {
    return "UTC";
  }

  const totalMinutes = Math.round(offsetHours * 60);
  const sign = totalMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(totalMinutes);
  const hours = String(Math.floor(absMinutes / 60)).padStart(2, "0");
  const minutes = String(absMinutes % 60).padStart(2, "0");

  return `UTC${sign}${hours}:${minutes}`;
}
