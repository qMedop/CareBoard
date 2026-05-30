import React, { useRef, useState } from "react";

export default function MobileSwapperWrapper({
  children,
  onSwipeLeft,
  onSwipeRight,
  disabled,
}) {
  const touchStart = useRef({ x: 0, y: 0 });
  const isSwiping = useRef(false);
  const isScrollingVertically = useRef(false);

  // Configuration thresholds
  const IGNORE_THRESHOLD_PX = 15; // Ignore anything under 15px (hair-trigger fix)
  const SWIPE_CONFIRM_DISTANCE = 50; // Distance needed to register a page turn

  const onTouchStart = (e) => {
    if (disabled) return;
    touchStart.current = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    };
    isSwiping.current = false;
    isScrollingVertically.current = false;
  };

  const onTouchMove = (e) => {
    if (disabled || isScrollingVertically.current) return;

    const deltaX = e.targetTouches[0].clientX - touchStart.current.x;
    const deltaY = e.targetTouches[0].clientY - touchStart.current.y;

    // Determine intent on initial movement outside the deadzone
    if (!isSwiping.current && !isScrollingVertically.current) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absX > IGNORE_THRESHOLD_PX || absY > IGNORE_THRESHOLD_PX) {
        if (absY > absX) {
          // User is scrolling vertically through hours -> block swiper completely
          isScrollingVertically.current = true;
        } else {
          // User is explicitly intent on swiping horizontally
          isSwiping.current = true;
        }
      }
    }
  };

  const onTouchEnd = (e) => {
    if (disabled || !isSwiping.current || isScrollingVertically.current) return;

    const finalDeltaX = e.changedTouches[0].clientX - touchStart.current.x;

    if (Math.abs(finalDeltaX) > SWIPE_CONFIRM_DISTANCE) {
      if (finalDeltaX < 0 && onSwipeLeft) {
        onSwipeLeft(); // Next page
      } else if (finalDeltaX > 0 && onSwipeRight) {
        onSwipeRight(); // Previous page
      }
    }

    isSwiping.current = false;
    isScrollingVertically.current = false;
  };

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ height: "100%", width: "100%" }}
    >
      {children}
    </div>
  );
}
