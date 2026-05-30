import { DateTime } from "luxon";

export function isAllDayEvent(event, timeZoneOffset) {
  const userZone = `UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`;
  const start = DateTime.fromISO(event.timeRange.start, {
    zone: "utc",
  }).setZone(userZone);
  const end = DateTime.fromISO(event.timeRange.end, { zone: "utc" }).setZone(
    userZone,
  );

  return (
    event.isFullDay ||
    (start.hour === 0 &&
      start.minute === 0 &&
      end.diff(start, "minutes").as("minutes") === 1440)
  );
}
