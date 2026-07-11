import { useState } from "react";
import { HexColorPicker } from "react-colorful";

import CustomButton from "../../../../../../components/button/Button";
import {
  CheckMarkIcon,
  ColorPickerIcon,
} from "../../../../../../assets/icons/Icon";
import {
  COLOR_OPTIONS,
  DEFAULT_EVENT_COLOR,
} from "../../../../../../constants/constants";
import { usePopup } from "../../../../../../contexts/PopupContext";
import { useTime } from "../../../../../../contexts/TimeContext";
import { getContrastColor } from "../../../../../../utils/getContrastColor";

import styles from "./Colors.module.css";

const CUSTOM_COLOR_POPUP_ID = "custom-color-picker";
const COLOR_USAGE_STORAGE_KEY = "event-color-usage";

const DESKTOP_MAX_SUGGESTED_COLORS = 8;
const MOBILE_MAX_SUGGESTED_COLORS = 9;

function normalizeColor(color) {
  return color.trim().toUpperCase();
}

function sortColorUsage(colors) {
  return [...colors].sort(
    (a, b) => b.count - a.count || b.lastUsed - a.lastUsed,
  );
}

function getStoredColorUsage() {
  try {
    const stored = localStorage.getItem(COLOR_USAGE_STORAGE_KEY);

    if (!stored) return [];

    const parsed = JSON.parse(stored);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.color === "string" &&
          typeof item.count === "number" &&
          typeof item.lastUsed === "number",
      )
      .map((item) => ({
        ...item,
        color: normalizeColor(item.color),
      }));
  } catch (error) {
    console.error("Failed to read event color usage:", error);
    return [];
  }
}

function saveColorUsage(colors) {
  try {
    localStorage.setItem(COLOR_USAGE_STORAGE_KEY, JSON.stringify(colors));
  } catch (error) {
    console.error("Failed to save event color usage:", error);
  }
}

function registerColorUsage(color) {
  const normalizedColor = normalizeColor(color);
  const currentColors = getStoredColorUsage();
  const now = Date.now();

  const colorExists = currentColors.some(
    (item) => item.color === normalizedColor,
  );

  const nextColors = colorExists
    ? currentColors.map((item) =>
        item.color === normalizedColor
          ? {
              ...item,
              count: item.count + 1,
              lastUsed: now,
            }
          : item,
      )
    : [
        ...currentColors,
        {
          color: normalizedColor,
          count: 1,
          lastUsed: now,
        },
      ];

  saveColorUsage(nextColors);
}

function registerCustomColor(color) {
  const normalizedColor = normalizeColor(color);
  const currentColors = getStoredColorUsage();
  const sortedColors = sortColorUsage(currentColors);
  const highestCount = sortedColors[0]?.count ?? 0;
  const now = Date.now();

  const colorExists = currentColors.some(
    (item) => item.color === normalizedColor,
  );

  const nextColors = colorExists
    ? currentColors.map((item) =>
        item.color === normalizedColor
          ? {
              ...item,
              count: Math.max(item.count + 1, highestCount + 1),
              lastUsed: now,
            }
          : item,
      )
    : [
        ...currentColors,
        {
          color: normalizedColor,
          count: highestCount + 1,
          lastUsed: now,
        },
      ];

  saveColorUsage(nextColors);

  return normalizedColor;
}

function getInitialSuggestedColors(limit) {
  return sortColorUsage(getStoredColorUsage())
    .slice(0, limit)
    .map((item) => item.color);
}

function Colors({ handleColorChange, selected }) {
  const { isMobile } = useTime();
  const { openPopup, closePopup } = usePopup();

  const maxSuggestedColors = isMobile
    ? MOBILE_MAX_SUGGESTED_COLORS
    : DESKTOP_MAX_SUGGESTED_COLORS;

  const [selectedColor, setSelectedColor] = useState(() =>
    normalizeColor(selected || DEFAULT_EVENT_COLOR),
  );

  const [suggestedColors, setSuggestedColors] = useState(() =>
    getInitialSuggestedColors(maxSuggestedColors),
  );

  const selectColor = (color) => {
    const normalizedColor = normalizeColor(color);

    setSelectedColor(normalizedColor);
    handleColorChange(normalizedColor);
  };

  const handleColorClick = (color) => {
    selectColor(color);
    registerColorUsage(color);
  };

  const handleReset = () => {
    selectColor(DEFAULT_EVENT_COLOR);
  };

  const handleCustomColorPick = (color) => {
    const normalizedColor = registerCustomColor(color);

    selectColor(normalizedColor);

    setSuggestedColors((currentColors) =>
      [
        normalizedColor,
        ...currentColors.filter((item) => item !== normalizedColor),
      ].slice(0, maxSuggestedColors),
    );

    closePopup(CUSTOM_COLOR_POPUP_ID);
  };

  const openCustomColorPicker = (event) => {
    openPopup(
      "centered",
      () => (
        <CustomColorPicker
          initialColor={selectedColor}
          onPick={handleCustomColorPick}
        />
      ),
      event.currentTarget,
      "center",
      null,
      () => true,
      CUSTOM_COLOR_POPUP_ID,
    );
  };

  const suggestedColorSet = new Set(suggestedColors);

  const moreColors = COLOR_OPTIONS.filter(
    (color) => !suggestedColorSet.has(normalizeColor(color)),
  );

  return (
    <div className={styles.colorPickerPopup}>
      {suggestedColors.length > 0 && (
        <>
          {isMobile && (
            <div className={styles.title}>
              <p>Suggested</p>

              <CustomButton
                ClickEffect="scale"
                className={`default ${styles.resetButton}`}
                onClick={handleReset}
              >
                Reset
              </CustomButton>
            </div>
          )}

          <div className={styles.colorsOptions}>
            {suggestedColors.map((color) => (
              <ColorOption
                key={color}
                color={color}
                handleColorChange={handleColorClick}
                selected={selectedColor === color}
                isMobile={isMobile}
              />
            ))}

            {!isMobile && (
              <CustomColorOption
                isMobile={isMobile}
                onClick={openCustomColorPicker}
              />
            )}
          </div>
        </>
      )}

      {isMobile && (
        <>
          <div className={styles.title}>
            <p>More colors</p>
          </div>

          <div className={styles.colorsOptions}>
            {moreColors.map((color) => {
              const normalizedColor = normalizeColor(color);

              return (
                <ColorOption
                  key={color}
                  color={color}
                  handleColorChange={handleColorClick}
                  selected={selectedColor === normalizedColor}
                  isMobile={isMobile}
                />
              );
            })}

            <CustomColorOption
              isMobile={isMobile}
              onClick={openCustomColorPicker}
            />
          </div>
        </>
      )}
    </div>
  );
}

function CustomColorPicker({ initialColor, onPick }) {
  const initialValidColor = normalizeColor(initialColor || DEFAULT_EVENT_COLOR);

  const [color, setColor] = useState(initialValidColor);
  const [hexInput, setHexInput] = useState(initialValidColor);

  const isValidHex = /^#[0-9A-Fa-f]{6}$/.test(hexInput);

  const handlePickerChange = (nextColor) => {
    const normalizedColor = normalizeColor(nextColor);

    setColor(normalizedColor);
    setHexInput(normalizedColor);
  };

  const handleHexChange = (event) => {
    let value = event.target.value;

    if (!value.startsWith("#")) {
      value = `#${value}`;
    }

    value = value.slice(0, 7);

    setHexInput(value);

    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      setColor(normalizeColor(value));
    }
  };

  const handleApply = () => {
    if (!isValidHex) return;

    onPick(normalizeColor(hexInput));
  };

  return (
    <div className={styles.customPickerPopup}>
      <div className={styles.customPickerHeader}>
        <p>Custom color</p>

        <div
          className={styles.customPickerPreview}
          style={{ backgroundColor: color }}
        />
      </div>

      <HexColorPicker
        color={color}
        onChange={handlePickerChange}
        className={styles.customPicker}
      />

      <div className={styles.customPickerValue}>
        <span>HEX</span>

        <input
          type="text"
          value={hexInput}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!isValidHex}
          onChange={handleHexChange}
          style={{ color: isValidHex ? "#f1f1f1" : "#e05252" }}
        />

        <CustomButton
          ClickEffect="scale"
          className={`default ${styles.customPickerApplyButton} ${!isValidHex ? "disabled" : ""}`}
          type="button"
          disabled={!isValidHex}
          onClick={handleApply}
          style={{ color: isValidHex ? "#f1f1f1" : "#666666" }}
          disabled={!isValidHex}
        >
          Done
        </CustomButton>
      </div>
    </div>
  );
}

function ColorOption({ color, handleColorChange, selected, isMobile }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={styles.colorOptionWrapper}
      onClick={() => handleColorChange(color)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={styles.colorDot} style={{ backgroundColor: color }} />

      <span
        className={styles.colorHover}
        style={{
          backgroundColor: color,
          opacity: isHovered ? 0.4 : 0,
          transform: isHovered ? "scale(1)" : "scale(0.5)",
        }}
      />

      {isMobile && selected && (
        <div className={styles.checkMark}>
          <CheckMarkIcon fill={getContrastColor(color)} />
        </div>
      )}
    </div>
  );
}

function CustomColorOption({ onClick, isMobile }) {
  return (
    <CustomButton
      ClickEffect={false}
      type="button"
      className={`default ${styles.colorOptionWrapper} ${styles.customColorOption}`}
      onClick={onClick}
    >
      <span></span>
      {isMobile && <ColorPickerIcon size={32} fill="#25262b" />}
    </CustomButton>
  );
}

export default Colors;
