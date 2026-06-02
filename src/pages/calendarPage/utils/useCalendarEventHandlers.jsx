/* eslint-disable no-unused-vars */
import { useRef, useEffect, useCallback } from "react";
import { useData } from "../../../contexts/AuthContext";
import { useNotification } from "../../../contexts/NotificationContext";
import { useTime } from "../../../contexts/TimeContext";
import { DateTime } from "luxon";
import styles from "../CalendarPage.module.css";
import { usePopup } from "../../../contexts/PopupContext";
import AddEditNewEvent from "../components/addEditNewEvent/AddEditNewEvent";
import EventInfoPopup from "../components/EventInfoPopup/EventInfoPopup";
import RecurrenceUpdatePopup from "../components/RecurrenceUpdatePopup/RecurrenceUpdatePopup";

function useCalendarEventHandlers(props = {}) {
  const { notify } = useNotification();
  const { updateEvent, addEvent } = useData();
  const {
    timeZoneOffset,
    setNewEvent,
    setDraggableEvent,
    dayTasksDiv,
    draggableEvent,
    setLoadedEvents,
    loadedEvents,
    isMobile,
    newEvent,
  } = useTime();
  const { openPopup, closePopup, hidePopup, showPopup } = usePopup();

  const setFullDayExpanded = props.setFullDayExpanded || null;
  const fullDayExpanded = props.fullDayExpanded || false;
  const setEditingEventId = props.setEditingEventId || (() => {});
  const setInfoPopupEventId = props.setInfoPopupEventId || (() => {});

  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const editingElementRef = useRef(null);
  const initialPointer = useRef({ x: 0, y: 0 });
  const hasDragged = useRef(false);
  const isFullDayDrag = useRef(false);
  const dayOffset = useRef(0);
  const dragTimeOffsetMs = useRef(0);
  const draggableEventRef = useRef(draggableEvent);
  const dragTimerRef = useRef(null);
  const originalEventSnapshot = useRef(null);
  const blockedPopupRef = useRef(false);
  const loadedEventsRef = useRef(loadedEvents);
  const addEditRef = useRef(null);
  const prevFullDayExpandedRef = useRef(null);
  const dragStartColumnDateRef = useRef(null);
  const fullDayExpandedRef = useRef(fullDayExpanded);

  const autoScrollState = useRef({
    active: false,
    speed: 0,
    clientX: 0,
    clientY: 0,
    previousScrollTop: 0,
    animationFrameId: null,
  });

  const touchTimerRef = useRef(null);
  const isHolding = useRef(false);
  const activeMobileMode = useRef(null);
  const mobileInitialTouch = useRef({ x: 0, y: 0 });
  const mobileEventRef = useRef(null);

  useEffect(() => {
    fullDayExpandedRef.current = fullDayExpanded;
  }, [fullDayExpanded]);
  useEffect(() => {
    draggableEventRef.current = draggableEvent;
  }, [draggableEvent]);
  useEffect(() => {
    loadedEventsRef.current = loadedEvents;
  }, [loadedEvents]);

  const createConsoleLogProgress = (operationId) => (status) => {
    const notificationId = `event-save-progress-${operationId}`;
    if (status === "Saving")
      notify({
        id: notificationId,
        message: "Saving context...",
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
        message: "Event Saved Successfully!",
        type: "success",
      });
    if (status === "error")
      notify({
        id: notificationId,
        message: "Failed to Save Event",
        type: "error",
      });
  };

  const getScrollSpeed = useCallback(
    (clientY) => {
      const container = dayTasksDiv.current;
      if (!container) return 0;
      const scrollContainer = container.closest("#bottom");
      if (!scrollContainer) return 0;

      const rect = scrollContainer.getBoundingClientRect();
      const threshold = 60;
      if (clientY < rect.top + threshold) return -12;
      if (clientY > rect.bottom - threshold) return 12;
      return 0;
    },
    [dayTasksDiv],
  );

  const getActiveContainer = useCallback(() => {
    if (isMobile) {
      const container = document.getElementById("slideContainer").children[1];
      return container || null;
    } else {
      return dayTasksDiv.current || null;
    }
  }, [isMobile, dayTasksDiv]);

  const getColumnsInView = useCallback(() => {
    if (isMobile) {
      const container = document.getElementById("slideContainer").children[1];
      return container
        ? Array.from(container.querySelectorAll("[data-column-date]"))
        : [];
    } else {
      const container = dayTasksDiv.current;
      return container
        ? Array.from(container.querySelectorAll("[data-column-date]"))
        : [];
    }
  }, [isMobile, dayTasksDiv]);

  const openAddEditPopup = useCallback(
    (e, handleDiscard, attemptClose, eventIdToPass = null) => {
      const targetId = eventIdToPass || props.editingEventId;
      const isMobileView = window.innerWidth <= 768;

      if (isMobileView) {
        openPopup(
          "centered",
          () => (
            <AddEditNewEvent
              ref={addEditRef}
              eventId={targetId}
              onClose={handleDiscard}
              popupId="edit-popup"
            />
          ),
          null,
          "center",
          0,
          attemptClose,
          "edit-popup",
        );
      } else {
        openPopup(
          "movable",
          () => (
            <AddEditNewEvent
              ref={addEditRef}
              eventId={targetId}
              onClose={handleDiscard}
              popupId="edit-popup"
            />
          ),
          e.currentTarget,
          "right",
          24,
          attemptClose,
          "edit-popup",
        );
      }
    },
    [openPopup, props.editingEventId],
  );

  const calculateEventPosition = useCallback(
    (e, originalTimeRange, offsetMilliseconds) => {
      const container = getActiveContainer();
      if (!container) return null;

      const columns = getColumnsInView() || [];
      const matchedColumn = columns.find((col) => {
        const rect = col.getBoundingClientRect();
        return e.clientX >= rect.left && e.clientX <= rect.right;
      });
      if (!matchedColumn) return null;

      const containerRect = container.getBoundingClientRect();
      const scrollTop = container.scrollTop;
      const cellHeight = isMobile ? 64 : 52;
      const snapHeight = cellHeight / 4;

      const rawY = e.clientY - containerRect.top + scrollTop;
      const minutesFromTopOfColumn = (rawY / cellHeight) * 60;
      const userZone = `UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`;

      const pointerTime = DateTime.fromISO(
        matchedColumn.getAttribute("data-column-date"),
        { zone: userZone },
      ).plus({ minutes: minutesFromTopOfColumn });

      let newStartDateTime = pointerTime.minus({
        milliseconds: offsetMilliseconds,
      });
      const snappedMinutes = Math.round(newStartDateTime.minute / 15) * 15;
      newStartDateTime = newStartDateTime.set({
        minute: snappedMinutes,
        second: 0,
        millisecond: 0,
      });

      const originalStart = DateTime.fromISO(originalTimeRange.start, {
        zone: "utc",
      });
      const originalEnd = DateTime.fromISO(originalTimeRange.end, {
        zone: "utc",
      });
      const duration = originalEnd.diff(originalStart);
      const newEndDateTime = newStartDateTime.plus(duration);

      const newTimeRange = {
        start: newStartDateTime.toUTC().toISO({ suppressMilliseconds: true }),
        end: newEndDateTime.toUTC().toISO({ suppressMilliseconds: true }),
      };

      const yOffsetMinutes =
        newStartDateTime.hour * 60 + newStartDateTime.minute;
      const snappedY =
        Math.round(((yOffsetMinutes / 60) * cellHeight) / snapHeight) *
          snapHeight +
        1;
      const durationMinutes = duration.as("minutes");
      const height = Math.max((durationMinutes / 60) * cellHeight - 2, 4);

      return {
        position: { y: snappedY },
        columnDate: newStartDateTime.toISODate(),
        timeRange: newTimeRange,
        size: {
          height: height,
          width: matchedColumn.getBoundingClientRect().width + "px",
        },
      };
    },
    [
      getActiveContainer,
      dayTasksDiv,
      timeZoneOffset,
      isMobile,
      getColumnsInView,
    ],
  );

  /* cite: uploaded:src/pages/calendarPage/utils/useCalendarEventHandlers.jsx */
  const calculateResizeEvent = useCallback(
    (e, event) => {
      if (!event || !event.originalTimeRange) return null;

      const container = getActiveContainer();
      const scrollContainer =
        container?.closest("#bottom") ||
        container?.querySelector("#bottom") ||
        container;
      const column = document.getElementById(event.columnDate);
      if (!column || !scrollContainer) return null;

      const rect = scrollContainer.getBoundingClientRect();
      const cellHeight = isMobile ? 64 : 52;
      const userZone = `UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`;

      const mouseY = e.clientY - rect.top + scrollContainer.scrollTop;
      let minutesFromTopOfColumn = (mouseY / cellHeight) * 60;

      // Clamp strictly between 0 and 1440 minutes (24 hours)
      if (minutesFromTopOfColumn < 0) {
        minutesFromTopOfColumn = 0;
      } else if (minutesFromTopOfColumn > 1440) {
        minutesFromTopOfColumn = 1440;
      }

      const columnDateStr = column.getAttribute("data-column-date");
      const targetColumnDay = DateTime.fromISO(columnDateStr, {
        zone: userZone,
      }).startOf("day");

      let pointerDateTime = targetColumnDay.plus({
        minutes: minutesFromTopOfColumn,
      });

      const snappedMinutes = Math.round(pointerDateTime.minute / 15) * 15;

      // If we snapped to 60 minutes or reached exactly 24:00, handle day rollover safety
      if (snappedMinutes === 60 || minutesFromTopOfColumn === 1440) {
        pointerDateTime = pointerDateTime.set({
          minute: 0,
          second: 0,
          millisecond: 0,
        });
        if (snappedMinutes === 60) {
          pointerDateTime = pointerDateTime.plus({ hours: 1 });
        }

        // Safety lock: If it crossed into the next day, make sure it stays exactly at midnight (00:00 / 24:00)
        if (pointerDateTime.toISODate() !== targetColumnDay.toISODate()) {
          pointerDateTime = targetColumnDay.plus({ days: 1 }).startOf("day");
        }
      } else {
        pointerDateTime = pointerDateTime.set({
          minute: snappedMinutes,
          second: 0,
          millisecond: 0,
        });
      }

      const originalStartTime = DateTime.fromISO(
        event.originalTimeRange.start,
        { zone: "utc" },
      ).setZone(userZone);

      let newStartDateTime = originalStartTime;
      let newEndDateTime = pointerDateTime;
      const minEndDateTime = originalStartTime.plus({ minutes: 15 });

      if (newEndDateTime <= minEndDateTime) {
        newEndDateTime = minEndDateTime;
        if (pointerDateTime < originalStartTime) {
          newStartDateTime = pointerDateTime;
        }
      }

      const finalStartUTC = newStartDateTime.toUTC();
      const finalEndUTC = newEndDateTime.toUTC();
      const newDurationMins = finalEndUTC.diff(
        finalStartUTC,
        "minutes",
      ).minutes;
      const newHeight = Math.max((newDurationMins / 60) * cellHeight - 2, 4);

      const initialY = event.position?.y || 0;
      let newY = initialY;

      if (newStartDateTime < originalStartTime) {
        const diffMinutes = originalStartTime.diff(
          newStartDateTime,
          "minutes",
        ).minutes;
        const pixelShift = (diffMinutes / 60) * cellHeight;
        newY = initialY - pixelShift;
      }

      return {
        timeRange: {
          start: finalStartUTC.toISO({ suppressMilliseconds: true }),
          end: finalEndUTC.toISO({ suppressMilliseconds: true }),
        },
        size: {
          width: column.getBoundingClientRect().width + "px",
          height: newHeight + "px",
        },
        position: {
          x:
            column.getBoundingClientRect().left -
            container.getBoundingClientRect().left +
            "px",
          y: newY,
        },
      };
    },
    [timeZoneOffset, getActiveContainer, isMobile],
  );
  const activateDragMode = useCallback(
    (e, event, element) => {
      const currentLoadedEvents = loadedEventsRef.current || [];
      const original = currentLoadedEvents.find(
        (ev) => ev.id === (event.sourceEventId || event.id),
      );

      originalEventSnapshot.current = original
        ? JSON.parse(JSON.stringify(original))
        : null;
      isFullDayDrag.current = !!event.isFullDay;
      dayOffset.current = 0;
      isDragging.current = true;
      hasDragged.current = false;

      if (isFullDayDrag.current && setFullDayExpanded) {
        if (prevFullDayExpandedRef.current === null) {
          prevFullDayExpandedRef.current = fullDayExpandedRef.current;
        }
        setFullDayExpanded(true);
      }

      const elements = document.querySelectorAll(
        `[data-sourceid="${event.sourceEventId || event.id}"]`,
      );
      elements.forEach((el) => el.classList.add(styles.editing));
      editingElementRef.current = Array.from(elements);

      const timeRangeToUse = event.originalTimeRange || event.timeRange;
      const container = getActiveContainer();
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const scrollTop = container.scrollTop;
      const cellHeight = isMobile ? 64 : 52;
      const rawY = e.clientY - containerRect.top + scrollTop;
      const minutesFromTopOfColumn = (rawY / cellHeight) * 60;

      const columns = getColumnsInView() || [];
      const matchedColumn = columns.find((col) => {
        const rect = col.getBoundingClientRect();
        return e.clientX >= rect.left && e.clientX <= rect.right;
      });
      if (matchedColumn) {
        const userZone = `UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`;
        const pointerTime = DateTime.fromISO(
          matchedColumn.getAttribute("data-column-date"),
          { zone: userZone },
        ).plus({ minutes: minutesFromTopOfColumn });

        const eventStartTimeInUserZone = DateTime.fromISO(
          timeRangeToUse.start,
          { zone: "utc" },
        ).setZone(userZone);
        dragTimeOffsetMs.current = pointerTime
          .diff(eventStartTimeInUserZone)
          .as("milliseconds");
      }
      const elementRect = element.getBoundingClientRect();
      const relativeLeft = elementRect.left - containerRect.left;
      const relativeTop = elementRect.top - containerRect.top;
      const { _element, _e, ...cleanEvent } = event;

      setDraggableEvent({
        ...cleanEvent,
        originalTimeRange: timeRangeToUse,
        timeRange: timeRangeToUse,
        active: true,
        size: {
          height: `${elementRect.height}px`,
          width: `${elementRect.width}px`,
        },
        position: { x: relativeLeft + "px", y: relativeTop },
      });
    },
    [
      dayTasksDiv,
      setDraggableEvent,
      setFullDayExpanded,
      timeZoneOffset,
      isMobile,
      getColumnsInView,
      getActiveContainer,
    ],
  );

  const handleRecurrenceAndSave = useCallback(
    async (currentEvent, finalData, triggerElement) => {
      const originalId = currentEvent.sourceEventId || currentEvent.id;
      const oldStart = DateTime.fromISO(
        currentEvent.originalTimeRange.start,
      ).toMillis();
      const newStart = DateTime.fromISO(finalData.timeRange.start).toMillis();
      const oldEnd = DateTime.fromISO(
        currentEvent.originalTimeRange.end,
      ).toMillis();
      const newEnd = DateTime.fromISO(finalData.timeRange.end).toMillis();

      const deltaMs = newStart - oldStart;
      const durationDeltaMs = newEnd - newStart - (oldEnd - oldStart);

      if (deltaMs === 0 && durationDeltaMs === 0) {
        const targetDiv =
          document.querySelector(`[data-sourceid="${originalId}"]`) ||
          document.body;
        showPopup("edit-popup", targetDiv);
        return;
      }

      const cleanFinalData = { ...finalData };
      delete cleanFinalData.isSegment;
      delete cleanFinalData.columnDate;
      delete cleanFinalData.position;
      delete cleanFinalData.size;
      delete cleanFinalData.active;
      delete cleanFinalData.originalTimeRange;
      delete cleanFinalData.id;
      delete cleanFinalData.sourceEventId;
      delete cleanFinalData.group_id;

      if (cleanFinalData.timeRange) {
        cleanFinalData.start = cleanFinalData.timeRange.start;
        cleanFinalData.end = cleanFinalData.timeRange.end;
      }

      const activeSnapshotId =
        originalEventSnapshot.current?.sourceEventId ||
        originalEventSnapshot.current?.id;
      const isActivelyEditing =
        addEditRef.current && activeSnapshotId === originalId;
      const isUnsaved = originalId.toString().startsWith("unsaved");

      if (isUnsaved || isActivelyEditing) {
        setLoadedEvents((prev) =>
          prev.map((ev) =>
            ev.id === originalId ? { ...ev, ...cleanFinalData } : ev,
          ),
        );
        if (isUnsaved) setNewEvent((prev) => ({ ...prev, ...cleanFinalData }));

        setTimeout(() => {
          const targetDiv =
            document.querySelector(`[data-sourceid="${originalId}"]`) ||
            document.body;
          showPopup("edit-popup", targetDiv);
        }, 50);
        return;
      }

      const consoleLogProgress = createConsoleLogProgress(currentEvent.id);
      const parentEvent = loadedEventsRef.current.find(
        (ev) => ev.id === originalId,
      );
      if (!parentEvent) return;

      const isRecurring =
        parentEvent.recurrence && parentEvent.recurrence.type !== "NONE";
      const finalFullDay =
        finalData.isFullDay !== undefined
          ? finalData.isFullDay
          : parentEvent.isFullDay;

      if (!isRecurring) {
        const preEditSnapshot = [...loadedEventsRef.current];
        try {
          setLoadedEvents((prev) =>
            prev.map((ev) =>
              ev.id === parentEvent.id
                ? {
                    ...ev,
                    timeRange: cleanFinalData.timeRange,
                    start: cleanFinalData.start,
                    end: cleanFinalData.end,
                  }
                : ev,
            ),
          );

          const result = await updateEvent(
            {
              sourceEventId: parentEvent.id,
              ...cleanFinalData,
              isFullDay: finalFullDay,
              title: parentEvent.title,
              description: parentEvent.description,
              color: parentEvent.color,
              emoji: parentEvent.emoji,
              visibility: parentEvent.visibility,
              availability: parentEvent.availability,
              recurrence: parentEvent.recurrence,
            },
            consoleLogProgress,
          );

          if (!result?.success) throw new Error("Non-recurring update failed");
          consoleLogProgress("success");
        } catch (error) {
          consoleLogProgress("error");
          setLoadedEvents(preEditSnapshot);
        }
        return;
      }

      const oldDateStr = DateTime.fromMillis(oldStart)
        .setZone(`UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`)
        .toISODate();
      const newDateStr = DateTime.fromMillis(newStart)
        .setZone(`UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`)
        .toISODate();
      const isDayChange = oldDateStr !== newDateStr;

      let allowedModes = ["THIS_EVENT", "THIS_AND_FOLLOWING"];
      if (!isDayChange) allowedModes.push("ALL_EVENTS");

      cleanFinalData.isFullDay = finalFullDay;

      openPopup(
        "centered",
        () => (
          <RecurrenceUpdatePopup
            allowedModes={allowedModes}
            onClose={closePopup}
            context={{
              parentEvent,
              currentEvent,
              finalData: cleanFinalData,
              deltaMs,
              durationDeltaMs,
            }}
          />
        ),
        document.body,
        "center",
      );
    },
    [
      closePopup,
      openPopup,
      setLoadedEvents,
      setNewEvent,
      showPopup,
      timeZoneOffset,
      updateEvent,
    ],
  );

  const performDragUpdate = useCallback(
    (clientX, clientY) => {
      const currentEvent = draggableEventRef.current;
      if (!currentEvent?.originalTimeRange) return;

      let tempOriginalRange = currentEvent.originalTimeRange;
      let effectiveOffsetMs = dragTimeOffsetMs.current;

      if (isFullDayDrag.current) {
        const s = DateTime.fromISO(tempOriginalRange.start, { zone: "utc" });
        tempOriginalRange = {
          start: s.toISO(),
          end: s.plus({ hours: 1 }).toISO(),
        };
        effectiveOffsetMs = 0;
      }

      const pos = calculateEventPosition(
        { clientX, clientY },
        tempOriginalRange,
        effectiveOffsetMs,
      );
      if (pos) {
        const newState = { ...pos, isFullDay: false };
        setDraggableEvent((prev) => ({ ...prev, ...newState }));
        draggableEventRef.current = { ...currentEvent, ...newState };
      }
    },
    [calculateEventPosition, setDraggableEvent],
  );

  /* cite: uploaded:src/pages/calendarPage/utils/useCalendarEventHandlers.jsx */
  const handleDragging = useCallback(
    (e) => {
      if (e.preventDefault) e.preventDefault();
      if (draggableEventRef.current?.isShared) return;

      const clientX = e.clientX;
      const clientY = e.clientY;

      const dx = clientX - initialPointer.current.x;
      const dy = clientY - initialPointer.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (dragTimerRef.current && distance > 5) {
        clearTimeout(dragTimerRef.current);
        dragTimerRef.current = null;
        const stored = draggableEventRef.current;
        if (stored && stored._element) {
          const { _element, _e, ...cleanEvent } = stored;
          activateDragMode(stored._e, cleanEvent, stored._element);
        }
      }

      if (!isDragging.current) return;
      if (!hasDragged.current) {
        if (distance < 5) return;
        hasDragged.current = true;
      }

      // Update global auto-scroll tracking coordinates
      autoScrollState.current.clientX = clientX;
      autoScrollState.current.clientY = clientY;

      const container = dayTasksDiv.current;
      if (!container) return;
      const scrollContainer = container.closest("#bottom") || container;

      const containerRect = container.getBoundingClientRect();
      const isTopArea = clientY < containerRect.top;

      const columns = getColumnsInView() || [];
      const matchedColumn = columns.find(
        (col) =>
          clientX >= col.getBoundingClientRect().left &&
          clientX <= col.getBoundingClientRect().right,
      );

      if (!matchedColumn) return;

      if (isTopArea) {
        // Disengage vertical auto-scroller when hovering the top all-day area section
        autoScrollState.current.active = false;
        if (autoScrollState.current.animationFrameId) {
          cancelAnimationFrame(autoScrollState.current.animationFrameId);
          autoScrollState.current.animationFrameId = null;
        }

        const targetDateStr = matchedColumn.getAttribute("data-column-date");
        const userZone = `UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`;

        const targetDate = DateTime.fromISO(targetDateStr, {
          zone: userZone,
        }).startOf("day");
        const initialDate = DateTime.fromISO(dragStartColumnDateRef.current, {
          zone: userZone,
        }).startOf("day");
        let newDayOffset = Math.round(
          targetDate.diff(initialDate, "days").days,
        );

        const viewStart = DateTime.fromISO(
          columns[0].getAttribute("data-column-date"),
          { zone: userZone },
        ).startOf("day");
        const viewEnd = DateTime.fromISO(
          columns[columns.length - 1].getAttribute("data-column-date"),
          { zone: userZone },
        ).startOf("day");
        const oStart = DateTime.fromISO(
          draggableEventRef.current.originalTimeRange.start,
          { zone: "utc" },
        )
          .setZone(userZone)
          .startOf("day");
        let oEnd = DateTime.fromISO(
          draggableEventRef.current.originalTimeRange.end,
          { zone: "utc" },
        ).setZone(userZone);

        if (oEnd.hour === 0 && oEnd.minute === 0)
          oEnd = oEnd.minus({ days: 1 });
        oEnd = oEnd.startOf("day");

        const minOffset = Math.ceil(viewStart.diff(oEnd, "days").days);
        const maxOffset = Math.floor(viewEnd.diff(oStart, "days").days);
        newDayOffset = Math.max(minOffset, Math.min(newDayOffset, maxOffset));

        if (
          newDayOffset !== dayOffset.current ||
          !draggableEventRef.current.isFullDay
        ) {
          dayOffset.current = newDayOffset;
          let originalStart = DateTime.fromISO(
            draggableEventRef.current.originalTimeRange.start,
            { zone: "utc" },
          );
          let originalEnd = DateTime.fromISO(
            draggableEventRef.current.originalTimeRange.end,
            { zone: "utc" },
          );

          if (!isFullDayDrag.current) {
            originalStart = originalStart
              .setZone(userZone)
              .startOf("day")
              .toUTC();
            originalEnd = originalStart.plus({ days: 1 });
          }

          const newStart = originalStart.plus({ days: newDayOffset });
          const newEnd = originalEnd.plus({ days: newDayOffset });
          const newTimeRange = {
            start: newStart.toISO({ suppressMilliseconds: true }),
            end: newEnd.toISO({ suppressMilliseconds: true }),
          };

          const newState = { timeRange: newTimeRange, isFullDay: true };
          setDraggableEvent((prev) => ({ ...prev, ...newState }));
          draggableEventRef.current = {
            ...draggableEventRef.current,
            ...newState,
          };
        }
      } else {
        // Column grid area interaction handling
        const scrollRect = scrollContainer.getBoundingClientRect();
        const threshold = 60;
        let speed = 0;

        if (clientY < scrollRect.top + threshold) speed = -12;
        else if (clientY > scrollRect.bottom - threshold) speed = 12;

        if (speed !== 0) {
          autoScrollState.current.speed = speed;

          if (!autoScrollState.current.active) {
            autoScrollState.current.active = true;

            const scrollLoop = () => {
              if (!autoScrollState.current.active) return;

              if (scrollContainer) {
                // Shift the column scroll container
                scrollContainer.scrollTop += autoScrollState.current.speed;

                // Continuously update block positioning calculations even if mouse remains still
                performDragUpdate(
                  autoScrollState.current.clientX,
                  autoScrollState.current.clientY,
                );
              }
              autoScrollState.current.animationFrameId =
                requestAnimationFrame(scrollLoop);
            };
            autoScrollState.current.animationFrameId =
              requestAnimationFrame(scrollLoop);
          }
        } else {
          // Stationary in safe view boundaries: Kill scroll loops and execute native move tracking
          autoScrollState.current.active = false;
          if (autoScrollState.current.animationFrameId) {
            cancelAnimationFrame(autoScrollState.current.animationFrameId);
            autoScrollState.current.animationFrameId = null;
          }
          performDragUpdate(clientX, clientY);
        }
      }
    },
    [
      dayTasksDiv,
      timeZoneOffset,
      performDragUpdate,
      activateDragMode,
      setDraggableEvent,
      getColumnsInView,
    ],
  );

  async function handleDragEnd(e) {
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }

    autoScrollState.current.active = false;
    if (autoScrollState.current.animationFrameId) {
      cancelAnimationFrame(autoScrollState.current.animationFrameId);
      autoScrollState.current.animationFrameId = null;
    }

    window.removeEventListener("pointermove", handleDragging);
    window.removeEventListener("pointerup", handleDragEnd);

    if (editingElementRef.current) {
      editingElementRef.current.forEach((el) =>
        el.classList.remove(styles.editing),
      );
      editingElementRef.current = null;
    }
    document.body.classList.remove("dragging");

    if (
      isFullDayDrag.current &&
      prevFullDayExpandedRef.current !== null &&
      setFullDayExpanded
    ) {
      setFullDayExpanded(prevFullDayExpandedRef.current);
      prevFullDayExpandedRef.current = null;
    }
    isFullDayDrag.current = false;

    if (isDragging.current && !hasDragged.current) {
      blockedPopupRef.current = true;
      setDraggableEvent((prev) => ({ ...prev, active: false }));
      isDragging.current = false;
      return;
    }

    if (!isDragging.current && !hasDragged.current) {
      const currentEvent = draggableEventRef.current;
      if (currentEvent && currentEvent.id) {
        const originalId = currentEvent.sourceEventId || currentEvent.id;
        const div = document.querySelector(`[data-sourceid="${originalId}"]`);

        if (div) {
          blockedPopupRef.current = true;
          if (originalId.toString().startsWith("unsaved")) return;

          const activePopupEl = document.querySelector(
            `[data-popupid="info-popup"]`,
          );
          const isTargetAlreadyOpen =
            activePopupEl &&
            activePopupEl.innerHTML.includes(originalId.toString());

          if (isTargetAlreadyOpen) {
            closePopup("info-popup", true);
            setInfoPopupEventId(null);
            return;
          }

          const openEditPopup = (eventId) => {
            closePopup();
            const targetDiv =
              document.querySelector(`[data-sourceid="${eventId}"]`) ||
              document.body;

            const dynamicLoadedEvents = loadedEventsRef.current || [];
            const activeFoundEvent = dynamicLoadedEvents.find(
              (ev) => String(ev.id) === String(eventId),
            );

            if (activeFoundEvent) {
              originalEventSnapshot.current = JSON.parse(
                JSON.stringify(activeFoundEvent),
              );
            } else {
              originalEventSnapshot.current = null;
            }

            setEditingEventId(eventId);

            setTimeout(() => {
              const forceClose = { current: false };
              const handleDiscard = () => {
                originalEventSnapshot.current = null;
                setEditingEventId(null);
                forceClose.current = true;
                closePopup("edit-popup", true);
              };
              function attemptClose() {
                if (forceClose.current) return true;
                if (isDragging.current || isResizing.current) return false;
                if (addEditRef.current?.hasUnsavedChanges()) {
                  addEditRef.current.requestClose();
                  return false;
                }
                handleDiscard();
                return true;
              }
              openAddEditPopup(e, handleDiscard, attemptClose, eventId);
            }, 300);
          };

          closePopup();
          setInfoPopupEventId(originalId);
          openPopup(
            "contextual",
            () => (
              <EventInfoPopup
                div={div}
                eventId={originalId}
                onEdit={openEditPopup}
              />
            ),
            div || document.body,
            "rightTop",
            24,
            () => {
              setInfoPopupEventId(null);
              return true;
            },
            "info-popup",
          );
        }
      }
      return;
    }

    const currentEvent = draggableEventRef.current;
    setDraggableEvent((prev) => ({ ...prev, active: false }));
    isDragging.current = false;
    hasDragged.current = false;

    if (!currentEvent) return;
    const { active, _element, _e, ...finalData } = currentEvent;
    await handleRecurrenceAndSave(currentEvent, finalData, null);
  }

  function handleResizeStart(e, event, element) {
    e.preventDefault();
    e.stopPropagation();
    if (!event || !element || event.isShared) return;

    const realId = event.sourceEventId || event.id;
    const activeSnapshotId =
      typeof originalEventSnapshot.current === "object"
        ? originalEventSnapshot.current?.sourceEventId ||
          originalEventSnapshot.current?.id
        : originalEventSnapshot.current;

    const isCurrentlyEditing =
      (activeSnapshotId && String(activeSnapshotId) === String(realId)) ||
      realId.toString().startsWith("unsaved") ||
      (props.editingEventId && String(props.editingEventId) === String(realId));

    if (!isCurrentlyEditing) {
      if (closePopup("edit-popup") === false) return;
    }
    closePopup("info-popup");
    if (isCurrentlyEditing) hidePopup("edit-popup");

    const currentLoadedEvents = loadedEventsRef.current || [];
    const original = currentLoadedEvents.find(
      (ev) => ev.id === (event.sourceEventId || event.id),
    );
    originalEventSnapshot.current = original
      ? JSON.parse(JSON.stringify(original))
      : null;

    initialPointer.current = { x: e.clientX, y: e.clientY };
    isResizing.current = true;
    hasDragged.current = false;

    window.addEventListener("pointermove", handleResizing);
    window.addEventListener("pointerup", handleResizeEnd);
    editingElementRef.current = [element];

    const column = document.getElementById(event.columnDate);
    if (!column) return;

    const containerRect = dayTasksDiv.current.getBoundingClientRect();
    const colRect = column.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    const relativeLeft = colRect.left - containerRect.left;
    const relativeTop = elementRect.top - containerRect.top;
    const { _element, _e, ...cleanEvent } = event;

    setDraggableEvent({
      ...cleanEvent,
      timeRange: event.originalTimeRange,
      active: true,
      size: { height: `${elementRect.height}`, width: `${colRect.width}px` },
      position: { x: relativeLeft + "px", y: relativeTop },
    });
    draggableEventRef.current = { ...event, _element: element };
  }

  const performResizeUpdate = useCallback(
    (clientX, clientY) => {
      const currentEvent = draggableEventRef.current;
      if (!currentEvent) return;

      const resize = calculateResizeEvent({ clientX, clientY }, currentEvent);
      if (!resize) return;
      setDraggableEvent((prev) => ({ ...prev, ...resize }));
    },
    [calculateResizeEvent, setDraggableEvent],
  );
  /* cite: uploaded:src/pages/calendarPage/utils/useCalendarEventHandlers.jsx */
  const handleResizing = useCallback(
    (e) => {
      if (!isResizing.current) return;

      const dx = e.clientX - initialPointer.current.x;
      const dy = e.clientY - initialPointer.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (!hasDragged.current) {
        if (distance < 5) return;
        hasDragged.current = true;
        if (editingElementRef.current) {
          editingElementRef.current.forEach((el) =>
            el.classList.add(styles.editing),
          );
        }
      }

      autoScrollState.current.clientX = e.clientX;
      autoScrollState.current.clientY = e.clientY;

      const container = getActiveContainer();
      const scrollContainer =
        container?.closest("#bottom") ||
        container?.querySelector("#bottom") ||
        container;

      if (scrollContainer) {
        const rect = scrollContainer.getBoundingClientRect();
        const threshold = 60;
        let speed = 0;

        if (e.clientY < rect.top + threshold) speed = -12;
        else if (e.clientY > rect.bottom - threshold) speed = 12;

        if (speed !== 0) {
          autoScrollState.current.speed = speed;
          if (!autoScrollState.current.active) {
            autoScrollState.current.active = true;

            const scrollLoop = () => {
              if (!autoScrollState.current.active) return;

              if (scrollContainer) {
                scrollContainer.scrollTop += autoScrollState.current.speed;

                // Keeps processing updates continuously while mouse remains inside threshold area
                performResizeUpdate(
                  autoScrollState.current.clientX,
                  autoScrollState.current.clientY,
                );
              }
              autoScrollState.current.animationFrameId =
                requestAnimationFrame(scrollLoop);
            };
            autoScrollState.current.animationFrameId =
              requestAnimationFrame(scrollLoop);
          }
        } else {
          // Stationary safe region: Clear loop tracking and recalculate layout locally
          autoScrollState.current.active = false;
          if (autoScrollState.current.animationFrameId) {
            cancelAnimationFrame(autoScrollState.current.animationFrameId);
            autoScrollState.current.animationFrameId = null;
          }
          performResizeUpdate(e.clientX, e.clientY);
        }
      }
    },
    [performResizeUpdate, getActiveContainer],
  );

  /* cite: uploaded:src/pages/calendarPage/utils/useCalendarEventHandlers.jsx */
  // --- MODIFY YOUR EXISTING handleResizeEnd WITHIN useCalendarEventHandlers ---
  async function handleResizeEnd() {
    autoScrollState.current.active = false;
    if (autoScrollState.current.animationFrameId) {
      cancelAnimationFrame(autoScrollState.current.animationFrameId);
      autoScrollState.current.animationFrameId = null;
    }

    if (editingElementRef.current) {
      editingElementRef.current.forEach((el) =>
        el.classList.remove(styles.editing),
      );
      editingElementRef.current = null;
    }
    document.body.classList.remove("resizing");

    window.removeEventListener("pointermove", handleResizing);
    window.removeEventListener("pointerup", handleResizeEnd);

    const currentEvent = draggableEventRef.current;
    setDraggableEvent((prev) => ({ ...prev, active: false }));
    isResizing.current = false;

    if (!hasDragged.current) return;

    if (!currentEvent) return;
    const { active, _element, _e, ...finalData } = currentEvent;
    hasDragged.current = false;

    // Fixes Issue #3: Open the AddEdit Popup modal overlay properly on hold end
    if (isHoldCreatedEvent.current) {
      isHoldCreatedEvent.current = false;
      const draftId = currentEvent.id;

      // Update local state with the final dragged dimensions
      setNewEvent((prev) =>
        prev ? { ...prev, timeRange: finalData.timeRange } : prev,
      );

      setTimeout(() => {
        const liveEventBlock =
          document.querySelector(`[data-sourceid="${draftId}"]`) ||
          document.body;

        const mockSyntheticEvent = {
          clientX: initialPointer.current.x,
          clientY: initialPointer.current.y,
          currentTarget: liveEventBlock,
        };

        const forceClose = { current: false };
        const handleDiscard = () => {
          setNewEvent((prev) => (prev && prev.id === draftId ? null : prev));
          setEditingEventId(null);
          forceClose.current = true;
          closePopup("edit-popup", true);
        };

        function attemptClose() {
          if (forceClose.current) return true;
          if (isDragging.current || isResizing.current) return false;
          if (addEditRef.current?.hasUnsavedChanges()) {
            addEditRef.current.requestClose();
            return false;
          }
          handleDiscard();
          return true;
        }

        // Open the creation popup cleanly with final duration sizes loaded
        openAddEditPopup(
          mockSyntheticEvent,
          handleDiscard,
          attemptClose,
          draftId,
        );
      }, 50);
      return;
    }

    // Regular preexisting update save path remains completely safe and untouched below
    await handleRecurrenceAndSave(currentEvent, finalData, null);
  }

  const handleNewEventClick = useCallback(
    (e) => {
      if (blockedPopupRef.current) {
        blockedPopupRef.current = false;
        return;
      }

      if (closePopup("edit-popup") === false) return;

      // 🟢 RESOLVE GEOMETRIC DYNAMIC DATES Purely
      let rawId =
        e.syntheticDateId ||
        e.currentTarget.getAttribute("data-date") ||
        e.currentTarget.id;
      if (isDragging.current || isResizing.current) return;

      const isFullDay =
        rawId?.startsWith("top-") ||
        !!e.currentTarget.getAttribute("data-date");
      if (rawId?.startsWith("top-")) rawId = rawId.replace("top-", "");

      const userZone = `UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`;
      let luxonStart, luxonEnd;

      if (isFullDay) {
        luxonStart = DateTime.fromISO(rawId, { zone: userZone }).startOf("day");
        luxonEnd = luxonStart.plus({ days: 1 });
      } else {
        // FIX: Parse incoming ISO context dynamically in your calendar's target zone directly
        const adjusted = DateTime.fromISO(rawId, { zone: userZone });
        const snappedMinutes = Math.round(adjusted.minute / 15) * 15;

        luxonStart = adjusted.set({
          minute: snappedMinutes,
          second: 0,
          millisecond: 0,
        });
        luxonEnd = luxonStart.plus({ hours: 1 });
      }

      const startTimeUTC = luxonStart
        .toUTC()
        .toISO({ suppressMilliseconds: true });
      const endTimeUTC = luxonEnd.toUTC().toISO({ suppressMilliseconds: true });
      const draftId = `unsaved-${Date.now()}`;

      if (window.innerWidth <= 768 && editingElementRef.current) {
        editingElementRef.current.forEach((el) =>
          el.classList.remove(styles.editing),
        );
      }

      setNewEvent({
        id: draftId,
        title: "",
        description: "",
        timeRange: { start: startTimeUTC, end: endTimeUTC },
        isFullDay: isFullDay,
        color: "#ffd4a9ff",
      });
      setEditingEventId(draftId);

      if (window.innerWidth <= 768) return;

      const forceClose = { current: false };
      const handleDiscard = () => {
        setNewEvent((prev) => (prev && prev.id === draftId ? null : prev));
        setEditingEventId(null);
        forceClose.current = true;
        closePopup("edit-popup", true);
      };

      function attemptClose() {
        if (forceClose.current) return true;
        if (isDragging.current || isResizing.current) return false;
        if (addEditRef.current?.hasUnsavedChanges()) {
          addEditRef.current.requestClose();
          return false;
        }
        handleDiscard();
        return true;
      }

      openAddEditPopup(e, handleDiscard, attemptClose, draftId);
    },
    [
      blockedPopupRef,
      closePopup,
      isDragging,
      isResizing,
      timeZoneOffset,
      DateTime,
      setNewEvent,
      setEditingEventId,
      editingElementRef,
      styles,
      openAddEditPopup,
      addEditRef,
    ],
  );

  // Mobile
  const MOBILE_RESIZE_EDGE_THRESHOLD_PX = 16;
  const isScrolling = props.isScrolling;
  const setIsScrolling = props.setIsScrolling;
  const scrollTimeoutRef = props.scrollTimeoutRef;

  const handleHoldingMode = useCallback(
    (e, event, element) => {
      isHolding.current = true;
      if (navigator.vibrate) navigator.vibrate(50);

      const currentLoadedEvents = loadedEventsRef.current || [];
      const original = currentLoadedEvents.find(
        (ev) => ev.id === (event.sourceEventId || event.id),
      );
      originalEventSnapshot.current = original
        ? JSON.parse(JSON.stringify(original))
        : null;

      const realSrcId = event.sourceEventId || event.id;
      const elements = document.querySelectorAll(
        `[data-sourceid="${realSrcId}"], [id="${realSrcId}"]`,
      );
      elements.forEach((el) => el.classList.add(styles.editing));
      editingElementRef.current = Array.from(elements);

      const timeRangeToUse = event.originalTimeRange || event.timeRange;
      const container = dayTasksDiv.current;
      const { _element, _e, ...cleanEvent } = event;
      let relativeTop = 0;

      if (container) {
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const relativeLeft = elementRect.left - containerRect.left;
        relativeTop = elementRect.top - containerRect.top;

        const cellHeight = 64;
        const initialTouchX = mobileInitialTouch.current.x;
        const initialTouchY = mobileInitialTouch.current.y;
        const scrollTop = container.scrollTop;

        const rawY = initialTouchY - containerRect.top + scrollTop;
        const minutesFromTopOfColumn = (rawY / cellHeight) * 60;
        const columns = getColumnsInView() || [];
        const matchedColumn = columns.find(
          (col) =>
            initialTouchX >= col.getBoundingClientRect().left &&
            initialTouchX <= col.getBoundingClientRect().right,
        );

        if (matchedColumn) {
          const userZone = `UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`;
          const pointerTime = DateTime.fromISO(
            matchedColumn.getAttribute("data-column-date"),
            { zone: userZone },
          ).plus({ minutes: minutesFromTopOfColumn });
          const eventStartTimeInUserZone = DateTime.fromISO(
            timeRangeToUse.start,
            { zone: "utc" },
          ).setZone(userZone);

          dragTimeOffsetMs.current = pointerTime
            .diff(eventStartTimeInUserZone)
            .as("milliseconds");
          dragStartColumnDateRef.current =
            matchedColumn.getAttribute("data-column-date");
        }

        setDraggableEvent({
          ...cleanEvent,
          originalTimeRange: timeRangeToUse,
          timeRange: timeRangeToUse,
          active: true,
          size: {
            height: `${elementRect.height}px`,
            width: `${elementRect.width}px`,
          },
          position: { x: relativeLeft + "px", y: relativeTop },
        });
      }

      mobileEventRef.current = {
        ...cleanEvent,
        _element: element,
        _e: e,
        initialY: relativeTop,
      };
      draggableEventRef.current = {
        ...cleanEvent,
        originalTimeRange: timeRangeToUse,
        timeRange: timeRangeToUse,
        columnDate:
          event.columnDate ||
          DateTime.fromISO(timeRangeToUse.start)
            .setZone(`UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`)
            .toISODate(),
      };
    },
    [dayTasksDiv, setDraggableEvent, timeZoneOffset, getColumnsInView],
  );

  const calculateMobileEventPosition = useCallback(
    (clientX, clientY, originalTimeRange) => {
      const container = getActiveContainer();
      if (!container) return null;

      const columns = getColumnsInView() || [];
      const matchedColumn = columns.find((col) => {
        const rect = col.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right;
      });
      if (!matchedColumn) return null;

      const scrollContainer =
        container.closest("#bottom") ||
        container.querySelector("#bottom") ||
        container;
      const scrollRect = scrollContainer.getBoundingClientRect();

      const cellHeight = 64;
      const snapHeight = cellHeight / 4;

      const rawY = clientY - scrollRect.top + scrollContainer.scrollTop - 32;
      let minutesFromTopOfColumn = (rawY / cellHeight) * 60;

      const originalStart = DateTime.fromISO(originalTimeRange.start, {
        zone: "utc",
      });
      const originalEnd = DateTime.fromISO(originalTimeRange.end, {
        zone: "utc",
      });
      const durationMinutes = originalEnd.diff(
        originalStart,
        "minutes",
      ).minutes;

      const minMinutes = 0;
      const maxMinutes = 1440 - durationMinutes;

      if (minutesFromTopOfColumn < minMinutes) {
        minutesFromTopOfColumn = minMinutes;
      } else if (minutesFromTopOfColumn > maxMinutes) {
        minutesFromTopOfColumn = Math.max(minMinutes, maxMinutes);
      }

      const userZone = `UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`;
      const pointerTime = DateTime.fromISO(
        matchedColumn.getAttribute("data-column-date"),
        { zone: userZone },
      ).plus({ minutes: minutesFromTopOfColumn });

      let newStartDateTime = pointerTime;
      const snappedMinutes = Math.round(newStartDateTime.minute / 15) * 15;
      newStartDateTime = newStartDateTime.set({
        minute: snappedMinutes,
        second: 0,
        millisecond: 0,
      });

      const newEndDateTime = newStartDateTime.plus({
        minutes: durationMinutes,
      });

      const newTimeRange = {
        start: newStartDateTime.toUTC().toISO({ suppressMilliseconds: true }),
        end: newEndDateTime.toUTC().toISO({ suppressMilliseconds: true }),
      };

      const yOffsetMinutes =
        newStartDateTime.hour * 60 + newStartDateTime.minute;
      const snappedY =
        Math.round(((yOffsetMinutes / 60) * cellHeight) / snapHeight) *
          snapHeight +
        1;
      const height = Math.max((durationMinutes / 60) * cellHeight - 2, 4);

      return {
        position: { y: snappedY },
        columnDate: newStartDateTime.toISODate(),
        timeRange: newTimeRange,
        size: {
          height: height,
          width: matchedColumn.getBoundingClientRect().width + "px",
        },
      };
    },
    [timeZoneOffset, getColumnsInView, getActiveContainer],
  );

  const performMobileDragUpdate = useCallback(
    (clientX, clientY) => {
      const currentEvent = draggableEventRef.current;
      if (!currentEvent?.originalTimeRange) return;

      let tempOriginalRange = currentEvent.originalTimeRange;

      if (isFullDayDrag.current) {
        const s = DateTime.fromISO(tempOriginalRange.start, { zone: "utc" });
        tempOriginalRange = {
          start: s.toISO(),
          end: s.plus({ hours: 1 }).toISO(),
        };
      }

      const pos = calculateMobileEventPosition(
        clientX,
        clientY,
        tempOriginalRange,
      );

      if (pos) {
        const newState = { ...pos, isFullDay: false };
        setDraggableEvent((prev) => ({ ...prev, ...newState }));
        draggableEventRef.current = { ...currentEvent, ...newState };
      }
    },
    [calculateMobileEventPosition, setDraggableEvent],
  );

  const handleMobileDragging = useCallback(
    (clientX, clientY) => {
      if (draggableEventRef.current?.isShared) return;

      const container = getActiveContainer();
      if (!container) return;

      const scrollContainer =
        container.closest("#bottom") ||
        container.querySelector("#bottom") ||
        container;

      const dx = clientX - mobileInitialTouch.current.x;
      const dy = clientY - mobileInitialTouch.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (!isDragging.current) return;
      if (!hasDragged.current) {
        if (distance < 5) return;
        hasDragged.current = true;
      }

      const currentEvent = draggableEventRef.current;
      if (!currentEvent?.originalTimeRange) return;

      const containerRect = container.getBoundingClientRect();
      const scrollRect = scrollContainer.getBoundingClientRect();

      const isTopArea = clientY < scrollRect.top;
      const columns = getColumnsInView() || [];
      const matchedColumn = columns.find(
        (col) =>
          clientX >= col.getBoundingClientRect().left &&
          clientX <= col.getBoundingClientRect().right,
      );

      if (!matchedColumn) return;

      if (isTopArea) {
        autoScrollState.current.active = false;
        if (autoScrollState.current.animationFrameId) {
          cancelAnimationFrame(autoScrollState.current.animationFrameId);
          autoScrollState.current.animationFrameId = null;
        }

        const targetDateStr = matchedColumn.getAttribute("data-column-date");
        const userZone = `UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`;

        const targetDate = DateTime.fromISO(targetDateStr, {
          zone: userZone,
        }).startOf("day");
        const initialDate = DateTime.fromISO(dragStartColumnDateRef.current, {
          zone: userZone,
        }).startOf("day");
        let newDayOffset = Math.round(
          targetDate.diff(initialDate, "days").days,
        );

        const viewStart = DateTime.fromISO(
          columns[0].getAttribute("data-column-date"),
          { zone: userZone },
        ).startOf("day");
        const viewEnd = DateTime.fromISO(
          columns[columns.length - 1].getAttribute("data-column-date"),
          { zone: userZone },
        ).startOf("day");
        const oStart = DateTime.fromISO(currentEvent.originalTimeRange.start, {
          zone: "utc",
        })
          .setZone(userZone)
          .startOf("day");
        let oEnd = DateTime.fromISO(currentEvent.originalTimeRange.end, {
          zone: "utc",
        }).setZone(userZone);

        if (oEnd.hour === 0 && oEnd.minute === 0)
          oEnd = oEnd.minus({ days: 1 });
        oEnd = oEnd.startOf("day");

        const minOffset = Math.ceil(viewStart.diff(oEnd, "days").days);
        const maxOffset = Math.floor(viewEnd.diff(oStart, "days").days);
        newDayOffset = Math.max(minOffset, Math.min(newDayOffset, maxOffset));

        if (newDayOffset !== dayOffset.current || !currentEvent.isFullDay) {
          dayOffset.current = newDayOffset;
          let originalStart = DateTime.fromISO(
            currentEvent.originalTimeRange.start,
            { zone: "utc" },
          );
          let originalEnd = DateTime.fromISO(
            currentEvent.originalTimeRange.end,
            { zone: "utc" },
          );

          if (!isFullDayDrag.current) {
            originalStart = originalStart
              .setZone(userZone)
              .startOf("day")
              .toUTC();
            originalEnd = originalStart.plus({ days: 1 });
          }

          const newStart = originalStart.plus({ days: newDayOffset });
          const newEnd = originalEnd.plus({ days: newDayOffset });
          const newTimeRange = {
            start: newStart.toISO({ suppressMilliseconds: true }),
            end: newEnd.toISO({ suppressMilliseconds: true }),
          };

          const newState = { timeRange: newTimeRange, isFullDay: true };
          setDraggableEvent((prev) => ({ ...prev, ...newState }));
          draggableEventRef.current = { ...currentEvent, ...newState };
        }
      } else {
        autoScrollState.current.clientX = clientX;
        autoScrollState.current.clientY = clientY;

        const threshold = 60;
        let speed = 0;

        if (clientY < scrollRect.top + threshold) speed = -12;
        else if (clientY > scrollRect.bottom - threshold) speed = 12;

        if (speed !== 0) {
          autoScrollState.current.speed = speed;
          if (!autoScrollState.current.active) {
            autoScrollState.current.active = true;

            const scrollLoop = () => {
              if (!autoScrollState.current.active) return;
              if (scrollContainer) {
                scrollContainer.scrollTop += autoScrollState.current.speed;
                performMobileDragUpdate(
                  autoScrollState.current.clientX,
                  autoScrollState.current.clientY,
                );
              }
              autoScrollState.current.animationFrameId =
                requestAnimationFrame(scrollLoop);
            };
            autoScrollState.current.animationFrameId =
              requestAnimationFrame(scrollLoop);
          }
        } else {
          autoScrollState.current.active = false;
          if (autoScrollState.current.animationFrameId) {
            cancelAnimationFrame(autoScrollState.current.animationFrameId);
            autoScrollState.current.animationFrameId = null;
          }
          performMobileDragUpdate(clientX, clientY);
        }
      }
    },
    [
      timeZoneOffset,
      performMobileDragUpdate,
      getColumnsInView,
      getActiveContainer,
    ],
  );

  const handleMobileResizing = useCallback(
    (clientX, clientY, handleType = "bottom") => {
      const currentEvent = draggableEventRef.current;

      if (!currentEvent || !currentEvent.originalTimeRange) return;

      const container = getActiveContainer();

      const scrollContainer =
        container?.closest("#bottom") || container?.querySelector("#bottom");

      const column = document.getElementById(currentEvent.columnDate);

      if (!column || !scrollContainer) return;

      autoScrollState.current.clientX = clientX;

      autoScrollState.current.clientY = clientY;

      const rect = scrollContainer.getBoundingClientRect();

      const threshold = 60;

      let speed = 0;

      if (clientY < rect.top + threshold) speed = -12;
      else if (clientY > rect.bottom - threshold) speed = 12;

      const calculateAndUpdateEvent = (currentClientY) => {
        const cellHeight = 64;

        const userZone = `UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`;

        const currentRect = scrollContainer.getBoundingClientRect();

        const mouseY =
          currentClientY - currentRect.top + scrollContainer.scrollTop;

        let minutesFromTopOfColumn = (mouseY / cellHeight) * 60;

        if (minutesFromTopOfColumn < 0) {
          minutesFromTopOfColumn = 0;
        } else if (minutesFromTopOfColumn > 1440) {
          minutesFromTopOfColumn = 1440;
        }

        const columnDateStr = column.getAttribute("data-column-date");

        // Establish the locked local target day boundaries

        const targetDayLocal = DateTime.fromISO(columnDateStr, {
          zone: userZone,
        }).startOf("day");

        // FIX: Match handleMobileDragging logic. Go to 00:00 of the NEXT day.

        // For UTC+3, June 5th 00:00 local maps perfectly to June 4th 21:00:00Z.

        const targetDayEndLocal = targetDayLocal

          .plus({ days: 1 })

          .startOf("day");

        let pointerDateTime = targetDayLocal.plus({
          minutes: minutesFromTopOfColumn,
        });

        const snappedMinutes = Math.round(pointerDateTime.minute / 15) * 15;

        pointerDateTime = pointerDateTime.set({
          minute: snappedMinutes,

          second: 0,

          millisecond: 0,
        });

        // If the user scrolls past the 24-hour mark or boundary, clamp strictly to midnight of next day

        if (
          minutesFromTopOfColumn >= 1440 ||
          pointerDateTime >= targetDayEndLocal ||
          pointerDateTime.toISODate() !== targetDayLocal.toISODate()
        ) {
          pointerDateTime = targetDayEndLocal;
        }

        const originalStartTime = DateTime.fromISO(
          currentEvent.originalTimeRange.start,

          { zone: "utc" },
        ).setZone(userZone);

        const originalEndTime = DateTime.fromISO(
          currentEvent.originalTimeRange.end,

          { zone: "utc" },
        ).setZone(userZone);

        let newStartDateTime = originalStartTime;

        let newEndDateTime = originalEndTime;

        if (handleType === "top") {
          newStartDateTime = pointerDateTime;

          newEndDateTime = originalEndTime;

          const maxStartDateTime = originalEndTime.minus({ minutes: 60 });

          if (newStartDateTime >= maxStartDateTime) {
            newStartDateTime = maxStartDateTime;

            if (pointerDateTime > originalEndTime) {
              newEndDateTime = pointerDateTime;
            }
          }
        } else {
          newStartDateTime = originalStartTime;

          newEndDateTime = pointerDateTime;

          const minEndDateTime = originalStartTime.plus({ minutes: 60 });

          if (newEndDateTime <= minEndDateTime) {
            newEndDateTime = minEndDateTime;

            if (pointerDateTime < originalStartTime) {
              newStartDateTime = pointerDateTime;
            }
          }
        }

        // Absolute column safety clamps using our clean midnight ceiling

        if (newStartDateTime < targetDayLocal)
          newStartDateTime = targetDayLocal;

        if (newEndDateTime > targetDayEndLocal)
          newEndDateTime = targetDayEndLocal;

        const finalStartUTC = newStartDateTime.toUTC();

        const finalEndUTC = newEndDateTime.toUTC();

        const newDurationMins = finalEndUTC.diff(
          finalStartUTC,

          "minutes",
        ).minutes;

        const newHeight = Math.max((newDurationMins / 60) * cellHeight - 2, 4);

        const minutesFromDayStart = newStartDateTime.diff(
          targetDayLocal,

          "minutes",
        ).minutes;

        const newY = (minutesFromDayStart / 60) * cellHeight;

        console.log(
          finalStartUTC.toISO({ suppressMilliseconds: true }),

          finalEndUTC.toISO({ suppressMilliseconds: true }),
        );

        setDraggableEvent((prev) => ({
          ...prev,

          timeRange: {
            start: finalStartUTC.toISO({ suppressMilliseconds: true }),

            end: finalEndUTC.toISO({ suppressMilliseconds: true }),
          },

          size: {
            width: column.getBoundingClientRect().width + "px",

            height: newHeight + "px",
          },

          position: { ...prev.position, y: newY },
        }));
      };

      if (speed !== 0) {
        autoScrollState.current.speed = speed;

        if (!autoScrollState.current.active) {
          autoScrollState.current.active = true;

          const scrollLoop = () => {
            if (!autoScrollState.current.active) return;

            if (scrollContainer) {
              scrollContainer.scrollTop += autoScrollState.current.speed;

              calculateAndUpdateEvent(autoScrollState.current.clientY);
            }

            autoScrollState.current.animationFrameId =
              requestAnimationFrame(scrollLoop);
          };

          autoScrollState.current.animationFrameId =
            requestAnimationFrame(scrollLoop);
        }
      } else {
        autoScrollState.current.active = false;

        if (autoScrollState.current.animationFrameId) {
          cancelAnimationFrame(autoScrollState.current.animationFrameId);

          autoScrollState.current.animationFrameId = null;
        }

        calculateAndUpdateEvent(clientY);
      }
    },

    [timeZoneOffset, setDraggableEvent, getActiveContainer],
  );

  const handleTouchMove = useCallback(
    (e) => {
      if (cancelTouch.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - mobileInitialTouch.current.x;
      const dy = touch.clientY - mobileInitialTouch.current.y;

      // Deadzone check: Ignore accidental micro-wiggles before long-press holds commit
      if (!isHolding.current) {
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
          clearTimeout(touchTimerRef.current);
          cancelTouch.current = true;
          cleanupTouch();
        }
        return;
      }

      e.preventDefault(); // Stop mobile background viewport rubber-banding
      const stored = mobileEventRef.current;
      if (!stored) return;

      // Trigger state machines once upon initial drag movement activity
      if (!isDragging.current && !isResizing.current) {
        hasDragged.current = true;
        initialPointer.current = mobileInitialTouch.current;

        const container = getActiveContainer();
        if (container) {
          const columns = getColumnsInView() || [];
          const matchedColumn = columns.find(
            (col) =>
              mobileInitialTouch.current.x >=
                col.getBoundingClientRect().left &&
              mobileInitialTouch.current.x <= col.getBoundingClientRect().right,
          );
          if (matchedColumn) {
            dragStartColumnDateRef.current =
              matchedColumn.getAttribute("data-column-date");
          }
        }

        // Route to correct operation based on our spatial edge-detection checks
        if (activeMobileMode.current === "drag") {
          isDragging.current = true;
          const { _element, _e, ...cleanEvent } = stored;
          activateDragMode(stored._e, cleanEvent, stored._element);
        } else {
          isResizing.current = true;
        }
        return;
      }

      // Execute active movement calculations continuous cycles
      if (activeMobileMode.current === "drag") {
        handleMobileDragging(touch.clientX, touch.clientY);
      } else if (activeMobileMode.current === "resize") {
        handleMobileResizing(touch.clientX, touch.clientY, "bottom");
      } else if (activeMobileMode.current === "resize-top") {
        handleMobileResizing(touch.clientX, touch.clientY, "top");
      }
    },
    [
      activateDragMode,
      handleMobileResizing,
      handleMobileDragging,
      getColumnsInView,
      getActiveContainer,
    ],
  );

  const handleTouchEnd = useCallback(
    async (e) => {
      if (cancelTouch.current) {
        cancelTouch.current = false;
        mobileEventRef.current = null;
        isHolding.current = false;
        cleanupTouch();
        return;
      }

      autoScrollState.current.active = false;
      if (autoScrollState.current.animationFrameId) {
        cancelAnimationFrame(autoScrollState.current.animationFrameId);
        autoScrollState.current.animationFrameId = null;
      }

      clearTimeout(touchTimerRef.current);
      cleanupTouch();

      if (isScrolling) {
        const stored = mobileEventRef.current;
        if (!stored || !stored._element) {
          mobileEventRef.current = null;
          isHolding.current = false;
          return;
        }
        if (typeof setIsScrolling === "function") {
          setIsScrolling(false);
        }
      }

      if (editingElementRef.current) {
        editingElementRef.current.forEach((el) => {
          if (el && el.classList) el.classList.remove(styles.editing);
        });
        editingElementRef.current = null;
      }
      document.body.classList.remove("dragging", "resizing");

      if (!isHolding.current) {
        const stored = mobileEventRef.current;
        mobileEventRef.current = null;

        if (stored) {
          const realId = stored.sourceEventId || stored.id;
          const targetDiv = stored._element;

          if (realId.toString().startsWith("unsaved")) {
            if (e.stopPropagation) e.stopPropagation();
            if (e.preventDefault) e.preventDefault();

            closePopup();
            setEditingEventId(realId);

            if (targetDiv && targetDiv.classList) {
              targetDiv.classList.add(styles.editing);
              editingElementRef.current = [targetDiv];
            }

            const forceClose = { current: false };
            const handleDiscard = () => {
              setNewEvent((prev) => (prev && prev.id === realId ? null : prev));
              setEditingEventId(null);
              forceClose.current = true;
              if (editingElementRef.current) {
                editingElementRef.current.forEach((el) => {
                  if (el && el.classList) el.classList.remove(styles.editing);
                });
                editingElementRef.current = null;
              }
              closePopup("edit-popup", true);
            };

            function attemptClose() {
              if (forceClose.current) return true;
              if (isDragging.current || isResizing.current) return false;
              if (addEditRef.current?.hasUnsavedChanges()) {
                addEditRef.current.requestClose();
                return false;
              }
              handleDiscard();
              return true;
            }

            openAddEditPopup(e, handleDiscard, attemptClose, realId);
          } else {
            if (e.stopPropagation) e.stopPropagation();

            if (
              draggableEventRef.current?.id?.toString().startsWith("unsaved") ||
              newEvent
            ) {
              setNewEvent(null);
              setEditingEventId(null);
              closePopup("edit-popup", true);
              if (editingElementRef.current) {
                editingElementRef.current.forEach((el) => {
                  if (el && el.classList) el.classList.remove(styles.editing);
                });
                editingElementRef.current = null;
              }
            }

            const activePopupEl = document.querySelector(
              `[data-popupid="info-popup"]`,
            );
            const isTargetAlreadyOpen =
              activePopupEl &&
              activePopupEl.innerHTML.includes(realId.toString());

            if (isTargetAlreadyOpen) {
              closePopup("info-popup", true);
              setInfoPopupEventId(null);
              mobileEventRef.current = null;
              return;
            }

            closePopup();
            setInfoPopupEventId(realId);
            openPopup(
              "contextual",
              () => (
                <EventInfoPopup
                  div={targetDiv || document.body}
                  eventId={realId}
                  onEdit={(eventId) => {
                    closePopup();
                    setEditingEventId(eventId);
                    if (targetDiv && targetDiv.classList) {
                      targetDiv.classList.add(styles.editing);
                      editingElementRef.current = [targetDiv];
                    }

                    const dynamicLoadedEvents = loadedEventsRef.current || [];
                    const activeFoundEvent = dynamicLoadedEvents.find(
                      (ev) => String(ev.id) === String(eventId),
                    );

                    if (activeFoundEvent) {
                      originalEventSnapshot.current = JSON.parse(
                        JSON.stringify(activeFoundEvent),
                      );
                    } else {
                      originalEventSnapshot.current = null;
                    }

                    const forceClose = { current: false };
                    const handleDiscard = () => {
                      originalEventSnapshot.current = null;
                      setEditingEventId(null);
                      forceClose.current = true;
                      if (editingElementRef.current) {
                        editingElementRef.current.forEach((el) => {
                          if (el && el.classList)
                            el.classList.remove(styles.editing);
                        });
                        editingElementRef.current = null;
                      }
                      closePopup("edit-popup", true);
                    };

                    function attemptClose() {
                      if (forceClose.current) return true;
                      if (addEditRef.current?.hasUnsavedChanges()) {
                        addEditRef.current.requestClose();
                        return false;
                      }
                      handleDiscard();
                      return true;
                    }
                    openAddEditPopup(e, handleDiscard, attemptClose, eventId);
                  }}
                />
              ),
              targetDiv || document.body,
              "rightTop",
              24,
              () => {
                setInfoPopupEventId(null);
                return true;
              },
              "info-popup",
            );
          }
        }
        return;
      }

      isHolding.current = false;
      const modeApplied = activeMobileMode.current;
      activeMobileMode.current = null;

      if (!modeApplied) {
        setDraggableEvent((prev) => ({ ...prev, active: false }));
        isDragging.current = false;
        isResizing.current = false;
        hasDragged.current = false;
        return;
      }

      const currentEvent = draggableEventRef.current;
      setDraggableEvent((prev) => ({ ...prev, active: false }));

      isDragging.current = false;
      isResizing.current = false;
      hasDragged.current = false;

      if (currentEvent) {
        const { active, _element, _e, ...finalData } = currentEvent;
        try {
          await handleRecurrenceAndSave(currentEvent, finalData, null);
        } catch (error) {
          console.error(
            "Failed to commit calendar mutation sequence safely:",
            error,
          );
        }
      }
    },
    [
      isScrolling,
      setIsScrolling,
      newEvent,
      setDraggableEvent,
      closePopup,
      setEditingEventId,
      setNewEvent,
      openPopup,
      setInfoPopupEventId,
      openAddEditPopup,
      handleRecurrenceAndSave,
    ],
  );

  const cleanupTouch = useCallback(() => {
    document.removeEventListener("touchmove", handleTouchMove);
    document.removeEventListener("touchend", handleTouchEnd);
    document.removeEventListener("touchcancel", handleTouchEnd);
  }, [handleTouchMove, handleTouchEnd]);

  const cancelTouch = useRef(false);

  function handlePointerDown(e, event, element) {
    if (!event || !element) return;

    const isTouch =
      e.pointerType === "touch" ||
      e.type === "touchstart" ||
      (e.touches && e.touches.length > 0);

    if (!isTouch) {
      if (e.button !== 0) return;
      const realId = event.sourceEventId || event.id;
      const activeSnapshotId =
        typeof originalEventSnapshot.current === "object"
          ? originalEventSnapshot.current?.sourceEventId ||
            originalEventSnapshot.current?.id
          : originalEventSnapshot.current;

      const isCurrentlyEditing =
        (activeSnapshotId && String(activeSnapshotId) === String(realId)) ||
        realId.toString().startsWith("unsaved") ||
        (props.editingEventId &&
          String(props.editingEventId) === String(realId));

      if (!isCurrentlyEditing) {
        if (closePopup("edit-popup") === false) return;
      }
      closePopup("info-popup");
      if (isCurrentlyEditing) hidePopup("edit-popup");

      blockedPopupRef.current = false;
      initialPointer.current = { x: e.clientX, y: e.clientY };

      const container = dayTasksDiv.current;
      if (container) {
        const columns = getColumnsInView() || [];
        const matchedColumn = columns.find(
          (col) =>
            e.clientX >= col.getBoundingClientRect().left &&
            e.clientX <= col.getBoundingClientRect().right,
        );
        if (matchedColumn)
          dragStartColumnDateRef.current =
            matchedColumn.getAttribute("data-column-date");
      }

      if (event.isFullDay) {
        const columns = getColumnsInView() || [];
        if (columns.length <= 1) {
          draggableEventRef.current = { ...event, _element: element, _e: e };
          window.addEventListener("pointerup", handleDragEnd);
          return;
        }
      }

      window.addEventListener("pointermove", handleDragging);
      window.addEventListener("pointerup", handleDragEnd);

      if (!event.isShared) {
        dragTimerRef.current = setTimeout(() => {
          dragTimerRef.current = null;
          activateDragMode(e, event, element);
        }, 1000);
      }

      draggableEventRef.current = { ...event, _element: element, _e: e };
      return;
    }

    closePopup("info-popup");
    if (closePopup("edit-popup") === false) return;

    mobileInitialTouch.current = {
      x: e.touches ? e.touches[0].clientX : e.clientX,
      y: e.touches ? e.touches[0].clientY : e.clientY,
    };

    isHolding.current = false;
    activeMobileMode.current = null;
    mobileEventRef.current = { ...event, _element: element, _e: e };

    const elementRect = element.getBoundingClientRect();
    const touchYRelative = mobileInitialTouch.current.y - elementRect.top;

    // Determine mode based purely on spatial positioning inside the box
    if (touchYRelative <= MOBILE_RESIZE_EDGE_THRESHOLD_PX && !event.isFullDay) {
      activeMobileMode.current = "resize-top";
    } else if (
      elementRect.height - touchYRelative <= MOBILE_RESIZE_EDGE_THRESHOLD_PX &&
      !event.isFullDay
    ) {
      activeMobileMode.current = "resize"; // resize from bottom
    } else {
      activeMobileMode.current = "drag"; // Standard body press
    }

    touchTimerRef.current = setTimeout(() => {
      if (event.isShared) return;
      handleHoldingMode(e, event, element);
    }, 400);

    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchcancel", handleTouchEnd);
  }

  useEffect(() => {
    if (!isMobile) return;

    const handleMobileBackgroundDiscard = (e) => {
      if (isDragging.current || isResizing.current || isHolding.current) return;

      const clickedCell = e.target.closest(
        `.${styles.column}, [data-sourceid], [id^="unsaved-"]`,
      );
      const clickedInsidePopup = e.target.closest(
        '#edit-popup, #info-popup, [id*="popup"], [class*="popup"]',
      );

      if (!clickedCell && !clickedInsidePopup) {
        setTimeout(() => {
          setNewEvent(null);
          setEditingEventId(null);
          closePopup("edit-popup", true);
          if (editingElementRef.current) {
            editingElementRef.current.forEach((el) => {
              if (el && el.classList) el.classList.remove(styles.editing);
            });
            editingElementRef.current = null;
          }
        }, 0);
      }
    };

    const handleMobileScrollDiscard = () => {
      if (isDragging.current || isResizing.current || isHolding.current) return;

      if (typeof setIsScrolling === "function") setIsScrolling(true);
      if (scrollTimeoutRef && scrollTimeoutRef.current)
        clearTimeout(scrollTimeoutRef.current);

      if (scrollTimeoutRef) {
        scrollTimeoutRef.current = setTimeout(() => {
          if (typeof setIsScrolling === "function") setIsScrolling(false);
        }, 150);
      }

      if (draggableEventRef.current?.id?.toString().startsWith("unsaved")) {
        setTimeout(() => {
          setNewEvent(null);
          setEditingEventId(null);
          closePopup("edit-popup", true);
          if (editingElementRef.current) {
            editingElementRef.current.forEach((el) => {
              if (el && el.classList) el.classList.remove(styles.editing);
            });
            editingElementRef.current = null;
          }
        }, 0);
      }
    };

    document.addEventListener("touchstart", handleMobileBackgroundDiscard, {
      passive: true,
    });
    const container = getActiveContainer();
    const bottomScrollElement =
      container?.closest("#bottom") ||
      container?.querySelector("#bottom") ||
      container;

    if (bottomScrollElement) {
      bottomScrollElement.addEventListener(
        "scroll",
        handleMobileScrollDiscard,
        { passive: true },
      );
    }

    return () => {
      document.removeEventListener("touchstart", handleMobileBackgroundDiscard);
      if (bottomScrollElement)
        bottomScrollElement.removeEventListener(
          "scroll",
          handleMobileScrollDiscard,
        );
      if (scrollTimeoutRef && scrollTimeoutRef.current)
        clearTimeout(scrollTimeoutRef.current);
    };
  }, [
    isMobile,
    setNewEvent,
    setEditingEventId,
    getActiveContainer,
    closePopup,
    setIsScrolling,
    scrollTimeoutRef,
  ]);

  /* cite: uploaded:src/pages/calendarPage/utils/useCalendarEventHandlers.jsx */
  // Inside useCalendarEventHandlers hook:

  /* cite: uploaded:src/pages/calendarPage/utils/useCalendarEventHandlers.jsx */
  // --- ADD THESE HOOK REF LAYERS INSIDE useCalendarEventHandlers ---
  /* cite: uploaded:src/pages/calendarPage/utils/useCalendarEventHandlers.jsx */
  // --- ADD THIS STATE REF LAYER AT THE TOP OF THE HOOK WITH THE OTHER REFS ---
  const isHoldCreatedEvent = useRef(false);

  // --- STREAMLINED AND SECURE GRID POINTER HANDLER ---
  const handleGridPointerDown = useCallback(
    (e) => {
      if (e.button !== 0 && e.pointerType !== "touch") return;
      if (isDragging.current || isResizing.current) return;
      if (closePopup("edit-popup") === false) return;

      const columnElement = e.currentTarget;
      const clientX = e.clientX;
      const clientY = e.clientY;

      const initialPointerPos = { x: clientX, y: clientY };
      let holdTimer = null;

      // Fixes Issue #2: Prevent annoying browser text highlighting while holding down
      document.body.style.userSelect = "none";
      document.body.style.webkitUserSelect = "none";

      // Calculate clicked hour and target time coordinate boundaries cleanly
      const rect = columnElement.getBoundingClientRect();
      const clickY = clientY - rect.top;
      const cellHeight = isMobile ? 64 : 52;
      const clickedHour = Math.floor(clickY / cellHeight);
      const columnDateStr = columnElement.getAttribute("data-column-date");

      const userZone = `UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`;
      const calcDateTime = DateTime.fromISO(columnDateStr, { zone: userZone })
        .startOf("day")
        .plus({ hours: clickedHour });

      const targetIsoString = calcDateTime
        .toUTC()
        .toISO({ suppressMilliseconds: true });

      // Start Hold-to-Create Timer
      holdTimer = setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate(40);

        const draftId = `unsaved-${Date.now()}`;
        // Fixes VS Code warnings: Construct a standard localized time range matching handleNewEventClick exactly
        const startTimeUTC = targetIsoString;
        const endTimeUTC = calcDateTime
          .plus({ hours: 1 })
          .toUTC()
          .toISO({ suppressMilliseconds: true });

        const mockEvent = {
          id: draftId,
          title: "",
          description: "",
          timeRange: { start: startTimeUTC, end: endTimeUTC },
          originalTimeRange: { start: startTimeUTC, end: endTimeUTC },
          isFullDay: false,
          color: "#ffd4a9ff",
          columnDate: columnDateStr,
        };

        // Flag that this resize sequence belongs to a fresh draft creation gesture
        isHoldCreatedEvent.current = true;

        // 1. Tell React to render the block placeholder natively via state
        setNewEvent(mockEvent);
        setEditingEventId(draftId);

        // 2. Wait 20ms for DOM commit, then smoothly trigger the native resize machine loops
        setTimeout(() => {
          const liveEventBlock =
            document.getElementById(draftId) ||
            document.querySelector(`[data-sourceid="${draftId}"]`);
          if (liveEventBlock) {
            handleResizeStart(e, mockEvent, liveEventBlock);
          }
        }, 20);

        holdTimer = null;
      }, 500);

      // Cancel setup loops if user wiggles mouse away or releases too quickly
      const handleGridMoveCheck = (moveEv) => {
        const dx = moveEv.clientX - initialPointerPos.x;
        const dy = moveEv.clientY - initialPointerPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
          if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
            document.body.style.userSelect = "";
            document.body.style.webkitUserSelect = "";
          }
        }
      };

      const handleGridUpCheck = (upEv) => {
        document.body.style.userSelect = "";
        document.body.style.webkitUserSelect = "";

        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;

          // Regular Fast Click: Bypasses hold resizing and uses normal click creation flow
          const clickSyntheticEvent = {
            ...upEv,
            clientX: upEv.clientX,
            clientY: upEv.clientY,
            currentTarget: columnElement,
            syntheticDateId: targetIsoString,
          };
          handleNewEventClick(clickSyntheticEvent);
        }
        window.removeEventListener("pointermove", handleGridMoveCheck);
        window.removeEventListener("pointerup", handleGridUpCheck);
      };

      window.addEventListener("pointermove", handleGridMoveCheck);
      window.addEventListener("pointerup", handleGridUpCheck);
    },
    [
      closePopup,
      isMobile,
      timeZoneOffset,
      handleNewEventClick,
      handleResizeStart,
      setNewEvent,
      setEditingEventId,
    ],
  );

  // --- UPDATED AND FIXED RESIZE END TO HANDLE THE HOLD OVERLAY OPENING ---

  return {
    handleNewEventClick,
    handlePointerDown,
    handleDragStart: handlePointerDown,
    handleDragging,
    handleDragEnd,
    handleResizeStart,
    handleResizing,
    handleResizeEnd,
    handleGridPointerDown,
  };
}

export default useCalendarEventHandlers;
