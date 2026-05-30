/* eslint-disable react/prop-types */
import styles from "./ListChooser.module.css";
import { Children, cloneElement, isValidElement } from "react";

function ListChooser({ state, setState, children }) {
  const handleSelect = (value) => {
    setState(value);
  };
  const renderedChildren = Children.map(children, (child) => {
    if (!isValidElement(child)) return null;
    return cloneElement(child, {
      onSelect: handleSelect,
      isActive: state === child?.props?.value,
    });
  });

  return <div>{renderedChildren}</div>;
}

// `ListItem` Component
function ListItem({ value, label, description, onSelect, isActive }) {
  const handleClick = () => onSelect(value);

  return (
    <div className={`${isActive && styles.active} ${styles.listItem}`}>
      <button onClick={handleClick}>
        <div className={styles.icon}>
          <span className={styles.circle}></span>
        </div>
        <div className={styles.info}>
          <p>{label}</p>
        </div>
      </button>

      {description && (
        <span className={`light-text ${styles.description}`}>
          {description}
        </span>
      )}
    </div>
  );
}

export { ListChooser, ListItem };
