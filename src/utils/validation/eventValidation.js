import {
  DEFAULT_EVENT_AVAILABILITY,
  DEFAULT_EVENT_COLOR,
  DEFAULT_EVENT_NOTIFICATION,
  DEFAULT_EVENT_RECURRENCE,
  DEFAULT_EVENT_VISIBILITY,
  EVENT_AVAILABILITY_OPTIONS,
  EVENT_MIN_DURATION,
  EVENT_NOTIFICATION_OPTIONS,
  EVENT_VISIBILITY,
  RECURRENCE_END_TYPE,
  RECURRENCE_TYPE,
} from "../../constants/constants";

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 10_000;
const MAX_INVITED_FRIENDS = 100;
const MAX_REMINDERS = EVENT_NOTIFICATION_OPTIONS.length + 1;
const MAX_RECURRENCE_INTERVAL = 1000;
const MAX_RECURRENCE_COUNT = 1000;

const MILLISECONDS_PER_MINUTE = 60_000;

const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

const COMMON_EVENT_KEYS = new Set([
  "title",
  "description",
  "timeRange",
  "color",
  "visibility",
  "availability",
  "notification",
  "notificationSettings",
  "emoji",
  "recurrence",
  "group_id",
  "invitedIds",
  "invitedFriendsFull",
  "isFullDay",
  "reminders",
]);

const NEW_EVENT_KEYS = COMMON_EVENT_KEYS;

const DECRYPTED_EVENT_KEYS = new Set([
  ...COMMON_EVENT_KEYS,
  "id",
  "created_at",
]);

const ALLOWED_TIME_RANGE_KEYS = new Set(["start", "end"]);

const ALLOWED_NOTIFICATION_SETTINGS_KEYS = new Set([
  "shareTitle",
  "notifyFriends",
]);

const ALLOWED_INVITED_FRIEND_KEYS = new Set(["id", "publicKey"]);

const RECURRENCE_TYPES = new Set(Object.values(RECURRENCE_TYPE));
const RECURRENCE_END_TYPES = new Set(Object.values(RECURRENCE_END_TYPE));
const VISIBILITIES = new Set(Object.values(EVENT_VISIBILITY));
const AVAILABILITIES = new Set(EVENT_AVAILABILITY_OPTIONS);

const NOTIFICATION_OPTIONS = new Set([
  DEFAULT_EVENT_NOTIFICATION,
  ...EVENT_NOTIFICATION_OPTIONS,
]);

export const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  shareTitle: false,
  notifyFriends: true,
});

export const EVENT_VALIDATION_ERROR = Object.freeze({
  EVENT_INVALID: "EVENT_INVALID",
  UNKNOWN_FIELD: "UNKNOWN_FIELD",

  TITLE_INVALID: "TITLE_INVALID",
  DESCRIPTION_INVALID: "DESCRIPTION_INVALID",
  COLOR_INVALID: "COLOR_INVALID",
  EMOJI_INVALID: "EMOJI_INVALID",

  TIME_RANGE_INVALID: "TIME_RANGE_INVALID",
  TIME_START_INVALID: "TIME_START_INVALID",
  TIME_END_INVALID: "TIME_END_INVALID",
  TIME_ORDER_INVALID: "TIME_ORDER_INVALID",
  TIME_DURATION_INVALID: "TIME_DURATION_INVALID",
  FULL_DAY_INVALID: "FULL_DAY_INVALID",

  VISIBILITY_INVALID: "VISIBILITY_INVALID",
  AVAILABILITY_INVALID: "AVAILABILITY_INVALID",

  NOTIFICATION_INVALID: "NOTIFICATION_INVALID",
  NOTIFICATION_DUPLICATE: "NOTIFICATION_DUPLICATE",
  NOTIFICATION_SETTINGS_INVALID: "NOTIFICATION_SETTINGS_INVALID",

  INVITED_IDS_INVALID: "INVITED_IDS_INVALID",
  INVITED_FRIENDS_INVALID: "INVITED_FRIENDS_INVALID",
  INVITED_FRIENDS_MISMATCH: "INVITED_FRIENDS_MISMATCH",

  RECURRENCE_INVALID: "RECURRENCE_INVALID",
  RECURRENCE_INTERVAL_INVALID: "RECURRENCE_INTERVAL_INVALID",
  RECURRENCE_DAYS_INVALID: "RECURRENCE_DAYS_INVALID",
  RECURRENCE_MONTH_DAY_INVALID: "RECURRENCE_MONTH_DAY_INVALID",
  RECURRENCE_MONTH_INVALID: "RECURRENCE_MONTH_INVALID",
  RECURRENCE_END_INVALID: "RECURRENCE_END_INVALID",
  RECURRENCE_END_DATE_INVALID: "RECURRENCE_END_DATE_INVALID",
  RECURRENCE_COUNT_INVALID: "RECURRENCE_COUNT_INVALID",

  GROUP_ID_INVALID: "GROUP_ID_INVALID",
  CREATED_AT_INVALID: "CREATED_AT_INVALID",
  ID_INVALID: "ID_INVALID",
  REMINDERS_INVALID: "REMINDERS_INVALID",
  REMINDERS_DUPLICATE: "REMINDERS_DUPLICATE",
  REMINDERS_MISMATCH: "REMINDERS_MISMATCH",
});

function success(value) {
  return {
    success: true,
    value,
    errors: [],
  };
}

function failure(errors) {
  return {
    success: false,
    value: null,
    errors,
  };
}

function createError(code, field, message) {
  return {
    code,
    field,
    message,
  };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value, allowedKeys) {
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isValidDateString(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  return Number.isFinite(Date.parse(value));
}

function isValidId(value) {
  return isNonEmptyString(value) && value.length <= 128 && !value.includes("/");
}

function hasDuplicates(values) {
  return new Set(values).size !== values.length;
}

function validateTitle(title, errors) {
  if (typeof title !== "string" || title.length > MAX_TITLE_LENGTH) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.TITLE_INVALID,
        "title",
        `Title must be a string with at most ${MAX_TITLE_LENGTH} characters.`,
      ),
    );

    return "";
  }

  return title.trim();
}

function validateDescription(description, errors) {
  if (
    typeof description !== "string" ||
    description.length > MAX_DESCRIPTION_LENGTH
  ) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.DESCRIPTION_INVALID,
        "description",
        `Description must be a string with at most ${MAX_DESCRIPTION_LENGTH} characters.`,
      ),
    );

    return "";
  }

  return description.trim();
}

function validateColor(color, errors) {
  if (typeof color !== "string") {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.COLOR_INVALID,
        "color",
        "Color must be a valid six-digit HEX color.",
      ),
    );

    return DEFAULT_EVENT_COLOR;
  }

  const normalizedColor = color.trim().toUpperCase();

  if (!HEX_COLOR_PATTERN.test(normalizedColor)) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.COLOR_INVALID,
        "color",
        "Color must be a valid six-digit HEX color.",
      ),
    );

    return DEFAULT_EVENT_COLOR;
  }

  return normalizedColor;
}

function validateEmoji(emoji, errors) {
  if (emoji === null || emoji === undefined || emoji === "") {
    return null;
  }

  if (typeof emoji !== "string" || emoji.length > 32) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.EMOJI_INVALID,
        "emoji",
        "Emoji is invalid.",
      ),
    );

    return null;
  }

  return emoji;
}

function validateTimeRange(timeRange, isFullDay, errors) {
  if (
    !isPlainObject(timeRange) ||
    !hasOnlyKeys(timeRange, ALLOWED_TIME_RANGE_KEYS)
  ) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.TIME_RANGE_INVALID,
        "timeRange",
        "Time range is invalid.",
      ),
    );

    return null;
  }

  const startTimestamp = Date.parse(timeRange.start);
  const endTimestamp = Date.parse(timeRange.end);

  if (!isValidDateString(timeRange.start)) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.TIME_START_INVALID,
        "timeRange.start",
        "Event start time is invalid.",
      ),
    );
  }

  if (!isValidDateString(timeRange.end)) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.TIME_END_INVALID,
        "timeRange.end",
        "Event end time is invalid.",
      ),
    );
  }

  if (
    !isValidDateString(timeRange.start) ||
    !isValidDateString(timeRange.end)
  ) {
    return null;
  }

  if (endTimestamp <= startTimestamp) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.TIME_ORDER_INVALID,
        "timeRange",
        "Event end time must be after its start time.",
      ),
    );
  }

  if (
    !isFullDay &&
    endTimestamp - startTimestamp < EVENT_MIN_DURATION * MILLISECONDS_PER_MINUTE
  ) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.TIME_DURATION_INVALID,
        "timeRange",
        `Event duration must be at least ${EVENT_MIN_DURATION} minutes.`,
      ),
    );
  }

  return {
    start: new Date(startTimestamp).toISOString(),
    end: new Date(endTimestamp).toISOString(),
  };
}

function validateVisibility(visibility, errors) {
  if (!VISIBILITIES.has(visibility)) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.VISIBILITY_INVALID,
        "visibility",
        "Event visibility is invalid.",
      ),
    );

    return DEFAULT_EVENT_VISIBILITY;
  }

  return visibility;
}

function validateAvailability(availability, errors) {
  if (!AVAILABILITIES.has(availability)) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.AVAILABILITY_INVALID,
        "availability",
        "Event availability is invalid.",
      ),
    );

    return DEFAULT_EVENT_AVAILABILITY;
  }

  return availability;
}

function validateNotifications(notification, errors) {
  if (!Array.isArray(notification) || notification.length > MAX_REMINDERS) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.NOTIFICATION_INVALID,
        "notification",
        "Notifications must be a valid array of reminder offsets.",
      ),
    );

    return [];
  }

  if (hasDuplicates(notification)) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.NOTIFICATION_DUPLICATE,
        "notification",
        "Notifications cannot contain duplicate reminder offsets.",
      ),
    );
  }

  if (
    !notification.every(
      (value) => Number.isSafeInteger(value) && NOTIFICATION_OPTIONS.has(value),
    )
  ) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.NOTIFICATION_INVALID,
        "notification",
        "One or more notification offsets are invalid.",
      ),
    );
  }

  return [...new Set(notification)].sort((a, b) => a - b);
}

function validateNotificationSettings(notificationSettings, errors) {
  if (
    !isPlainObject(notificationSettings) ||
    !hasOnlyKeys(notificationSettings, ALLOWED_NOTIFICATION_SETTINGS_KEYS) ||
    typeof notificationSettings.shareTitle !== "boolean" ||
    typeof notificationSettings.notifyFriends !== "boolean"
  ) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.NOTIFICATION_SETTINGS_INVALID,
        "notificationSettings",
        "Notification settings are invalid.",
      ),
    );

    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
    };
  }

  return {
    shareTitle: notificationSettings.shareTitle,
    notifyFriends: notificationSettings.notifyFriends,
  };
}

function validateReminders(value, timeRange, notification, errors) {
  if (!Array.isArray(value)) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.REMINDERS_INVALID,
        "reminders",
        "Reminders must be an array.",
      ),
    );

    return [];
  }

  const normalizedReminders = [];

  for (const reminder of value) {
    if (typeof reminder !== "string" || !isValidDateString(reminder)) {
      errors.push(
        createError(
          EVENT_VALIDATION_ERROR.REMINDERS_INVALID,
          "reminders",
          "Every reminder must be a valid ISO timestamp.",
        ),
      );

      return [];
    }

    normalizedReminders.push(new Date(reminder).toISOString());
  }

  if (new Set(normalizedReminders).size !== normalizedReminders.length) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.REMINDERS_DUPLICATE,
        "reminders",
        "Reminders cannot contain duplicates.",
      ),
    );

    return [];
  }

  const sortedReminders = [...normalizedReminders].sort(
    (a, b) => Date.parse(a) - Date.parse(b),
  );

  if (!timeRange || !Array.isArray(notification)) {
    return sortedReminders;
  }

  const startTimestamp = Date.parse(timeRange.start);

  const expectedReminders = notification
    .map((minutesBefore) =>
      new Date(
        startTimestamp - minutesBefore * MILLISECONDS_PER_MINUTE,
      ).toISOString(),
    )
    .sort((a, b) => Date.parse(a) - Date.parse(b));

  const matchesExpectedReminders =
    sortedReminders.length === expectedReminders.length &&
    sortedReminders.every(
      (reminder, index) => reminder === expectedReminders[index],
    );

  if (!matchesExpectedReminders) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.REMINDERS_MISMATCH,
        "reminders",
        "Reminders do not match the event start time and notification settings.",
      ),
    );
  }

  return sortedReminders;
}

function validateInvitedIds(invitedIds, errors) {
  if (
    !Array.isArray(invitedIds) ||
    invitedIds.length > MAX_INVITED_FRIENDS ||
    hasDuplicates(invitedIds) ||
    !invitedIds.every(isValidId)
  ) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.INVITED_IDS_INVALID,
        "invitedIds",
        "Invited friend IDs are invalid.",
      ),
    );

    return [];
  }

  return [...invitedIds];
}

function validateInvitedFriends(invitedFriendsFull, errors) {
  if (
    !Array.isArray(invitedFriendsFull) ||
    invitedFriendsFull.length > MAX_INVITED_FRIENDS
  ) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.INVITED_FRIENDS_INVALID,
        "invitedFriendsFull",
        "Invited friend data is invalid.",
      ),
    );

    return [];
  }

  const normalizedFriends = [];

  for (const friend of invitedFriendsFull) {
    if (
      !isPlainObject(friend) ||
      !hasOnlyKeys(friend, ALLOWED_INVITED_FRIEND_KEYS) ||
      !isValidId(friend.id) ||
      !isNonEmptyString(friend.publicKey)
    ) {
      errors.push(
        createError(
          EVENT_VALIDATION_ERROR.INVITED_FRIENDS_INVALID,
          "invitedFriendsFull",
          "One or more invited friends are invalid.",
        ),
      );

      continue;
    }

    normalizedFriends.push({
      id: friend.id,
      publicKey: friend.publicKey,
    });
  }

  if (hasDuplicates(normalizedFriends.map((friend) => friend.id))) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.INVITED_FRIENDS_INVALID,
        "invitedFriendsFull",
        "Invited friends cannot contain duplicate users.",
      ),
    );
  }

  return normalizedFriends;
}

function validateVisibilityFriends(
  visibility,
  invitedIds,
  invitedFriendsFull,
  errors,
) {
  if (visibility !== EVENT_VISIBILITY.SPECIFIC) {
    if (invitedIds.length > 0 || invitedFriendsFull.length > 0) {
      errors.push(
        createError(
          EVENT_VALIDATION_ERROR.INVITED_FRIENDS_MISMATCH,
          "invitedIds",
          "Only specific visibility may contain explicitly invited friends.",
        ),
      );
    }

    return;
  }

  if (invitedIds.length === 0) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.INVITED_FRIENDS_MISMATCH,
        "invitedIds",
        "Specific visibility requires at least one invited friend.",
      ),
    );

    return;
  }

  const invitedIdSet = new Set(invitedIds);

  const friendIdSet = new Set(invitedFriendsFull.map((friend) => friend.id));

  if (
    invitedIdSet.size !== friendIdSet.size ||
    !invitedIds.every((id) => friendIdSet.has(id))
  ) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.INVITED_FRIENDS_MISMATCH,
        "invitedFriendsFull",
        "Invited friend IDs and invited friend data do not match.",
      ),
    );
  }
}

function validateRecurrenceEnd(recurrence, startTimestamp, errors) {
  const endType = recurrence.endType ?? RECURRENCE_END_TYPE.NEVER;

  if (!RECURRENCE_END_TYPES.has(endType)) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.RECURRENCE_END_INVALID,
        "recurrence.endType",
        "Recurrence end type is invalid.",
      ),
    );

    return null;
  }

  if (endType === RECURRENCE_END_TYPE.NEVER) {
    return {
      endType,
    };
  }

  if (endType === RECURRENCE_END_TYPE.DATE) {
    if (!isValidDateString(recurrence.endDate)) {
      errors.push(
        createError(
          EVENT_VALIDATION_ERROR.RECURRENCE_END_DATE_INVALID,
          "recurrence.endDate",
          "Recurrence end date is invalid.",
        ),
      );

      return null;
    }

    const endDateTimestamp = Date.parse(recurrence.endDate);

    if (endDateTimestamp < startTimestamp) {
      errors.push(
        createError(
          EVENT_VALIDATION_ERROR.RECURRENCE_END_DATE_INVALID,
          "recurrence.endDate",
          "Recurrence end date cannot be before the event start.",
        ),
      );
    }

    return {
      endType,
      endDate: new Date(endDateTimestamp).toISOString(),
    };
  }

  if (
    !Number.isSafeInteger(recurrence.count) ||
    recurrence.count < 1 ||
    recurrence.count > MAX_RECURRENCE_COUNT
  ) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.RECURRENCE_COUNT_INVALID,
        "recurrence.count",
        `Recurrence count must be between 1 and ${MAX_RECURRENCE_COUNT}.`,
      ),
    );

    return null;
  }

  return {
    endType,
    count: recurrence.count,
  };
}

function validateRecurrence(recurrence, eventStart, errors) {
  if (!isPlainObject(recurrence)) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.RECURRENCE_INVALID,
        "recurrence",
        "Recurrence is invalid.",
      ),
    );

    return {
      ...DEFAULT_EVENT_RECURRENCE,
    };
  }

  const type = recurrence.type;

  if (!RECURRENCE_TYPES.has(type)) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.RECURRENCE_INVALID,
        "recurrence.type",
        "Recurrence type is invalid.",
      ),
    );

    return {
      ...DEFAULT_EVENT_RECURRENCE,
    };
  }

  if (type === RECURRENCE_TYPE.NONE) {
    if (!hasOnlyKeys(recurrence, new Set(["type"]))) {
      errors.push(
        createError(
          EVENT_VALIDATION_ERROR.RECURRENCE_INVALID,
          "recurrence",
          "Non-recurring events cannot contain recurrence configuration.",
        ),
      );
    }

    return {
      type,
    };
  }

  const allowedKeys = new Set([
    "type",
    "interval",
    "endType",
    "endDate",
    "count",
  ]);

  if (
    !Number.isSafeInteger(recurrence.interval) ||
    recurrence.interval < 1 ||
    recurrence.interval > MAX_RECURRENCE_INTERVAL
  ) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.RECURRENCE_INTERVAL_INVALID,
        "recurrence.interval",
        `Recurrence interval must be between 1 and ${MAX_RECURRENCE_INTERVAL}.`,
      ),
    );
  }

  const normalizedRecurrence = {
    type,
    interval: recurrence.interval,
  };

  if (type === RECURRENCE_TYPE.WEEKLY) {
    allowedKeys.add("days");

    if (
      !Array.isArray(recurrence.days) ||
      recurrence.days.length === 0 ||
      recurrence.days.length > 7 ||
      hasDuplicates(recurrence.days) ||
      !recurrence.days.every(
        (day) => Number.isSafeInteger(day) && day >= 0 && day <= 6,
      )
    ) {
      errors.push(
        createError(
          EVENT_VALIDATION_ERROR.RECURRENCE_DAYS_INVALID,
          "recurrence.days",
          "Weekly recurrence days are invalid.",
        ),
      );
    } else {
      normalizedRecurrence.days = [...recurrence.days].sort((a, b) => a - b);
    }
  }

  if (type === RECURRENCE_TYPE.MONTHLY) {
    allowedKeys.add("monthDay");

    if (
      !Number.isSafeInteger(recurrence.monthDay) ||
      recurrence.monthDay < 1 ||
      recurrence.monthDay > 31
    ) {
      errors.push(
        createError(
          EVENT_VALIDATION_ERROR.RECURRENCE_MONTH_DAY_INVALID,
          "recurrence.monthDay",
          "Monthly recurrence day must be between 1 and 31.",
        ),
      );
    } else {
      normalizedRecurrence.monthDay = recurrence.monthDay;
    }
  }

  if (type === RECURRENCE_TYPE.YEARLY) {
    allowedKeys.add("month");
    allowedKeys.add("monthDay");

    if (
      !Number.isSafeInteger(recurrence.month) ||
      recurrence.month < 1 ||
      recurrence.month > 12
    ) {
      errors.push(
        createError(
          EVENT_VALIDATION_ERROR.RECURRENCE_MONTH_INVALID,
          "recurrence.month",
          "Yearly recurrence month must be between 1 and 12.",
        ),
      );
    } else {
      normalizedRecurrence.month = recurrence.month;
    }

    if (
      !Number.isSafeInteger(recurrence.monthDay) ||
      recurrence.monthDay < 1 ||
      recurrence.monthDay > 31
    ) {
      errors.push(
        createError(
          EVENT_VALIDATION_ERROR.RECURRENCE_MONTH_DAY_INVALID,
          "recurrence.monthDay",
          "Yearly recurrence day must be between 1 and 31.",
        ),
      );
    } else {
      normalizedRecurrence.monthDay = recurrence.monthDay;
    }
  }

  if (!hasOnlyKeys(recurrence, allowedKeys)) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.RECURRENCE_INVALID,
        "recurrence",
        "Recurrence contains unsupported fields.",
      ),
    );
  }

  const recurrenceEnd = validateRecurrenceEnd(
    recurrence,
    Date.parse(eventStart),
    errors,
  );

  if (recurrenceEnd) {
    Object.assign(normalizedRecurrence, recurrenceEnd);
  }

  return normalizedRecurrence;
}

function validateOptionalId(value, field, errorCode, errors) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isValidId(value)) {
    errors.push(createError(errorCode, field, `${field} is invalid.`));

    return undefined;
  }

  return value;
}

function validateCreatedAt(createdAt, errors) {
  if (createdAt === undefined || createdAt === null) {
    return undefined;
  }

  if (!isValidDateString(createdAt)) {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.CREATED_AT_INVALID,
        "created_at",
        "Event creation timestamp is invalid.",
      ),
    );

    return undefined;
  }

  return new Date(Date.parse(createdAt)).toISOString();
}

function validateEvent(event, mode) {
  const errors = [];

  if (!isPlainObject(event)) {
    return failure([
      createError(
        EVENT_VALIDATION_ERROR.EVENT_INVALID,
        "event",
        "Event must be an object.",
      ),
    ]);
  }

  const allowedKeys = mode === "new" ? NEW_EVENT_KEYS : DECRYPTED_EVENT_KEYS;

  for (const key of Object.keys(event)) {
    if (!allowedKeys.has(key)) {
      errors.push(
        createError(
          EVENT_VALIDATION_ERROR.UNKNOWN_FIELD,
          key,
          `Unknown event field: ${key}.`,
        ),
      );
    }
  }

  if (typeof event.isFullDay !== "boolean") {
    errors.push(
      createError(
        EVENT_VALIDATION_ERROR.FULL_DAY_INVALID,
        "isFullDay",
        "isFullDay must be a boolean.",
      ),
    );
  }

  const isFullDay =
    typeof event.isFullDay === "boolean" ? event.isFullDay : false;

  const title = validateTitle(event.title, errors);

  const description = validateDescription(event.description, errors);

  const color = validateColor(event.color, errors);

  const emoji = validateEmoji(event.emoji, errors);

  const timeRange = validateTimeRange(event.timeRange, isFullDay, errors);

  const visibility = validateVisibility(event.visibility, errors);

  const availability = validateAvailability(event.availability, errors);

  const notification = validateNotifications(event.notification, errors);

  const reminders = validateReminders(
    event.reminders,
    timeRange,
    notification,
    errors,
  );

  const notificationSettings = validateNotificationSettings(
    event.notificationSettings,
    errors,
  );

  const invitedIds = validateInvitedIds(event.invitedIds, errors);

  const invitedFriendsFull = validateInvitedFriends(
    event.invitedFriendsFull,
    errors,
  );

  validateVisibilityFriends(visibility, invitedIds, invitedFriendsFull, errors);

  const recurrence = validateRecurrence(
    event.recurrence,
    timeRange?.start ?? event.timeRange?.start,
    errors,
  );

  const groupId = validateOptionalId(
    event.group_id,
    "group_id",
    EVENT_VALIDATION_ERROR.GROUP_ID_INVALID,
    errors,
  );

  const normalizedEvent = {
    title,
    description,
    timeRange,
    color,
    visibility,
    availability,
    notification,
    reminders,
    notificationSettings,
    emoji,
    recurrence,
    invitedIds,
    invitedFriendsFull,
    isFullDay,
  };

  if (groupId !== undefined) {
    normalizedEvent.group_id = groupId;
  }

  if (mode === "decrypted") {
    const id = validateOptionalId(
      event.id,
      "id",
      EVENT_VALIDATION_ERROR.ID_INVALID,
      errors,
    );

    const createdAt = validateCreatedAt(event.created_at, errors);

    if (id !== undefined) {
      normalizedEvent.id = id;
    }

    if (createdAt !== undefined) {
      normalizedEvent.created_at = createdAt;
    }
  }

  if (errors.length > 0) {
    return failure(errors);
  }

  return success(normalizedEvent);
}

export function validateNewEvent(event) {
  return validateEvent(event, "new");
}

export function validateDecryptedEvent(event) {
  return validateEvent(event, "decrypted");
}
