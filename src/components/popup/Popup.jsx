import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { motion } from "framer-motion";

import styles from "./Popup.module.css";

import CustomButton from "../button/Button";

import { CloseIcon, TwoLinesIcon } from "../../assets/icons/Icon";

const GAP = 8;

const MIN_TOP = 30;
const MIN_BOTTOM = 30;

const MIN_MOVABLE_HEIGHT = 60;
const MAX_MOVABLE_HEIGHT = 574;

const DIRECTIONS = {
  bottom: ["bottom", "bottomLeft", "bottomRight", "top", "right", "left"],

  bottomLeft: ["bottomLeft", "bottomRight", "bottom", "topLeft", "rightBottom"],

  bottomRight: [
    "bottomRight",
    "bottomLeft",
    "bottom",
    "topRight",
    "leftBottom",
  ],

  top: ["top", "topLeft", "topRight", "bottom", "right", "left"],

  topLeft: ["topLeft", "topRight", "top", "bottomLeft", "rightTop"],

  topRight: ["topRight", "topLeft", "top", "bottomRight", "leftTop"],

  right: ["right", "rightTop", "rightBottom", "left", "bottom", "top"],

  rightTop: ["rightTop", "rightBottom", "right", "leftTop", "bottomLeft"],

  rightBottom: ["rightBottom", "rightTop", "right", "leftBottom", "topLeft"],

  left: ["left", "leftTop", "leftBottom", "right", "bottom", "top"],

  leftTop: ["leftTop", "leftBottom", "left", "rightTop", "bottomRight"],

  leftBottom: ["leftBottom", "leftTop", "left", "rightBottom", "topRight"],
};

function clamp(value, min, max) {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function isUsableElement(element) {
  return element instanceof Element && element.isConnected;
}

function normalizeDirection(direction) {
  if (typeof direction !== "string") {
    return "bottom";
  }

  const aliases = {
    "bottom-left": "bottomLeft",
    "bottom-right": "bottomRight",

    "top-left": "topLeft",
    "top-right": "topRight",

    "right-top": "rightTop",
    "right-bottom": "rightBottom",

    "left-top": "leftTop",
    "left-bottom": "leftBottom",
  };

  const normalized = aliases[direction] || direction;

  return DIRECTIONS[normalized] ? normalized : "bottom";
}

function getTransformOrigin(direction) {
  const normalized = normalizeDirection(direction);

  const origins = {
    bottom: "top center",

    bottomLeft: "top left",
    bottomRight: "top right",

    top: "bottom center",

    topLeft: "bottom left",
    topRight: "bottom right",

    right: "center left",

    rightTop: "top left",
    rightBottom: "bottom left",

    left: "center right",

    leftTop: "top right",
    leftBottom: "bottom right",
  };

  return origins[normalized];
}

function getMotionVariants(type, direction) {
  if (type === "centered") {
    return {
      initial: {
        opacity: 0,
        scale: 0.94,
      },

      animate: {
        opacity: 1,
        scale: 1,
      },

      exit: {
        opacity: 0,
        scale: 0.96,
      },
    };
  }

  const normalized = normalizeDirection(direction);

  if (normalized.startsWith("bottom")) {
    return {
      initial: {
        opacity: 0,
        scale: 0.96,
        y: -8,
      },

      animate: {
        opacity: 1,
        scale: 1,
        y: 0,
      },

      exit: {
        opacity: 0,
        scale: 0.97,
        y: -5,
      },
    };
  }

  if (normalized.startsWith("top")) {
    return {
      initial: {
        opacity: 0,
        scale: 0.96,
        y: 8,
      },

      animate: {
        opacity: 1,
        scale: 1,
        y: 0,
      },

      exit: {
        opacity: 0,
        scale: 0.97,
        y: 5,
      },
    };
  }

  if (normalized.startsWith("right")) {
    return {
      initial: {
        opacity: 0,
        scale: 0.96,
        x: -8,
      },

      animate: {
        opacity: 1,
        scale: 1,
        x: 0,
      },

      exit: {
        opacity: 0,
        scale: 0.97,
        x: -5,
      },
    };
  }

  return {
    initial: {
      opacity: 0,
      scale: 0.96,
      x: 8,
    },

    animate: {
      opacity: 1,
      scale: 1,
      x: 0,
    },

    exit: {
      opacity: 0,
      scale: 0.97,
      x: 5,
    },
  };
}

function Popup({
  type,
  triggerElement,
  direction = "bottom",
  onClose,
  children,
  isTopmost,
  BR,
  isHidden,
  zIndex,
}) {
  const popupContainerRef = useRef(null);
  const popupContentRef = useRef(null);

  const frameRef = useRef(null);

  const dragCleanupRef = useRef(null);
  const movableDragRef = useRef(null);

  const naturalMovableHeightRef = useRef(0);

  const hasMovedRef = useRef(false);
  const mountedRef = useRef(false);

  const [dynamicStyles, setDynamicStyles] = useState({
    opacity: 0,
  });

  const cancelFrame = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);

      frameRef.current = null;
    }
  }, []);

  const scheduleFrame = useCallback(
    (callback) => {
      cancelFrame();

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;

        callback();
      });
    },
    [cancelFrame],
  );

  const cleanupMovableDrag = useCallback(() => {
    if (dragCleanupRef.current) {
      dragCleanupRef.current();

      dragCleanupRef.current = null;
    }

    movableDragRef.current = null;

    document.body.classList.remove("popup-dragging");
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      cancelFrame();

      cleanupMovableDrag();
    };
  }, [cancelFrame, cleanupMovableDrag]);

  useEffect(() => {
    if (!isTopmost || isHidden) {
      return;
    }

    const handlePointerDown = (event) => {
      if (document.body.classList.contains("popup-dragging")) {
        return;
      }

      if (document.body.classList.contains("dragging")) {
        return;
      }

      if (document.body.classList.contains("resizing")) {
        return;
      }

      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (popupContentRef.current?.contains(target)) {
        return;
      }

      if (isUsableElement(triggerElement) && triggerElement.contains(target)) {
        return;
      }

      queueMicrotask(() => {
        if (mountedRef.current) {
          onClose();
        }
      });
    };

    const handleKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }

      event.preventDefault();

      onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);

      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isTopmost, isHidden, triggerElement, onClose]);

  const calculateContextualPosition = useCallback(() => {
    const popup = popupContainerRef.current;

    if (
      type !== "contextual" ||
      !popup ||
      !isUsableElement(triggerElement) ||
      isHidden
    ) {
      return;
    }

    const triggerRect = triggerElement.getBoundingClientRect();

    const popupRect = popup.getBoundingClientRect();

    const viewportWidth = document.documentElement.clientWidth;

    const viewportHeight = document.documentElement.clientHeight;

    const availableWidth = Math.max(0, viewportWidth - GAP * 2);

    const availableHeight = Math.max(0, viewportHeight - MIN_TOP - MIN_BOTTOM);

    const popupWidth = Math.min(popupRect.width, availableWidth);

    const popupHeight = Math.min(popupRect.height, availableHeight);

    const centerX = triggerRect.left + triggerRect.width / 2 - popupWidth / 2;

    const centerY = triggerRect.top + triggerRect.height / 2 - popupHeight / 2;

    const positions = {
      bottom: {
        top: triggerRect.bottom + GAP,
        left: centerX,
      },

      bottomLeft: {
        top: triggerRect.bottom + GAP,
        left: triggerRect.left,
      },

      bottomRight: {
        top: triggerRect.bottom + GAP,
        left: triggerRect.right - popupWidth,
      },

      top: {
        top: triggerRect.top - popupHeight - GAP,

        left: centerX,
      },

      topLeft: {
        top: triggerRect.top - popupHeight - GAP,

        left: triggerRect.left,
      },

      topRight: {
        top: triggerRect.top - popupHeight - GAP,

        left: triggerRect.right - popupWidth,
      },

      right: {
        top: centerY,

        left: triggerRect.right + GAP,
      },

      rightTop: {
        top: triggerRect.top,

        left: triggerRect.right + GAP,
      },

      rightBottom: {
        top: triggerRect.bottom - popupHeight,

        left: triggerRect.right + GAP,
      },

      left: {
        top: centerY,

        left: triggerRect.left - popupWidth - GAP,
      },

      leftTop: {
        top: triggerRect.top,

        left: triggerRect.left - popupWidth - GAP,
      },

      leftBottom: {
        top: triggerRect.bottom - popupHeight,

        left: triggerRect.left - popupWidth - GAP,
      },
    };

    const isValid = ({ top, left }) =>
      top >= MIN_TOP &&
      left >= GAP &&
      top + popupHeight <= viewportHeight - MIN_BOTTOM &&
      left + popupWidth <= viewportWidth - GAP;

    const normalizedDirection = normalizeDirection(direction);

    const priority = DIRECTIONS[normalizedDirection];

    let bestPosition = null;

    for (const positionName of priority) {
      if (isValid(positions[positionName])) {
        bestPosition = positions[positionName];

        break;
      }
    }

    if (!bestPosition) {
      const fallback = positions[priority[0]];

      bestPosition = {
        top: clamp(
          fallback.top,
          MIN_TOP,
          viewportHeight - MIN_BOTTOM - popupHeight,
        ),

        left: clamp(fallback.left, GAP, viewportWidth - GAP - popupWidth),
      };
    }

    setDynamicStyles({
      top: `${bestPosition.top}px`,

      left: `${bestPosition.left}px`,

      maxWidth: `${availableWidth}px`,

      maxHeight: `${availableHeight}px`,

      opacity: 1,
    });
  }, [type, triggerElement, direction, isHidden]);

  const positionMovablePopup = useCallback(
    ({ preserveUserPosition = false } = {}) => {
      const popup = popupContainerRef.current;

      if (type !== "movable" || !popup || isHidden) {
        return;
      }

      const viewportWidth = document.documentElement.clientWidth;

      const viewportHeight = document.documentElement.clientHeight;

      const availableWidth = Math.max(0, viewportWidth - GAP * 2);

      const availableHeight = Math.max(
        MIN_MOVABLE_HEIGHT,

        viewportHeight - MIN_TOP - MIN_BOTTOM,
      );

      popup.style.maxWidth = `${availableWidth}px`;

      popup.style.maxHeight = `${availableHeight}px`;

      const currentRect = popup.getBoundingClientRect();

      const contentHeight = popup.scrollHeight;

      naturalMovableHeightRef.current = Math.max(
        naturalMovableHeightRef.current,
        contentHeight,
      );

      const desiredHeight = Math.min(
        MAX_MOVABLE_HEIGHT,

        naturalMovableHeightRef.current,

        availableHeight,
      );

      const popupWidth = Math.min(currentRect.width, availableWidth);

      let left;
      let top;

      if (preserveUserPosition && hasMovedRef.current) {
        left = currentRect.left;
        top = currentRect.top;
      } else if (isUsableElement(triggerElement)) {
        const triggerRect = triggerElement.getBoundingClientRect();

        if (viewportWidth - triggerRect.right - GAP >= popupWidth) {
          left = triggerRect.right + GAP;
        } else if (triggerRect.left - GAP >= popupWidth) {
          left = triggerRect.left - popupWidth - GAP;
        } else {
          left = viewportWidth - popupWidth - GAP;
        }

        top = triggerRect.top;
      } else {
        left = currentRect.left || GAP;

        top = currentRect.top || MIN_TOP;
      }

      left = clamp(left, GAP, viewportWidth - popupWidth - GAP);

      const maxTopForMinimumHeight =
        viewportHeight - MIN_BOTTOM - MIN_MOVABLE_HEIGHT;

      top = clamp(top, MIN_TOP, maxTopForMinimumHeight);

      const availableBelow = viewportHeight - MIN_BOTTOM - top;

      const finalHeight = clamp(
        Math.min(desiredHeight, availableBelow),

        MIN_MOVABLE_HEIGHT,

        desiredHeight,
      );

      setDynamicStyles({
        top: `${top}px`,

        left: `${left}px`,

        height: `${finalHeight}px`,

        maxWidth: `${availableWidth}px`,

        maxHeight: `${availableHeight}px`,

        opacity: 1,
      });
    },
    [type, triggerElement, isHidden],
  );

  useLayoutEffect(() => {
    if (type !== "contextual" || isHidden) {
      return;
    }

    calculateContextualPosition();

    const update = () => scheduleFrame(calculateContextualPosition);

    window.addEventListener("resize", update);

    document.addEventListener("scroll", update, true);

    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;

    if (popupContainerRef.current) {
      observer?.observe(popupContainerRef.current);
    }

    if (isUsableElement(triggerElement)) {
      observer?.observe(triggerElement);
    }

    return () => {
      window.removeEventListener("resize", update);

      document.removeEventListener("scroll", update, true);

      observer?.disconnect();

      cancelFrame();
    };
  }, [
    type,
    isHidden,
    triggerElement,
    calculateContextualPosition,
    scheduleFrame,
    cancelFrame,
  ]);

  useLayoutEffect(() => {
    if (type !== "movable" || isHidden) {
      return;
    }

    hasMovedRef.current = false;

    naturalMovableHeightRef.current = 0;

    positionMovablePopup();

    const updateFromTrigger = () => {
      scheduleFrame(() => {
        positionMovablePopup({
          preserveUserPosition: hasMovedRef.current,
        });
      });
    };

    window.addEventListener("resize", updateFromTrigger);

    document.addEventListener("scroll", updateFromTrigger, true);

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (movableDragRef.current) {
              return;
            }

            updateFromTrigger();
          })
        : null;

    if (popupContentRef.current) {
      observer?.observe(popupContentRef.current);
    }

    if (isUsableElement(triggerElement)) {
      observer?.observe(triggerElement);
    }

    return () => {
      window.removeEventListener("resize", updateFromTrigger);

      document.removeEventListener("scroll", updateFromTrigger, true);

      observer?.disconnect();

      cancelFrame();
    };
  }, [
    type,
    isHidden,
    triggerElement,
    positionMovablePopup,
    scheduleFrame,
    cancelFrame,
  ]);

  const handleStartMoving = useCallback(
    (event) => {
      if (type !== "movable") {
        return;
      }

      if (event.button !== undefined && event.button !== 0) {
        return;
      }

      const popup = popupContainerRef.current;

      if (!popup) {
        return;
      }

      event.preventDefault();

      cleanupMovableDrag();

      hasMovedRef.current = true;

      const rect = popup.getBoundingClientRect();

      movableDragRef.current = {
        pointerId: event.pointerId,

        startX: event.clientX,

        startY: event.clientY,

        initialLeft: rect.left,

        initialTop: rect.top,

        desiredHeight: Math.min(
          MAX_MOVABLE_HEIGHT,

          naturalMovableHeightRef.current || rect.height,
        ),
      };

      document.body.classList.add("popup-dragging");

      const handlePointerMove = (moveEvent) => {
        const state = movableDragRef.current;

        const currentPopup = popupContainerRef.current;

        if (
          !state ||
          !currentPopup ||
          moveEvent.pointerId !== state.pointerId
        ) {
          return;
        }

        const viewportWidth = document.documentElement.clientWidth;

        const viewportHeight = document.documentElement.clientHeight;

        const popupRect = currentPopup.getBoundingClientRect();

        const popupWidth = popupRect.width;

        const rawLeft = state.initialLeft + moveEvent.clientX - state.startX;

        const rawTop = state.initialTop + moveEvent.clientY - state.startY;

        const nextLeft = clamp(rawLeft, GAP, viewportWidth - popupWidth - GAP);

        const maxTop = viewportHeight - MIN_BOTTOM - MIN_MOVABLE_HEIGHT;

        const nextTop = clamp(rawTop, MIN_TOP, maxTop);

        const availableBelow = viewportHeight - MIN_BOTTOM - nextTop;

        const nextHeight = clamp(
          Math.min(state.desiredHeight, availableBelow),

          MIN_MOVABLE_HEIGHT,

          state.desiredHeight,
        );

        currentPopup.style.left = `${nextLeft}px`;

        currentPopup.style.top = `${nextTop}px`;

        currentPopup.style.height = `${nextHeight}px`;
      };

      const finishDrag = (finishEvent) => {
        const state = movableDragRef.current;

        if (
          state &&
          finishEvent.pointerId !== undefined &&
          finishEvent.pointerId !== state.pointerId
        ) {
          return;
        }

        const currentPopup = popupContainerRef.current;

        if (currentPopup) {
          const rectAfterDrag = currentPopup.getBoundingClientRect();

          setDynamicStyles((current) => ({
            ...current,

            top: `${rectAfterDrag.top}px`,

            left: `${rectAfterDrag.left}px`,

            height: `${rectAfterDrag.height}px`,
          }));
        }

        cleanupMovableDrag();
      };

      document.addEventListener("pointermove", handlePointerMove);

      document.addEventListener("pointerup", finishDrag);

      document.addEventListener("pointercancel", finishDrag);

      dragCleanupRef.current = () => {
        document.removeEventListener("pointermove", handlePointerMove);

        document.removeEventListener("pointerup", finishDrag);

        document.removeEventListener("pointercancel", finishDrag);
      };
    },
    [type, cleanupMovableDrag],
  );

  const borderRadius =
    BR != null ? (typeof BR === "number" ? `${BR}px` : BR) : undefined;

  const motionVariants = getMotionVariants(type, direction);

  const style =
    type === "contextual" || type === "movable"
      ? {
          ...dynamicStyles,

          zIndex,

          opacity: isHidden ? 0 : dynamicStyles.opacity,

          pointerEvents: isHidden ? "none" : "auto",

          overflow: "hidden",

          borderRadius,

          transformOrigin: getTransformOrigin(direction),
        }
      : type === "centered"
        ? {
            zIndex,

            opacity: isHidden ? 0 : 1,

            pointerEvents: isHidden ? "none" : "auto",

            overflow: "hidden",

            borderRadius,
          }
        : {
            position: "fixed",

            zIndex,

            opacity: isHidden ? 0 : 1,

            pointerEvents: isHidden ? "none" : "auto",

            overflow: "hidden",

            borderRadius,
          };

  return (
    <motion.div
      ref={popupContainerRef}
      className={`${
        type === "contextual" || type === "movable"
          ? styles.popupContextual
          : type === "centered"
            ? styles.popupCentered
            : styles.popupDefault
      } ${type === "movable" ? styles.popupMovable : ""} ${
        type === "movable" ? "shadow-effect" : ""
      }`}
      style={style}
      initial={motionVariants.initial}
      animate={
        isHidden
          ? {
              ...motionVariants.animate,
              opacity: 0,
            }
          : motionVariants.animate
      }
      exit={motionVariants.exit}
      transition={{
        duration: 0.16,
        ease: "easeOut",
      }}
      aria-hidden={isHidden}
    >
      <motion.div ref={popupContentRef} className={styles.popupContent}>
        {type === "movable" ? (
          <div className={styles.movableContainer}>
            <div
              className={styles.header}
              onPointerDown={handleStartMoving}
              style={{
                touchAction: "none",
              }}
            >
              <TwoLinesIcon />

              <div
                className={styles.closeBtn}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <CustomButton onClick={onClose}>
                  <CloseIcon />
                </CustomButton>
              </div>
            </div>

            <div className={`${styles.content} default-scrollbar`}>
              {children}
            </div>
          </div>
        ) : (
          children
        )}
      </motion.div>
    </motion.div>
  );
}

export default Popup;
