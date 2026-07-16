import CustomButton from "../../../../../../components/button/Button";
import { DateTime } from "luxon";
import { getUserZone } from "../../../../../../utils/getUserZone";
import { useTime } from "../../../../../../contexts/TimeContext";
import TimeListPopup from "../timeList/TimeListPopup";
import { useRef, useState } from "react";

function EditableTime({
  openEditorPopup,
  isRangeFullDay,
  setIsFullDay,
  updateGlobalState,
  eventDataRef,
  closeEditorPopup,
  timeDisplay,
  type = "start",
}) {
  const { timeZoneOffset } = useTime();

  const userZone = getUserZone(timeZoneOffset);

  const inputRef = useRef(null);
  const clickTimerRef = useRef(null);

  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(timeDisplay);

  function startEditing() {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }

    setInputValue(timeDisplay);
    setIsEditing(true);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  function parseTime(value) {
    if (typeof value !== "string") return null;

    let input = value.trim().toLowerCase().replace(/\s+/g, "");

    if (!input) return null;

    // Detect and remove AM/PM.
    let period = null;

    if (input.endsWith("am")) {
      period = "am";
      input = input.slice(0, -2);
    } else if (input.endsWith("pm")) {
      period = "pm";
      input = input.slice(0, -2);
    }

    // After removing AM/PM, only numbers and one ":" are allowed.
    if (!/^\d{1,4}(:\d{1,2})?$/.test(input)) {
      return null;
    }

    let hour;
    let minute = 0;

    if (input.includes(":")) {
      const parts = input.split(":");

      if (parts.length !== 2) {
        return null;
      }

      hour = Number(parts[0]);
      minute = Number(parts[1]);
    } else {
      // No colon.
      //
      // 9    -> 9:00
      // 10   -> 10:00
      // 930  -> 9:30
      // 1010 -> 10:10

      if (input.length <= 2) {
        hour = Number(input);
      } else if (input.length === 3) {
        hour = Number(input.slice(0, 1));
        minute = Number(input.slice(1));
      } else if (input.length === 4) {
        hour = Number(input.slice(0, 2));
        minute = Number(input.slice(2));
      } else {
        return null;
      }
    }

    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      return null;
    }

    // Minutes are always 0-59.
    if (minute < 0 || minute > 59) {
      return null;
    }

    // If AM/PM was provided, interpret as 12-hour time.
    if (period) {
      if (hour < 1 || hour > 12) {
        return null;
      }

      if (period === "am") {
        if (hour === 12) {
          hour = 0;
        }
      } else {
        if (hour !== 12) {
          hour += 12;
        }
      }
    } else {
      // No AM/PM means interpret as 24-hour time.
      if (hour < 0 || hour > 23) {
        return null;
      }
    }

    return {
      hour,
      minute,
    };
  }

  function saveCustomTime() {
    if (!isEditing) return;

    const parsedTime = parseTime(inputValue);

    if (!parsedTime) {
      setInputValue(timeDisplay);
      setIsEditing(false);
      return;
    }

    const currentStartLocal = DateTime.fromISO(
      eventDataRef.current.timeRange.start,
      { zone: "utc" },
    ).setZone(userZone);

    const currentEndLocal = DateTime.fromISO(
      eventDataRef.current.timeRange.end,
      { zone: "utc" },
    ).setZone(userZone);

    let newStart = currentStartLocal;
    let newEnd = currentEndLocal;

    if (type === "start") {
      const duration = currentEndLocal.diff(currentStartLocal);

      newStart = currentStartLocal.set({
        hour: parsedTime.hour,
        minute: parsedTime.minute,
        second: 0,
        millisecond: 0,
      });

      newEnd = newStart.plus(duration);
    } else {
      newEnd = currentEndLocal.set({
        hour: parsedTime.hour,
        minute: parsedTime.minute,
        second: 0,
        millisecond: 0,
      });

      if (newEnd <= currentStartLocal) {
        newEnd = newEnd.plus({ days: 1 });
      }
    }

    const newStartIso = newStart.toUTC().toISO({
      suppressMilliseconds: true,
    });

    const newEndIso = newEnd.toUTC().toISO({
      suppressMilliseconds: true,
    });

    const newIsFullDay = isRangeFullDay(newStartIso, newEndIso);

    setIsFullDay(newIsFullDay);

    updateGlobalState(
      {
        timeRange: {
          start: newStartIso,
          end: newEndIso,
        },
      },
      newIsFullDay,
    );

    setIsEditing(false);
  }

  function cancelEditing() {
    setInputValue(timeDisplay);
    setIsEditing(false);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      inputRef.current?.blur();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
    }
  }

  function openTimePopup(event) {
    const target = event.currentTarget;

    // Cancel any previously scheduled single-click.
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;

      const currentIso =
        type === "start"
          ? eventDataRef.current.timeRange.start
          : eventDataRef.current.timeRange.end;

      openEditorPopup({
        desktopType: "contextual",
        content: (
          <TimeListPopup
            baseDate={new Date(currentIso)}
            getCurrentDate={() =>
              new Date(
                type === "start"
                  ? eventDataRef.current.timeRange.start
                  : eventDataRef.current.timeRange.end,
              )
            }
            closePopup={closeEditorPopup}
            closePopup={closeEditorPopup}
            onPick={(date) => {
              const currentStartLocal = DateTime.fromISO(
                eventDataRef.current.timeRange.start,
                { zone: "utc" },
              ).setZone(userZone);

              const currentEndLocal = DateTime.fromISO(
                eventDataRef.current.timeRange.end,
                { zone: "utc" },
              ).setZone(userZone);

              let newStart = currentStartLocal;
              let newEnd = currentEndLocal;

              if (type === "start") {
                const duration = currentEndLocal.diff(currentStartLocal);

                newStart = currentStartLocal.set({
                  hour: date.getHours(),
                  minute: date.getMinutes(),
                  second: 0,
                  millisecond: 0,
                });

                newEnd = newStart.plus(duration);
              } else {
                newEnd = currentEndLocal.set({
                  hour: date.getHours(),
                  minute: date.getMinutes(),
                  second: 0,
                  millisecond: 0,
                });

                if (newEnd <= currentStartLocal) {
                  newEnd = newEnd.plus({ days: 1 });
                }
              }

              const newStartIso = newStart.toUTC().toISO({
                suppressMilliseconds: true,
              });

              const newEndIso = newEnd.toUTC().toISO({
                suppressMilliseconds: true,
              });

              const newIsFullDay = isRangeFullDay(newStartIso, newEndIso);

              setIsFullDay(newIsFullDay);

              updateGlobalState(
                {
                  timeRange: {
                    start: newStartIso,
                    end: newEndIso,
                  },
                },
                newIsFullDay,
              );
            }}
          />
        ),
        target,
        position: "bottomLeft",
      });
    }, 50);
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onBlur={saveCustomTime}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <CustomButton
      onClick={openTimePopup}
      onDoubleClick={startEditing}
      ClickEffect="scale"
      className="default"
    >
      <p>{timeDisplay}</p>
    </CustomButton>
  );
}

export default EditableTime;
