// ... existing imports
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { DateTime } from "luxon";
import { AnimatePresence, motion } from "framer-motion";
import styles from "./AddEditNewEvent.module.css";
import { usePopup } from "../../../../contexts/PopupContext";
import { useData } from "../../../../contexts/AuthContext";
import { useTime } from "../../../../contexts/TimeContext";
import { formatDurationFromMinutes } from "../../../../utils/formatDurationFromMinutes";
import CustomButton from "../../../../components/button/Button";
import EmojiPopup from "../../../../components/emojiPopup/EmojiPopup";
import PickDay from "../../../../components/pickDay/pickDay";
import CheckBox from "../../../../components/checkBox/checkBox";
import ConfirmPopup from "../../../../components/confirmPopup/confirmPopup";
import RecurrenceUpdatePopup from "../RecurrenceUpdatePopup/RecurrenceUpdatePopup";
import CheckboxGroup from "../../../../components/checkboxGroup/CheckboxGroup"; // 🔴 IMPORT CHECKBOX
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";

import {
  AvailabilityIcon,
  CalendarCircleEndIcon,
  CalendarCircleIcon,
  EyeDashedIcon,
  MenuDotsHoriantalIcon,
  NotificationIcon,
  RepeatIcon,
  ThreeLinesDashedIcon,
  SuccessIcon,
  ErrorIcon,
  CloseIcon,
} from "../../../../assets/icons/Icon";
import Loading from "../../../../components/loading/Loading";
import { db } from "../../../../../firebase";

const AddEditNewEvent = forwardRef(
  ({ eventId: incomingEventId, onClose }, ref) => {
    // 🟢 FIXED: If it's an unsaved draft ID string, turn it to null so the form activates Create Mode!
    const eventId =
      incomingEventId && incomingEventId.toString().startsWith("unsaved")
        ? null
        : incomingEventId;

    const { currentUser } = useData();
    const {
      newEvent,
      setNewEvent,
      loadedEvents = [],
      setLoadedEvents,
      safeSetLoadedEvents,
      timeZoneOffset,
      isMobile,
    } = useTime();
    const { addEvent, updateEvent } = useData();
    const { openPopup, closePopup: closeContextPopup } = usePopup();

    // --- CONSTANTS ---
    const is24Format = false;
    const userZone = `UTC${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}`;

    // 🔴 FETCH FRIENDS FOR SPECIFIC INVITES
    const [friends, setFriends] = useState([]);
    useEffect(() => {
      async function loadFriends() {
        if (!currentUser?.id) return;
        try {
          const q = query(
            collection(db, "friendships"),
            where("users", "array-contains", currentUser.id),
            where("status", "==", "accepted"),
          );
          const snap = await getDocs(q);
          const friendIds = snap.docs.map((d) =>
            d.data().users.find((id) => id !== currentUser.id),
          );

          const friendsData = [];
          for (const fid of friendIds) {
            const fSnap = await getDoc(doc(db, "users", fid));
            if (fSnap.exists()) {
              friendsData.push({ id: fSnap.id, ...fSnap.data() });
            }
          }
          setFriends(friendsData);
        } catch (err) {
          console.error("Failed to load friends", err);
        }
      }
      loadFriends();
    }, [currentUser]);
    // --- 1. RESOLVE SOURCE EVENT ---
    const sourceEvent = useMemo(() => {
      if (!eventId) return newEvent;
      const exactMatch = loadedEvents.find((ev) => ev.id === eventId);
      if (exactMatch) return exactMatch;

      if (typeof eventId === "string" && eventId.includes("_")) {
        const [realId, timestamp] = eventId.split("_");
        const parent = loadedEvents.find((ev) => ev.id === realId);
        if (parent) {
          const instanceStartMs = parseInt(timestamp, 10);
          if (!isNaN(instanceStartMs)) {
            const parentStart = DateTime.fromISO(parent.timeRange.start, {
              zone: "utc",
            });
            const parentEnd = DateTime.fromISO(parent.timeRange.end, {
              zone: "utc",
            });
            const duration = parentEnd.diff(parentStart);

            const instanceStart = DateTime.fromMillis(instanceStartMs).toUTC();
            const instanceEnd = instanceStart.plus(duration);

            return {
              ...parent,
              id: eventId,
              sourceEventId: parent.id,
              timeRange: {
                start: instanceStart.toISO(),
                end: instanceEnd.toISO(),
              },
            };
          }
        }
      }
      return newEvent;
    }, [eventId, loadedEvents, newEvent]);

    // Local state for the form
    const [isFullDay, setIsFullDay] = useState(false);
    const prevTimeRange = useRef(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [eventType, setEventType] = useState("Event");
    const [loadingStatus, setLoadingStatus] = useState("idle");

    const [eventData, setEventData] = useState({
      title: "",
      description: "",
      timeRange: { start: "", end: "" },
      color: "#FFD4A9",
      visibility: "visible",
      availability: "busy",
      notification: 0,
      emoji: "",
      recurrence: { type: "NONE" },
      group_id: null,
      invitedIds: [], // 🔴 NEW: Track specific friends
      invitedFriendsFull: [], // 🔴 NEW: Store full keys for encryption
    });

    const eventDataRef = useRef(eventData);
    const isFullDayRef = useRef(isFullDay);
    const originalEventRef = useRef(null);
    const shadowIdRef = useRef(`shadow_${Date.now()}`);

    useEffect(() => {
      eventDataRef.current = eventData;
    }, [eventData]);
    useEffect(() => {
      isFullDayRef.current = isFullDay;
    }, [isFullDay]);

    useEffect(() => {
      if (sourceEvent) {
        if (!originalEventRef.current) {
          originalEventRef.current = JSON.parse(JSON.stringify(sourceEvent));
        }
        setEventData({
          title: sourceEvent.title || "",
          description: sourceEvent.description || "",
          timeRange: {
            start: sourceEvent.timeRange?.start || "",
            end: sourceEvent.timeRange?.end || "",
          },
          color: sourceEvent.color || "#FFD4A9",
          visibility: sourceEvent.visibility || "visible",
          availability: sourceEvent.availability || "busy",
          notification: sourceEvent.notification || 0,
          emoji: sourceEvent.emoji || "",
          recurrence: sourceEvent.recurrence || { type: "NONE" },
          group_id: sourceEvent.group_id,
          invitedIds: sourceEvent.invitedIds || [],
          invitedFriendsFull: sourceEvent.invitedFriendsFull || [],
        });
        setIsFullDay(sourceEvent.isFullDay || false);
      }
      return () => {
        if (eventId) {
          setLoadedEvents((prev) =>
            prev.filter((ev) => ev.id !== shadowIdRef.current),
          );
        }
      };
    }, [sourceEvent]);

    const hasChanges = useMemo(() => {
      if (!eventId) return true;
      if (!originalEventRef.current) return false;

      const current = { ...eventData, isFullDay };
      const original = originalEventRef.current;

      return (
        current.title !== (original.title || "") ||
        current.description !== (original.description || "") ||
        current.color !== (original.color || "#FFD4A9") ||
        current.emoji !== (original.emoji || "") ||
        current.visibility !== (original.visibility || "visible") ||
        current.availability !== (original.availability || "busy") ||
        current.notification !== (original.notification || 0) ||
        current.timeRange.start !== original.timeRange.start ||
        current.timeRange.end !== original.timeRange.end ||
        current.isFullDay !== (original.isFullDay || false) ||
        JSON.stringify(current.invitedIds) !==
          JSON.stringify(original.invitedIds || []) || // 🔴 Detect invite changes
        JSON.stringify(current.recurrence) !==
          JSON.stringify(original.recurrence || { type: "NONE" })
      );
    }, [eventData, isFullDay, eventId]);

    const handleRevert = () => {
      if (originalEventRef.current) {
        setEventData({ ...originalEventRef.current });
        setIsFullDay(originalEventRef.current.isFullDay || false);
      }
      if (eventId) {
        setLoadedEvents((prev) =>
          prev.filter((ev) => ev.id !== shadowIdRef.current),
        );
        const isRecurring =
          originalEventRef.current.recurrence?.type !== "NONE";
        if (!isRecurring) {
          setLoadedEvents((prev) =>
            prev.map((ev) =>
              ev.id === eventId ? { ...ev, ...originalEventRef.current } : ev,
            ),
          );
        }
      } else {
        setNewEvent({ ...originalEventRef.current });
      }
    };

    const handleConfirmExitYes = () => {
      handleRevert();
      closeContextPopup();
      if (onClose) onClose();
    };

    useImperativeHandle(ref, () => ({
      hasUnsavedChanges: () => loadingStatus === "idle" && hasChanges,
      requestClose: () => {
        openPopup("centered", () => (
          <ConfirmPopup
            message="You have unsaved changes. Are you sure you want to discard them?"
            onYes={handleConfirmExitYes}
            onNo={() => closeContextPopup()}
          />
        ));
      },
      discardChanges: () => handleRevert(),
    }));

    const updateGlobalState = (updates, overrideIsFullDay = isFullDay) => {
      setEventData((prev) => ({ ...prev, ...updates }));
      const newData = {
        ...eventData,
        ...updates,
        isFullDay: overrideIsFullDay,
      };

      if (!eventId) {
        setNewEvent((prev) =>
          prev ? { ...prev, ...updates, isFullDay: overrideIsFullDay } : prev,
        );
      } else {
        const isRecurring =
          originalEventRef.current.recurrence?.type !== "NONE";
        if (!isRecurring) {
          setLoadedEvents((prev) =>
            prev.map((ev) =>
              ev.id === eventId
                ? { ...ev, ...updates, isFullDay: overrideIsFullDay }
                : ev,
            ),
          );
        } else {
          setLoadedEvents((prev) => {
            const filtered = prev.filter((ev) => ev.id !== shadowIdRef.current);
            const shadowEvent = {
              ...originalEventRef.current,
              ...newData,
              id: shadowIdRef.current,
              sourceEventId: eventId,
              recurrence: { type: "NONE" },
            };
            return [...filtered, shadowEvent];
          });
        }
      }
    };

    async function handleSave() {
      if (eventId && !hasChanges) return;
      if (loadingStatus !== "idle") return;

      if (!eventId) {
        await executeAdd();
        return;
      }

      const realId =
        originalEventRef.current.sourceEventId || originalEventRef.current.id;
      const parentEvent = loadedEvents.find((ev) => ev.id === realId);

      if (!parentEvent) return;

      const isRecurring =
        parentEvent.recurrence && parentEvent.recurrence.type !== "NONE";

      if (!isRecurring) {
        setLoadingStatus("encrypting");
        const onProgress = (s) => setLoadingStatus(s);

        try {
          setLoadedEvents((prev) =>
            prev.map((ev) =>
              ev.id === parentEvent.id
                ? { ...ev, ...eventData, isFullDay }
                : ev,
            ),
          );
          const result = await updateEvent(
            { sourceEventId: parentEvent.id, ...eventData, isFullDay },
            onProgress,
          );
          if (result.success) finishSuccess();
          else throw new Error("Update failed");
        } catch (e) {
          handleError(e);
          handleRevert();
        }
        return;
      }

      const oldStart = DateTime.fromISO(
        originalEventRef.current.timeRange.start,
      ).toMillis();
      const newStart = DateTime.fromISO(eventData.timeRange.start).toMillis();
      const oldEnd = DateTime.fromISO(
        originalEventRef.current.timeRange.end,
      ).toMillis();
      const newEnd = DateTime.fromISO(eventData.timeRange.end).toMillis();

      const deltaMs = newStart - oldStart;
      const durationDeltaMs = newEnd - newStart - (oldEnd - oldStart);

      const oldDateStr = DateTime.fromMillis(oldStart)
        .setZone(userZone)
        .toISODate();
      const newDateStr = DateTime.fromMillis(newStart)
        .setZone(userZone)
        .toISODate();

      let allowedModes = ["THIS_EVENT", "THIS_AND_FOLLOWING"];
      if (oldDateStr === newDateStr) allowedModes.push("ALL_EVENTS");

      const contextCurrentEvent = {
        ...originalEventRef.current,
        originalTimeRange: originalEventRef.current.timeRange,
      };

      openPopup(
        "centered",
        () => (
          <RecurrenceUpdatePopup
            allowedModes={allowedModes}
            onClose={() => {
              closeContextPopup();
              if (onClose) onClose();
            }}
            context={{
              parentEvent: parentEvent,
              currentEvent: contextCurrentEvent,
              finalData: {
                ...eventData,
                isFullDay,
                timeRange: eventData.timeRange,
                position: null,
                size: null,
                columnDate: null,
              },
              deltaMs,
              durationDeltaMs,
            }}
          />
        ),
        document.body,
        "center",
      );
    }

    async function executeAdd() {
      setLoadingStatus("encrypting");
      const onProgress = (s) => setLoadingStatus(s);

      try {
        const payload = { ...eventData, isFullDay };
        delete payload.timeRange;
        payload.start = eventData.timeRange.start;
        payload.end = eventData.timeRange.end;

        const result = await addEvent(payload, onProgress);

        if (result.success) {
          const created = {
            ...result.event,
            ...payload,
            timeRange: { start: payload.start, end: payload.end },
          };
          setNewEvent(null);
          safeSetLoadedEvents((prev) => [...prev, created]);
          finishSuccess();
        } else {
          throw new Error(result.error);
        }
      } catch (e) {
        handleError(e);
      }
    }

    function finishSuccess() {
      setLoadingStatus("success");
      setTimeout(() => {
        if (onClose) onClose();
        else closeContextPopup();
      }, 800);
    }

    function handleError(e) {
      console.error(e);
      setLoadingStatus("error");
      setTimeout(() => setLoadingStatus("idle"), 2000);
    }

    // --- TIME HANDLERS ---
    const handleFullDayChange = () => {
      const newIsFullDay = !isFullDay;
      setIsFullDay(newIsFullDay);

      // We use Luxon DateTime to safely handle your userZone and UTC conversions
      const currentStartLocal = DateTime.fromISO(eventData.timeRange.start, {
        zone: "utc",
      }).setZone(userZone);
      const currentEndLocal = DateTime.fromISO(eventData.timeRange.end, {
        zone: "utc",
      }).setZone(userZone);

      if (newIsFullDay) {
        // Save previous time before we squash it to midnight
        prevTimeRange.current = { ...eventData.timeRange };

        let newStart = currentStartLocal.startOf("day");
        let newEnd = currentEndLocal.startOf("day");

        // If they are on the same day, full day means ending at midnight the NEXT day
        if (newEnd <= newStart) {
          newEnd = newEnd.plus({ days: 1 });
        }

        updateGlobalState(
          {
            timeRange: {
              start: newStart.toUTC().toISO({ suppressMilliseconds: true }),
              end: newEnd.toUTC().toISO({ suppressMilliseconds: true }),
            },
          },
          newIsFullDay,
        );
      } else {
        let newStart, newEnd;

        if (prevTimeRange.current) {
          // Parse previous times in the local zone
          const prevS = DateTime.fromISO(prevTimeRange.current.start, {
            zone: "utc",
          }).setZone(userZone);
          const prevE = DateTime.fromISO(prevTimeRange.current.end, {
            zone: "utc",
          }).setZone(userZone);

          // Restore previous hour/minute onto the CURRENT start day
          newStart = currentStartLocal.set({
            hour: prevS.hour,
            minute: prevS.minute,
            second: 0,
            millisecond: 0,
          });

          // End time is simply the new start time + the original duration!
          // This completely prevents the "2 day" bug.
          const duration = prevE.diff(prevS);
          newEnd = newStart.plus(duration);
        } else {
          // Fallback: Was full day from the beginning
          // Get the actual current real-world time in the user's timezone
          const now = DateTime.now().setZone(userZone);

          // Set the event's start date to match the current real-world hour and minute
          newStart = currentStartLocal.set({
            hour: now.hour,
            minute: now.minute,
            second: 0,
            millisecond: 0,
          });

          // End time is exactly 1 hour later
          newEnd = newStart.plus({ hours: 1 });
        }

        // Convert safely back to UTC for saving
        updateGlobalState(
          {
            timeRange: {
              start: newStart.toUTC().toISO({ suppressMilliseconds: true }),
              end: newEnd.toUTC().toISO({ suppressMilliseconds: true }),
            },
          },
          newIsFullDay,
        );
      }
    };

    const handleDayPick = (e) => {
      openPopup(
        "contextual",
        () => (
          <PickDay
            today={eventDataRef.current.timeRange.start}
            onPick={(selectedDate) => {
              const newStartDayLocal =
                DateTime.fromISO(selectedDate).setZone(userZone);
              const currentStartLocal = DateTime.fromISO(
                eventDataRef.current.timeRange.start,
                { zone: "utc" },
              ).setZone(userZone);
              const currentEndLocal = DateTime.fromISO(
                eventDataRef.current.timeRange.end,
                { zone: "utc" },
              ).setZone(userZone);
              const duration = currentEndLocal.diff(currentStartLocal);

              const newStart = newStartDayLocal.set({
                hour: currentStartLocal.hour,
                minute: currentStartLocal.minute,
                second: 0,
                millisecond: 0,
              });
              const newEnd = newStart.plus(duration);

              const newStartIso = newStart
                .toUTC()
                .toISO({ suppressMilliseconds: true });
              const newEndIso = newEnd
                .toUTC()
                .toISO({ suppressMilliseconds: true });

              const newIsFullDay = isRangeFullDay(newStartIso, newEndIso);
              setIsFullDay(newIsFullDay);

              updateGlobalState(
                {
                  timeRange: { start: newStartIso, end: newEndIso },
                },
                newIsFullDay,
              );
            }}
          />
        ),
        e.currentTarget,
        "bottomLeft",
      );
    };

    const handleEndDayPick = (e) => {
      openPopup(
        "contextual",
        () => (
          <PickDay
            today={eventDataRef.current.timeRange.end}
            minDate={eventDataRef.current.timeRange.start}
            onPick={(selectedDate) => {
              const newEndDayLocal =
                DateTime.fromISO(selectedDate).setZone(userZone);
              const currentStartLocal = DateTime.fromISO(
                eventDataRef.current.timeRange.start,
                { zone: "utc" },
              ).setZone(userZone);
              const currentEndLocal = DateTime.fromISO(
                eventDataRef.current.timeRange.end,
                { zone: "utc" },
              ).setZone(userZone);

              let newEnd = newEndDayLocal.set({
                hour: currentEndLocal.hour,
                minute: currentEndLocal.minute,
                second: 0,
                millisecond: 0,
              });

              if (
                isFullDayRef.current &&
                newEnd.hasSame(currentStartLocal, "day")
              ) {
                newEnd = newEnd.plus({ days: 1 });
              }

              const newStartIso = currentStartLocal
                .toUTC()
                .toISO({ suppressMilliseconds: true });
              const newEndIso = newEnd
                .toUTC()
                .toISO({ suppressMilliseconds: true });

              const newIsFullDay = isRangeFullDay(newStartIso, newEndIso);
              setIsFullDay(newIsFullDay);

              updateGlobalState(
                {
                  timeRange: {
                    ...eventDataRef.current.timeRange,
                    end: newEndIso,
                  },
                },
                newIsFullDay,
              );
            }}
          />
        ),
        e.currentTarget,
        "bottomLeft",
      );
    };

    const handleStartTimeClick = (e) => {
      openPopup(
        "contextual",
        () => (
          <TimeListPopup
            baseDate={new Date(eventDataRef.current.timeRange.start)}
            closePopup={closeContextPopup}
            is12Format={!is24Format}
            onPick={(date) => {
              const currentStartLocal = DateTime.fromISO(
                eventDataRef.current.timeRange.start,
                { zone: "utc" },
              ).setZone(userZone);
              const currentEndLocal = DateTime.fromISO(
                eventDataRef.current.timeRange.end,
                { zone: "utc" },
              ).setZone(userZone);
              const duration = currentEndLocal.diff(currentStartLocal);

              const newStart = currentStartLocal.set({
                hour: date.getHours(),
                minute: date.getMinutes(),
                second: 0,
                millisecond: 0,
              });
              const newEnd = newStart.plus(duration);

              const newStartIso = newStart
                .toUTC()
                .toISO({ suppressMilliseconds: true });
              const newEndIso = newEnd
                .toUTC()
                .toISO({ suppressMilliseconds: true });

              const newIsFullDay = isRangeFullDay(newStartIso, newEndIso);
              setIsFullDay(newIsFullDay);

              updateGlobalState(
                {
                  timeRange: { start: newStartIso, end: newEndIso },
                },
                newIsFullDay,
              );
            }}
          />
        ),
        e.currentTarget,
        "bottomLeft",
      );
    };

    const handleEndTimeClick = (e) => {
      openPopup(
        "contextual",
        () => (
          <TimeListPopup
            baseDate={new Date(eventDataRef.current.timeRange.end)}
            closePopup={closeContextPopup}
            is12Format={!is24Format}
            onPick={(date) => {
              const currentStartLocal = DateTime.fromISO(
                eventDataRef.current.timeRange.start,
                { zone: "utc" },
              ).setZone(userZone);
              let newEnd = DateTime.fromISO(
                eventDataRef.current.timeRange.end,
                {
                  zone: "utc",
                },
              ).setZone(userZone);

              if (newEnd.hasSame(currentStartLocal, "day")) {
                newEnd = currentStartLocal;
              }

              newEnd = newEnd.set({
                hour: date.getHours(),
                minute: date.getMinutes(),
                second: 0,
                millisecond: 0,
              });

              if (newEnd <= currentStartLocal) {
                newEnd = newEnd.plus({ days: 1 });
              }

              const newStartIso = currentStartLocal
                .toUTC()
                .toISO({ suppressMilliseconds: true });
              const newEndIso = newEnd
                .toUTC()
                .toISO({ suppressMilliseconds: true });

              const newIsFullDay = isRangeFullDay(newStartIso, newEndIso);
              setIsFullDay(newIsFullDay);

              updateGlobalState(
                {
                  timeRange: { start: newStartIso, end: newEndIso },
                },
                newIsFullDay,
              );
            }}
          />
        ),
        e.currentTarget,
        "bottomLeft",
      );
    };

    // --- OTHER HANDLERS ---
    const handleTitleChange = (e) =>
      updateGlobalState({ title: e.target.value });
    const handleEmojiChange = (emoji) => updateGlobalState({ emoji });
    const handleColorChange = (color) => {
      updateGlobalState({ color });
      closeContextPopup();
    };
    const handleAvailabilityChange = (availability) => {
      updateGlobalState({ availability });
      closeContextPopup();
    };
    const handleNotificationChange = (minutes) => {
      updateGlobalState({ notification: minutes });
      closeContextPopup();
    };
    const handleRecurrenceChange = (recurrenceRule) => {
      updateGlobalState({ recurrence: recurrenceRule });
      closeContextPopup();
    };
    const handleDescriptionSave = (newDescription) => {
      updateGlobalState({ description: newDescription });
    };

    // 🔴 VISIBILITY CLICK HANDLER
    const handleVisibiltyClick = (e) => {
      openPopup(
        "contextual",
        () => (
          <VisibilityPopup
            eventData={eventData}
            updateGlobalState={updateGlobalState}
            friends={friends}
            openSubPopup={openPopup}
            closeParent={closeContextPopup}
          />
        ),
        e.currentTarget,
        "bottomRight",
      );
    };

    const isRangeFullDay = (startIso, endIso) => {
      const startLocal = DateTime.fromISO(startIso, { zone: "utc" }).setZone(
        userZone,
      );
      const endLocal = DateTime.fromISO(endIso, { zone: "utc" }).setZone(
        userZone,
      );

      return (
        startLocal.hour === 0 &&
        startLocal.minute === 0 &&
        endLocal.hour === 0 &&
        endLocal.minute === 0 &&
        endLocal.diff(startLocal, "hours").hours >= 24
      );
    };

    const isMultiDay = useMemo(() => {
      if (!eventData.timeRange.start || !eventData.timeRange.end) return false;
      const startDT = DateTime.fromISO(eventData.timeRange.start, {
        zone: "utc",
      })
        .setZone(userZone)
        .startOf("day");
      const endDT = DateTime.fromISO(eventData.timeRange.end, { zone: "utc" })
        .setZone(userZone)
        .startOf("day");
      return endDT.toMillis() > startDT.toMillis();
    }, [eventData.timeRange, userZone]);

    const startDT = DateTime.fromISO(eventData.timeRange.start, {
      zone: "utc",
    }).setZone(userZone);
    const endDT = DateTime.fromISO(eventData.timeRange.end, {
      zone: "utc",
    }).setZone(userZone);
    const dateDisplay = startDT.isValid
      ? startDT.toFormat("cccc, MMMM d")
      : "Pick Date";
    const endDateDisplay = endDT.isValid
      ? endDT.toFormat("cccc, MMMM d")
      : "Pick Date";
    const startTimeDisplay = startDT.isValid
      ? is24Format
        ? startDT.toFormat("HH:mm")
        : startDT.toFormat("h:mm a")
      : "--:--";
    const endTimeDisplay = endDT.isValid
      ? is24Format
        ? endDT.toFormat("HH:mm")
        : endDT.toFormat("h:mm a")
      : "--:--";

    const shouldShowExpanded = isFullDay || isMultiDay || isExpanded;

    const colorOptions = [
      "#FFD4A9",
      "#F2BAE1",
      "#D9E6A2",
      "#D8DCFF",
      "#BFF2FC",
      "#898989",
      "#ABE9CE",
      "#DBDBDB",
      "#D1EAED",
    ];
    const notificationOptions = [5, 10, 15, 30, 60, 1440];
    const availabilityOptions = ["busy", "free"];

    const handleDescriptionClick = (e) => {
      openPopup(
        "centered",
        () => (
          <DescriptionPopup
            initialDescription={eventData.description}
            onSave={handleDescriptionSave}
          />
        ),
        e.currentTarget,
        "bottomLeft",
      );
    };
    const handleRepeatClick = (e) => {
      openPopup(
        "contextual",
        () => (
          <RecurrenceOptionsPopup
            startDate={eventData.timeRange.start}
            currentRecurrence={eventData.recurrence}
            onSave={handleRecurrenceChange}
            openSubPopup={openPopup}
          />
        ),
        e.currentTarget,
        "bottomRight",
      );
    };
    const handleColorClick = (e) => {
      openPopup(
        "contextual",
        () => (
          <div className={`${styles.colorPickerPopup} ${styles.addEventPopup}`}>
            {colorOptions.map((color) => (
              <div
                key={color}
                className={styles.colorOptionWrapper}
                onClick={() => handleColorChange(color)}
              >
                <div
                  className={styles.colorHover}
                  style={{ backgroundColor: color }}
                ></div>
                <span
                  className={styles.colorDot}
                  style={{ backgroundColor: color }}
                ></span>
              </div>
            ))}
          </div>
        ),
        e.currentTarget,
        "bottomRight",
      );
    };
    const handleEmojiClick = (e) => {
      openPopup(
        "contextual",
        () => <EmojiPopup handleEmojiChange={handleEmojiChange} />,
        e.currentTarget,
        "bottomRight",
      );
    };
    const handleAvailabilityClick = (e) => {
      openPopup(
        "contextual",
        () => (
          <div
            className={`${styles.availabilityPopup} ${styles.optionsPopup} ${styles.addEventPopup}`}
          >
            {availabilityOptions.map((av) => (
              <CustomButton
                key={av}
                ClickEffect={"scale"}
                className={`default`}
                onClick={() => handleAvailabilityChange(av)}
              >
                <p>{av}</p>
              </CustomButton>
            ))}
          </div>
        ),
        e.currentTarget,
        "bottomRight",
      );
    };
    const handleNotificationClick = (e) => {
      openPopup(
        "contextual",
        () => (
          <div
            className={`${styles.notificationPopup} ${styles.optionsPopup} ${styles.addEventPopup}`}
          >
            {notificationOptions.map((notification) => (
              <CustomButton
                key={notification}
                ClickEffect={"scale"}
                className={`default`}
                onClick={() => handleNotificationChange(notification)}
              >
                <p>{formatDurationFromMinutes(notification)}</p>
              </CustomButton>
            ))}
          </div>
        ),
        e.currentTarget,
        "bottomRight",
      );
    };

    const renderEventForm = () => (
      <motion.div
        key="Event"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.2 }}
        className={styles.bottom}
      >
        <div className={styles.timeContainter}>
          <div className={styles.headder}>
            <h1>Time & Date</h1>
          </div>
          {!shouldShowExpanded && (
            <div className={styles.contContnet}>
              <div className={styles.date}>
                <CustomButton
                  onClick={handleDayPick}
                  ClickEffect={"scale"}
                  className={`default`}
                >
                  <div className={styles.icon}>
                    <CalendarCircleIcon />
                  </div>
                  <p>{dateDisplay}</p>
                </CustomButton>
              </div>
              <div className={styles.right}>
                <div className={styles.time}>
                  <div className={styles.startTime}>
                    <CustomButton
                      onClick={handleStartTimeClick}
                      ClickEffect={"scale"}
                      className={`default`}
                    >
                      <p>{startTimeDisplay}</p>
                    </CustomButton>
                  </div>
                  <div className={styles.line}></div>
                  <div className={styles.endtTime}>
                    <CustomButton
                      onClick={handleEndTimeClick}
                      ClickEffect={"scale"}
                      className={`default`}
                    >
                      <p>{endTimeDisplay}</p>
                    </CustomButton>
                  </div>
                </div>
                <div className={styles.options}>
                  <CustomButton
                    ClickEffect={"scale"}
                    className={`default`}
                    onClick={() => setIsExpanded(true)}
                  >
                    <div className={styles.icon}>
                      <MenuDotsHoriantalIcon />
                    </div>
                  </CustomButton>
                </div>
              </div>
            </div>
          )}

          {shouldShowExpanded && (
            <div className={`${styles.contContnet} ${styles.expanded}`}>
              <div className={styles.date}>
                <CustomButton
                  onClick={handleDayPick}
                  ClickEffect={"scale"}
                  className={`default`}
                >
                  <div className={styles.icon}>
                    <CalendarCircleIcon />
                  </div>
                  <p>{dateDisplay}</p>
                </CustomButton>
                <CustomButton
                  onClick={handleEndDayPick}
                  ClickEffect={"scale"}
                  className={`default`}
                >
                  <div className={styles.icon}>
                    <CalendarCircleEndIcon />
                  </div>
                  <p>{endDateDisplay}</p>
                </CustomButton>
              </div>
              <div className={styles.more}>
                <div className={styles.fullDay}>
                  <CheckBox
                    state={isFullDay}
                    onChange={handleFullDayChange}
                    size={32}
                  />
                  <p>full-day</p>
                </div>
                {!isFullDay && (
                  <div className={styles.time}>
                    <div className={styles.startTime}>
                      <CustomButton
                        onClick={handleStartTimeClick}
                        ClickEffect={"scale"}
                        className={`default`}
                      >
                        <p>{startTimeDisplay}</p>
                      </CustomButton>
                    </div>
                    <div className={styles.line}></div>
                    <div className={styles.endtTime}>
                      <CustomButton
                        onClick={handleEndTimeClick}
                        ClickEffect={"scale"}
                        className={`default`}
                      >
                        <p>{endTimeDisplay}</p>
                      </CustomButton>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={styles.detailsContainter}>
          <div className={styles.headder}>
            <h1>Event details</h1>
          </div>
          <div className={styles.contContnet}>
            <div className={styles.color}>
              <CustomButton
                onClick={handleColorClick}
                ClickEffect={"scale"}
                type="list"
                className={`default`}
              >
                <div className={styles.icon}>
                  <span style={{ backgroundColor: eventData.color }}></span>
                </div>
                <span>color</span>
              </CustomButton>
            </div>
            <div className={styles.visibility}>
              <CustomButton
                onClick={handleVisibiltyClick}
                ClickEffect={"scale"}
                type="list"
                className={`default`}
              >
                <div className={styles.icon}>
                  <EyeDashedIcon />
                </div>
                {/* 🔴 Dynamic Label based on Specific Friends */}
                <span>
                  {eventData.visibility === "visible"
                    ? "Visible for friends"
                    : eventData.visibility === "specific"
                      ? "Specific friends"
                      : "Private"}
                </span>
              </CustomButton>
            </div>
            <div className={styles.availability}>
              <CustomButton
                onClick={handleAvailabilityClick}
                ClickEffect={"scale"}
                type="list"
                className={`default`}
              >
                <div className={styles.icon}>
                  <AvailabilityIcon />
                </div>
                <span>{eventData.availability}</span>
              </CustomButton>
            </div>
            <div className={styles.notification}>
              <CustomButton
                onClick={handleNotificationClick}
                ClickEffect={"scale"}
                type="list"
                className={`default`}
              >
                <div className={styles.icon}>
                  <NotificationIcon />
                </div>
                <span>
                  {eventData?.notification === 0
                    ? "no notification"
                    : formatDurationFromMinutes(eventData.notification)}
                </span>
              </CustomButton>
            </div>

            <div className={styles.emoji}>
              <CustomButton
                onClick={handleEmojiClick}
                ClickEffect={"scale"}
                type="list"
                className={`default`}
              >
                <div className={styles.icon}>{eventData.emoji || "📅"}</div>
                <span>Emoji</span>
              </CustomButton>
            </div>
            <div className={styles.repeat}>
              <CustomButton
                ClickEffect={"scale"}
                type="list"
                className={`default disabled`}
              >
                <div className={styles.icon}>
                  <RepeatIcon />
                </div>
                <span>Coming soon</span>
              </CustomButton>
            </div>
          </div>
        </div>

        <div className={styles.description}>
          <div className={styles.contContnet}>
            <div>
              <CustomButton
                className={`${styles.descriptionButton} ${!eventData.description ? styles.placeholder : ""}`}
                onClick={handleDescriptionClick}
                ClickEffect={"scale"}
              >
                <div className={styles.icon}>
                  <ThreeLinesDashedIcon />
                </div>
                <div className={styles.left}>
                  <p className={styles.descriptionText}>
                    {eventData.description || "Add a description or note..."}
                  </p>
                </div>
              </CustomButton>
            </div>
          </div>
        </div>
      </motion.div>
    );

    const renderPlaceholderForm = (name) => (
      <motion.div
        key={name}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.2 }}
        className={styles.placeholderForm}
      >
        <h2>{name}</h2>
        <p>Coming Soon</p>
      </motion.div>
    );

    return (
      <div className={styles.addEditEvent}>
        {isMobile && (
          <div className={styles.mobileOnly}>
            <CustomButton
              ClickEffect={"scale"}
              onClick={() => {
                if (onClose) onClose();
              }}
            >
              <CloseIcon />
            </CustomButton>
          </div>
        )}
        <AnimatePresence>
          {loadingStatus !== "idle" && (
            <motion.div
              className={styles.overlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className={styles.spinnerContainer}>
                {loadingStatus === "success" ? (
                  <SuccessIcon size={64} />
                ) : loadingStatus === "error" ? (
                  <ErrorIcon size={64} />
                ) : (
                  <Loading size={48} transparent={true} onlyIcon={true} />
                )}
                <p className={styles.statusText}>
                  {loadingStatus === "encrypting"
                    ? "Encrypting..."
                    : loadingStatus === "uploading"
                      ? "Uploading..."
                      : loadingStatus === "success"
                        ? "Done!"
                        : "Error!"}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`${styles.content} default-scrollbar`}>
          <div className={styles.top}>
            <div className={styles.title}>
              <div className={styles.inputContainer}>
                <input
                  type="text"
                  placeholder="Add title"
                  value={eventData.title}
                  onChange={handleTitleChange}
                />
              </div>
            </div>
            <div className={styles.eventType}>
              {["Event", "Task", "Birthday"].map((type) => (
                <CustomButton
                  key={type}
                  className={`default ${styles.tabButton} ${eventType === type ? styles.activeTab : ""}`}
                  onClick={() => setEventType(type)}
                  ClickEffect={"scale"}
                >
                  <p className={styles.tabText}>{type}</p>
                </CustomButton>
              ))}
            </div>
          </div>
          <AnimatePresence mode="wait">
            {eventType === "Event"
              ? renderEventForm()
              : renderPlaceholderForm(eventType)}
          </AnimatePresence>
        </div>
        <div className={styles.submit}>
          <CustomButton
            className="default"
            type="submit"
            onClick={handleSave}
            style={{
              opacity: eventId && !hasChanges ? 0.5 : 1,
              cursor: eventId && !hasChanges ? "not-allowed" : "pointer",
              pointerEvents: eventId && !hasChanges ? "none" : "auto",
            }}
          >
            {eventId ? "Save Changes" : "Add Event"}
          </CustomButton>
        </div>
      </div>
    );
  },
);

// 🔴 NEW HELPER POPUPS FOR SPECIFIC SHARING

function VisibilityPopup({
  eventData,
  updateGlobalState,
  friends,
  openSubPopup,
  closeParent,
}) {
  const handleSelect = (val) => {
    updateGlobalState({ visibility: val });
    closeParent();
  };

  const handleSpecificClick = (e) => {
    openSubPopup(
      "centered",
      () => (
        <SpecificFriendsPopup
          friends={friends}
          eventData={eventData}
          updateGlobalState={updateGlobalState}
          closePopup={closeParent}
        />
      ),
      null,
      "center",
    );
  };

  return (
    <div
      className={`${styles.visibilityPopup} ${styles.optionsPopup} ${styles.addEventPopup}`}
    >
      <CustomButton
        ClickEffect={"scale"}
        className={`default ${eventData.visibility === "visible" ? styles.activeVis : ""}`}
        onClick={() => handleSelect("visible")}
      >
        <p>Visible for friends</p>
      </CustomButton>
      <CustomButton
        ClickEffect={"scale"}
        className={`default ${eventData.visibility === "private" ? styles.activeVis : ""}`}
        onClick={() => handleSelect("private")}
      >
        <p>Private</p>
      </CustomButton>

      <div className={styles.divider}></div>

      <div className={styles.onlyShareWith} onClick={handleSpecificClick}>
        <p>Only share with...</p>
        {eventData.invitedIds?.length > 0 && (
          <div className={styles.avatarsRow}>
            {eventData.invitedIds.slice(0, 3).map((id) => {
              const f = friends.find((x) => x.id === id);
              return f ? (
                <img
                  key={id}
                  src={f.pfpUrl || "src/assets/svg/user-avatar.svg"}
                  alt="friend"
                />
              ) : null;
            })}
            {eventData.invitedIds.length > 3 && (
              <div className={styles.moreAvatars}>
                +{eventData.invitedIds.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SpecificFriendsPopup({
  friends,
  eventData,
  updateGlobalState,
  closePopup,
}) {
  const items = friends.map((f) => ({
    id: f.id,
    label: f.displayName,
    icon: f.pfpUrl || "src/assets/svg/user-avatar.svg",
  }));
  const [selected, setSelected] = useState(eventData.invitedIds || []);

  const handleApply = () => {
    const fullFriends = friends.filter((f) => selected.includes(f.id));
    updateGlobalState({
      visibility: "specific",
      invitedIds: selected,
      invitedFriendsFull: fullFriends.map((f) => ({
        id: f.id,
        publicKey: f.publicKey,
      })),
    });
    closePopup();
  };

  return (
    <div className={styles.filterPopup}>
      <div className={styles.filterHeader}>
        <h3>Only share with...</h3>
      </div>
      <div className={styles.filterBody}>
        {friends.length === 0 ? (
          <p style={{ color: "var(--text-gray)" }}>No friends found.</p>
        ) : (
          <CheckboxGroup
            items={items}
            selectedIds={selected}
            onChange={setSelected}
          />
        )}
      </div>
      <div className={styles.filterFooter}>
        <CustomButton onClick={closePopup} className="default">
          Cancel
        </CustomButton>
        <CustomButton onClick={handleApply} className="default primary">
          Apply
        </CustomButton>
      </div>
    </div>
  );
}

// ... original helper popups (Description, Recurrence, TimeList) remain the same ...
function DescriptionPopup({ initialDescription, onSave }) {
  const [text, setText] = useState(initialDescription || "");
  const { closePopup } = usePopup();

  const handleSave = () => {
    onSave(text);
    closePopup();
  };

  return (
    <div className={styles.descriptionPopup}>
      <textarea
        autoFocus
        className={styles.descriptionTextarea}
        placeholder="Add a description or note..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className={styles.descriptionActions}>
        <CustomButton onClick={handleSave} className="default">
          Save
        </CustomButton>
      </div>
    </div>
  );
}

function RecurrenceOptionsPopup({
  startDate,
  currentRecurrence,
  onSave,
  openSubPopup,
}) {
  const { closePopup } = usePopup();
  const startDT = DateTime.fromISO(startDate);

  const options = [
    { type: "NONE", label: "Does not repeat" },
    { type: "DAILY", label: "Daily", interval: 1 },
    {
      type: "WEEKLY",
      label: `Weekly on ${startDT.toFormat("cccc")}`,
      interval: 1,
    },
    {
      type: "MONTHLY",
      label: `Monthly on the ${startDT.toFormat("d")}${getOrdinal(
        startDT.day,
      )}`,
      interval: 1,
    },
    {
      type: "YEARLY",
      label: `Yearly on ${startDT.toFormat("MMMM d")}`,
      interval: 1,
    },
    { type: "WEEKDAY", label: "Every weekday (Mon-Fri)" },
  ];

  const handleSelect = (opt) => {
    if (opt.type === "WEEKDAY")
      onSave({ type: "WEEKLY", interval: 1, daysOfWeek: [1, 2, 3, 4, 5] });
    else onSave({ type: opt.type, interval: opt.interval || 1 });
  };

  const handleCustomClick = (e) => {
    openSubPopup(
      "centered",
      () => (
        <CustomRecurrencePopup
          startDate={startDate}
          onSave={onSave}
          closeParent={closePopup}
        />
      ),
      e.currentTarget,
      "bottomRight",
    );
  };

  return (
    <div className={`${styles.optionsPopup} ${styles.addEventPopup}`}>
      {options.map((opt) => (
        <CustomButton
          key={opt.label}
          ClickEffect={"scale"}
          className="default"
          onClick={() => handleSelect(opt)}
        >
          <p>{opt.label}</p>
        </CustomButton>
      ))}
      <div
        style={{
          borderTop: "1px solid var(--calender-borders)",
          margin: "4px 0",
        }}
      ></div>
      <CustomButton
        ClickEffect={"scale"}
        className="default"
        onClick={handleCustomClick}
      >
        <p>Custom...</p>
      </CustomButton>
    </div>
  );
}

function CustomRecurrencePopup({ startDate, onSave, closeParent }) {
  const { closePopup } = usePopup();
  const [frequency, setFrequency] = useState("WEEKLY");
  const [interval, setInterval] = useState(1);

  const startDT = DateTime.fromISO(startDate);
  const defaultDay = startDT.weekday === 7 ? 0 : startDT.weekday;

  const [daysOfWeek, setDaysOfWeek] = useState([defaultDay]);
  const [endType, setEndType] = useState("NEVER");
  const [endDate, setEndDate] = useState(null);
  const [count, setCount] = useState(13);

  const weekDays = ["S", "M", "T", "W", "T", "F", "S"];

  const toggleDay = (idx) => {
    if (daysOfWeek.includes(idx)) {
      if (daysOfWeek.length > 1)
        setDaysOfWeek((prev) => prev.filter((d) => d !== idx));
    } else setDaysOfWeek((prev) => [...prev, idx]);
  };

  const handleSave = () => {
    const rule = {
      type: frequency,
      interval: parseInt(interval),
      endOption: endType,
    };
    if (frequency === "WEEKLY") rule.daysOfWeek = daysOfWeek;
    if (endType === "DATE" && endDate) rule.endDate = endDate;
    else if (endType === "COUNT") rule.occurrenceCount = parseInt(count);

    onSave(rule);
    closePopup();
    if (closeParent) closeParent();
  };

  return (
    <div className={styles.customRecurrencePopup}>
      <div className={styles.crHeader}>
        <h2>Custom recurrence</h2>
      </div>

      <div className={styles.crRow}>
        <label>Repeat every</label>
        <div className={styles.crIntervalInputs}>
          <input
            type="number"
            min="1"
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            className={styles.crNumberInput}
          />
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className={styles.crSelect}
          >
            <option value="DAILY">day</option>
            <option value="WEEKLY">week</option>
            <option value="MONTHLY">month</option>
            <option value="YEARLY">year</option>
          </select>
        </div>
      </div>

      {frequency === "WEEKLY" && (
        <div className={styles.crRowVertical}>
          <label>Repeat on</label>
          <div className={styles.crWeekDays}>
            {weekDays.map((d, i) => (
              <button
                key={i}
                className={`${styles.crDayBtn} ${
                  daysOfWeek.includes(i) ? styles.active : ""
                }`}
                onClick={() => toggleDay(i)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.crRowVertical}>
        <label>Ends</label>
        <div className={styles.crRadioGroup}>
          <div className={styles.crRadioRow}>
            <input
              type="radio"
              checked={endType === "NEVER"}
              onChange={() => setEndType("NEVER")}
            />
            <span>Never</span>
          </div>

          <div className={styles.crRadioRow}>
            <input
              type="radio"
              checked={endType === "DATE"}
              onChange={() => setEndType("DATE")}
            />
            <span>On</span>
            <input
              type="date"
              disabled={endType !== "DATE"}
              className={styles.crDateInput}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className={styles.crRadioRow}>
            <input
              type="radio"
              checked={endType === "COUNT"}
              onChange={() => setEndType("COUNT")}
            />
            <span>After</span>
            <input
              type="number"
              min="1"
              value={count}
              disabled={endType !== "COUNT"}
              onChange={(e) => setCount(e.target.value)}
              className={styles.crNumberInputSmall}
            />
            <span>occurrences</span>
          </div>
        </div>
      </div>

      <div className={styles.crActions}>
        <CustomButton onClick={closePopup} className="default">
          Cancel
        </CustomButton>
        <CustomButton
          onClick={handleSave}
          className="default"
          style={{ color: "var(--main-cyan)" }}
        >
          Done
        </CustomButton>
      </div>
    </div>
  );
}

function TimeListPopup({ baseDate, onPick, is12Format, closePopup }) {
  const listRef = useRef(null);
  const itemRefs = useRef([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const timeSlots = useMemo(() => {
    const slots = [];
    const startOfDay = new Date(baseDate);
    startOfDay.setHours(0, 0, 0, 0);

    for (let i = 0; i < 96; i++) {
      const d = new Date(startOfDay);
      d.setMinutes(i * 15);
      slots.push(d);
    }
    return slots;
  }, [baseDate]);

  useEffect(() => {
    if (!listRef.current) return;

    const currentMinutes = baseDate.getHours() * 60 + baseDate.getMinutes();
    let closestIndex = Math.round(currentMinutes / 15);
    if (closestIndex >= 96) closestIndex = 0;

    setHighlightedIndex(closestIndex);
    if (itemRefs.current[closestIndex])
      itemRefs.current[closestIndex].scrollIntoView({
        block: "center",
        behavior: "auto",
      });

    listRef.current.focus();
  }, []);

  const scrollToItem = (index) => {
    if (itemRefs.current[index])
      itemRefs.current[index].scrollIntoView({
        block: "center",
        behavior: "auto",
      });
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = (highlightedIndex + 1) % timeSlots.length;
      setHighlightedIndex(next);
      scrollToItem(next);
      onPick(timeSlots[next]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = (highlightedIndex - 1 + timeSlots.length) % timeSlots.length;
      setHighlightedIndex(next);
      scrollToItem(next);
      onPick(timeSlots[next]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex !== -1) {
        onPick(timeSlots[highlightedIndex]);
        if (closePopup) closePopup();
      }
    }
  };

  const handleItemClick = (date) => {
    onPick(date);
    if (closePopup) closePopup();
  };

  const formatTime = (date) =>
    is12Format
      ? date
          .toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })
          .toLowerCase()
      : date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });

  return (
    <div
      className={`${styles.timeListPopup} default-scrollbar`}
      ref={listRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      {timeSlots.map((date, i) => (
        <button
          key={i}
          ref={(el) => (itemRefs.current[i] = el)}
          className={`${styles.timeBtn} ${
            date.getHours() === baseDate.getHours() &&
            date.getMinutes() === baseDate.getMinutes()
              ? styles.selectedTime
              : ""
          } ${highlightedIndex === i ? styles.highlightedTime : ""}`}
          onClick={() => handleItemClick(date)}
          onMouseEnter={() => setHighlightedIndex(i)}
        >
          {formatTime(date)}
        </button>
      ))}
    </div>
  );
}

function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export default AddEditNewEvent;
