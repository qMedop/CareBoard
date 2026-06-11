import { useRef } from "react";
import styles from "../../CalendarPage.module.css";
import { useTime } from "../../../../contexts/TimeContext";
import { DateTime } from "luxon";
import { LockIcon, PlusIcon, RepeatIcon } from "../../../../assets/icons/Icon";

function EventBlock({
  event,
  handlePointerDown,
  onResizeStart,
  innerRef,
  editingEventId,
  infoPopupEventId,
}) {
  const blockRef = useRef();
  const { timeZoneOffset, isMobile, newEvent } = useTime();
  const realId = event.sourceEventId || event.id;
  const isShared = event.isShared;
  const isUnsaved = realId.toString().startsWith("unsaved");
  const isEditing = String(editingEventId) === String(realId);
  const isInfoOpen = String(infoPopupEventId) === String(realId);

  const isGhost = event.id?.toString().startsWith("drag-");
  const isDraggedOriginal = event.active === true;
  const isActive = isUnsaved || isEditing || isInfoOpen;

  const isMobileUnsaved = isMobile && isUnsaved;
  const isMobileGhost = isMobile && isGhost;
  const isMobileActive = isMobile && isActive;

  const normalizedId = String(realId).replace(/^drag-/, "");

  const isGhostFromUnsaved =
    !!newEvent?.id && normalizedId === String(newEvent.id);
  console.log(realId.toString());
  const mobileGhostBg = (opacity) => `rgb(0 233 225 / ${opacity})`;
  const hasShadow = isActive && !isGhost && !isDraggedOriginal;
  const zIndex = isGhost ? 50 : isUnsaved ? 30 : isActive ? 20 : 10;
  const opacity = isGhost ? 0.7 : isDraggedOriginal ? 0.3 : 1;
  const finalOpacity =
    isMobileUnsaved && event.editing ? 0 : isGhostFromUnsaved ? 1 : opacity;
  const editingStyle =
    isActive || isGhost
      ? {
          pointerEvents: isGhost ? "none" : "auto",
          opacity: finalOpacity,
          zIndex: zIndex,
          boxShadow:
            hasShadow || isGhostFromUnsaved
              ? "0px 0px 8px 1px #000000b5"
              : "none",
        }
      : {};

  return (
    <div
      ref={innerRef || blockRef}
      style={{
        "--MobileGhostcolor": mobileGhostBg(1),

        position: "absolute",
        top: `${event?.position?.y}px`,
        left: `${event?.position?.x}%`,
        width: `${event?.size?.width || 90}%`,
        height: `${event?.size?.height}px`,
        zIndex: zIndex,
        backgroundColor: `${isMobileUnsaved || isGhostFromUnsaved ? `${event?.editing ? "#ffffff00" : mobileGhostBg(0.2)}` : `${event?.color}99`}`,
        cursor: isShared ? "pointer" : "grab",
        border:
          isGhostFromUnsaved || isMobileUnsaved
            ? `1px solid ${mobileGhostBg(1)}`
            : "none",
        overflow: isGhostFromUnsaved || isMobileUnsaved ? "initial" : "hidden",
        ...editingStyle,
      }}
      className={`${styles.eventBlock} ${event.active ? styles.dragging : ""} ${isMobileUnsaved && styles.mobileUnsaved}`}
      data-sourceid={realId}
      id={event.id}
      onPointerDown={(e) => {
        e.stopPropagation();
        handlePointerDown(e, event, blockRef.current);
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
      }}
    >
      {isMobileUnsaved || isGhostFromUnsaved ? (
        <div
          style={{
            opacity: event?.editing ? 0 : 1,
          }}
          className={styles.mobileGhost}
        >
          <PlusIcon size={12} />
          {isMobileGhost && (
            <div className={styles.mobileMovingTimeRange}>
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
            </div>
          )}
        </div>
      ) : (
        <>
          <div className={styles.title}>
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
        </>
      )}
    </div>
  );
}

export default EventBlock;
