import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, useAnimation, useDragControls } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTime } from "../../../../contexts/TimeContext";
import { usePopup } from "../../../../contexts/PopupContext";
import CalendarContentDay from "../CalendarContentDay/CalendarContentDay";
import CalendarContentWeek from "../CalendarContentWeek/CalendarContentWeek";
import CalendarContentMonth from "../CalendarContentMonth/CalendarContentMonth";
import CalendarContentYear from "../CalendarContentYear/CalendarContentYear";
import Loading from "../../../../components/loading/Loading";

const DIRECTION_LOCK_DISTANCE = 6;
const HORIZONTAL_DOMINANCE_RATIO = 1.15;
const QUICK_SWIPE_MAX_DURATION = 650;
const QUICK_SWIPE_MIN_DISTANCE_RATIO = 0.08;
const FLICK_VELOCITY = 400;
const SLOW_DRAG_THRESHOLD_RATIO = 0.5;

const PAGE_SPRING = {
  type: "spring",
  stiffness: 260,
  damping: 32,
  mass: 1,
  restSpeed: 2,
  restDelta: 0.5,
};

const SNAP_BACK_SPRING = {
  type: "spring",
  stiffness: 340,
  damping: 34,
  mass: 0.9,
  restSpeed: 2,
  restDelta: 0.5,
};

const clampVelocity = (velocity) => {
  return Math.max(-1500, Math.min(1500, velocity));
};

export default function MobileCalendarPager({
  displayedView,
  currentDate,
  renderEvents,
  topHeight,
  setFullDayExpanded,
  fullDayExpanded,
  editingEventId,
  handlePointerDown,
  handleResizeStart,
  handleNewEventClick,
  infoPopupEventId,
  expandedEvents,
  newEvent,
  setNewEvent,
  timeZoneOffset,
  setEditingEventId,
  setInfoPopupEventId,
  handleRecurrenceAndSave,
  isScrolling,
  setIsScrolling,
  scrollTimeoutRef,
  handleGridPointerDown,
}) {
  const navigate = useNavigate();
  const { setDirection, setTodayDeferred, draggableEvent } = useTime();
  const { closePopup } = usePopup();

  const containerRef = useRef(null);
  const controls = useAnimation();
  const dragControls = useDragControls();

  const [visualDate, setVisualDate] = useState(() => new Date(currentDate));
  const [destinationDate, setDestinationDate] = useState(null);
  const [destinationDirection, setDestinationDirection] = useState(null);

  const touchStart = useRef({ x: 0, y: 0 });
  const gestureStartTime = useRef(0);
  const isDirectionChecked = useRef(false);
  const animationPurposeRef = useRef(null);
  const isCommittingRef = useRef(false);
  const committedDateRef = useRef(null);
  const navigationTargetRef = useRef(null);

  const isInteractingWithEvent = Boolean(draggableEvent?.active);

  const clearInteractionState = useCallback(() => {
    closePopup?.();
    setInfoPopupEventId?.(null);
    setEditingEventId?.(null);
    setNewEvent?.(null);
  }, [closePopup, setInfoPopupEventId, setEditingEventId, setNewEvent]);

  useEffect(() => {
    if (isScrolling) clearInteractionState();
  }, [isScrolling, clearInteractionState]);

  const generateDateOffset = useCallback(
    (date, offset) => {
      const result = new Date(date);

      if (displayedView === "day") {
        result.setDate(result.getDate() + offset);
      } else if (displayedView === "week") {
        result.setDate(result.getDate() + offset * 7);
      } else if (displayedView === "month") {
        result.setMonth(result.getMonth() + offset);
      } else if (displayedView === "year") {
        result.setFullYear(result.getFullYear() + offset);
      }

      return result;
    },
    [displayedView],
  );

  const prevDate = useMemo(
    () => generateDateOffset(visualDate, -1),
    [visualDate, generateDateOffset],
  );

  const nextDate = useMemo(
    () => generateDateOffset(visualDate, 1),
    [visualDate, generateDateOffset],
  );

  const commitLogicalDate = useCallback(
    (targetDate, direction) => {
      if (isCommittingRef.current) return;

      isCommittingRef.current = true;
      committedDateRef.current = new Date(targetDate);

      setDirection(direction);
      setTodayDeferred(targetDate, 0);

      navigate(
        `/calendar/${displayedView}/${targetDate.getDate()}/${
          targetDate.getMonth() + 1
        }/${targetDate.getFullYear()}`,
        { replace: true },
      );
    },
    [displayedView, navigate, setDirection, setTodayDeferred],
  );

  const startPageAnimation = useCallback(
    (direction, targetDate, targetX, releaseVelocity = 0) => {
      if (
        destinationDate ||
        isInteractingWithEvent ||
        animationPurposeRef.current
      ) {
        return;
      }

      clearInteractionState();
      setIsScrolling?.(true);

      if (scrollTimeoutRef?.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }

      animationPurposeRef.current = "navigate";
      navigationTargetRef.current = {
        direction,
        targetDate: new Date(targetDate),
        targetX,
      };

      controls.start({
        x: targetX,
        transition: {
          ...PAGE_SPRING,
          velocity: clampVelocity(releaseVelocity),
        },
      });

      commitLogicalDate(targetDate, direction);
    },
    [
      destinationDate,
      isInteractingWithEvent,
      clearInteractionState,
      setIsScrolling,
      scrollTimeoutRef,
      controls,
      commitLogicalDate,
    ],
  );

  const startTodayAnimation = useCallback(
    (direction, targetDate, targetX) => {
      if (
        destinationDate ||
        isInteractingWithEvent ||
        animationPurposeRef.current
      ) {
        return;
      }

      clearInteractionState();
      setIsScrolling?.(true);

      if (scrollTimeoutRef?.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }

      animationPurposeRef.current = "navigate";
      navigationTargetRef.current = {
        direction,
        targetDate: new Date(targetDate),
        targetX,
      };

      setDestinationDirection(direction);
      setDestinationDate(new Date(targetDate));
    },
    [
      destinationDate,
      isInteractingWithEvent,
      clearInteractionState,
      setIsScrolling,
      scrollTimeoutRef,
    ],
  );

  useLayoutEffect(() => {
    if (
      !destinationDate ||
      !destinationDirection ||
      animationPurposeRef.current !== "navigate"
    ) {
      return;
    }

    const target = navigationTargetRef.current;

    if (!target) return;

    controls.start({
      x: target.targetX,
      transition: PAGE_SPRING,
    });

    commitLogicalDate(target.targetDate, target.direction);
  }, [destinationDate, destinationDirection, controls, commitLogicalDate]);

  const animateBackToCenter = useCallback(() => {
    animationPurposeRef.current = "snapBack";

    controls.start({
      x: 0,
      transition: SNAP_BACK_SPRING,
    });
  }, [controls]);

  useLayoutEffect(() => {
    if (
      animationPurposeRef.current ||
      destinationDate ||
      committedDateRef.current
    ) {
      return;
    }

    controls.set({ x: 0 });
    setVisualDate(new Date(currentDate));
  }, [currentDate, destinationDate, controls]);

  useEffect(() => {
    const handleAnimateToToday = (event) => {
      if (
        !containerRef.current ||
        destinationDate ||
        isInteractingWithEvent ||
        animationPurposeRef.current
      ) {
        return;
      }

      const { direction, targetDate } = event.detail;
      const width = containerRef.current.offsetWidth;

      startTodayAnimation(
        direction,
        new Date(targetDate),
        direction === "next" ? -width : width,
      );
    };

    window.addEventListener("animateToToday", handleAnimateToToday);

    return () => {
      window.removeEventListener("animateToToday", handleAnimateToToday);
    };
  }, [destinationDate, isInteractingWithEvent, startTodayAnimation]);

  const handlePointerDownCapture = useCallback(
    (event) => {
      if (
        isInteractingWithEvent ||
        destinationDate ||
        animationPurposeRef.current
      ) {
        return;
      }

      touchStart.current = {
        x: event.clientX,
        y: event.clientY,
      };

      gestureStartTime.current = performance.now();
      isDirectionChecked.current = false;
    },
    [isInteractingWithEvent, destinationDate],
  );

  const handlePointerMoveCapture = useCallback(
    (event) => {
      if (
        isInteractingWithEvent ||
        destinationDate ||
        animationPurposeRef.current ||
        isDirectionChecked.current
      ) {
        return;
      }

      const deltaX = event.clientX - touchStart.current.x;
      const deltaY = event.clientY - touchStart.current.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absX <= DIRECTION_LOCK_DISTANCE && absY <= DIRECTION_LOCK_DISTANCE) {
        return;
      }

      isDirectionChecked.current = true;

      if (absX > absY * HORIZONTAL_DOMINANCE_RATIO) {
        clearInteractionState();
        setIsScrolling?.(true);

        if (scrollTimeoutRef?.current) {
          clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = null;
        }

        dragControls.start(event);
      }
    },
    [
      isInteractingWithEvent,
      destinationDate,
      clearInteractionState,
      setIsScrolling,
      scrollTimeoutRef,
      dragControls,
    ],
  );

  const handleDragEnd = useCallback(
    (_, { offset, velocity }) => {
      if (
        !containerRef.current ||
        destinationDate ||
        isInteractingWithEvent ||
        animationPurposeRef.current
      ) {
        return;
      }

      const width = containerRef.current.offsetWidth;
      const duration = performance.now() - gestureStartTime.current;
      const distance = Math.abs(offset.x);
      const quickDistance = width * QUICK_SWIPE_MIN_DISTANCE_RATIO;
      const slowDistance = width * SLOW_DRAG_THRESHOLD_RATIO;

      const isQuickSwipe =
        distance >= quickDistance &&
        (duration <= QUICK_SWIPE_MAX_DURATION ||
          Math.abs(velocity.x) >= FLICK_VELOCITY);

      if (isQuickSwipe) {
        if (offset.x < 0) {
          startPageAnimation("next", nextDate, -width, velocity.x);
        } else {
          startPageAnimation("prev", prevDate, width, velocity.x);
        }
        return;
      }

      if (offset.x <= -slowDistance) {
        startPageAnimation("next", nextDate, -width, velocity.x);
        return;
      }

      if (offset.x >= slowDistance) {
        startPageAnimation("prev", prevDate, width, velocity.x);
        return;
      }

      animateBackToCenter();
    },
    [
      destinationDate,
      isInteractingWithEvent,
      nextDate,
      prevDate,
      startPageAnimation,
      animateBackToCenter,
    ],
  );

  const finishNavigation = useCallback(() => {
    const targetDate = committedDateRef.current;

    if (!targetDate) return;

    setVisualDate(new Date(targetDate));
    setDestinationDate(null);
    setDestinationDirection(null);

    navigationTargetRef.current = null;
    animationPurposeRef.current = null;
    committedDateRef.current = null;
    isCommittingRef.current = false;
    isDirectionChecked.current = false;
    gestureStartTime.current = 0;
  }, []);

  useLayoutEffect(() => {
    if (
      animationPurposeRef.current !== null ||
      destinationDate !== null ||
      committedDateRef.current !== null
    ) {
      return;
    }

    controls.set({ x: 0 });

    if (scrollTimeoutRef?.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }

    setIsScrolling?.(false);
  }, [visualDate, destinationDate, controls, setIsScrolling, scrollTimeoutRef]);

  const handleAnimationComplete = useCallback(() => {
    if (animationPurposeRef.current === "snapBack") {
      animationPurposeRef.current = null;
      isDirectionChecked.current = false;
      gestureStartTime.current = 0;

      if (scrollTimeoutRef?.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }

      setIsScrolling?.(false);
      return;
    }

    if (animationPurposeRef.current === "navigate") {
      finishNavigation();
    }
  }, [finishNavigation, setIsScrolling, scrollTimeoutRef]);

  const renderContentForDate = (dateItem) => {
    if (displayedView === "day") {
      return (
        <CalendarContentDay
          currentDate={dateItem}
          renderEvents={renderEvents}
          topHeight={topHeight}
          setFullDayExpanded={setFullDayExpanded}
          fullDayExpanded={fullDayExpanded}
          editingEventId={editingEventId}
          handlePointerDown={handlePointerDown}
          handleResizeStart={handleResizeStart}
          handleNewEventClick={handleNewEventClick}
          infoPopupEventId={infoPopupEventId}
        />
      );
    }

    if (displayedView === "week") {
      return (
        <CalendarContentWeek
          currentDate={dateItem}
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
      );
    }

    if (displayedView === "month") {
      return (
        <CalendarContentMonth
          currentDate={dateItem}
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
      );
    }

    if (displayedView === "year") {
      return <CalendarContentYear currentDate={dateItem} />;
    }

    return <Loading />;
  };

  const leftDate =
    destinationDate && destinationDirection === "prev"
      ? destinationDate
      : prevDate;

  const rightDate =
    destinationDate && destinationDirection === "next"
      ? destinationDate
      : nextDate;

  const slides = [
    {
      key: `left-${leftDate.toDateString()}`,
      date: leftDate,
      position: "-100%",
    },
    {
      key: `center-${visualDate.toDateString()}`,
      date: visualDate,
      position: "0%",
    },
    {
      key: `right-${rightDate.toDateString()}`,
      date: rightDate,
      position: "100%",
    },
  ];

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
    >
      <motion.div
        drag={destinationDate || isInteractingWithEvent ? false : "x"}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={1}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        animate={controls}
        onAnimationComplete={handleAnimationComplete}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          touchAction: "pan-y",
          willChange: "transform",
        }}
      >
        <div
          id="slideContainer"
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
          }}
        >
          {slides.map((slide) => (
            <div
              key={slide.key}
              style={{
                position: "absolute",
                left: slide.position,
                width: "100%",
                height: "100%",
                contain: "layout paint",
              }}
            >
              {renderContentForDate(slide.date)}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
