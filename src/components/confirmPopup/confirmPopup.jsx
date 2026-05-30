import { useEffect } from "react";
import CustomButton from "../button/Button";
import styles from "./confirmPopup.module.css";

export default function ConfirmPopup({ message = "", onYes, onNo }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Enter") {
        onYes(true);
      } else if (e.key === "Escape") {
        onNo(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onYes, onNo]);

  return (
    <div className={styles.popup}>
      <p className={styles.message}>{message}</p>
      <div className={styles.buttons}>
        <CustomButton
          ClickEffect={"scale"}
          className={`default ${styles.no}`}
          onClick={() => onNo(false)}
        >
          No
        </CustomButton>
        <CustomButton
          ClickEffect={"scale"}
          className={`default ${styles.yes}`}
          onClick={() => onYes(true)}
        >
          Yes
        </CustomButton>
      </div>
    </div>
  );
}
