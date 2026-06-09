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
  const { timeZoneOffset } = useTime();
  const { isMobile } = useTime();
  const realId = event.sourceEventId || event.id;
  const isShared = event.isShared;
  const isUnsaved = realId.toString().startsWith("unsaved");
  const isEditing = String(editingEventId) === String(realId);
  const isInfoOpen = String(infoPopupEventId) === String(realId);

  if (isUnsaved) console.log(event);

  const isGhost = event.id?.toString().startsWith("drag-");
  const isDraggedOriginal = event.active === true;
  const isActive = isUnsaved || isEditing || isInfoOpen;

  const isMobileUnsaved = isMobile && isUnsaved;
  const isMobileGhost = isMobile && isGhost;
  const isMobileActive = isMobile && isActive;

  const mobileGhostBg = (opacity) => `rgb(0 233 225 / ${opacity})`;
  const hasShadow = isActive && !isGhost && !isDraggedOriginal;
  const zIndex = isGhost ? 50 : isUnsaved ? 30 : isActive ? 20 : 10;
  const opacity = isGhost ? 0.7 : isDraggedOriginal ? 0.3 : 1;
  const finalOpacity =
    isMobileUnsaved && event.editing ? 0 : isMobileGhost ? 1 : opacity;
  const editingStyle =
    isActive || isGhost
      ? {
          pointerEvents: isGhost ? "none" : "auto",
          opacity: finalOpacity,
          zIndex: zIndex,
          boxShadow:
            hasShadow || isMobileGhost ? "0px 0px 8px 1px #000000b5" : "none",
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
        width: `${isMobileGhost || isMobileUnsaved ? 100 : event?.size?.width}%`,
        height: `${event?.size?.height}px`,
        zIndex: zIndex,
        backgroundColor: `${isMobileUnsaved || isMobileGhost ? `${event?.editing ? "#ffffff00" : mobileGhostBg(0.2)}` : event?.color}`,
        cursor: isShared ? "pointer" : "grab", // 🟢 Cursor indicators across the whole body block
        border:
          isMobileGhost || isMobileUnsaved
            ? `1px solid ${mobileGhostBg(1)}`
            : "none",
        overflow: isMobileGhost || isMobileUnsaved ? "initial" : "hidden",
        ...editingStyle,
      }}
      className={`${styles.eventBlock} ${event.active ? styles.dragging : ""} `}
      data-sourceid={realId}
      id={event.id}
      // 🟢 Attached directly to the container so you can tap anywhere on the event block
      onPointerDown={(e) => {
        e.stopPropagation();
        // 🟢 Fix: Always pass blockRef.current directly so mobile layout tracking math remains identical to version 1
        handlePointerDown(e, event, blockRef.current);
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
      }}
    >
      {isMobileUnsaved || isMobileGhost ? (
        <div
          style={{
            opacity: event?.editing ? 0 : 1,
          }}
          className={styles.mobileGhost}
        >
          <PlusIcon size={18} />
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
