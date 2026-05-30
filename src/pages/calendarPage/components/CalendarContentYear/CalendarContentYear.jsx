import styles from "../../CalendarPage.module.css";
import { getMonthLayout } from "../../../../utils/getMonthLayout";
import { useTime } from "../../../../contexts/TimeContext";
import CustomButton from "../../../../components/button/Button";

function CalendarContentYear({ currentDate, region = "EU" }) {
  const { daysOfWeekUS, daysOfWeekEU } = useTime();

  return (
    <div className={styles.yearLayout}>
      <div className={styles.monthsGrid}>
        {Array.from({ length: 12 }, (_, i) => {
          const daysOfWeek = region === "EU" ? daysOfWeekEU : daysOfWeekUS;

          const { weeks } = getMonthLayout(
            currentDate.getFullYear(),
            i,
            region === "EU" ? 1 : 0,
            true,
          );
          return (
            <div key={i} className={styles.monthBlock}>
              <h3 className={styles.monthTitle}>
                <CustomButton
                  link={true}
                  className={`${styles.monthButton} default`}
                  ClickEffect={false}
                  href={`/calendar/month/1/${i + 1}/${currentDate.getFullYear()}`}
                >
                  {new Date(currentDate.getFullYear(), i, 1).toLocaleString(
                    undefined,
                    { month: "long" },
                  )}
                </CustomButton>
              </h3>
              <div className={styles.monthGrid}>
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className={styles.weekRow}>
                    {week.map((dayObj, dayIndex) => (
                      <div
                        key={dayIndex}
                        className={`${styles.dayCell} ${styles[dayObj.type]} ${
                          dayObj.isToday ? styles.today : ""
                        }`}
                      >
                        {weekIndex === 0 && (
                          <p className={styles.dayId}>
                            {daysOfWeek[dayIndex].charAt(0)}
                          </p>
                        )}
                        <CustomButton
                          className={`${styles.dayButton} `}
                          link={true}
                          href={`/calendar/day/${dayObj.date.getDate()}/${
                            dayObj.date.getMonth() + 1
                          }/${dayObj.date.getFullYear()}`}
                        >
                          {dayObj.day}
                        </CustomButton>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CalendarContentYear;
