export function getMonthLayout(
  year,
  month,
  firstDayOfWeek = 0,
  forceSixRows = false,
) {
  const today = new Date();
  const isToday = (date) =>
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const firstDayCurrentMonth = new Date(year, month, 1);
  const actualFirstDay = firstDayCurrentMonth.getDay();
  let startDayOfWeek = (actualFirstDay - firstDayOfWeek + 7) % 7;

  const lastDayPrevMonth = new Date(year, month, 0).getDate();
  const lastDayCurrentMonth = new Date(year, month + 1, 0).getDate();

  const weeks = [];
  let dayCounter = 1;
  let nextMonthDay = 1;

  const totalSlots = startDayOfWeek + lastDayCurrentMonth;
  const totalWeeks = forceSixRows ? 6 : totalSlots > 35 ? 6 : 5;

  for (let week = 0; week < totalWeeks; week++) {
    const days = [];
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const calendarDayIndex = week * 7 + dayOfWeek;
      let dayObj = null;

      if (calendarDayIndex < startDayOfWeek) {
        // Previous month
        const prevMonthDay =
          lastDayPrevMonth - (startDayOfWeek - calendarDayIndex) + 1;
        const date = new Date(year, month - 1, prevMonthDay);
        dayObj = {
          day: prevMonthDay,
          type: "prev",
          isToday: isToday(date),
          date,
        };
      } else if (dayCounter <= lastDayCurrentMonth) {
        // Current month
        const date = new Date(year, month, dayCounter);
        dayObj = {
          day: dayCounter,
          type: "current",
          isToday: isToday(date),
          date,
        };
        dayCounter++;
      } else {
        // Next month
        const date = new Date(year, month + 1, nextMonthDay);
        dayObj = {
          day: nextMonthDay,
          type: "next",
          isToday: isToday(date),
          date,
        };
        nextMonthDay++;
      }

      days.push(dayObj);
    }
    weeks.push(days);
  }

  return { weeks };
}
