import { AnimatePresence } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import Popup from "../components/popup/Popup";
import BottomSheet from "../components/popup/BottomSheet";

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

function PopupProvider({ children }) {
  /*
   * -------------------------------------------------------
   * DESKTOP POPUPS
   * -------------------------------------------------------
   */

  const [popups, setPopupsState] = useState([]);

  const popupsRef = useRef([]);
  const closingIdsRef = useRef(new Set());
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
   * -------------------------------------------------------
   * MAIN EVENT SHEET
   * -------------------------------------------------------
   */

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

  /*
   * -------------------------------------------------------
   * CHILD EVENT SHEETS
   * -------------------------------------------------------
   */

  const [childSheetStack, setChildSheetStack] = useState([]);

  const [isChildSheetOpen, setIsChildSheetOpen] = useState(false);

  const childSheetIdRef = useRef(0);
  const childCloseActionRef = useRef(null);
  const childIsClosingRef = useRef(false);

  const renderedChildSheet =
    childSheetStack[childSheetStack.length - 1] ?? null;

  const resetChildSheetsImmediately = useCallback(() => {
    childCloseActionRef.current = null;
    childIsClosingRef.current = false;

    setIsChildSheetOpen(false);
    setChildSheetStack([]);
  }, []);

  const openEventSubSheet = useCallback(
    ({ content, onBeforeClose = null }) => {
      if (!content) {
        return null;
      }

      if (childIsClosingRef.current) {
        return null;
      }

      const id = ++childSheetIdRef.current;

      const newSheet = {
        id,
        content,
        onBeforeClose:
          typeof onBeforeClose === "function" ? onBeforeClose : null,
      };

      if (!renderedChildSheet) {
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
    [renderedChildSheet],
  );

  const beginChildSheetPop = useCallback(
    ({ skipBeforeClose = false } = {}) => {
      if (!renderedChildSheet || childIsClosingRef.current) {
        return false;
      }

      if (!skipBeforeClose && renderedChildSheet.onBeforeClose) {
        const result = safelyCall(renderedChildSheet.onBeforeClose);

        if (result === false) {
          return false;
        }
      }

      childIsClosingRef.current = true;

      childCloseActionRef.current = {
        type: "POP",
      };

      setIsChildSheetOpen(false);

      return true;
    },
    [renderedChildSheet],
  );

  const closeEventSubSheet = useCallback(() => {
    return beginChildSheetPop();
  }, [beginChildSheetPop]);

  const forceCloseEventSubSheet = useCallback(() => {
    return beginChildSheetPop({
      skipBeforeClose: true,
    });
  }, [beginChildSheetPop]);

  const closeAllEventSubSheets = useCallback(() => {
    if (!renderedChildSheet) {
      resetChildSheetsImmediately();
      return true;
    }

    if (childIsClosingRef.current) {
      return false;
    }

    childIsClosingRef.current = true;

    childCloseActionRef.current = {
      type: "POP_ALL",
    };

    setIsChildSheetOpen(false);

    return true;
  }, [renderedChildSheet, resetChildSheetsImmediately]);

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
  }, []);

  /*
   * -------------------------------------------------------
   * MAIN EVENT SHEET CLOSING
   * -------------------------------------------------------
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

  const requestCloseEventSheetFromBackdrop = useCallback(() => {
    if (renderedChildSheet) {
      closeEventSubSheet();
      return false;
    }

    const attemptClose = attemptCloseRef.current;

    if (attemptClose) {
      const canClose = attemptClose({
        reopenOnCancel: false,
      });

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

  const handleEventSheetDragClose = useCallback(() => {
    if (renderedChildSheet) {
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
        requestAnimationFrame(() => {
          reopenEventSheet();
        });
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
  }, [renderedChildSheet, closeEventSubSheet, reopenEventSheet]);

  const forceCloseEventSheet = useCallback(() => {
    attemptCloseRef.current = null;
    pendingEventSheetOpenRef.current = null;

    resetChildSheetsImmediately();

    setSheetState((current) => ({
      ...current,
      isOpen: false,
    }));
  }, [resetChildSheetsImmediately]);

  /*
   * -------------------------------------------------------
   * RENDERING
   * -------------------------------------------------------
   */

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
