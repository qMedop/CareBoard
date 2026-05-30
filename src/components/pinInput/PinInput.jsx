import { useState } from "react";
import styles from "./PinInput.module.css"; // Adjust this to your styles location

export default function PinInput({ length = 4, onChange }) {
  const [values, setValues] = useState(Array(length).fill(""));

  const handleChange = (index, val) => {
    const value = val.replace(/\D/, "");
    const updated = [...values];
    updated[index] = value;
    setValues(updated);
    onChange(updated.join(""));

    // Move focus to next input
    if (value && index < length - 1) {
      const next = document.getElementById(`pin-${index + 1}`);
      if (next) next.focus();
    }

    // Blur last input
    if (value && index === length - 1) {
      const last = document.getElementById(`pin-${index}`);
      if (last) last.blur();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === "Backspace" && !values[index] && index > 0) {
      const prev = document.getElementById(`pin-${index - 1}`);
      if (prev) prev.focus();
    }
  };

  const handleFocus = () => {
    // Clear values and focus first input
    const cleared = Array(length).fill("");
    setValues(cleared);
    onChange(""); // Send empty string to parent
    setTimeout(() => {
      const first = document.getElementById("pin-0");
      if (first) first.focus();
    }, 0);
  };

  return (
    <div className={styles.pinWrapper}>
      {values.map((val, i) => (
        <div
          key={i}
          className={`${styles.pinBoxWrapper} ${val ? styles.filled : ""}`}
        >
          <input
            id={`pin-${i}`}
            type="text"
            inputMode="numeric"
            maxLength="1"
            className={`${styles.pinBox}`}
            value={val}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            onPointerDown={handleFocus}
            onBlur={() => {
              const wrapper = document.getElementById(
                `pin-${i}`
              )?.parentElement;
              if (wrapper) wrapper.classList.remove(styles.focused);
            }}
          />
          <div className={styles.hide}></div>
        </div>
      ))}
    </div>
  );
}
