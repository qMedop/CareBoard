import { AnimatePresence } from "framer-motion";
import Popup from "../components/popup/Popup";
import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
} from "react";

const PopupContext = createContext();

function PopupProvider({ children }) {
  const [popups, setPopups] = useState([]);
  const popupsRef = useRef([]);
  popupsRef.current = popups;

  const isClosingRef = useRef(false);

  // 🔥 1. OPEN: Now accepts an optional ID, and RETURNS the ID!
  const openPopup = useCallback(
    (
      type,
      contentRenderer,
      triggerElement = null,
      direction = "bottom-right",
      BR,
      onClose = () => {},
      customId = null, // Let the user pass an ID, or generate one
    ) => {
      const id = customId || `popup-${Date.now()}-${Math.random()}`;
      setPopups((prev) => {
        const existingIndex = prev.findIndex(
          (p) =>
            p.id === id ||
            (p.triggerElement === triggerElement && triggerElement !== null),
        );

        if (existingIndex !== -1) {
          const newPopups = [...prev];
          newPopups[existingIndex] = {
            type,
            render: contentRenderer,
            triggerElement,
            direction,
            onClose,
            BR,
            id,
            isHidden: false,
          };
          return newPopups;
        } else {
          return [
            ...prev,
            {
              type,
              render: contentRenderer,
              triggerElement,
              direction,
              onClose,
              BR,
              id,
              isHidden: false,
            },
          ];
        }
      });

      return id; // Return the ID so the caller can save it!
    },
    [],
  );

  // 🔥 2. CLOSE: Now accepts a specific ID to close!
  const closePopup = useCallback((idOrForce = false, forceParam = false) => {
    if (isClosingRef.current) return false;

    const isId = typeof idOrForce === "string" || typeof idOrForce === "number";
    const targetId = isId ? idOrForce : null;
    const force = isId ? forceParam : idOrForce;

    const prev = popupsRef.current;
    if (prev.length === 0) return true;

    // Find specific popup, or just grab the top one
    const targetIndex = targetId
      ? prev.findIndex((p) => p.id === targetId)
      : prev.length - 1;

    if (targetIndex === -1) return true;
    const popup = prev[targetIndex];

    isClosingRef.current = true;
    try {
      if (force !== true && popup.onClose) {
        const shouldClose = popup.onClose();
        if (shouldClose === false) return false;
      }
      setPopups((current) => {
        const copy = [...current];
        copy.splice(targetIndex, 1);
        return copy;
      });
      return true;
    } finally {
      isClosingRef.current = false;
    }
  }, []);

  // 🔥 3. HIDE: Keeps it alive, but makes it invisible
  const hidePopup = useCallback((id) => {
    setPopups((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isHidden: true } : p)),
    );
  }, []);

  // 🔥 4. SHOW: Makes it visible again, and instantly moves it to the new Div!
  const showPopup = useCallback((id, newTriggerElement = null) => {
    setPopups((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            isHidden: false,
            // If a new div is passed, update it so the popup recalculates its position!
            triggerElement: newTriggerElement || p.triggerElement,
          };
        }
        return p;
      }),
    );
  }, []);

  const closeAllPopups = useCallback((force = false) => {
    setPopups([]);
    return true;
  }, []);

  return (
    <PopupContext.Provider
      value={{ openPopup, closePopup, hidePopup, showPopup, closeAllPopups }}
    >
      {children}
      <AnimatePresence>
        {popups.map((popup, index) => (
          <Popup
            key={popup.id}
            type={popup.type}
            direction={popup.direction}
            triggerElement={popup.triggerElement}
            onClose={() => closePopup(popup.id)} // Pass its own ID to close!
            isTopmost={index === popups.length - 1}
            BR={popup.BR}
            isHidden={popup.isHidden} // Pass the hidden state down
          >
            {popup.render()}
          </Popup>
        ))}
      </AnimatePresence>
    </PopupContext.Provider>
  );
}

const usePopup = () => useContext(PopupContext);
export { PopupProvider, usePopup };
