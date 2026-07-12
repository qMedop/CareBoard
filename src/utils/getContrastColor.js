export function getContrastColor(color, degree = 0.5) {
  let r;
  let g;
  let b;

  if (color.startsWith("#")) {
    const hex = color.slice(1);

    const normalized =
      hex.length === 3
        ? hex
            .split("")
            .map((char) => char + char)
            .join("")
        : hex;

    r = parseInt(normalized.slice(0, 2), 16);
    g = parseInt(normalized.slice(2, 4), 16);
    b = parseInt(normalized.slice(4, 6), 16);
  } else if (color.startsWith("rgb")) {
    const values = color.match(/[\d.]+/g);

    if (!values || values.length < 3) {
      return "#000000";
    }

    [r, g, b] = values.map(Number);
  } else {
    return "#000000";
  }

  r /= 255;
  g /= 255;
  b /= 255;

  const toLinear = (channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  return luminance > degree ? "#000000" : "#f1f1f1";
}
