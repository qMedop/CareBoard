import { useRef } from "react";
import styles from "../../CalendarPage.module.css";
import { useTime } from "../../../../contexts/TimeContext";
import { DateTime } from "luxon";
import { LockIcon, RepeatIcon } from "../../../../assets/icons/Icon";

function EventBlock({
  event,
  handlePointerDown,
  onResizeStart,
  innerRef,
  editingEventId,
  infoPopupEventId,
}) {
  const blockRef = useRef();
  const { timeZoneOffset } = useTime();

  const realId = event.sourceEventId || event.id;
  const isShared = event.isShared;
  const isUnsaved = realId.toString().startsWith("unsaved");
  const isEditing = String(editingEventId) === String(realId);
  const isInfoOpen = String(infoPopupEventId) === String(realId);

  const isGhost = event.id?.toString().startsWith("drag-");
  const isDraggedOriginal = event.active === true;
  const isActive = isUnsaved || isEditing || isInfoOpen;

  const hasShadow = isActive && !isGhost && !isDraggedOriginal;
  const zIndex = isGhost ? 50 : isUnsaved ? 30 : isActive ? 20 : 10;
  const opacity = isGhost ? 0.7 : isDraggedOriginal ? 0.3 : 1;

  const editingStyle =
    isActive || isGhost
      ? {
          pointerEvents: isGhost ? "none" : "auto",
          opacity: opacity,
          zIndex: zIndex,
          boxShadow: hasShadow ? "0px 0px 8px 1px #000000b5" : "none",
          transition: isGhost ? "none" : "all 0.1s ease",
        }
      : { transition: "all 0.1s ease" };

  return (
    <div
      ref={innerRef || blockRef}
      style={{
        position: "absolute",
        top: `${event?.position?.y}px`,
        left: `${event?.position?.x}%`,
        width: `${event?.size?.width}%`,
        height: `${event?.size?.height}px`,
        zIndex: zIndex,
        backgroundColor: `${event?.color}`,
        ...editingStyle,
      }}
      className={`${styles.eventBlock} ${event.active ? styles.dragging : ""} `}
      data-sourceid={realId}
      id={event.id}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
    >
      <div
        className={styles.title}
        onPointerDown={(e) => {
          e.stopPropagation();
          // 🔴 We call onDragStart so the pointerup listener is attached.
          // The handler itself will block the drag timer for shared events.
          handlePointerDown(e, event, blockRef.current);
        }}
        style={{ cursor: isShared ? "pointer" : undefined }}
      >
        <p className={styles.eventText}>
          {event?.title?.length === 0 ? "(No title)" : event?.title}
        </p>
        <span className={styles.timeRange}>
          {event?.originalTimeRange &&
            (() => {
              const { start, end } = event.originalTimeRange;
              if (!start || !end) return null;
              const formatTime = (isoString) =>
                DateTime.fromISO(isoString, { zone: "utc" })
                  .plus({ hours: timeZoneOffset })
                  .toFormat("hh:mm a");
              return `${formatTime(start)} - ${formatTime(end)}`;
            })()}
        </span>
      </div>

      {/* 🔴 HIDE RESIZE HANDLER ENTIRELY IF SHARED */}
      {!isShared && (
        <span
          onMouseDown={(e) => {
            e.stopPropagation();
            onResizeStart(e, event, blockRef.current);
          }}
          className={styles.resize}
        />
      )}

      <div className={styles.emojiBg}>
        {event?.emoji && (
          <p
            style={{
              fontSize: `${Math.max(22, Math.min(48, Math.min(event?.size?.height * 0.3, event?.size?.width * 0.5)))}px`,
            }}
          >
            {event.emoji}
          </p>
        )}
      </div>
      <div className={styles.icons}>
        {event?.visibility && event?.visibility === "private" && (
          <div className={styles.privateIcon}>
            <LockIcon />
          </div>
        )}
        {event?.recurrence && event?.recurrence?.type !== "NONE" && (
          <div className={styles.recurrenceIcon}>
            <RepeatIcon />
          </div>
        )}
        {isShared && event.ownerPfp && (
          <div className={`${styles.sharedPfp}`}>
            <img
              src={event.ownerPfp || "src/assets/svg/user-avatar.svg"}
              alt="shared"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default EventBlock;
