import { useState } from "react";
import { DateTime } from "luxon";
import { usePopup } from "../../../../../../contexts/PopupContext";
import CustomButton from "../../../../../../components/button/Button";
import styles from "./RecurrenceOptionsPopup.module.css";

function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function RecurrenceOptionsPopup({
  startDate,
  currentRecurrence,
  onSave,
  openSubPopup,
}) {
  const { closePopup } = usePopup();
  const startDT = DateTime.fromISO(startDate);

  const options = [
    { type: "NONE", label: "Does not repeat" },
    { type: "DAILY", label: "Daily", interval: 1 },
    {
      type: "WEEKLY",
      label: `Weekly on ${startDT.toFormat("cccc")}`,
      interval: 1,
    },
    {
      type: "MONTHLY",
      label: `Monthly on the ${startDT.toFormat("d")}${getOrdinal(
        startDT.day,
      )}`,
      interval: 1,
    },
    {
      type: "YEARLY",
      label: `Yearly on ${startDT.toFormat("MMMM d")}`,
      interval: 1,
    },
    { type: "WEEKDAY", label: "Every weekday (Mon-Fri)" },
  ];

  const handleSelect = (opt) => {
    if (opt.type === "WEEKDAY")
      onSave({ type: "WEEKLY", interval: 1, daysOfWeek: [1, 2, 3, 4, 5] });
    else onSave({ type: opt.type, interval: opt.interval || 1 });
  };

  const handleCustomClick = (e) => {
    openSubPopup(
      "centered",
      () => (
        <CustomRecurrencePopup
          startDate={startDate}
          onSave={onSave}
          closeParent={closePopup}
        />
      ),
      e.currentTarget,
      "bottomRight",
    );
  };

  return (
    <div className={`${styles.optionsPopup} ${styles.addEventPopup}`}>
      {options.map((opt) => (
        <CustomButton
          key={opt.label}
          ClickEffect={"scale"}
          className="default"
          onClick={() => handleSelect(opt)}
        >
          <p>{opt.label}</p>
        </CustomButton>
      ))}
      <div
        style={{
          borderTop: "1px solid var(--calender-borders)",
          margin: "4px 0",
        }}
      ></div>
      <CustomButton
        ClickEffect={"scale"}
        className="default"
        onClick={handleCustomClick}
      >
        <p>Custom...</p>
      </CustomButton>
    </div>
  );
}

function CustomRecurrencePopup({ startDate, onSave, closeParent }) {
  const { closePopup } = usePopup();
  const [frequency, setFrequency] = useState("WEEKLY");
  const [interval, setInterval] = useState(1);

  const startDT = DateTime.fromISO(startDate);
  const defaultDay = startDT.weekday === 7 ? 0 : startDT.weekday;

  const [daysOfWeek, setDaysOfWeek] = useState([defaultDay]);
  const [endType, setEndType] = useState("NEVER");
  const [endDate, setEndDate] = useState(null);
  const [count, setCount] = useState(13);

  const weekDays = ["S", "M", "T", "W", "T", "F", "S"];

  const toggleDay = (idx) => {
    if (daysOfWeek.includes(idx)) {
      if (daysOfWeek.length > 1)
        setDaysOfWeek((prev) => prev.filter((d) => d !== idx));
    } else setDaysOfWeek((prev) => [...prev, idx]);
  };

  const handleSave = () => {
    const rule = {
      type: frequency,
      interval: parseInt(interval),
      endOption: endType,
    };
    if (frequency === "WEEKLY") rule.daysOfWeek = daysOfWeek;
    if (endType === "DATE" && endDate) rule.endDate = endDate;
    else if (endType === "COUNT") rule.occurrenceCount = parseInt(count);

    onSave(rule);
    closePopup();
    if (closeParent) closeParent();
  };

  return (
    <div className={styles.customRecurrencePopup}>
      <div className={styles.crHeader}>
        <h2>Custom recurrence</h2>
      </div>

      <div className={styles.crRow}>
        <label>Repeat every</label>
        <div className={styles.crIntervalInputs}>
          <input
            type="number"
            min="1"
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            className={styles.crNumberInput}
          />
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className={styles.crSelect}
          >
            <option value="DAILY">day</option>
            <option value="WEEKLY">week</option>
            <option value="MONTHLY">month</option>
            <option value="YEARLY">year</option>
          </select>
        </div>
      </div>

      {frequency === "WEEKLY" && (
        <div className={styles.crRowVertical}>
          <label>Repeat on</label>
          <div className={styles.crWeekDays}>
            {weekDays.map((d, i) => (
              <button
                key={i}
                className={`${styles.crDayBtn} ${
                  daysOfWeek.includes(i) ? styles.active : ""
                }`}
                onClick={() => toggleDay(i)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.crRowVertical}>
        <label>Ends</label>
        <div className={styles.crRadioGroup}>
          <div className={styles.crRadioRow}>
            <input
              type="radio"
              checked={endType === "NEVER"}
              onChange={() => setEndType("NEVER")}
            />
            <span>Never</span>
          </div>

          <div className={styles.crRadioRow}>
            <input
              type="radio"
              checked={endType === "DATE"}
              onChange={() => setEndType("DATE")}
            />
            <span>On</span>
            <input
              type="date"
              disabled={endType !== "DATE"}
              className={styles.crDateInput}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className={styles.crRadioRow}>
            <input
              type="radio"
              checked={endType === "COUNT"}
              onChange={() => setEndType("COUNT")}
            />
            <span>After</span>
            <input
              type="number"
              min="1"
              value={count}
              disabled={endType !== "COUNT"}
              onChange={(e) => setCount(e.target.value)}
              className={styles.crNumberInputSmall}
            />
            <span>occurrences</span>
          </div>
        </div>
      </div>

      <div className={styles.crActions}>
        <CustomButton onClick={closePopup} className="default">
          Cancel
        </CustomButton>
        <CustomButton
          onClick={handleSave}
          className="default"
          style={{ color: "var(--main-cyan)" }}
        >
          Done
        </CustomButton>
      </div>
    </div>
  );
}

export default RecurrenceOptionsPopup;
