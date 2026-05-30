import { useEffect, useState } from "react";
import styles from "./TypingText.module.css";

function TypingText({ text, duration = 1000, className = "", start = false }) {
  const [displayedText, setDisplayedText] = useState("");
  const [hasAnimated, setHasAnimated] = useState(false); // track if already animated
  const charsPerMs = text.length / duration;

  useEffect(() => {
    if (!start || hasAnimated) return; // do nothing if start is false or already animated

    let startTime;
    let frame;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const charsToShow = Math.min(
        text.length,
        Math.floor(elapsed * charsPerMs)
      );
      setDisplayedText(text.slice(0, charsToShow));

      if (charsToShow < text.length) {
        frame = requestAnimationFrame(animate);
      } else {
        setHasAnimated(true); // mark animation as done
      }
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [start, text, duration, hasAnimated]);

  return (
    <span className={`${styles.typingText} ${className}`}>
      {displayedText}
      <span className={styles.typingCursor}>|</span>
    </span>
  );
}

export default TypingText;
