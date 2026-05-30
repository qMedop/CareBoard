// src/contexts/InfoContext.jsx

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useLayoutEffect,
  useRef,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./InfoContext.module.css";

const InfoContext = createContext();

// A default order of positions to try if the preferred one doesn't fit.
const POSITION_PRIORITY = ["top", "bottom", "right", "left"];
const GAP = 8; // The space between the element and the tooltip

function InfoProvider({ children }) {
  const [info, setInfo] = useState(null);
  const portalContainerRef = useRef(null);
  const [isMounted, setIsMounted] = useState(false);

  // We need to wait until the component has mounted to ensure the ref is available for the portal
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const showInfo = useCallback((content, targetEl, options = {}) => {
    setInfo({
      content,
      targetEl,
      className: options.className || "",
      position: options.position,
      id: Date.now(),
    });
  }, []);

  const hideInfo = useCallback(() => {
    setInfo(null);
  }, []);

  return (
    <InfoContext.Provider value={{ showInfo, hideInfo }}>
      {children}

      <div ref={portalContainerRef} className={styles.infoContainer}>
        {/* Only attempt to portal after the container div has been mounted */}
        {isMounted &&
          createPortal(
            <AnimatePresence>
              {info && <Tooltip key={info.id} {...info} />}
            </AnimatePresence>,
            portalContainerRef.current
          )}
      </div>
    </InfoContext.Provider>
  );
}

// Internal Tooltip component - NO CHANGES HERE, logic remains the same
function Tooltip({
  content,
  targetEl,
  className,
  position: preferredPosition,
}) {
  const tooltipRef = useRef(null);
  const [style, setStyle] = useState({ opacity: 0 });

  useLayoutEffect(() => {
    if (!targetEl || !tooltipRef.current) return;

    const calculatePosition = () => {
      const targetRect = targetEl.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const { innerWidth, innerHeight } = window;

      const positions = {
        top: {
          top: targetRect.top - tooltipRect.height - GAP,
          left: targetRect.left + targetRect.width / 2 - tooltipRect.width / 2,
        },
        bottom: {
          top: targetRect.bottom + GAP,
          left: targetRect.left + targetRect.width / 2 - tooltipRect.width / 2,
        },
        right: {
          top: targetRect.top + targetRect.height / 2 - tooltipRect.height / 2,
          left: targetRect.right + GAP,
        },
        left: {
          top: targetRect.top + targetRect.height / 2 - tooltipRect.height / 2,
          left: targetRect.left - tooltipRect.width - GAP,
        },
      };

      const fitsInViewport = (pos) =>
        pos.top >= 0 &&
        pos.left >= 0 &&
        pos.top + tooltipRect.height <= innerHeight &&
        pos.left + tooltipRect.width <= innerWidth;

      let bestPosition = null;
      const order = preferredPosition
        ? [
            preferredPosition,
            ...POSITION_PRIORITY.filter((p) => p !== preferredPosition),
          ]
        : POSITION_PRIORITY;

      for (const posName of order) {
        if (fitsInViewport(positions[posName])) {
          bestPosition = positions[posName];
          break;
        }
      }

      if (!bestPosition) {
        bestPosition = positions.top;
      }

      return {
        left: `${bestPosition.left}px`,
        top: `${bestPosition.top}px`,
        opacity: 1,
      };
    };

    // wait until tooltip is actually painted
    const raf = requestAnimationFrame(() => {
      setStyle(calculatePosition());
    });

    return () => cancelAnimationFrame(raf);
  }, [content, targetEl, preferredPosition]);
  return (
    <motion.div
      ref={tooltipRef}
      className={`${styles.info} ${className}`}
      style={style}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      {content}
    </motion.div>
  );
}

function useInfo() {
  const context = useContext(InfoContext);
  if (context === undefined) {
    throw new Error("useInfo must be used within an InfoProvider");
  }
  return context;
}

export { InfoProvider, useInfo };
