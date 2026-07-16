import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./TimeListPopup.module.css";

import {
  EVENT_TIME_SLOT_MINUTES,
  EVENT_TIME_SLOTS_PER_DAY,
} from "../../../../../../constants/constants";

import { useUserSettings } from "../../../../../../contexts/UserSettingsContext";

function TimeListPopup({ baseDate, getCurrentDate, onPick, closePopup }) {
  const { userSettings } = useUserSettings();

  const is12Format = userSettings.timeFormat === "12h";

  const listRef = useRef(null);
  const itemRefs = useRef([]);
  const isKeyboardNavigationRef = useRef(false);

  const [selectedDate] = useState(() => new Date(baseDate));
  const [currentDate, setCurrentDate] = useState(() => new Date(baseDate));
  const [highlightedIndex, setHighlightedIndex] = useState(() => {
    const minutes = baseDate.getHours() * 60 + baseDate.getMinutes();

    return Math.min(
      Math.round(minutes / EVENT_TIME_SLOT_MINUTES),
      EVENT_TIME_SLOTS_PER_DAY - 1,
    );
  });

  const timeSlots = useMemo(() => {
    const slots = [];
    const startOfDay = new Date(baseDate);

    startOfDay.setHours(0, 0, 0, 0);

    for (let index = 0; index < EVENT_TIME_SLOTS_PER_DAY; index += 1) {
      const date = new Date(startOfDay);

      date.setMinutes(index * EVENT_TIME_SLOT_MINUTES);

      slots.push(date);
    }

    return slots;
  }, [baseDate]);

  const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();

  const isExactSlot = currentMinutes % EVENT_TIME_SLOT_MINUTES === 0;

  useEffect(() => {
    const initialIndex = Math.min(
      Math.round(currentMinutes / EVENT_TIME_SLOT_MINUTES),
      EVENT_TIME_SLOTS_PER_DAY - 1,
    );

    setHighlightedIndex(initialIndex);

    requestAnimationFrame(() => {
      itemRefs.current[initialIndex]?.scrollIntoView({
        block: "center",
        behavior: "auto",
      });

      listRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    if (!getCurrentDate) {
      return undefined;
    }

    const syncCurrentDate = () => {
      const latestDate = getCurrentDate();

      if (!(latestDate instanceof Date) || Number.isNaN(latestDate.getTime())) {
        return;
      }

      setCurrentDate((previousDate) => {
        if (previousDate.getTime() === latestDate.getTime()) {
          return previousDate;
        }

        return latestDate;
      });

      if (isKeyboardNavigationRef.current) {
        isKeyboardNavigationRef.current = false;
        return;
      }

      const latestMinutes =
        latestDate.getHours() * 60 + latestDate.getMinutes();

      const nextIndex = Math.min(
        Math.round(latestMinutes / EVENT_TIME_SLOT_MINUTES),
        EVENT_TIME_SLOTS_PER_DAY - 1,
      );

      setHighlightedIndex(nextIndex);
    };

    syncCurrentDate();

    const intervalId = setInterval(syncCurrentDate, 100);

    return () => {
      clearInterval(intervalId);
    };
  }, [getCurrentDate]);

  const selectKeyboardTime = (index) => {
    const date = timeSlots[index];

    isKeyboardNavigationRef.current = true;

    setHighlightedIndex(index);
    setCurrentDate(date);

    itemRefs.current[index]?.scrollIntoView({
      block: "nearest",
      behavior: "auto",
    });

    onPick(date);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();

      const nextIndex = (highlightedIndex + 1) % timeSlots.length;

      selectKeyboardTime(nextIndex);

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      const nextIndex =
        (highlightedIndex - 1 + timeSlots.length) % timeSlots.length;

      selectKeyboardTime(nextIndex);

      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      if (highlightedIndex !== -1) {
        onPick(timeSlots[highlightedIndex]);
        closePopup?.();
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closePopup?.();
    }
  };

  const handleItemClick = (date) => {
    onPick(date);
    closePopup?.();
  };

  const formatTime = (date) => {
    if (is12Format) {
      return date
        .toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
        .toLowerCase();
    }

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  return (
    <div
      className={`${styles.timeListPopup} default-scrollbar`}
      ref={listRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      {!isExactSlot && (
        <button
          type="button"
          className={`${styles.timeBtn} ${styles.selectedTime}`}
          onClick={() => handleItemClick(currentDate)}
        >
          {formatTime(currentDate)}
        </button>
      )}

      {timeSlots.map((date, index) => {
        const isSelected =
          date.getHours() === selectedDate.getHours() &&
          date.getMinutes() === selectedDate.getMinutes();

        const isHighlighted = highlightedIndex === index;

        return (
          <button
            type="button"
            key={date.getTime()}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            className={`${styles.timeBtn} ${
              isSelected ? styles.selectedTime : ""
            } ${isHighlighted ? styles.highlightedTime : ""}`}
            onClick={() => handleItemClick(date)}
            onMouseEnter={() => setHighlightedIndex(index)}
          >
            {formatTime(date)}
          </button>
        );
      })}
    </div>
  );
}

export default TimeListPopup;
