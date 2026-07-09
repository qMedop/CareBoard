import { AnimatePresence } from "framer-motion";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Popup from "../components/popup/Popup";
import BottomSheet from "../components/popup/BottomSheet";

import AddEditNewEvent from "../pages/calendarPage/components/addEditNewEvent/AddEditNewEvent";

const PopupContext = createContext(null);

const CHILD_SHEET_ANIMATION_MS = 300;

function createPopupId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `popup-${crypto.randomUUID()}`;
  }

  return `popup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function safelyCall(callback) {
  if (typeof callback !== "function") {
    return true;
  }

  try {
    return callback();
  } catch (error) {
    console.error("Popup callback failed:", error);

    return false;
  }
}

function PopupProvider({ children }) {
  /*
   * ==================================================
   * POPUP LOGIC
   * ==================================================
   */

  const [popups, setPopupsState] = useState([]);

  const popupsRef = useRef([]);

  const closingIdsRef = useRef(new Set());

  /*
   * Prevent the popup underneath an exiting popup from
   * immediately receiving another outside click.
   */
  const popupTransitionLockRef = useRef(false);

  const setPopups = useCallback((updater) => {
    setPopupsState((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;

      popupsRef.current = next;

      return next;
    });
  }, []);

  const closePopupByObject = useCallback(
    (popup, force = false) => {
      if (!popup) {
        return true;
      }

      if (closingIdsRef.current.has(popup.id)) {
        return false;
      }

      closingIdsRef.current.add(popup.id);

      try {
        if (!force) {
          const shouldClose = safelyCall(popup.onClose);

          if (shouldClose === false) {
            return false;
          }

          if (
            shouldClose &&
            typeof shouldClose === "object" &&
            typeof shouldClose.then === "function"
          ) {
            console.error("Popup onClose callbacks must be synchronous.");

            return false;
          }
        }

        setPopups((current) => current.filter((item) => item.id !== popup.id));

        return true;
      } finally {
        closingIdsRef.current.delete(popup.id);
      }
    },
    [setPopups],
  );

  const openPopup = useCallback(
    (
      type,
      contentRenderer,
      triggerElement = null,
      direction = "bottomRight",
      BR,
      onClose = () => {},
      customId = null,
    ) => {
      if (typeof contentRenderer !== "function") {
        console.error("openPopup requires contentRenderer to be a function.");

        return null;
      }

      const current = popupsRef.current;

      const existingById =
        customId !== null
          ? current.find((popup) => popup.id === customId)
          : null;

      const existingByTrigger =
        triggerElement !== null
          ? current.find(
              (popup) =>
                popup.triggerElement === triggerElement && !popup.isHidden,
            )
          : null;

      const existing = existingById || existingByTrigger;

      if (existing) {
        const sameTrigger =
          triggerElement !== null && existing.triggerElement === triggerElement;

        const sameId = customId !== null && existing.id === customId;

        if (sameTrigger || sameId) {
          closePopupByObject(existing);

          return existing.id;
        }
      }

      const id = customId ?? createPopupId();

      const nextPopup = {
        type,

        render: contentRenderer,

        triggerElement,

        direction,

        onClose: typeof onClose === "function" ? onClose : () => {},

        BR,

        id,

        isHidden: false,
      };

      setPopups((currentPopups) => [...currentPopups, nextPopup]);

      return id;
    },
    [closePopupByObject, setPopups],
  );

  const closePopup = useCallback(
    (idOrForce = false, forceParam = false) => {
      const hasId =
        typeof idOrForce === "string" || typeof idOrForce === "number";

      const targetId = hasId ? idOrForce : null;

      const force = hasId ? forceParam === true : idOrForce === true;

      const current = popupsRef.current;

      if (current.length === 0) {
        return true;
      }

      const popup = targetId
        ? current.find((item) => item.id === targetId)
        : [...current].reverse().find((item) => !item.isHidden);

      return closePopupByObject(popup, force);
    },
    [closePopupByObject],
  );

  const hidePopup = useCallback(
    (id) => {
      const exists = popupsRef.current.some((popup) => popup.id === id);

      if (!exists) {
        return false;
      }

      setPopups((current) =>
        current.map((popup) =>
          popup.id === id
            ? {
                ...popup,

                isHidden: true,
              }
            : popup,
        ),
      );

      return true;
    },
    [setPopups],
  );

  const showPopup = useCallback(
    (id, newTriggerElement) => {
      const exists = popupsRef.current.some((popup) => popup.id === id);

      if (!exists) {
        return false;
      }

      setPopups((current) =>
        current.map((popup) =>
          popup.id === id
            ? {
                ...popup,

                isHidden: false,

                triggerElement:
                  newTriggerElement !== undefined
                    ? newTriggerElement
                    : popup.triggerElement,
              }
            : popup,
        ),
      );

      return true;
    },
    [setPopups],
  );

  const closeAllPopups = useCallback(
    (force = false) => {
      const current = popupsRef.current;

      if (current.length === 0) {
        return true;
      }

      if (force === true) {
        closingIdsRef.current.clear();

        popupTransitionLockRef.current = false;

        setPopups([]);

        return true;
      }

      const closableIds = new Set();

      for (let index = current.length - 1; index >= 0; index -= 1) {
        const popup = current[index];

        if (closingIdsRef.current.has(popup.id)) {
          continue;
        }

        closingIdsRef.current.add(popup.id);

        try {
          const shouldClose = safelyCall(popup.onClose);

          if (shouldClose === false) {
            continue;
          }

          if (
            shouldClose &&
            typeof shouldClose === "object" &&
            typeof shouldClose.then === "function"
          ) {
            console.error("Popup onClose callbacks must be synchronous.");

            continue;
          }

          closableIds.add(popup.id);
        } finally {
          closingIdsRef.current.delete(popup.id);
        }
      }

      if (closableIds.size > 0) {
        popupTransitionLockRef.current = true;

        setPopups((latest) =>
          latest.filter((popup) => !closableIds.has(popup.id)),
        );
      }

      return closableIds.size === current.length;
    },
    [setPopups],
  );

  /*
   * ==================================================
   * MAIN EVENT SHEET
   * ==================================================
   */

  const [sheetState, setSheetState] = useState({
    isOpen: false,

    eventId: null,
  });

  const addEditRef = useRef(null);

  const attemptCloseRef = useRef(null);

  /*
   * If another event sheet is requested while the
   * current one is still closing, wait for onCloseEnd.
   */
  const pendingEventSheetOpenRef = useRef(null);

  /*
   * ==================================================
   * CHILD SHEET LOGIC
   * ==================================================
   */

  const [childSheetStack, setChildSheetStack] = useState([]);

  const [renderedChildSheet, setRenderedChildSheet] = useState(null);

  const [isChildSheetOpen, setIsChildSheetOpen] = useState(false);

  const childSheetIdRef = useRef(0);

  const childCloseTimerRef = useRef(null);

  const childOpenFrameRef = useRef(null);

  const childSecondOpenFrameRef = useRef(null);

  const childIsClosingRef = useRef(false);

  /*
   * ==================================================
   * CHILD SHEET INTERNAL HELPERS
   * ==================================================
   */

  const clearChildCloseTimer = useCallback(() => {
    if (childCloseTimerRef.current !== null) {
      clearTimeout(childCloseTimerRef.current);

      childCloseTimerRef.current = null;
    }
  }, []);

  const clearChildOpenFrames = useCallback(() => {
    if (childOpenFrameRef.current !== null) {
      cancelAnimationFrame(childOpenFrameRef.current);

      childOpenFrameRef.current = null;
    }

    if (childSecondOpenFrameRef.current !== null) {
      cancelAnimationFrame(childSecondOpenFrameRef.current);

      childSecondOpenFrameRef.current = null;
    }
  }, []);

  const scheduleChildSheetOpen = useCallback(() => {
    clearChildOpenFrames();

    childOpenFrameRef.current = requestAnimationFrame(() => {
      childOpenFrameRef.current = null;

      childSecondOpenFrameRef.current = requestAnimationFrame(() => {
        childSecondOpenFrameRef.current = null;

        setIsChildSheetOpen(true);
      });
    });
  }, [clearChildOpenFrames]);

  const mountAndOpenChildSheet = useCallback(
    (sheet) => {
      clearChildCloseTimer();

      clearChildOpenFrames();

      childIsClosingRef.current = false;

      setIsChildSheetOpen(false);

      setRenderedChildSheet(sheet);

      scheduleChildSheetOpen();
    },
    [clearChildCloseTimer, clearChildOpenFrames, scheduleChildSheetOpen],
  );

  /*
   * ==================================================
   * MAIN EVENT SHEET API
   * ==================================================
   */

  const openEventSheet = useCallback(
    ({ eventId, attemptClose }) => {
      const nextSheet = {
        eventId,

        attemptClose: typeof attemptClose === "function" ? attemptClose : null,
      };

      clearChildCloseTimer();

      clearChildOpenFrames();

      childIsClosingRef.current = false;

      setChildSheetStack([]);

      setRenderedChildSheet(null);

      setIsChildSheetOpen(false);

      /*
       * If a sheet is currently open, finish closing it
       * before opening the next one.
       */
      if (sheetState.isOpen) {
        pendingEventSheetOpenRef.current = nextSheet;

        setSheetState((current) => ({
          ...current,

          isOpen: false,
        }));

        return;
      }

      attemptCloseRef.current = nextSheet.attemptClose;

      setSheetState({
        isOpen: true,

        eventId: nextSheet.eventId,
      });
    },
    [sheetState.isOpen, clearChildCloseTimer, clearChildOpenFrames],
  );

  /*
   * Kept for API compatibility.
   *
   * Instead of manually toggling false/true through
   * animation frames, reopen through the normal sheet
   * lifecycle.
   */
  const reopenEventSheet = useCallback(() => {
    const currentEventId = sheetState.eventId;

    if (!currentEventId) {
      return false;
    }

    pendingEventSheetOpenRef.current = {
      eventId: currentEventId,

      attemptClose: attemptCloseRef.current,
    };

    setSheetState((current) => ({
      ...current,

      isOpen: false,
    }));

    return true;
  }, [sheetState.eventId]);

  const handleEventSheetCloseEnd = useCallback(() => {
    const pending = pendingEventSheetOpenRef.current;

    if (pending) {
      pendingEventSheetOpenRef.current = null;

      attemptCloseRef.current = pending.attemptClose;

      setSheetState({
        isOpen: true,

        eventId: pending.eventId,
      });

      return;
    }

    /*
     * Only clear the content after the library's exit
     * animation has completed.
     */
    setSheetState({
      isOpen: false,

      eventId: null,
    });

    attemptCloseRef.current = null;
  }, []);

  /*
   * ==================================================
   * CHILD SHEET API
   * ==================================================
   */

  const openEventSubSheet = useCallback(
    ({
      content,

      snapPoints = [0, 1],

      initialSnap = 1,

      onBeforeClose = null,
    }) => {
      if (!content) {
        return null;
      }

      const id = ++childSheetIdRef.current;

      const newSheet = {
        id,

        content,

        snapPoints,

        initialSnap,

        onBeforeClose:
          typeof onBeforeClose === "function" ? onBeforeClose : null,
      };

      if (!renderedChildSheet) {
        setChildSheetStack([newSheet]);

        mountAndOpenChildSheet(newSheet);

        return id;
      }

      if (childIsClosingRef.current) {
        return null;
      }

      childIsClosingRef.current = true;

      clearChildCloseTimer();

      clearChildOpenFrames();

      setIsChildSheetOpen(false);

      childCloseTimerRef.current = setTimeout(() => {
        childCloseTimerRef.current = null;

        setChildSheetStack((current) => [...current, newSheet]);

        mountAndOpenChildSheet(newSheet);
      }, CHILD_SHEET_ANIMATION_MS);

      return id;
    },
    [
      renderedChildSheet,

      mountAndOpenChildSheet,

      clearChildCloseTimer,

      clearChildOpenFrames,
    ],
  );

  const closeEventSubSheet = useCallback(() => {
    if (!renderedChildSheet || childIsClosingRef.current) {
      return false;
    }

    if (renderedChildSheet.onBeforeClose) {
      const result = renderedChildSheet.onBeforeClose();

      if (result === false) {
        return false;
      }
    }

    childIsClosingRef.current = true;

    clearChildCloseTimer();

    clearChildOpenFrames();

    setIsChildSheetOpen(false);

    childCloseTimerRef.current = setTimeout(() => {
      childCloseTimerRef.current = null;

      setChildSheetStack((current) => {
        if (current.length === 0) {
          setRenderedChildSheet(null);

          childIsClosingRef.current = false;

          return current;
        }

        const nextStack = current.slice(0, -1);

        const previousSheet =
          nextStack.length > 0 ? nextStack[nextStack.length - 1] : null;

        if (!previousSheet) {
          setRenderedChildSheet(null);

          setIsChildSheetOpen(false);

          childIsClosingRef.current = false;

          return nextStack;
        }

        setRenderedChildSheet(previousSheet);

        setIsChildSheetOpen(false);

        childIsClosingRef.current = false;

        scheduleChildSheetOpen();

        return nextStack;
      });
    }, CHILD_SHEET_ANIMATION_MS);

    return true;
  }, [
    renderedChildSheet,

    clearChildCloseTimer,

    clearChildOpenFrames,

    scheduleChildSheetOpen,
  ]);

  const forceCloseEventSubSheet = useCallback(() => {
    if (!renderedChildSheet || childIsClosingRef.current) {
      return false;
    }

    childIsClosingRef.current = true;

    clearChildCloseTimer();

    clearChildOpenFrames();

    setIsChildSheetOpen(false);

    childCloseTimerRef.current = setTimeout(() => {
      childCloseTimerRef.current = null;

      setChildSheetStack((current) => {
        const nextStack = current.slice(0, -1);

        const previousSheet =
          nextStack.length > 0 ? nextStack[nextStack.length - 1] : null;

        if (!previousSheet) {
          setRenderedChildSheet(null);

          setIsChildSheetOpen(false);

          childIsClosingRef.current = false;

          return nextStack;
        }

        setRenderedChildSheet(previousSheet);

        setIsChildSheetOpen(false);

        childIsClosingRef.current = false;

        scheduleChildSheetOpen();

        return nextStack;
      });
    }, CHILD_SHEET_ANIMATION_MS);

    return true;
  }, [
    renderedChildSheet,

    clearChildCloseTimer,

    clearChildOpenFrames,

    scheduleChildSheetOpen,
  ]);

  const closeAllEventSubSheets = useCallback(() => {
    clearChildCloseTimer();

    clearChildOpenFrames();

    if (!renderedChildSheet) {
      setChildSheetStack([]);

      setIsChildSheetOpen(false);

      childIsClosingRef.current = false;

      return;
    }

    childIsClosingRef.current = true;

    setIsChildSheetOpen(false);

    childCloseTimerRef.current = setTimeout(() => {
      childCloseTimerRef.current = null;

      setChildSheetStack([]);

      setRenderedChildSheet(null);

      setIsChildSheetOpen(false);

      childIsClosingRef.current = false;
    }, CHILD_SHEET_ANIMATION_MS);
  }, [renderedChildSheet, clearChildCloseTimer, clearChildOpenFrames]);

  /*
   * ==================================================
   * MAIN SHEET CLOSE API
   * ==================================================
   */

  const requestCloseEventSheet = useCallback(() => {
    if (renderedChildSheet) {
      closeEventSubSheet();

      return false;
    }

    const attemptClose = attemptCloseRef.current;

    if (attemptClose) {
      const canClose = attemptClose();

      if (canClose === false) {
        return false;
      }
    }

    setSheetState((current) => ({
      ...current,

      isOpen: false,
    }));

    return true;
  }, [renderedChildSheet, closeEventSubSheet]);

  const forceCloseEventSheet = useCallback(() => {
    attemptCloseRef.current = null;

    pendingEventSheetOpenRef.current = null;

    clearChildCloseTimer();

    clearChildOpenFrames();

    childIsClosingRef.current = false;

    setChildSheetStack([]);

    setRenderedChildSheet(null);

    setIsChildSheetOpen(false);

    /*
     * Keep eventId mounted until onCloseEnd.
     */
    setSheetState((current) => ({
      ...current,

      isOpen: false,
    }));
  }, [clearChildCloseTimer, clearChildOpenFrames]);

  /*
   * ==================================================
   * CLEANUP
   * ==================================================
   */

  useEffect(() => {
    return () => {
      if (childCloseTimerRef.current !== null) {
        clearTimeout(childCloseTimerRef.current);
      }

      if (childOpenFrameRef.current !== null) {
        cancelAnimationFrame(childOpenFrameRef.current);
      }

      if (childSecondOpenFrameRef.current !== null) {
        cancelAnimationFrame(childSecondOpenFrameRef.current);
      }
    };
  }, []);

  /*
   * ==================================================
   * POPUP RENDER INFO
   * ==================================================
   */

  let topmostVisibleIndex = -1;

  for (let index = popups.length - 1; index >= 0; index -= 1) {
    if (!popups[index].isHidden) {
      topmostVisibleIndex = index;

      break;
    }
  }

  /*
   * ==================================================
   * CONTEXT VALUE
   * ==================================================
   */

  const contextValue = useMemo(
    () => ({
      /*
       * Popup API
       */

      openPopup,

      closePopup,

      hidePopup,

      showPopup,

      closeAllPopups,

      /*
       * Main event sheet API
       */

      openEventSheet,

      reopenEventSheet,

      requestCloseEventSheet,

      forceCloseEventSheet,

      isEventSheetOpen: sheetState.isOpen,

      eventSheetId: sheetState.eventId,

      addEditRef,

      /*
       * Child sheet API
       */

      openEventSubSheet,

      closeEventSubSheet,

      forceCloseEventSubSheet,

      closeAllEventSubSheets,

      hasEventSubSheet: childSheetStack.length > 0,

      eventSubSheetDepth: childSheetStack.length,
    }),
    [
      openPopup,

      closePopup,

      hidePopup,

      showPopup,

      closeAllPopups,

      openEventSheet,

      reopenEventSheet,

      requestCloseEventSheet,

      forceCloseEventSheet,

      sheetState.isOpen,

      sheetState.eventId,

      openEventSubSheet,

      closeEventSubSheet,

      forceCloseEventSubSheet,

      closeAllEventSubSheets,

      childSheetStack.length,
    ],
  );

  /*
   * ==================================================
   * RENDER
   * ==================================================
   */

  return (
    <PopupContext.Provider value={contextValue}>
      {children}

      {/* EXISTING POPUPS */}

      <AnimatePresence
        onExitComplete={() => {
          popupTransitionLockRef.current = false;
        }}
      >
        {popups.map((popup, index) => (
          <Popup
            key={popup.id}
            type={popup.type}
            direction={popup.direction}
            triggerElement={popup.triggerElement}
            onClose={() => {
              if (popupTransitionLockRef.current) {
                return false;
              }

              const closed = closePopup(popup.id);

              if (closed) {
                popupTransitionLockRef.current = true;
              }

              return closed;
            }}
            isTopmost={index === topmostVisibleIndex}
            BR={popup.BR}
            isHidden={popup.isHidden}
            zIndex={1000 + index}
          >
            {popup.render()}
          </Popup>
        ))}
      </AnimatePresence>

      {/* MAIN EVENT SHEET */}

      <BottomSheet
        isOpen={sheetState.isOpen}
        onClose={requestCloseEventSheet}
        onCloseEnd={handleEventSheetCloseEnd}
        detent="content-height"
      >
        {sheetState.eventId && (
          <AddEditNewEvent
            ref={addEditRef}
            eventId={sheetState.eventId}
            onClose={forceCloseEventSheet}
            isBottomSheet
          />
        )}
      </BottomSheet>

      {/* CHILD / NESTED SHEET */}

      <BottomSheet
        isOpen={isChildSheetOpen}
        onClose={closeEventSubSheet}
        snapPoints={renderedChildSheet?.snapPoints || [0, 1]}
        initialSnap={renderedChildSheet?.initialSnap ?? 1}
      >
        {renderedChildSheet?.content}
      </BottomSheet>
    </PopupContext.Provider>
  );
}

function usePopup() {
  const context = useContext(PopupContext);

  if (!context) {
    throw new Error("usePopup must be used within PopupProvider.");
  }

  return context;
}

function useEventSheet() {
  const context = useContext(PopupContext);

  if (!context) {
    throw new Error("useEventSheet must be used within PopupProvider.");
  }

  return context;
}

export { PopupProvider, usePopup, useEventSheet };
