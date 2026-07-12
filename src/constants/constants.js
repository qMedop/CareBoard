export const WEBSITE_TITLE = "CareBoard";

export const DAYS_OF_WEEK = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const MONTHS_OF_THE_YEAR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Event colors

export const COLOR_OPTIONS = [
  // Existing palette — softened
  "#D98ABD", // Soft pink — default
  "#E9BE91", // Soft peach
  "#B8C86A", // Soft lime
  "#929DE0", // Soft periwinkle
  "#6DBFD1", // Soft cyan
  "#858D98", // Slate gray
  "#6DBB98", // Soft mint green
  "#ADB1B8", // Light gray
  "#7EB3BA", // Muted teal

  // Added colors
  "#D58D8D", // Dusty rose
  "#D5A27A", // Warm apricot
  "#D2B86E", // Muted gold
  "#A9BD76", // Sage lime
  "#78B89E", // Seafoam
  "#72B1A9", // Soft turquoise
  "#78A8C7", // Dusty sky blue
  "#8299C5", // Muted cornflower
  "#9B91C9", // Soft lavender
  "#B28FC1", // Muted purple
  "#C58FAA", // Dusty mauve
  "#B99A91", // Warm taupe
];

export const DEFAULT_EVENT_COLOR = COLOR_OPTIONS[0];

// Event visibility

export const EVENT_VISIBILITY = Object.freeze({
  VISIBLE: "visible",
  PRIVATE: "private",
  SPECIFIC: "specific",
});

export const DEFAULT_EVENT_VISIBILITY = EVENT_VISIBILITY.VISIBLE;

// Event availability

export const EVENT_AVAILABILITY = Object.freeze({
  BUSY: "busy",
  FREE: "free",
  MAYBE_BUSY: "maybeBusy",
});

export const EVENT_AVAILABILITY_OPTIONS = Object.freeze(
  Object.values(EVENT_AVAILABILITY),
);

export const DEFAULT_EVENT_AVAILABILITY = EVENT_AVAILABILITY.BUSY;

// Event notification

export const EVENT_NOTIFICATION_OPTIONS = Object.freeze([
  5, 10, 15, 30, 60, 1440,
]);

export const DEFAULT_EVENT_NOTIFICATION = 0;

// Recurrence

export const RECURRENCE_TYPE = Object.freeze({
  NONE: "NONE",
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY",
});

export const RECURRENCE_END_TYPE = Object.freeze({
  NEVER: "NEVER",
  DATE: "DATE",
  COUNT: "COUNT",
});

export const DEFAULT_EVENT_RECURRENCE = Object.freeze({
  type: RECURRENCE_TYPE.NONE,
});

export const DEFAULT_RECURRENCE_INTERVAL = 1;

export const DEFAULT_RECURRENCE_COUNT = 13;

export const WEEKDAY_RECURRENCE_DAYS = Object.freeze([1, 2, 3, 4, 5]);

// Event editor

export const EVENT_TITLE = "(No Title)";

export const EVENT_DURATION = 60;

export const EVENT_MIN_DURATION = 15;

// Event block

export const EVENT_CELL_HEIGHT_PC = 52;

export const EVENT_CELL_HEIGHT_MOBILE = 64;

export const FULL_DAY_ROW_HEIGHT = 18;

export const FULL_DAY_ROW_GAP = 2;

export const FULL_DAY_COLLAPSE_THRESHOLD = 2;

// Event editor types

export const EVENT_EDITOR_TYPE = Object.freeze({
  EVENT: "Event",
  TASK: "Task",
  BIRTHDAY: "Birthday",
});

export const EVENT_EDITOR_TYPES = Object.freeze(
  Object.values(EVENT_EDITOR_TYPE),
);

export const EVENT_SAVE_STATUS = Object.freeze({
  IDLE: "idle",
  ENCRYPTING: "encrypting",
  UPLOADING: "uploading",
  SUCCESS: "success",
  ERROR: "error",
});

export const EVENT_SUCCESS_CLOSE_DELAY = 800;

export const EVENT_ERROR_RESET_DELAY = 2000;

export const EVENT_TIME_SLOT_MINUTES = 15;

export const EVENT_TIME_SLOTS_PER_DAY = (24 * 60) / EVENT_TIME_SLOT_MINUTES;

// Recurrence update mode

export const RECURRENCE_UPDATE_MODE = Object.freeze({
  THIS_EVENT: "THIS_EVENT",
  THIS_AND_FOLLOWING: "THIS_AND_FOLLOWING",
  ALL_EVENTS: "ALL_EVENTS",
});
