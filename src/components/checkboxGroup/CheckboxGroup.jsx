import React, { useState, useEffect } from "react";
import styles from "./CheckboxGroup.module.css";
import CheckBox from "../checkBox/checkBox";

/**
 * CheckboxGroup
 * @param {Array} items - Array of objects: { id, label, icon (optional) }
 * @param {Array} selectedIds - Currently selected IDs
 * @param {Function} onChange - Callback returning the new array of selected IDs
 */
export default function CheckboxGroup({
  items = [],
  selectedIds = [],
  onChange,
}) {
  const [localSelected, setLocalSelected] = useState(selectedIds);

  useEffect(() => {
    setLocalSelected(selectedIds);
  }, [selectedIds]);

  const handleToggle = (id) => {
    const newSelection = localSelected.includes(id)
      ? localSelected.filter((itemId) => itemId !== id)
      : [...localSelected, id];

    setLocalSelected(newSelection);
    if (onChange) {
      onChange(newSelection);
    }
  };

  return (
    <div className={styles.checkboxGroup}>
      {items.map((item) => {
        const isChecked = localSelected.includes(item.id);
        return (
          <div
            key={item.id}
            className={`${styles.itemRow} ${isChecked ? styles.selected : ""}`}
            onClick={() => handleToggle(item.id)}
          >
            <div className={styles.checkboxWrapper}>
              {/* Pass state and a dummy onChange because we handle the click on the parent row */}
              <CheckBox state={isChecked} onChange={() => {}} size={24} />
            </div>
            {item.icon && (
              <div className={styles.iconWrapper}>
                <img src={item.icon} alt={item.label} />
              </div>
            )}
            <div className={styles.labelWrapper}>
              <p>{item.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
