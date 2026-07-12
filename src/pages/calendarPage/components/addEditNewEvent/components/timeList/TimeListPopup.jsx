import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./TimeListPopup.module.css";
import {
  EVENT_TIME_SLOT_MINUTES,
  EVENT_TIME_SLOTS_PER_DAY,
} from "../../../../../../constants/constants";

function TimeListPopup({ baseDate, onPick, is12Format, closePopup }) {
  const listRef = useRef(null);
  const itemRefs = useRef([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const timeSlots = useMemo(() => {
    const slots = [];
    const startOfDay = new Date(baseDate);
    startOfDay.setHours(0, 0, 0, 0);

    for (let i = 0; i < EVENT_TIME_SLOTS_PER_DAY; i++) {
      const d = new Date(startOfDay);

      d.setMinutes(i * EVENT_TIME_SLOT_MINUTES);

      slots.push(d);
    }
    return slots;
  }, [baseDate]);

  useEffect(() => {
    if (!listRef.current) return;

    const currentMinutes = baseDate.getHours() * 60 + baseDate.getMinutes();
    let closestIndex = Math.round(currentMinutes / EVENT_TIME_SLOT_MINUTES);

    if (closestIndex >= EVENT_TIME_SLOTS_PER_DAY) {
      closestIndex = 0;
    }

    setHighlightedIndex(closestIndex);
    if (itemRefs.current[closestIndex])
      itemRefs.current[closestIndex].scrollIntoView({
        block: "center",
        behavior: "auto",
      });

    listRef.current.focus();
  }, []);

  const scrollToItem = (index) => {
    if (itemRefs.current[index])
      itemRefs.current[index].scrollIntoView({
        block: "center",
        behavior: "auto",
      });
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = (highlightedIndex + 1) % timeSlots.length;
      setHighlightedIndex(next);
      scrollToItem(next);
      onPick(timeSlots[next]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = (highlightedIndex - 1 + timeSlots.length) % timeSlots.length;
      setHighlightedIndex(next);
      scrollToItem(next);
      onPick(timeSlots[next]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex !== -1) {
        onPick(timeSlots[highlightedIndex]);
        if (closePopup) closePopup();
      }
    }
  };

  const handleItemClick = (date) => {
    onPick(date);
    if (closePopup) closePopup();
  };

  const formatTime = (date) =>
    is12Format
      ? date
          .toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })
          .toLowerCase()
      : date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });

  return (
    <div
      className={`${styles.timeListPopup} default-scrollbar`}
      ref={listRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      {timeSlots.map((date, i) => (
        <button
          key={i}
          ref={(el) => (itemRefs.current[i] = el)}
          className={`${styles.timeBtn} ${
            date.getHours() === baseDate.getHours() &&
            date.getMinutes() === baseDate.getMinutes()
              ? styles.selectedTime
              : ""
          } ${highlightedIndex === i ? styles.highlightedTime : ""}`}
          onClick={() => handleItemClick(date)}
          onMouseEnter={() => setHighlightedIndex(i)}
        >
          {formatTime(date)}
        </button>
      ))}
    </div>
  );
}

export default TimeListPopup;
