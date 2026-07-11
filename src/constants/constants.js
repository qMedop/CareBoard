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
  "#E879C3", // Default event color
  "#ffcb93",
  "#B5CC45",
  "#7F8FFF",
  "#45CDE8",
  "#737B86",
  "#45C996",
  "#A8ADB5",
  "#6DBCC5",
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
});

export const EVENT_AVAILABILITY_OPTIONS = Object.freeze([
  EVENT_AVAILABILITY.BUSY,
  EVENT_AVAILABILITY.FREE,
]);

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
