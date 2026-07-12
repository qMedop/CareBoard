/* eslint-disable react/prop-types */
import CustomButton from "../button/Button";
import styles from "./ListChooser.module.css";
import { Children, cloneElement, isValidElement } from "react";

function ListChooser({ state, setState, children, className, ClickEffect }) {
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

  return <div className={className}>{renderedChildren}</div>;
}

// `ListItem` Component
function ListItem({
  value,
  label,
  description,
  onSelect,
  isActive,
  className,
  children,
  ClickEffect = "scale",
}) {
  const handleClick = () => onSelect(value);

  return (
    <div
      className={`${isActive && styles.active} ${styles.listItem} ${className || ""}`}
    >
      <CustomButton
        ClickEffect={ClickEffect}
        className={`default`}
        onClick={handleClick}
      >
        <div className={styles.icon}>
          <span className={styles.circle}></span>
        </div>
        {!children ? (
          <div className={styles.info}>
            <p>{label}</p>
          </div>
        ) : (
          children
        )}
      </CustomButton>

      {description && (
        <span className={`light-text ${styles.description}`}>
          {description}
        </span>
      )}
    </div>
  );
}

export { ListChooser, ListItem };
