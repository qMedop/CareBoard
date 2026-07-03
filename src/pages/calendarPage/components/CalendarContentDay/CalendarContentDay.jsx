import { useRef } from "react";
import { ArrowDownThinIcon } from "../../../../assets/icons/Icon";
import CustomButton from "../../../../components/button/Button";
import { useTime } from "../../../../contexts/TimeContext";
import styles from "../../CalendarPage.module.css";
import EventBlock from "../EventBlock/EventBlock";
import { usePopup } from "../../../../contexts/PopupContext";
import { useState } from "react";
import { useEffect } from "react";
import { getLocalDateString } from "../../../../utils/getLocalDateString";
import { DAYS_OF_WEEK } from "../../../../constants/constants";

function CalendarContentDay({
  currentDate,
  renderEvents,
  topHeight,
  setFullDayExpanded,
  fullDayExpanded,
  editingEventId,
  infoPopupEventId,
  handlePointerDown,
  handleResizeStart,
  handleNewEventClick,
  handleGridPointerDown,
}) {
  const { daysOfWeek, timeZoneOffset, setDayTasksDiv, draggableEvent } =
    useTime();
  const localDayTasksRef = useRef(null);
  const { closePopup } = usePopup();

  const [hoveredEventId, setHoveredEventId] = useState(null);

  useEffect(() => {
    setDayTasksDiv(localDayTasksRef);
  }, [setDayTasksDiv]);

  const date = new Date(currentDate);
  const isToday = date.toDateString() === new Date().toDateString();
  const columnDateStr = getLocalDateString(date);
  const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;

  return (
    <>
      <div className={styles.days}>
        <div className={styles.topLeft}>
          <div className={styles.globalTime}>
            <p>
              GMT {timeZoneOffset >= 0 ? `+${timeZoneOffset}` : timeZoneOffset}
            </p>
          </div>
          {fullDayExpanded || renderEvents.some((e) => e.isMoreButton) ? (
            <div
              className={`${styles.showMore} ${
                fullDayExpanded ? styles.expanded : ""
              }`}
            >
              <CustomButton
                onClick={() => setFullDayExpanded(!fullDayExpanded)}
              >
                <ArrowDownThinIcon size={24} />
              </CustomButton>
            </div>
          ) : null}
          <div className={styles.border}></div>
        </div>

        <div className={styles.left}>
          <div className={styles.top}>
            <div
              className={`${styles.day} ${isToday ? styles.today : ""}`}
              id={`top-${columnDateStr}`}
              data-date={columnDateStr}
              onClick={(e) => {
                if (closePopup("edit-popup") === false) return;
                handleNewEventClick(e);
              }}
              style={{ cursor: "pointer" }}
            >
              <div className={styles.dayBlock}>
                <p>{DAYS_OF_WEEK[dayIndex]}</p>
                <CustomButton
                  key={`button-${columnDateStr}`}
                  link
                  href={`/calendar/day/${date.getDate()}/${
                    date.getMonth() + 1
                  }/${date.getFullYear()}`}
                  className="default"
                  ClickEffect="scale"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className={styles.dayText}>
                    <p>{date.getDate()}</p>
                  </div>
                </CustomButton>
              </div>
            </div>
          </div>
          <div
            className={styles.topBottom}
            style={{ height: `${topHeight}px` }}
          >
            <CustomButton
              key={`top-${columnDateStr}`}
              id={`top-${columnDateStr}`}
              data-date={columnDateStr}
              className={`default ${styles.cell}`}
              onClick={(e) => {
                if (closePopup("edit-popup") === false) return;
                handleNewEventClick(e);
              }}
              ClickEffect={false}
            />
            {renderEvents
              .filter((event) => event.isFullDay)
              .map((event) => {
                if (event.isMoreButton) {
                  return (
                    <CustomButton
                      onClick={() => setFullDayExpanded(true)}
                      key={event.id}
                      className={`default ${styles.viewMoreBtn}`}
                      style={{
                        position: "absolute",
                        bottom: "8px",
                        left: event.position.left,
                        width: event.size.width,
                        height: event.size.height,
                      }}
                    >
                      <p>
                        {event.title.length === 0 ? "(No title)" : event.title}
                      </p>
                    </CustomButton>
                  );
                }

                const realId = event.id;
                const isUnsaved = Boolean(event.isUnsaved);
                const isHovered = hoveredEventId === realId;

                const isEditing = String(editingEventId) === realId.toString();
                const isInfoOpen =
                  String(infoPopupEventId) === realId.toString();
                const isGhost = Boolean(event.isGhost);

                const isDraggedOriginal =
                  draggableEvent?.active &&
                  draggableEvent.id === realId &&
                  !isGhost;

                const isActive = isUnsaved || isEditing || isInfoOpen;
                const hasShadow = isActive && !isGhost && !isDraggedOriginal;

                return (
                  <div
                    key={`event-container-${event.id}`}
                    className={`${styles.eventBlockContainer} ${event.classes?.map((c) => styles[c]).join(" ")}`}
                    data-sourceid={realId}
                    onMouseEnter={() => setHoveredEventId(realId)}
                    onMouseLeave={() => setHoveredEventId(null)}
                    style={{
                      "--bg-color": `${event?.color}`,
                      position: "absolute",
                      top: `${event.position.top}px`,
                      left: event.position.left,
                      width: event.size.width,
                      height: event.size.height,
                      zIndex: isGhost
                        ? 50
                        : isUnsaved
                          ? 30
                          : isActive
                            ? 20
                            : 10,
                      opacity: isGhost ? 0.7 : isDraggedOriginal ? 0.3 : 1,
                      pointerEvents: isGhost ? "none" : "auto",
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
                    <div
                      key={event.id}
                      id={event.id}
                      data-sourceid={realId}
                      style={{ backgroundColor: event.color }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        handlePointerDown(e, event, e.currentTarget);
                      }}
                    >
                      <p className={styles.title}>
                        {event.title.length === 0 ? "(No title)" : event.title}
                      </p>
                    </div>
                    <div
                      style={{ borderRightColor: event?.color }}
                      className={styles.backWard}
                    ></div>
                    <div
                      style={{ borderLeftColor: event?.color }}
                      className={styles.forWard}
                    ></div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <div
        className={styles.bottom}
        style={{ "--topBottomHeight": `${topHeight}px` }}
      >
        <div className={styles.time}>
          {Array.from({ length: 24 }, (_, index) => (
            <div key={index} className={styles.timeBlock}>
              <p>
                {index === 0
                  ? "12 AM"
                  : index < 12
                    ? `${index} AM`
                    : index === 12
                      ? "12 PM"
                      : `${index - 12} PM`}
              </p>
            </div>
          ))}
        </div>
        <div className={styles.dayTasks}>
          <div
            className={styles.colums}
            ref={localDayTasksRef}
            id="dayTasksDiv"
          >
            <div className={styles.columnContainer}>
              <div
                className={`${styles.column} ${styles.firstColumn}`}
                id={columnDateStr}
                data-column-date={columnDateStr}
                onPointerDown={handleGridPointerDown}
                style={{ cursor: "pointer", position: "relative" }}
              >
                {/* 🟢 STRUCTURAL CELL LOOPS REMOVED COMPONENT-WIDE */}
              </div>

              {renderEvents
                .filter(
                  (event) =>
                    event?.columnDate === columnDateStr && !event.isFullDay,
                )
                .map((event) => (
                  <EventBlock
                    key={event.id}
                    event={event}
                    onPointerDown={handlePointerDown}
                    onResizeStart={handleResizeStart}
                    editingEventId={editingEventId}
                    infoPopupEventId={infoPopupEventId}
                  />
                ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default CalendarContentDay;
