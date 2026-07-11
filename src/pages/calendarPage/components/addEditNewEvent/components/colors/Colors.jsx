import { useState } from "react";
import { HexColorPicker } from "react-colorful";

import {
  CheckMarkIcon,
  ColorPickerIcon,
} from "../../../../../../assets/icons/Icon";
import {
  COLOR_OPTIONS,
  DEFAULT_EVENT_COLOR,
} from "../../../../../../constants/constants";
import { useTime } from "../../../../../../contexts/TimeContext";
import { usePopup } from "../../../../../../contexts/PopupContext";
import { getContrastColor } from "../../../../../../utils/getContrastColor";

import styles from "./Colors.module.css";
import CustomButton from "../../../../../../components/button/Button";

const CUSTOM_COLOR_POPUP_ID = "custom-color-picker";

const COLOR_USAGE_STORAGE_KEY = "event-color-usage";
const MAX_SUGGESTED_COLORS = 9;

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

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item) =>
        item &&
        typeof item.color === "string" &&
        typeof item.count === "number" &&
        typeof item.lastUsed === "number",
    );
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

  const existingColor = currentColors.find(
    (item) => item.color === normalizedColor,
  );

  let nextColors;

  if (existingColor) {
    nextColors = currentColors.map((item) =>
      item.color === normalizedColor
        ? {
            ...item,
            count: item.count + 1,
            lastUsed: now,
          }
        : item,
    );
  } else {
    nextColors = [
      ...currentColors,
      {
        color: normalizedColor,
        count: 1,
        lastUsed: now,
      },
    ];
  }

  saveColorUsage(nextColors);
}

function registerCustomColor(color) {
  const normalizedColor = normalizeColor(color);
  const currentColors = getStoredColorUsage();
  const now = Date.now();

  const existingColor = currentColors.find(
    (item) => item.color === normalizedColor,
  );

  let nextColors;

  if (existingColor) {
    nextColors = currentColors.map((item) =>
      item.color === normalizedColor
        ? {
            ...item,
            count: Math.max(
              item.count + 1,
              sortColorUsage(currentColors)[0]?.count + 1 || 1,
            ),
            lastUsed: now,
          }
        : item,
    );
  } else {
    const highestCount = sortColorUsage(currentColors)[0]?.count ?? 0;

    nextColors = [
      ...currentColors,
      {
        color: normalizedColor,
        count: highestCount + 1,
        lastUsed: now,
      },
    ];
  }

  saveColorUsage(nextColors);

  return normalizedColor;
}

function getInitialSuggestedColors() {
  return sortColorUsage(getStoredColorUsage())
    .slice(0, MAX_SUGGESTED_COLORS)
    .map((item) => item.color);
}

function Colors({ handleColorChange, selected }) {
  const { isMobile } = useTime();
  const { openPopup, closePopup } = usePopup();

  const [selectedColor, setSelectedColor] = useState(
    normalizeColor(selected || DEFAULT_EVENT_COLOR),
  );

  const [suggestedColors, setSuggestedColors] = useState(
    getInitialSuggestedColors,
  );

  const selectColor = (color) => {
    const normalizedColor = normalizeColor(color);

    setSelectedColor(normalizedColor);
    handleColorChange(normalizedColor);
  };

  const handlePresetColorClick = (color) => {
    const normalizedColor = normalizeColor(color);

    selectColor(normalizedColor);

    /*
     * Update usage stats for the NEXT mount.
     * Do not modify suggestedColors here.
     */
    registerColorUsage(normalizedColor);
  };

  const handleSuggestedColorClick = (color) => {
    const normalizedColor = normalizeColor(color);

    selectColor(normalizedColor);

    /*
     * Suggested colors still count as usage,
     * but visible order remains frozen until next mount.
     */
    registerColorUsage(normalizedColor);
  };

  const handleReset = () => {
    selectColor(DEFAULT_EVENT_COLOR);

    /*
     * Reset is an action, not a normal color choice.
     * It does not affect frequency statistics.
     */
  };

  const handleCustomColorPick = (color) => {
    const normalizedColor = registerCustomColor(color);

    selectColor(normalizedColor);

    /*
     * Custom colors are the one exception:
     * immediately put the picked custom color first.
     *
     * Remove it first if already present,
     * then cap Suggested at 9.
     */
    setSuggestedColors((currentColors) =>
      [
        normalizedColor,
        ...currentColors.filter((item) => item !== normalizedColor),
      ].slice(0, MAX_SUGGESTED_COLORS),
    );

    closePopup(CUSTOM_COLOR_POPUP_ID);
  };

  const openCustomColorPicker = (event) => {
    const triggerElement = event.currentTarget;

    openPopup(
      "centered",
      () => (
        <CustomColorPicker
          initialColor={selectedColor}
          onPick={handleCustomColorPick}
          onCancel={() => {
            closePopup(CUSTOM_COLOR_POPUP_ID);
          }}
        />
      ),
      triggerElement,
      "center",
      null,
      () => true,
      CUSTOM_COLOR_POPUP_ID,
    );
  };

  const suggestedColorSet = new Set(suggestedColors.map(normalizeColor));

  const moreColors = COLOR_OPTIONS.filter(
    (color) => !suggestedColorSet.has(normalizeColor(color)),
  );

  return (
    <div className={styles.colorPickerPopup}>
      {suggestedColors.length > 0 && (
        <>
          <div className={styles.title}>
            <p>Suggested</p>

            <CustomButton
              ClickEffect={"scale"}
              className={`default ${styles.resetButton}`}
              onClick={handleReset}
            >
              Reset
            </CustomButton>
          </div>

          <div className={styles.colorsOptions}>
            {suggestedColors.map((color) => (
              <ColorOption
                key={color}
                color={color}
                handleColorChange={handleSuggestedColorClick}
                selected={selectedColor === color}
                isMobile={isMobile}
              />
            ))}
          </div>
        </>
      )}

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
              handleColorChange={handlePresetColorClick}
              selected={selectedColor === normalizedColor}
              isMobile={isMobile}
            />
          );
        })}

        <CustomColorOption onClick={openCustomColorPicker} />
      </div>
    </div>
  );
}

function CustomColorPicker({ initialColor, onPick, onCancel }) {
  const [color, setColor] = useState(initialColor || DEFAULT_EVENT_COLOR);

  return (
    <div className={styles.customPickerPopup}>
      <div className={styles.customPickerHeader}>
        <p>Custom color</p>

        <div
          className={styles.customPickerPreview}
          style={{
            backgroundColor: color,
          }}
        />
      </div>

      <HexColorPicker
        color={color}
        onChange={setColor}
        className={styles.customPicker}
      />

      <div className={styles.customPickerValue}>
        <span>HEX</span>

        <input
          type="text"
          value={color}
          maxLength={7}
          onChange={(event) => {
            setColor(event.target.value);
          }}
        />
        <CustomButton
          ClickEffect={"scale"}
          className={`default ${styles.customPickerApplyButton}`}
          type="button"
          onClick={() => onPick(color)}
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
      <div
        className={styles.colorDot}
        style={{
          backgroundColor: color,
        }}
      />

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

function CustomColorOption({ onClick }) {
  return (
    <CustomButton
      ClickEffect={false}
      type="button"
      className={`default ${styles.colorOptionWrapper} ${styles.customColorOption}`}
      onClick={onClick}
    >
      <ColorPickerIcon size={32} fill="#25262b" />
    </CustomButton>
  );
}

export default Colors;
