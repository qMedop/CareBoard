import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import { motion, useAnimation, useDragControls } from "framer-motion";
import { useTime } from "../../../../contexts/TimeContext";
import { useNavigate } from "react-router-dom";
import CalendarContentDay from "../CalendarContentDay/CalendarContentDay";
import CalendarContentWeek from "../CalendarContentWeek/CalendarContentWeek";
import CalendarContentMonth from "../CalendarContentMonth/CalendarContentMonth";
import CalendarContentYear from "../CalendarContentYear/CalendarContentYear";
import Loading from "../../../../components/loading/Loading";
import { usePopup } from "../../../../contexts/PopupContext";

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

  const [pendingTargetDate, setPendingTargetDate] = useState(null);
  const touchStart = useRef({ x: 0, y: 0 });
  const isDirectionChecked = useRef(false);

  // Re-center track instantly when a routing state change finishes safely
  useEffect(() => {
    controls.set({ x: 0 });
    setPendingTargetDate(null);
    isDirectionChecked.current = false;
  }, [currentDate, controls]);

  const isInteractingWithEvent = useMemo(() => {
    return draggableEvent?.active;
  }, [draggableEvent]);

  // =========================================================================
  // 🟢 CENTRALIZED GESTURE CLEANUP EFFECT
  // =========================================================================
  useEffect(() => {
    if (isScrolling) {
      if (typeof closePopup === "function") {
        closePopup(); // Master clean sweep for all modals
      }
      if (typeof setInfoPopupEventId === "function") {
        setInfoPopupEventId(null);
      }
      if (typeof setEditingEventId === "function") {
        setEditingEventId(null);
      }
      if (typeof setNewEvent === "function") {
        setNewEvent(null); // Destroy the ghost event placeholder
      }
    }
  }, [
    isScrolling,
    closePopup,
    setInfoPopupEventId,
    setEditingEventId,
    setNewEvent,
  ]);

  const generateDateOffset = useCallback(
    (offset) => {
      const d = new Date(currentDate);
      if (displayedView === "day") {
        d.setDate(d.getDate() + offset);
      } else if (displayedView === "week") {
        d.setDate(d.getDate() + offset * 7);
      } else if (displayedView === "month") {
        d.setMonth(d.getMonth() + offset);
      } else if (displayedView === "year") {
        d.setFullYear(d.getFullYear() + offset);
      }
      return d;
    },
    [currentDate, displayedView],
  );

  const prevDate = useMemo(() => generateDateOffset(-1), [generateDateOffset]);
  const nextDate = useMemo(() => generateDateOffset(1), [generateDateOffset]);

  useEffect(() => {
    const handleAnimateToToday = (e) => {
      if (!containerRef.current || pendingTargetDate || isInteractingWithEvent)
        return;

      const { direction: swipeDirection, targetDate } = e.detail;
      const width = containerRef.current.offsetWidth;

      setPendingTargetDate(targetDate);

      if (swipeDirection === "next") {
        controls.start({
          x: -width,
          transition: { type: "tween", duration: 0.22, ease: "easeInOut" },
        });
      } else {
        controls.start({
          x: width,
          transition: { type: "tween", duration: 0.22, ease: "easeInOut" },
        });
      }
    };

    window.addEventListener("animateToToday", handleAnimateToToday);
    return () => {
      window.removeEventListener("animateToToday", handleAnimateToToday);
    };
  }, [controls, pendingTargetDate, isInteractingWithEvent, setDirection]);

  const handlePointerDownCapture = (e) => {
    if (isInteractingWithEvent || pendingTargetDate) return;
    touchStart.current = { x: e.clientX, y: e.clientY };
    isDirectionChecked.current = false;
  };

  // 🟢 CLEANED: Merged all manual popup state calls out of move verification
  const handlePointerMoveCapture = (e) => {
    if (
      isInteractingWithEvent ||
      pendingTargetDate ||
      isDirectionChecked.current
    )
      return;

    const deltaX = e.clientX - touchStart.current.x;
    const eY = e.clientY - touchStart.current.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(eY);

    if (absX > 10 || absY > 10) {
      isDirectionChecked.current = true;

      if (absX > absY) {
        if (typeof setIsScrolling === "function") {
          setIsScrolling(true);
        }
        if (scrollTimeoutRef && scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        dragControls.start(e);
      }
    }
  };

  // 🟢 CLEANED: Simplified cooldown release assignments
  const handleDragEnd = (e, { offset, velocity }) => {
    if (!containerRef.current || pendingTargetDate || isInteractingWithEvent)
      return;
    const width = containerRef.current.offsetWidth;
    const swipeThreshold = width / 4;

    if (typeof setIsScrolling === "function" && scrollTimeoutRef) {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 200);
    }

    if (offset.x < -swipeThreshold || velocity.x < -400) {
      setDirection("next");
      setPendingTargetDate(nextDate);

      controls.start({
        x: -width,
        transition: { type: "tween", duration: 0.14, ease: "easeOut" },
      });
    } else if (offset.x > swipeThreshold || velocity.x > 400) {
      setDirection("prev");
      setPendingTargetDate(prevDate);

      controls.start({
        x: width,
        transition: { type: "tween", duration: 0.14, ease: "easeOut" },
      });
    } else {
      controls.start({
        x: 0,
        transition: { type: "spring", stiffness: 300, damping: 30 },
      });
    }
  };

  const handleAnimationComplete = () => {
    if (!pendingTargetDate) return;

    setTodayDeferred(pendingTargetDate, 0);
    navigate(
      `/calendar/${displayedView}/${pendingTargetDate.getDate()}/${
        pendingTargetDate.getMonth() + 1
      }/${pendingTargetDate.getFullYear()}`,
      { replace: true },
    );
  };

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
    } else if (displayedView === "week") {
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
    } else if (displayedView === "month") {
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
    } else if (displayedView === "year") {
      return <CalendarContentYear currentDate={dateItem} />;
    }
    return <Loading />;
  };

  const slides = [
    {
      key: `prev-${prevDate.toDateString()}`,
      date: prevDate,
      position: "-100%",
    },
    {
      key: `center-${currentDate.toDateString()}`,
      date: currentDate,
      position: "0%",
    },
    {
      key: `next-${nextDate.toDateString()}`,
      date: nextDate,
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
        drag={pendingTargetDate || isInteractingWithEvent ? false : "x"}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={1}
        onDragEnd={handleDragEnd}
        animate={controls}
        onAnimationComplete={handleAnimationComplete}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          touchAction: "pan-y",
        }}
      >
        <div
          id="slideContainer"
          style={{ position: "relative", width: "100%", height: "100%" }}
        >
          {slides.map((slide) => (
            <div
              key={slide.key}
              style={{
                position: "absolute",
                left: slide.position,
                width: "100%",
                height: "100%",
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
