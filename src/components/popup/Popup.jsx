import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import styles from "./Popup.module.css";
import CustomButton from "../button/Button";
import { CloseIcon, TwoLinesIcon } from "../../assets/icons/Icon";

function Popup({
  type,
  triggerElement,
  direction = "bottom", // Default to bottom
  onClose,
  children,
  isTopmost,
  BR,
  isHidden,
}) {
  const popupRef = useRef(null);
  const popupContainerRef = useRef(null);
  const initialHeightRef = useRef(null);
  const [dynamicStyles, setDynamicStyles] = useState({ opacity: 0 });

  // --- 1. Handle Outside Click & Escape ---
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        isTopmost &&
        popupRef.current &&
        !popupRef.current.contains(e.target) &&
        triggerElement !== e.target
      ) {
        onClose();
      }
    };
    const handleEsc = (e) => {
      if (e.key === "Escape" && isTopmost) onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose, isTopmost, triggerElement]);

  // --- 2. Contextual Positioning Logic (Updated) ---
  useLayoutEffect(() => {
    if (popupContainerRef.current && initialHeightRef.current == null) {
      initialHeightRef.current = popupContainerRef.current.offsetHeight;
    }

    if (type !== "contextual" || !triggerElement || !popupRef.current) {
      return;
    }

    const calculateAndSetStyles = () => {
      const tr = triggerElement.getBoundingClientRect(); // tr = Trigger Rect
      const pr = popupRef.current.getBoundingClientRect(); // pr = Popup Rect

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const gap = 8;
      const minTop = 30;
      const minBottom = 30;

      // Helper for horizontal centering
      const centerX = tr.left + tr.width / 2 - pr.width / 2;
      // Helper for vertical centering
      const centerY = tr.top + tr.height / 2 - pr.height / 2;

      // --- A. Define All 12 Possible Positions ---
      const positions = {
        // 1. Bottom Variations
        bottom: { top: tr.bottom + gap, left: centerX }, // Centered
        bottomLeft: { top: tr.bottom + gap, left: tr.left }, // Aligns with Left edge
        bottomRight: { top: tr.bottom + gap, left: tr.right - pr.width }, // Aligns with Right edge

        // 2. Top Variations
        top: { top: tr.top - pr.height - gap, left: centerX }, // Centered
        topLeft: { top: tr.top - pr.height - gap, left: tr.left }, // Aligns with Left edge
        topRight: { top: tr.top - pr.height - gap, left: tr.right - pr.width }, // Aligns with Right edge

        // 3. Right Variations
        right: { top: centerY, left: tr.right + gap }, // Centered
        rightTop: { top: tr.top, left: tr.right + gap }, // Aligns with Top edge
        rightBottom: { top: tr.bottom - pr.height, left: tr.right + gap }, // Aligns with Bottom edge

        // 4. Left Variations
        left: { top: centerY, left: tr.left - pr.width - gap }, // Centered
        leftTop: { top: tr.top, left: tr.left - pr.width - gap }, // Aligns with Top edge
        leftBottom: {
          top: tr.bottom - pr.height,
          left: tr.left - pr.width - gap,
        }, // Aligns with Bottom edge
      };

      // --- B. Define Fallback Priority Logic ---
      // If the requested direction fits, use it. If not, try the next one in the list.
      const priority = {
        // Bottom preferences
        bottom: ["bottom", "bottomLeft", "bottomRight", "top", "right", "left"],
        bottomLeft: [
          "bottomLeft",
          "bottomRight",
          "bottom",
          "topLeft",
          "rightBottom",
        ],
        bottomRight: [
          "bottomRight",
          "bottomLeft",
          "bottom",
          "topRight",
          "leftBottom",
        ],

        // Top preferences
        top: ["top", "topLeft", "topRight", "bottom", "right", "left"],
        topLeft: ["topLeft", "topRight", "top", "bottomLeft", "rightTop"],
        topRight: ["topRight", "topLeft", "top", "bottomRight", "leftTop"],

        // Right preferences
        right: ["right", "rightTop", "rightBottom", "left", "bottom", "top"],
        rightTop: ["rightTop", "rightBottom", "right", "leftTop", "bottomLeft"],
        rightBottom: [
          "rightBottom",
          "rightTop",
          "right",
          "leftBottom",
          "topLeft",
        ],

        // Left preferences
        left: ["left", "leftTop", "leftBottom", "right", "bottom", "top"],
        leftTop: ["leftTop", "leftBottom", "left", "rightTop", "bottomRight"],
        leftBottom: [
          "leftBottom",
          "leftTop",
          "left",
          "rightBottom",
          "topRight",
        ],
      };

      const isPositionValid = (pos) => {
        return (
          pos.top >= minTop &&
          pos.left >= gap &&
          pos.top + pr.height <= viewportHeight - minBottom &&
          pos.left + pr.width <= viewportWidth - gap
        );
      };

      // --- C. Find The First Position That Fits ---
      let bestPosition = null;
      const priorityList = priority[direction] || priority["bottom"];

      for (const posName of priorityList) {
        const currentPos = positions[posName];
        if (isPositionValid(currentPos)) {
          bestPosition = currentPos;
          break;
        }
      }

      // --- D. Fallback (Force into Viewport) ---
      if (!bestPosition) {
        bestPosition = positions[priorityList[0]]; // Default to requested direction

        // Clamp Horizontal
        if (bestPosition.left < gap) bestPosition.left = gap;
        if (bestPosition.left + pr.width > viewportWidth - gap) {
          bestPosition.left = viewportWidth - gap - pr.width;
        }

        // Clamp Vertical
        if (bestPosition.top < minTop) bestPosition.top = minTop;
        if (bestPosition.top + pr.height > viewportHeight - minBottom) {
          bestPosition.top = viewportHeight - minBottom - pr.height;
        }
      }

      setDynamicStyles({
        top: `${bestPosition.top}px`,
        left: `${bestPosition.left}px`,
        opacity: 1,
      });
    };

    queueMicrotask(calculateAndSetStyles);

    window.addEventListener("scroll", calculateAndSetStyles, { passive: true });
    window.addEventListener("resize", calculateAndSetStyles);

    return () => {
      window.removeEventListener("scroll", calculateAndSetStyles);
      window.removeEventListener("resize", calculateAndSetStyles);
    };
  }, [triggerElement, direction, type]);

  // --- 3. Movable Popup Logic (Unchanged) ---
  useLayoutEffect(() => {
    if (type !== "movable" || !triggerElement || !popupRef.current) return;
    const tr = triggerElement.getBoundingClientRect();
    const pr = popupRef.current.getBoundingClientRect();

    const gap = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const bottomMargin = 30;

    // Horizontal
    let finalLeft;
    if (viewportWidth - tr.right - gap >= pr.width) {
      finalLeft = tr.right + gap;
    } else if (tr.left - gap >= pr.width) {
      finalLeft = tr.left - pr.width - gap;
    } else {
      finalLeft = Math.max(gap, viewportWidth - pr.width - gap);
    }

    // Vertical
    let finalTop = tr.top;
    if (finalTop < gap) {
      finalTop = gap;
    } else if (finalTop + pr.height > viewportHeight - gap) {
      finalTop = Math.max(gap, viewportHeight - pr.height - gap - bottomMargin);
    }

    setDynamicStyles({
      top: `${finalTop}px`,
      left: `${finalLeft}px`,
      opacity: 1,
    });
  }, [type, triggerElement]);

  // --- 4. Drag Handler (Unchanged) ---
  function handleStartMoving(e) {
    if (type !== "movable") return;
    const popup = popupContainerRef.current;
    if (!popup) return;
    document.body.classList.add("popup-dragging");
    const startX = e.clientX;
    const startY = e.clientY;
    const initialLeft = parseFloat(getComputedStyle(popup).left);
    const initialTop = parseFloat(getComputedStyle(popup).top);
    const trueInitialHeight = initialHeightRef.current;
    const maxHeight = Math.min(574, trueInitialHeight);
    const minHeight = 60;
    const minTop = 30;

    const handleMouseMove = (moveEvent) => {
      const viewportHeight = window.innerHeight;
      let newTop = initialTop + moveEvent.clientY - startY;
      if (newTop < minTop) newTop = minTop;
      let newHeight = maxHeight;
      const bottomEdge = newTop + newHeight;
      const maxAllowedBottom = viewportHeight - 30;
      if (bottomEdge > maxAllowedBottom) {
        newHeight = maxAllowedBottom - newTop;
      }
      newHeight = Math.max(minHeight, newHeight);
      popup.style.left = `${initialLeft + moveEvent.clientX - startX}px`;
      popup.style.top = `${newTop}px`;
      popup.style.height = `${newHeight}px`;
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.classList.remove("popup-dragging");
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  // --- 5. Render ---
  return (
    <motion.div
      ref={popupContainerRef}
      id="popup"
      className={`${
        type === "contextual" || type === "movable"
          ? styles.popupContextual
          : type === "centered"
            ? styles.popupCentered
            : styles.popupDefault
      } ${type === "movable" ? styles.popupMovable : ""} ${
        type === "movable" ? "shadow-effect" : ""
      }`}
      style={
        type === "contextual" || type === "movable"
          ? {
              ...dynamicStyles,
              opacity: isHidden ? 0 : dynamicStyles.opacity, // 🔥 Hides it safely
              pointerEvents: isHidden ? "none" : "auto", // 🔥 Stops phantom clicks
              overflow: "hidden",
              borderRadius:
                BR != null
                  ? typeof BR === "number"
                    ? `${BR}px`
                    : BR
                  : undefined,
            }
          : type === "centered"
            ? {
                zIndex: isTopmost ? 1100 : 1000,
                opacity: isHidden ? 0 : 1, // 🔥
                pointerEvents: isHidden ? "none" : "auto", // 🔥
                overflow: "hidden",
                borderRadius:
                  BR != null
                    ? typeof BR === "number"
                      ? `${BR}px`
                      : BR
                    : undefined,
              }
            : {
                position: "fixed",
                opacity: isHidden ? 0 : 1, // 🔥
                pointerEvents: isHidden ? "none" : "auto", // 🔥
                overflow: "hidden",
                borderRadius:
                  BR != null
                    ? typeof BR === "number"
                      ? `${BR}px`
                      : BR
                    : undefined,
              }
      }
      initial={{ opacity: 0 }}
      animate={{ opacity: isHidden ? 0 : 1 }} // 🔥 Automates smooth fade in/out
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: "easeInOut" }}
    >
      <motion.div
        ref={popupRef}
        className={styles.popupContent}
        initial={type === "centered" ? { scale: 0.8 } : false}
        animate={type === "centered" ? { scale: 1 } : false}
        exit={type === "centered" ? { scale: 0.8 } : false}
        transition={{ duration: 0.2, ease: "easeInOut" }}
      >
        {type === "movable" ? (
          <div className={styles.movableContainer}>
            <div className={styles.header} onMouseDown={handleStartMoving}>
              <TwoLinesIcon />
              <div className={styles.closeBtn}>
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
