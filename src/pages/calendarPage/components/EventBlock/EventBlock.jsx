import React, { useRef } from "react";
import styles from "../../CalendarPage.module.css";
import { useTime } from "../../../../contexts/TimeContext";
import { DateTime } from "luxon";
import { LockIcon, PlusIcon, RepeatIcon } from "../../../../assets/icons/Icon";
import defaultAvatar from "../../../../assets/svg/user-avatar.svg";
import { useUserSettings } from "../../../../contexts/UserSettingsContext";
import { getContrastColor } from "../../../../utils/getContrastColor";

function EventBlock({
  event,
  handlePointerDown,
  onResizeStart,
  innerRef,
  editingEventId,
  infoPopupEventId,
}) {
  const blockRef = useRef();
  const { timeZoneOffset, isMobile, dragSourceId } = useTime();
  const { userSettings } = useUserSettings();

  const realId = String(event.id);

  if (!event.position || !event.size || !realId) return null;

  const timeFormat = userSettings?.timeFormat || "24h";

  const isShared = event.isShared;
  const isEditing = String(editingEventId) === realId;
  const isInfoOpen = String(infoPopupEventId) === realId;

  const isUnsaved = event.isUnsaved;
  const isGhost = event.isGhost;
  const isGhostUnsaved = isGhost && isUnsaved;
  const isActive = isUnsaved || isEditing || isInfoOpen;

  const isMobileUnsaved = isMobile && isUnsaved;
  const isMobileGhost = isMobile && isGhost;

  const isDraged = event.id === dragSourceId;

  const mobileGhostBg = (opacity) => `rgb(35 175 245 / ${opacity})`;

  const hasShadow = isActive || isGhost || isEditing || isInfoOpen;
  const zIndex = isGhost ? 50 : isUnsaved ? 30 : isActive ? 20 : 10;
  const opacity = isMobileUnsaved ? 1 : isDraged ? 0.7 : 1;
  const finalOpacity = isMobileUnsaved && isDraged && !isGhost ? 0 : opacity;
  const editingStyle =
    isActive || isGhost
      ? {
          pointerEvents: isGhost ? "none" : "auto",
          opacity: finalOpacity,
          zIndex: zIndex,
          boxShadow:
            hasShadow || isGhostUnsaved ? "0px 0px 8px 1px #000000b5" : "none",
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
        backgroundColor: `${isMobileUnsaved ? `${event?.editing ? "#ffffff00" : mobileGhostBg(0.2)}` : `${event?.color}`}`,
        cursor: isShared ? "pointer" : "grab",
        border: isMobileUnsaved ? `2px solid ${mobileGhostBg(1)}` : "none",
        overflow: isMobileUnsaved ? "initial" : "hidden",
        opacity: finalOpacity,
        ...editingStyle,
      }}
      className={`${styles.eventBlock} ${event?.active ? styles.dragging : ""} ${isMobileUnsaved && styles.mobileUnsaved}`}
      data-eventid={realId}
      id={event.id}
      onPointerDown={(e) => {
        e.stopPropagation();
        handlePointerDown(e, event, blockRef.current);
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
      }}
    >
      {isMobileUnsaved ? (
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
                      .toFormat(
                        `${timeFormat === "24h" ? "HH:mm" : "hh:mm a"}`,
                      );

                  return `${formatTime(start)} - ${formatTime(end)}`;
                })()}
            </div>
          )}
        </div>
      ) : (
        <>
          <div
            style={{ color: getContrastColor(event?.color) }}
            className={styles.title}
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
                      .toFormat(
                        `${timeFormat === "24h" ? "HH:mm" : "hh:mm a"}`,
                      );
                  return `${formatTime(start)} - ${formatTime(end)}`;
                })()}
            </span>
          </div>

          {!isShared && (
            <span
              onPointerDown={(e) => {
                if (e.pointerType === "touch") return;
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
                <img src={event.ownerPfp || defaultAvatar} alt="shared" />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default React.memo(EventBlock);
