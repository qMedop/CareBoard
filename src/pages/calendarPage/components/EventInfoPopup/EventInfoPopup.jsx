import React, { useMemo } from "react";
import styles from "./EventInfoPopup.module.css";
import { useTime } from "../../../../contexts/TimeContext";
import { useData } from "../../../../contexts/AuthContext";
import { usePopup } from "../../../../contexts/PopupContext";
import { DateTime } from "luxon";
import AddEditNewEvent from "../addEditNewEvent/AddEditNewEvent";
import ConfirmPopup from "../../../../components/confirmPopup/confirmPopup";
import {
  TrashIcon,
  CloseIcon,
  ClockIcon,
  CalendarIcon,
  PenIcon,
  TimekIcon,
  LockIcon,
  EyeIcon,
  PersonIcon,
} from "../../../../assets/icons/Icon";
import CustomButton from "../../../../components/button/Button";
import defaultAvatar from "../../../../assets/svg/user-avatar.svg";
export default function EventInfoPopup({
  eventId,
  onClose,
  onEdit,
  popupId = "info-popup",
  handleRecurrenceAndSave,
}) {
  const { loadedEvents, timeZoneOffset, setLoadedEvents } = useTime();
  const { deleteEvent, deleteSeries } = useData();
  const { openPopup, closePopup } = usePopup();

  const currentEvent = useMemo(() => {
    return loadedEvents.find((ev) => ev.id === eventId);
  }, [eventId, loadedEvents]);

  if (!currentEvent) {
    if (onClose) onClose();
    return null;
  }

  const is24Format = false;
  const userZone = `UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`;

  const startDT = currentEvent.timeRange?.start
    ? DateTime.fromISO(currentEvent.timeRange.start, { zone: "utc" }).setZone(
        userZone,
      )
    : null;
  const endDT = currentEvent.timeRange?.end
    ? DateTime.fromISO(currentEvent.timeRange.end, { zone: "utc" }).setZone(
        userZone,
      )
    : null;

  const dateDisplay = startDT?.isValid
    ? startDT.toFormat("cccc, MMMM d")
    : "Pick Date";
  const startTimeDisplay = startDT?.isValid
    ? is24Format
      ? startDT.toFormat("HH:mm")
      : startDT.toFormat("h:mm a")
    : "--:--";
  const endTimeDisplay = endDT?.isValid
    ? is24Format
      ? endDT.toFormat("HH:mm")
      : endDT.toFormat("h:mm a")
    : "--:--";

  const isFullDay = currentEvent.isFullDay || false;
  const isShared = currentEvent.isShared; // Derived securely from real-time events

  const handleEditClick = () => {
    if (onEdit) {
      onEdit(eventId);
    } else {
      closePopup(popupId);
      setTimeout(() => {
        openPopup(
          "movable",
          () => (
            <AddEditNewEvent
              eventId={eventId}
              ref={null}
              popupId="edit-popup"
            />
          ),
          document.querySelector(`[data-sourceid="${eventId}"]`) ||
            document.body,
          "right",
          24,
          () => {},
          "edit-popup",
        );
      }, 100);
    }
  };

  const handleDeleteConfirm = async () => {
    const isSeries =
      currentEvent.recurrence &&
      currentEvent.recurrence.type !== "NONE" &&
      currentEvent.group_id;
    closePopup(popupId);
    if (onClose) onClose();

    if (isSeries) {
      handleRecurrenceAndSave(currentEvent, currentEvent, null, true);
    } else {
      setLoadedEvents((prev) => prev.filter((ev) => ev.id !== eventId));
      await deleteEvent(eventId);
    }
  };

  const handleDeleteClick = () => {
    openPopup("centered", () => (
      <ConfirmPopup
        message="Are you sure you want to delete this event?"
        onYes={() => {
          closePopup();
          handleDeleteConfirm();
        }}
        onNo={() => closePopup()}
      />
    ));
  };

  const handleClose = () => {
    if (onClose) onClose();
    closePopup(popupId);
  };

  return (
    <div className={styles.infoPopup}>
      <div className={styles.header}>
        <div className={styles.actions}>
          {/* Hide editing options if this belongs to a friend */}
          {!isShared && (
            <>
              <CustomButton
                ClickEffect={"scale"}
                className={`default `}
                onClick={handleEditClick}
                title="Edit"
              >
                <PenIcon size={20} />
              </CustomButton>
              <CustomButton
                ClickEffect={"scale"}
                className={`default `}
                onClick={handleDeleteClick}
                title="Delete"
              >
                <TrashIcon size={20} />
              </CustomButton>
            </>
          )}
          <CustomButton
            ClickEffect={"scale"}
            className={`default `}
            onClick={handleClose}
            title="Close"
          >
            <CloseIcon size={20} />
          </CustomButton>
        </div>
      </div>
      <div className={styles.content}>
        <div className={styles.titleRow}>
          <div className={styles.colorContainer}>
            <div
              className={styles.colorIndicator}
              style={{ backgroundColor: currentEvent.color || "#FFD4A9" }}
            />
          </div>
          <div className={styles.titleContainer}>
            <h2 className={styles.title}>
              {currentEvent.title || "(No title)"}
            </h2>
            <p>{dateDisplay}</p>
          </div>
        </div>
        <div className={styles.details}>
          {!isFullDay && (
            <div>
              <TimekIcon size={26} />
              <p>
                {startTimeDisplay} - {endTimeDisplay}
              </p>
            </div>
          )}
          <div>
            <EyeIcon size={26} />
            <p>{currentEvent.visibility}</p>
          </div>
          <div>
            <PersonIcon size={26} />
            <p>{currentEvent.availability}</p>
          </div>
          {isShared && currentEvent.ownerPfp && (
            <div className={styles.sharedPfp}>
              <img
                src={currentEvent.ownerPfp || defaultAvatar}
                alt={`${currentEvent.ownerName}'s pfp`}
              />
              <p>Owned by {currentEvent.ownerName}</p>
            </div>
          )}
        </div>
        {currentEvent.description && (
          <div className={styles.descriptionRow}>
            <p>{currentEvent.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
