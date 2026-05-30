import { useState, useEffect, useRef } from "react";
import styles from "./InputPopup.module.css";
import CustomButton from "../button/Button";

export default function InputPopup({ header, onConfirm, onCancel }) {
  const [value, setValue] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [hasTyped, setHasTyped] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    function handleEsc(e) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onCancel]);

  function handleChange(e) {
    const val = e.target.value;
    setValue(val);

    if (!hasTyped && val.length > 0) setHasTyped(true);

    if (hasTyped && val.length === 0) {
      setErrorMessage("Field cannot be empty");
    } else {
      setErrorMessage("");
    }
  }

  function handleBlur() {
    setErrorMessage("");
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (value.length > 1) {
      onConfirm(value);
    } else {
      setErrorMessage("Field cannot be empty");
    }
  }

  return (
    <div
      className={`${styles.inputPopup} ${
        errorMessage?.length > 0 ? styles.error : ""
      }`}
    >
      <p className={styles.header}>{header}</p>
      <form className={styles.inputWrapper} onSubmit={handleSubmit}>
        <div className={`${styles.inputContainer} `}>
          <input
            ref={inputRef}
            placeholder="Enter text"
            type="text"
            className={styles.input}
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
          />
        </div>
        <span className={styles.errorMessage}>{errorMessage}</span>
        <div className={styles.buttons}>
          <CustomButton
            ClickEffect={"scale"}
            className={`default ${styles.cancel}`}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </CustomButton>
          <CustomButton
            ClickEffect={"scale"}
            className={`default ${styles.confirm} ${
              value.length <= 1 ? styles.disabled : ""
            }`}
            disabled={value.length <= 1}
            type="submit"
          >
            Done
          </CustomButton>
        </div>
      </form>
    </div>
  );
}
