import { getMonthLayout } from "../../utils/getMonthLayout";
import { NextBtnIcon, PrevBtnIcon } from "../../assets/icons/Icon";
import { useState, useEffect } from "react";
import styles from "./pickDay.module.css";
import CustomButton from "../button/Button";
import { useTime } from "../../contexts/TimeContext";

function PickDay({ onPick, today: todayProp, minDate, maxDate }) {
  const region = "EU";
  const { daysOfWeekUS, daysOfWeekEU, MonthsOfTheYear } = useTime();

  // 1. Initialize logic based on the passed prop (or default to now)
  const initialDate = todayProp ? new Date(todayProp) : new Date();

  // 2. State for the Calendar View (Month/Year displayed)
  const [currentMonthView, setCurrentMonthView] = useState(initialDate);

  // 3. State for the Selected Day (Highlighted circle)
  const [selectedDate, setSelectedDate] = useState(initialDate);

  // Sync local selection if parent prop changes externally
  useEffect(() => {
    if (todayProp) {
      setSelectedDate(new Date(todayProp));
    }
  }, [todayProp]);

  const daysOfWeek = region === "EU" ? daysOfWeekEU : daysOfWeekUS;
  const { weeks } = getMonthLayout(
    currentMonthView.getFullYear(),
    currentMonthView.getMonth(),
    region === "EU" ? 1 : 0,
  );

  // Helper to compare dates easily
  const selectedDateString = selectedDate.toDateString();

  // Helper to normalize dates for comparison (ignore time)
  const normalize = (d) => {
    if (!d) return null;
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const min = normalize(minDate);
  const max = normalize(maxDate);

  return (
    <div className={styles.monthBlock}>
      <div className={styles.monthControls}>
        <div className={styles.left}>
          <p>
            {MonthsOfTheYear[currentMonthView.getMonth()]}{" "}
            {currentMonthView.getFullYear()}
          </p>
        </div>
        <div className={styles.controls}>
          <CustomButton
            ClickEffect={"scale"}
            className={styles.prevBtn}
            onClick={() => {
              setCurrentMonthView((prev) => {
                const newDate = new Date(prev);
                newDate.setMonth(newDate.getMonth() - 1);
                return newDate;
              });
            }}
          >
            <PrevBtnIcon />
          </CustomButton>
          <CustomButton
            ClickEffect={"scale"}
            className={styles.nextBtn}
            onClick={() => {
              setCurrentMonthView((prev) => {
                const newDate = new Date(prev);
                newDate.setMonth(newDate.getMonth() + 1);
                return newDate;
              });
            }}
          >
            <NextBtnIcon />
          </CustomButton>
        </div>
      </div>
      <div className={styles.monthGrid}>
        {/* Days of week header row */}
        <div className={styles.weekRow}>
          {daysOfWeek.map((day, idx) => (
            <div key={idx} className={styles.cell}>
              <p className={styles.dayId}>{day.charAt(0)}</p>
            </div>
          ))}
        </div>
        {/* Calendar weeks */}
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className={styles.weekRow}>
            {week.map((dayObj, dayIndex) => {
              // Check if this cell matches our local selected state
              const isPassedDay =
                selectedDateString === dayObj.date.toDateString();

              // Check constraints
              const current = normalize(dayObj.date);
              const isDisabled =
                (min && current < min) || (max && current > max);

              return (
                <div
                  key={dayIndex}
                  className={`${styles.dayCell} ${styles[dayObj.type]} ${
                    dayObj.isToday ? styles.today : ""
                  } ${isPassedDay ? styles.passedDay : ""} ${
                    isDisabled ? styles.hidden : ""
                  }`}
                >
                  <CustomButton
                    ClickEffect={"scale"}
                    className={`${styles.cell} ${
                      isDisabled ? styles.disabled : ""
                    }`}
                    onClick={() => {
                      if (isDisabled) return;

                      const clickedDate = new Date(dayObj.date);

                      // 1. Update highlight immediately locally
                      setSelectedDate(clickedDate);

                      // 2. Update calendar view to ensure we stay on the right month
                      setCurrentMonthView(clickedDate);

                      // 3. Tell parent component about the change
                      onPick && onPick(clickedDate.toISOString());
                    }}
                  >
                    {dayObj.day}
                  </CustomButton>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default PickDay;
