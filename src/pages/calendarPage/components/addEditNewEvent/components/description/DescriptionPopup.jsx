import { useState } from "react";
import CustomButton from "../../../../../../components/button/Button";
import styles from "./DescriptionPopup.module.css";
function DescriptionPopup({ initialDescription, onSave, closePopup }) {
  const [text, setText] = useState(initialDescription || "");

  const handleSave = () => {
    onSave(text);
    closePopup();
  };

  return (
    <div className={styles.descriptionPopup}>
      <textarea
        autoFocus
        className={styles.descriptionTextarea}
        placeholder="Add a description or note..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className={styles.descriptionActions}>
        <CustomButton onClick={handleSave} className="default">
          Save
        </CustomButton>
      </div>
    </div>
  );
}

export default DescriptionPopup;
