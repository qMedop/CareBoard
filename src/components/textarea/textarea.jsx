import { useEffect, useRef } from "react";

function ContentEditable({
  className = "",
  value,
  onChange,
  readOnly = false,
  placeholder = "",
  maxLength = 1000,
  ...props
}) {
  const contentEditableRef = useRef(null);

  useEffect(() => {
    if (
      contentEditableRef.current &&
      value !== contentEditableRef.current.innerText
    ) {
      contentEditableRef.current.innerText = value || "";
    }
  }, [value]);

  const handleChange = (e) => {
    if (!readOnly && contentEditableRef.current) {
      const newText = e.target.innerText;
      if (newText.length > maxLength) {
        return;
      }
      onChange(newText);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    if (readOnly || !contentEditableRef.current) return;
    const textToPaste = e.clipboardData.getData("text/plain");
    const currentText = contentEditableRef.current.innerText;
    const remainingSpace = maxLength - currentText.length;
    if (remainingSpace <= 0) return;
    const textToInsert = textToPaste.slice(0, remainingSpace);
    document.execCommand("insertText", false, textToInsert);
  };

  const handleKeyDown = (e) => {
    if (
      contentEditableRef.current &&
      contentEditableRef.current.innerText.length >= maxLength &&
      !isNavigationKey(e.key)
    ) {
      e.preventDefault();
    }
  };

  const isNavigationKey = (key) => {
    return [
      "Backspace",
      "Delete",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
      "Tab",
      "Enter",
    ].includes(key);
  };

  const isEmpty = !value || value.trim() === "";

  // The main change is here: A wrapper div that holds both the
  // editable area and the placeholder as siblings.
  return (
    <div
      className={className}
      style={{
        position: "relative", // This is crucial for the placeholder positioning
        border: "none",
        backgroundColor: "transparent",
        ...props.style,
      }}
      {...props}
    >
      {/* The actual editable element. It has no React children! */}
      <div
        className={className}
        ref={contentEditableRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning={true}
        onInput={handleChange}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          outline: "none",
          cursor: readOnly ? "default" : "text",

          position: "relative",
          zIndex: 1,
        }}
      />

      {/* The placeholder is a sibling, not a child of the contentEditable div */}
      {isEmpty && !readOnly && (
        <div
          className={className}
          style={{
            position: "absolute",
            top: "0",
            left: "0",
            color: "#aaa",
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 0,
          }}
        >
          {placeholder}
        </div>
      )}
    </div>
  );
}

export default ContentEditable;
