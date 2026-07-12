import admin from "firebase-admin";
import crypto from "node:crypto";

const ALLOWED_VISIBILITIES = new Set(["visible", "private", "specific"]);

const MAX_PARTICIPANTS = 100;
const MAX_REMINDERS = 20;

const MAX_ENCRYPTED_EVENT_DATA_LENGTH = 100_000;
const MAX_EVENT_DATA_IV_LENGTH = 100;
const MAX_ENCRYPTED_KEY_LENGTH = 1_000;
const MAX_PUBLIC_KEY_LENGTH = 1_000;
const MAX_IV_LENGTH = 100;
const MAX_SALT_LENGTH = 100;
const MAX_NOTIFICATION_TITLE_LENGTH = 200;

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

function encryptNotificationTitle(title) {
  const key = getNotificationEncryptionKey();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(title, "utf8"),
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

  return [...uniqueTimestamps]
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .map((remindAt) => ({
      remindAt,
      status: "pending",
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

async function validateParticipants({
  ownerId,
  visibility,
  participants,
  keys,
}) {
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

  if (
    visibility === "private" &&
    (uniqueParticipants.length !== 1 || uniqueParticipants[0] !== ownerId)
  ) {
    return {
      valid: false,
      error: "Private events cannot have other participants.",
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

  if (visibility === "private") {
    return {
      valid: true,
      participants: uniqueParticipants,
    };
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

function validateRequestBody(body) {
  if (
    !isPlainObject(body) ||
    !hasOnlyKeys(
      body,
      new Set([
        "group_id",
        "visibility",
        "participants",
        "keys",
        "encrypted_event_data",
        "event_data_iv",
        "reminders",
        "nextReminderAt",
        "notificationSettings",
        "notificationTitle",
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

  if (!ALLOWED_VISIBILITIES.has(body.visibility)) {
    return {
      valid: false,
      error: "Invalid visibility.",
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

    // validate reminders
    const reminders = normalizeReminders(req.body.reminders);

    if (!reminders) {
      return res.status(400).json({
        success: false,
        error: "Invalid reminders.",
      });
    }

    const pendingReminders = reminders.filter(
      (reminder) => reminder.status === "pending",
    );

    const calculatedNextReminderAt = pendingReminders[0]?.remindAt ?? null;

    if (
      req.body.nextReminderAt !== null &&
      req.body.nextReminderAt !== undefined &&
      !isValidIsoTimestamp(req.body.nextReminderAt)
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid next reminder timestamp.",
      });
    }

    if ((req.body.nextReminderAt ?? null) !== calculatedNextReminderAt) {
      return res.status(400).json({
        success: false,
        error: "nextReminderAt does not match reminders.",
      });
    }

    // validate participants
    const participantValidation = await validateParticipants({
      ownerId,
      visibility: req.body.visibility,
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
      encryptedNotificationTitle = encryptNotificationTitle(
        req.body.notificationTitle.trim(),
      );
    }

    const createdAt = new Date().toISOString();

    // create firestore event
    const eventDocument = {
      ownerId,

      group_id: req.body.group_id,

      visibility: req.body.visibility,

      participants: participantValidation.participants,

      keys: req.body.keys,

      encrypted_event_data: req.body.encrypted_event_data,

      event_data_iv: req.body.event_data_iv,

      reminders,

      nextReminderAt: calculatedNextReminderAt,

      notificationSettings: {
        shareTitle: req.body.notificationSettings.shareTitle,

        notifyFriends: req.body.notificationSettings.notifyFriends,
      },

      created_at: createdAt,
    };

    if (encryptedNotificationTitle) {
      eventDocument.notificationTitleEncrypted = encryptedNotificationTitle;
    }

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
