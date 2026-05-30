import { useEffect, useState, useRef } from "react";

function useClickEffect(clickEffect = true) {
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [isMousePressed, setIsMousePressed] = useState(false);
  const elementRef = useRef(null);

  function handleMouseDown() {
    if (clickEffect) {
      setIsMouseDown(true);
      setIsMousePressed(false);
    }
  }

  useEffect(() => {
    function handleMouseUp() {
      if (clickEffect) {
        setIsMouseDown(false);
        setIsMousePressed(true);

        // Blur the element when mouse is released
        if (elementRef.current) {
          elementRef.current.blur();
        }

        const timeoutId = setTimeout(() => {
          setIsMousePressed(false);
        }, 600);

        return () => {
          clearTimeout(timeoutId);
        };
      }
    }

    const handleDocumentMouseUp = () => {
      if (isMouseDown) {
        handleMouseUp();
      }
    };

    document.addEventListener("pointerup", handleDocumentMouseUp);
    document.addEventListener("pointercancel", handleDocumentMouseUp);
    document.addEventListener("touchend", handleDocumentMouseUp);
    document.addEventListener("touchcancel", handleDocumentMouseUp);

    return () => {
      document.removeEventListener("pointerup", handleDocumentMouseUp);
      document.removeEventListener("pointercancel", handleDocumentMouseUp);
      document.removeEventListener("touchend", handleDocumentMouseUp);
      document.removeEventListener("touchcancel", handleDocumentMouseUp);
    };
  }, [isMouseDown, clickEffect]);

  return { ref: elementRef, isMouseDown, isMousePressed, handleMouseDown };
}

export default useClickEffect;
