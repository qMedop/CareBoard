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

import BottomSheet from "../components/popup/BottomSheet";
import Popup from "../components/popup/Popup";

const PopupContext = createContext(null);

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

function getVisualViewport() {
  if (typeof window === "undefined") {
    return {
      height: 0,
      offsetTop: 0,
    };
  }

  return {
    height: window.visualViewport?.height ?? window.innerHeight,
    offsetTop: window.visualViewport?.offsetTop ?? 0,
  };
}

function PopupProvider({ children }) {
  const [popups, setPopupsState] = useState([]);
  const [visualViewport, setVisualViewport] = useState(getVisualViewport);

  const popupsRef = useRef([]);
  const closingIdsRef = useRef(new Set());
  const popupTransitionLockRef = useRef(false);

  useEffect(() => {
    const viewport = window.visualViewport;

    if (!viewport) {
      return undefined;
    }

    const updateVisualViewport = () => {
      setVisualViewport({
        height: viewport.height,
        offsetTop: viewport.offsetTop,
      });
    };

    updateVisualViewport();

    viewport.addEventListener("resize", updateVisualViewport);
    viewport.addEventListener("scroll", updateVisualViewport);

    return () => {
      viewport.removeEventListener("resize", updateVisualViewport);
      viewport.removeEventListener("scroll", updateVisualViewport);
    };
  }, []);

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

      if (existingById) {
        return existingById.id;
      }

      if (existingByTrigger) {
        closePopupByObject(existingByTrigger);
        return existingByTrigger.id;
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
          popup.id === id ? { ...popup, isHidden: true } : popup,
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

      if (force) {
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

  const [sheetState, setSheetState] = useState({
    isOpen: false,
    id: null,
    render: null,
  });

  const addEditRef = useRef(null);
  const attemptCloseRef = useRef(null);
  const pendingEventSheetOpenRef = useRef(null);

  const openEventSheet = useCallback(
    ({ id, attemptClose, content }) => {
      if (typeof content !== "function") {
        console.error(
          "openEventSheet requires content to be a render function.",
        );
        return false;
      }

      const nextSheet = {
        id,
        render: content,
        attemptClose: typeof attemptClose === "function" ? attemptClose : null,
      };

      if (sheetState.isOpen) {
        pendingEventSheetOpenRef.current = nextSheet;

        setSheetState((current) => ({
          ...current,
          isOpen: false,
        }));

        return true;
      }

      attemptCloseRef.current = nextSheet.attemptClose;

      setSheetState({
        isOpen: true,
        id: nextSheet.id,
        render: nextSheet.render,
      });

      return true;
    },
    [sheetState.isOpen],
  );

  const reopenEventSheet = useCallback(() => {
    if (!sheetState.id || !sheetState.render) {
      return false;
    }

    pendingEventSheetOpenRef.current = {
      id: sheetState.id,
      render: sheetState.render,
      attemptClose: attemptCloseRef.current,
    };

    setSheetState((current) => ({
      ...current,
      isOpen: false,
    }));

    return true;
  }, [sheetState.id, sheetState.render]);

  const handleEventSheetCloseEnd = useCallback(() => {
    const pending = pendingEventSheetOpenRef.current;

    if (pending) {
      pendingEventSheetOpenRef.current = null;
      attemptCloseRef.current = pending.attemptClose;

      setSheetState({
        isOpen: true,
        id: pending.id,
        render: pending.render,
      });

      return;
    }

    setSheetState({
      isOpen: false,
      id: null,
      render: null,
    });

    attemptCloseRef.current = null;
  }, []);

  const [childSheetStack, setChildSheetStackState] = useState([]);
  const [isChildSheetOpen, setIsChildSheetOpen] = useState(false);

  const childSheetStackRef = useRef([]);
  const childSheetIdRef = useRef(0);
  const childCloseActionRef = useRef(null);
  const childIsClosingRef = useRef(false);

  const setChildSheetStack = useCallback((updater) => {
    setChildSheetStackState((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;

      childSheetStackRef.current = next;

      return next;
    });
  }, []);

  const renderedChildSheet =
    childSheetStack[childSheetStack.length - 1] ?? null;

  const resetChildSheetsImmediately = useCallback(() => {
    childCloseActionRef.current = null;
    childIsClosingRef.current = false;

    setIsChildSheetOpen(false);
    setChildSheetStack([]);
  }, [setChildSheetStack]);

  const openEventSubSheet = useCallback(
    ({ content, onBeforeClose = null }) => {
      if (!content || childIsClosingRef.current) {
        return null;
      }

      const id = ++childSheetIdRef.current;

      const newSheet = {
        id,
        content,
        onBeforeClose:
          typeof onBeforeClose === "function" ? onBeforeClose : null,
      };

      if (childSheetStackRef.current.length === 0) {
        setChildSheetStack([newSheet]);
        setIsChildSheetOpen(true);
        return id;
      }

      childIsClosingRef.current = true;

      childCloseActionRef.current = {
        type: "PUSH",
        sheet: newSheet,
      };

      setIsChildSheetOpen(false);

      return id;
    },
    [setChildSheetStack],
  );

  const beginChildSheetPop = useCallback(({ skipBeforeClose = false } = {}) => {
    const currentStack = childSheetStackRef.current;
    const currentSheet = currentStack[currentStack.length - 1];

    if (!currentSheet || childIsClosingRef.current) {
      return false;
    }

    if (!skipBeforeClose && currentSheet.onBeforeClose) {
      const result = safelyCall(currentSheet.onBeforeClose);

      if (result === false) {
        return false;
      }
    }

    childIsClosingRef.current = true;
    childCloseActionRef.current = { type: "POP" };

    setIsChildSheetOpen(false);

    return true;
  }, []);

  const closeEventSubSheet = useCallback(
    () => beginChildSheetPop(),
    [beginChildSheetPop],
  );

  const forceCloseEventSubSheet = useCallback(
    () => beginChildSheetPop({ skipBeforeClose: true }),
    [beginChildSheetPop],
  );

  const closeAllEventSubSheets = useCallback(() => {
    if (childSheetStackRef.current.length === 0) {
      resetChildSheetsImmediately();
      return true;
    }

    if (childIsClosingRef.current) {
      return false;
    }

    childIsClosingRef.current = true;
    childCloseActionRef.current = { type: "POP_ALL" };

    setIsChildSheetOpen(false);

    return true;
  }, [resetChildSheetsImmediately]);

  const handleChildSheetCloseEnd = useCallback(() => {
    const action = childCloseActionRef.current;

    childCloseActionRef.current = null;

    if (!action) {
      childIsClosingRef.current = false;
      return;
    }

    if (action.type === "PUSH") {
      setChildSheetStack((current) => [...current, action.sheet]);

      childIsClosingRef.current = false;
      setIsChildSheetOpen(true);
      return;
    }

    if (action.type === "POP") {
      setChildSheetStack((current) => {
        const nextStack = current.slice(0, -1);

        childIsClosingRef.current = false;
        setIsChildSheetOpen(nextStack.length > 0);

        return nextStack;
      });

      return;
    }

    if (action.type === "POP_ALL") {
      childIsClosingRef.current = false;
      setChildSheetStack([]);
      setIsChildSheetOpen(false);
    }
  }, [setChildSheetStack]);

  const requestCloseEventSheet = useCallback(() => {
    if (childSheetStackRef.current.length > 0) {
      closeEventSubSheet();
      return false;
    }

    const attemptClose = attemptCloseRef.current;

    if (attemptClose && attemptClose() === false) {
      return false;
    }

    setSheetState((current) => ({
      ...current,
      isOpen: false,
    }));

    return true;
  }, [closeEventSubSheet]);

  const requestCloseEventSheetFromBackdrop = useCallback(() => {
    if (childSheetStackRef.current.length > 0) {
      closeEventSubSheet();
      return false;
    }

    const attemptClose = attemptCloseRef.current;

    if (
      attemptClose &&
      attemptClose({
        reopenOnCancel: false,
      }) === false
    ) {
      return false;
    }

    setSheetState((current) => ({
      ...current,
      isOpen: false,
    }));

    return true;
  }, [closeEventSubSheet]);

  const handleEventSheetDragClose = useCallback(() => {
    if (childSheetStackRef.current.length > 0) {
      closeEventSubSheet();
      return false;
    }

    const attemptClose = attemptCloseRef.current;

    if (!attemptClose) {
      setSheetState((current) => ({
        ...current,
        isOpen: false,
      }));

      return true;
    }

    const canClose = attemptClose({
      onCancel: () => {
        requestAnimationFrame(reopenEventSheet);
      },
    });

    if (canClose === false) {
      return false;
    }

    setSheetState((current) => ({
      ...current,
      isOpen: false,
    }));

    return true;
  }, [closeEventSubSheet, reopenEventSheet]);

  const forceCloseEventSheet = useCallback(() => {
    attemptCloseRef.current = null;
    pendingEventSheetOpenRef.current = null;

    resetChildSheetsImmediately();

    setSheetState((current) => ({
      ...current,
      isOpen: false,
    }));
  }, [resetChildSheetsImmediately]);

  let topmostVisibleIndex = -1;

  for (let index = popups.length - 1; index >= 0; index -= 1) {
    if (!popups[index].isHidden) {
      topmostVisibleIndex = index;
      break;
    }
  }

  const contextValue = useMemo(
    () => ({
      openPopup,
      closePopup,
      hidePopup,
      showPopup,
      closeAllPopups,
      openEventSheet,
      reopenEventSheet,
      requestCloseEventSheet,
      forceCloseEventSheet,
      isEventSheetOpen: sheetState.isOpen,
      eventSheetId: sheetState.id,
      addEditRef,
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
      sheetState.id,
      openEventSubSheet,
      closeEventSubSheet,
      forceCloseEventSubSheet,
      closeAllEventSubSheets,
      childSheetStack.length,
    ],
  );

  return (
    <PopupContext.Provider value={contextValue}>
      {children}

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
            visualViewport={
              popup.type === "centered" ? visualViewport : undefined
            }
          >
            {popup.render()}
          </Popup>
        ))}
      </AnimatePresence>

      <BottomSheet
        isOpen={sheetState.isOpen}
        onClose={handleEventSheetDragClose}
        onBackdropTap={requestCloseEventSheetFromBackdrop}
        onCloseEnd={handleEventSheetCloseEnd}
        detent="content-height"
        snapPoints={[0, 1]}
        initialSnap={1}
      >
        {sheetState.render?.()}
      </BottomSheet>

      <BottomSheet
        isOpen={isChildSheetOpen}
        onClose={closeEventSubSheet}
        onCloseEnd={handleChildSheetCloseEnd}
        detent="content-height"
        duration={0.2}
        headderHeight="16px"
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
