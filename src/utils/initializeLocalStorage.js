import { COLOR_OPTIONS } from "../constants/constants";

export function initializeLocalStorage() {
  if (localStorage.getItem("event-color-usage") === null) {
    const date = new Date().getTime();
    localStorage.setItem(
      "event-color-usage",
      JSON.stringify(
        COLOR_OPTIONS.slice(0, 9).map((color) => ({
          color,
          count: 1,
          lastUsed: date,
        })),
      ),
    );
  }
}
