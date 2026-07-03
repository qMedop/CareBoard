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
  style = {},
  ClickEffect = true,
  dataInfo,
  infoClassName,
  infoPosition,
  loading = false,
  ...props
}) {
  const { ref, isMouseDown, isMousePressed, handleMouseDown } = useClickEffect(
    ClickEffect && ClickEffect !== "scale",
  );
  const scaleRef = useRef(null);
  const [ripples, setRipples] = useState([]);
  const { getInfoTriggerProps } = useInfoTrigger();

  const infoTriggerProps = getInfoTriggerProps(dataInfo, {
    className: infoClassName,
    position: infoPosition,
  });

  const handleScaleDown = (e) => {
    if (ClickEffect === "scaleDown") {
      const button = scaleRef.current;
      if (!button) return;
      button.style.transition = "transform 120ms";
      button.style.transform = "scale(0.95)";
      return;
    }

    if (ClickEffect === "scale") {
      const button = scaleRef.current;
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      setRipples((prev) => [
        ...prev,
        {
          key: crypto.randomUUID(),
          x,
          y,
          size,
          visible: true,
        },
      ]);
      return;
    }
    handleMouseDown(e);
  };

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
    const bg = e.currentTarget.querySelector(".effectBgColor");
    if (bg) {
      bg.style.backgroundColor = "var(--bg-click-effect)";
    }
  };

  const handleMouseLeave = (e) => {
    const bg = e.currentTarget.querySelector(".effectBgColor");
    if (bg) {
      bg.style.backgroundColor = null;
    }
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

  const elementRef =
    ClickEffect === "scale" || ClickEffect === "scaleDown" ? scaleRef : ref;

  if (link) {
    return (
      <NavLink
        ref={elementRef}
        to={href}
        onPointerDown={(e) => {
          if (loading === "active") return;
          handleScaleDown(e);
        }}
        className={`${btnStyles.button} ${commonClasses} ${
          type === "select" ? btnStyles.select : ""
        }`}
        aria-label={ariaLabel}
        draggable="false"
        onClick={(e) => {
          if (loading === "active" || props.disabled) {
            e.preventDefault();
            return;
          }
          infoTriggerProps.onClick?.(e);
          onClick?.(e);
        }}
        onMouseEnter={infoTriggerProps.onMouseEnter}
        onMouseLeave={infoTriggerProps.onMouseLeave}
        style={{
          ...style,
          opacity: loading === "active" ? 0.6 : 1,
          cursor: loading === "active" ? "not-allowed" : null,
        }}
        {...props}
      >
        <ButtonChildren
          type={type}
          loading={loading}
          ClickEffect={ClickEffect}
          rippleSpans={rippleSpans}
        >
          {children}
        </ButtonChildren>
      </NavLink>
    );
  }

  return (
    <button
      onPointerEnter={handleMouseEnter}
      onPointerLeave={handleMouseLeave}
      ref={elementRef}
      type={type}
      onPointerDown={(e) => {
        if (loading === "active") return;
        handleScaleDown(e);
      }}
      className={`${btnStyles.button} ${commonClasses} ${
        type === "select" ? btnStyles.select : ""
      }`}
      aria-label={ariaLabel}
      onClick={(e) => {
        if (loading === "active") {
          e.preventDefault();
          return;
        }
        infoTriggerProps.onClick?.(e);
        onClick?.(e);
      }}
      onMouseEnter={infoTriggerProps.onMouseEnter}
      onMouseLeave={infoTriggerProps.onMouseLeave}
      {...props}
      disabled={loading === "active" ? true : props.disabled}
      style={{
        ...style,
        opacity: loading === "active" ? 0.6 : 1,
        cursor: loading === "active" ? "not-allowed" : null,
      }}
    >
      <ButtonChildren
        type={type}
        loading={loading}
        ClickEffect={ClickEffect}
        rippleSpans={rippleSpans}
      >
        {children}
      </ButtonChildren>
    </button>
  );
}

function ButtonChildren({ children, type, loading, ClickEffect, rippleSpans }) {
  return (
    <>
      {type === "select" && <span className={btnStyles.select}></span>}
      {!loading && children}
      {loading && (
        <div className={clikableStyles.contentWrapper}>
          <div
            className={`${clikableStyles.childContent} ${
              loading === "active" ? clikableStyles.loadingActive : ""
            }`}
          >
            {children}
          </div>
          <div
            className={`${clikableStyles.loadingIcon} ${
              loading === "active" ? clikableStyles.loadingActive : ""
            }`}
          >
            <div className={clikableStyles.loader}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      )}

      {type === "list" && (
        <ArrowDownIcon className={`arrow ${btnStyles.arrowDown}`} />
      )}
      {rippleSpans}
      {ClickEffect && ClickEffect !== "scale" && (
        <div className={clikableStyles.interactions}>
          <div className={clikableStyles.stroke}></div>
        </div>
      )}
      <div className={`${btnStyles.effectBgColor} effectBgColor`}></div>
    </>
  );
}

export default CustomButton;
