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
const MAX_MOVABLE_HEIGHT = 1024;
const MAX_MOVABLE_VIEWPORT_RATIO = 0.7;

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
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function isUsableElement(element) {
  return element instanceof Element && element.isConnected;
}

function normalizeDirection(direction) {
  if (typeof direction !== "string") return "bottom";

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
      container: {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      },
      child: {
        initial: { opacity: 0, scale: 0.94, y: 8 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.96, y: -4 },
      },
    };
  }

  if (type === "movable") {
    return {
      initial: {
        opacity: 0,
        scale: 0.97,
        y: 10,
      },
      animate: {
        opacity: 1,
        scale: 1,
        y: 0,
      },
      exit: {
        opacity: 0,
        scale: 0.985,
        y: -6,
      },
    };
  }

  const normalized = normalizeDirection(direction);

  if (normalized.startsWith("bottom")) {
    return {
      initial: { opacity: 0, scale: 0.96, y: -8 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.97, y: -5 },
    };
  }

  if (normalized.startsWith("top")) {
    return {
      initial: { opacity: 0, scale: 0.96, y: 8 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.97, y: 5 },
    };
  }

  if (normalized.startsWith("right")) {
    return {
      initial: { opacity: 0, scale: 0.96, x: -8 },
      animate: { opacity: 1, scale: 1, x: 0 },
      exit: { opacity: 0, scale: 0.97, x: -5 },
    };
  }

  return {
    initial: { opacity: 0, scale: 0.96, x: 8 },
    animate: { opacity: 1, scale: 1, x: 0 },
    exit: { opacity: 0, scale: 0.97, x: 5 },
  };
}

function getPopupTransition(type) {
  if (type === "movable") {
    return {
      opacity: { duration: 0.14 },
      scale: {
        duration: 0.2,
        ease: [0.22, 1, 0.36, 1],
      },
      y: {
        duration: 0.2,
        ease: [0.22, 1, 0.36, 1],
      },
    };
  }

  return {
    duration: 0.16,
    ease: "easeOut",
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
  const movableContainerRef = useRef(null);
  const movableHeaderRef = useRef(null);
  const naturalContentRef = useRef(null);
  const frameRef = useRef(null);
  const secondFrameRef = useRef(null);
  const dragCleanupRef = useRef(null);
  const movableDragRef = useRef(null);
  const naturalMovableHeightRef = useRef(MIN_MOVABLE_HEIGHT);
  const hasMovedRef = useRef(false);
  const mountedRef = useRef(false);
  const lastMovableTriggerRef = useRef(null);

  const [dynamicStyles, setDynamicStyles] = useState({
    opacity: 0,
  });

  const cancelFrames = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (secondFrameRef.current !== null) {
      cancelAnimationFrame(secondFrameRef.current);
      secondFrameRef.current = null;
    }
  }, []);

  const scheduleFrame = useCallback(
    (callback) => {
      cancelFrames();

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        callback();
      });
    },
    [cancelFrames],
  );

  const scheduleStableFrame = useCallback(
    (callback) => {
      cancelFrames();

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;

        secondFrameRef.current = requestAnimationFrame(() => {
          secondFrameRef.current = null;
          callback();
        });
      });
    },
    [cancelFrames],
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
      cancelFrames();
      cleanupMovableDrag();
    };
  }, [cancelFrames, cleanupMovableDrag]);

  useEffect(() => {
    if (!isTopmost || isHidden) return;

    const handlePointerDown = (event) => {
      if (
        document.body.classList.contains("popup-dragging") ||
        document.body.classList.contains("dragging") ||
        document.body.classList.contains("resizing")
      ) {
        return;
      }

      const target = event.target;

      if (!(target instanceof Node)) return;
      if (popupContentRef.current?.contains(target)) return;

      if (isUsableElement(triggerElement) && triggerElement.contains(target)) {
        return;
      }

      queueMicrotask(() => {
        if (mountedRef.current) onClose();
      });
    };

    const handleKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;

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
      bottom: { top: triggerRect.bottom + GAP, left: centerX },
      bottomLeft: { top: triggerRect.bottom + GAP, left: triggerRect.left },
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
      right: { top: centerY, left: triggerRect.right + GAP },
      rightTop: { top: triggerRect.top, left: triggerRect.right + GAP },
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

  const measureNaturalMovableHeight = useCallback(() => {
    const header = movableHeaderRef.current;
    const naturalContent = naturalContentRef.current;

    if (type !== "movable" || !header || !naturalContent || isHidden) {
      return MIN_MOVABLE_HEIGHT;
    }

    const headerHeight = header.getBoundingClientRect().height;
    const contentHeight = naturalContent.scrollHeight;

    const naturalHeight = Math.max(
      MIN_MOVABLE_HEIGHT,
      Math.ceil(headerHeight + contentHeight),
    );

    naturalMovableHeightRef.current = naturalHeight;

    return naturalHeight;
  }, [type, isHidden]);

  const getMovableMaximumHeight = useCallback(() => {
    const viewportHeight = document.documentElement.clientHeight;

    return Math.max(
      MIN_MOVABLE_HEIGHT,
      Math.min(
        MAX_MOVABLE_HEIGHT,
        viewportHeight * MAX_MOVABLE_VIEWPORT_RATIO,
        viewportHeight - MIN_TOP - MIN_BOTTOM,
      ),
    );
  }, []);

  const positionMovablePopup = useCallback(
    ({ preserveUserPosition = false } = {}) => {
      const popup = popupContainerRef.current;

      if (type !== "movable" || !popup || isHidden) return;

      if (lastMovableTriggerRef.current !== triggerElement) {
        lastMovableTriggerRef.current = triggerElement;
        hasMovedRef.current = false;
      }

      const naturalHeight = measureNaturalMovableHeight();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const availableWidth = Math.max(0, viewportWidth - GAP * 2);
      const maximumHeight = getMovableMaximumHeight();
      const desiredHeight = clamp(
        naturalHeight,
        MIN_MOVABLE_HEIGHT,
        maximumHeight,
      );

      popup.style.maxWidth = `${availableWidth}px`;

      const popupRect = popup.getBoundingClientRect();
      const popupWidth = Math.min(popupRect.width, availableWidth);

      if (preserveUserPosition && hasMovedRef.current) {
        const left = clamp(
          popupRect.left,
          GAP,
          viewportWidth - popupWidth - GAP,
        );

        const top = clamp(
          popupRect.top,
          MIN_TOP,
          viewportHeight - MIN_BOTTOM - MIN_MOVABLE_HEIGHT,
        );

        const availableBelow = viewportHeight - MIN_BOTTOM - top;

        const finalHeight = Math.max(
          MIN_MOVABLE_HEIGHT,
          Math.min(desiredHeight, availableBelow),
        );

        setDynamicStyles({
          top: `${top}px`,
          left: `${left}px`,
          height: `${finalHeight}px`,
          maxWidth: `${availableWidth}px`,
          maxHeight: `${maximumHeight}px`,
          opacity: 1,
        });

        return;
      }

      let left = GAP;
      let top = MIN_TOP;
      let finalHeight = desiredHeight;

      if (isUsableElement(triggerElement)) {
        const triggerRect = triggerElement.getBoundingClientRect();

        const rightLeft = triggerRect.right + GAP;
        const leftLeft = triggerRect.left - GAP - popupWidth;

        const fitsRight = rightLeft + popupWidth <= viewportWidth - GAP;

        const fitsLeft = leftLeft >= GAP;

        if (fitsRight || fitsLeft) {
          left = fitsRight ? rightLeft : leftLeft;

          top = clamp(
            triggerRect.top,
            MIN_TOP,
            viewportHeight - MIN_BOTTOM - desiredHeight,
          );

          finalHeight = desiredHeight;
        } else {
          const spaceAbove = Math.max(0, triggerRect.top - GAP - MIN_TOP);

          const spaceBelow = Math.max(
            0,
            viewportHeight - MIN_BOTTOM - triggerRect.bottom - GAP,
          );

          const horizontalLeft = clamp(
            triggerRect.left + triggerRect.width / 2 - popupWidth / 2,
            GAP,
            viewportWidth - popupWidth - GAP,
          );

          const triggerCenterY = triggerRect.top + triggerRect.height / 2;

          const preferBelow = triggerCenterY <= viewportHeight / 2;

          const fitsDesiredBelow = spaceBelow >= desiredHeight;
          const fitsDesiredAbove = spaceAbove >= desiredHeight;

          left = horizontalLeft;

          if (preferBelow) {
            if (fitsDesiredBelow) {
              finalHeight = desiredHeight;
              top = triggerRect.bottom + GAP;
            } else if (fitsDesiredAbove) {
              finalHeight = desiredHeight;
              top = triggerRect.top - GAP - desiredHeight;
            } else if (spaceBelow >= MIN_MOVABLE_HEIGHT) {
              finalHeight = Math.min(desiredHeight, spaceBelow);
              top = triggerRect.bottom + GAP;
            } else {
              finalHeight = Math.min(desiredHeight, spaceAbove);
              top = triggerRect.top - GAP - finalHeight;
            }
          } else {
            if (fitsDesiredAbove) {
              finalHeight = desiredHeight;
              top = triggerRect.top - GAP - desiredHeight;
            } else if (fitsDesiredBelow) {
              finalHeight = desiredHeight;
              top = triggerRect.bottom + GAP;
            } else if (spaceAbove >= MIN_MOVABLE_HEIGHT) {
              finalHeight = Math.min(desiredHeight, spaceAbove);
              top = triggerRect.top - GAP - finalHeight;
            } else {
              finalHeight = Math.min(desiredHeight, spaceBelow);
              top = triggerRect.bottom + GAP;
            }
          }
        }

        const popupBottom = top + finalHeight;
        const popupRight = left + popupWidth;

        const overlapsTrigger =
          left < triggerRect.right &&
          popupRight > triggerRect.left &&
          top < triggerRect.bottom &&
          popupBottom > triggerRect.top;

        if (overlapsTrigger) {
          const spaceAbove = Math.max(0, triggerRect.top - GAP - MIN_TOP);

          const spaceBelow = Math.max(
            0,
            viewportHeight - MIN_BOTTOM - triggerRect.bottom - GAP,
          );

          const horizontalLeft = clamp(
            triggerRect.left + triggerRect.width / 2 - popupWidth / 2,
            GAP,
            viewportWidth - popupWidth - GAP,
          );

          const triggerCenterY = triggerRect.top + triggerRect.height / 2;

          const preferBelow = triggerCenterY <= viewportHeight / 2;

          left = horizontalLeft;

          if (preferBelow && spaceBelow >= MIN_MOVABLE_HEIGHT) {
            finalHeight = Math.min(desiredHeight, spaceBelow);
            top = triggerRect.bottom + GAP;
          } else if (spaceAbove >= MIN_MOVABLE_HEIGHT) {
            finalHeight = Math.min(desiredHeight, spaceAbove);
            top = triggerRect.top - GAP - finalHeight;
          } else if (spaceBelow >= MIN_MOVABLE_HEIGHT) {
            finalHeight = Math.min(desiredHeight, spaceBelow);
            top = triggerRect.bottom + GAP;
          }
        }
      } else {
        const rect = popup.getBoundingClientRect();

        left = clamp(rect.left || GAP, GAP, viewportWidth - popupWidth - GAP);

        top = clamp(
          rect.top || MIN_TOP,
          MIN_TOP,
          viewportHeight - MIN_BOTTOM - desiredHeight,
        );
      }

      finalHeight = Math.max(
        Math.min(MIN_MOVABLE_HEIGHT, maximumHeight),
        Math.min(finalHeight, maximumHeight),
      );

      setDynamicStyles({
        top: `${top}px`,
        left: `${left}px`,
        height: `${finalHeight}px`,
        maxWidth: `${availableWidth}px`,
        maxHeight: `${maximumHeight}px`,
        opacity: 1,
      });
    },
    [
      type,
      triggerElement,
      isHidden,
      measureNaturalMovableHeight,
      getMovableMaximumHeight,
    ],
  );

  useLayoutEffect(() => {
    if (type !== "contextual" || isHidden) return;

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
      cancelFrames();
    };
  }, [
    type,
    isHidden,
    triggerElement,
    calculateContextualPosition,
    scheduleFrame,
    cancelFrames,
  ]);

  useLayoutEffect(() => {
    if (type !== "movable" || isHidden) return;

    hasMovedRef.current = false;
    naturalMovableHeightRef.current = MIN_MOVABLE_HEIGHT;
    lastMovableTriggerRef.current = triggerElement;

    setDynamicStyles({
      opacity: 0,
    });

    const update = () => {
      scheduleFrame(() => {
        positionMovablePopup({
          preserveUserPosition: hasMovedRef.current,
        });
      });
    };

    positionMovablePopup();

    scheduleStableFrame(() => {
      positionMovablePopup();
    });

    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (movableDragRef.current) return;
            update();
          })
        : null;

    if (naturalContentRef.current) {
      observer?.observe(naturalContentRef.current);
    }

    if (movableHeaderRef.current) {
      observer?.observe(movableHeaderRef.current);
    }

    if (isUsableElement(triggerElement)) {
      observer?.observe(triggerElement);
    }

    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
      observer?.disconnect();
      cancelFrames();
    };
  }, [
    type,
    isHidden,
    triggerElement,
    positionMovablePopup,
    scheduleFrame,
    scheduleStableFrame,
    cancelFrames,
  ]);

  const handleStartMoving = useCallback(
    (event) => {
      if (type !== "movable") return;
      if (event.button !== undefined && event.button !== 0) return;

      const popup = popupContainerRef.current;

      if (!popup) return;

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
          getMovableMaximumHeight(),
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

        const nextTop = clamp(
          rawTop,
          MIN_TOP,
          viewportHeight - MIN_BOTTOM - MIN_MOVABLE_HEIGHT,
        );

        const availableBelow = viewportHeight - MIN_BOTTOM - nextTop;

        const nextHeight = Math.max(
          MIN_MOVABLE_HEIGHT,
          Math.min(state.desiredHeight, availableBelow),
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
          const rect = currentPopup.getBoundingClientRect();

          setDynamicStyles((current) => ({
            ...current,
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            height: `${rect.height}px`,
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
    [type, cleanupMovableDrag, getMovableMaximumHeight],
  );

  const borderRadius =
    BR != null ? (typeof BR === "number" ? `${BR}px` : BR) : undefined;

  const motionVariants = getMotionVariants(type, direction);

  const activeMotionVariants =
    type === "centered" ? motionVariants.container : motionVariants;

  const style =
    type === "contextual" || type === "movable"
      ? {
          ...dynamicStyles,
          zIndex,
          opacity: isHidden ? 0 : dynamicStyles.opacity,
          pointerEvents: isHidden ? "none" : "auto",
          overflow: "hidden",
          borderRadius,
          transformOrigin:
            type === "movable"
              ? "center center"
              : getTransformOrigin(direction),
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

  const childMotionProps =
    type === "centered"
      ? {
          initial: motionVariants.child.initial,
          animate: isHidden
            ? {
                ...motionVariants.child.animate,
                opacity: 0,
              }
            : motionVariants.child.animate,
          exit: motionVariants.child.exit,
          transition: getPopupTransition("centered"),
        }
      : {};

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
      initial={activeMotionVariants.initial}
      animate={
        isHidden
          ? {
              ...activeMotionVariants.animate,
              opacity: 0,
            }
          : activeMotionVariants.animate
      }
      exit={activeMotionVariants.exit}
      transition={getPopupTransition(type)}
      aria-hidden={isHidden}
    >
      <motion.div
        ref={popupContentRef}
        className={styles.popupContent}
        {...childMotionProps}
      >
        {type === "movable" ? (
          <div ref={movableContainerRef} className={styles.movableContainer}>
            <div
              ref={movableHeaderRef}
              className={styles.header}
              onPointerDown={handleStartMoving}
              style={{ touchAction: "none" }}
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
              <div ref={naturalContentRef} className={styles.naturalContent}>
                {children}
              </div>
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
