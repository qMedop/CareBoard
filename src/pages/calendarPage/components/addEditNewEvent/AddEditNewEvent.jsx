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

import { DateTime } from "luxon";
import { AnimatePresence, motion } from "framer-motion";

import styles from "./AddEditNewEvent.module.css";

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
import { useEventSheet } from "../../../../contexts/PopupContext";
import { useUserSettings } from "../../../../contexts/UserSettingsContext";

import CustomButton from "../../../../components/button/Button";
import EmojiPopup from "../../../../components/emojiPopup/EmojiPopup";
import PickDay from "../../../../components/pickDay/pickDay";
import CheckBox from "../../../../components/checkBox/checkBox";
import ConfirmPopup from "../../../../components/confirmPopup/confirmPopup";
import RecurrenceUpdatePopup from "../RecurrenceUpdatePopup/RecurrenceUpdatePopup";
import Loading from "../../../../components/loading/Loading";

import { formatDurationFromMinutes } from "../../../../utils/formatDurationFromMinutes";
import { getUserZone } from "../../../../utils/getUserZone";
import { validateNewEvent } from "../../../../utils/validation/eventValidation";

import {
  DEFAULT_EVENT_COLOR,
  DEFAULT_EVENT_VISIBILITY,
  DEFAULT_EVENT_AVAILABILITY,
  DEFAULT_EVENT_RECURRENCE,
  RECURRENCE_TYPE,
  RECURRENCE_UPDATE_MODE,
  EVENT_EDITOR_TYPE,
  EVENT_EDITOR_TYPES,
  EVENT_SAVE_STATUS,
  EVENT_SUCCESS_CLOSE_DELAY,
  EVENT_ERROR_RESET_DELAY,
} from "../../../../constants/constants";

import Colors from "./components/colors/Colors";
import VisibilityPopup from "./components/visibility/Visibility";
import Availability from "./components/availability/Availability";
import Notifications from "./components/notifications/Notifications";
import TimeListPopup from "./components/timeList/TimeListPopup";
import DescriptionPopup from "./components/description/DescriptionPopup";
import RecurrenceOptionsPopup from "./components/recurrence/RecurrenceOptionsPopup";

const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  shareTitle: false,
  notifyFriends: true,
});

function normalizeNotificationSelection(notification) {
  if (Array.isArray(notification)) {
    return notification.map(Number).filter((value) => Number.isFinite(value));
  }

  if (notification === 0 || notification === "0" || notification == null) {
    return [];
  }

  const parsed = Number(notification);

  return Number.isFinite(parsed) ? [parsed] : [];
}
function createReminderTimestamps(eventStart, notification) {
  const start = DateTime.fromISO(eventStart, {
    zone: "utc",
  });

  if (!start.isValid) {
    return [];
  }

  return normalizeNotificationSelection(notification)
    .map((minutesBefore) =>
      start
        .minus({
          minutes: minutesBefore,
        })
        .toUTC()
        .toISO(),
    )
    .sort((a, b) => Date.parse(a) - Date.parse(b));
}
function formatNotificationSelection(notification) {
  const normalized = normalizeNotificationSelection(notification);

  if (normalized.length === 0) {
    return "No notification";
  }

  return normalized.map((value) => formatDurationFromMinutes(value)).join(", ");
}

const AddEditNewEvent = forwardRef(
  ({ eventId: incomingEventId, onClose }, ref) => {
    const { currentUser, addEvent, updateEvent } = useData();

    const {
      newEvent,
      setNewEvent,
      loadedEvents = [],
      setLoadedEvents,
      safeSetLoadedEvents,
      timeZoneOffset,
      isMobile,
    } = useTime();

    const { openEventSubSheet, closeEventSubSheet, requestCloseEventSheet } =
      useEventSheet();

    const { openPopup, closePopup: closeContextPopup } = usePopup();

    const { timeFormat } = useUserSettings();

    const isDraft = newEvent && incomingEventId === newEvent.id;

    const eventId = isDraft ? null : incomingEventId;
    const is24Format = timeFormat === "24h";
    const userZone = getUserZone(timeZoneOffset);

    const successTimeoutRef = useRef(null);
    const errorTimeoutRef = useRef(null);
    const eventDataRef = useRef(null);
    const isFullDayRef = useRef(false);
    const originalEventRef = useRef(null);
    const shadowIdRef = useRef(`shadow_${Date.now()}`);
    const prevTimeRange = useRef(null);

    const hasChangedTabRef = useRef(false);
    const eventTypeRef = useRef(EVENT_EDITOR_TYPES[0]);
    const activeTabPanelRef = useRef(null);
    const resizeObserverRef = useRef(null);

    const [friends, setFriends] = useState([]);
    const [isFullDay, setIsFullDay] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [eventType, setEventType] = useState(EVENT_EDITOR_TYPES[0]);
    const [tabDirection, setTabDirection] = useState(0);
    const [activeTabPanelNode, setActiveTabPanelNode] = useState(null);
    const [measuredTabHeight, setMeasuredTabHeight] = useState(null);
    const [validationErrors, setValidationErrors] = useState([]);
    const [loadingStatus, setLoadingStatus] = useState(EVENT_SAVE_STATUS.IDLE);

    const [eventData, setEventData] = useState({
      title: "",
      description: "",
      timeRange: {
        start: "",
        end: "",
      },
      color: DEFAULT_EVENT_COLOR,
      visibility: DEFAULT_EVENT_VISIBILITY,
      availability: DEFAULT_EVENT_AVAILABILITY,
      notification: [],
      reminders: [],
      notificationSettings: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
      },
      emoji: "",
      recurrence: {
        ...DEFAULT_EVENT_RECURRENCE,
      },
      group_id: null,
      invitedIds: [],
      invitedFriendsFull: [],
    });

    eventTypeRef.current = eventType;

    // Load friends
    useEffect(() => {
      let isMounted = true;

      async function loadFriends() {
        if (!currentUser?.id) {
          return;
        }

        try {
          const friendshipsQuery = query(
            collection(db, "friendships"),
            where("users", "array-contains", currentUser.id),
            where("status", "==", "accepted"),
          );

          const friendshipsSnapshot = await getDocs(friendshipsQuery);

          const friendIds = friendshipsSnapshot.docs
            .map((friendshipDoc) =>
              friendshipDoc.data().users.find((id) => id !== currentUser.id),
            )
            .filter(Boolean);

          if (friendIds.length === 0) {
            if (isMounted) {
              setFriends([]);
            }

            return;
          }

          const friendSnapshots = await Promise.all(
            friendIds.map((friendId) => getDoc(doc(db, "users", friendId))),
          );

          const friendsData = friendSnapshots
            .filter((friendSnapshot) => friendSnapshot.exists())
            .map((friendSnapshot) => ({
              id: friendSnapshot.id,
              ...friendSnapshot.data(),
            }));

          if (isMounted) {
            setFriends(friendsData);
          }
        } catch (error) {
          console.error("Failed to load friends", error);
        }
      }

      loadFriends();

      return () => {
        isMounted = false;
      };
    }, [currentUser?.id]);

    // Clear timers
    useEffect(() => {
      return () => {
        if (successTimeoutRef.current) {
          clearTimeout(successTimeoutRef.current);
        }

        if (errorTimeoutRef.current) {
          clearTimeout(errorTimeoutRef.current);
        }
      };
    }, []);

    // Find current event
    const sourceEvent = useMemo(() => {
      if (!eventId) {
        return newEvent;
      }

      const exactMatch = loadedEvents.find((event) => event.id === eventId);

      if (exactMatch) {
        return exactMatch;
      }

      if (typeof eventId !== "string" || !eventId.includes("_")) {
        return newEvent;
      }

      const lastUnderscoreIndex = eventId.lastIndexOf("_");

      const realId = eventId.substring(0, lastUnderscoreIndex);

      const timestamp = eventId.substring(lastUnderscoreIndex + 1);

      const parent = loadedEvents.find((event) => event.id === realId);

      if (!parent) {
        return newEvent;
      }

      const instanceStartMs = Number(timestamp);

      if (!Number.isFinite(instanceStartMs)) {
        return newEvent;
      }

      const parentStart = DateTime.fromISO(
        parent.timeRange?.start || parent.start,
        {
          zone: "utc",
        },
      );

      const parentEnd = DateTime.fromISO(parent.timeRange?.end || parent.end, {
        zone: "utc",
      });

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
    }, [eventId, loadedEvents, newEvent]);

    // Keep latest event data
    useEffect(() => {
      eventDataRef.current = eventData;
    }, [eventData]);

    // Keep latest full-day state
    useEffect(() => {
      isFullDayRef.current = isFullDay;
    }, [isFullDay]);

    const safeStart = sourceEvent?.timeRange?.start || sourceEvent?.start || "";
    // Load event into editor
    useEffect(() => {
      if (sourceEvent) {
        if (
          !originalEventRef.current ||
          originalEventRef.current.id !== sourceEvent.id
        ) {
          originalEventRef.current = {
            ...structuredClone(sourceEvent),
            notification: normalizeNotificationSelection(
              sourceEvent.notification,
            ),
            reminders: createReminderTimestamps(
              safeStart,
              sourceEvent.notification,
            ),
            notificationSettings: {
              ...DEFAULT_NOTIFICATION_SETTINGS,
              ...(sourceEvent.notificationSettings || {}),
            },
          };
        }

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

          notification: normalizeNotificationSelection(
            sourceEvent.notification,
          ),

          reminders: createReminderTimestamps(
            safeStart,
            sourceEvent.notification,
          ),

          notificationSettings: {
            ...DEFAULT_NOTIFICATION_SETTINGS,
            ...(sourceEvent.notificationSettings || {}),
          },

          emoji: sourceEvent.emoji || "",

          recurrence: sourceEvent.recurrence || {
            ...DEFAULT_EVENT_RECURRENCE,
          },

          group_id: sourceEvent.group_id ?? null,
          invitedIds: sourceEvent.invitedIds || [],
          invitedFriendsFull: sourceEvent.invitedFriendsFull || [],
        });

        setIsFullDay(Boolean(sourceEvent.isFullDay));
        setValidationErrors([]);
      }

      return () => {
        if (eventId) {
          setLoadedEvents((previousEvents) =>
            previousEvents.filter((event) => event.id !== shadowIdRef.current),
          );
        }
      };
    }, [sourceEvent, eventId, setLoadedEvents]);

    // Check for unsaved changes
    const hasChanges = useMemo(() => {
      if (!eventId) {
        return true;
      }

      if (!originalEventRef.current) {
        return false;
      }

      const current = {
        ...eventData,
        isFullDay,
      };

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
        JSON.stringify(normalizeNotificationSelection(current.notification)) !==
          JSON.stringify(
            normalizeNotificationSelection(original.notification),
          ) ||
        JSON.stringify(current.notificationSettings) !==
          JSON.stringify({
            ...DEFAULT_NOTIFICATION_SETTINGS,
            ...(original.notificationSettings || {}),
          }) ||
        current.timeRange.start !==
          (original.timeRange?.start || original.start) ||
        current.timeRange.end !== (original.timeRange?.end || original.end) ||
        current.isFullDay !== Boolean(original.isFullDay) ||
        JSON.stringify(current.invitedIds) !==
          JSON.stringify(original.invitedIds || []) ||
        JSON.stringify(current.invitedFriendsFull) !==
          JSON.stringify(original.invitedFriendsFull || []) ||
        JSON.stringify(current.recurrence) !==
          JSON.stringify(
            original.recurrence || {
              ...DEFAULT_EVENT_RECURRENCE,
            },
          )
      );
    }, [eventData, isFullDay, eventId]);

    // Revert event changes
    const handleRevert = useCallback(() => {
      if (!originalEventRef.current) {
        return;
      }

      const original = originalEventRef.current;

      setEventData({
        title: original.title || "",
        description: original.description || "",
        timeRange: {
          start: original.timeRange?.start || original.start || "",
          end: original.timeRange?.end || original.end || "",
        },
        color: original.color || DEFAULT_EVENT_COLOR,
        visibility: original.visibility || DEFAULT_EVENT_VISIBILITY,
        availability: original.availability || DEFAULT_EVENT_AVAILABILITY,
        notification: normalizeNotificationSelection(original.notification),
        reminders: createReminderTimestamps(
          original.timeRange?.start || original.start,
          original.notification,
        ),
        notificationSettings: {
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...(original.notificationSettings || {}),
        },
        emoji: original.emoji || "",
        recurrence: original.recurrence || {
          ...DEFAULT_EVENT_RECURRENCE,
        },
        group_id: original.group_id ?? null,
        invitedIds: original.invitedIds || [],
        invitedFriendsFull: original.invitedFriendsFull || [],
      });

      setIsFullDay(Boolean(original.isFullDay));
      setValidationErrors([]);

      if (eventId) {
        setLoadedEvents((previousEvents) =>
          previousEvents.filter((event) => event.id !== shadowIdRef.current),
        );

        const isRecurring = original.recurrence?.type !== RECURRENCE_TYPE.NONE;

        if (!isRecurring) {
          setLoadedEvents((previousEvents) =>
            previousEvents.map((event) =>
              event.id === eventId
                ? {
                    ...event,
                    ...original,
                  }
                : event,
            ),
          );
        }

        return;
      }

      setNewEvent({
        ...original,
      });
    }, [eventId, setLoadedEvents, setNewEvent]);

    // Expose editor controls
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

                  onClose?.();
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

        discardChanges: handleRevert,
      }),
      [
        loadingStatus,
        hasChanges,
        openPopup,
        closeContextPopup,
        handleRevert,
        onClose,
      ],
    );

    // Update editor and optimistic event state
    const updateGlobalState = useCallback(
      (updates, overrideIsFullDay = null) => {
        const updatedFields = new Set(Object.keys(updates));

        setValidationErrors((previousErrors) =>
          previousErrors.filter((error) => {
            const rootField = error.field?.split(".")[0];

            return !updatedFields.has(rootField);
          }),
        );

        setEventData((previousEventData) => {
          const nextEventData = {
            ...previousEventData,
            ...updates,
          };

          // recalculate public reminder timestamps
          if (
            Object.hasOwn(updates, "notification") ||
            Object.hasOwn(updates, "timeRange")
          ) {
            nextEventData.reminders = createReminderTimestamps(
              nextEventData.timeRange.start,
              nextEventData.notification,
            );
          }

          const activeIsFullDay =
            overrideIsFullDay !== null
              ? overrideIsFullDay
              : isFullDayRef.current;

          if (!eventId) {
            setNewEvent((previousEvent) =>
              previousEvent
                ? {
                    ...previousEvent,
                    ...nextEventData,
                    isFullDay: activeIsFullDay,
                  }
                : previousEvent,
            );

            return nextEventData;
          }

          const isRecurring =
            originalEventRef.current?.recurrence?.type !== RECURRENCE_TYPE.NONE;

          if (!isRecurring) {
            setLoadedEvents((previousEvents) =>
              previousEvents.map((event) =>
                event.id === eventId
                  ? {
                      ...event,
                      ...nextEventData,
                      isFullDay: activeIsFullDay,
                    }
                  : event,
              ),
            );

            return nextEventData;
          }

          setLoadedEvents((previousEvents) => {
            const filteredEvents = previousEvents.filter(
              (event) => event.id !== shadowIdRef.current,
            );

            const shadowEvent = {
              ...originalEventRef.current,
              ...nextEventData,
              id: shadowIdRef.current,
              isFullDay: activeIsFullDay,
              recurrence: {
                type: RECURRENCE_TYPE.NONE,
              },
            };

            return [...filteredEvents, shadowEvent];
          });

          return nextEventData;
        });
      },
      [eventId, setLoadedEvents, setNewEvent],
    );

    // Open editor popup
    const openEditorPopup = useCallback(
      ({
        desktopType = "contextual",
        content,
        target = null,
        position = "bottomRight",
      }) => {
        if (isMobile) {
          openEventSubSheet({
            content,
          });

          return;
        }

        openPopup(desktopType, () => content, target, position);
      },
      [isMobile, openEventSubSheet, openPopup],
    );

    // Close editor popup
    const closeEditorPopup = useCallback(() => {
      if (isMobile) {
        closeEventSubSheet();
        return;
      }

      closeContextPopup();
    }, [isMobile, closeEventSubSheet, closeContextPopup]);

    // Build event payload
    const createEventPayload = useCallback(() => {
      const currentEvent = eventDataRef.current;

      const payload = {
        title: currentEvent.title,
        description: currentEvent.description,
        timeRange: currentEvent.timeRange,
        color: currentEvent.color,
        visibility: currentEvent.visibility,
        availability: currentEvent.availability,

        notification: currentEvent.notification,
        reminders: currentEvent.reminders,

        notificationSettings: currentEvent.notificationSettings,

        emoji: currentEvent.emoji,
        recurrence: currentEvent.recurrence,
        invitedIds: currentEvent.invitedIds,
        invitedFriendsFull: currentEvent.invitedFriendsFull,

        isFullDay: isFullDayRef.current,
      };

      if (currentEvent.group_id) {
        payload.group_id = currentEvent.group_id;
      }

      return payload;
    }, []);

    // Validate event before saving
    const validateEventForSave = useCallback(() => {
      console.log(createEventPayload());
      const validation = validateNewEvent(createEventPayload());

      if (!validation.success) {
        setValidationErrors(validation.errors || []);

        console.error("EVENT_VALIDATION_FAILED", validation.errors);

        return null;
      }

      setValidationErrors([]);

      return validation.value;
    }, [createEventPayload]);

    // Save event
    async function handleSave() {
      if (eventId && !hasChanges) {
        return;
      }

      if (loadingStatus !== EVENT_SAVE_STATUS.IDLE) {
        return;
      }

      const validatedEvent = validateEventForSave();

      if (!validatedEvent) {
        return;
      }

      if (!eventId) {
        await executeAdd(validatedEvent);
        return;
      }

      const parentEvent = loadedEvents.find(
        (event) =>
          originalEventRef.current.id === event.id ||
          originalEventRef.current.id.startsWith(`${event.id}_`),
      );

      if (!parentEvent) {
        return;
      }

      const isRecurring = parentEvent.recurrence?.type !== RECURRENCE_TYPE.NONE;

      if (!isRecurring) {
        await executeUpdate(parentEvent, validatedEvent);

        return;
      }

      openRecurringUpdatePopup(parentEvent, validatedEvent);
    }

    // Add event
    async function executeAdd(validatedEvent) {
      setLoadingStatus(EVENT_SAVE_STATUS.ENCRYPTING);

      const onProgress = (status) => {
        setLoadingStatus(status);
      };

      try {
        const result = await addEvent(validatedEvent, onProgress);

        if (!result.success) {
          throw new Error(result.error || "Failed to create event");
        }

        const createdEvent = {
          ...result.event,
          ...validatedEvent,
          timeRange: validatedEvent.timeRange,
        };

        setNewEvent(null);

        safeSetLoadedEvents((previousEvents) => [
          ...previousEvents,
          createdEvent,
        ]);

        finishSuccess();
      } catch (error) {
        handleError(error);
      }
    }

    // Update event
    async function executeUpdate(parentEvent, validatedEvent) {
      setLoadingStatus(EVENT_SAVE_STATUS.ENCRYPTING);

      const onProgress = (status) => {
        setLoadingStatus(status);
      };

      try {
        setLoadedEvents((previousEvents) =>
          previousEvents.map((event) =>
            event.id === parentEvent.id
              ? {
                  ...event,
                  ...validatedEvent,
                }
              : event,
          ),
        );

        const updatePayload = {
          id: parentEvent.id,
          ...validatedEvent,
        };

        const result = await updateEvent(updatePayload, onProgress);

        if (!result.success) {
          throw new Error(result.error || "Failed to update event");
        }

        finishSuccess();
      } catch (error) {
        handleError(error);
        handleRevert();
      }
    }

    // Open recurring update options
    function openRecurringUpdatePopup(parentEvent, validatedEvent) {
      const oldStart = DateTime.fromISO(
        originalEventRef.current.timeRange?.start ||
          originalEventRef.current.start,
      ).toMillis();

      const newStart = DateTime.fromISO(
        validatedEvent.timeRange.start,
      ).toMillis();

      const oldEnd = DateTime.fromISO(
        originalEventRef.current.timeRange?.end || originalEventRef.current.end,
      ).toMillis();

      const newEnd = DateTime.fromISO(validatedEvent.timeRange.end).toMillis();

      const deltaMs = newStart - oldStart;

      const durationDeltaMs = newEnd - newStart - (oldEnd - oldStart);

      const oldDate = DateTime.fromMillis(oldStart)
        .setZone(userZone)
        .toISODate();

      const newDate = DateTime.fromMillis(newStart)
        .setZone(userZone)
        .toISODate();

      const allowedModes = [
        RECURRENCE_UPDATE_MODE.THIS_EVENT,
        RECURRENCE_UPDATE_MODE.THIS_AND_FOLLOWING,
      ];

      if (oldDate === newDate) {
        allowedModes.push(RECURRENCE_UPDATE_MODE.ALL_EVENTS);
      }

      const currentEvent = {
        ...originalEventRef.current,
        originalTimeRange: validatedEvent.timeRange,
      };

      openPopup(
        "centered",
        () => (
          <RecurrenceUpdatePopup
            allowedModes={allowedModes}
            onClose={() => {
              closeContextPopup();
              onClose?.();
            }}
            context={{
              parentEvent,
              currentEvent,
              finalData: {
                ...validatedEvent,
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

    // Finish successful save
    function finishSuccess() {
      setLoadingStatus(EVENT_SAVE_STATUS.SUCCESS);

      successTimeoutRef.current = setTimeout(() => {
        if (onClose) {
          onClose();
          return;
        }

        closeContextPopup();
      }, EVENT_SUCCESS_CLOSE_DELAY);
    }

    // Handle failed save
    function handleError(error) {
      console.error(error);

      setLoadingStatus(EVENT_SAVE_STATUS.ERROR);

      errorTimeoutRef.current = setTimeout(() => {
        setLoadingStatus(EVENT_SAVE_STATUS.IDLE);
      }, EVENT_ERROR_RESET_DELAY);
    }

    // Toggle full-day event
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
        prevTimeRange.current = {
          ...eventData.timeRange,
        };

        const newStart = currentStartLocal.startOf("day");

        let newEnd = currentEndLocal.startOf("day");

        if (newEnd <= newStart) {
          newEnd = newEnd.plus({
            days: 1,
          });
        }

        updateGlobalState(
          {
            timeRange: {
              start: newStart.toUTC().toISO({
                suppressMilliseconds: true,
              }),
              end: newEnd.toUTC().toISO({
                suppressMilliseconds: true,
              }),
            },
          },
          newIsFullDay,
        );

        return;
      }

      let newStart;
      let newEnd;

      if (prevTimeRange.current) {
        const previousStart = DateTime.fromISO(prevTimeRange.current.start, {
          zone: "utc",
        }).setZone(userZone);

        const previousEnd = DateTime.fromISO(prevTimeRange.current.end, {
          zone: "utc",
        }).setZone(userZone);

        newStart = currentStartLocal.set({
          hour: previousStart.hour,
          minute: previousStart.minute,
          second: 0,
          millisecond: 0,
        });

        const duration = previousEnd.diff(previousStart);

        newEnd = newStart.plus(duration);
      } else {
        const now = DateTime.now().setZone(userZone);

        newStart = currentStartLocal.set({
          hour: now.hour,
          minute: now.minute,
          second: 0,
          millisecond: 0,
        });

        newEnd = newStart.plus({
          hours: 1,
        });
      }

      updateGlobalState(
        {
          timeRange: {
            start: newStart.toUTC().toISO({
              suppressMilliseconds: true,
            }),
            end: newEnd.toUTC().toISO({
              suppressMilliseconds: true,
            }),
          },
        },
        newIsFullDay,
      );
    };

    // Check if range is full-day
    const isRangeFullDay = useCallback(
      (startIso, endIso) => {
        const startLocal = DateTime.fromISO(startIso, {
          zone: "utc",
        }).setZone(userZone);

        const endLocal = DateTime.fromISO(endIso, {
          zone: "utc",
        }).setZone(userZone);

        return (
          startLocal.hour === 0 &&
          startLocal.minute === 0 &&
          endLocal.hour === 0 &&
          endLocal.minute === 0 &&
          endLocal.diff(startLocal, "hours").hours >= 24
        );
      },
      [userZone],
    );

    // Pick start day
    const handleDayPick = (event) => {
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
                {
                  zone: "utc",
                },
              ).setZone(userZone);

              const currentEndLocal = DateTime.fromISO(
                eventDataRef.current.timeRange.end,
                {
                  zone: "utc",
                },
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
        target: event.currentTarget,
        position: "bottomLeft",
      });
    };

    // Pick end day
    const handleEndDayPick = (event) => {
      openEditorPopup({
        desktopType: "contextual",
        content: (
          <PickDay
            today={eventDataRef.current.timeRange.end}
            minDate={eventDataRef.current.timeRange.start}
            onPick={(selectedDate) => {
              const newEndDayLocal =
                DateTime.fromISO(selectedDate).setZone(userZone);

              const currentStartLocal = DateTime.fromISO(
                eventDataRef.current.timeRange.start,
                {
                  zone: "utc",
                },
              ).setZone(userZone);

              const currentEndLocal = DateTime.fromISO(
                eventDataRef.current.timeRange.end,
                {
                  zone: "utc",
                },
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
                newEnd = newEnd.plus({
                  days: 1,
                });
              }

              const newStartIso = currentStartLocal.toUTC().toISO({
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
                    ...eventDataRef.current.timeRange,
                    end: newEndIso,
                  },
                },
                newIsFullDay,
              );

              closeEditorPopup();
            }}
          />
        ),
        target: event.currentTarget,
        position: "bottomLeft",
      });
    };

    // Pick start time
    const handleStartTimeClick = (event) => {
      openEditorPopup({
        desktopType: "contextual",
        content: (
          <TimeListPopup
            baseDate={new Date(eventDataRef.current.timeRange.start)}
            closePopup={closeEditorPopup}
            is12Format={!is24Format}
            onPick={(date) => {
              const currentStartLocal = DateTime.fromISO(
                eventDataRef.current.timeRange.start,
                {
                  zone: "utc",
                },
              ).setZone(userZone);

              const currentEndLocal = DateTime.fromISO(
                eventDataRef.current.timeRange.end,
                {
                  zone: "utc",
                },
              ).setZone(userZone);

              const duration = currentEndLocal.diff(currentStartLocal);

              const newStart = currentStartLocal.set({
                hour: date.getHours(),
                minute: date.getMinutes(),
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
            }}
          />
        ),
        target: event.currentTarget,
        position: "bottomLeft",
      });
    };

    // Pick end time
    const handleEndTimeClick = (event) => {
      openEditorPopup({
        desktopType: "contextual",
        content: (
          <TimeListPopup
            baseDate={new Date(eventDataRef.current.timeRange.end)}
            closePopup={closeEditorPopup}
            is12Format={!is24Format}
            onPick={(date) => {
              const currentStartLocal = DateTime.fromISO(
                eventDataRef.current.timeRange.start,
                {
                  zone: "utc",
                },
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
                newEnd = newEnd.plus({
                  days: 1,
                });
              }

              const newStartIso = currentStartLocal.toUTC().toISO({
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
            }}
          />
        ),
        target: event.currentTarget,
        position: "bottomLeft",
      });
    };

    // Update title
    const handleTitleChange = (event) => {
      updateGlobalState({
        title: event.target.value,
      });
    };

    // Update emoji
    const handleEmojiChange = (emoji) => {
      updateGlobalState({
        emoji,
      });
    };

    // Update color
    const handleColorChange = (color) => {
      updateGlobalState({
        color,
      });

      closeEditorPopup();
    };

    // Update recurrence
    const handleRecurrenceChange = (recurrence) => {
      updateGlobalState({
        recurrence,
      });

      closeEditorPopup();
    };

    // Update description
    const handleDescriptionSave = (description) => {
      updateGlobalState({
        description,
      });
    };

    // Open visibility
    const handleVisibilityClick = (event) => {
      openEditorPopup({
        desktopType: "contextual",
        content: (
          <VisibilityPopup
            eventData={eventData}
            updateGlobalState={updateGlobalState}
            friends={friends}
            closeParent={closeEditorPopup}
          />
        ),
        target: event.currentTarget,
        position: "bottomRight",
      });
    };

    // Check multi-day event
    const isMultiDay = useMemo(() => {
      if (!eventData.timeRange.start || !eventData.timeRange.end) {
        return false;
      }

      const startDate = DateTime.fromISO(eventData.timeRange.start, {
        zone: "utc",
      })
        .setZone(userZone)
        .startOf("day");

      const endDate = DateTime.fromISO(eventData.timeRange.end, {
        zone: "utc",
      })
        .setZone(userZone)
        .startOf("day");

      return endDate.toMillis() > startDate.toMillis();
    }, [eventData.timeRange, userZone]);

    const startDate = DateTime.fromISO(eventData.timeRange.start, {
      zone: "utc",
    }).setZone(userZone);

    const endDate = DateTime.fromISO(eventData.timeRange.end, {
      zone: "utc",
    }).setZone(userZone);

    const dateDisplay = startDate.isValid
      ? startDate.toFormat("cccc, MMMM d")
      : "Pick Date";

    const endDateDisplay = endDate.isValid
      ? endDate.toFormat("cccc, MMMM d")
      : "Pick Date";

    const startTimeDisplay = startDate.isValid
      ? is24Format
        ? startDate.toFormat("HH:mm")
        : startDate.toFormat("h:mm a")
      : "--:--";

    const endTimeDisplay = endDate.isValid
      ? is24Format
        ? endDate.toFormat("HH:mm")
        : endDate.toFormat("h:mm a")
      : "--:--";

    const shouldShowExpanded = isFullDay || isMultiDay || isExpanded;

    // Open description
    const handleDescriptionClick = (event) => {
      openEditorPopup({
        desktopType: "centered",
        content: (
          <DescriptionPopup
            initialDescription={eventData.description}
            onSave={handleDescriptionSave}
            closePopup={closeEditorPopup}
          />
        ),
        target: event.currentTarget,
        position: "bottomLeft",
      });
    };

    // Open recurrence
    const handleRepeatClick = (event) => {
      openEditorPopup({
        desktopType: "contextual",
        content: (
          <RecurrenceOptionsPopup
            startDate={eventData.timeRange.start}
            currentRecurrence={eventData.recurrence}
            onSave={handleRecurrenceChange}
            openSubPopup={openPopup}
          />
        ),
        target: event.currentTarget,
        position: "bottomRight",
      });
    };

    // Open color picker
    const handleColorClick = (event) => {
      openEditorPopup({
        desktopType: "contextual",
        content: (
          <Colors
            selected={eventData.color}
            handleColorChange={handleColorChange}
          />
        ),
        target: event.currentTarget,
        position: "bottomRight",
      });
    };

    // Open emoji picker
    const handleEmojiClick = (event) => {
      openEditorPopup({
        desktopType: "contextual",
        content: <EmojiPopup handleEmojiChange={handleEmojiChange} />,
        target: event.currentTarget,
        position: "bottomRight",
      });
    };

    // Open availability
    const handleAvailabilityClick = (event) => {
      openEditorPopup({
        desktopType: "contextual",
        content: (
          <Availability
            eventData={eventData}
            updateGlobalState={updateGlobalState}
            closeParent={closeEditorPopup}
          />
        ),
        target: event.currentTarget,
        position: "bottomRight",
      });
    };

    // Open notifications
    const handleNotificationClick = (event) => {
      openEditorPopup({
        desktopType: "contextual",
        content: (
          <Notifications
            eventData={eventData}
            updateGlobalState={updateGlobalState}
            closeParent={closeEditorPopup}
          />
        ),
        target: event.currentTarget,
        position: "bottomRight",
      });
    };

    // Change editor tab
    const handleEventTypeChange = (nextType) => {
      if (nextType === eventType) {
        return;
      }

      const currentIndex = EVENT_EDITOR_TYPES.indexOf(eventType);

      const nextIndex = EVENT_EDITOR_TYPES.indexOf(nextType);

      if (currentIndex === -1 || nextIndex === -1) {
        return;
      }

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

    // Set active tab panel
    const setActiveTabPanelRef = useCallback(
      (type) => (node) => {
        if (type !== eventTypeRef.current) {
          return;
        }

        activeTabPanelRef.current = node;
        setActiveTabPanelNode(node);
      },
      [],
    );

    // Measure active tab
    useLayoutEffect(() => {
      const node = activeTabPanelNode;

      if (!node) {
        return undefined;
      }

      const measureHeight = () => {
        const nextHeight = Math.ceil(node.getBoundingClientRect().height);

        setMeasuredTabHeight((currentHeight) =>
          currentHeight === nextHeight ? currentHeight : nextHeight,
        );
      };

      measureHeight();

      if (typeof ResizeObserver === "undefined") {
        return undefined;
      }

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

    // Render event form
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
                    ClickEffect="scale"
                    className="default"
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
                        ClickEffect="scale"
                        className="default"
                      >
                        <p>{startTimeDisplay}</p>
                      </CustomButton>
                    </div>

                    <div className={styles.line} />

                    <div className={styles.endtTime}>
                      <CustomButton
                        onClick={handleEndTimeClick}
                        ClickEffect="scale"
                        className="default"
                      >
                        <p>{endTimeDisplay}</p>
                      </CustomButton>
                    </div>
                  </div>

                  <div className={styles.options}>
                    <CustomButton
                      ClickEffect="scale"
                      className="default"
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
                    ClickEffect="scale"
                    className="default"
                  >
                    <div className={styles.icon}>
                      <CalendarCircleIcon />
                    </div>

                    <p>{dateDisplay}</p>
                  </CustomButton>

                  <CustomButton
                    onClick={handleEndDayPick}
                    ClickEffect="scale"
                    className="default"
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
                          ClickEffect="scale"
                          className="default"
                        >
                          <p>{startTimeDisplay}</p>
                        </CustomButton>
                      </div>

                      <div className={styles.line} />

                      <div className={styles.endtTime}>
                        <CustomButton
                          onClick={handleEndTimeClick}
                          ClickEffect="scale"
                          className="default"
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
                  ClickEffect="scale"
                  type="list"
                  className="default"
                >
                  <div className={styles.icon}>
                    <span
                      style={{
                        backgroundColor: eventData.color,
                      }}
                    />
                  </div>

                  <span>color</span>
                </CustomButton>
              </div>

              <div className={styles.visibility}>
                <CustomButton
                  onClick={handleVisibilityClick}
                  ClickEffect="scale"
                  type="list"
                  className="default"
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
                  ClickEffect="scale"
                  type="list"
                  className="default"
                >
                  <div className={styles.icon}>
                    <AvailabilityIcon />
                  </div>

                  <span>
                    {eventData.availability === "busy"
                      ? "Busy"
                      : eventData.availability === "maybeBusy"
                        ? "Maybe busy"
                        : "Free"}
                  </span>
                </CustomButton>
              </div>

              <div className={styles.notification}>
                <CustomButton
                  onClick={handleNotificationClick}
                  ClickEffect="scale"
                  type="list"
                  className="default"
                >
                  <div className={styles.icon}>
                    <NotificationIcon />
                  </div>

                  <span>
                    {formatNotificationSelection(eventData.notification)}
                  </span>
                </CustomButton>
              </div>

              <div className={styles.emoji}>
                <CustomButton
                  onClick={handleEmojiClick}
                  ClickEffect="scale"
                  type="list"
                  className="default"
                >
                  <div className={styles.icon}>{eventData.emoji || "📅"}</div>

                  <span>Emoji</span>
                </CustomButton>
              </div>

              <div className={styles.repeat}>
                <CustomButton
                  ClickEffect="scale"
                  type="list"
                  className="default disabled"
                  onClick={handleRepeatClick}
                >
                  <div className={styles.icon}>
                    <RepeatIcon />
                  </div>

                  <span>Repeat</span>
                </CustomButton>
              </div>
            </div>
          </div>

          <div className={styles.description}>
            <div className={styles.contContnet}>
              <CustomButton
                className={`${styles.descriptionButton} ${
                  !eventData.description ? styles.placeholder : ""
                }`}
                onClick={handleDescriptionClick}
                ClickEffect="scale"
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
        </TabPanelMotion>
      </TabPanelMotion>
    );

    // Render placeholder tab
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
          {loadingStatus !== EVENT_SAVE_STATUS.IDLE && (
            <motion.div
              className={styles.overlay}
              initial={{
                opacity: 0,
              }}
              animate={{
                opacity: 1,
              }}
              exit={{
                opacity: 0,
              }}
            >
              <div className={styles.spinnerContainer}>
                {loadingStatus === EVENT_SAVE_STATUS.SUCCESS ? (
                  <SuccessIcon size={64} />
                ) : loadingStatus === EVENT_SAVE_STATUS.ERROR ? (
                  <ErrorIcon size={64} />
                ) : (
                  <Loading size={48} transparent onlyIcon />
                )}

                <p className={styles.statusText}>
                  {loadingStatus === EVENT_SAVE_STATUS.ENCRYPTING
                    ? "Encrypting..."
                    : loadingStatus === EVENT_SAVE_STATUS.UPLOADING
                      ? "Uploading..."
                      : loadingStatus === EVENT_SAVE_STATUS.SUCCESS
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
                className={`default ${styles.tabButton} ${
                  eventType === type ? styles.activeTab : ""
                }`}
                onClick={() => handleEventTypeChange(type)}
                ClickEffect="scale"
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
                    className={`default ${styles.tabButton} ${
                      eventType === type ? styles.activeTab : ""
                    }`}
                    onClick={() => handleEventTypeChange(type)}
                    ClickEffect="scale"
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
                    ClickEffect="scale"
                    className="default"
                    type="submit"
                    onClick={() => requestCloseEventSheet()}
                  >
                    Close
                  </CustomButton>
                </div>

                <span />
              </>
            )}

            <div className={styles.submit}>
              <CustomButton
                ClickEffect="scale"
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

export default AddEditNewEvent;
