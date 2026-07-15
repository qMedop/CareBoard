import crypto from "crypto";
import admin from "firebase-admin";

const MAX_EVENTS_PER_RUN = 50;
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

const GENERIC_NOTIFICATION_TITLE = "CareBoard";
const GENERIC_NOTIFICATION_BODY = "You have an upcoming event.";

function getFirebaseAdmin() {
  if (admin.apps.length) {
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

function getBearerToken(req) {
  const authorization = req.headers.authorization;

  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    return null;
  }

  const token = authorization.slice(7).trim();

  return token || null;
}

function authenticateCronRequest(req) {
  const providedSecret = getBearerToken(req);
  const expectedSecret = process.env.CRON_SECRET;

  if (
    typeof providedSecret !== "string" ||
    typeof expectedSecret !== "string" ||
    !providedSecret ||
    !expectedSecret
  ) {
    return false;
  }

  const providedBuffer = Buffer.from(providedSecret);
  const expectedBuffer = Buffer.from(expectedSecret);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function getNotificationEncryptionKey() {
  const encodedKey = process.env.NOTIFICATION_ENCRYPTION_KEY;

  if (!encodedKey) {
    throw new Error("NOTIFICATION_ENCRYPTION_KEY is not configured.");
  }

  const key = Buffer.from(encodedKey, "base64");

  if (key.length !== 32) {
    throw new Error(
      "NOTIFICATION_ENCRYPTION_KEY must decode to exactly 32 bytes.",
    );
  }

  return key;
}

function decryptNotificationMetadata(encrypted) {
  if (
    !encrypted ||
    typeof encrypted.ciphertext !== "string" ||
    typeof encrypted.iv !== "string" ||
    typeof encrypted.authTag !== "string"
  ) {
    throw new Error("Invalid encrypted notification metadata.");
  }

  const key = getNotificationEncryptionKey();

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encrypted.iv, "base64"),
  );

  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

async function claimDueReminder(db, eventRef, now) {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(eventRef);

    if (!snapshot.exists) {
      return null;
    }

    const event = snapshot.data();
    const settings = event.notificationSettings;

    if (!settings || !Array.isArray(settings.reminders)) {
      return null;
    }

    // TEMPORARY:
    // Recurring notification processing is not implemented yet.
    // Ignore recurring events completely.
    if (settings.recurrenceEncrypted) {
      return null;
    }

    const nextReminderTimestamp = Date.parse(settings.nextReminderAt);

    if (
      !Number.isFinite(nextReminderTimestamp) ||
      nextReminderTimestamp > now.getTime()
    ) {
      return null;
    }

    const staleBefore = now.getTime() - CLAIM_TIMEOUT_MS;

    const candidates = settings.reminders
      .map((reminder, index) => ({
        reminder,
        index,
        timestamp: Date.parse(reminder.remindAt),
      }))
      .filter(({ reminder, timestamp }) => {
        if (!Number.isFinite(timestamp) || timestamp > now.getTime()) {
          return false;
        }

        if (reminder.status === "pending") {
          return true;
        }

        if (reminder.status === "processing") {
          const claimedTimestamp = Date.parse(reminder.claimedAt);

          return (
            !Number.isFinite(claimedTimestamp) ||
            claimedTimestamp <= staleBefore
          );
        }

        return false;
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    const candidate = candidates[0];

    if (!candidate) {
      return null;
    }

    const claimId = crypto.randomUUID();
    const claimedAt = now.toISOString();

    const updatedReminders = settings.reminders.map((reminder, index) => {
      if (index !== candidate.index) {
        return reminder;
      }

      return {
        ...reminder,
        status: "processing",
        claimId,
        claimedAt,
      };
    });

    transaction.update(eventRef, {
      "notificationSettings.reminders": updatedReminders,
    });

    return {
      eventId: snapshot.id,
      eventRef,
      ownerId: event.ownerId,
      participants: Array.isArray(event.participants) ? event.participants : [],
      notificationSettings: {
        ...settings,
        reminders: updatedReminders,
      },
      claimId,
      remindAt: candidate.reminder.remindAt,
    };
  });
}

function getRecipientIds(claim) {
  const { ownerId, participants, notificationSettings } = claim;

  if (!ownerId) {
    return [];
  }

  if (!notificationSettings.notifyFriends) {
    return [ownerId];
  }

  return [
    ...new Set([
      ownerId,
      ...participants.filter(
        (participantId) =>
          typeof participantId === "string" && participantId.length > 0,
      ),
    ]),
  ];
}

async function getRecipientTokens(db, recipientIds) {
  const tokenOwners = new Map();

  await Promise.all(
    recipientIds.map(async (uid) => {
      const snapshot = await db.collection("users").doc(uid).get();

      if (!snapshot.exists) {
        return;
      }

      const data = snapshot.data();

      if (!Array.isArray(data.fcmTokens)) {
        return;
      }

      for (const token of data.fcmTokens) {
        if (typeof token !== "string" || !token.trim()) {
          continue;
        }

        const normalizedToken = token.trim();

        if (!tokenOwners.has(normalizedToken)) {
          tokenOwners.set(normalizedToken, new Set());
        }

        tokenOwners.get(normalizedToken).add(uid);
      }
    }),
  );

  return tokenOwners;
}

async function removeInvalidTokens(db, invalidTokens, tokenOwners) {
  const removalsByUser = new Map();

  for (const token of invalidTokens) {
    const owners = tokenOwners.get(token);

    if (!owners) {
      continue;
    }

    for (const uid of owners) {
      if (!removalsByUser.has(uid)) {
        removalsByUser.set(uid, new Set());
      }

      removalsByUser.get(uid).add(token);
    }
  }

  await Promise.all(
    [...removalsByUser.entries()].map(async ([uid, tokens]) => {
      await db
        .collection("users")
        .doc(uid)
        .update({
          fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokens),
        });
    }),
  );
}

async function sendClaimedReminder(db, claim) {
  const recipientIds = getRecipientIds(claim);

  const tokenOwners = await getRecipientTokens(db, recipientIds);

  const tokens = [...tokenOwners.keys()];

  let notificationTitle = GENERIC_NOTIFICATION_TITLE;

  let notificationBody = GENERIC_NOTIFICATION_BODY;

  if (claim.notificationSettings.shareTitle) {
    try {
      const decryptedTitle = decryptNotificationMetadata(
        claim.notificationSettings.titleEncrypted,
      );

      if (decryptedTitle.trim()) {
        notificationBody = decryptedTitle.trim();
      }
    } catch (error) {
      console.error(
        "NOTIFICATION_TITLE_DECRYPTION_FAILED",
        claim.eventId,
        error,
      );

      // Use generic notification instead.
    }
  }

  // No registered devices is not considered a transient
  // messaging failure. The reminder can still be finalized.
  if (tokens.length === 0) {
    return {
      success: true,
      successCount: 0,
      failureCount: 0,
      invalidTokensRemoved: 0,
    };
  }

  let response;

  try {
    response = await admin.messaging().sendEachForMulticast({
      tokens,

      notification: {
        title: notificationTitle,
        body: notificationBody,
      },

      webpush: {
        notification: {
          icon: "/logo192.png",
        },

        fcmOptions: {
          link: "/calendar/",
        },
      },
    });
  } catch (error) {
    console.error("FCM_MULTICAST_SEND_FAILED", claim.eventId, error);

    return {
      success: false,
      transientFailure: true,
    };
  }

  const invalidTokens = [];

  let hasTransientFailure = false;

  response.responses.forEach((result, index) => {
    if (result.success) {
      return;
    }

    const errorCode = result.error?.code;

    if (
      errorCode === "messaging/registration-token-not-registered" ||
      errorCode === "messaging/invalid-registration-token"
    ) {
      invalidTokens.push(tokens[index]);
      return;
    }

    // Any failure that is not a permanently invalid
    // registration token is treated as retryable for now.
    hasTransientFailure = true;

    console.error("FCM_TOKEN_SEND_FAILED", claim.eventId, errorCode);
  });

  if (invalidTokens.length > 0) {
    try {
      await removeInvalidTokens(db, invalidTokens, tokenOwners);
    } catch (error) {
      console.error("INVALID_TOKEN_REMOVAL_FAILED", claim.eventId, error);
    }
  }

  if (hasTransientFailure) {
    return {
      success: false,
      transientFailure: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokensRemoved: invalidTokens.length,
    };
  }

  return {
    success: true,
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokensRemoved: invalidTokens.length,
  };
}

async function finalizeReminder(db, eventRef, claimId) {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(eventRef);

    if (!snapshot.exists) {
      return false;
    }

    const event = snapshot.data();
    const settings = event.notificationSettings;

    if (!settings || !Array.isArray(settings.reminders)) {
      return false;
    }

    const claimedIndex = settings.reminders.findIndex(
      (reminder) =>
        reminder.status === "processing" && reminder.claimId === claimId,
    );

    if (claimedIndex === -1) {
      return false;
    }

    const updatedReminders = settings.reminders.map((reminder, index) => {
      if (index !== claimedIndex) {
        return reminder;
      }

      return {
        ...reminder,
        status: "done",
        claimId: null,
        claimedAt: null,
      };
    });

    const nextPendingReminder =
      updatedReminders
        .filter((reminder) => reminder.status === "pending")
        .sort((a, b) => Date.parse(a.remindAt) - Date.parse(b.remindAt))[0] ??
      null;

    // This version only processes non-recurring events.
    const nextReminderAt = nextPendingReminder?.remindAt ?? null;

    transaction.update(eventRef, {
      "notificationSettings.reminders": updatedReminders,

      "notificationSettings.nextReminderAt": nextReminderAt,
    });

    return true;
  });
}

export default async function handler(req, res) {
  getFirebaseAdmin();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      success: false,
      error: "Method not allowed.",
    });
  }

  if (!authenticateCronRequest(req)) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized.",
    });
  }

  try {
    const db = admin.firestore();

    const now = new Date();
    const nowIso = now.toISOString();

    const dueEventsSnapshot = await db
      .collection("events")
      .where("notificationSettings.nextReminderAt", "<=", nowIso)
      .orderBy("notificationSettings.nextReminderAt", "asc")
      .limit(MAX_EVENTS_PER_RUN)
      .get();

    const results = {
      dueEvents: dueEventsSnapshot.size,
      claimed: 0,
      sent: 0,
      finalized: 0,
      skipped: 0,
      retryableFailures: 0,
    };

    for (const eventDoc of dueEventsSnapshot.docs) {
      let claim;

      try {
        claim = await claimDueReminder(db, eventDoc.ref, now);
      } catch (error) {
        console.error("REMINDER_CLAIM_FAILED", eventDoc.id, error);

        results.skipped += 1;
        continue;
      }

      if (!claim) {
        // Includes recurring events, which are deliberately
        // ignored by this temporary implementation.
        results.skipped += 1;
        continue;
      }

      results.claimed += 1;

      let sendResult;

      try {
        sendResult = await sendClaimedReminder(db, claim);
      } catch (error) {
        console.error("REMINDER_SEND_FAILED", claim.eventId, error);

        // Leave the reminder as "processing".
        // After CLAIM_TIMEOUT_MS it can be reclaimed.
        results.retryableFailures += 1;
        continue;
      }

      if (!sendResult.success) {
        // Leave processing claim untouched so it can
        // expire and be retried later.
        results.retryableFailures += 1;
        continue;
      }

      results.sent += 1;

      try {
        const finalized = await finalizeReminder(
          db,
          claim.eventRef,
          claim.claimId,
        );

        if (finalized) {
          results.finalized += 1;
        } else {
          results.skipped += 1;
        }
      } catch (error) {
        console.error("REMINDER_FINALIZATION_FAILED", claim.eventId, error);

        // The claim remains processing and will eventually
        // become stale and retryable.
        results.retryableFailures += 1;
      }
    }

    return res.status(200).json({
      success: true,
      ...results,
      now: nowIso,
    });
  } catch (error) {
    console.error("PROCESS_NOTIFICATIONS_FAILED", error);

    return res.status(500).json({
      success: false,
      error: "Could not process notifications.",
    });
  }
}
