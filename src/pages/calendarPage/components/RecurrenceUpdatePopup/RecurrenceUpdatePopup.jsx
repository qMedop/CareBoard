import { useState } from "react";
import { DateTime } from "luxon";
import CustomButton from "../../../../components/button/Button";
import {
  ListChooser,
  ListItem,
} from "../../../../components/ListChooser/ListChooser";
import styles from "./RecurrenceUpdatePopup.module.css";
import { useData } from "../../../../contexts/AuthContext";
import { useTime } from "../../../../contexts/TimeContext";
import { useNotification } from "../../../../contexts/NotificationContext";
import { getUserZone } from "../../../../utils/getUserZone";

export default function RecurrenceUpdatePopup({
  onClose,
  allowedModes = ["THIS_EVENT", "THIS_AND_FOLLOWING", "ALL_EVENTS"],
  context,
  onConfirm,
}) {
  const [selected, setSelected] = useState(allowedModes[0]);

  const { updateEvent, addEvent, deleteEvent, deleteSeries } = useData();
  const { loadedEvents, setLoadedEvents, timeZoneOffset } = useTime();
  const { notify } = useNotification();

  const {
    parentEvent,
    currentEvent,
    finalData,
    deltaMs = 0,
    durationDeltaMs = 0,
    isDelete = false,
  } = context;

  const createConsoleLogProgress = (operationId) => (status) => {
    const notificationId = `recurrence-update-progress-${operationId}`;
    if (status === "Saving")
      notify({
        id: notificationId,
        message: "Saving changes...",
        type: "loading",
      });
    if (status === "encrypting")
      notify({
        id: notificationId,
        message: "Encrypting Event...",
        type: "loading",
      });
    if (status === "uploading")
      notify({
        id: notificationId,
        message: "Uploading Event...",
        type: "loading",
      });
    if (status === "success")
      notify({
        id: notificationId,
        message: "Event Saved Successfully!",
        type: "success",
      });
    if (status === "error")
      notify({
        id: notificationId,
        message: "Failed to Save Event",
        type: "error",
      });
  };

  async function executeSave(mode) {
    const preEditSnapshot = [...loadedEvents];
    const consoleLogProgress = createConsoleLogProgress(currentEvent.id);

    const parentId = parentEvent.id;
    const groupId = parentEvent.group_id || parentId;
    const currentExdates = parentEvent.exdate || [];

    const userZone = getUserZone(timeZoneOffset);
    const originalIsoStart =
      currentEvent.originalTimeRange?.start || currentEvent.timeRange.start;
    const originalInstanceStartUTC = DateTime.fromISO(originalIsoStart, {
      zone: "utc",
    });

    try {
      if (mode === "THIS_EVENT") {
        const exceptionIso = originalInstanceStartUTC.toISO({
          suppressMilliseconds: true,
        });
        const newExdates = [...new Set([...currentExdates, exceptionIso])];
        const updatedParent = { ...parentEvent, exdate: newExdates };

        if (isDelete) {
          setLoadedEvents((prev) =>
            prev
              .map((ev) => (ev.id === parentId ? updatedParent : ev))
              .filter((ev) => ev.id !== currentEvent.id),
          );
          consoleLogProgress("Saving");
          const res = await updateEvent(
            { sourceEventId: parentId, ...updatedParent },
            consoleLogProgress,
          );
          if (!res?.success) throw new Error(res?.error);
          consoleLogProgress("success");
        } else {
          const exceptionEvent = {
            ...finalData,
            id: `exception-${Date.now()}`,
            sourceEventId: parentId,
            group_id: groupId,
            originalOccurrenceDate: exceptionIso,
            recurrenceOverride: true,
            recurrence: { type: "NONE" },
          };

          setLoadedEvents((prev) => [
            ...prev.map((ev) => (ev.id === parentId ? updatedParent : ev)),
            exceptionEvent,
          ]);

          consoleLogProgress("Saving");
          const res1 = await updateEvent(
            { sourceEventId: parentId, ...updatedParent },
            consoleLogProgress,
          );
          if (!res1?.success) throw new Error(res1?.error);

          const res2 = await addEvent(exceptionEvent, consoleLogProgress);
          if (!res2?.success) throw new Error(res2?.error);

          setLoadedEvents((prev) =>
            prev.map((ev) => (ev.id === exceptionEvent.id ? res2.event : ev)),
          );
          consoleLogProgress("success");
        }
      } else if (mode === "THIS_AND_FOLLOWING") {
        const newEndDateForOldParent = originalInstanceStartUTC
          .setZone(userZone)
          .minus({ days: 1 })
          .endOf("day")
          .toUTC()
          .toISO({ suppressMilliseconds: true });

        const updatedOldParent = {
          ...parentEvent,
          recurrence: {
            ...parentEvent.recurrence,
            endOption: "DATE",
            endDate: newEndDateForOldParent,
          },
        };

        if (isDelete) {
          const overridesToDelete = loadedEvents
            .filter(
              (ev) =>
                ev.recurrence?.type === "NONE" &&
                (ev.group_id === groupId || ev.sourceEventId === parentId) &&
                ev.id !== parentId &&
                DateTime.fromISO(
                  ev.originalTimeRange?.start || ev.timeRange.start,
                  { zone: "utc" },
                ) >= originalInstanceStartUTC,
            )
            .map((ev) => ev.id);

          setLoadedEvents((prev) =>
            prev
              .map((ev) => (ev.id === parentId ? updatedOldParent : ev))
              .filter((ev) => !overridesToDelete.includes(ev.id)),
          );
          consoleLogProgress("Saving");
          const res = await updateEvent(
            { sourceEventId: parentId, ...updatedOldParent },
            consoleLogProgress,
          );
          if (!res?.success) throw new Error(res?.error);

          for (const oid of overridesToDelete) {
            await deleteEvent(oid);
          }
          consoleLogProgress("success");
        } else {
          const newGroupId = `series-${Date.now()}`;

          const newParentEvent = {
            ...finalData,
            id: `parent-${Date.now()}`,
            sourceEventId: null,
            group_id: newGroupId,
            recurrence: { ...parentEvent.recurrence },
          };

          setLoadedEvents((prev) => [
            ...prev.map((ev) => (ev.id === parentId ? updatedOldParent : ev)),
            newParentEvent,
          ]);

          consoleLogProgress("Saving");
          const res1 = await updateEvent(
            { sourceEventId: parentId, ...updatedOldParent },
            consoleLogProgress,
          );
          if (!res1?.success) throw new Error(res1?.error);

          const res2 = await addEvent(newParentEvent, consoleLogProgress);
          if (!res2?.success) throw new Error(res2?.error);

          setLoadedEvents((prev) =>
            prev.map((ev) => (ev.id === newParentEvent.id ? res2.event : ev)),
          );
          consoleLogProgress("success");
        }
      } else if (mode === "ALL_EVENTS") {
        if (isDelete) {
          setLoadedEvents((prev) =>
            prev.filter(
              (ev) =>
                (ev.group_id || ev.id) !== groupId &&
                ev.sourceEventId !== parentId &&
                ev.id !== parentId,
            ),
          );
          consoleLogProgress("Saving");
          await deleteSeries(groupId);
          consoleLogProgress("success");
        } else {
          const nowLocalDayStart = DateTime.now()
            .setZone(userZone)
            .startOf("day");
          const pastExdates = currentExdates.filter((exIso) => {
            const exLocal = DateTime.fromISO(exIso, { zone: "utc" }).setZone(
              userZone,
            );
            return exLocal < nowLocalDayStart;
          });

          const shiftedExdates = pastExdates.map((exIso) => {
            const exDt = DateTime.fromISO(exIso, { zone: "utc" });
            return exDt
              .plus({ milliseconds: deltaMs })
              .toISO({ suppressMilliseconds: true });
          });

          const exceptionsToDelete = loadedEvents
            .filter(
              (ev) =>
                ev.recurrence?.type === "NONE" &&
                (ev.group_id === groupId || ev.sourceEventId === parentId) &&
                ev.id !== parentId &&
                DateTime.fromISO(ev.timeRange.start).setZone(userZone) >=
                  nowLocalDayStart,
            )
            .map((ev) => ev.id);

          const parentStartDt = DateTime.fromISO(parentEvent.timeRange.start, {
            zone: "utc",
          });
          const parentEndDt = DateTime.fromISO(parentEvent.timeRange.end, {
            zone: "utc",
          });

          const newParentStart = parentStartDt
            .plus({ milliseconds: deltaMs })
            .toISO({ suppressMilliseconds: true });
          const newParentEnd = parentEndDt
            .plus({ milliseconds: deltaMs + durationDeltaMs })
            .toISO({ suppressMilliseconds: true });

          const updatedParent = {
            ...parentEvent,
            ...finalData,
            timeRange: { start: newParentStart, end: newParentEnd },
            id: parentId,
            exdate: shiftedExdates,
          };

          setLoadedEvents((prev) => {
            const purgedState = prev.filter(
              (ev) => !exceptionsToDelete.includes(ev.id),
            );
            return purgedState.map((ev) =>
              ev.id === parentId ? updatedParent : ev,
            );
          });

          consoleLogProgress("Saving");
          const res1 = await updateEvent(
            { sourceEventId: parentId, ...updatedParent },
            consoleLogProgress,
          );
          if (!res1?.success) throw new Error(res1?.error);

          for (const exId of exceptionsToDelete) {
            await deleteEvent(exId);
          }
          consoleLogProgress("success");
        }
      }
    } catch (error) {
      console.error("Recurrence Engine Error:", error);
      consoleLogProgress("error");
      setLoadedEvents(preEditSnapshot);
    }
  }

  function onSubmit() {
    if (onConfirm) {
      onConfirm(selected);
    } else {
      onClose();
      executeSave(selected);
    }
  }

  if (!allowedModes || allowedModes.length === 0) return null;

  return (
    <div className={styles.recurrenceUpdatePopup}>
      <div className={styles.top}>
        <h3>Edit recurring event</h3>
      </div>
      <div className={styles.middle}>
        <ListChooser state={selected} setState={setSelected}>
          {allowedModes.includes("THIS_EVENT") && (
            <ListItem value="THIS_EVENT" label="This event only" />
          )}
          {allowedModes.includes("THIS_AND_FOLLOWING") && (
            <ListItem
              value="THIS_AND_FOLLOWING"
              label="This and following events"
            />
          )}
          {allowedModes.includes("ALL_EVENTS") && (
            <ListItem value="ALL_EVENTS" label="All events" />
          )}
        </ListChooser>
      </div>
      <div className={styles.bottom}>
        <CustomButton
          onClick={onClose}
          className={`default lineBorder ${styles.cancelButton}`}
        >
          Cancel
        </CustomButton>
        <CustomButton
          onClick={onSubmit}
          className={`default ${styles.submitButton}`}
        >
          Ok
        </CustomButton>
      </div>
    </div>
  );
}
