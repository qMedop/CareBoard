import styles from "../../CalendarPage.module.css";
import { useTime } from "../../../../contexts/TimeContext";
import { useData } from "../../../../contexts/AuthContext";
import { useState } from "react";
import { useRef } from "react";
import { getMonthLayout } from "../../../../utils/getMonthLayout";
import { useEffect } from "react";
import { DateTime } from "luxon";
import { getLocalDateString } from "../../../../utils/getLocalDateString";
import { usePopup } from "../../../../contexts/PopupContext";
import { useNotification } from "../../../../contexts/NotificationContext";
import CustomButton from "../../../../components/button/Button";
import EventInfoPopup from "../EventInfoPopup/EventInfoPopup";
import AddEditNewEvent from "../addEditNewEvent/AddEditNewEvent";
import { NextBtnIcon, PrevBtnIcon } from "../../../../assets/icons/Icon";
import RecurrenceUpdatePopup from "../RecurrenceUpdatePopup/RecurrenceUpdatePopup";
import { getUserZone } from "../../../../utils/getUserZone";
import { DAYS_OF_WEEK } from "../../../../constants/constants";
import { useUserSettings } from "../../../../contexts/UserSettingsContext";

function CalendarContentMonth({
  currentDate,
  expandedEvents,
  newEvent,
  timeZoneOffset,
  handleNewEventClick,
  setNewEvent,
  editingEventId,
  setEditingEventId,
  infoPopupEventId,
  setInfoPopupEventId,
  handleRecurrenceAndSave,
}) {
  const { loadedEvents, setLoadedEvents } = useTime();
  const { userSettings } = useUserSettings();
  const { openPopup, closePopup, hidePopup, showPopup } = usePopup();
  const { updateEvent } = useData();
  const { notify } = useNotification();

  const [hoveredDate, setHoveredDate] = useState(null);
  const [hoveredEventId, setHoveredEventId] = useState(null);
  const [expandedDayStr, setExpandedDayStr] = useState(null);
  const containerRef = useRef(null);
  const [maxSlotsPerWeek, setMaxSlotsPerWeek] = useState([]);
  const addEditRef = useRef(null);
  const [dragState, setDragState] = useState({
    active: false,
    event: null,
    offsetDays: 0,
    startX: 0,
    startY: 0,
  });

  const weekStartDay = userSettings?.weekStartDay ?? 1;

  const { weeks } = getMonthLayout(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    weekStartDay,
  );

  const orderedDays = Array.from(
    { length: 7 },
    (_, i) => DAYS_OF_WEEK[(weekStartDay + i) % 7],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      const rows = containerRef.current.querySelectorAll(`.${styles.weekRow}`);
      const newSlots = [];

      rows.forEach((row) => {
        const dropZone = row.querySelector('[id^="top-"]');
        if (dropZone) {
          const availableHeight = dropZone.clientHeight;
          newSlots.push(Math.max(2, Math.floor(availableHeight / 24)));
        } else {
          newSlots.push(3);
        }
      });

      setMaxSlotsPerWeek((prev) =>
        JSON.stringify(prev) === JSON.stringify(newSlots) ? prev : newSlots,
      );
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [weeks.length]);

  const userZone = getUserZone(timeZoneOffset);

  const executeDropSave = async (event, offsetDays) => {
    const origStart = DateTime.fromISO(event.timeRange.start, { zone: "utc" });
    const origEnd = DateTime.fromISO(event.timeRange.end, { zone: "utc" });

    const newStart = origStart.plus({ days: offsetDays });
    const newEnd = origEnd.plus({ days: offsetDays });

    const cleanFinalData = {
      ...event,
      timeRange: {
        start: newStart.toUTC().toISO({ suppressMilliseconds: true }),
        end: newEnd.toUTC().toISO({ suppressMilliseconds: true }),
      },
      start: newStart.toUTC().toISO({ suppressMilliseconds: true }),
      end: newEnd.toUTC().toISO({ suppressMilliseconds: true }),
    };

    delete cleanFinalData.id;
    delete cleanFinalData.group_id;
    delete cleanFinalData.isGhost;
    delete cleanFinalData.ghostId;

    const realId = event.id;
    const parentEvent = loadedEvents.find((ev) => ev.id === realId) || event;
    const isRecurring =
      parentEvent.recurrence && parentEvent.recurrence.type !== "NONE";
    const isUnsaved = event.isUnsaved;
    const isActivelyEditing = String(editingEventId) === realId.toString();

    if (isUnsaved) {
      if (typeof setNewEvent === "function") {
        setNewEvent((prev) => (prev ? { ...prev, ...cleanFinalData } : prev));
      }
      setTimeout(() => {
        const targetDiv =
          document.querySelector(`[data-sourceid="${realId}"]`) ||
          document.body;
        showPopup("edit-popup", targetDiv);
      }, 50);
      return;
    }

    if (isUnsaved || isActivelyEditing) {
      setLoadedEvents((prev) =>
        prev.map((ev) =>
          ev.id === realId ? { ...ev, ...cleanFinalData } : ev,
        ),
      );
      if (isUnsaved)
        setNewEvent((prev) => (prev ? { ...prev, ...cleanFinalData } : prev));

      setTimeout(() => {
        const targetDiv =
          document.querySelector(`[data-sourceid="${realId}"]`) ||
          document.body;
        showPopup("edit-popup", targetDiv);
      }, 50);
      return;
    }

    const consoleLogProgress = (status) => {
      const notificationId = `event-save-progress-${realId}`;

      if (status === "Saving")
        notify({
          id: notificationId,
          message: "Saving calendar...",
          type: "loading",
        });
      if (status === "encrypting")
        notify({
          id: notificationId,
          message: "Encrypting Event...",
          type: "loading",
        });
      if (status === "uploading")
        notify({
          id: notificationId,
          message: "Uploading Event...",
          type: "loading",
        });
      if (status === "success")
        notify({
          id: notificationId,
          message: "Event Moved Successfully!",
          type: "success",
        });
      if (status === "error")
        notify({
          id: notificationId,
          message: "Failed to Move Event",
          type: "error",
        });
    };

    if (!isRecurring) {
      const preEditSnapshot = [...loadedEvents];
      try {
        setLoadedEvents((prev) =>
          prev.map((ev) =>
            ev.id === parentEvent.id ? { ...ev, ...cleanFinalData } : ev,
          ),
        );
        consoleLogProgress("Saving");
        const result = await updateEvent(
          { id: parentEvent.id, ...cleanFinalData },
          consoleLogProgress,
        );

        if (!result?.success) throw new Error("Failed");
        consoleLogProgress("success");
      } catch (err) {
        consoleLogProgress("error");
        setLoadedEvents(preEditSnapshot);
      }
    } else {
      const oldDateStr = DateTime.fromISO(event.timeRange.start)
        .setZone(userZone)
        .toISODate();
      const newDateStr = newStart.setZone(userZone).toISODate();
      const isDayChange = oldDateStr !== newDateStr;

      let allowedModes = ["THIS_EVENT", "THIS_AND_FOLLOWING"];
      if (!isDayChange) allowedModes.push("ALL_EVENTS");

      openPopup(
        "centered",
        () => (
          <RecurrenceUpdatePopup
            allowedModes={allowedModes}
            onClose={closePopup}
            context={{
              parentEvent,
              currentEvent: event,
              finalData: cleanFinalData,
              deltaMs: offsetDays * 24 * 60 * 60 * 1000,
              durationDeltaMs: 0,
            }}
          />
        ),
        document.body,
        "center",
      );
    }
  };

  useEffect(() => {
    if (!dragState.event) return;

    const handleMouseMove = (e) => {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;

      if (!dragState.active && Math.sqrt(dx * dx + dy * dy) > 5) {
        setDragState((prev) => ({ ...prev, active: true }));
        document.body.classList.add("dragging");
        hidePopup("edit-popup");
        closePopup("info-popup");
        closePopup("carousel-popup");
      }

      if (dragState.active) {
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const cell = target?.closest("[data-date]");

        if (cell) {
          const targetDateStr = cell.getAttribute("data-date");
          const targetDate = DateTime.fromISO(targetDateStr, {
            zone: userZone,
          }).startOf("day");
          const origStart = DateTime.fromISO(dragState.event.timeRange.start, {
            zone: "utc",
          })
            .setZone(userZone)
            .startOf("day");
          const diffDays = Math.round(targetDate.diff(origStart, "days").days);
          if (dragState.offsetDays !== diffDays) {
            setDragState((prev) => ({ ...prev, offsetDays: diffDays }));
          }
        }
      }
    };

    const handleMouseUp = () => {
      document.body.classList.remove("dragging");

      const { active, event, offsetDays } = dragState;

      setDragState({
        active: false,
        event: null,
        offsetDays: 0,
        startX: 0,
        startY: 0,
      });

      if (active && event) {
        if (offsetDays !== 0) {
          executeDropSave(event, offsetDays);
        } else {
          const realId = event.id;
          setTimeout(() => {
            const targetDiv =
              document.querySelector(`[data-sourceid="${realId}"]`) ||
              document.body;
            showPopup("edit-popup", targetDiv);
          }, 50);
        }
      }
    };

    window.addEventListener("pointermove", handleMouseMove);
    window.addEventListener("pointerup", handleMouseUp);

    return () => {
      window.removeEventListener("pointermove", handleMouseMove);
      window.removeEventListener("pointerup", handleMouseUp);
    };
  }, [dragState, userZone, loadedEvents]);

  const handleEventMouseDown = (e, event) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    const realId = event.id;
    const isCurrentlyEditing =
      String(editingEventId) === String(realId) || event.isUnsaved;

    if (editingEventId && !isCurrentlyEditing) {
      return;
    }

    if (!isCurrentlyEditing) {
      if (closePopup("edit-popup") === false) return;
    }
    closePopup("info-popup");
    if (isCurrentlyEditing) {
      hidePopup("edit-popup");
    }

    // 🔴 Block Drag initialization for shared events!
    if (event.isShared) return;

    setDragState({
      active: false,
      event: event,
      offsetDays: 0,
      startX: e.clientX,
      startY: e.clientY,
    });
  };

  const handleEventClick = (e, originalId) => {
    e.stopPropagation();
    if (dragState.active) return;
    if (closePopup("edit-popup") === false) return;

    const div = e.currentTarget;

    const openEditPopup = (eventId) => {
      closePopup("info-popup");
      setEditingEventId(eventId);
      setTimeout(() => {
        const targetDiv =
          document.querySelector(`[data-sourceid="${eventId}"]`) ||
          document.body;

        const forceClose = { current: false };

        const handleDiscard = () => {
          setEditingEventId(null);
          forceClose.current = true;
          closePopup("edit-popup", true);
        };

        const attemptClose = () => {
          if (forceClose.current) return true;
          if (addEditRef.current?.hasUnsavedChanges()) {
            addEditRef.current.requestClose();
            return false;
          }
          handleDiscard();
          return true;
        };

        openPopup(
          "movable",
          () => (
            <AddEditNewEvent
              eventId={eventId}
              ref={addEditRef}
              onClose={handleDiscard}
              popupId="edit-popup"
            />
          ),
          targetDiv,
          "right",
          24,
          attemptClose,
          "edit-popup",
        );
      }, 100);
    };

    closePopup("info-popup");
    setInfoPopupEventId(originalId);

    const attemptInfoClose = () => {
      setInfoPopupEventId(null);
      return true;
    };

    openPopup(
      "contextual",
      () => (
        <EventInfoPopup
          div={div}
          eventId={originalId}
          onEdit={openEditPopup}
          popupId="info-popup"
          handleRecurrenceAndSave={handleRecurrenceAndSave}
        />
      ),
      div,
      "rightTop",
      24,
      attemptInfoClose,
      "info-popup",
    );
  };

  // 🔴 DEDUPLICATE GLOBAL EVENTS
  const allEventsRaw = newEvent
    ? [...expandedEvents, newEvent]
    : expandedEvents;
  let globalAllEvents = Array.from(
    new Map(allEventsRaw.map((e) => [e.id, e])).values(),
  );

  if (dragState.active && dragState.event) {
    const origStart = DateTime.fromISO(dragState.event.timeRange.start, {
      zone: "utc",
    });
    const origEnd = DateTime.fromISO(dragState.event.timeRange.end, {
      zone: "utc",
    });
    const newStart = origStart.plus({ days: dragState.offsetDays });
    const newEnd = origEnd.plus({ days: dragState.offsetDays });

    globalAllEvents = [
      ...globalAllEvents,
      {
        ...dragState.event,
        ghostId: `ghost-${dragState.event.id}`,
        isGhost: true,
        timeRange: { start: newStart.toISO(), end: newEnd.toISO() },
      },
    ];
  }

  return (
    <>
      <div
        ref={containerRef}
        className={styles.monthLayout}
        style={{ height: "100%", display: "flex", flexDirection: "column" }}
      >
        {weeks.map((week, weekIndex) => {
          const weekStartStr = getLocalDateString(week[0].date);
          const weekEndStr = getLocalDateString(week[6].date);

          const weekStartMs = DateTime.fromISO(weekStartStr, { zone: userZone })
            .startOf("day")
            .toMillis();
          const weekEndMs = DateTime.fromISO(weekEndStr, { zone: userZone })
            .endOf("day")
            .toMillis();

          const baseTop = weekIndex === 0 ? 72 : 56;

          const weekEventsRaw = globalAllEvents.filter((ev) => {
            if (!ev.timeRange?.start || !ev.timeRange?.end) return false;

            const evStartMs = DateTime.fromISO(ev.timeRange.start, {
              zone: "utc",
            })
              .setZone(userZone)
              .toMillis();

            const endDt = DateTime.fromISO(ev.timeRange.end, {
              zone: "utc",
            }).setZone(userZone);

            let evEndMs = endDt.toMillis();
            if (endDt.hour === 0 && endDt.minute === 0) {
              evEndMs -= 1000;
            }

            return evStartMs <= weekEndMs && evEndMs >= weekStartMs;
          });

          const hasActiveUnsavedThisWeek = weekEventsRaw.some((ev) => {
            return ev.isUnsaved || ev.id === String(editingEventId);
          });

          const MAX_SLOTS = maxSlotsPerWeek[weekIndex] || 3;
          const hoverReserved = hasActiveUnsavedThisWeek ? 0 : 1;
          const SAFE_SLOTS = Math.max(1, MAX_SLOTS - hoverReserved);
          const MAX_VISIBLE_EVENTS = Math.max(0, SAFE_SLOTS - 1);

          weekEventsRaw.sort((a, b) => {
            const aId = a.id;
            const bId = b.id;
            const aIsTop = a.isUnsaved || aId === String(editingEventId);
            const bIsTop = b.isUnsaved || bId === String(editingEventId);

            if (aIsTop && !bIsTop) return -1;
            if (!aIsTop && bIsTop) return 1;

            const aStart = DateTime.fromISO(a.timeRange.start, {
              zone: "utc",
            }).setZone(userZone);
            const bStart = DateTime.fromISO(b.timeRange.start, {
              zone: "utc",
            }).setZone(userZone);

            let aEnd = DateTime.fromISO(a.timeRange.end, {
              zone: "utc",
            }).setZone(userZone);
            let bEnd = DateTime.fromISO(b.timeRange.end, {
              zone: "utc",
            }).setZone(userZone);

            if (aEnd.hour === 0 && aEnd.minute === 0)
              aEnd = aEnd.minus({ days: 1 });
            if (bEnd.hour === 0 && bEnd.minute === 0)
              bEnd = bEnd.minus({ days: 1 });

            const aDays =
              Math.round(
                aEnd.startOf("day").diff(aStart.startOf("day"), "days").days,
              ) + 1;
            const bDays =
              Math.round(
                bEnd.startOf("day").diff(bStart.startOf("day"), "days").days,
              ) + 1;

            const aIsMultiOrFull = a.isFullDay || aDays > 1;
            const bIsMultiOrFull = b.isFullDay || bDays > 1;

            if (aIsMultiOrFull && !bIsMultiOrFull) return -1;
            if (!aIsMultiOrFull && bIsMultiOrFull) return 1;

            if (aStart.toMillis() !== bStart.toMillis()) {
              return aStart.toMillis() - bStart.toMillis();
            }

            if (aIsMultiOrFull && bIsMultiOrFull && aDays !== bDays) {
              return bDays - aDays;
            }

            const aDurationMs = aEnd.toMillis() - aStart.toMillis();
            const bDurationMs = bEnd.toMillis() - bStart.toMillis();

            return bDurationMs - aDurationMs;
          });

          const slotsByDay = Array(7)
            .fill(null)
            .map(() => []);
          const eventLayouts = [];

          weekEventsRaw.forEach((ev) => {
            const evStart = DateTime.fromISO(ev.timeRange.start, {
              zone: "utc",
            }).setZone(userZone);
            let evEnd = DateTime.fromISO(ev.timeRange.end, {
              zone: "utc",
            }).setZone(userZone);

            if (evEnd.hour === 0 && evEnd.minute === 0)
              evEnd = evEnd.minus({ days: 1 });

            const isMultiDay =
              ev.isFullDay ||
              evEnd.startOf("day").toMillis() >
                evStart.startOf("day").toMillis();

            const clampedStartMs = Math.max(evStart.toMillis(), weekStartMs);
            const clampedEndMs = Math.min(evEnd.toMillis(), weekEndMs);

            const clampedStartStr = DateTime.fromMillis(clampedStartMs)
              .setZone(userZone)
              .toISODate();
            const clampedEndStr = DateTime.fromMillis(clampedEndMs)
              .setZone(userZone)
              .toISODate();

            const startDayIdx = week.findIndex(
              (d) => getLocalDateString(d.date) === clampedStartStr,
            );
            const endDayIdx = week.findIndex(
              (d) => getLocalDateString(d.date) === clampedEndStr,
            );

            if (startDayIdx === -1 || endDayIdx === -1) return;

            let slot = 0;
            while (true) {
              let available = true;
              for (let i = startDayIdx; i <= endDayIdx; i++) {
                const occupant = slotsByDay[i][slot];
                if (occupant) {
                  if (
                    ev.isGhost &&
                    dragState.event &&
                    occupant.id === dragState.event.id
                  ) {
                    continue;
                  }
                  available = false;
                }
              }
              if (available) break;
              slot++;
            }

            for (let i = startDayIdx; i <= endDayIdx; i++) {
              slotsByDay[i][slot] = ev;
            }

            eventLayouts.push({
              event: ev,
              startDayIdx,
              endDayIdx,
              slot,
              isMultiDay,
              contBackward: evStart.toMillis() < weekStartMs,
              contForward: evEnd.toMillis() > weekEndMs,
            });
          });

          const dayMaxVisibles = slotsByDay.map((slots) => {
            const total = slots.filter((ev) => ev && !ev.isGhost).length;
            return total <= SAFE_SLOTS ? SAFE_SLOTS : MAX_VISIBLE_EVENTS;
          });

          return (
            <div key={weekIndex} className={styles.weekRow}>
              {week.map((dayObj, dayIndex) => {
                const dateStr = getLocalDateString(dayObj.date);
                const dailySlots = slotsByDay[dayIndex] || [];
                const totalDayEvents = dailySlots.filter(
                  (ev) => ev && !ev.isGhost,
                ).length;
                const dayMaxVisible = dayMaxVisibles[dayIndex];

                let maxVis = -1;
                for (let i = 0; i < dayMaxVisible; i++) {
                  if (dailySlots[i] && !dailySlots[i].isGhost) maxVis = i;
                }
                const hasMore = totalDayEvents > dayMaxVisible;
                const previewSlot = hasMore ? dayMaxVisible + 1 : maxVis + 1;
                const safeSlot = Math.min(previewSlot, MAX_SLOTS - 1);
                const hoverTopPx = baseTop + safeSlot * 24;

                return (
                  <div
                    key={dayIndex}
                    className={`${styles.dayCell} ${styles[dayObj.type]} ${dayObj.isToday ? styles.today : ""}`}
                    style={{ flex: 1, position: "relative" }}
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onMouseEnter={() => setHoveredDate(null)}
                    >
                      <p className={styles.dayOfWeek}>
                        {orderedDays[dayIndex]}
                      </p>
                      <CustomButton
                        className={styles.dayButton}
                        link={true}
                        href={`/calendar/day/${dayObj.date.getDate()}/${dayObj.date.getMonth() + 1}/${dayObj.date.getFullYear()}`}
                      >
                        {dayObj.day}
                      </CustomButton>
                    </div>
                    <div
                      id={`top-${dateStr}`}
                      data-date={dateStr}
                      onClick={(e) => {
                        if (closePopup() === false) return;
                        handleNewEventClick(e);
                      }}
                      onMouseEnter={() => setHoveredDate(dateStr)}
                      onMouseLeave={() => setHoveredDate(null)}
                      style={{
                        position: "absolute",
                        top: `${baseTop}px`,
                        bottom: 0,
                        left: 0,
                        right: 0,
                        cursor: "pointer",
                        zIndex: 1,
                      }}
                    />
                    {hoveredDate === dateStr &&
                      !dragState.active &&
                      expandedDayStr !== dateStr && (
                        <div
                          className={styles.monthEvent}
                          style={{
                            top: `${hoverTopPx}px`,
                            left: "4px",
                            right: "4px",
                            backgroundColor: "rgba(0, 0, 0, 0.2)",
                            pointerEvents: "none",
                            zIndex: 15,
                            position: "absolute",
                          }}
                        ></div>
                      )}
                  </div>
                );
              })}

              <div className={`${styles.monthEventContainer}`}>
                {eventLayouts.flatMap((layout, idx) => {
                  const isGhost = layout.event.isGhost;
                  const segments = [];

                  if (isGhost) {
                    let overflows = false;
                    for (
                      let d = layout.startDayIdx;
                      d <= layout.endDayIdx;
                      d++
                    ) {
                      if (layout.slot >= dayMaxVisibles[d]) {
                        overflows = true;
                        break;
                      }
                    }
                    const effectiveSlot = overflows ? 0 : layout.slot;
                    segments.push({
                      start: layout.startDayIdx,
                      end: layout.endDayIdx,
                      slot: effectiveSlot,
                    });
                  } else {
                    let currentSegment = null;
                    for (
                      let d = layout.startDayIdx;
                      d <= layout.endDayIdx;
                      d++
                    ) {
                      const isVisible = layout.slot < dayMaxVisibles[d];
                      if (isVisible) {
                        if (!currentSegment) {
                          currentSegment = {
                            start: d,
                            end: d,
                            slot: layout.slot,
                          };
                        } else {
                          currentSegment.end = d;
                        }
                      } else {
                        if (currentSegment) {
                          segments.push(currentSegment);
                          currentSegment = null;
                        }
                      }
                    }
                    if (currentSegment) segments.push(currentSegment);
                  }

                  return segments.map((seg, segIdx) => {
                    const leftPct = (seg.start / 7) * 100;
                    const widthPct = ((seg.end - seg.start + 1) / 7) * 100;

                    const realId = layout.event.id;
                    const isUnsaved = layout.event.isUnsaved;

                    const topPx = baseTop + seg.slot * 24;

                    const isDraggedOriginal =
                      dragState.active &&
                      dragState.event &&
                      realId === dragState.event.id &&
                      !isGhost;

                    const isHovered = hoveredEventId === realId;
                    const isEditing =
                      String(editingEventId) === realId.toString();
                    const isInfoOpen =
                      String(infoPopupEventId) === realId.toString();

                    const isActive =
                      isHovered || isUnsaved || isEditing || isInfoOpen;

                    const hasShadow =
                      (isGhost || isUnsaved || isEditing || isInfoOpen) &&
                      !isDraggedOriginal;

                    const segContBackward =
                      layout.contBackward || seg.start > layout.startDayIdx;
                    const segContForward =
                      layout.contForward || seg.end < layout.endDayIdx;

                    return (
                      <div
                        key={`${layout.event.ghostId || layout.event.id}-${idx}-${segIdx}`}
                        data-sourceid={realId}
                        onDragStart={(e) => e.preventDefault()}
                        onMouseDown={
                          !isGhost
                            ? (e) => {
                                e.stopPropagation();
                                handleEventMouseDown(e, layout.event);
                              }
                            : undefined
                        }
                        onClick={
                          !isGhost
                            ? (e) => handleEventClick(e, realId)
                            : undefined
                        }
                        onMouseEnter={
                          !isGhost ? () => setHoveredEventId(realId) : undefined
                        }
                        onMouseLeave={
                          !isGhost ? () => setHoveredEventId(null) : undefined
                        }
                        className={`${styles.monthEvent}`}
                        style={{
                          left: `calc(${leftPct}% + 4px)`,
                          width: `calc(${widthPct}% - 8px)`,
                          top: `${topPx}px`,
                          pointerEvents:
                            isGhost || dragState.active ? "none" : "auto",
                          cursor: isGhost ? "grabbing" : "pointer",
                          zIndex: isGhost
                            ? 50
                            : isUnsaved
                              ? 30
                              : isEditing || isInfoOpen
                                ? 20
                                : 10,
                          opacity: isGhost ? 0.9 : isDraggedOriginal ? 0.3 : 1,
                          userSelect: "none",
                          WebkitUserSelect: "none",
                          boxShadow: hasShadow
                            ? "0px 0px 8px 1px #000000b5"
                            : "none",
                          filter:
                            isHovered && !isGhost ? "brightness(0.95)" : "none",
                          transition: isGhost
                            ? "none"
                            : "left 0.1s ease, width 0.1s ease, top 0.1s ease, box-shadow 0.1s ease",
                        }}
                      >
                        {layout.isMultiDay ? (
                          <div
                            className={`${styles.multiDayMonthEvent}`}
                            style={{
                              backgroundColor: layout.event.color,
                              borderTopLeftRadius: segContBackward
                                ? "0"
                                : "4px",
                              borderBottomLeftRadius: segContBackward
                                ? "0"
                                : "4px",
                              borderTopRightRadius: segContForward
                                ? "0"
                                : "4px",
                              borderBottomRightRadius: segContForward
                                ? "0"
                                : "4px",
                            }}
                          >
                            <span>{layout.event.title || "(No title)"}</span>
                          </div>
                        ) : (
                          <div
                            className={`${styles.monthDayEvent}`}
                            style={{
                              backgroundColor:
                                isActive || isGhost
                                  ? layout.event.color
                                  : "transparent",
                              transition: "background-color 0.1s ease",
                            }}
                          >
                            <div
                              className={styles.circle}
                              style={{
                                backgroundColor: layout.event.color,
                                flexShrink: 0,
                              }}
                            />
                            <span
                              className={styles.monthEventTitle}
                              style={{
                                color:
                                  isActive || isGhost
                                    ? "#111"
                                    : "var(--text-light)",
                              }}
                            >
                              {`${DateTime.fromISO(layout.event.timeRange.start)
                                .setZone(userZone)
                                .toFormat(
                                  userSettings?.timeFormat === "12h"
                                    ? "h:mm a"
                                    : "HH:mm",
                                )
                                .toLowerCase()
                                .split(" ")
                                .join(
                                  "",
                                )} ${layout.event.title || "(No title)"}`}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  });
                })}

                {slotsByDay.map((slots, dayIdx) => {
                  const dateStr = getLocalDateString(week[dayIdx].date);
                  const totalDayEvents = slots.filter(
                    (ev) => ev && !ev.isGhost,
                  ).length;
                  const dayMaxVisible = dayMaxVisibles[dayIdx];

                  if (totalDayEvents > dayMaxVisible) {
                    const hiddenCount = totalDayEvents - dayMaxVisible;
                    const leftPct = (dayIdx / 7) * 100;
                    const topPx = baseTop + dayMaxVisible * 24;
                    console.log(leftPct, topPx);
                    return (
                      <CustomButton
                        key={`more-${weekIndex}-${dayIdx}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openPopup(
                            "centered",
                            () => (
                              <ExpandedDayCarousel
                                initialDateStr={dateStr}
                                onClose={() => closePopup("carousel-popup")}
                                allEvents={globalAllEvents}
                                userZone={userZone}
                                styles={styles}
                                handleEventMouseDown={handleEventMouseDown}
                                handleEventClick={handleEventClick}
                                hoveredEventId={hoveredEventId}
                                setHoveredEventId={setHoveredEventId}
                                editingEventId={editingEventId}
                                infoPopupEventId={infoPopupEventId}
                              />
                            ),
                            null,
                            "center",
                            null,
                            () => true,
                            "carousel-popup",
                          );
                        }}
                        className={`default ${styles.monthEvent} ${styles.moreButton}`}
                        style={{
                          left: `${leftPct}%`,
                          width: `${100 / 7}%`,
                          top: `${topPx}px`,
                          pointerEvents: dragState.active ? "none" : "auto",
                        }}
                      >
                        +{hiddenCount} more
                      </CustomButton>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ExpandedDayCarousel({
  initialDateStr,
  onClose,
  allEvents,
  userZone,
  styles,
  handleEventMouseDown,
  handleEventClick,
  hoveredEventId,
  setHoveredEventId,
  editingEventId,
}) {
  const [activeDate, setActiveDate] = useState(
    DateTime.fromISO(initialDateStr, { zone: userZone }).startOf("day"),
  );

  useEffect(() => {
    setActiveDate(
      DateTime.fromISO(initialDateStr, { zone: userZone }).startOf("day"),
    );
  }, [initialDateStr, userZone]);

  const goPrev = (e) => {
    e?.stopPropagation();
    setActiveDate((prev) => prev.minus({ days: 1 }));
  };

  const goNext = (e) => {
    e?.stopPropagation();
    setActiveDate((prev) => prev.plus({ days: 1 }));
  };

  return (
    <div className={styles.daysPopup} onClick={onClose}>
      <CustomButton
        ClickEffect="scale"
        onClick={goPrev}
        style={{
          position: "absolute",
          left: "10%",
          zIndex: 110,
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          backgroundColor: "rgba(255,255,255,0.1)",
        }}
      >
        <PrevBtnIcon />
      </CustomButton>

      <CustomButton
        ClickEffect="scale"
        onClick={goNext}
        style={{
          position: "absolute",
          right: "10%",
          zIndex: 110,
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          backgroundColor: "rgba(255,255,255,0.1)",
        }}
      >
        <NextBtnIcon />
      </CustomButton>

      <div
        style={{ position: "relative", width: "100%", height: "450px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {[-2, -1, 0, 1, 2].map((offset) => {
          const cardDate = activeDate.plus({ days: offset });
          const dateStr = cardDate.toISODate();

          const isCenter = offset === 0;
          const isLeft = offset === -1;
          const isRight = offset === 1;
          const isFarLeft = offset <= -2;
          const isFarRight = offset >= 2;

          let transform = "translateX(-50%) scale(1) translateY(0)";
          let opacity = 1;
          let zIndex = 10;
          let pointerEvents = "auto";

          if (isLeft) {
            transform =
              "translateX(calc(-50% - 320px)) scale(0.85) translateY(40px)";
            opacity = 0.5;
            zIndex = 5;
            pointerEvents = "auto";
          } else if (isRight) {
            transform =
              "translateX(calc(-50% + 320px)) scale(0.85) translateY(40px)";
            opacity = 0.5;
            zIndex = 5;
            pointerEvents = "auto";
          } else if (isFarLeft) {
            transform =
              "translateX(calc(-50% - 600px)) scale(0.7) translateY(60px)";
            opacity = 0;
            zIndex = 1;
            pointerEvents = "none";
          } else if (isFarRight) {
            transform =
              "translateX(calc(-50% + 600px)) scale(0.7) translateY(60px)";
            opacity = 0;
            zIndex = 1;
            pointerEvents = "none";
          }

          const cellStartMs = cardDate.startOf("day").toMillis();
          const cellEndMs = cardDate.endOf("day").toMillis();

          const dayEvents = allEvents.filter((ev) => {
            if (ev.isGhost) return false;
            const evStartMs = DateTime.fromISO(ev.timeRange.start, {
              zone: "utc",
            })
              .setZone(userZone)
              .toMillis();

            const endDt = DateTime.fromISO(ev.timeRange.end, {
              zone: "utc",
            }).setZone(userZone);

            let evEndMs = endDt.toMillis();
            if (endDt.hour === 0 && endDt.minute === 0) {
              evEndMs -= 1000;
            }
            return evStartMs <= cellEndMs && evEndMs >= cellStartMs;
          });

          dayEvents.sort((a, b) => {
            const aId = a.id.toString();
            const bId = b.id.toString();
            const aIsTop = a.isUnsaved || aId === String(editingEventId);
            const bIsTop = b.isUnsaved || bId === String(editingEventId);

            if (aIsTop && !bIsTop) return -1;
            if (!aIsTop && bIsTop) return 1;

            const aStart = DateTime.fromISO(a.timeRange.start, {
              zone: "utc",
            }).setZone(userZone);
            const bStart = DateTime.fromISO(b.timeRange.start, {
              zone: "utc",
            }).setZone(userZone);

            let aEnd = DateTime.fromISO(a.timeRange.end, {
              zone: "utc",
            }).setZone(userZone);
            let bEnd = DateTime.fromISO(b.timeRange.end, {
              zone: "utc",
            }).setZone(userZone);

            if (aEnd.hour === 0 && aEnd.minute === 0)
              aEnd = aEnd.minus({ days: 1 });
            if (bEnd.hour === 0 && bEnd.minute === 0)
              bEnd = bEnd.minus({ days: 1 });

            const aDays =
              Math.round(
                aEnd.startOf("day").diff(aStart.startOf("day"), "days").days,
              ) + 1;
            const bDays =
              Math.round(
                bEnd.startOf("day").diff(bStart.startOf("day"), "days").days,
              ) + 1;

            const aIsMultiOrFull = a.isFullDay || aDays > 1;
            const bIsMultiOrFull = b.isFullDay || bDays > 1;

            if (aIsMultiOrFull && !bIsMultiOrFull) return -1;
            if (!aIsMultiOrFull && bIsMultiOrFull) return 1;

            if (aIsMultiOrFull && bIsMultiOrFull && aDays !== bDays)
              return bDays - aDays;

            return aStart.toMillis() - bStart.toMillis();
          });

          return (
            <div
              key={dateStr}
              onClick={() => {
                if (isLeft) goPrev();
                if (isRight) goNext();
              }}
              style={{
                position: "absolute",
                left: "50%",
                top: 0,
                width: "300px",
                height: "100%",
                backgroundColor: "#181a26",
                borderRadius: "16px",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
                transform,
                opacity,
                pointerEvents,
                transition: "all 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
                display: "flex",
                flexDirection: "column",
                padding: "16px",
                zIndex,
                cursor: isCenter ? "default" : "pointer",
                filter: isCenter ? "none" : "brightness(0.7)",
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  marginBottom: "16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <p
                  style={{
                    fontSize: "14px",
                    color: "var(--text-gray)",
                    margin: 0,
                    marginBottom: "6px",
                  }}
                >
                  {DAYS_OF_WEEK[cardDate.weekday === 7 ? 0 : cardDate.weekday]}
                </p>
                <CustomButton
                  className={styles.dayButton}
                  link={true}
                  style={{
                    margin: 0,
                    width: "36px",
                    height: "36px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                      dateStr === DateTime.now().setZone(userZone).toISODate()
                        ? "var(--main-cyan)"
                        : "transparent",
                    color:
                      dateStr === DateTime.now().setZone(userZone).toISODate()
                        ? "#000"
                        : "var(--text-color)",
                    borderRadius: "50%",
                    fontSize: "18px",
                    fontWeight: "bold",
                  }}
                  href={`/calendar/day/${cardDate.day}/${cardDate.month}/${cardDate.year}`}
                >
                  {cardDate.day}
                </CustomButton>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  overflowY: "auto",
                  overflowX: "hidden",
                  flex: 1,
                }}
              >
                {dayEvents.map((ev) => {
                  const realId = ev.id;
                  const isUnsaved = ev.isUnsaved;
                  const isHovered = hoveredEventId === realId;
                  const isActive = isHovered || isUnsaved;

                  const evStartMs = DateTime.fromISO(ev.timeRange.start, {
                    zone: "utc",
                  })
                    .setZone(userZone)
                    .toMillis();

                  let evEndMs = DateTime.fromISO(ev.timeRange.end, {
                    zone: "utc",
                  })
                    .setZone(userZone)
                    .toMillis();

                  if (
                    DateTime.fromMillis(evEndMs).hour === 0 &&
                    DateTime.fromMillis(evEndMs).minute === 0
                  )
                    evEndMs -= 1000;

                  const contBackward = evStartMs < cellStartMs;
                  const contForward = evEndMs > cellEndMs;

                  const isMultiDay =
                    ev.isFullDay ||
                    (() => {
                      const start = DateTime.fromISO(ev.timeRange.start, {
                        zone: "utc",
                      }).setZone(userZone);
                      let end = DateTime.fromISO(ev.timeRange.end, {
                        zone: "utc",
                      }).setZone(userZone);
                      if (end.hour === 0 && end.minute === 0)
                        end = end.minus({ days: 1 });

                      return (
                        end.startOf("day").toMillis() >
                        start.startOf("day").toMillis()
                      );
                    })();

                  return (
                    <div
                      key={realId}
                      data-sourceid={realId}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        // 🔴 Let it run (it stops drag inside the handler if shared)
                        handleEventMouseDown(e, ev);
                      }}
                      onClick={(e) => handleEventClick(e, realId)}
                      onMouseEnter={() => setHoveredEventId(realId)}
                      onMouseLeave={() => setHoveredEventId(null)}
                      style={{
                        height: "26px",
                        cursor: "pointer",
                        borderRadius: "4px",
                        position: "relative",
                        flexShrink: 0,
                        filter: isHovered ? "brightness(0.95)" : "none",
                      }}
                    >
                      {isMultiDay ? (
                        <div
                          className={`${styles.eventBlockContainer} ${ev.classes?.map((c) => styles[c]).join(" ")}`}
                          style={{
                            position: "relative",
                            height: "100%",
                            width: "100%",
                          }}
                        >
                          <div
                            className={styles.eventBlock}
                            style={{
                              backgroundColor: ev.color,
                              height: "100%",
                              borderRadius: "4px",
                              borderTopLeftRadius: contBackward ? "0" : "4px",
                              borderBottomLeftRadius: contBackward
                                ? "0"
                                : "4px",
                              borderTopRightRadius: contForward ? "0" : "4px",
                              borderBottomRightRadius: contForward
                                ? "0"
                                : "4px",
                              padding: "0 8px",
                              display: "flex",
                              alignItems: "center",
                              overflow: "hidden",
                            }}
                          >
                            <span
                              className={styles.title}
                              style={{
                                fontSize: "13px",
                                color: "#111",
                                fontWeight: 500,
                                whiteSpace: "nowrap",
                                textOverflow: "ellipsis",
                                zIndex: 2,
                              }}
                            >
                              {ev.title ||
                                (isUnsaved ? "New Event" : "(No title)")}
                            </span>
                          </div>
                          {contBackward && (
                            <div
                              style={{ borderRightColor: ev.color }}
                              className={styles.backWard}
                            ></div>
                          )}
                          {contForward && (
                            <div
                              style={{ borderLeftColor: ev.color }}
                              className={styles.forWard}
                            ></div>
                          )}
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            height: "100%",
                            gap: "6px",
                            padding: "0 6px",
                            backgroundColor: isActive
                              ? ev.color
                              : "transparent",
                            borderRadius: "4px",
                            transition: "background-color 0.1s ease",
                          }}
                        >
                          {!isActive && (
                            <div
                              style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                backgroundColor: ev.color,
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <span
                            style={{
                              fontSize: "13px",
                              color: isActive ? "#111" : "var(--text-light)",
                              fontWeight: 500,
                              flexShrink: 0,
                            }}
                          >
                            {DateTime.fromISO(ev.timeRange.start)
                              .setZone(userZone)
                              .toFormat("h:mm a")
                              .toLowerCase()}
                          </span>
                          <span
                            style={{
                              fontSize: "13px",
                              color: isActive ? "#111" : "var(--text-light)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {ev.title ||
                              (isUnsaved ? "New Event" : "(No title)")}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CalendarContentMonth;
