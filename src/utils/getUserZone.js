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
