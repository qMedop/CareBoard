import { useRef } from "react";
import { useInfo } from "../contexts/infoContext";

export function useInfoTrigger() {
  const { showInfo, hideInfo } = useInfo();
  const timerRef = useRef(null);

  const getInfoTriggerProps = (content, options = {}) => {
    if (!content) return {};

    const handleMouseEnter = (e) => {
      const el = e.currentTarget; // capture immediately
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        showInfo(content, el, options);
      }, 300);
    };

    const handleMouseLeave = () => {
      clearTimeout(timerRef.current);
      hideInfo();
    };

    const handleClick = () => {
      clearTimeout(timerRef.current);
      hideInfo();
    };

    return {
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onClick: handleClick,
    };
  };

  return { getInfoTriggerProps };
}
