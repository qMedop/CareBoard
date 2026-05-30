export function formatDurationFromMinutes(minutes) {
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  } else if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  } else if (minutes < 43200) {
    // Less than 30 days
    const days = Math.floor(minutes / 1440);
    return `${days} day${days !== 1 ? "s" : ""}`;
  } else if (minutes < 525600) {
    // Less than 1 year
    const months = Math.floor(minutes / 43200); // Approx. 30 days per month
    return `${months} month${months !== 1 ? "s" : ""}`;
  } else {
    const years = Math.floor(minutes / 525600); // Approx. 365 days
    return `${years} year${years !== 1 ? "s" : ""}`;
  }
}
