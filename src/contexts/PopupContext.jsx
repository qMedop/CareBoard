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
  if (typeof callback !== "function") return true;

  try {
    return callback();
  } catch (error) {
    console.error("Popup callback failed:", error);
    return false;
  }
}

function PopupProvider({ children }) {
  const [popups, setPopupsState] = useState([]);

  const popupsRef = useRef([]);
  const closingIdsRef = useRef(new Set());

  const setPopups = useCallback((updater) => {
    setPopupsState((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;

      popupsRef.current = next;

      return next;
    });
  }, []);

  const closePopupByObject = useCallback(
    (popup, force = false) => {
      if (!popup) return true;

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
        setPopups((latest) =>
          latest.filter((popup) => !closableIds.has(popup.id)),
        );
      }

      return closableIds.size === current.length;
    },
    [setPopups],
  );

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
    }),
    [openPopup, closePopup, hidePopup, showPopup, closeAllPopups],
  );

  return (
    <PopupContext.Provider value={contextValue}>
      {children}

      <AnimatePresence>
        {popups.map((popup, index) => (
          <Popup
            key={popup.id}
            type={popup.type}
            direction={popup.direction}
            triggerElement={popup.triggerElement}
            onClose={() => closePopup(popup.id)}
            isTopmost={index === topmostVisibleIndex}
            BR={popup.BR}
            isHidden={popup.isHidden}
            zIndex={1000 + index}
          >
            {popup.render()}
          </Popup>
        ))}
      </AnimatePresence>
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

export { PopupProvider, usePopup };
