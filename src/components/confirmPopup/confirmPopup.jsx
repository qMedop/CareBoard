import { useEffect, useRef } from "react";
import CustomButton from "../button/Button";
import styles from "./confirmPopup.module.css";

export default function ConfirmPopup({ message = "", onYes, onNo }) {
  const lastYesPointerActivationRef = useRef(0);
  const lastNoPointerActivationRef = useRef(0);

  const handleYesPointerUp = (e) => {
    if (e.pointerType !== "touch") return;
    lastYesPointerActivationRef.current = Date.now();
    onYes(true);
  };

  const handleNoPointerUp = (e) => {
    if (e.pointerType !== "touch") return;
    lastNoPointerActivationRef.current = Date.now();
    onNo(false);
  };

  const handleYesClick = () => {
    if (Date.now() - lastYesPointerActivationRef.current < 500) return;
    onYes(true);
  };

  const handleNoClick = () => {
    if (Date.now() - lastNoPointerActivationRef.current < 500) return;
    onNo(false);
  };

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
          onPointerUp={handleNoPointerUp}
          onClick={handleNoClick}
        >
          No
        </CustomButton>
        <CustomButton
          ClickEffect={"scale"}
          className={`default ${styles.yes}`}
          onPointerUp={handleYesPointerUp}
          onClick={handleYesClick}
        >
          Yes
        </CustomButton>
      </div>
    </div>
  );
}
