import admin from "firebase-admin";
import crypto from "node:crypto";

const MAX_PARTICIPANTS = 100;
const MAX_REMINDERS = 20;

const MAX_ENCRYPTED_EVENT_DATA_LENGTH = 100_000;
const MAX_EVENT_DATA_IV_LENGTH = 100;
const MAX_ENCRYPTED_KEY_LENGTH = 1_000;
const MAX_PUBLIC_KEY_LENGTH = 1_000;
const MAX_IV_LENGTH = 100;
const MAX_SALT_LENGTH = 100;
const MAX_NOTIFICATION_TITLE_LENGTH = 200;
const MAX_RECURRENCE_INTERVAL = 1000;
const MAX_RECURRENCE_COUNT = 1000;

const RECURRENCE_TYPE = Object.freeze({
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY",
});

const RECURRENCE_END_TYPE = Object.freeze({
  NEVER: "NEVER",
  DATE: "DATE",
  COUNT: "COUNT",
});

const RECURRENCE_TYPES = new Set(Object.values(RECURRENCE_TYPE));
const RECURRENCE_END_TYPES = new Set(Object.values(RECURRENCE_END_TYPE));

function getAdminApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const adminApp = getAdminApp();
const adminAuth = admin.auth(adminApp);
const adminDb = admin.firestore(adminApp);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOnlyKeys(object, allowedKeys) {
  return Object.keys(object).every((key) => allowedKeys.has(key));
}

function hasExactKeys(object, expectedKeys) {
  const keys = Object.keys(object);

  return (
    keys.length === expectedKeys.size &&
    keys.every((key) => expectedKeys.has(key))
  );
}

function isValidBase64(value, maxLength) {
  if (!isNonEmptyString(value) || value.length > maxLength) {
    return false;
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return false;
  }

  try {
    const decoded = Buffer.from(value, "base64");

    return decoded.length > 0 && decoded.toString("base64") === value;
  } catch {
    return false;
  }
}

function isValidIsoTimestamp(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp);
}

function getBearerToken(req) {
  const authorization = req.headers.authorization;

  if (!isNonEmptyString(authorization)) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() || null;
}

function getNotificationEncryptionKey() {
  const encodedKey = process.env.NOTIFICATION_ENCRYPTION_KEY;

  if (!isNonEmptyString(encodedKey)) {
    throw new Error("NOTIFICATION_ENCRYPTION_KEY is missing.");
  }

  const key = Buffer.from(encodedKey, "base64");

  if (key.length !== 32) {
    throw new Error(
      "NOTIFICATION_ENCRYPTION_KEY must decode to exactly 32 bytes.",
    );
  }

  return key;
}

function encryptNotificationMetadata(value) {
  const key = getNotificationEncryptionKey();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const plaintext = typeof value === "string" ? value : JSON.stringify(value);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

function validateOwnerKeySlot(slot) {
  if (
    !isPlainObject(slot) ||
    !hasExactKeys(slot, new Set(["encrypted_event_key", "event_key_iv"]))
  ) {
    return false;
  }

  return (
    isValidBase64(slot.encrypted_event_key, MAX_ENCRYPTED_KEY_LENGTH) &&
    isValidBase64(slot.event_key_iv, MAX_IV_LENGTH)
  );
}

function validateFriendKeySlot(slot) {
  if (
    !isPlainObject(slot) ||
    !hasExactKeys(
      slot,
      new Set([
        "ephemeral_public_key",
        "encrypted_event_key",
        "shared_iv",
        "hkdf_salt",
      ]),
    )
  ) {
    return false;
  }

  return (
    isValidBase64(slot.ephemeral_public_key, MAX_PUBLIC_KEY_LENGTH) &&
    isValidBase64(slot.encrypted_event_key, MAX_ENCRYPTED_KEY_LENGTH) &&
    isValidBase64(slot.shared_iv, MAX_IV_LENGTH) &&
    isValidBase64(slot.hkdf_salt, MAX_SALT_LENGTH)
  );
}

function validateNotificationSettings(settings) {
  if (
    !isPlainObject(settings) ||
    !hasExactKeys(settings, new Set(["shareTitle", "notifyFriends"]))
  ) {
    return false;
  }

  return (
    typeof settings.shareTitle === "boolean" &&
    typeof settings.notifyFriends === "boolean"
  );
}

function normalizeReminders(reminders) {
  if (!Array.isArray(reminders)) {
    return null;
  }

  if (reminders.length > MAX_REMINDERS) {
    return null;
  }

  const uniqueTimestamps = new Set();

  for (const reminder of reminders) {
    if (!isValidIsoTimestamp(reminder)) {
      return null;
    }

    uniqueTimestamps.add(new Date(reminder).toISOString());
  }

  const now = Date.now();

  return [...uniqueTimestamps]
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .map((remindAt) => ({
      remindAt,
      status: Date.parse(remindAt) > now ? "pending" : "done",
      claimId: null,
      claimedAt: null,
    }));
}

async function getAcceptedFriendIds(userId) {
  const snapshot = await adminDb
    .collection("friendships")
    .where("users", "array-contains", userId)
    .where("status", "==", "accepted")
    .get();

  const friendIds = new Set();

  for (const friendshipDoc of snapshot.docs) {
    const users = friendshipDoc.data().users;

    if (!Array.isArray(users)) {
      continue;
    }

    for (const id of users) {
      if (typeof id === "string" && id !== userId) {
        friendIds.add(id);
      }
    }
  }

  return friendIds;
}

async function validateParticipants({ ownerId, participants, keys }) {
  if (
    !Array.isArray(participants) ||
    participants.length === 0 ||
    participants.length > MAX_PARTICIPANTS
  ) {
    return {
      valid: false,
      error: "Invalid participants.",
    };
  }

  if (participants.some((participant) => !isNonEmptyString(participant))) {
    return {
      valid: false,
      error: "Invalid participant ID.",
    };
  }

  const uniqueParticipants = [...new Set(participants)];

  if (uniqueParticipants.length !== participants.length) {
    return {
      valid: false,
      error: "Duplicate participants.",
    };
  }

  if (!uniqueParticipants.includes(ownerId)) {
    return {
      valid: false,
      error: "Owner must be a participant.",
    };
  }

  if (!isPlainObject(keys)) {
    return {
      valid: false,
      error: "Invalid event keys.",
    };
  }

  const keyIds = Object.keys(keys).sort();
  const participantIds = [...uniqueParticipants].sort();

  if (JSON.stringify(keyIds) !== JSON.stringify(participantIds)) {
    return {
      valid: false,
      error: "Participant and key slot mismatch.",
    };
  }

  if (!validateOwnerKeySlot(keys[ownerId])) {
    return {
      valid: false,
      error: "Invalid owner key slot.",
    };
  }

  for (const participantId of uniqueParticipants) {
    if (participantId === ownerId) {
      continue;
    }

    if (!validateFriendKeySlot(keys[participantId])) {
      return {
        valid: false,
        error: "Invalid friend key slot.",
      };
    }
  }

  const acceptedFriendIds = await getAcceptedFriendIds(ownerId);

  for (const participantId of uniqueParticipants) {
    if (participantId === ownerId) {
      continue;
    }

    if (!acceptedFriendIds.has(participantId)) {
      return {
        valid: false,
        error: "Event contains a non-friend participant.",
      };
    }
  }

  return {
    valid: true,
    participants: uniqueParticipants,
  };
}
function validateRecurrenceEnd(recurrence, occurrenceStart) {
  const endType = recurrence.endType ?? RECURRENCE_END_TYPE.NEVER;

  if (!RECURRENCE_END_TYPES.has(endType)) {
    return null;
  }

  if (endType === RECURRENCE_END_TYPE.NEVER) {
    return {
      endType,
    };
  }

  if (endType === RECURRENCE_END_TYPE.DATE) {
    if (!isValidIsoTimestamp(recurrence.endDate)) {
      return null;
    }

    const endDate = new Date(recurrence.endDate).toISOString();

    if (Date.parse(endDate) < Date.parse(occurrenceStart)) {
      return null;
    }

    return {
      endType,
      endDate,
    };
  }

  if (
    !Number.isSafeInteger(recurrence.count) ||
    recurrence.count < 1 ||
    recurrence.count > MAX_RECURRENCE_COUNT
  ) {
    return null;
  }

  return {
    endType,
    count: recurrence.count,
  };
}

function validateRecurrence(recurrence, occurrenceStart) {
  if (!isPlainObject(recurrence)) {
    return null;
  }

  const type = recurrence.type;

  if (!RECURRENCE_TYPES.has(type)) {
    return null;
  }

  if (
    !Number.isSafeInteger(recurrence.interval) ||
    recurrence.interval < 1 ||
    recurrence.interval > MAX_RECURRENCE_INTERVAL
  ) {
    return null;
  }

  const allowedKeys = new Set([
    "type",
    "interval",
    "endType",
    "endDate",
    "count",
  ]);

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
      new Set(recurrence.days).size !== recurrence.days.length ||
      !recurrence.days.every(
        (day) => Number.isSafeInteger(day) && day >= 0 && day <= 6,
      )
    ) {
      return null;
    }

    normalizedRecurrence.days = [...recurrence.days].sort((a, b) => a - b);
  }

  if (type === RECURRENCE_TYPE.MONTHLY) {
    allowedKeys.add("monthDay");

    if (
      !Number.isSafeInteger(recurrence.monthDay) ||
      recurrence.monthDay < 1 ||
      recurrence.monthDay > 31
    ) {
      return null;
    }

    normalizedRecurrence.monthDay = recurrence.monthDay;
  }

  if (type === RECURRENCE_TYPE.YEARLY) {
    allowedKeys.add("month");
    allowedKeys.add("monthDay");

    if (
      !Number.isSafeInteger(recurrence.month) ||
      recurrence.month < 1 ||
      recurrence.month > 12 ||
      !Number.isSafeInteger(recurrence.monthDay) ||
      recurrence.monthDay < 1 ||
      recurrence.monthDay > 31
    ) {
      return null;
    }

    normalizedRecurrence.month = recurrence.month;
    normalizedRecurrence.monthDay = recurrence.monthDay;
  }

  if (!hasOnlyKeys(recurrence, allowedKeys)) {
    return null;
  }

  const recurrenceEnd = validateRecurrenceEnd(recurrence, occurrenceStart);

  if (!recurrenceEnd) {
    return null;
  }

  return {
    ...normalizedRecurrence,
    ...recurrenceEnd,
  };
}

function validateRequestBody(body) {
  if (
    !isPlainObject(body) ||
    !hasOnlyKeys(
      body,
      new Set([
        "group_id",
        "participants",
        "keys",
        "encrypted_event_data",
        "event_data_iv",
        "reminders",
        "notificationSettings",
        "notificationTitle",
        "recurrence",
        "occurrenceStart",
      ]),
    )
  ) {
    return {
      valid: false,
      error: "Invalid request body.",
    };
  }

  if (!isNonEmptyString(body.group_id) || body.group_id.length > 100) {
    return {
      valid: false,
      error: "Invalid group ID.",
    };
  }

  if (
    !isValidBase64(body.encrypted_event_data, MAX_ENCRYPTED_EVENT_DATA_LENGTH)
  ) {
    return {
      valid: false,
      error: "Invalid encrypted event data.",
    };
  }

  if (!isValidBase64(body.event_data_iv, MAX_EVENT_DATA_IV_LENGTH)) {
    return {
      valid: false,
      error: "Invalid event data IV.",
    };
  }

  if (!validateNotificationSettings(body.notificationSettings)) {
    return {
      valid: false,
      error: "Invalid notification settings.",
    };
  }

  if (body.notificationSettings.shareTitle) {
    if (
      !isNonEmptyString(body.notificationTitle) ||
      body.notificationTitle.length > MAX_NOTIFICATION_TITLE_LENGTH
    ) {
      return {
        valid: false,
        error: "Notification title is required.",
      };
    }
  } else if (body.notificationTitle !== undefined) {
    return {
      valid: false,
      error: "Notification title must not be included.",
    };
  }

  const hasRecurrence = body.recurrence !== undefined;
  const hasOccurrenceStart = body.occurrenceStart !== undefined;

  if (hasRecurrence !== hasOccurrenceStart) {
    return {
      valid: false,
      error:
        "recurrence and occurrenceStart must either both be included or both be absent.",
    };
  }

  if (hasOccurrenceStart && !isValidIsoTimestamp(body.occurrenceStart)) {
    return {
      valid: false,
      error: "Invalid occurrence start.",
    };
  }

  return {
    valid: true,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      success: false,
      error: "Method not allowed.",
    });
  }

  try {
    // authenticate user
    const idToken = getBearerToken(req);

    if (!idToken) {
      return res.status(401).json({
        success: false,
        error: "Authentication required.",
      });
    }

    let decodedToken;

    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
      return res.status(401).json({
        success: false,
        error: "Invalid authentication token.",
      });
    }

    const ownerId = decodedToken.uid;

    // validate request body
    const bodyValidation = validateRequestBody(req.body);

    if (!bodyValidation.valid) {
      return res.status(400).json({
        success: false,
        error: bodyValidation.error,
      });
    }
    let recurrence = null;
    let occurrenceStart = null;

    if (req.body.recurrence !== undefined) {
      occurrenceStart = new Date(req.body.occurrenceStart).toISOString();

      recurrence = validateRecurrence(req.body.recurrence, occurrenceStart);

      if (!recurrence) {
        return res.status(400).json({
          success: false,
          error: "Invalid recurrence.",
        });
      }
    }
    // validate reminders
    const reminders = normalizeReminders(req.body.reminders);

    if (!reminders) {
      return res.status(400).json({
        success: false,
        error: "Invalid reminders.",
      });
    }

    const calculatedNextReminderAt =
      reminders.find((reminder) => reminder.status === "pending")?.remindAt ??
      null;

    // validate participants
    const participantValidation = await validateParticipants({
      ownerId,
      participants: req.body.participants,
      keys: req.body.keys,
    });

    if (!participantValidation.valid) {
      return res.status(400).json({
        success: false,
        error: participantValidation.error,
      });
    }

    // create notification metadata
    let encryptedNotificationTitle = null;

    if (req.body.notificationSettings.shareTitle) {
      encryptedNotificationTitle = encryptNotificationMetadata(
        req.body.notificationTitle.trim(),
      );
    }

    let recurrenceEncrypted = null;
    let occurrenceStartEncrypted = null;

    if (recurrence && occurrenceStart) {
      recurrenceEncrypted = encryptNotificationMetadata(recurrence);

      occurrenceStartEncrypted = encryptNotificationMetadata(occurrenceStart);
    }

    const createdAt = new Date().toISOString();

    // create firestore event
    const eventDocument = {
      ownerId,

      group_id: req.body.group_id,

      participants: participantValidation.participants,

      keys: req.body.keys,

      encrypted_event_data: req.body.encrypted_event_data,

      event_data_iv: req.body.event_data_iv,

      notificationSettings: {
        shareTitle: req.body.notificationSettings.shareTitle,

        notifyFriends: req.body.notificationSettings.notifyFriends,

        titleEncrypted: encryptedNotificationTitle,

        recurrenceEncrypted,

        occurrenceStartEncrypted,

        reminders,

        nextReminderAt: calculatedNextReminderAt,
      },

      created_at: createdAt,
    };

    const eventRef = await adminDb.collection("events").add(eventDocument);

    return res.status(201).json({
      success: true,
      eventId: eventRef.id,
      group_id: req.body.group_id,
      created_at: createdAt,
    });
  } catch (error) {
    console.error("CREATE_EVENT_API", error);

    return res.status(500).json({
      success: false,
      error: "Internal server error.",
    });
  }
}
