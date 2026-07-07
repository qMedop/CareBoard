/* eslint-disable no-unused-vars */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./CalendarPage.module.css";
import CustomButton from "../../components/button/Button";
import {
  ArrowDownThinIcon,
  AvailabilityIcon,
  CalendarCircleIcon,
  CopyIcon,
  EyeDashedIcon,
  LockIcon,
  MenuDotsHoriantalIcon,
  NextBtnIcon,
  NotificationIcon,
  PrevBtnIcon,
  RepeatIcon,
  ThreeLinesDashedIcon,
} from "../../assets/icons/Icon";
import { useNotification } from "../../contexts/NotificationContext";
import { useTime } from "../../contexts/TimeContext";
import { useTransition, animated } from "@react-spring/web";
import { usePopup } from "../../contexts/PopupContext";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { getMonthLayout } from "../../utils/getMonthLayout";
import Loading from "../../components/loading/Loading";
import { formatDurationFromMinutes } from "../../utils/formatDurationFromMinutes";
import PickDay from "../../components/pickDay/pickDay";
import { getLocalDateString } from "../../utils/getLocalDateString";
import { useData } from "../../contexts/AuthContext";
import { DateTime } from "luxon";
import EmojiPopup from "../../components/emojiPopup/EmojiPopup";
import AddEditNewEvent from "./components/addEditNewEvent/AddEditNewEvent";
import RecurrenceUpdatePopup from "./components/RecurrenceUpdatePopup/RecurrenceUpdatePopup";
import EventInfoPopup from "./components/EventInfoPopup/EventInfoPopup";
import CalendarContentYear from "./components/CalendarContentYear/CalendarContentYear";
import CalendarContentMonth from "./components/CalendarContentMonth/CalendarContentMonth";
import CalendarContentWeek from "./components/CalendarContentWeek/CalendarContentWeek";
import CalendarContentDay from "./components/CalendarContentDay/CalendarContentDay";
import useCalendarEventHandlers from "./utils/useCalendarEventHandlers";
import CheckboxGroup from "../../components/checkboxGroup/CheckboxGroup";
import MobileCalendarPager from "./components/MobileCalendarPager/MobileCalendarPager";
import defaultAvatar from "../../assets/svg/user-avatar.svg";
import {
  DAYS_OF_WEEK,
  EVENT_CELL_HEIGHT_MOBILE,
  EVENT_CELL_HEIGHT_PC,
  FULL_DAY_COLLAPSE_THRESHOLD,
  FULL_DAY_ROW_GAP,
  FULL_DAY_ROW_HEIGHT,
  MONTHS_OF_THE_YEAR,
} from "../../constants/constants";
import { useUserSettings } from "../../contexts/UserSettingsContext";
import { getUserZone } from "../../utils/getUserZone";

function CalendarPage() {
  const { notify } = useNotification();
  const {
    today,
    newEvent,
    direction,
    timeZoneOffset,
    loadedEvents,
    draggableEvent,
    setNewEvent,
    activeFilterIds,
    setActiveFilterIds,
    isMobile,
    swipingDate,
  } = useTime();
  const { userSettings } = useUserSettings();

  const navigate = useNavigate();

  const { view, year, month, day } = useParams();

  const [editingEventId, setEditingEventId] = useState(null);
  const [infoPopupEventId, setInfoPopupEventId] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [displayedView, setDisplayedView] = useState(view);
  const [showContent, setShowContent] = useState(true);
  const [fullDayExpanded, setFullDayExpanded] = useState(false);
  const [timedEvents, setTimedEvents] = useState([]);
  const [isScrolling, setIsScrolling] = useState(false);

  const scrollTimeoutRef = useRef(null);
  const prevDateRef = useRef(today);

  const currentDate = useMemo(
    () =>
      year && month && day
        ? new Date(Number(year), Number(month) - 1, Number(day))
        : today,
    [year, month, day, today],
  );

  const {
    handleNewEventClick,
    handleDragStart,
    handleResizeStart,
    handleRecurrenceAndSave,
    handlePointerDown,
    handleGridPointerDown,
  } = useCalendarEventHandlers({
    editingEventId,
    setEditingEventId,
    setInfoPopupEventId,
    fullDayExpanded,
    setFullDayExpanded,
    isScrolling,
    setIsScrolling,
    scrollTimeoutRef,
  });

  const weekStartDay = userSettings.weekStartDay;

  const startOfWeek = new Date(currentDate);
  const dayOfWeek = startOfWeek.getDay();

  const offset =
    weekStartDay <= dayOfWeek
      ? weekStartDay - dayOfWeek
      : weekStartDay - dayOfWeek - 7;

  startOfWeek.setDate(startOfWeek.getDate() + offset);

  useEffect(() => {
    setMounted(true);
  }, []);

  //here we calculate the start and end dates for the current view it changes depending on the user choice of the view and the start day of the week
  const { viewStart, viewEnd } = useMemo(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (view === "day") {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (view === "week") {
      const offset =
        weekStartDay <= start.getDay()
          ? weekStartDay - start.getDay()
          : weekStartDay - start.getDay() - 7;
      start.setDate(start.getDate() + offset);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      start.setDate(start.getDate() - 7);
      end.setDate(end.getDate() + 7);
    }
    return { viewStart: start, viewEnd: end };
  }, [currentDate, view]);

  //filter the events based on the user choice of his friends
  const visibleEvents = useMemo(() => {
    if (!loadedEvents) return [];
    if (activeFilterIds.length === 0) return loadedEvents;
    return loadedEvents.filter((ev) => activeFilterIds.includes(ev.ownerId));
  }, [loadedEvents, activeFilterIds]);

  //expand recurring events to show them in the current view
  const expandedEvents = useMemo(() => {
    if (!visibleEvents) return [];
    return expandRecurringEvents(
      visibleEvents,
      viewStart,
      viewEnd,
      timeZoneOffset,
    );
  }, [visibleEvents, viewStart, viewEnd, timeZoneOffset]);

  //this function calculates the position and size of the events based on their start and end times and the current view
  const computePositionAndSize = (event) => {
    if (event.isFullDay) return [];

    const userZone = getUserZone(timeZoneOffset);

    const eventStart = DateTime.fromISO(event.timeRange.start, {
      zone: "utc",
    }).setZone(userZone);
    const eventEnd = DateTime.fromISO(event.timeRange.end, {
      zone: "utc",
    }).setZone(userZone);

    const segments = [];
    let current = eventStart.startOf("day");
    const lastDay = eventEnd.startOf("day");

    const cellHeight = isMobile
      ? EVENT_CELL_HEIGHT_MOBILE
      : EVENT_CELL_HEIGHT_PC;

    while (current <= lastDay) {
      const segmentStart = current < eventStart ? eventStart : current;
      const nextDay = current.plus({ days: 1 }).startOf("day");
      const segmentEnd = nextDay < eventEnd ? nextDay : eventEnd;

      const columnDate = segmentStart.toISODate();

      const startMinutes = segmentStart.hour * 60 + segmentStart.minute;
      let endMinutes = segmentEnd.hour * 60 + segmentEnd.minute;

      if (
        segmentEnd.toISODate() !== segmentStart.toISODate() &&
        endMinutes === 0
      ) {
        endMinutes = 1440;
      }

      const durationMinutes = endMinutes - startMinutes;
      const height = Math.max((durationMinutes / 60) * cellHeight - 2, 4);
      const yOffset = (startMinutes / 60) * cellHeight + 1;

      segments.push({
        ...event,
        id: `${event.id}`,
        segmentId: `${event.id}-${columnDate}`,
        columnDate,
        originalTimeRange: event.timeRange,
        timeRange: {
          start: segmentStart.toISO(),
          end: segmentEnd.toISO(),
        },
        isSegment: true,
        position: { x: 0, y: yOffset },
        size: { height },
      });

      current = current.plus({ days: 1 });
    }

    return segments;
  };
  // same thing but for full day event
  const { fullDayEvents, topHeight, isCollapsible } = useMemo(() => {
    const ROW_HEIGHT = FULL_DAY_ROW_HEIGHT;
    const ROW_GAP = FULL_DAY_ROW_GAP;
    const COLLAPSE_THRESHOLD = FULL_DAY_COLLAPSE_THRESHOLD;

    function adjustEndDateIfMidnight(dateStr) {
      let dt = DateTime.fromISO(dateStr, { zone: "utc" }).setZone(
        getUserZone(timeZoneOffset),
      );
      if (dt.hour === 0 && dt.minute === 0) dt = dt.minus({ days: 1 });
      return new Date(dt.toISODate());
    }

    const allEventsUnfiltered = [...expandedEvents];

    if (newEvent?.timeRange?.start) {
      allEventsUnfiltered.push(newEvent);
    }

    if (draggableEvent?.active && draggableEvent?.originalTimeRange) {
      const { isSegment, ...cleanedDraggableEvent } = draggableEvent;
      allEventsUnfiltered.push({
        ...cleanedDraggableEvent,
        id: `${draggableEvent.id}`,
        timeRange: { ...draggableEvent.timeRange },
        isGhost: true,
      });
    }

    const realEvents = [];
    const ghostEvents = [];

    allEventsUnfiltered.forEach((event) => {
      if (event.isGhost) {
        ghostEvents.push(event);
      } else {
        realEvents.push(event);
      }
    });

    const uniqueRealEvents = Array.from(
      new Map(realEvents.map((e) => [e.id, e])).values(),
    );

    const allEvents = [...uniqueRealEvents, ...ghostEvents];

    const visibleColumnDates = [];

    if (view === "day") {
      visibleColumnDates.push(getLocalDateString(currentDate));
    } else if (view === "week") {
      const temp = new Date(currentDate);
      const currentDay = temp.getDay();

      const offset =
        weekStartDay <= currentDay
          ? weekStartDay - currentDay
          : weekStartDay - currentDay - 7;

      temp.setDate(temp.getDate() + offset);

      for (let i = 0; i < 7; i++) {
        const d = new Date(temp);
        d.setDate(temp.getDate() + i);
        visibleColumnDates.push(getLocalDateString(d));
      }
    }

    const fullDayRaw = [];
    const dragGhosts = [];

    allEvents.forEach((event) => {
      if (!event?.timeRange?.start || !event?.timeRange?.end) return;
      if (event.isSegment) return;

      const start = DateTime.fromISO(event.timeRange.start, { zone: "utc" });
      const end = DateTime.fromISO(event.timeRange.end, { zone: "utc" });
      const durationHours = end.diff(start, "hours").hours;

      if (durationHours >= 24 || event.isFullDay) {
        const eventStart = new Date(
          DateTime.fromISO(event.timeRange.start, { zone: "utc" })
            .setZone(getUserZone(timeZoneOffset))
            .toISODate(),
        );
        const eventEnd = adjustEndDateIfMidnight(event.timeRange.end);

        const viewStart = new Date(visibleColumnDates[0]);
        const viewEnd = new Date(
          visibleColumnDates[visibleColumnDates.length - 1],
        );
        viewEnd.setHours(23, 59, 59, 999);

        if (eventEnd >= viewStart && eventStart <= viewEnd) {
          if (event.isGhost) {
            dragGhosts.push(event);
          } else {
            fullDayRaw.push(event);
          }
        }
      }
    });

    fullDayRaw.sort((a, b) => {
      const aIsTop = a.isUnsaved || a.id === String(editingEventId);
      const bIsTop = b.isUnsaved || b.id === String(editingEventId);

      if (aIsTop && !bIsTop) return -1;
      if (!aIsTop && bIsTop) return 1;

      const aStart = new Date(a.timeRange.start).getTime();
      const bStart = new Date(b.timeRange.start).getTime();

      if (aStart !== bStart) return aStart - bStart;

      const aDuration = new Date(a.timeRange.end).getTime() - aStart;
      const bDuration = new Date(b.timeRange.end).getTime() - bStart;

      return bDuration - aDuration;
    });

    const getDayIndex = (date) =>
      visibleColumnDates.indexOf(getLocalDateString(date));
    const allRows = [];

    fullDayRaw.forEach((event) => {
      const start = new Date(
        DateTime.fromISO(event.timeRange.start, { zone: "utc" })
          .setZone(getUserZone(timeZoneOffset))
          .toISODate(),
      );
      const end = adjustEndDateIfMidnight(event.timeRange.end);

      const rawStartIndex = getDayIndex(start);
      if (rawStartIndex === -1 && start > new Date(visibleColumnDates.at(-1))) {
        return;
      }
      const startIndex = Math.max(0, rawStartIndex);

      const rawEndIndex = getDayIndex(end);
      const endIndex =
        rawEndIndex === -1
          ? visibleColumnDates.length - 1
          : Math.min(rawEndIndex, visibleColumnDates.length - 1);

      let rowIndex = 0;
      while (true) {
        const row = allRows[rowIndex] || [];

        const hasConflict = row.some(
          (ev) => !(endIndex < ev._startIndex || startIndex > ev._endIndex),
        );

        if (!hasConflict) {
          event._startIndex = startIndex;
          event._endIndex = endIndex;
          event._row = rowIndex;
          event._contForward =
            getLocalDateString(end) > visibleColumnDates.at(-1);
          event._contBackward =
            getLocalDateString(start) < visibleColumnDates[0];
          row.push(event);
          allRows[rowIndex] = row;
          break;
        }
        rowIndex++;
      }
    });

    dragGhosts.forEach((ghost) => {
      const origId = ghost.id.replace("drag-", "");
      const start = new Date(
        DateTime.fromISO(ghost.timeRange.start, { zone: "utc" })
          .setZone(getUserZone(timeZoneOffset))
          .toISODate(),
      );
      const end = adjustEndDateIfMidnight(ghost.timeRange.end);

      const rawStartIndex = getDayIndex(start);
      const startIndex = Math.max(0, rawStartIndex);
      const rawEndIndex = getDayIndex(end);
      const endIndex =
        rawEndIndex === -1
          ? visibleColumnDates.length - 1
          : Math.min(rawEndIndex, visibleColumnDates.length - 1);

      let targetRow = 0;
      while (true) {
        const row = allRows[targetRow] || [];
        const hasConflict = row.some((event) => {
          if (event.id === ghost.id) return false;
          return !(
            endIndex < event._startIndex || startIndex > event._endIndex
          );
        });
        if (!hasConflict) {
          break;
        }
        targetRow++;
      }

      if (!fullDayExpanded && targetRow >= COLLAPSE_THRESHOLD) {
        targetRow = 0;
      }

      ghost._startIndex = startIndex;
      ghost._endIndex = endIndex;
      ghost._row = targetRow;
      ghost._contForward = getLocalDateString(end) > visibleColumnDates.at(-1);
      ghost._contBackward = getLocalDateString(start) < visibleColumnDates[0];
    });

    const isCollapsibleCheck = allRows.length > COLLAPSE_THRESHOLD;
    let eventsToRender = allRows.flat();
    let moreEvents = [];
    let finalRowsCount = allRows.length;

    if (isCollapsibleCheck && !fullDayExpanded) {
      finalRowsCount = COLLAPSE_THRESHOLD + 1;
      const visibleRows = allRows.slice(0, COLLAPSE_THRESHOLD);
      eventsToRender = visibleRows.flat();
      const hiddenRows = allRows.slice(COLLAPSE_THRESHOLD);

      const overflowCountsByColumn = {};

      for (let i = 0; i < visibleColumnDates.length; i++) {
        let count = 0;
        for (const row of hiddenRows) {
          if (
            row.some((event) => i >= event._startIndex && i <= event._endIndex)
          ) {
            count++;
          }
        }
        if (count > 0) overflowCountsByColumn[i] = count;
      }

      Object.entries(overflowCountsByColumn).forEach(([dayIndex, count]) => {
        moreEvents.push({
          id: `more-${dayIndex}`,
          title: `+${count} more`,
          _row: COLLAPSE_THRESHOLD,
          _startIndex: parseInt(dayIndex, 10),
          _endIndex: parseInt(dayIndex, 10),
          isMoreButton: true,
        });
      });
    }

    eventsToRender = [...eventsToRender, ...dragGhosts];

    const styledFullDayEvents = eventsToRender.map((event) => {
      const span = event._endIndex - event._startIndex + 1;
      const columnWidthPct = 100 / visibleColumnDates.length;
      const left = event._startIndex * columnWidthPct;
      const widthPadding = event._contBackward ? "16px" : "8px";
      const width = `calc(${span * columnWidthPct}% - ${widthPadding})`;
      const top = event._row * (ROW_HEIGHT + ROW_GAP);

      return {
        ...event,
        isFullDay: true,
        position: { top, left: `${left}%` },
        size: { width, height: `${ROW_HEIGHT}px` },
        classes: [
          ...(event._contForward ? ["contForward"] : []),
          ...(event._contBackward ? ["contBackward"] : []),
        ],
      };
    });

    const styledMoreEvents = moreEvents.map((event) => {
      const span = event._endIndex - event._startIndex + 1;
      const columnWidthPct = 100 / visibleColumnDates.length;
      const left = event._startIndex * columnWidthPct;
      const width = `calc(${span * columnWidthPct}% - 8px)`;
      const top = event._row * (ROW_HEIGHT + ROW_GAP);

      return {
        ...event,
        isFullDay: true,
        position: { top, left: `${left}%` },
        size: { width: width, height: `${ROW_HEIGHT}px` },
      };
    });

    const newTopHeight = finalRowsCount * (ROW_HEIGHT + ROW_GAP * 2);

    return {
      fullDayEvents: [...styledFullDayEvents, ...styledMoreEvents].filter(
        Boolean,
      ),
      topHeight: newTopHeight,
      isCollapsible: isCollapsibleCheck,
    };
  }, [
    expandedEvents,
    newEvent,
    draggableEvent,
    view,
    currentDate,
    fullDayExpanded,
    editingEventId,
    timeZoneOffset,
  ]);

  useLayoutEffect(() => {
    const MAX_WIDTH_PCT = isMobile ? 100 : 90;
    const GAP_PX = 4;

    const isOverlapping = (a, b) => {
      const startA = DateTime.fromISO(a.timeRange.start);
      const endA = DateTime.fromISO(a.timeRange.end);
      const startB = DateTime.fromISO(b.timeRange.start);
      const endB = DateTime.fromISO(b.timeRange.end);
      return startA < endB && startB < endA;
    };

    const allEventsUnfiltered = [...expandedEvents];
    if (newEvent?.timeRange?.start) {
      allEventsUnfiltered.push(newEvent);
    }

    if (draggableEvent?.active && draggableEvent?.originalTimeRange) {
      const { isSegment, ...cleanedDraggableEvent } = draggableEvent;

      allEventsUnfiltered.push({
        ...cleanedDraggableEvent,
        timeRange: { ...draggableEvent.timeRange },
        isGhost: true,
      });
    }

    const realEvents = [];
    const ghostEvents = [];

    allEventsUnfiltered.forEach((event) => {
      if (event.isGhost) {
        ghostEvents.push(event);
      } else {
        realEvents.push(event);
      }
    });

    const uniqueRealEvents = Array.from(
      new Map(realEvents.map((e) => [e.id, e])).values(),
    );

    const allEvents = [...uniqueRealEvents, ...ghostEvents];
    const timedRaw = [];

    allEvents.forEach((event) => {
      if (!event?.timeRange?.start || !event?.timeRange?.end) return;
      if (event.isSegment) return;

      const start = DateTime.fromISO(event.timeRange.start, { zone: "utc" });
      const end = DateTime.fromISO(event.timeRange.end, { zone: "utc" });
      const durationHours = end.diff(start, "hours").hours;

      if (durationHours < 24 && !event.isFullDay) {
        timedRaw.push(event);
      }
    });

    const timedWithSegments = timedRaw.flatMap((event) =>
      computePositionAndSize(event),
    );

    const eventsByDate = {};
    for (const event of timedWithSegments) {
      if (!event?.columnDate) continue;
      if (!eventsByDate[event.columnDate]) eventsByDate[event.columnDate] = [];
      eventsByDate[event.columnDate].push(event);
    }

    Object.values(eventsByDate).forEach((eventsOnDay) => {
      const staticEvents = eventsOnDay.filter((e) => !e.isGhost);
      if (staticEvents.length === 0) return;

      staticEvents.sort(
        (a, b) =>
          new Date(a.timeRange.start).getTime() -
          new Date(b.timeRange.start).getTime(),
      );

      const eventGroups = [];
      if (staticEvents.length > 0) {
        let currentGroup = [staticEvents[0]];
        let groupEndTime = new Date(staticEvents[0].timeRange.end).getTime();

        for (let i = 1; i < staticEvents.length; i++) {
          const event = staticEvents[i];
          const eventStartTime = new Date(event.timeRange.start).getTime();

          if (eventStartTime < groupEndTime) {
            currentGroup.push(event);
            groupEndTime = Math.max(
              groupEndTime,
              new Date(event.timeRange.end).getTime(),
            );
          } else {
            eventGroups.push(currentGroup);
            currentGroup = [event];
            groupEndTime = new Date(event.timeRange.end).getTime();
          }
        }
        eventGroups.push(currentGroup);
      }

      for (const group of eventGroups) {
        const columns = [];
        for (const event of group) {
          let placed = false;
          for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            if (!col.some((e) => isOverlapping(e, event))) {
              col.push(event);
              event._columnIndex = i;
              placed = true;
              break;
            }
          }
          if (!placed) {
            columns.push([event]);
            event._columnIndex = columns.length - 1;
          }
        }

        const totalColumnsInGroup = columns.length;
        const widthPct =
          totalColumnsInGroup > 0
            ? (MAX_WIDTH_PCT -
                ((totalColumnsInGroup - 1) * (GAP_PX * 100)) / 300) /
              totalColumnsInGroup
            : MAX_WIDTH_PCT;

        for (const event of group) {
          const leftPct =
            event._columnIndex * (widthPct + (GAP_PX * 100) / 300);
          event.position.x = isMobile && event.isGhost ? 0 : leftPct;
          event.size.width = isMobile && event.isGhost ? 100 : widthPct;
          delete event._columnIndex;
        }
      }

      eventsOnDay
        .filter((e) => e.isGhost)
        .forEach((event) => {
          event.position.x = 0;
          event.size.width = MAX_WIDTH_PCT;
        });
    });

    if (JSON.stringify(timedEvents) !== JSON.stringify(timedWithSegments)) {
      setTimedEvents(timedWithSegments);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {});
    });
  }, [
    expandedEvents,
    newEvent,
    draggableEvent,
    timeZoneOffset,
    view,
    currentDate,
    isMobile,
  ]);

  const renderEvents = useMemo(
    () => [...timedEvents, ...fullDayEvents],
    [timedEvents, fullDayEvents],
  );

  useEffect(() => {
    if (view !== displayedView) {
      setShowContent(false);
      const timeout = setTimeout(() => {
        setDisplayedView(view);
        setShowContent(true);
      }, 150);
      return () => clearTimeout(timeout);
    }
  }, [view, displayedView]);

  const dateTransitions = useTransition(currentDate, {
    key: currentDate.toDateString(),
    from: {
      transform: mounted
        ? `translateX(${direction === "next" ? "50%" : "-50%"})`
        : "translateX(0%)",
      opacity: mounted ? 0 : 1,
      position: "absolute",
      width: "100%",
    },
    enter: { transform: "translateX(0%)", opacity: 1 },
    leave: { transform: "translateX(0%)", opacity: 0 },
    config: { tension: 300, friction: 30 },
  });

  prevDateRef.current = currentDate;
  return (
    <div
      className={`${styles.calendarContainer} ${
        displayedView === "day"
          ? styles.dayView
          : displayedView === "week"
            ? styles.weekView
            : displayedView === "year"
              ? styles.yearView
              : displayedView === "month"
                ? styles.monthView
                : ""
      }`}
      style={{ position: "relative", overflow: "hidden" }}
    >
      {isMobile && (
        <div className={styles.mobileTop}>
          <CustomButton
            ClickEffect={"scale"}
            className={`${styles.monthBtn} default`}
          >
            <p className={styles.month}>
              {MONTHS_OF_THE_YEAR[currentDate.getMonth()].toUpperCase()}
            </p>
          </CustomButton>
        </div>
      )}
      {isMobile && displayedView === "month" && (
        <div className={styles.monthTopWeek}>
          {Array.from({ length: 7 }, (_, index) => {
            const date = new Date(startOfWeek);
            date.setDate(startOfWeek.getDate() + index);
            const isToday = date.toDateString() === new Date().toDateString();
            const dateStr = getLocalDateString(date);
            const actualDay = date.getDay();
            return (
              <div key={dateStr} className={styles.dayBlock}>
                <p>
                  {isMobile
                    ? DAYS_OF_WEEK[actualDay].slice(0, 1)
                    : DAYS_OF_WEEK[actualDay]}
                </p>
              </div>
            );
          })}
        </div>
      )}
      {isMobile ? (
        <MobileCalendarPager
          currentDate={swipingDate}
          displayedView={displayedView}
          renderEvents={renderEvents}
          topHeight={topHeight}
          setFullDayExpanded={setFullDayExpanded}
          fullDayExpanded={fullDayExpanded}
          editingEventId={editingEventId}
          handlePointerDown={handlePointerDown}
          handleResizeStart={handleResizeStart}
          handleNewEventClick={handleNewEventClick}
          infoPopupEventId={infoPopupEventId}
          expandedEvents={expandedEvents}
          newEvent={newEvent}
          setNewEvent={setNewEvent}
          timeZoneOffset={timeZoneOffset}
          setEditingEventId={setEditingEventId}
          setInfoPopupEventId={setInfoPopupEventId}
          handleRecurrenceAndSave={handleRecurrenceAndSave}
          isScrolling={isScrolling}
          setIsScrolling={setIsScrolling}
          scrollTimeoutRef={scrollTimeoutRef}
          handleGridPointerDown={handleGridPointerDown}
        />
      ) : (
        <AnimatePresence mode="wait">
          {showContent && (
            <motion.div
              key={displayedView}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ position: "relative", height: "calc(100% - 6px)" }}
            >
              {dateTransitions((style, item) => (
                <animated.div
                  style={style}
                  className={styles.transitionWrapper}
                >
                  {displayedView === "day" ? (
                    <CalendarContentDay
                      currentDate={item}
                      renderEvents={renderEvents}
                      topHeight={topHeight}
                      setFullDayExpanded={setFullDayExpanded}
                      fullDayExpanded={fullDayExpanded}
                      editingEventId={editingEventId}
                      handlePointerDown={handlePointerDown}
                      handleResizeStart={handleResizeStart}
                      handleNewEventClick={handleNewEventClick}
                      infoPopupEventId={infoPopupEventId}
                      handleGridPointerDown={handleGridPointerDown}
                    />
                  ) : displayedView === "week" ? (
                    <CalendarContentWeek
                      currentDate={item}
                      renderEvents={renderEvents}
                      topHeight={topHeight}
                      setFullDayExpanded={setFullDayExpanded}
                      fullDayExpanded={fullDayExpanded}
                      editingEventId={editingEventId}
                      handlePointerDown={handlePointerDown}
                      handleResizeStart={handleResizeStart}
                      handleNewEventClick={handleNewEventClick}
                      infoPopupEventId={infoPopupEventId}
                      handleGridPointerDown={handleGridPointerDown}
                    />
                  ) : displayedView === "month" ? (
                    <CalendarContentMonth
                      currentDate={item}
                      expandedEvents={expandedEvents}
                      newEvent={newEvent}
                      setNewEvent={setNewEvent}
                      timeZoneOffset={timeZoneOffset}
                      handleNewEventClick={handleNewEventClick}
                      editingEventId={editingEventId}
                      setEditingEventId={setEditingEventId}
                      infoPopupEventId={infoPopupEventId}
                      setInfoPopupEventId={setInfoPopupEventId}
                      handleRecurrenceAndSave={handleRecurrenceAndSave}
                    />
                  ) : displayedView === "year" ? (
                    <CalendarContentYear currentDate={item} />
                  ) : (
                    <Loading />
                  )}
                </animated.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

function expandRecurringEvents(events, viewStart, viewEnd, timeZoneOffset) {
  const expanded = [];
  const userZone = getUserZone(timeZoneOffset);
  const rangeStart = DateTime.fromJSDate(viewStart)
    .setZone(userZone)
    .startOf("day");
  const rangeEnd = DateTime.fromJSDate(viewEnd).setZone(userZone).endOf("day");

  if (!rangeStart.isValid || !rangeEnd.isValid) return events;

  events.forEach((event) => {
    if (!event.recurrence || event.recurrence.type === "NONE") {
      expanded.push(event);
      return;
    }

    const exdateMillis = new Set(
      (event.exdate || []).map((d) =>
        DateTime.fromISO(d, { zone: "utc" }).toMillis(),
      ),
    );

    const { type, daysOfWeek, endOption, endDate, occurrenceCount } =
      event.recurrence;
    let interval = Number(event.recurrence.interval);
    if (isNaN(interval) || interval < 1) interval = 1;

    const originalStart = DateTime.fromISO(event.timeRange.start, {
      zone: "utc",
    }).setZone(userZone);
    const originalEnd = DateTime.fromISO(event.timeRange.end, {
      zone: "utc",
    }).setZone(userZone);
    const duration = originalEnd.diff(originalStart);

    let currentStart = originalStart;
    let count = 0;
    let recurrenceEndDateTime = null;

    if (endOption === "DATE" && endDate) {
      recurrenceEndDateTime = DateTime.fromISO(endDate, {
        zone: userZone,
      }).endOf("day");
    }

    let safetyLoop = 0;
    const MAX_LOOPS = 2000;

    while (safetyLoop < MAX_LOOPS) {
      safetyLoop++;

      if (endOption === "COUNT" && count >= occurrenceCount) break;
      if (
        endOption === "DATE" &&
        recurrenceEndDateTime &&
        currentStart > recurrenceEndDateTime
      )
        break;
      if (currentStart > rangeEnd) break;

      let isValidInstance = true;

      if (type === "WEEKLY" && DAYS_OF_WEEK?.length > 0) {
        const jsWeekday = currentStart.weekday === 7 ? 0 : currentStart.weekday;
        if (!DAYS_OF_WEEK.includes(jsWeekday)) isValidInstance = false;
      }

      if (exdateMillis.has(currentStart.toMillis())) {
        isValidInstance = false;
      }

      if (isValidInstance) {
        const instanceEnd = currentStart.plus(duration);
        if (instanceEnd >= rangeStart && currentStart <= rangeEnd) {
          expanded.push({
            ...event,
            id: `${event.id}_${currentStart.toMillis()}`,
            sourceEventId: event.id,
            timeRange: {
              start: currentStart.toUTC().toISO(),
              end: instanceEnd.toUTC().toISO(),
            },
            exdate: undefined,
          });
        }

        if (
          type !== "WEEKLY" ||
          !DAYS_OF_WEEK ||
          DAYS_OF_WEEK.length === 0 ||
          DAYS_OF_WEEK.includes(
            currentStart.weekday === 7 ? 0 : currentStart.weekday,
          )
        ) {
          count++;
        }
      }

      if (type === "DAILY")
        currentStart = currentStart.plus({ days: interval });
      else if (type === "WEEKLY") {
        if (DAYS_OF_WEEK?.length > 0) {
          do {
            currentStart = currentStart.plus({ days: 1 });
          } while (
            currentStart <= rangeEnd &&
            !DAYS_OF_WEEK.includes(
              currentStart.weekday === 7 ? 0 : currentStart.weekday,
            ) &&
            currentStart.diff(originalStart, "years").years < 5
          );
        } else {
          currentStart = currentStart.plus({ weeks: interval });
        }
      } else if (type === "MONTHLY")
        currentStart = currentStart.plus({ months: interval });
      else if (type === "YEARLY")
        currentStart = currentStart.plus({ years: interval });
      else break;
    }
  });

  return expanded;
}

function CalendarFilterPopup({
  availableUsers,
  activeFilterIds,
  setActiveFilterIds,
  closePopup,
}) {
  const [tempFilters, setTempFilters] = useState(
    activeFilterIds?.length === 0
      ? availableUsers.map((u) => u.id)
      : activeFilterIds,
  );

  const handleApply = () => {
    if (tempFilters.length === availableUsers.length) {
      setActiveFilterIds([]);
    } else {
      setActiveFilterIds(tempFilters);
    }
    closePopup();
  };

  return (
    <div className={styles.filterPopup}>
      <div className={styles.filterHeader}>
        <h3>Calendars to show</h3>
      </div>
      <div className={styles.filterBody}>
        <CheckboxGroup
          items={availableUsers}
          selectedIds={tempFilters}
          onChange={setTempFilters}
        />
      </div>
      <div className={styles.filterFooter}>
        <CustomButton onClick={() => closePopup()} className="default">
          Cancel
        </CustomButton>
        <CustomButton onClick={handleApply} className="default primary">
          Apply
        </CustomButton>
      </div>
    </div>
  );
}

function CalendarNavControlls() {
  const { openPopup, closePopup } = usePopup();
  const {
    today,
    setToday,
    setDirection,
    loadedEvents,
    activeFilterIds,
    setActiveFilterIds,
    isMobile,
  } = useTime();
  const { currentUser } = useData();

  const location = useLocation();
  const navigate = useNavigate();
  const [, , view, dayStr, monthStr, yearStr] = location.pathname.split("/");
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);

  const isValidDate =
    !isNaN(day) &&
    !isNaN(month) &&
    !isNaN(year) &&
    day > 0 &&
    month > 0 &&
    month <= 12;

  const currentDate = useMemo(
    () => (isValidDate ? new Date(year, month - 1, day) : today),
    [isValidDate, year, month, day, today],
  );

  const moveDate = useCallback(
    (direction) => {
      let newDate = new Date(currentDate);
      switch (view) {
        case "day":
          newDate.setDate(newDate.getDate() + (direction === "next" ? 1 : -1));
          break;
        case "week":
          newDate.setDate(newDate.getDate() + (direction === "next" ? 7 : -7));
          break;
        case "month":
          newDate.setMonth(
            newDate.getMonth() + (direction === "next" ? 1 : -1),
          );
          break;
        case "year":
          newDate.setFullYear(
            newDate.getFullYear() + (direction === "next" ? 1 : -1),
          );
          break;
        default:
          break;
      }
      setDirection(direction);
      setToday(newDate);
      navigate(
        `/calendar/${view}/${newDate.getDate()}/${
          newDate.getMonth() + 1
        }/${newDate.getFullYear()}`,
      );
    },
    [currentDate, navigate, setDirection, setToday, view],
  );

  const handleNext = () => moveDate("next");
  const handlePrev = () => moveDate("prev");

  const changeViewType = (e) => {
    const views = ["day", "week", "month", "year"];
    openPopup(
      "contextual",
      () => (
        <div className={styles.viewPopup}>
          {views.map((v) => (
            <CustomButton
              ClickEffect={"scale"}
              className="default"
              key={v}
              link
              href={`/calendar/${v}/${day || today.getDate()}/${
                month || today.getMonth() + 1
              }/${year || today.getFullYear()}`}
              onClick={() => closePopup()}
            >
              <p>{v}</p>
              <span>{v.charAt(0)}</span>
            </CustomButton>
          ))}
        </div>
      ),
      e.currentTarget,
      "bottomRight",
    );
  };

  const handleTodayClick = () => {
    const now = new Date();
    if (
      currentDate.getFullYear() === now.getFullYear() &&
      currentDate.getMonth() === now.getMonth() &&
      currentDate.getDate() === now.getDate()
    ) {
      return;
    }

    const calculatedDirection = currentDate > now ? "prev" : "next";
    setDirection(calculatedDirection);

    if (isMobile) {
      const todayAnimationEvent = new CustomEvent("animateToToday", {
        detail: { direction: calculatedDirection, targetDate: now },
      });
      window.dispatchEvent(todayAnimationEvent);
    } else {
      setToday(now);
      navigate(
        `/calendar/${view}/${now.getDate()}/${
          now.getMonth() + 1
        }/${now.getFullYear()}`,
      );
    }
  };

  const availableUsers = useMemo(() => {
    const usersMap = new Map();
    if (currentUser) {
      usersMap.set(currentUser.id, {
        id: currentUser.id,
        label: "My Calendar",
        icon: currentUser.pfpUrl || defaultAvatar,
      });
    }

    // Add friends from loadedEvents
    loadedEvents?.forEach((ev) => {
      if (ev.isShared && ev.ownerId && !usersMap.has(ev.ownerId)) {
        usersMap.set(ev.ownerId, {
          id: ev.ownerId,
          label: ev.ownerName || "Friend",
          icon: ev.ownerPfp || defaultAvatar,
        });
      }
    });

    return Array.from(usersMap.values());
  }, [loadedEvents, currentUser]);

  const hasSharedEvents = availableUsers.length >= 1;
  const activeAvatars =
    activeFilterIds?.length === 0
      ? availableUsers
      : availableUsers.filter((u) => activeFilterIds?.includes(u.id));
  const handleFilterClick = (e) => {
    openPopup(
      "centered",
      () => (
        <CalendarFilterPopup
          availableUsers={availableUsers}
          activeFilterIds={activeFilterIds}
          setActiveFilterIds={setActiveFilterIds}
          closePopup={closePopup}
        />
      ),
      e.currentTarget,
      "center",
    );
  };
  return (
    <div className={styles.navControls}>
      <div className={styles.left}>
        {!isMobile && (
          <>
            <div className={styles.today}>
              <CustomButton
                ClickEffect={"scale"}
                className="lineBorder"
                onClick={handleTodayClick}
              >
                <p>Today</p>
              </CustomButton>
            </div>
            <div className={styles.navButtons}>
              <CustomButton ClickEffect={"scale"} onClick={handlePrev}>
                <PrevBtnIcon />
              </CustomButton>
              <CustomButton ClickEffect={"scale"} onClick={handleNext}>
                <NextBtnIcon />
              </CustomButton>
            </div>
            <div className={styles.currentDate}>
              <p className={styles.month}>
                {MONTHS_OF_THE_YEAR[today.getMonth()]}
              </p>
              <p className={styles.year}>{today.getFullYear()}</p>
            </div>
          </>
        )}
      </div>
      <div className={styles.right}>
        {/* 🔴 FILTER BUTTON (Only shows if there are shared events) */}
        {hasSharedEvents && (
          <div
            className={styles.filterButtonContainer}
            onClick={handleFilterClick}
          >
            {activeAvatars.slice(0, 3).map((user, idx) => (
              <div
                key={user.id}
                className={styles.filterAvatar}
                style={{ zIndex: 3 - idx }}
              >
                <img src={user.icon || defaultAvatar} alt={user.label} />
              </div>
            ))}
            {activeAvatars.length > 3 && (
              <div className={`${styles.filterAvatar} ${styles.filterMore}`}>
                +{activeAvatars.length - 3}
              </div>
            )}
          </div>
        )}

        <CustomButton
          ClickEffect={"scale"}
          onClick={changeViewType}
          className="lineBorder"
          type="list"
        >
          <p>{view || "month"}</p>
        </CustomButton>
        {isMobile && (
          <div className={styles.today}>
            <CustomButton
              ClickEffect={"scale"}
              className={styles.todayMobile + " lineBorder"}
              onClick={handleTodayClick}
            >
              <p>{new Date().getDate()}</p>
            </CustomButton>
          </div>
        )}
      </div>
    </div>
  );
}

export { CalendarPage, CalendarNavControlls };
