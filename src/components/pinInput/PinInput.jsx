import { useState, useRef, useEffect } from "react";
import styles from "./PinInput.module.css";

export default function PinInput({ length = 4, onChange, isMasked = true }) {
  const [values, setValues] = useState(Array(length).fill(""));

  // Track input elements dynamically without relying on brittle document.getElementById DOM selectors
  const inputRefs = useRef([]);

  // Ensure refs array scales correctly if the length prop changes dynamically
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, length);
  }, [length]);

  const updatePinState = (updatedValues) => {
    setValues(updatedValues);
    if (onChange) {
      onChange(updatedValues.join(""));
    }
  };

  const handleChange = (index, rawValue) => {
    // Strip non-numeric inputs immediately to protect downstream data parsers
    const numericValue = rawValue.replace(/\D/g, "");
    if (!numericValue) return;

    const updated = [...values];
    // Grab only the last character entered (handles mobile keyboards autocompleting over text)
    const targetChar = numericValue.substring(numericValue.length - 1);
    updated[index] = targetChar;

    updatePinState(updated);

    // Move focus forward automatically
    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    } else if (index === length - 1) {
      inputRefs.current[index]?.blur();
    }
  };

  const handleKeyDown = (e, index) => {
    const currentVal = values[index];

    switch (e.key) {
      case "Backspace":
        e.preventDefault();

        if (currentVal) {
          // If current box has a value, delete it but preserve focus
          const updated = [...values];
          updated[index] = "";
          updatePinState(updated);
        } else if (index > 0) {
          // If current box is empty, wipe out the previous box and move focus back
          const updated = [...values];
          updated[index - 1] = "";
          updatePinState(updated);
          inputRefs.current[index - 1]?.focus();
        }
        break;

      case "ArrowLeft":
        e.preventDefault();
        if (index > 0) inputRefs.current[index - 1]?.focus();
        break;

      case "ArrowRight":
        e.preventDefault();
        if (index < length - 1) inputRefs.current[index + 1]?.focus();
        break;

      default:
        break;
    }
  };

  /**
   * Safe Intercept Vector: Handles standard multi-digit pasting (e.g., from 2FA SMS or clipboard)
   */
  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text");
    const cleanNumbers = pastedData.replace(/\D/g, "").substring(0, length);

    if (!cleanNumbers) return;

    const updated = cleanNumbers.split("");
    // Pad array with empty strings if pasted digits are fewer than the expected length
    const padded = Array.from({ length }, (_, i) => updated[i] || "");

    updatePinState(padded);

    // Focus either the next empty box or blur the last box if completely filled
    const targetFocusIndex =
      cleanNumbers.length < length ? cleanNumbers.length : length - 1;
    if (cleanNumbers.length === length) {
      inputRefs.current[targetFocusIndex]?.blur();
    } else {
      inputRefs.current[targetFocusIndex]?.focus();
    }
  };

  return (
    <div className={styles.pinWrapper}>
      {values.map((val, i) => (
        <div
          key={i}
          className={`${styles.pinBoxWrapper} ${val ? styles.filled : ""}`}
        >
          <input
            ref={(el) => (inputRefs.current[i] = el)}
            type={isMasked ? "password" : "text"}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={length} // Accommodates clipboard paste intercepts
            className={styles.pinBox}
            value={val}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            onPaste={handlePaste}
            autoComplete="one-time-code" // Encourages mobile browsers to suggest incoming SMS codes
          />
        </div>
      ))}
    </div>
  );
}
