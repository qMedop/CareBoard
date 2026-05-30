// src/components/CustomButton.jsx

import { NavLink } from "react-router-dom";
import useClickEffect from "../../hooks/useClickEffect";
import btnStyles from "./Button.module.css";
import clikableStyles from "./clikable.module.css";
import { ArrowDownIcon } from "../../assets/icons/Icon";
import { useEffect, useRef, useState } from "react";
import { useInfoTrigger } from "../../hooks/useInfoTrigger";

function CustomButton({
  link = false,
  href = "",
  onClick,
  children,
  type = "button",
  className = "",
  ariaLabel = "",
  ClickEffect = true,
  dataInfo,
  infoClassName, // Prop for custom tooltip styling
  infoPosition, // Prop for preferred position ('top', 'bottom', 'left', 'right')
  ...props
}) {
  const { ref, isMouseDown, isMousePressed, handleMouseDown } = useClickEffect(
    ClickEffect && ClickEffect !== "scale",
  );
  const scaleRef = useRef(null);
  const [ripples, setRipples] = useState([]);
  const { getInfoTriggerProps } = useInfoTrigger();

  // Generate the hover/click props for the tooltip from our custom hook
  const infoTriggerProps = getInfoTriggerProps(dataInfo, {
    className: infoClassName,
    position: infoPosition,
  });

  // Handle scale / scaleDown effects
  const handleScaleDown = (e) => {
    // scaleDown: simple shrink on pointer down, reset on pointer up (document)
    if (ClickEffect === "scaleDown") {
      const button = scaleRef.current;
      if (!button) return;
      button.style.transition = "transform 120ms";
      button.style.transform = "scale(0.95)";
      return;
    }

    // scale: ripple-style effect
    if (ClickEffect === "scale") {
      const button = scaleRef.current;
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      setRipples((prev) => [
        ...prev,
        {
          key: Date.now() + Math.random(),
          x,
          y,
          size,
          visible: true,
        },
      ]);
      return;
    }

    // fallback: use hook behaviour
    handleMouseDown(e);
  };

  // Mouse up effect on document for scale effect
  useEffect(() => {
    if (ClickEffect !== "scale") return;
    const handleScaleUp = () => {
      setRipples((prev) => prev.map((r) => ({ ...r, visible: false })));
    };
    document.addEventListener("pointerup", handleScaleUp);
    document.addEventListener("pointercancel", handleScaleUp);
    document.addEventListener("touchend", handleScaleUp);
    document.addEventListener("touchcancel", handleScaleUp);
    return () => {
      document.removeEventListener("pointerup", handleScaleUp);
      document.removeEventListener("pointercancel", handleScaleUp);
      document.removeEventListener("touchend", handleScaleUp);
      document.removeEventListener("touchcancel", handleScaleUp);
    };
  }, [ClickEffect]);

  // Mouse up effect on document for scaleDown effect: remove transform
  useEffect(() => {
    if (ClickEffect !== "scaleDown") return;
    const handleScaleDownUp = () => {
      const button = scaleRef.current;
      if (!button) return;
      button.style.transform = "";
    };
    document.addEventListener("pointerup", handleScaleDownUp);
    document.addEventListener("pointercancel", handleScaleDownUp);
    document.addEventListener("touchend", handleScaleDownUp);
    document.addEventListener("touchcancel", handleScaleDownUp);
    return () => {
      document.removeEventListener("pointerup", handleScaleDownUp);
      document.removeEventListener("pointercancel", handleScaleDownUp);
      document.removeEventListener("touchend", handleScaleDownUp);
      document.removeEventListener("touchcancel", handleScaleDownUp);
    };
  }, [ClickEffect]);

  const handleRippleTransitionEnd = (key) => {
    setRipples((prev) => prev.filter((r) => r.key !== key));
  };
  const handleMouseEnter = (e) => {
    e.currentTarget.querySelector(".effecctBgColor").style.backgroundColor =
      "var(--bg-click-effect)";
  };

  const handleMouseLeave = (e) => {
    e.currentTarget.querySelector(".effecctBgColor").style.backgroundColor =
      null;
  };
  const customClasses = className
    .split(" ")
    .map((cls) => btnStyles[cls] || cls)
    .join(" ");

  const scaleEffectClass =
    ClickEffect === "scale" ? clikableStyles.scaleEffect : "";

  const commonClasses = `${ClickEffect ? clikableStyles.clikable : ""} ${
    isMouseDown ? clikableStyles.mouseDown : ""
  } ${
    isMousePressed ? clikableStyles.pressed : ""
  } ${scaleEffectClass} ${customClasses}`;

  const rippleSpans =
    ClickEffect === "scale"
      ? ripples.map((ripple) => (
          <span
            key={ripple.key}
            className={clikableStyles.ripple}
            style={{
              position: "absolute",
              left: ripple.x,
              top: ripple.y,
              width: ripple.size,
              height: ripple.size,
              opacity: ripple.visible ? 0.3 : 0,
              transform: ripple.visible ? "scale(1)" : "scale(1.5)",
              transition: ripple.visible
                ? "none"
                : "opacity 400ms, transform 400ms",
            }}
            onTransitionEnd={() => handleRippleTransitionEnd(ripple.key)}
          />
        ))
      : null;

  // choose ref: scale or scaleDown both use scaleRef, others use hook ref
  const elementRef =
    ClickEffect === "scale" || ClickEffect === "scaleDown" ? scaleRef : ref;

  if (link) {
    // Render as NavLink
    return (
      <NavLink
        ref={elementRef}
        to={href}
        onPointerDown={handleScaleDown}
        className={`${btnStyles.button} ${commonClasses} ${
          type === "select" ? btnStyles.select : ""
        }`}
        aria-label={ariaLabel}
        draggable="false"
        onClick={(e) => {
          infoTriggerProps.onClick?.(e); // hide tooltip
          onClick?.(e); // call user-provided click
        }}
        onMouseEnter={infoTriggerProps.onMouseEnter}
        onMouseLeave={infoTriggerProps.onMouseLeave}
        {...props}
      >
        <>
          {children}
          {rippleSpans}
          {ClickEffect && ClickEffect !== "scale" && (
            <div className={clikableStyles.interactions}>
              <div className={clikableStyles.stroke}></div>
            </div>
          )}
        </>
      </NavLink>
    );
  }

  // Render as Button
  return (
    <button
      onPointerEnter={handleMouseEnter}
      onPointerLeave={handleMouseLeave}
      ref={elementRef}
      type={type}
      onPointerDown={handleScaleDown}
      className={`${btnStyles.button} ${commonClasses} ${
        type === "select" ? btnStyles.select : ""
      }`}
      aria-label={ariaLabel}
      onClick={(e) => {
        infoTriggerProps.onClick?.(e); // hide tooltip
        onClick?.(e); // call user-provided click
      }}
      onMouseEnter={infoTriggerProps.onMouseEnter}
      onMouseLeave={infoTriggerProps.onMouseLeave}
      {...props}
    >
      {type === "select" && <span className={btnStyles.select}></span>}

      {type === "list" ? (
        <>
          {children}
          <ArrowDownIcon className={`arrow ${btnStyles.arrowDown}`} />
        </>
      ) : (
        children
      )}
      {rippleSpans}
      {ClickEffect && ClickEffect !== "scale" && (
        <div className={clikableStyles.interactions}>
          <div className={clikableStyles.stroke}></div>
        </div>
      )}
      <div className={`${btnStyles.effecctBgColor} effecctBgColor`}></div>
    </button>
  );
}

export default CustomButton;
