import { createContext, useContext, useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Loading from "../components/loading/Loading";
import { argon2id } from "hash-wasm";

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
  runTransaction,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  EVENT_AVAILABILITY,
  DEFAULT_EVENT_COLOR,
  EVENT_VISIBILITY,
} from "../constants/constants";

export const AuthErrorCode = Object.freeze({
  INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  USER_NOT_FOUND: "AUTH_USER_NOT_FOUND",
  FIREBASE_AUTH: "AUTH_FIREBASE_AUTH",
  CRYPTO_UNAVAILABLE: "CRYPTO_UNAVAILABLE",
  DECRYPTION_FAILED: "CRYPTO_DECRYPTION_FAILED",
  CORRUPTED_CIPHERTEXT: "CRYPTO_CORRUPTED_CIPHERTEXT",
  KEY_IMPORT_FAILED: "CRYPTO_KEY_IMPORT_FAILED",
  KEY_WRAP_FAILED: "CRYPTO_KEY_WRAP_FAILED",
  KEY_UNWRAP_FAILED: "CRYPTO_KEY_UNWRAP_FAILED",
  MISSING_PRIVATE_KEY: "CRYPTO_MISSING_PRIVATE_KEY",
  MISSING_DEK: "CRYPTO_MISSING_DEK",
  DEVICE_NOT_REGISTERED: "DEVICE_NOT_REGISTERED",
  DEVICE_RECORD_CORRUPT: "DEVICE_RECORD_CORRUPT",
  DEVICE_REGISTRATION_FAILED: "DEVICE_REGISTRATION_FAILED",
  SESSION_RESTORE_FAILED: "SESSION_RESTORE_FAILED",
  MISSING_DEVICE_KEY: "DEVICE_MISSING_KEY",
  IDB_UNAVAILABLE: "IDB_UNAVAILABLE",
  IDB_READ_FAILED: "IDB_READ_FAILED",
  IDB_WRITE_FAILED: "IDB_WRITE_FAILED",
  IDB_DELETE_FAILED: "IDB_DELETE_FAILED",
  IDB_CORRUPT: "IDB_CORRUPT",
  FIRESTORE_READ_FAILED: "FIRESTORE_READ_FAILED",
  FIRESTORE_WRITE_FAILED: "FIRESTORE_WRITE_FAILED",
  NETWORK_UNAVAILABLE: "NETWORK_UNAVAILABLE",
  SCHEMA_INVALID: "SCHEMA_INVALID",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  UNKNOWN: "UNKNOWN",
});

class AppError extends Error {
  constructor(code, userMessage, cause = null) {
    super(userMessage);
    this.name = "AppError";
    this.code = code;
    this.cause = cause;
  }
}

function devLog(label, ...args) {
  if (process.env.NODE_ENV !== "production") {
    console.error(`[E2EE:${label}]`, ...args);
  }
}

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

const B64_RE = /^[A-Za-z0-9+/]+=*$/;

function isNonEmptyString(v) {
  return typeof v === "string" && v.length > 0;
}

function isBase64(v) {
  return isNonEmptyString(v) && B64_RE.test(v);
}

function validatePrivateDoc(data) {
  const required = [
    "argonSalt",
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

function validateEventKeySlot(slot, context = "") {
  if (!slot || !isBase64(slot.encrypted_event_key)) {
    throw new AppError(
      AuthErrorCode.CORRUPTED_CIPHERTEXT,
      "An event could not be decrypted due to a data integrity issue.",
      new Error(`Invalid event key slot ${context}`),
    );
  }
}

const IDB_DB_NAME = "E2EE_SecureKeyStore";
const IDB_STORE_NAME = "DeviceKeys";
const IDB_DB_VERSION = 1;
const IDB_KEY_NAME = "localDeviceKey";
const IDB_METADATA_NAME = "localDeviceMeta";

let _idbPromise = null;

function getIDB() {
  if (_idbPromise) return _idbPromise;

  _idbPromise = new Promise((resolve, reject) => {
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

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
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

async function saveToDB(key, value) {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(IDB_STORE_NAME, "readwrite");
    } catch (err) {
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
      devLog("IDB_DELETE", `Could not delete key ${key}`, err);
      return resolve();
    }
    const store = tx.objectStore(IDB_STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => {
      devLog("IDB_DELETE", `Delete failed for key ${key}`, request.error);
      resolve();
    };
  });
}

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
        return resolve();
      }
      const store = tx.objectStore(IDB_STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => {
        devLog("IDB_CLEAR", "Store clear failed", request.error);
        resolve();
      };
    });
  } catch (err) {
    devLog("IDB_CLEAR", "getIDB failed during logout", err);
  }
}

async function deriveArgon2idKey(passwordStr, saltBytes) {
  const hexHash = await argon2id({
    password: passwordStr,
    salt: saltBytes,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: "hex",
  });
  const keyBytes = new Uint8Array(Math.ceil(hexHash.length / 2));
  for (let i = 0; i < keyBytes.length; i++) {
    keyBytes[i] = parseInt(hexHash.substring(i * 2, i * 2 + 2), 16);
  }
  return await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  );
}

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activePage, setActivePage] = useState(location.pathname);
  const [currentUser, setCurrentUser] = useState(undefined);
  const [authStatus, setAuthStatus] = useState(null);
  const isAuthenticatingRef = useRef(false);

  useEffect(() => {
    setActivePage(location.pathname);
  }, [location.pathname]);

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
        };

        const restorationResult = await restoreDeviceSession(
          baseUser.id,
          privateSnap.data(),
        );

        if (!restorationResult.ok) {
          devLog(
            "SESSION",
            "Device session unavailable:",
            restorationResult.reason,
          );
          await firebaseSignOut(auth).catch(() => {});
          setAuthStatus("not_logged_in");
          setCurrentUser(null);
          return;
        }

        const { userDek, privateKey } = restorationResult;

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

  async function signIn(identifier, password) {
    isAuthenticatingRef.current = true;
    try {
      let loginEmail = identifier;

      if (!identifier.includes("@")) {
        let email;
        try {
          email = await resolveEmailFromUsername(identifier);
        } catch (err) {
          return { success: false, error: "Invalid username or password." };
        }
        if (!email) {
          return { success: false, error: "Invalid username or password." };
        }
        loginEmail = email;
      }

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

      validatePrivateDoc(authDetails);

      const argonSaltBytes = base64ToArrayBuffer(authDetails.argonSalt);
      const pdk = await deriveArgon2idKey(
        password,
        new Uint8Array(argonSaltBytes),
      );

      let dek, privateKey;
      try {
        dek = await crypto.subtle.unwrapKey(
          "raw",
          base64ToArrayBuffer(authDetails.dekCiphertext),
          pdk,
          { name: "AES-GCM", iv: base64ToArrayBuffer(authDetails.dekIv) },
          { name: "AES-GCM", length: 256 },
          true,
          ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
        );
      } catch (err) {
        throw new AppError(
          AuthErrorCode.KEY_UNWRAP_FAILED,
          "Invalid username or password.",
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
          { name: "X25519" },
          true,
          ["deriveBits"],
        );
      } catch (err) {
        throw new AppError(
          AuthErrorCode.KEY_UNWRAP_FAILED,
          "Could not restore your cryptographic identity. Please try again.",
          err,
        );
      }

      const deviceId = await provisionDeviceRecord(
        firebaseUser.uid,
        dek,
        privateKey,
      );

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

  async function provisionDeviceRecord(uid, dek, privateKey) {
    let deviceId = await loadFromDB(IDB_METADATA_NAME);

    if (deviceId) {
      let existingSnap;
      try {
        existingSnap = await getDoc(
          doc(db, "usersPrivateData", uid, "devices", deviceId),
        );
      } catch (_) {
        existingSnap = null;
      }

      if (existingSnap?.exists()) {
        // Record valid; proceed to overwrite
      }
    } else {
      deviceId = crypto.randomUUID();
      await saveToDB(IDB_METADATA_NAME, deviceId);
    }

    const deviceKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
    );

    await saveToDB(IDB_KEY_NAME, deviceKey);

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

    try {
      await setDoc(
        doc(db, "usersPrivateData", uid, "devices", deviceId),
        {
          deviceId,
          deviceName: navigator.userAgent.slice(0, 200),
          platform: navigator.platform || "unknown",
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
          wrappedDek: arrayBufferToBase64(wrappedDeviceDek),
          deviceIv: arrayBufferToBase64(deviceDekIv),
          wrappedPrivateKey: arrayBufferToBase64(wrappedPrivKey),
          privateKeyIv: arrayBufferToBase64(privKeyDeviceIv),
        },
        { merge: false },
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
        return {
          ok: false,
          reason: "Device record missing (possibly revoked)",
        };
      }

      const deviceData = deviceSnap.data();

      try {
        validateDeviceDoc(deviceData);
      } catch (err) {
        devLog("SESSION_RESTORE", "Device doc validation failed", err);
        return { ok: false, reason: "Device record corrupt" };
      }

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
            { name: "X25519" },
            true,
            ["deriveBits"],
          );
        } catch (err) {
          devLog("SESSION_RESTORE", "private key unwrap failed", err);
        }
      }

      updateDoc(doc(db, "usersPrivateData", uid, "devices", deviceId), {
        lastUsedAt: new Date().toISOString(),
      }).catch((err) =>
        devLog("SESSION_RESTORE", "lastUsedAt update failed", err),
      );
      return { ok: true, userDek, privateKey };
    } catch (err) {
      devLog("SESSION_RESTORE", "Unexpected error", err);
      return { ok: false, reason: "Unexpected error during session restore" };
    }
  }

  async function signOut() {
    try {
      const deviceId = await loadFromDB(IDB_METADATA_NAME).catch(() => null);
      const uid = auth.currentUser?.uid;
      if (uid && deviceId) {
        await deleteDoc(doc(db, "usersPrivateData", uid, "devices", deviceId));
      }
    } catch (err) {
      devLog("SIGN_OUT", "Device record deletion failed (non-fatal)", err);
    }

    await clearAllFromDB();

    try {
      await firebaseSignOut(auth);
      setCurrentUser(null);
      setAuthStatus("not_logged_in");
    } catch (err) {
      devLog("SIGN_OUT", "Firebase sign-out threw (non-fatal)", err);
    }

    navigate("/login/sign-in");
  }

  async function registrationFlow(email, password) {
    isAuthenticatingRef.current = true;
    try {
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const pdk = await deriveArgon2idKey(password, salt);

      const dek = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
      );

      const dekIv = crypto.getRandomValues(new Uint8Array(12));
      const wrappedDekBuffer = await crypto.subtle.wrapKey("raw", dek, pdk, {
        name: "AES-GCM",
        iv: dekIv,
      });

      const identityKeyPair = await crypto.subtle.generateKey(
        {
          name: "X25519",
        },
        true,
        ["deriveBits"],
      );

      const exportedPublicKey = await crypto.subtle.exportKey(
        "spki",
        identityKeyPair.publicKey,
      );

      const privateKeyIv = crypto.getRandomValues(new Uint8Array(12));
      const wrappedPrivateKey = await crypto.subtle.wrapKey(
        "pkcs8",
        identityKeyPair.privateKey,
        pdk,
        { name: "AES-GCM", iv: privateKeyIv },
      );

      let firebaseUser;
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

      const initialUserData = { sharedFriends: [], settings: {} };
      const { ciphertext: encryptedUserData, iv: userDataIv } =
        await encryptWithDEK(dek, initialUserData);

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

      try {
        await setDoc(doc(db, "usersPrivateData", firebaseUser.uid), {
          argonSalt: arrayBufferToBase64(salt),
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

  async function resolveEmailFromUsername(username) {
    try {
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("username_lower", "==", username.toLowerCase()),
      );
      let snap = await getDocs(q);
      if (!snap.empty) return snap.docs[0].data().email;

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

  async function encryptWithDEK(key, plaintext) {
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
        "DECRYPTION_FAILED.",
        err,
      );
    }

    return {
      ciphertext: arrayBufferToBase64(ciphertextBuffer),
      iv: arrayBufferToBase64(iv),
    };
  }

  async function decryptRawBuffer(key, ciphertextB64, ivB64) {
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

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);

      reader.readAsDataURL(file);
    });
  }

  async function updateUserProfile(formData) {
    if (!currentUser?.id) {
      return { success: false, error: "Not authenticated" };
    }

    try {
      const publicPayload = {};
      const privatePayload = {};

      // 1. Prep string logic
      const newUsername = isNonEmptyString(formData.username)
        ? formData.username
        : null;
      const newUsernameLower = newUsername ? newUsername.toLowerCase() : null;
      const oldUsernameLower = currentUser.username_lower || null;

      // Check if the user is actually requesting a name change
      const isChangingUsername =
        newUsernameLower && newUsernameLower !== oldUsernameLower;

      if (newUsername) {
        publicPayload.username = newUsername;
        publicPayload.username_lower = newUsernameLower;
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
          return { success: false, error: "Encryption key unavailable." };
        }
        const { ciphertext, iv } = await encryptWithDEK(
          currentUser.userDek,
          formData.pin,
        );
        privatePayload.pin = ciphertext;
        privatePayload.pin_iv = iv;
      }

      // 2. Execute the Transaction
      await runTransaction(db, async (transaction) => {
        let newUsernameRef;

        // --- ALL READS MUST GO FIRST ---
        if (isChangingUsername) {
          newUsernameRef = doc(db, "usernames", newUsernameLower);
          const newUsernameSnap = await transaction.get(newUsernameRef);

          if (newUsernameSnap.exists()) {
            // If the transaction finds it exists at the exact moment of saving, abort.
            throw new Error("USERNAME_ALREADY_TAKEN");
          }
        }

        // --- WRITES GO SECOND ---

        // Update User Documents
        const userRef = doc(db, "users", currentUser.id);
        const privateRef = doc(db, "usersPrivateData", currentUser.id);

        if (Object.keys(publicPayload).length > 0) {
          transaction.update(userRef, publicPayload);
        }
        if (Object.keys(privatePayload).length > 0) {
          transaction.update(privateRef, privatePayload);
        }

        // Handle the Username Registry
        if (isChangingUsername) {
          // Reserve the new name
          transaction.set(newUsernameRef, { uid: currentUser.id });

          // Release the old name so someone else can use it
          if (oldUsernameLower) {
            const oldUsernameRef = doc(db, "usernames", oldUsernameLower);
            transaction.delete(oldUsernameRef);
          }
        }
      });

      // 3. Update Local State
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

      // Catch our custom transaction error
      if (err.message === "USERNAME_ALREADY_TAKEN") {
        return {
          success: false,
          error: "This username was just taken. Please choose another.",
        };
      }

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

  async function addEvent(eventData, onProgress) {
    if (!currentUser?.id || !currentUser.userDek) {
      return { success: false, error: "Not authenticated." };
    }

    try {
      if (onProgress) onProgress("encrypting");

      if (!eventData?.timeRange?.start || !eventData?.timeRange?.end) {
        return {
          success: false,
          error: "Invalid event time range",
        };
      }
      const eventKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"],
      );

      const eventPlaintext = {
        title: eventData.title ?? "",
        description: eventData.description ?? "",
        color: eventData.color ?? DEFAULT_EVENT_COLOR,
        emoji: eventData.emoji ?? "",
        visibility: eventData.visibility ?? EVENT_VISIBILITY,
        availability: eventData.availability ?? EVENT_AVAILABILITY,
        recurrence: eventData.recurrence ?? { type: "NONE" },
        exdate: eventData.exdate ?? [],
        timeRange: {
          start: eventData.timeRange.start,
          end: eventData.timeRange.end,
        },
      };
      const { ciphertext: encryptedEventData, iv: eventDataIv } =
        await encryptWithDEK(eventKey, eventPlaintext);

      const rawEventKey = await crypto.subtle.exportKey("raw", eventKey);

      const { ciphertext: encryptedEventKeyOwner, iv: eventKeyIvOwner } =
        await encryptWithDEK(currentUser.userDek, rawEventKey);

      let participants = [currentUser.id];

      let keys = {
        [currentUser.id]: {
          encrypted_event_key: encryptedEventKeyOwner,
          event_key_iv: eventKeyIvOwner,
        },
      };

      let targetFriends = [];
      if (eventData.visibility === "visible") {
        targetFriends = currentUser.userData?.sharedFriends || [];
      } else if (
        eventData.visibility === "specific" &&
        eventData.invitedFriendsFull?.length > 0
      ) {
        targetFriends = eventData.invitedFriendsFull;
      }

      for (const friend of targetFriends) {
        try {
          if (!friend?.id || !friend?.publicKey) continue;

          const friendPubKey = await crypto.subtle.importKey(
            "spki",
            base64ToArrayBuffer(friend.publicKey),
            { name: "X25519" },
            false,
            [],
          );

          const ephemeralKeyPair = await crypto.subtle.generateKey(
            { name: "X25519" },
            true,
            ["deriveBits"],
          );

          const sharedSecret = await crypto.subtle.deriveBits(
            { name: "X25519", public: friendPubKey },
            ephemeralKeyPair.privateKey,
            256,
          );

          const hkdfSalt = crypto.getRandomValues(new Uint8Array(16));
          const sharedAesKey = await deriveHKDFAesKey(sharedSecret, hkdfSalt);

          const sharedIv = crypto.getRandomValues(new Uint8Array(12));
          const encryptedForFriend = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: sharedIv },
            sharedAesKey,
            rawEventKey,
          );

          const ephemeralPubRaw = await crypto.subtle.exportKey(
            "spki",
            ephemeralKeyPair.publicKey,
          );

          keys[friend.id] = {
            ephemeral_public_key: arrayBufferToBase64(ephemeralPubRaw),
            encrypted_event_key: arrayBufferToBase64(encryptedForFriend),
            shared_iv: arrayBufferToBase64(sharedIv),
            hkdf_salt: arrayBufferToBase64(hkdfSalt),
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
      const createdAt = new Date().toISOString();

      const eventPayload = {
        ownerId: currentUser.id,
        participants,
        group_id: newGroupId,
        created_at: createdAt,
        visibility: eventData.visibility || "visible",
        reminderMinutes: parseInt(eventData.notification, 10) || 0,
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
          timeRange: {
            start: eventData.timeRange.start,
            end: eventData.timeRange.end,
          },
          created_at: createdAt,
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
    console.log(eventData);
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
        if (!currentUser.privateKey) {
          throw new AppError(
            AuthErrorCode.MISSING_PRIVATE_KEY,
            "Your identity private key is not available for this session.",
          );
        }
        if (
          !isBase64(myKeyData.ephemeral_public_key) ||
          !isBase64(myKeyData.shared_iv) ||
          !isBase64(myKeyData.hkdf_salt)
        ) {
          throw new AppError(
            AuthErrorCode.CORRUPTED_CIPHERTEXT,
            "Shared event key slot is malformed.",
          );
        }
        try {
          const ephemeralPubKey = await crypto.subtle.importKey(
            "spki",
            base64ToArrayBuffer(myKeyData.ephemeral_public_key),
            { name: "X25519" },
            false,
            [],
          );
          const sharedSecret = await crypto.subtle.deriveBits(
            { name: "X25519", public: ephemeralPubKey },
            currentUser.privateKey,
            256,
          );
          const sharedAesKey = await deriveHKDFAesKey(
            sharedSecret,
            base64ToArrayBuffer(myKeyData.hkdf_salt),
          );
          eventKeyRaw = await crypto.subtle.decrypt(
            {
              name: "AES-GCM",
              iv: base64ToArrayBuffer(myKeyData.shared_iv),
            },
            sharedAesKey,
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

      const eventKey = await crypto.subtle.importKey(
        "raw",
        eventKeyRaw,
        { name: "AES-GCM" },
        false,
        ["encrypt"],
      );

      const eventPlaintext = {
        title: eventData.title ?? "",
        description: eventData.description ?? "",
        color: eventData.color ?? "#FFD4A9",
        emoji: eventData.emoji ?? "",
        visibility: eventData.visibility ?? "visible",
        availability: eventData.availability ?? "busy",
        timeRange: {
          start: eventData.timeRange.start,
          end: eventData.timeRange.end,
        },
        recurrence: eventData.recurrence ?? { type: "NONE" },
        exdate: eventData.exdate ?? [],
      };

      const { ciphertext, iv } = await encryptWithDEK(eventKey, eventPlaintext);

      const updatePayload = {
        reminderMinutes: parseInt(eventData.notification, 10) || 0,
        visibility: eventData.visibility || "visible",
        encrypted_event_data: ciphertext,
        event_data_iv: iv,
      };

      if (isNonEmptyString(eventData.reassignGroupId)) {
        updatePayload.group_id = eventData.reassignGroupId;
      }

      if (data.ownerId === currentUser.id) {
        let participants = [currentUser.id];
        let keys = {
          [currentUser.id]: data.keys[currentUser.id],
        };

        let targetFriends = [];
        if (eventData.visibility === "visible") {
          targetFriends = currentUser.userData?.sharedFriends || [];
        } else if (
          eventData.visibility === "specific" &&
          eventData.invitedFriendsFull?.length > 0
        ) {
          targetFriends = eventData.invitedFriendsFull;
        }

        for (const friend of targetFriends) {
          participants.push(friend.id);

          if (!data.keys[friend.id]) {
            try {
              const friendPubKey = await crypto.subtle.importKey(
                "spki",
                base64ToArrayBuffer(friend.publicKey),
                { name: "X25519" },
                false,
                [],
              );

              const ephemeralKeyPair = await crypto.subtle.generateKey(
                { name: "X25519" },
                true,
                ["deriveBits"],
              );

              const sharedSecret = await crypto.subtle.deriveBits(
                { name: "X25519", public: friendPubKey },
                ephemeralKeyPair.privateKey,
                256,
              );

              const hkdfSalt = crypto.getRandomValues(new Uint8Array(16));
              const sharedAesKey = await deriveHKDFAesKey(
                sharedSecret,
                hkdfSalt,
              );

              const sharedIv = crypto.getRandomValues(new Uint8Array(12));
              const encryptedForFriend = await crypto.subtle.encrypt(
                { name: "AES-GCM", iv: sharedIv },
                sharedAesKey,
                eventKeyRaw,
              );

              const ephemeralPubRaw = await crypto.subtle.exportKey(
                "spki",
                ephemeralKeyPair.publicKey,
              );

              keys[friend.id] = {
                ephemeral_public_key: arrayBufferToBase64(ephemeralPubRaw),
                encrypted_event_key: arrayBufferToBase64(encryptedForFriend),
                shared_iv: arrayBufferToBase64(sharedIv),
                hkdf_salt: arrayBufferToBase64(hkdfSalt),
              };
            } catch (e) {
              devLog("UPDATE_EVENT", "Error securing new key for friend", e);
            }
          } else {
            keys[friend.id] = data.keys[friend.id];
          }
        }

        updatePayload.participants = participants;
        updatePayload.keys = keys;
      }

      if (onProgress) onProgress("uploading");
      await updateDoc(eventRef, updatePayload);

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

  function updateParticipantsAndKeys(
    batch,
    ref,
    { addUserId, removeUserId, keyData },
  ) {
    const updateData = {};
    if (addUserId) {
      updateData.participants = arrayUnion(addUserId);
      updateData[`keys.${addUserId}`] = keyData;
    }
    if (removeUserId) {
      updateData.participants = arrayRemove(removeUserId);
      updateData[`keys.${removeUserId}`] = deleteField();
    }
    batch.update(ref, updateData);
  }

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
          { name: "X25519" },
          false,
          [],
        );
      } catch (err) {
        throw new AppError(
          AuthErrorCode.KEY_IMPORT_FAILED,
          "The friend's public key is invalid.",
          err,
        );
      }

      const snap = await getDocs(
        query(
          collection(db, "events"),
          where("ownerId", "==", currentUser.id),
          where("visibility", "==", "visible"),
        ),
      );

      const BATCH_LIMIT = 400;
      let batch = writeBatch(db);
      let opCount = 0;

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        if (data.keys?.[friendId]) continue;

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

        let encryptedForFriend, ephemeralPubRaw, sharedIv, hkdfSalt;
        try {
          const ephemeralKeyPair = await crypto.subtle.generateKey(
            { name: "X25519" },
            true,
            ["deriveBits"],
          );
          const sharedSecret = await crypto.subtle.deriveBits(
            { name: "X25519", public: friendPubKey },
            ephemeralKeyPair.privateKey,
            256,
          );

          hkdfSalt = crypto.getRandomValues(new Uint8Array(16));
          const sharedAesKey = await deriveHKDFAesKey(sharedSecret, hkdfSalt);

          sharedIv = crypto.getRandomValues(new Uint8Array(12));
          encryptedForFriend = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: sharedIv },
            sharedAesKey,
            rawKey,
          );
          ephemeralPubRaw = await crypto.subtle.exportKey(
            "spki",
            ephemeralKeyPair.publicKey,
          );
        } catch (err) {
          devLog(
            "SHARE",
            `Skipping event ${docSnap.id}: ECDH setup failed`,
            err,
          );
          continue;
        }

        updateParticipantsAndKeys(batch, docSnap.ref, {
          addUserId: friendId,
          keyData: {
            ephemeral_public_key: arrayBufferToBase64(ephemeralPubRaw),
            encrypted_event_key: arrayBufferToBase64(encryptedForFriend),
            shared_iv: arrayBufferToBase64(sharedIv),
            hkdf_salt: arrayBufferToBase64(hkdfSalt),
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
        updateParticipantsAndKeys(batch, docSnap.ref, {
          removeUserId: friendId,
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

  function subscribeToEvents(onEventsUpdate) {
    if (!currentUser?.id || !currentUser.userDek) return () => {};

    const qEvents = query(
      collection(db, "events"),
      where("participants", "array-contains", currentUser.id),
    );

    return onSnapshot(
      qEvents,
      { includeMetadataChanges: true },
      async (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;

        try {
          const friendshipsRef = collection(db, "friendships");
          const qFriends = query(
            friendshipsRef,
            where("users", "array-contains", currentUser.id),
            where("status", "==", "accepted"),
          );
          const friendSnaps = await getDocs(qFriends);
          const activeFriendIds = friendSnaps.docs.map((d) =>
            d.data().users.find((id) => id !== currentUser.id),
          );

          const decryptedEvents = [];
          const batch = writeBatch(db);
          let needsCleanup = false;

          for (const document of snapshot.docs) {
            const data = document.data();

            if (data.ownerId === currentUser.id) {
              const staleParticipants = data.participants.filter(
                (pId) =>
                  pId !== currentUser.id && !activeFriendIds.includes(pId),
              );
              if (staleParticipants.length > 0) {
                const updateData = {};
                let updatedParticipants = [...data.participants];
                staleParticipants.forEach((staleId) => {
                  updatedParticipants = updatedParticipants.filter(
                    (id) => id !== staleId,
                  );
                  updateData[`keys.${staleId}`] = deleteField();
                });
                updateData.participants = updatedParticipants;
                batch.update(document.ref, updateData);
                needsCleanup = true;
              }
            } else {
              if (!activeFriendIds.includes(data.ownerId)) {
                continue;
              }
            }

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
                if (
                  !isBase64(myKeyData.encrypted_event_key) ||
                  !isBase64(myKeyData.ephemeral_public_key) ||
                  !isBase64(myKeyData.shared_iv) ||
                  !isBase64(myKeyData.hkdf_salt)
                ) {
                  devLog(
                    "SUBSCRIBE",
                    `Malformed shared key slot for event ${document.id}`,
                  );
                  continue;
                }
                try {
                  const ephemeralPubKey = await crypto.subtle.importKey(
                    "spki",
                    base64ToArrayBuffer(myKeyData.ephemeral_public_key),
                    { name: "X25519" },
                    false,
                    [],
                  );
                  const sharedSecret = await crypto.subtle.deriveBits(
                    { name: "X25519", public: ephemeralPubKey },
                    currentUser.privateKey,
                    256,
                  );
                  const sharedAesKey = await deriveHKDFAesKey(
                    sharedSecret,
                    base64ToArrayBuffer(myKeyData.hkdf_salt),
                  );
                  eventKeyRaw = await crypto.subtle.decrypt(
                    {
                      name: "AES-GCM",
                      iv: base64ToArrayBuffer(myKeyData.shared_iv),
                    },
                    sharedAesKey,
                    base64ToArrayBuffer(myKeyData.encrypted_event_key),
                  );
                } catch (err) {
                  devLog(
                    "SUBSCRIBE",
                    `ECDH decrypt failed for event ${document.id}`,
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

              const eventPlaintext = await decryptJson(
                eventKey,
                data.encrypted_event_data,
                data.event_data_iv,
              );

              decryptedEvents.push({
                ...eventPlaintext,
                id: document?.id,
                group_id: data?.group_id,
                isShared: data?.ownerId !== currentUser.id,

                timeRange: {
                  start: eventPlaintext?.timeRange?.start,
                  end: eventPlaintext?.timeRange?.end,
                },

                created_at: data?.created_at,
                ownerId: data?.ownerId,
                participants: data?.participants,
              });
            } catch (decryptError) {
              devLog(
                "SUBSCRIBE",
                `Event ${document.id} decryption failed`,
                decryptError,
              );
            }
          }

          if (needsCleanup) await batch.commit();

          onEventsUpdate({ success: true, events: decryptedEvents });
        } catch (error) {
          devLog("SUBSCRIBE", "Snapshot handler threw", error);
          onEventsUpdate({ success: false, error: "Could not load events." });
        }
      },
      (error) => {
        devLog("SUBSCRIBE", "onSnapshot error", error);
        onEventsUpdate({ success: false, error: "Event stream disconnected." });
      },
    );
  }

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

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
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

async function deriveHKDFAesKey(sharedSecret, salt) {
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    { name: "HKDF" },
    false,
    ["deriveKey"],
  );

  return await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt,
      info: new Uint8Array(0),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
