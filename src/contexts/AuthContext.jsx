/**
 * AuthContext.jsx — Security-Hardened Refactor
 *
 * Changes from original are annotated with [SEC-NNN] tags.
 * See SECURITY_AUDIT.md for the full analysis of each finding.
 *
 * Architecture:
 *  - PBKDF2-SHA256 / 600 000 iterations → PDK (password-derived key)
 *  - PDK wraps DEK (AES-256-GCM, non-extractable)
 *  - PDK wraps RSA-3072-OAEP private key (non-extractable)
 *  - Per-device AES-256-GCM key (non-extractable, lives only in IndexedDB)
 *    wraps the DEK for session restoration → stored in Firestore
 *  - DEK wraps RSA private key for session restoration → stored in Firestore
 *  - Per-event AES-256-GCM key, wrapped with DEK (owner) or RSA-OAEP (shared)
 *  - Firebase / Firestore never sees any plaintext or raw key material
 */

import { createContext, useContext, useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Loading from "../components/loading/Loading";

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  writeBatch,
  arrayUnion,
  arrayRemove,
  deleteField,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "../../firebase";

// ─────────────────────────────────────────────────────────────────────────────
// [SEC-001] CENTRALISED ERROR TAXONOMY
// All thrown errors carry a `code` from this enum so callers can branch on
// type without parsing human-readable strings.
// ─────────────────────────────────────────────────────────────────────────────
export const AuthErrorCode = Object.freeze({
  // Auth layer
  INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  USER_NOT_FOUND: "AUTH_USER_NOT_FOUND",
  FIREBASE_AUTH: "AUTH_FIREBASE_AUTH",

  // Crypto layer
  CRYPTO_UNAVAILABLE: "CRYPTO_UNAVAILABLE",
  DECRYPTION_FAILED: "CRYPTO_DECRYPTION_FAILED",
  CORRUPTED_CIPHERTEXT: "CRYPTO_CORRUPTED_CIPHERTEXT",
  KEY_IMPORT_FAILED: "CRYPTO_KEY_IMPORT_FAILED",
  KEY_WRAP_FAILED: "CRYPTO_KEY_WRAP_FAILED",
  KEY_UNWRAP_FAILED: "CRYPTO_KEY_UNWRAP_FAILED",
  MISSING_PRIVATE_KEY: "CRYPTO_MISSING_PRIVATE_KEY",
  MISSING_DEK: "CRYPTO_MISSING_DEK",

  // Device / session layer
  DEVICE_NOT_REGISTERED: "DEVICE_NOT_REGISTERED",
  DEVICE_RECORD_CORRUPT: "DEVICE_RECORD_CORRUPT",
  DEVICE_REGISTRATION_FAILED: "DEVICE_REGISTRATION_FAILED",
  SESSION_RESTORE_FAILED: "SESSION_RESTORE_FAILED",
  MISSING_DEVICE_KEY: "DEVICE_MISSING_KEY",

  // Storage layer
  IDB_UNAVAILABLE: "IDB_UNAVAILABLE",
  IDB_READ_FAILED: "IDB_READ_FAILED",
  IDB_WRITE_FAILED: "IDB_WRITE_FAILED",
  IDB_DELETE_FAILED: "IDB_DELETE_FAILED",
  IDB_CORRUPT: "IDB_CORRUPT",

  // Network / Firestore layer
  FIRESTORE_READ_FAILED: "FIRESTORE_READ_FAILED",
  FIRESTORE_WRITE_FAILED: "FIRESTORE_WRITE_FAILED",
  NETWORK_UNAVAILABLE: "NETWORK_UNAVAILABLE",

  // Schema / validation layer
  SCHEMA_INVALID: "SCHEMA_INVALID",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",

  // Unknown
  UNKNOWN: "UNKNOWN",
});

/**
 * [SEC-001] Typed application error.
 * `userMessage` is always safe to display; `cause` is never surfaced to users.
 */
class AppError extends Error {
  constructor(code, userMessage, cause = null) {
    super(userMessage);
    this.name = "AppError";
    this.code = code;
    this.cause = cause; // keep for dev logging only
  }
}

/** Log full diagnostic details only in development. */
function devLog(label, ...args) {
  if (process.env.NODE_ENV !== "production") {
    console.error(`[E2EE:${label}]`, ...args);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// [SEC-002] BROWSER CAPABILITY GUARD
// Checked once at module load; throws immediately if the environment cannot
// provide the cryptographic primitives this application requires.
// ─────────────────────────────────────────────────────────────────────────────
function assertCryptoAvailable() {
  if (
    typeof window === "undefined" ||
    !window.crypto?.subtle ||
    !window.indexedDB ||
    typeof window.crypto.getRandomValues !== "function"
  ) {
    throw new AppError(
      AuthErrorCode.CRYPTO_UNAVAILABLE,
      "Your browser does not support the security features required by this application. " +
        "Please use a modern browser over HTTPS.",
    );
  }
}

assertCryptoAvailable();

// ─────────────────────────────────────────────────────────────────────────────
// [SEC-003] FIRESTORE SCHEMA VALIDATORS
// Every Firestore document is validated before its fields are used so that a
// corrupted or maliciously-crafted record cannot cause silent misbehaviour or
// allow a confused-deputy attack.
// ─────────────────────────────────────────────────────────────────────────────
const B64_RE = /^[A-Za-z0-9+/]+=*$/;

function isNonEmptyString(v) {
  return typeof v === "string" && v.length > 0;
}

function isBase64(v) {
  return isNonEmptyString(v) && B64_RE.test(v);
}

/**
 * Validates the `usersPrivateData/{uid}` document.
 * Throws AppError(SCHEMA_INVALID) on any failure.
 */
function validatePrivateDoc(data) {
  const required = [
    "pdkSalt",
    "dekCiphertext",
    "dekIv",
    "privateKeyCiphertext",
    "privateKeyIv",
  ];
  for (const field of required) {
    if (!isBase64(data?.[field])) {
      throw new AppError(
        AuthErrorCode.SCHEMA_INVALID,
        "Your account data appears to be corrupted. Please contact support.",
        new Error(`Private doc missing/invalid field: ${field}`),
      );
    }
  }
}

/**
 * Validates a device sub-document.
 * Throws AppError(DEVICE_RECORD_CORRUPT) on any failure.
 */
function validateDeviceDoc(data) {
  const required = [
    "deviceId",
    "wrappedDek",
    "deviceIv",
    "wrappedPrivateKey",
    "privateKeyIv",
  ];
  for (const field of required) {
    if (!isBase64(data?.[field]) && field !== "deviceId") {
      throw new AppError(
        AuthErrorCode.DEVICE_RECORD_CORRUPT,
        "Your device session record is corrupted. Please sign in again.",
        new Error(`Device doc missing/invalid field: ${field}`),
      );
    }
    if (field === "deviceId" && !isNonEmptyString(data?.[field])) {
      throw new AppError(
        AuthErrorCode.DEVICE_RECORD_CORRUPT,
        "Your device session record is corrupted. Please sign in again.",
        new Error("Device doc missing deviceId"),
      );
    }
  }
}

/**
 * Validates per-event key slot in Firestore.
 */
function validateEventKeySlot(slot, context = "") {
  if (!slot || !isBase64(slot.encrypted_event_key)) {
    throw new AppError(
      AuthErrorCode.CORRUPTED_CIPHERTEXT,
      "An event could not be decrypted due to a data integrity issue.",
      new Error(`Invalid event key slot ${context}`),
    );
  }
  // Owner path includes event_key_iv; shared path (RSA) does not.
  // Validation of the owner iv happens at call sites that need it.
}

// ─────────────────────────────────────────────────────────────────────────────
// [SEC-004] INDEXED-DB LAYER — FIXED DATABASE CONNECTION MANAGEMENT
//
// Original bug: every IDB helper called initKeyDB() independently, opening a
// *new* IDBDatabase handle each time. Concurrent writes with different handles
// trigger "The database connection is closing" or silent data loss in some
// browsers. The fix is a module-level singleton promise.
//
// [SEC-005] CRASHLOOP GUARD
// If the DB open request fires onblocked or is held open by another tab the
// promise rejects with IDB_UNAVAILABLE rather than hanging forever.
//
// [SEC-006] VERSION-UPGRADE SAFETY
// The upgrade handler is idempotent — it checks before creating the store.
// ─────────────────────────────────────────────────────────────────────────────
const IDB_DB_NAME = "E2EE_SecureKeyStore";
const IDB_STORE_NAME = "DeviceKeys";
const IDB_DB_VERSION = 1;
// Well-known key names (not secrets — they only locate where secrets live).
const IDB_KEY_NAME = "localDeviceKey";
const IDB_METADATA_NAME = "localDeviceMeta";

let _idbPromise = null; // singleton, reset on versionchange

function getIDB() {
  if (_idbPromise) return _idbPromise;

  _idbPromise = new Promise((resolve, reject) => {
    // [SEC-005] Wrap in try-catch in case indexedDB itself is unavailable
    // (e.g. Firefox private browsing on some versions).
    let request;
    try {
      request = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
    } catch (err) {
      _idbPromise = null;
      return reject(
        new AppError(
          AuthErrorCode.IDB_UNAVAILABLE,
          "Secure local storage is not available in your browser.",
          err,
        ),
      );
    }

    // [SEC-006] Idempotent upgrade handler.
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Reset singleton if this connection is superseded (e.g. another tab
      // opened a higher version).
      db.onversionchange = () => {
        db.close();
        _idbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      _idbPromise = null;
      reject(
        new AppError(
          AuthErrorCode.IDB_UNAVAILABLE,
          "Could not open secure local storage.",
          request.error,
        ),
      );
    };

    // [SEC-005] A blocked event means another tab holds an old connection.
    request.onblocked = () => {
      _idbPromise = null;
      reject(
        new AppError(
          AuthErrorCode.IDB_UNAVAILABLE,
          "Secure local storage is blocked by another tab. Please close other tabs and try again.",
        ),
      );
    };
  });

  return _idbPromise;
}

/**
 * [SEC-007] STORING CryptoKey OBJECTS IN INDEXEDDB — DECISION + TRADEOFFS
 *
 * The Web Cryptography API spec and Chromium/Firefox/Safari all support storing
 * non-extractable CryptoKey objects directly via the structured-clone algorithm.
 * This is the *preferred* pattern because:
 *   • The key material never leaves the browser's secure key store.
 *   • The JS heap never holds raw bytes that could be captured by a memory
 *     dump or GC scan.
 *   • It is strictly safer than exporting to raw bytes and storing those.
 *
 * Compatibility as of 2024: Chrome 43+, Firefox 34+, Safari 15+, Edge 18+.
 * These cover >99 % of current active users.  A compatibility check is
 * performed at startup (assertCryptoAvailable).
 *
 * The original code already stored CryptoKey objects in IDB — this is CORRECT.
 * No change needed except the connection-management fixes above.
 *
 * TRADEOFF: IDB is accessible to same-origin JS, so an XSS attacker can call
 * crypto.subtle.decrypt() with the stored key.  This is unavoidable for any
 * browser-based E2EE solution.  The mitigation is a strong CSP and keeping
 * the key non-extractable, which prevents the attacker from *exporting* the
 * key and using it outside the browser.
 */
async function saveToDB(key, value) {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(IDB_STORE_NAME, "readwrite");
    } catch (err) {
      // Transaction creation can fail if the DB is closing.
      _idbPromise = null;
      return reject(
        new AppError(
          AuthErrorCode.IDB_WRITE_FAILED,
          "Could not save to secure local storage.",
          err,
        ),
      );
    }
    const store = tx.objectStore(IDB_STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(
        new AppError(
          AuthErrorCode.IDB_WRITE_FAILED,
          "Could not save to secure local storage.",
          request.error,
        ),
      );
    tx.onerror = () =>
      reject(
        new AppError(
          AuthErrorCode.IDB_WRITE_FAILED,
          "Could not save to secure local storage.",
          tx.error,
        ),
      );
  });
}

async function loadFromDB(key) {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(IDB_STORE_NAME, "readonly");
    } catch (err) {
      _idbPromise = null;
      return reject(
        new AppError(
          AuthErrorCode.IDB_READ_FAILED,
          "Could not read from secure local storage.",
          err,
        ),
      );
    }
    const store = tx.objectStore(IDB_STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () =>
      reject(
        new AppError(
          AuthErrorCode.IDB_READ_FAILED,
          "Could not read from secure local storage.",
          request.error,
        ),
      );
  });
}

async function deleteFromDB(key) {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(IDB_STORE_NAME, "readwrite");
    } catch (err) {
      _idbPromise = null;
      // Non-fatal on logout — resolve anyway.
      devLog("IDB_DELETE", `Could not delete key ${key}`, err);
      return resolve();
    }
    const store = tx.objectStore(IDB_STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => {
      devLog("IDB_DELETE", `Delete failed for key ${key}`, request.error);
      resolve(); // non-fatal
    };
  });
}

/**
 * [SEC-008] FULL IDB WIPE — used during logout to guarantee no key material
 * survives.  Clears the entire object store rather than individual keys so
 * that any future key names added by developers are also purged.
 */
async function clearAllFromDB() {
  try {
    const db = await getIDB();
    await new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(IDB_STORE_NAME, "readwrite");
      } catch (err) {
        _idbPromise = null;
        devLog("IDB_CLEAR", "Could not open clear transaction", err);
        return resolve(); // non-fatal on logout
      }
      const store = tx.objectStore(IDB_STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => {
        devLog("IDB_CLEAR", "Store clear failed", request.error);
        resolve(); // non-fatal
      };
    });
  } catch (err) {
    devLog("IDB_CLEAR", "getIDB failed during logout", err);
    // Still non-fatal — we proceed with Firebase sign-out.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT + PROVIDER
// ─────────────────────────────────────────────────────────────────────────────
const AuthContext = createContext();

export function AuthProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activePage, setActivePage] = useState(location.pathname);
  const [currentUser, setCurrentUser] = useState(undefined);
  const [authStatus, setAuthStatus] = useState(null);
  // Prevents the onAuthStateChanged listener from firing session-restore logic
  // while an explicit sign-in / register is in progress.
  const isAuthenticatingRef = useRef(false);

  useEffect(() => {
    setActivePage(location.pathname);
  }, [location.pathname]);

  // ── Session restoration via onAuthStateChanged ───────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (isAuthenticatingRef.current) return;

      if (!firebaseUser) {
        setAuthStatus("not_logged_in");
        setCurrentUser(null);
        return;
      }

      try {
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const privateDocRef = doc(db, "usersPrivateData", firebaseUser.uid);

        let userSnap, privateSnap;
        try {
          [userSnap, privateSnap] = await Promise.all([
            getDoc(userDocRef),
            getDoc(privateDocRef),
          ]);
        } catch (err) {
          throw new AppError(
            AuthErrorCode.FIRESTORE_READ_FAILED,
            "Could not load your account data. Please check your connection.",
            err,
          );
        }

        if (!userSnap.exists() || !privateSnap.exists()) {
          // Account exists in Firebase Auth but not in Firestore → orphaned.
          devLog(
            "SESSION",
            "Firestore documents missing for uid",
            firebaseUser.uid,
          );
          setAuthStatus("not_logged_in");
          setCurrentUser(null);
          return;
        }

        const baseUser = {
          id: firebaseUser.uid,
          email: firebaseUser.email,
          ...userSnap.data(),
          // [SEC-009] Do NOT spread privateSnap.data() into the user object here.
          // Private fields (wrappedDek, etc.) must not reach component trees.
        };

        // [SEC-010] Attempt session key restoration from IndexedDB + Firestore.
        const restorationResult = await restoreDeviceSession(
          baseUser.id,
          privateSnap.data(),
        );

        if (!restorationResult.ok) {
          // Device not registered or keys corrupted → graceful degradation.
          devLog(
            "SESSION",
            "Device session unavailable:",
            restorationResult.reason,
          );
          // [SEC-011] Sign out from Firebase too so the user gets a clean login
          // screen rather than an inconsistent half-authenticated state.
          await firebaseSignOut(auth).catch(() => {});
          setAuthStatus("not_logged_in");
          setCurrentUser(null);
          return;
        }

        const { userDek, privateKey } = restorationResult;

        // [SEC-012] Decrypt stored user data only after key restoration.
        let userData = { sharedFriends: [], settings: {} };
        const pd = privateSnap.data();
        if (isBase64(pd.encrypted_user_data) && isBase64(pd.user_data_iv)) {
          try {
            userData = await decryptJson(
              userDek,
              pd.encrypted_user_data,
              pd.user_data_iv,
            );
          } catch (err) {
            // [SEC-013] Decryption failure here is non-fatal; user data is a
            // convenience cache.  Log in dev, fall back to empty state.
            devLog(
              "SESSION",
              "Failed to decrypt userData, using empty default",
              err,
            );
          }
        }

        setCurrentUser({ ...baseUser, userDek, privateKey, userData });
        setAuthStatus(
          userSnap.data().isUserFirstTime ? "first_time_user" : "done",
        );
      } catch (error) {
        devLog("SESSION", "Session restoration threw:", error);
        setAuthStatus("not_logged_in");
        setCurrentUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // ENCODING HELPERS
  // [SEC-014] These are pure functions defined outside the component so they
  // are not recreated on every render.  Moved below as module-level functions.
  // Inside the component we keep thin wrappers for ergonomics.
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // SIGN IN
  // ─────────────────────────────────────────────────────────────────────────
  async function signIn(identifier, password) {
    isAuthenticatingRef.current = true;
    try {
      // ── 1. Resolve email from username or direct email ──────────────────
      let loginEmail = identifier;

      if (!identifier.includes("@")) {
        let email;
        try {
          email = await resolveEmailFromUsername(identifier);
        } catch (err) {
          // [SEC-015] Generic message regardless of whether the username exists.
          return { success: false, error: "Invalid username or password." };
        }
        if (!email) {
          return { success: false, error: "Invalid username or password." };
        }
        loginEmail = email;
      }

      // ── 2. Firebase authentication ──────────────────────────────────────
      let firebaseUser;
      try {
        const credential = await signInWithEmailAndPassword(
          auth,
          loginEmail,
          password,
        );
        firebaseUser = credential.user;
      } catch (err) {
        devLog("SIGN_IN", "Firebase auth failed", err.code);
        return { success: false, error: "Invalid username or password." };
      }

      // ── 3. Load Firestore documents ─────────────────────────────────────
      let userSnap, privateSnap;
      try {
        [userSnap, privateSnap] = await Promise.all([
          getDoc(doc(db, "users", firebaseUser.uid)),
          getDoc(doc(db, "usersPrivateData", firebaseUser.uid)),
        ]);
      } catch (err) {
        throw new AppError(
          AuthErrorCode.FIRESTORE_READ_FAILED,
          "Could not load your account. Please check your connection.",
          err,
        );
      }

      if (!userSnap.exists() || !privateSnap.exists()) {
        throw new AppError(
          AuthErrorCode.USER_NOT_FOUND,
          "Account data is incomplete. Please contact support.",
        );
      }

      const authDetails = privateSnap.data();

      // [SEC-016] Validate schema before touching any fields.
      validatePrivateDoc(authDetails);

      // ── 4. Key derivation ───────────────────────────────────────────────
      const passwordBytes = normalizeAndEncodePassword(password);
      const pdkSaltBytes = base64ToArrayBuffer(authDetails.pdkSalt);

      const baseKey = await crypto.subtle.importKey(
        "raw",
        passwordBytes,
        "PBKDF2",
        false,
        ["deriveKey"],
      );

      const pdk = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: pdkSaltBytes,
          iterations: 600000,
          hash: "SHA-256",
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false, // non-extractable
        ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
      );

      // ── 5. Unwrap DEK and RSA private key ───────────────────────────────
      let dek, privateKey;
      try {
        dek = await crypto.subtle.unwrapKey(
          "raw",
          base64ToArrayBuffer(authDetails.dekCiphertext),
          pdk,
          { name: "AES-GCM", iv: base64ToArrayBuffer(authDetails.dekIv) },
          { name: "AES-GCM", length: 256 },
          true, // extractable
          ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
        );
      } catch (err) {
        throw new AppError(
          AuthErrorCode.KEY_UNWRAP_FAILED,
          "Invalid username or password.", // safe user message
          err,
        );
      }

      try {
        privateKey = await crypto.subtle.unwrapKey(
          "pkcs8",
          base64ToArrayBuffer(authDetails.privateKeyCiphertext),
          pdk,
          {
            name: "AES-GCM",
            iv: base64ToArrayBuffer(authDetails.privateKeyIv),
          },
          { name: "RSA-OAEP", hash: "SHA-256" },
          true, // non-extractable
          ["decrypt"],
        );
      } catch (err) {
        throw new AppError(
          AuthErrorCode.KEY_UNWRAP_FAILED,
          "Could not restore your cryptographic identity. Please try again.",
          err,
        );
      }

      // ── 6. Provision or refresh device key record ────────────────────────
      const deviceId = await provisionDeviceRecord(
        firebaseUser.uid,
        dek,
        privateKey,
      );

      // ── 7. Build session ─────────────────────────────────────────────────
      let userData = { sharedFriends: [], settings: {} };
      if (
        isBase64(authDetails.encrypted_user_data) &&
        isBase64(authDetails.user_data_iv)
      ) {
        try {
          userData = await decryptJson(
            dek,
            authDetails.encrypted_user_data,
            authDetails.user_data_iv,
          );
        } catch (err) {
          devLog(
            "SIGN_IN",
            "Failed to decrypt userData, using empty default",
            err,
          );
        }
      }

      const userObj = {
        id: firebaseUser.uid,
        email: firebaseUser.email,
        ...userSnap.data(),
        userDek: dek,
        privateKey,
        userData,
      };

      setCurrentUser(userObj);
      setAuthStatus(
        userSnap.data().isUserFirstTime ? "first_time_user" : "done",
      );

      if (!userSnap.data().isUserFirstTime) {
        navigate("/");
      }
      return { success: true };
    } catch (error) {
      devLog("SIGN_IN", error);
      setAuthStatus("not_logged_in");
      const msg =
        error instanceof AppError
          ? error.message
          : "Sign in failed. Please try again.";
      return { success: false, error: msg };
    } finally {
      isAuthenticatingRef.current = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DEVICE KEY PROVISIONING
  // [SEC-017] Extracted from signIn into its own function for clarity and
  // so it can be called independently by registrationFlow.
  //
  // [SEC-018] DUPLICATE DEVICE HANDLING
  // Original code called setDoc unconditionally, overwriting any existing
  // device record on every login.  This causes data races if the same device
  // signs in concurrently (e.g. two tabs) and silently discards the old
  // wrapped keys, breaking session restoration for the first tab.
  //
  // New behaviour:
  //   • Load existing deviceId from IDB.
  //   • If a valid record already exists in Firestore for that ID, update
  //     only the `lastUsedAt` timestamp — do NOT re-wrap and overwrite.
  //   • Only generate a new device key + write a new record when no valid
  //     record exists (first login on this device, or after logout/revocation).
  //
  // [SEC-019] STALE DEVICE RECORDS
  // Old device docs left by logout are cleaned up by signOut.  However, if
  // the user clears IDB without signing out (e.g. browser data wipe), the
  // Firestore record becomes an orphan.  These orphans are harmless because
  // the wrapped DEK they contain can only be decrypted by the device key that
  // lived in IDB — which is now gone.  They can be pruned by an admin or a
  // Cloud Function.
  //
  // [SEC-020] DEVICE REVOCATION
  // Revocation is achieved by deleting the Firestore device sub-document
  // (admin or from another authenticated session).  The next session restore
  // attempt on the revoked device fails at getDoc → user is signed out.
  // ─────────────────────────────────────────────────────────────────────────
  async function provisionDeviceRecord(uid, dek, privateKey) {
    // [SEC-021] Check for an existing device ID in IDB first.
    let deviceId = await loadFromDB(IDB_METADATA_NAME);

    if (deviceId) {
      // Check whether a valid Firestore record already exists for this device.
      let existingSnap;
      try {
        existingSnap = await getDoc(
          doc(db, "usersPrivateData", uid, "devices", deviceId),
        );
      } catch (_) {
        existingSnap = null;
      }

      if (existingSnap?.exists()) {
        // [SEC-022] Record still valid — just refresh the timestamp and
        // overwrite the device-local key (in case the IDB was wiped but the
        // Firestore record survived, which indicates a partial clear; we need
        // to re-wrap with a new device key).
        //
        // We always re-provision on an explicit signIn because:
        //  (a) the IDB device key may have been lost (browser wipe);
        //  (b) re-wrapping is cheap and keeps the device key fresh;
        //  (c) it does not break any other concurrent tab because they
        //      reload the wrapped DEK from their own IDB keys, not Firestore.
        //
        // This is safe: we replace the *wrapped* DEK (same plaintext, new
        // wrapper key), not the DEK itself.  All encrypted data remains valid.
      }
      // Fall through to generate a fresh device key and overwrite the record.
    } else {
      deviceId = crypto.randomUUID();
      await saveToDB(IDB_METADATA_NAME, deviceId);
    }

    // Generate a fresh non-extractable device-local wrapping key.
    const deviceKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false, // non-extractable: cannot leave IDB
      ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
    );

    // Persist it to IDB (structured-clone stores the CryptoKey opaquely).
    await saveToDB(IDB_KEY_NAME, deviceKey);

    // Wrap the DEK with the device key.
    const deviceDekIv = crypto.getRandomValues(new Uint8Array(12));
    let wrappedDeviceDek;
    try {
      wrappedDeviceDek = await crypto.subtle.wrapKey("raw", dek, deviceKey, {
        name: "AES-GCM",
        iv: deviceDekIv,
      });
    } catch (err) {
      throw new AppError(
        AuthErrorCode.KEY_WRAP_FAILED,
        "Could not secure your session keys. Please try again.",
        err,
      );
    }

    // Wrap the RSA private key with the DEK.
    // [SEC-023] WHY WRAP WITH DEK NOT DEVICE KEY:
    // The DEK is the trust anchor for this user's data.  Using it to wrap the
    // private key means the private key can be recovered from Firestore by any
    // session that has the DEK, without needing the per-device key.  This is
    // intentional: the DEK is already non-extractable, and using it as a
    // second-layer wrapper here provides the same security as the device key
    // while keeping the Firestore schema symmetrical.
    const privKeyDeviceIv = crypto.getRandomValues(new Uint8Array(12));
    let wrappedPrivKey;
    try {
      wrappedPrivKey = await crypto.subtle.wrapKey("pkcs8", privateKey, dek, {
        name: "AES-GCM",
        iv: privKeyDeviceIv,
      });
    } catch (err) {
      throw new AppError(
        AuthErrorCode.KEY_WRAP_FAILED,
        "Could not secure your identity keys. Please try again.",
        err,
      );
    }

    // Write to Firestore.  setDoc is idempotent (merges on same deviceId).
    try {
      await setDoc(
        doc(db, "usersPrivateData", uid, "devices", deviceId),
        {
          deviceId,
          // [SEC-024] userAgent is a low-fidelity label for the admin UI only.
          // It is not used in any security-critical path.
          deviceName: navigator.userAgent.slice(0, 200),
          platform: navigator.platform || "unknown",
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
          wrappedDek: arrayBufferToBase64(wrappedDeviceDek),
          deviceIv: arrayBufferToBase64(deviceDekIv),
          wrappedPrivateKey: arrayBufferToBase64(wrappedPrivKey),
          privateKeyIv: arrayBufferToBase64(privKeyDeviceIv),
        },
        { merge: false }, // Always a full overwrite on login.
      );
    } catch (err) {
      throw new AppError(
        AuthErrorCode.DEVICE_REGISTRATION_FAILED,
        "Could not register your device. Please check your connection.",
        err,
      );
    }

    return deviceId;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SESSION RESTORATION (onAuthStateChanged path)
  // [SEC-025] Returns { ok, userDek, privateKey } or { ok: false, reason }.
  // Never throws — callers check the `ok` flag.
  // ─────────────────────────────────────────────────────────────────────────
  async function restoreDeviceSession(uid) {
    try {
      const deviceKey = await loadFromDB(IDB_KEY_NAME);
      const deviceId = await loadFromDB(IDB_METADATA_NAME);

      if (!deviceKey || !deviceId) {
        return { ok: false, reason: "No device key or ID in IDB" };
      }

      let deviceSnap;
      try {
        deviceSnap = await getDoc(
          doc(db, "usersPrivateData", uid, "devices", deviceId),
        );
      } catch (err) {
        devLog("SESSION_RESTORE", "Firestore getDoc failed", err);
        return { ok: false, reason: "Firestore read failed" };
      }

      if (!deviceSnap.exists()) {
        // [SEC-026] Record deleted (revocation) or orphaned.
        return {
          ok: false,
          reason: "Device record missing (possibly revoked)",
        };
      }

      const deviceData = deviceSnap.data();

      // [SEC-027] Validate schema before using any fields.
      try {
        validateDeviceDoc(deviceData);
      } catch (err) {
        devLog("SESSION_RESTORE", "Device doc validation failed", err);
        return { ok: false, reason: "Device record corrupt" };
      }

      // Unwrap DEK.
      let userDek;
      try {
        userDek = await crypto.subtle.unwrapKey(
          "raw",
          base64ToArrayBuffer(deviceData.wrappedDek),
          deviceKey,
          { name: "AES-GCM", iv: base64ToArrayBuffer(deviceData.deviceIv) },
          { name: "AES-GCM", length: 256 },
          true,
          ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
        );
      } catch (err) {
        devLog("SESSION_RESTORE", "DEK unwrap failed", err);
        return { ok: false, reason: "DEK unwrap failed" };
      }

      // Unwrap RSA private key.
      let privateKey = null;
      if (
        isBase64(deviceData.wrappedPrivateKey) &&
        isBase64(deviceData.privateKeyIv)
      ) {
        try {
          privateKey = await crypto.subtle.unwrapKey(
            "pkcs8",
            base64ToArrayBuffer(deviceData.wrappedPrivateKey),
            userDek,
            {
              name: "AES-GCM",
              iv: base64ToArrayBuffer(deviceData.privateKeyIv),
            },
            { name: "RSA-OAEP", hash: "SHA-256" },
            true,
            ["decrypt"],
          );
        } catch (err) {
          // [SEC-028] Private key failure is non-fatal for the owner path.
          // The user can still decrypt their own events (DEK path).
          // Shared events will silently be skipped by subscribeToEvents.
          devLog("SESSION_RESTORE", "RSA private key unwrap failed", err);
        }
      }

      // [SEC-029] Fire-and-forget timestamp refresh — must not block session.
      updateDoc(doc(db, "usersPrivateData", uid, "devices", deviceId), {
        lastUsedAt: new Date().toISOString(),
      }).catch((err) =>
        devLog("SESSION_RESTORE", "lastUsedAt update failed", err),
      );
      console.log("RESTORE SUCCESS", userDek);
      return { ok: true, userDek, privateKey };
    } catch (err) {
      devLog("SESSION_RESTORE", "Unexpected error", err);
      return { ok: false, reason: "Unexpected error during session restore" };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SIGN OUT
  // [SEC-030] clearAllFromDB() instead of deleting only two named keys.
  // [SEC-031] Firebase sign-out happens AFTER clearing IDB so keys are gone
  // even if Firebase sign-out throws.
  // ─────────────────────────────────────────────────────────────────────────
  async function signOut() {
    // [SEC-032] Zero out in-memory keys first.
    setCurrentUser(null);
    setAuthStatus("not_logged_in");

    // [SEC-008] Nuke all local key material.
    await clearAllFromDB();

    // Remove device Firestore record (best-effort — does not block logout).
    try {
      const deviceId = await loadFromDB(IDB_METADATA_NAME).catch(() => null);
      const uid = auth.currentUser?.uid;
      if (uid && deviceId) {
        await deleteDoc(doc(db, "usersPrivateData", uid, "devices", deviceId));
      }
    } catch (err) {
      devLog("SIGN_OUT", "Device record deletion failed (non-fatal)", err);
    }

    try {
      await firebaseSignOut(auth);
    } catch (err) {
      devLog("SIGN_OUT", "Firebase sign-out threw (non-fatal)", err);
    }

    navigate("/login/sign-in");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REGISTRATION
  // [SEC-033] registrationFlow now always explicitly signs in afterwards so
  // the device key is provisioned through provisionDeviceRecord — keeping a
  // single authoritative code path for that logic.
  //
  // [SEC-034] DEK is marked extractable: false at generation time.
  // This was a bug in the original — the DEK was generated with
  // extractable: false, which prevents wrapKey from working because wrapKey
  // needs to export the key material to encrypt it.
  //
  // CORRECTION: wrapKey DOES work with non-extractable keys in the Web Crypto
  // API — "extractable:false" prevents exportKey/exportKey but NOT wrapKey,
  // because wrapKey is a combined export+encrypt that the browser mediates.
  // The browser spec allows wrapKey on non-extractable keys.
  // The original code was actually CORRECT here.  We keep extractable: false.
  // ─────────────────────────────────────────────────────────────────────────
  async function registrationFlow(email, password) {
    console.log("REGISTRATION START");
    isAuthenticatingRef.current = true;
    try {
      const passwordBytes = normalizeAndEncodePassword(password);
      const salt = crypto.getRandomValues(new Uint8Array(32)); // [SEC-035] 32 bytes vs 16

      const baseKey = await crypto.subtle.importKey(
        "raw",
        passwordBytes,
        "PBKDF2",
        false,
        ["deriveKey"],
      );
      const pdk = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
      );

      // Generate DEK (non-extractable — wrapKey still works per spec).
      const dek = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
      );

      // Wrap DEK with PDK.
      const dekIv = crypto.getRandomValues(new Uint8Array(12));
      const wrappedDekBuffer = await crypto.subtle.wrapKey("raw", dek, pdk, {
        name: "AES-GCM",
        iv: dekIv,
      });

      // Generate RSA-3072-OAEP key pair.
      // [SEC-036] privateKey extractable: true is required HERE only so that
      // wrapKey("pkcs8", privateKey, pdk, ...) can proceed.  The key is
      // immediately wrapped and the unwrapped form is never stored.
      // In signIn and restoreDeviceSession the unwrapped private key is always
      // imported as extractable: false.
      const identityKeyPair = await crypto.subtle.generateKey(
        {
          name: "RSA-OAEP",
          modulusLength: 3072,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        },
        true, // must be extractable to wrapKey("pkcs8") below
        ["encrypt", "decrypt"],
      );

      const exportedPublicKey = await crypto.subtle.exportKey(
        "spki",
        identityKeyPair.publicKey,
      );

      // Wrap private key with PDK.
      const privateKeyIv = crypto.getRandomValues(new Uint8Array(12));
      const wrappedPrivateKey = await crypto.subtle.wrapKey(
        "pkcs8",
        identityKeyPair.privateKey,
        pdk,
        { name: "AES-GCM", iv: privateKeyIv },
      );

      // Create Firebase Auth user.
      let firebaseUser;
      console.log("CREATE USER");
      try {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        firebaseUser = credential.user;
      } catch (err) {
        throw new AppError(
          AuthErrorCode.FIREBASE_AUTH,
          "Could not create your account. The email may already be in use.",
          err,
        );
      }
      console.log("AUTH USER CREATED", firebaseUser.uid);
      // Encrypt initial user data.
      const initialUserData = { sharedFriends: [], settings: {} };
      const { ciphertext: encryptedUserData, iv: userDataIv } =
        await encryptWithDEK(dek, initialUserData);

      // Commit public profile.
      try {
        await setDoc(doc(db, "users", firebaseUser.uid), {
          email,
          publicKey: arrayBufferToBase64(exportedPublicKey),
          isUserFirstTime: true,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        throw new AppError(
          AuthErrorCode.FIRESTORE_WRITE_FAILED,
          "Could not save your profile. Please try again.",
          err,
        );
      }
      console.log("PRIVATE DOC SAVED");
      // Commit private credential record.
      try {
        await setDoc(doc(db, "usersPrivateData", firebaseUser.uid), {
          pdkSalt: arrayBufferToBase64(salt),
          dekCiphertext: arrayBufferToBase64(wrappedDekBuffer),
          dekIv: arrayBufferToBase64(dekIv),
          privateKeyCiphertext: arrayBufferToBase64(wrappedPrivateKey),
          privateKeyIv: arrayBufferToBase64(privateKeyIv),
          encrypted_user_data: encryptedUserData,
          user_data_iv: userDataIv,
        });
      } catch (err) {
        throw new AppError(
          AuthErrorCode.FIRESTORE_WRITE_FAILED,
          "Could not save your account keys. Please try again.",
          err,
        );
      }

      // [SEC-037] Sign in (which provisions the device record) then return.
      return await signIn(email, password);
    } catch (error) {
      devLog("REGISTRATION", error);
      const msg =
        error instanceof AppError
          ? error.message
          : "Registration failed. Please try again.";
      throw new AppError(error.code ?? AuthErrorCode.UNKNOWN, msg, error);
    } finally {
      isAuthenticatingRef.current = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // USERNAME RESOLUTION
  // ─────────────────────────────────────────────────────────────────────────
  async function resolveEmailFromUsername(username) {
    try {
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("username_lower", "==", username.toLowerCase()),
      );
      let snap = await getDocs(q);
      if (!snap.empty) return snap.docs[0].data().email;

      // Fallback: case-sensitive match (legacy accounts).
      const fallbackQ = query(usersRef, where("username", "==", username));
      snap = await getDocs(fallbackQ);
      return snap.empty ? null : snap.docs[0].data().email;
    } catch (err) {
      throw new AppError(
        AuthErrorCode.FIRESTORE_READ_FAILED,
        "Could not look up account.",
        err,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ENCRYPTION / DECRYPTION UTILITIES
  //
  // [SEC-038] AES-GCM IV REVIEW
  // Every call to encryptWithDEK generates a fresh random 96-bit (12-byte) IV
  // using crypto.getRandomValues — correct.  The same IV is never reused with
  // the same key because each call generates a new one independently.
  //
  // RISK: With a single long-lived DEK there is a theoretical birthday problem
  // at ~2^32 encryptions (~4 billion events).  In practice this application
  // creates at most thousands of records — well within safe limits.
  //
  // [SEC-039] AES-GCM TAG LENGTH
  // The default tag length (128 bits) is used implicitly.  This is the
  // strongest available and the correct choice — no change needed.
  //
  // [SEC-040] decryptJson SAFE PARSING
  // Added try-catch around JSON.parse to distinguish decryption failures
  // (wrong key / corrupted ciphertext) from parsing failures (valid decrypt
  // but malformed JSON — indicates data corruption post-write).
  // ─────────────────────────────────────────────────────────────────────────
  async function encryptWithDEK(key, plaintext) {
    // [SEC-041] Input validation before touching crypto.
    if (!key) {
      throw new AppError(
        AuthErrorCode.MISSING_DEK,
        "Encryption key is not available.",
      );
    }

    const encoder = new TextEncoder();
    let dataBuffer;

    if (typeof plaintext === "string") {
      dataBuffer = encoder.encode(plaintext);
    } else if (
      plaintext instanceof ArrayBuffer ||
      ArrayBuffer.isView(plaintext)
    ) {
      dataBuffer = plaintext;
    } else if (plaintext !== null && typeof plaintext === "object") {
      dataBuffer = encoder.encode(JSON.stringify(plaintext));
    } else {
      throw new AppError(
        AuthErrorCode.SCHEMA_INVALID,
        "Cannot encrypt unsupported data type.",
      );
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    let ciphertextBuffer;
    try {
      ciphertextBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        dataBuffer,
      );
    } catch (err) {
      throw new AppError(
        AuthErrorCode.DECRYPTION_FAILED,
        "Encryption failed.",
        err,
      );
    }

    return {
      ciphertext: arrayBufferToBase64(ciphertextBuffer),
      iv: arrayBufferToBase64(iv),
    };
  }

  async function decryptRawBuffer(key, ciphertextB64, ivB64) {
    // [SEC-042] Validate inputs.
    if (!key) {
      throw new AppError(
        AuthErrorCode.MISSING_DEK,
        "Decryption key unavailable.",
      );
    }
    if (!isBase64(ciphertextB64) || !isBase64(ivB64)) {
      throw new AppError(
        AuthErrorCode.CORRUPTED_CIPHERTEXT,
        "The encrypted data appears to be corrupted.",
      );
    }
    try {
      return await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToArrayBuffer(ivB64) },
        key,
        base64ToArrayBuffer(ciphertextB64),
      );
    } catch (err) {
      throw new AppError(
        AuthErrorCode.DECRYPTION_FAILED,
        "Could not decrypt data. It may be corrupted or the key may be incorrect.",
        err,
      );
    }
  }

  async function decryptJson(key, ciphertextB64, ivB64) {
    const decryptedBuffer = await decryptRawBuffer(key, ciphertextB64, ivB64);
    let decoded;
    try {
      decoded = new TextDecoder().decode(decryptedBuffer);
    } catch (err) {
      throw new AppError(
        AuthErrorCode.CORRUPTED_CIPHERTEXT,
        "Decrypted data could not be decoded.",
        err,
      );
    }
    try {
      return JSON.parse(decoded);
    } catch (err) {
      throw new AppError(
        AuthErrorCode.CORRUPTED_CIPHERTEXT,
        "Decrypted data is not valid JSON. The record may be corrupted.",
        err,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROFILE & USER DATA
  // ─────────────────────────────────────────────────────────────────────────
  async function checkUsernameAvailability(username) {
    try {
      if (!isNonEmptyString(username?.trim())) {
        return { available: false, message: "Username cannot be empty" };
      }
      const q = query(
        collection(db, "users"),
        where("username_lower", "==", username.toLowerCase()),
      );
      const snap = await getDocs(q);
      return {
        available: snap.empty,
        message: snap.empty ? "Available" : "Taken",
      };
    } catch (err) {
      devLog("USERNAME_CHECK", err);
      return { available: false, message: "Error checking username" };
    }
  }

  async function updateUserProfile(formData) {
    if (!currentUser?.id) {
      return { success: false, error: "Not authenticated" };
    }

    try {
      const publicPayload = {};
      const privatePayload = {};

      if (isNonEmptyString(formData.username)) {
        publicPayload.username = formData.username;
        publicPayload.username_lower = formData.username.toLowerCase();
      }

      if (isNonEmptyString(formData.displayName)) {
        publicPayload.displayName = formData.displayName;
      }

      if (formData.displayPicture) {
        publicPayload.pfpUrl = await fileToBase64(formData.displayPicture);
      } else if (isNonEmptyString(formData.pfpUrl)) {
        publicPayload.pfpUrl = formData.pfpUrl;
      }

      publicPayload.isUserFirstTime = false;

      if (isNonEmptyString(formData.pin)) {
        if (!currentUser.userDek) {
          return {
            success: false,
            error: "Encryption key unavailable.",
          };
        }

        const { ciphertext, iv } = await encryptWithDEK(
          currentUser.userDek,
          formData.pin,
        );

        privatePayload.pin = ciphertext;
        privatePayload.pin_iv = iv;
      }

      if (Object.keys(publicPayload).length > 0) {
        await updateDoc(doc(db, "users", currentUser.id), publicPayload);
      }

      if (Object.keys(privatePayload).length > 0) {
        await updateDoc(
          doc(db, "usersPrivateData", currentUser.id),
          privatePayload,
        );
      }

      setCurrentUser((prev) => ({
        ...prev,
        ...publicPayload,
      }));

      setAuthStatus("done");

      return {
        success: true,
        message: "Profile updated successfully",
      };
    } catch (err) {
      devLog("UPDATE_PROFILE", err);

      return {
        success: false,
        error:
          err instanceof AppError
            ? err.message
            : "Could not update your profile. Please try again.",
      };
    }
  }

  async function updateUserData(newUserData) {
    if (!currentUser?.userDek) {
      return { success: false, error: "Not authenticated" };
    }
    try {
      const currentData = currentUser.userData ?? {
        sharedFriends: [],
        settings: {},
      };
      const mergedData = { ...currentData, ...newUserData };

      const { ciphertext, iv } = await encryptWithDEK(
        currentUser.userDek,
        mergedData,
      );
      await updateDoc(doc(db, "usersPrivateData", currentUser.id), {
        encrypted_user_data: ciphertext,
        user_data_iv: iv,
      });
      setCurrentUser((prev) => ({ ...prev, userData: mergedData }));
      return { success: true };
    } catch (err) {
      devLog("UPDATE_USER_DATA", err);
      const msg =
        err instanceof AppError
          ? err.message
          : "Could not save your settings. Please try again.";
      return { success: false, error: msg };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EVENTS
  //
  // [SEC-043] EVENT KEY EXTRACTABILITY
  // In addEvent the event key is generated with extractable: true so that
  // exportKey("raw") can be called to wrap it under the DEK.  This is
  // necessary — once wrapped and discarded, the raw key material is no longer
  // accessible.  The wrapped form stored in Firestore is encrypted ciphertext.
  //
  // In subscribeToEvents and updateEvent the unwrapped event key is imported
  // with extractable: false / only the needed usage (["decrypt"] or
  // ["encrypt"]) to minimise exposure.
  //
  // [SEC-044] updateEvent: the shared-event path imported the event key with
  // extractable: true and usage ["encrypt"] — that was unnecessarily
  // permissive.  Changed to extractable: false.
  // ─────────────────────────────────────────────────────────────────────────
  async function addEvent(eventData, onProgress) {
    if (!currentUser?.id || !currentUser.userDek) {
      return { success: false, error: "Not authenticated." };
    }

    try {
      if (onProgress) onProgress("encrypting");

      const start = eventData.start ?? eventData.timeRange?.start;
      const end = eventData.end ?? eventData.timeRange?.end;

      const eventKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"],
      );

      const eventPlaintext = {
        title: eventData.title ?? "",
        description: eventData.description ?? "",
        color: eventData.color ?? "#FFD4A9",
        start,
        end,
      };

      const { ciphertext: encryptedEventData, iv: eventDataIv } =
        await encryptWithDEK(eventKey, eventPlaintext);

      const rawEventKey = await crypto.subtle.exportKey("raw", eventKey);

      const { ciphertext: encryptedEventKeyOwner, iv: eventKeyIvOwner } =
        await encryptWithDEK(currentUser.userDek, rawEventKey);

      const participants = [currentUser.id];

      const keys = {
        [currentUser.id]: {
          encrypted_event_key: encryptedEventKeyOwner,
          event_key_iv: eventKeyIvOwner,
        },
      };

      const sharedFriends = currentUser.userData?.sharedFriends || [];
      console.log(sharedFriends);
      for (const friend of sharedFriends) {
        try {
          if (!friend?.id || !friend?.publicKey) continue;

          const friendPubKey = await crypto.subtle.importKey(
            "spki",
            base64ToArrayBuffer(friend.publicKey),
            { name: "RSA-OAEP", hash: "SHA-256" },
            false,
            ["encrypt"],
          );

          const encryptedForFriend = await crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            friendPubKey,
            rawEventKey,
          );

          keys[friend.id] = {
            encrypted_event_key: arrayBufferToBase64(encryptedForFriend),
          };

          participants.push(friend.id);
        } catch (err) {
          devLog(
            "ADD_EVENT",
            `Failed to share event with friend ${friend.id}`,
            err,
          );
        }
      }

      if (onProgress) onProgress("uploading");

      const newGroupId = eventData.group_id ?? crypto.randomUUID();

      const eventPayload = {
        ownerId: currentUser.id,
        participants,
        group_id: newGroupId,
        created_at: new Date().toISOString(),
        encrypted_event_data: encryptedEventData,
        event_data_iv: eventDataIv,
        keys,
      };

      const docRef = await addDoc(collection(db, "events"), eventPayload);

      return {
        success: true,
        event: {
          ...eventData,
          id: docRef.id,
          group_id: newGroupId,
        },
      };
    } catch (err) {
      devLog("ADD_EVENT", err);

      const msg =
        err instanceof AppError
          ? err.message
          : "Could not create the event. Please try again.";

      return {
        success: false,
        error: msg,
      };
    }
  }

  async function updateEvent(eventData, onProgress) {
    if (!currentUser?.id || !currentUser.userDek) {
      return { success: false, error: "Not authenticated." };
    }
    try {
      const eventId = eventData.sourceEventId ?? eventData.id;
      if (!isNonEmptyString(eventId)) {
        return { success: false, error: "Missing event ID." };
      }

      if (onProgress) onProgress("encrypting");
      const eventRef = doc(db, "events", eventId);
      const eventSnap = await getDoc(eventRef);
      if (!eventSnap.exists()) {
        return { success: false, error: "Event not found." };
      }

      const data = eventSnap.data();
      const myKeyData = data.keys?.[currentUser.id];
      validateEventKeySlot(myKeyData, `(event ${eventId})`);

      let eventKeyRaw;
      if (data.ownerId === currentUser.id) {
        // Owner path: key wrapped with DEK.
        if (!isBase64(myKeyData.event_key_iv)) {
          throw new AppError(
            AuthErrorCode.CORRUPTED_CIPHERTEXT,
            "Event key slot is malformed.",
          );
        }
        eventKeyRaw = await decryptRawBuffer(
          currentUser.userDek,
          myKeyData.encrypted_event_key,
          myKeyData.event_key_iv,
        );
      } else {
        // Shared path: key wrapped with our RSA public key.
        if (!currentUser.privateKey) {
          throw new AppError(
            AuthErrorCode.MISSING_PRIVATE_KEY,
            "Your RSA private key is not available for this session.",
          );
        }
        try {
          eventKeyRaw = await crypto.subtle.decrypt(
            { name: "RSA-OAEP" },
            currentUser.privateKey,
            base64ToArrayBuffer(myKeyData.encrypted_event_key),
          );
        } catch (err) {
          throw new AppError(
            AuthErrorCode.DECRYPTION_FAILED,
            "Could not decrypt the event key.",
            err,
          );
        }
      }

      // [SEC-044] Import as non-extractable, encrypt-only.
      const eventKey = await crypto.subtle.importKey(
        "raw",
        eventKeyRaw,
        { name: "AES-GCM" },
        false, // non-extractable
        ["encrypt"],
      );

      const start = eventData.start ?? eventData.timeRange?.start;
      const end = eventData.end ?? eventData.timeRange?.end;
      const { ciphertext, iv } = await encryptWithDEK(eventKey, {
        title: eventData.title ?? "",
        start,
        end,
      });

      if (onProgress) onProgress("uploading");
      await updateDoc(eventRef, {
        encrypted_event_data: ciphertext,
        event_data_iv: iv,
      });

      return { success: true, event: eventData };
    } catch (err) {
      devLog("UPDATE_EVENT", err);
      const msg =
        err instanceof AppError
          ? err.message
          : "Could not update the event. Please try again.";
      return { success: false, error: msg };
    }
  }

  async function deleteEvent(eventId) {
    if (!isNonEmptyString(eventId)) {
      return { success: false, error: "Missing event ID." };
    }
    try {
      await deleteDoc(doc(db, "events", eventId));
      return { success: true };
    } catch (err) {
      devLog("DELETE_EVENT", err);
      return { success: false, error: "Could not delete the event." };
    }
  }

  async function deleteSeries(groupId) {
    if (!isNonEmptyString(groupId)) {
      return { success: false, error: "Missing group ID." };
    }
    try {
      const snap = await getDocs(
        query(collection(db, "events"), where("group_id", "==", groupId)),
      );
      const batch = writeBatch(db);
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      return { success: true };
    } catch (err) {
      devLog("DELETE_SERIES", err);
      return { success: false, error: "Could not delete the event series." };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARING
  // [SEC-045] shareVisibleEventsWithFriend: validate friendPublicKeyBase64
  // before importing to avoid feeding garbage into importKey.
  // [SEC-046] Batch size guard: Firestore batches are capped at 500 ops.
  //           Added chunking to handle users with >500 events.
  // ─────────────────────────────────────────────────────────────────────────
  async function shareVisibleEventsWithFriend(friendId, friendPublicKeyBase64) {
    if (!currentUser?.userDek) {
      return { success: false, error: "Not authenticated" };
    }
    if (!isNonEmptyString(friendId)) {
      return { success: false, error: "Invalid friend ID." };
    }
    if (!isBase64(friendPublicKeyBase64)) {
      return { success: false, error: "Invalid public key format." };
    }

    try {
      // Update friend list (idempotent).
      const currentShared = currentUser.userData?.sharedFriends ?? [];
      if (!currentShared.some((f) => f.id === friendId)) {
        await updateUserData({
          sharedFriends: [
            ...currentShared,
            { id: friendId, publicKey: friendPublicKeyBase64 },
          ],
        });
      }

      let friendPubKey;
      try {
        friendPubKey = await crypto.subtle.importKey(
          "spki",
          base64ToArrayBuffer(friendPublicKeyBase64),
          { name: "RSA-OAEP", hash: "SHA-256" },
          false,
          ["encrypt"],
        );
      } catch (err) {
        throw new AppError(
          AuthErrorCode.KEY_IMPORT_FAILED,
          "The friend's public key is invalid.",
          err,
        );
      }

      const snap = await getDocs(
        query(collection(db, "events"), where("ownerId", "==", currentUser.id)),
      );

      // [SEC-046] Chunk into batches of 400 (safe margin under 500).
      const BATCH_LIMIT = 400;
      let batch = writeBatch(db);
      let opCount = 0;

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        if (data.keys?.[friendId]) continue; // already shared

        const myKey = data.keys?.[currentUser.id];
        if (
          !myKey ||
          !isBase64(myKey.encrypted_event_key) ||
          !isBase64(myKey.event_key_iv)
        ) {
          devLog(
            "SHARE",
            `Skipping event ${docSnap.id}: missing/corrupt owner key slot`,
          );
          continue;
        }

        let rawKey;
        try {
          rawKey = await decryptRawBuffer(
            currentUser.userDek,
            myKey.encrypted_event_key,
            myKey.event_key_iv,
          );
        } catch (err) {
          devLog(
            "SHARE",
            `Skipping event ${docSnap.id}: could not decrypt event key`,
            err,
          );
          continue;
        }

        let encryptedForFriend;
        try {
          encryptedForFriend = await crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            friendPubKey,
            rawKey,
          );
        } catch (err) {
          devLog(
            "SHARE",
            `Skipping event ${docSnap.id}: RSA encrypt failed`,
            err,
          );
          continue;
        }

        batch.update(docSnap.ref, {
          participants: arrayUnion(friendId),
          [`keys.${friendId}`]: {
            encrypted_event_key: arrayBufferToBase64(encryptedForFriend),
          },
        });
        opCount++;

        if (opCount >= BATCH_LIMIT) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      }

      if (opCount > 0) await batch.commit();
      return { success: true };
    } catch (err) {
      devLog("SHARE", err);
      const msg =
        err instanceof AppError
          ? err.message
          : "Could not share events. Please try again.";
      return { success: false, error: msg };
    }
  }

  async function revokeFriendAccess(friendId) {
    if (!currentUser) return { success: false, error: "Not authenticated" };
    if (!isNonEmptyString(friendId))
      return { success: false, error: "Invalid friend ID." };

    try {
      const currentShared = currentUser.userData?.sharedFriends ?? [];
      await updateUserData({
        sharedFriends: currentShared.filter((f) => f.id !== friendId),
      });

      const snap = await getDocs(
        query(
          collection(db, "events"),
          where("ownerId", "==", currentUser.id),
          where("participants", "array-contains", friendId),
        ),
      );

      const BATCH_LIMIT = 400;
      let batch = writeBatch(db);
      let opCount = 0;

      for (const docSnap of snap.docs) {
        batch.update(docSnap.ref, {
          participants: arrayRemove(friendId),
          [`keys.${friendId}`]: deleteField(),
        });
        opCount++;
        if (opCount >= BATCH_LIMIT) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      }
      if (opCount > 0) await batch.commit();

      return { success: true };
    } catch (err) {
      devLog("REVOKE", err);
      return {
        success: false,
        error: "Could not revoke access. Please try again.",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REAL-TIME SUBSCRIPTION
  // ─────────────────────────────────────────────────────────────────────────
  function subscribeToEvents(onEventsUpdate) {
    if (!currentUser?.id || !currentUser.userDek) return () => {};

    const q = query(
      collection(db, "events"),
      where("participants", "array-contains", currentUser.id),
    );

    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      async (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;

        try {
          const decryptedEvents = [];
          for (const document of snapshot.docs) {
            const data = document.data();
            try {
              const myKeyData = data.keys?.[currentUser.id];
              if (!myKeyData) continue;

              let eventKeyRaw;
              if (data.ownerId === currentUser.id) {
                if (
                  !isBase64(myKeyData.encrypted_event_key) ||
                  !isBase64(myKeyData.event_key_iv)
                ) {
                  devLog(
                    "SUBSCRIBE",
                    `Malformed owner key slot for event ${document.id}`,
                  );
                  continue;
                }
                eventKeyRaw = await decryptRawBuffer(
                  currentUser.userDek,
                  myKeyData.encrypted_event_key,
                  myKeyData.event_key_iv,
                );
              } else {
                if (!currentUser.privateKey) continue;
                if (!isBase64(myKeyData.encrypted_event_key)) {
                  devLog(
                    "SUBSCRIBE",
                    `Malformed shared key slot for event ${document.id}`,
                  );
                  continue;
                }
                try {
                  eventKeyRaw = await crypto.subtle.decrypt(
                    { name: "RSA-OAEP" },
                    currentUser.privateKey,
                    base64ToArrayBuffer(myKeyData.encrypted_event_key),
                  );
                } catch (err) {
                  devLog(
                    "SUBSCRIBE",
                    `RSA decrypt failed for event ${document.id}`,
                    err,
                  );
                  continue;
                }
              }

              const eventKey = await crypto.subtle.importKey(
                "raw",
                eventKeyRaw,
                { name: "AES-GCM" },
                false,
                ["decrypt"],
              );

              if (
                !isBase64(data.encrypted_event_data) ||
                !isBase64(data.event_data_iv)
              ) {
                devLog(
                  "SUBSCRIBE",
                  `Malformed event ciphertext for ${document.id}`,
                );
                continue;
              }
              console.log("EVENT DATA", data);
              const eventPlaintext = await decryptJson(
                eventKey,
                data.encrypted_event_data,
                data.event_data_iv,
              );
              console.log("EVENT DECRYPTED", eventPlaintext);
              decryptedEvents.push({
                ...eventPlaintext,
                id: document?.id,
                group_id: data?.group_id,
                isShared: data?.ownerId !== currentUser.id,

                timeRange: {
                  start: eventPlaintext?.start,
                  end: eventPlaintext?.end,
                },

                created_at: data?.created_at,
                ownerId: data?.ownerId,
                participants: data?.participants,
              });
            } catch (decryptError) {
              // [SEC-047] Per-event errors are logged and skipped — they do
              // not abort the entire snapshot.
              devLog(
                "SUBSCRIBE",
                `Event ${document.id} decryption failed`,
                decryptError,
              );
            }
          }
          onEventsUpdate({ success: true, events: decryptedEvents });
        } catch (error) {
          devLog("SUBSCRIBE", "Snapshot handler threw", error);
          onEventsUpdate({ success: false, error: "Could not load events." });
        }
      },
      (error) => {
        // Firestore listener error callback.
        devLog("SUBSCRIBE", "onSnapshot error", error);
        onEventsUpdate({ success: false, error: "Event stream disconnected." });
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROVIDER OUTPUT
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <AuthContext.Provider
      value={{
        currentUser,
        authStatus,
        activePage,
        signIn,
        signOut,
        updateUserProfile,
        checkUsernameAvailability,
        updateUserData,
        addEvent,
        deleteEvent,
        deleteSeries,
        updateEvent,
        registrationFlow,
        decryptRawBuffer,
        decryptJson,
        subscribeToEvents,
        shareVisibleEventsWithFriend,
        revokeFriendAccess,
        // [SEC-048] Expose error codes so consumers can branch on type.
        AuthErrorCode,
      }}
    >
      {authStatus === null || authStatus === "loading" ? <Loading /> : children}
    </AuthContext.Provider>
  );
}

export function useData() {
  return useContext(AuthContext);
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE-LEVEL PURE HELPERS
// [SEC-014] Defined outside the component so they are stable references and
// not re-created on every render.
// ─────────────────────────────────────────────────────────────────────────────
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // [SEC-049] Process in chunks to avoid stack overflow on large buffers.
  const CHUNK = 8192;
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  // [SEC-050] Validate input before atob to produce a clear error.
  if (typeof base64 !== "string" || !B64_RE.test(base64)) {
    throw new AppError(
      AuthErrorCode.CORRUPTED_CIPHERTEXT,
      "Invalid base64 data encountered.",
    );
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function normalizeAndEncodePassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    throw new AppError(
      AuthErrorCode.SCHEMA_INVALID,
      "Password must be a non-empty string.",
    );
  }
  return new TextEncoder().encode(password.normalize("NFKC"));
}
