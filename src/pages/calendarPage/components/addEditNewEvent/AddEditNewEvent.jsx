import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from "react";

import styles from "./AddEditNewEvent.module.css";

import { DateTime } from "luxon";
import { AnimatePresence, motion } from "framer-motion";

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

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "../../../../../firebase";

import { usePopup } from "../../../../contexts/PopupContext";
import { useData } from "../../../../contexts/AuthContext";
import { useTime } from "../../../../contexts/TimeContext";

import CustomButton from "../../../../components/button/Button";
import EmojiPopup from "../../../../components/emojiPopup/EmojiPopup";
import PickDay from "../../../../components/pickDay/pickDay";
import CheckBox from "../../../../components/checkBox/checkBox";
import ConfirmPopup from "../../../../components/confirmPopup/confirmPopup";
import RecurrenceUpdatePopup from "../RecurrenceUpdatePopup/RecurrenceUpdatePopup";
import CheckboxGroup from "../../../../components/checkboxGroup/CheckboxGroup";
import Loading from "../../../../components/loading/Loading";

import { formatDurationFromMinutes } from "../../../../utils/formatDurationFromMinutes";
import { getUserZone } from "../../../../utils/getUserZone";
import { useEventSheet } from "../../../../contexts/PopupContext";

import {
  COLOR_OPTIONS,
  DEFAULT_EVENT_COLOR,
  DEFAULT_EVENT_VISIBILITY,
  DEFAULT_EVENT_AVAILABILITY,
  DEFAULT_EVENT_NOTIFICATION,
  DEFAULT_EVENT_RECURRENCE,
  EVENT_VISIBILITY,
  EVENT_AVAILABILITY,
  EVENT_AVAILABILITY_OPTIONS,
  EVENT_NOTIFICATION_OPTIONS,
  RECURRENCE_TYPE,
  RECURRENCE_END_TYPE,
  RECURRENCE_UPDATE_MODE,
  DEFAULT_RECURRENCE_INTERVAL,
  DEFAULT_RECURRENCE_COUNT,
  WEEKDAY_RECURRENCE_DAYS,
  EVENT_EDITOR_TYPE,
  EVENT_EDITOR_TYPES,
  EVENT_SAVE_STATUS,
  EVENT_SUCCESS_CLOSE_DELAY,
  EVENT_ERROR_RESET_DELAY,
  EVENT_TIME_SLOT_MINUTES,
  EVENT_TIME_SLOTS_PER_DAY,
} from "../../../../constants/constants";
import { useUserSettings } from "../../../../contexts/UserSettingsContext";

const AddEditNewEvent = forwardRef(
  ({ eventId: incomingEventId, onClose }, ref) => {
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

    const {
      openEventSubSheet,
      closeEventSubSheet,
      reopenEventSheet,
      requestCloseEventSheet,
    } = useEventSheet();

    const isDraft = newEvent && incomingEventId === newEvent.id;
    const eventId = isDraft ? null : incomingEventId;

    const { addEvent, updateEvent } = useData();
    const { openPopup, closePopup: closeContextPopup } = usePopup();
    const { timeFormat } = useUserSettings();
    const is24Format = timeFormat === "24h";

    const userZone = getUserZone(timeZoneOffset);

    const successTimeoutRef = useRef(null);
    const errorTimeoutRef = useRef(null);

    const [friends, setFriends] = useState([]);

    useEffect(() => {
      let isMounted = true;
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

          if (friendIds.length === 0) {
            if (isMounted) setFriends([]);
            return;
          }

          const friendPromises = friendIds.map((fid) =>
            getDoc(doc(db, "users", fid)),
          );
          const friendSnaps = await Promise.all(friendPromises);

          const friendsData = friendSnaps
            .filter((fSnap) => fSnap.exists())
            .map((fSnap) => ({ id: fSnap.id, ...fSnap.data() }));

          if (isMounted) setFriends(friendsData);
        } catch (err) {
          console.error("Failed to load friends", err);
        }
      }
      loadFriends();

      return () => {
        isMounted = false;
      };
    }, [currentUser]);

    useEffect(() => {
      return () => {
        if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
        if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      };
    }, []);

    const sourceEvent = useMemo(() => {
      if (!eventId) return newEvent;
      const exactMatch = loadedEvents.find((ev) => ev.id === eventId);
      if (exactMatch) return exactMatch;

      if (typeof eventId === "string" && eventId.includes("_")) {
        const lastUnderscoreIndex = eventId.lastIndexOf("_");
        const realId = eventId.substring(0, lastUnderscoreIndex);
        const timestamp = eventId.substring(lastUnderscoreIndex + 1);

        const parent = loadedEvents.find((ev) => ev.id === realId);
        if (parent) {
          const instanceStartMs = parseInt(timestamp, 10);
          if (!isNaN(instanceStartMs)) {
            const parentStart = DateTime.fromISO(
              parent.timeRange?.start || parent.start,
              { zone: "utc" },
            );
            const parentEnd = DateTime.fromISO(
              parent.timeRange?.end || parent.end,
              { zone: "utc" },
            );
            const duration = parentEnd.diff(parentStart);

            const instanceStart = DateTime.fromMillis(instanceStartMs).toUTC();
            const instanceEnd = instanceStart.plus(duration);

            return {
              ...parent,
              id: eventId,
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

    const [isFullDay, setIsFullDay] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const hasChangedTabRef = useRef(false);
    const [eventType, setEventType] = useState(EVENT_EDITOR_TYPES[0]);
    const [tabDirection, setTabDirection] = useState(0);
    const eventTypeRef = useRef(EVENT_EDITOR_TYPES[0]);
    const activeTabPanelRef = useRef(null);
    const resizeObserverRef = useRef(null);
    const prevTimeRange = useRef(null);
    const [activeTabPanelNode, setActiveTabPanelNode] = useState(null);
    const [measuredTabHeight, setMeasuredTabHeight] = useState(null);

    eventTypeRef.current = eventType;

    const [loadingStatus, setLoadingStatus] = useState(EVENT_SAVE_STATUS.IDLE);

    const [eventData, setEventData] = useState({
      title: "",
      description: "",
      timeRange: { start: "", end: "" },
      color: DEFAULT_EVENT_COLOR,
      visibility: DEFAULT_EVENT_VISIBILITY,
      availability: DEFAULT_EVENT_AVAILABILITY,
      notification: DEFAULT_EVENT_NOTIFICATION,
      emoji: "",
      recurrence: { ...DEFAULT_EVENT_RECURRENCE },
      group_id: null,
      invitedIds: [],
      invitedFriendsFull: [],
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
        if (
          !originalEventRef.current ||
          originalEventRef.current.id !== sourceEvent.id
        ) {
          originalEventRef.current = structuredClone(sourceEvent);
        }

        const safeStart =
          sourceEvent.timeRange?.start || sourceEvent.start || "";
        const safeEnd = sourceEvent.timeRange?.end || sourceEvent.end || "";

        setEventData({
          title: sourceEvent.title || "",
          description: sourceEvent.description || "",
          timeRange: {
            start: safeStart,
            end: safeEnd,
          },
          color: sourceEvent.color || DEFAULT_EVENT_COLOR,
          visibility: sourceEvent.visibility || DEFAULT_EVENT_VISIBILITY,
          availability: sourceEvent.availability || DEFAULT_EVENT_AVAILABILITY,
          notification: sourceEvent.notification || DEFAULT_EVENT_NOTIFICATION,
          emoji: sourceEvent.emoji || "",
          recurrence: sourceEvent.recurrence || { ...DEFAULT_EVENT_RECURRENCE },
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
    }, [sourceEvent, eventId, setLoadedEvents]);

    const hasChanges = useMemo(() => {
      if (!eventId) return true;
      if (!originalEventRef.current) return false;

      const current = { ...eventData, isFullDay };
      const original = originalEventRef.current;

      return (
        current.title !== (original.title || "") ||
        current.description !== (original.description || "") ||
        current.color !== (original.color || DEFAULT_EVENT_COLOR) ||
        current.emoji !== (original.emoji || "") ||
        current.visibility !==
          (original.visibility || DEFAULT_EVENT_VISIBILITY) ||
        current.availability !==
          (original.availability || DEFAULT_EVENT_AVAILABILITY) ||
        current.notification !==
          (original.notification || DEFAULT_EVENT_NOTIFICATION) ||
        current.timeRange.start !==
          (original.timeRange?.start || original.start) ||
        current.timeRange.end !== (original.timeRange?.end || original.end) ||
        current.isFullDay !== (original.isFullDay || false) ||
        JSON.stringify(current.invitedIds) !==
          JSON.stringify(original.invitedIds || []) ||
        JSON.stringify(current.recurrence) !==
          JSON.stringify(original.recurrence || { ...DEFAULT_EVENT_RECURRENCE })
      );
    }, [eventData, isFullDay, eventId]);

    const handleRevert = useCallback(() => {
      if (originalEventRef.current) {
        setEventData({ ...originalEventRef.current });
        setIsFullDay(originalEventRef.current.isFullDay || false);
      }
      if (eventId) {
        setLoadedEvents((prev) =>
          prev.filter((ev) => ev.id !== shadowIdRef.current),
        );
        const isRecurring =
          originalEventRef.current.recurrence?.type !== RECURRENCE_TYPE.NONE;
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
    }, [eventId, setEventData, setIsFullDay, setLoadedEvents, setNewEvent]);

    useImperativeHandle(
      ref,
      () => ({
        hasUnsavedChanges: () =>
          loadingStatus === EVENT_SAVE_STATUS.IDLE && hasChanges,

        requestClose: ({ onCancel } = {}) => {
          openPopup(
            "centered",
            () => (
              <ConfirmPopup
                message="You have unsaved changes. Are you sure you want to discard them?"
                onYes={() => {
                  handleRevert();
                  closeContextPopup("unsaved-changes-popup", true);
                  if (onClose) {
                    onClose();
                  }
                }}
                onNo={() => {
                  closeContextPopup("unsaved-changes-popup", true);
                  onCancel?.();
                }}
              />
            ),
            document.body,
            "center",
            null,
            null,
            "unsaved-changes-popup",
          );
        },

        discardChanges: () => {
          handleRevert();
        },
      }),
      [
        loadingStatus,
        hasChanges,
        openPopup,
        closeContextPopup,
        handleRevert,
        onClose,
        isMobile,
        reopenEventSheet,
      ],
    );

    const updateGlobalState = (updates, overrideIsFullDay = null) => {
      setEventData((prevEventData) => {
        const newData = { ...prevEventData, ...updates };
        const activeIsFullDay =
          overrideIsFullDay !== null ? overrideIsFullDay : isFullDayRef.current;

        if (!eventId) {
          setNewEvent((prev) =>
            prev ? { ...prev, ...newData, isFullDay: activeIsFullDay } : prev,
          );
        } else {
          const isRecurring =
            originalEventRef.current?.recurrence?.type !== RECURRENCE_TYPE.NONE;
          if (!isRecurring) {
            setLoadedEvents((prev) =>
              prev.map((ev) =>
                ev.id === eventId
                  ? { ...ev, ...newData, isFullDay: activeIsFullDay }
                  : ev,
              ),
            );
          } else {
            setLoadedEvents((prev) => {
              const filtered = prev.filter(
                (ev) => ev.id !== shadowIdRef.current,
              );
              const shadowEvent = {
                ...originalEventRef.current,
                ...newData,
                id: shadowIdRef.current,
                isFullDay: activeIsFullDay,
                recurrence: { type: RECURRENCE_TYPE.NONE },
              };
              return [...filtered, shadowEvent];
            });
          }
        }
        return newData;
      });
    };

    const openEditorPopup = useCallback(
      ({
        desktopType = "contextual",
        content,
        target = null,
        position = "bottomRight",

        snapPoints = [0, 1],
        initialSnap = 1,
      }) => {
        if (isMobile) {
          openEventSubSheet({
            content,
            snapPoints,
            initialSnap,
          });

          return;
        }

        openPopup(desktopType, () => content, target, position);
      },
      [isMobile, openEventSubSheet, openPopup],
    );

    const closeEditorPopup = useCallback(() => {
      if (isMobile) {
        closeEventSubSheet();

        return;
      }

      closeContextPopup();
    }, [isMobile, closeEventSubSheet, closeContextPopup]);

    async function handleSave() {
      if (eventId && !hasChanges) return;
      if (loadingStatus !== EVENT_SAVE_STATUS.IDLE) {
        return;
      }
      if (!eventId) {
        await executeAdd();
        return;
      }

      const parentEvent = loadedEvents.find(
        (ev) =>
          originalEventRef.current.id === ev.id ||
          originalEventRef.current.id.startsWith(`${ev.id}_`),
      );

      if (!parentEvent) return;

      const isRecurring =
        parentEvent.recurrence && parentEvent.recurrence.type !== "NONE";

      if (!isRecurring) {
        setLoadingStatus(EVENT_SAVE_STATUS.ENCRYPTING);
        const onProgress = (s) => setLoadingStatus(s);

        try {
          setLoadedEvents((prev) =>
            prev.map((ev) =>
              ev.id === parentEvent.id
                ? { ...ev, ...eventData, isFullDay }
                : ev,
            ),
          );

          const updatePayload = {
            id: parentEvent.id,
            ...eventData,
            isFullDay,
            timeRange: eventData.timeRange,
          };

          const result = await updateEvent(updatePayload, onProgress);
          if (result.success) finishSuccess();
          else throw new Error("Update failed");
        } catch (e) {
          handleError(e);
          handleRevert();
        }
        return;
      }

      const oldStart = DateTime.fromISO(
        originalEventRef.current.timeRange?.start ||
          originalEventRef.current.start,
      ).toMillis();
      const newStart = DateTime.fromISO(eventData.timeRange.start).toMillis();
      const oldEnd = DateTime.fromISO(
        originalEventRef.current.timeRange?.end || originalEventRef.current.end,
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

      let allowedModes = [
        RECURRENCE_UPDATE_MODE.THIS_EVENT,
        RECURRENCE_UPDATE_MODE.THIS_AND_FOLLOWING,
      ];

      if (oldDateStr === newDateStr) {
        allowedModes.push(RECURRENCE_UPDATE_MODE.ALL_EVENTS);
      }

      const contextCurrentEvent = {
        ...originalEventRef.current,
        originalTimeRange: eventData.timeRange,
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
      setLoadingStatus(EVENT_SAVE_STATUS.ENCRYPTING);
      const onProgress = (s) => setLoadingStatus(s);

      try {
        const payload = { ...eventData, isFullDay };

        const result = await addEvent(payload, onProgress);

        if (result.success) {
          const created = {
            ...result.event,
            ...payload,
            timeRange: payload.timeRange,
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
      setLoadingStatus(EVENT_SAVE_STATUS.SUCCESS);
      successTimeoutRef.current = setTimeout(() => {
        if (onClose) onClose();
        else closeContextPopup();
      }, EVENT_SUCCESS_CLOSE_DELAY);
    }
    function handleError(e) {
      console.error(e);
      setLoadingStatus(EVENT_SAVE_STATUS.ERROR);
      errorTimeoutRef.current = setTimeout(
        () => setLoadingStatus(EVENT_SAVE_STATUS.IDLE),
        EVENT_ERROR_RESET_DELAY,
      );
    }
    const handleFullDayChange = () => {
      const newIsFullDay = !isFullDay;
      setIsFullDay(newIsFullDay);

      const currentStartLocal = DateTime.fromISO(eventData.timeRange.start, {
        zone: "utc",
      }).setZone(userZone);
      const currentEndLocal = DateTime.fromISO(eventData.timeRange.end, {
        zone: "utc",
      }).setZone(userZone);

      if (newIsFullDay) {
        prevTimeRange.current = { ...eventData.timeRange };

        let newStart = currentStartLocal.startOf("day");
        let newEnd = currentEndLocal.startOf("day");

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
          const prevS = DateTime.fromISO(prevTimeRange.current.start, {
            zone: "utc",
          }).setZone(userZone);
          const prevE = DateTime.fromISO(prevTimeRange.current.end, {
            zone: "utc",
          }).setZone(userZone);

          newStart = currentStartLocal.set({
            hour: prevS.hour,
            minute: prevS.minute,
            second: 0,
            millisecond: 0,
          });

          const duration = prevE.diff(prevS);
          newEnd = newStart.plus(duration);
        } else {
          const now = DateTime.now().setZone(userZone);

          newStart = currentStartLocal.set({
            hour: now.hour,
            minute: now.minute,
            second: 0,
            millisecond: 0,
          });

          newEnd = newStart.plus({ hours: 1 });
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
      }
    };
    const handleDayPick = (e) => {
      openEditorPopup({
        desktopType: "contextual",

        content: (
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

              const newStartIso = newStart.toUTC().toISO({
                suppressMilliseconds: true,
              });

              const newEndIso = newEnd.toUTC().toISO({
                suppressMilliseconds: true,
              });

              const newIsFullDay = isRangeFullDay(newStartIso, newEndIso);

              setIsFullDay(newIsFullDay);

              updateGlobalState(
                {
                  timeRange: {
                    start: newStartIso,
                    end: newEndIso,
                  },
                },
                newIsFullDay,
              );

              if (isMobile) {
                closeEventSubSheet();
              }
            }}
          />
        ),

        target: e.currentTarget,
        position: "bottomLeft",
      });
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

    const handleTitleChange = (e) =>
      updateGlobalState({ title: e.target.value });
    const handleEmojiChange = (emoji) => updateGlobalState({ emoji });
    const handleColorChange = (color) => {
      updateGlobalState({ color });
      closeEditorPopup();
    };
    const handleAvailabilityChange = (availability) => {
      updateGlobalState({ availability });
      closeEditorPopup();
    };
    const handleNotificationChange = (minutes) => {
      updateGlobalState({ notification: minutes });
      closeEditorPopup();
    };
    const handleRecurrenceChange = (recurrenceRule) => {
      updateGlobalState({ recurrence: recurrenceRule });
      closeEditorPopup();
    };
    const handleDescriptionSave = (newDescription) => {
      updateGlobalState({ description: newDescription });
    };
    const handleVisibiltyClick = (e) => {
      openEditorPopup({
        desktopType: "contextual",

        content: (
          <VisibilityPopup
            eventData={eventData}
            updateGlobalState={updateGlobalState}
            friends={friends}
            openCenteredPopup={openPopup}
            closeCenteredPopup={() =>
              closeContextPopup("specific-friends-popup", true)
            }
            closeParent={closeEditorPopup}
          />
        ),

        target: e.currentTarget,
        position: "bottomRight",
      });
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

    const handleDescriptionClick = (e) => {
      openEditorPopup({
        desktopType: "centered",

        content: (
          <DescriptionPopup
            initialDescription={eventData.description}
            onSave={handleDescriptionSave}
            closePopup={closeEditorPopup}
          />
        ),

        target: e.currentTarget,
        position: "bottomLeft",
      });
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
      openEditorPopup({
        desktopType: "contextual",

        content: (
          <div className={`${styles.colorPickerPopup} ${styles.addEventPopup}`}>
            {COLOR_OPTIONS.map((color) => (
              <div
                key={color}
                className={styles.colorOptionWrapper}
                onClick={() => handleColorChange(color)}
              >
                <div
                  className={styles.colorHover}
                  style={{ backgroundColor: color }}
                />

                <span
                  className={styles.colorDot}
                  style={{ backgroundColor: color }}
                />
              </div>
            ))}
          </div>
        ),

        target: e.currentTarget,
        position: "bottomRight",

        snapPoints: [0, 1],
        initialSnap: 1,
      });
    };
    const handleEmojiClick = (e) => {
      openEditorPopup({
        desktopType: "contextual",
        content: <EmojiPopup handleEmojiChange={handleEmojiChange} />,
        target: e.currentTarget,
        position: "bottomRight",
      });
    };

    const handleAvailabilityClick = (e) => {
      openEditorPopup({
        desktopType: "contextual",

        content: (
          <div
            className={`${styles.availabilityPopup} ${styles.optionsPopup} ${styles.addEventPopup}`}
          >
            {EVENT_AVAILABILITY_OPTIONS.map((av) => (
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

        target: e.currentTarget,
        position: "bottomRight",

        snapPoints: [0, 1],
        initialSnap: 1,
      });
    };
    const handleNotificationClick = (e) => {
      openEditorPopup({
        desktopType: "contextual",
        content: (
          <div
            className={`${styles.notificationPopup} ${styles.optionsPopup} ${styles.addEventPopup}`}
          >
            {EVENT_NOTIFICATION_OPTIONS.map((notification) => (
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
        target: e.currentTarget,
        position: "bottomRight",

        snapPoints: [0, 1],
        initialSnap: 1,
      });
    };

    const handleEventTypeChange = (nextType) => {
      if (nextType === eventType) return;

      const currentIndex = EVENT_EDITOR_TYPES.indexOf(eventType);
      const nextIndex = EVENT_EDITOR_TYPES.indexOf(nextType);

      if (currentIndex === -1 || nextIndex === -1) return;

      hasChangedTabRef.current = true;

      setTabDirection(nextIndex > currentIndex ? 1 : -1);
      setEventType(nextType);
    };

    const tabVariants = {
      enter: (direction) => ({
        opacity: 0,
        x: direction > 0 ? 35 : -35,
      }),

      center: {
        opacity: 1,
        x: 0,
      },

      exit: (direction) => ({
        opacity: 0,
        x: direction > 0 ? -35 : 35,
      }),
    };

    const tabTransition = {
      duration: 0.22,
      ease: "easeInOut",
    };

    const tabPanelStyle = {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
    };
    const TabPanelMotion = motion.div;

    const setActiveTabPanelRef = useCallback(
      (type) => (node) => {
        if (type !== eventTypeRef.current) return;

        activeTabPanelRef.current = node;
        setActiveTabPanelNode(node);
      },
      [],
    );

    useLayoutEffect(() => {
      const node = activeTabPanelNode;

      if (!node) return undefined;

      const measureHeight = () => {
        const nextHeight = Math.ceil(node.getBoundingClientRect().height);

        setMeasuredTabHeight((currentHeight) =>
          currentHeight === nextHeight ? currentHeight : nextHeight,
        );
      };

      measureHeight();

      if (typeof ResizeObserver === "undefined") return undefined;

      resizeObserverRef.current?.disconnect();

      const observer = new ResizeObserver(() => {
        measureHeight();
      });

      resizeObserverRef.current = observer;
      observer.observe(node);

      return () => {
        observer.disconnect();

        if (resizeObserverRef.current === observer) {
          resizeObserverRef.current = null;
        }
      };
    }, [activeTabPanelNode]);

    const renderEventForm = (panelRef) => (
      <TabPanelMotion key="Event" ref={panelRef} style={tabPanelStyle}>
        <TabPanelMotion
          custom={tabDirection}
          variants={tabVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={tabTransition}
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
        </TabPanelMotion>
      </TabPanelMotion>
    );

    const renderPlaceholderForm = (name, panelRef) => (
      <TabPanelMotion key={name} ref={panelRef} style={tabPanelStyle}>
        <TabPanelMotion
          custom={tabDirection}
          variants={tabVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={tabTransition}
          className={styles.placeholderForm}
        >
          <h2>{name}</h2>
          <p>Coming Soon</p>
        </TabPanelMotion>
      </TabPanelMotion>
    );

    return (
      <div className={styles.addEditEvent}>
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
        {isMobile && (
          <div className={styles.eventType}>
            {EVENT_EDITOR_TYPES.map((type) => (
              <CustomButton
                key={type}
                className={`default ${styles.tabButton} ${eventType === type ? styles.activeTab : ""}`}
                onClick={() => handleEventTypeChange(type)}
                ClickEffect={"scale"}
              >
                <p className={styles.tabText}>{type}</p>
              </CustomButton>
            ))}
          </div>
        )}
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
            {!isMobile && (
              <div className={styles.eventType}>
                {EVENT_EDITOR_TYPES.map((type) => (
                  <CustomButton
                    key={type}
                    className={`default ${styles.tabButton} ${eventType === type ? styles.activeTab : ""}`}
                    onClick={() => handleEventTypeChange(type)}
                    ClickEffect={"scale"}
                  >
                    <p className={styles.tabText}>{type}</p>
                  </CustomButton>
                ))}
              </div>
            )}
          </div>
          <motion.div
            initial={false}
            animate={{
              height: measuredTabHeight ?? "auto",
            }}
            transition={
              hasChangedTabRef.current
                ? {
                    height: {
                      duration: 0.3,
                      ease: "easeInOut",
                    },
                  }
                : {
                    duration: 0,
                  }
            }
            style={{
              position: "relative",
              overflow: "hidden",
            }}
          >
            <AnimatePresence mode="sync" initial={false} custom={tabDirection}>
              {eventType === EVENT_EDITOR_TYPE.EVENT
                ? renderEventForm(setActiveTabPanelRef(EVENT_EDITOR_TYPE.EVENT))
                : renderPlaceholderForm(
                    eventType,
                    setActiveTabPanelRef(eventType),
                  )}
            </AnimatePresence>
          </motion.div>
        </div>
        <div className={styles.bottomSubmit}>
          <div className={styles.submitContent}>
            {isMobile && (
              <>
                <div className={styles.mobileOnly}>
                  <CustomButton
                    ClickEffect={"scale"}
                    className="default"
                    type="submit"
                    onClick={() => requestCloseEventSheet()}
                  >
                    {"Close"}
                  </CustomButton>
                </div>
                <span></span>
              </>
            )}
            <div className={styles.submit}>
              <CustomButton
                ClickEffect={"scale"}
                className="default"
                type="submit"
                onClick={handleSave}
                style={{
                  opacity: eventId && !hasChanges ? 0.5 : 1,
                  cursor: eventId && !hasChanges ? "not-allowed" : "pointer",
                  pointerEvents: eventId && !hasChanges ? "none" : "auto",
                }}
              >
                {eventId ? "Save" : "Add"}
              </CustomButton>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

function TimeListPopup({ baseDate, onPick, is12Format, closePopup }) {
  const listRef = useRef(null);
  const itemRefs = useRef([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const timeSlots = useMemo(() => {
    const slots = [];
    const startOfDay = new Date(baseDate);
    startOfDay.setHours(0, 0, 0, 0);

    for (let i = 0; i < EVENT_TIME_SLOTS_PER_DAY; i++) {
      const d = new Date(startOfDay);

      d.setMinutes(i * EVENT_TIME_SLOT_MINUTES);

      slots.push(d);
    }
    return slots;
  }, [baseDate]);

  useEffect(() => {
    if (!listRef.current) return;

    const currentMinutes = baseDate.getHours() * 60 + baseDate.getMinutes();
    let closestIndex = Math.round(currentMinutes / EVENT_TIME_SLOT_MINUTES);

    if (closestIndex >= EVENT_TIME_SLOTS_PER_DAY) {
      closestIndex = 0;
    }

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

function VisibilityPopup({
  eventData,
  updateGlobalState,
  friends,
  openCenteredPopup,
  closeCenteredPopup,
  closeParent,
}) {
  const handleSelect = (val) => {
    updateGlobalState({
      visibility: val,
    });

    closeParent();
  };

  const handleSpecificClick = () => {
    openCenteredPopup(
      "centered",
      () => (
        <SpecificFriendsPopup
          friends={friends}
          eventData={eventData}
          updateGlobalState={updateGlobalState}
          closePopup={closeCenteredPopup}
        />
      ),
      document.body,
      "center",
      null,
      null,
      "specific-friends-popup",
    );
  };

  return (
    <div
      className={`${styles.visibilityPopup} ${styles.optionsPopup} ${styles.addEventPopup}`}
    >
      <CustomButton
        ClickEffect="scale"
        className={`default ${
          eventData.visibility === "visible" ? styles.activeVis : ""
        }`}
        onClick={() => handleSelect("visible")}
      >
        <p>Visible for friends</p>
      </CustomButton>

      <CustomButton
        ClickEffect="scale"
        className={`default ${
          eventData.visibility === "private" ? styles.activeVis : ""
        }`}
        onClick={() => handleSelect("private")}
      >
        <p>Private</p>
      </CustomButton>

      <div className={styles.divider} />

      <div className={styles.onlyShareWith} onClick={handleSpecificClick}>
        <p>Only share with...</p>

        {eventData.invitedIds?.length > 0 && (
          <div className={styles.avatarsRow}>
            {eventData.invitedIds.slice(0, 3).map((id) => {
              const friend = friends.find((item) => item.id === id);

              return friend ? (
                <img
                  key={id}
                  src={friend.pfpUrl || "defaultAvatar"}
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
    icon: f.pfpUrl || "defaultAvatar",
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

function DescriptionPopup({ initialDescription, onSave, closePopup }) {
  const [text, setText] = useState(initialDescription || "");

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

function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
export default AddEditNewEvent;
