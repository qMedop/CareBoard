import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { useData } from "./AuthContext";
import { useNotification } from "./NotificationContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import defaultAvatar from "../assets/svg/user-avatar.svg";
import maleAvatar from "../assets/svg/male-avatar.svg";
import femaleAvatar from "../assets/svg/female-avatar.svg";
import { EVENT_TITLE } from "../constants/constants";

const TimeContext = createContext();

export const TimeProvider = ({ children }) => {
  const { currentUser, authStatus, subscribeToEvents } = useData();

  const { notify } = useNotification();

  const [today, setTodayState] = useState(new Date());
  const [swipingDate, setSwipingDate] = useState(today);

  const [direction, setDirection] = useState("next");
  const [loadedEvents, setLoadedEvents] = useState([]);
  const [newEvent, setNewEvent] = useState(null);
  const [activeFilterIds, setActiveFilterIds] = useState([]);

  const [draggableEvent, setDraggableEvent] = useState({
    id: `unsaved`,
    active: false,
    title: "Editing Event",
    description: "",
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
  });
  const [dragSourceId, setDragSourceId] = useState(null);
  const [timeZoneOffset, setTimeZoneOffset] = useState(0);
  const [topBottomHeight, setTopBottomHeight] = useState(0);
  const [dayTasksDiv, setDayTasksDiv] = useState(null);
  const [draggableRef, setDraggableRef] = useState(null);
  const resizeRef = useRef(null);

  const defaultAvatarUrl = (user) => {
    if (user && user.pfpUrl) return user.pfpUrl;
    if (user && user.gender) {
      if (user.gender.toLowerCase() === "male") return maleAvatar;
      if (user.gender.toLowerCase() === "female") return femaleAvatar;
      if (user.gender.toLowerCase() === "other") return defaultAvatar;
    }
    if (!user) return defaultAvatar;
    return defaultAvatar;
  };

  const [lists, setLists] = useState([
    { id: 1, title: "My Tasks", is_default: true, view: true, sort_by: "date" },
    { id: 2, title: "Movies", is_default: false, view: true, sort_by: "title" },
  ]);

  const [tasks, setTasks] = useState([
    {
      task_list_id: 1,
      id: 1,
      title: "Submit report",
      description: "Finalize and submit the quarterly report.",
      completed: false,
      started: false,
      created_at: new Date().toISOString(),
      completed_at: null,
      due_date: "2025-07-28T21:00:00+00:00",
    },
  ]);

  const [notes, setNotes] = useState([
    {
      id: 1,
      user_id: "user_123",
      type: "normal",
      title: "Shopping List",
      content: "Milk, Eggs, Bread, Coffee",
      fields: null,
      tags: ["personal", "groceries"],
      color: "#0C625D",
      created_at: "2025-08-17T10:00:00Z",
      updated_at: "2025-08-17T10:05:00Z",
      pinned_at: null,
      archived: false,
    },
  ]);

  const setToday = useCallback((newDate) => {
    setTodayState(newDate);
    setSwipingDate(newDate);
  }, []);

  const setTodayDeferred = useCallback((newDate, delay = 0) => {
    setSwipingDate(newDate);
    if (delay === 0) {
      setTodayState(newDate);
    } else {
      setTimeout(() => {
        setTodayState(newDate);
      }, delay);
    }
  }, []);

  useEffect(() => {
    const offsetInMinutes = new Date().getTimezoneOffset();
    setTimeZoneOffset(offsetInMinutes / -60);
  }, []);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIfMobile = () => {
      const mobileRegex =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        );
      const isMacTouch =
        navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1;
      const mobileDeviceDetected = mobileRegex || isMacTouch;

      setIsMobile(mobileDeviceDetected);

      if (mobileDeviceDetected) {
        document.body.classList.add("mobile");
      } else {
        document.body.classList.remove("mobile");
      }
    };

    checkIfMobile();
    window.addEventListener("resize", checkIfMobile);
    return () => window.removeEventListener("resize", checkIfMobile);
  }, []);

  const moveDate = (view, step) => {
    const newDate = new Date(today);
    switch (view) {
      case "day":
        newDate.setDate(today.getDate() + step);
        break;
      case "week":
        newDate.setDate(today.getDate() + step * 7);
        break;
      case "month":
        newDate.setMonth(today.getMonth() + step);
        break;
      case "year":
        newDate.setFullYear(today.getFullYear() + step);
        break;
      default:
        break;
    }
    setToday(newDate);
  };

  const safeSetLoadedEvents = (actionOrArray) => {
    setLoadedEvents((prev) => {
      const newArrayRaw =
        typeof actionOrArray === "function"
          ? actionOrArray(prev)
          : actionOrArray;
      const uniqueEvents = Array.from(
        new Map(newArrayRaw.map((e) => [e.id, e])).values(),
      );
      return uniqueEvents;
    });
  };

  useEffect(() => {
    let unsubscribe = () => {};
    let isInitialLoad = true;
    let previousEvents = [];
    const userProfileCache = {};

    const getUserData = async (userId) => {
      if (!userId) {
        return {
          pfp: defaultAvatarUrl(null),
          name: "A friend",
        };
      }

      if (userProfileCache[userId]) {
        return userProfileCache[userId];
      }

      try {
        const userSnap = await getDoc(doc(db, "users", userId));

        let userData;

        if (userSnap.exists()) {
          const data = userSnap.data();

          userData = {
            pfp: defaultAvatarUrl(data),
            name: data.displayName || "A friend",
          };
        } else {
          userData = {
            pfp: defaultAvatarUrl(null),
            name: "A friend",
          };
        }

        userProfileCache[userId] = userData;

        return userData;
      } catch (err) {
        console.error(err);

        return {
          pfp: defaultAvatarUrl(null),
          name: "A friend",
        };
      }
    };
    if (!currentUser || authStatus !== "done" || !currentUser.userDek) {
      setLoadedEvents([]);
      return;
    }

    unsubscribe = subscribeToEvents(async (result) => {
      if (!result.success) {
        console.error("Error subscribing to events:", result.error);
        return;
      }

      const currentEvents = result.events;
      if (!isInitialLoad) {
        for (const event of currentEvents) {
          if (!event.isShared) continue;

          const oldEvent = previousEvents.find((e) => e.id === event.id);

          if (!oldEvent) {
            const userData = await getUserData(event.ownerId);

            notify({
              id: `added-${event.id}`,
              type: "info",
              message: `${userData.name} created a new event: ${
                event.title || EVENT_TITLE
              }`,
            });

            continue;
          }

          const oldData = JSON.stringify({
            t: oldEvent.title,
            s: oldEvent.timeRange?.start,
            e: oldEvent.timeRange?.end,
          });

          const newData = JSON.stringify({
            t: event.title,
            s: event.timeRange?.start,
            e: event.timeRange?.end,
          });

          if (oldData !== newData) {
            const userData = await getUserData(event.ownerId);

            notify({
              id: `mod-${event.id}`,
              type: "info",
              message: `${userData.name} updated: ${
                event.title || EVENT_TITLE
              }`,
            });
          }
        }
      }

      previousEvents = currentEvents;
      isInitialLoad = false;

      const formattedEvents = await Promise.all(
        currentEvents.map(async (event) => {
          let ownerPfp = null;
          let ownerName = null;
          if (event.ownerId && event.ownerId !== currentUser.id) {
            const userData = await getUserData(event.ownerId);
            ownerPfp = userData.pfp;
            ownerName = userData.name;
          }

          return {
            ...event,
            ownerPfp,
            ownerName,
          };
        }),
      );

      setLoadedEvents((prev) => {
        const serverMap = new Map(formattedEvents.map((e) => [e.id, e]));

        const merged = prev
          .map((e) => {
            const isLocalDraft =
              e.id.toString().startsWith("shadow_") ||
              e.isPreview ||
              e.isUnsaved;
            if (isLocalDraft) return e;

            if (serverMap.has(e.id)) {
              return { ...e, ...serverMap.get(e.id) };
            }
            return null;
          })
          .filter(Boolean);

        formattedEvents.forEach((e) => {
          if (!merged.some((me) => me.id === e.id)) {
            merged.push(e);
          }
        });

        return merged;
      });
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentUser, authStatus, subscribeToEvents, notify]);

  return (
    <TimeContext.Provider
      value={{
        today,
        swipingDate,
        setTodayDeferred,
        direction,
        setDirection,
        moveDate,
        loadedEvents,
        setLoadedEvents,
        safeSetLoadedEvents,
        newEvent,
        setNewEvent,
        draggableEvent,
        setDraggableEvent,
        timeZoneOffset,
        setTimeZoneOffset,
        dayTasksDiv,
        draggableRef,
        resizeRef,
        topBottomHeight,
        setTopBottomHeight,
        setDayTasksDiv,
        setDraggableRef,
        tasks,
        setTasks,
        lists,
        setLists,
        notes,
        setNotes,
        activeFilterIds,
        setActiveFilterIds,
        isMobile,
        setDragSourceId,
        dragSourceId,
        defaultAvatarUrl,
        setToday,
      }}
    >
      {children}
    </TimeContext.Provider>
  );
};

export const useTime = () => useContext(TimeContext);
