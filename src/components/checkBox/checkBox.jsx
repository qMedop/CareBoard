import { useState } from "react";
import styles from "./checkbox.module.css";
import { CheckMarkIcon } from "../../assets/icons/Icon";
function CheckBox({ state, onChange, size = 22 }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`${styles.container} ${state ? styles.checked : ""} ${
        hovered ? styles.hovered : ""
      }`}
      style={{ width: size, height: size }}
      onClick={onChange}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={styles.box}>
        <div className={styles.checkmark}>
          <CheckMarkIcon />
        </div>
      </div>
      <div className={styles.hover}></div>
    </div>
  );
}

export default CheckBox;
