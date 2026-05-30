import { useEffect, useRef } from "react";
import styles from "./TextInput.module.css";
function TextInput({
  value,
  onChange,
  maxLetters = false,
  title = false,
  className = "",
  placeholder = "",
}) {
  const editableRef = useRef(null);

  function handleInput(e) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);

    const cursorPosition = range.startOffset;
    const newValue = e.target.textContent || "";

    onChange(newValue);

    setTimeout(() => {
      const updatedContent = editableRef.current.firstChild;
      if (updatedContent) {
        const newSelection = window.getSelection();
        const newRange = document.createRange();
        newRange.setStart(
          updatedContent,
          Math.min(cursorPosition, updatedContent.length)
        );
        newRange.collapse(true);
        newSelection.removeAllRanges();
        newSelection.addRange(newRange);
      }
    }, 0);
  }

  useEffect(() => {
    const editable = editableRef.current;
    if (editable && editable.textContent !== value) {
      editable.textContent = value;
    }
  }, [value]);

  return (
    <div
      onClick={() => editableRef.current?.focus()}
      className={`${value?.length > maxLetters ? "error" : ""} ${className}`}
    >
      {title && <p className="title">{title}</p>}
      <div
        ref={editableRef}
        contentEditable
        onInput={handleInput}
        className="textarea"
        suppressContentEditableWarning
        data-placeholder={placeholder}
      />
      {maxLetters && (
        <p className="count">
          <span>{value?.length}</span>
          <span>/</span>
          <span>{maxLetters}</span>
        </p>
      )}
    </div>
  );
}

export default TextInput;
