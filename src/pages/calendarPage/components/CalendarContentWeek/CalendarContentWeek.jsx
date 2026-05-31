import { useParams } from "react-router-dom";
import CustomButton from "../../../../components/button/Button";
import { getLocalDateString } from "../../../../utils/getLocalDateString";
import styles from "../../CalendarPage.module.css";
import { useTime } from "../../../../contexts/TimeContext";
import { useRef } from "react";
import { usePopup } from "../../../../contexts/PopupContext";
import { useState } from "react";
import { useEffect } from "react";
import EventBlock from "../EventBlock/EventBlock";
import { ArrowDownThinIcon } from "../../../../assets/icons/Icon";

function CalendarContentWeek({
  currentDate,
  region = "EU",
  renderEvents,
  topHeight,
  setFullDayExpanded,
  fullDayExpanded,
  editingEventId,
  infoPopupEventId,
  handlePointerDown,
  handleGridPointerDown,
  handleResizeStart,
  handleNewEventClick,
  is24HourFormat = false,
}) {
  const {
    daysOfWeek,
    draggableEvent,
    timeZoneOffset,
    setDayTasksDiv,
    isMobile,
    MonthsOfTheYear,
    today,
  } = useTime();
  const { view } = useParams();
  const localDayTasksRef = useRef(null);
  const { closePopup } = usePopup();

  const [hoveredEventId, setHoveredEventId] = useState(null);
  const bottomRef = useRef(null);
  const [firstVisibleHour, setFirstVisibleHour] = useState(0);
  const [currentLineTop, setCurrentLineTop] = useState(0);

  const handleScroll = (e) => {
    if (!isMobile) return;
    const timeDiv = e.target.querySelector(`.${styles.time}`);
    if (timeDiv && timeDiv.children.length > 0) {
      const hourHeight = timeDiv.children[0].offsetHeight;
      const visibleIndex = Math.max(
        0,
        Math.floor(e.target.scrollTop / hourHeight),
      );
      setFirstVisibleHour(visibleIndex);
    }
  };

  const startOfWeek = new Date(currentDate);
  const dayOfWeek = startOfWeek.getDay();
  const offset =
    region === "EU" ? (dayOfWeek === 0 ? -6 : 1 - dayOfWeek) : -dayOfWeek;
  startOfWeek.setDate(startOfWeek.getDate() + offset);

  useEffect(() => {
    setDayTasksDiv(localDayTasksRef);
  }, [setDayTasksDiv]);

  useEffect(() => {
    const updateLine = () => {
      const cellHeight = isMobile ? 64 : 52;

      const newLineTop =
        ((new Date().getHours() * 60 + new Date().getMinutes()) / 60) *
        cellHeight;

      setCurrentLineTop(newLineTop);
    };

    updateLine(); // run immediately

    const interval = setInterval(updateLine, 60000); // every 60s

    return () => clearInterval(interval);
  }, [isMobile]);

  return (
    <>
      <div className={styles.days}>
        <div className={styles.topLeft}>
          <div className={styles.globalTime}>
            <p>
              {!isMobile && <span>GMT</span>}
              {timeZoneOffset >= 0 ? `+${timeZoneOffset}` : timeZoneOffset}
            </p>
          </div>
          {!isMobile &&
          (fullDayExpanded || renderEvents.some((e) => e.isMoreButton)) ? (
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
          {isMobile && (
            <div className={styles.mobileTop}>
              <p className={styles.month}>
                {MonthsOfTheYear[currentDate.getMonth()].toUpperCase()}
              </p>
            </div>
          )}
          <div className={styles.top}>
            {Array.from({ length: 7 }, (_, index) => {
              const date = new Date(startOfWeek);
              date.setDate(startOfWeek.getDate() + index);
              const isToday = date.toDateString() === new Date().toDateString();
              const dateStr = getLocalDateString(date);
              return (
                <div
                  key={dateStr}
                  className={`${styles.day} ${isToday ? styles.today : ""}`}
                  id={`top-${dateStr}`}
                  data-date={dateStr}
                  onClick={(e) => {
                    if (closePopup("edit-popup") === false) return;
                    handleNewEventClick(e);
                  }}
                  style={!isMobile ? { cursor: "pointer" } : {}}
                >
                  <div className={styles.dayBlock}>
                    <div className={styles.dayName}>
                      <p>
                        {isMobile
                          ? daysOfWeek[index].slice(0, 1)
                          : daysOfWeek[index]}
                      </p>
                    </div>
                    <CustomButton
                      key={`button-${dateStr}`}
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
              );
            })}
          </div>
          <div
            className={styles.topBottom}
            style={{
              height: `${topHeight}px`,
            }}
          >
            {Array.from({ length: 7 }, (_, index) => {
              const date = new Date(startOfWeek);
              date.setDate(date.getDate() + index);
              const columnDateStr = getLocalDateString(date);
              return (
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
              );
            })}
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
                        bottom: `${8}px`,
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

                const realId = event.sourceEventId || event.id;
                const isUnsaved = realId.toString().startsWith("unsaved");
                const isHovered = hoveredEventId === realId;

                const isEditing = String(editingEventId) === realId.toString();
                const isInfoOpen =
                  String(infoPopupEventId) === realId.toString();
                const isGhost = event.id?.toString().startsWith("drag-");

                const isDraggedOriginal =
                  draggableEvent?.active &&
                  (draggableEvent.sourceEventId || draggableEvent.id) ===
                    realId &&
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
                      className={`${styles.eventBlock}`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        handlePointerDown(e, event, e.currentTarget);
                      }}
                    >
                      <p className={styles.title}>
                        {event?.title?.length === 0
                          ? "(No title)"
                          : event?.title}
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
        id="bottom"
        className={styles.bottom}
        style={{ "--topBottomHeight": `${topHeight}px` }}
        ref={bottomRef}
        onScroll={handleScroll}
      >
        <div className={styles.time}>
          {Array.from({ length: 24 }, (_, index) => (
            <div key={`time-${index}`} className={styles.timeBlock}>
              <p>
                {is24HourFormat
                  ? `${index}`
                  : `${index < 12 ? index + 1 : index - 11}`}
              </p>
              {!is24HourFormat && (
                <span
                  style={{
                    opacity:
                      !isMobile || index === firstVisibleHour ? "1" : "0",
                  }}
                >
                  {index < 12 ? `AM` : `PM`}
                </span>
              )}
            </div>
          ))}
          {isMobile && <div style={{ height: "64px" }}></div>}
        </div>

        <div className={styles.dayTasks}>
          <div className={styles.linesContainer}>
            {Array.from({ length: 24 }, (_, index) => {
              return <div key={index} className={styles.columnsLine}></div>;
            })}
          </div>
          <div
            className={styles.colums}
            ref={localDayTasksRef}
            id="dayTasksDiv"
          >
            {Array.from({ length: 7 }, (_, index) => {
              const date = new Date(startOfWeek);
              date.setDate(startOfWeek.getDate() + index);
              const columnDateStr = getLocalDateString(date);
              const isTodayColumn =
                date.toDateString() === new Date().toDateString();
              return (
                <div
                  className={styles.columnContainer}
                  key={`column-${columnDateStr}`}
                  onPointerDown={handlePointerDown}
                >
                  <div
                    className={`${styles.column} ${
                      index === 0 ? styles.firstColumn : ""
                    }`}
                    id={columnDateStr}
                    data-column-date={columnDateStr}
                    onPointerDown={handleGridPointerDown}
                    style={{
                      cursor: isMobile ? "none" : "pointer",
                      position: "relative",
                    }}
                  >
                    {isTodayColumn && (
                      <div
                        className={styles.currentHour}
                        style={{
                          top: `${currentLineTop}px`,
                        }}
                      />
                    )}
                  </div>
                  {renderEvents
                    .filter(
                      (event) =>
                        event?.columnDate === columnDateStr &&
                        event.isFullDay !== true,
                    )
                    .map((event) => (
                      <EventBlock
                        key={event.id}
                        event={event}
                        handlePointerDown={handlePointerDown}
                        onResizeStart={handleResizeStart}
                        editingEventId={editingEventId}
                        infoPopupEventId={infoPopupEventId}
                      />
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
export default CalendarContentWeek;
