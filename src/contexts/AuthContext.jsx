import { createContext, useContext, useEffect, useState, useRef } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import Loading from "../components/loading/Loading";
import bcrypt from "bcryptjs";

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

const AuthContext = createContext();

function AuthProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activePage, setActivePage] = useState(location.pathname);
  const [currentUser, setCurrentUser] = useState(undefined);
  const [accessToken, setAccessToken] = useState(null);
  const [authStatus, setAuthStatus] = useState(null);
  const isAuthenticatingRef = useRef(false);
  useEffect(() => {
    setActivePage(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (isAuthenticatingRef.current) return;
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const privateDocRef = doc(db, "usersPrivateData", firebaseUser.uid);

          const [userSnap, privateSnap] = await Promise.all([
            getDoc(userDocRef),
            getDoc(privateDocRef),
          ]);

          if (userSnap.exists() && privateSnap.exists()) {
            const userData = { ...userSnap.data(), ...privateSnap.data() };

            const fullUser = {
              id: firebaseUser.uid,
              email: firebaseUser.email,
              ...userData,
            };

            const userWithDek = await attachUserDek(fullUser);

            if (!userWithDek.userDek) {
              console.warn("Device key missing. Logging out for security.");
              await firebaseSignOut(auth);
              setAuthStatus("not_logged_in");
              setCurrentUser(null);
              return;
            }

            // DECRYPT USER DATA ON LOAD
            if (
              privateSnap.data().encrypted_user_data &&
              privateSnap.data().user_data_iv
            ) {
              try {
                userWithDek.userData = await decryptJson(
                  userWithDek.userDek,
                  privateSnap.data().encrypted_user_data,
                  privateSnap.data().user_data_iv,
                );
              } catch (e) {
                console.error("Failed to decrypt user data", e);
                userWithDek.userData = { sharedFriends: [], settings: {} };
              }
            } else {
              userWithDek.userData = { sharedFriends: [], settings: {} };
            }
            setCurrentUser(userWithDek);

            if (userSnap.data().isUserFirstTime) {
              setAuthStatus("first_time_user");
            } else {
              setAuthStatus("done");
            }
          } else {
            setAuthStatus("not_logged_in");
            setCurrentUser(null);
          }
        } catch (error) {
          console.error("Error restoring session:", error);
          setAuthStatus("not_logged_in");
          setCurrentUser(null);
        }
      } else {
        setAuthStatus("not_logged_in");
        setCurrentUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  async function signIn(identifier, password) {
    setAuthStatus("loading");
    isAuthenticatingRef.current = true; // 🔒 Lock the listener
    try {
      let loginEmail = identifier;

      if (!identifier.includes("@")) {
        const usersRef = collection(db, "users");
        const q = query(
          usersRef,
          where("username_lower", "==", identifier.toLowerCase()),
        );
        let querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          const fallbackQ = query(
            usersRef,
            where("username", "==", identifier),
          );
          querySnapshot = await getDocs(fallbackQ);
          if (querySnapshot.empty) {
            setAuthStatus("not_logged_in");
            return { success: false, error: "Username not found." };
          }
        }
        loginEmail = querySnapshot.docs[0].data().email;
      }

      const userCredential = await signInWithEmailAndPassword(
        auth,
        loginEmail,
        password,
      );
      const user = userCredential.user;

      const userDocRef = doc(db, "users", user.uid);
      const privateDocRef = doc(db, "usersPrivateData", user.uid);

      const [userSnap, privateSnap] = await Promise.all([
        getDoc(userDocRef),
        getDoc(privateDocRef),
      ]);

      if (!userSnap.exists() || !privateSnap.exists()) {
        throw new Error("User data not found in database.");
      }

      const isFirstTime = userSnap.data().isUserFirstTime;
      const authDetails = privateSnap.data();

      const pdkSaltBytes = base64ToArrayBuffer(authDetails.pdkSalt);
      const enc = new TextEncoder();
      const passwordBytes = enc.encode(password);

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
          iterations: 100000,
          hash: "SHA-256",
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"],
      );

      const dekCiphertextBytes = base64ToArrayBuffer(authDetails.dekCiphertext);
      const dekIvBytes = base64ToArrayBuffer(authDetails.dekIv);

      const decryptedDekRaw = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: dekIvBytes },
        pdk,
        dekCiphertextBytes,
      );

      const dek = await crypto.subtle.importKey(
        "raw",
        decryptedDekRaw,
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"],
      );

      const privKeyCiphertextBytes = base64ToArrayBuffer(
        authDetails.privateKeyCiphertext,
      );
      const privKeyIvBytes = base64ToArrayBuffer(authDetails.privateKeyIv);

      const decryptedPrivKeyRaw = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: privKeyIvBytes },
        pdk,
        privKeyCiphertextBytes,
      );

      const privateKey = await crypto.subtle.importKey(
        "pkcs8",
        decryptedPrivKeyRaw,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["decrypt"],
      );

      const ivDekPriv = crypto.getRandomValues(new Uint8Array(12));
      const dekEncryptedPrivKey = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: ivDekPriv },
        dek,
        decryptedPrivKeyRaw,
      );

      const { encryptedDek: deviceDekCiphertext, iv: deviceDekIv } =
        await generateDeviceKey(dek);

      await updateDoc(privateDocRef, {
        deviceDekCiphertext,
        deviceDekIv,
        dekEncryptedPrivateKey: arrayBufferToBase64(dekEncryptedPrivKey),
        dekEncryptedPrivateKeyIv: arrayBufferToBase64(ivDekPriv),
      });

      // DECRYPT USER DATA ON SIGN IN
      let userData = { sharedFriends: [], settings: {} };
      if (authDetails.encrypted_user_data && authDetails.user_data_iv) {
        try {
          userData = await decryptJson(
            dek,
            authDetails.encrypted_user_data,
            authDetails.user_data_iv,
          );
        } catch (e) {
          console.error("Failed to decrypt user data", e);
        }
      }

      const userWithDek = {
        id: user.uid,
        email: user.email,
        userDek: dek,
        privateKey: privateKey,
        deviceDekCiphertext,
        deviceDekIv,
        userData, // Attach to user
      };

      setCurrentUser(userWithDek);

      setAuthStatus(isFirstTime ? "first_time_user" : "done");
      if (!isFirstTime) {
        navigate("/");
      }

      return { success: true };
    } catch (error) {
      console.error("Sign in error:", error);
      setAuthStatus("not_logged_in");
      if (error.code === "auth/invalid-credential") {
        return { success: false, error: "Invalid email or password." };
      }
      return { success: false, error: error.message };
    } finally {
      isAuthenticatingRef.current = false;
    }
  }

  async function attachUserDek(user) {
    try {
      const deviceKey_b64 = localStorage.getItem("deviceKey");
      if (!deviceKey_b64) return user;

      if (!user.deviceDekCiphertext || !user.deviceDekIv) return user;

      const dekRaw = await retrieveDEK(
        user.deviceDekCiphertext,
        user.deviceDekIv,
        deviceKey_b64,
      );
      const dekKey = await crypto.subtle.importKey(
        "raw",
        dekRaw instanceof Uint8Array ? dekRaw.buffer : dekRaw,
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"],
      );

      let privateKey = null;
      if (user.dekEncryptedPrivateKey && user.dekEncryptedPrivateKeyIv) {
        try {
          const privCt = base64ToArrayBuffer(user.dekEncryptedPrivateKey);
          const privIv = base64ToArrayBuffer(user.dekEncryptedPrivateKeyIv);
          const privRaw = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: privIv },
            dekKey,
            privCt,
          );
          privateKey = await crypto.subtle.importKey(
            "pkcs8",
            privRaw,
            { name: "RSA-OAEP", hash: "SHA-256" },
            true,
            ["decrypt"],
          );
        } catch (err) {
          console.error("❌ Failed to restore RSA Private Key:", err);
        }
      }

      return { ...user, userDek: dekKey, privateKey: privateKey };
    } catch (err) {
      console.error("❌ Failed to attach keys to user:", err);
      return user;
    }
  }

  async function loginAfterConfirm(data) {
    setCurrentUser(data.user);
    if (data.accessToken) setAccessToken(data.accessToken);
    setAuthStatus("done");
    navigate("/");
  }

  async function signOut() {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setCurrentUser(null);
      setAuthStatus("not_logged_in");
      navigate("/login/sign-in");
    }
  }

  async function checkUsernameAvailability(username) {
    try {
      if (!username || username.trim() === "")
        return { available: false, message: "Username cannot be empty" };
      const q = query(
        collection(db, "users"),
        where("username_lower", "==", username.toLowerCase()),
      );
      const querySnapshot = await getDocs(q);
      return {
        available: querySnapshot.empty,
        message: querySnapshot.empty ? "Available" : "Taken",
      };
    } catch (error) {
      return { available: false, message: "Error checking username" };
    }
  }

  async function updateUserProfile(formData) {
    try {
      if (!currentUser || !currentUser.id)
        return { success: false, error: "Not authenticated" };

      const publicPayload = {};
      const privatePayload = {};

      if (formData.username) {
        publicPayload.username = formData.username;
        publicPayload.username_lower = formData.username.toLowerCase();
      }
      if (formData.displayName)
        publicPayload.displayName = formData.displayName;
      if (formData.displayPicture) {
        publicPayload.pfpUrl = await fileToBase64(formData.displayPicture);
      } else if (formData.pfpUrl) {
        publicPayload.pfpUrl = formData.pfpUrl;
      }
      publicPayload.isUserFirstTime = false;

      if (formData.pin) {
        const { ciphertext, iv } = await encryptWithDEK(
          currentUser.userDek,
          formData.pin,
        );
        privatePayload.pin = ciphertext;
        privatePayload.pin_iv = iv;
      }

      await updateDoc(doc(db, "users", currentUser.id), publicPayload);
      if (Object.keys(privatePayload).length > 0) {
        await updateDoc(
          doc(db, "usersPrivateData", currentUser.id),
          privatePayload,
        );
      }

      setCurrentUser({ ...currentUser, ...publicPayload, ...privatePayload });
      setAuthStatus("done");

      return { success: true, message: "Profile updated successfully" };
    } catch (err) {
      console.error("Error updating profile:", err);
      return { success: false, error: err.message };
    }
  }

  async function updateUserData(newUserData) {
    if (!currentUser || !currentUser.userDek)
      return { success: false, error: "Not authenticated" };
    try {
      const currentData = currentUser.userData || {
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
      console.error("Failed to update user data:", err);
      return { success: false, error: err.message };
    }
  }

  async function generateEventKey() {
    return await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  }

  function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++)
      binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
  }

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  async function derivePDK(password) {
    const passwordBytes = new TextEncoder().encode(password);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const baseKey = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const pdk = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    return { pdk, saltBase64: arrayBufferToBase64(salt) };
  }

  async function generateDEK() {
    return await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  }

  async function generateAsymmetricKeys(pdk) {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"],
    );
    const publicKeyBuffer = await crypto.subtle.exportKey(
      "spki",
      keyPair.publicKey,
    );
    const privateKeyBuffer = await crypto.subtle.exportKey(
      "pkcs8",
      keyPair.privateKey,
    );
    const ivPrivateKey = crypto.getRandomValues(new Uint8Array(12));
    const encryptedPrivateKeyBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ivPrivateKey },
      pdk,
      privateKeyBuffer,
    );
    return {
      keyPair,
      publicKeyBase64: arrayBufferToBase64(publicKeyBuffer),
      encryptedPrivateKeyBase64: arrayBufferToBase64(encryptedPrivateKeyBuffer),
      ivPrivateKeyBase64: arrayBufferToBase64(ivPrivateKey),
    };
  }

  async function encryptDEKWithPDK(dek, pdk) {
    const exportedDEK = await crypto.subtle.exportKey("raw", dek);
    const ivDEK = crypto.getRandomValues(new Uint8Array(12));
    const dekEncryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ivDEK },
      pdk,
      exportedDEK,
    );
    return {
      dekEncryptedBase64: arrayBufferToBase64(dekEncryptedBuffer),
      ivDEKBase64: arrayBufferToBase64(ivDEK),
    };
  }

  async function generateDeviceKey(dek) {
    const deviceKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    const rawDeviceKey = await crypto.subtle.exportKey("raw", deviceKey);
    localStorage.setItem("deviceKey", arrayBufferToBase64(rawDeviceKey));

    const exportedDEK = await crypto.subtle.exportKey("raw", dek);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedDek = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      deviceKey,
      exportedDEK,
    );
    return {
      encryptedDek: arrayBufferToBase64(encryptedDek),
      iv: arrayBufferToBase64(iv),
    };
  }

  async function retrieveDEK(encryptedDEK_b64, iv_b64, deviceKey_b64) {
    const encryptedDEK = Uint8Array.from(atob(encryptedDEK_b64), (c) =>
      c.charCodeAt(0),
    );
    const iv = Uint8Array.from(atob(iv_b64), (c) => c.charCodeAt(0));
    const rawKey = Uint8Array.from(atob(deviceKey_b64), (c) => c.charCodeAt(0));

    const deviceKey = await crypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "AES-GCM" },
      true,
      ["decrypt"],
    );
    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      deviceKey,
      encryptedDEK.buffer,
    );
  }

  async function encryptWithDEK(key, plaintext) {
    const enc = new TextEncoder();
    let data;

    if (typeof plaintext === "string") {
      data = enc.encode(plaintext);
    } else if (
      plaintext instanceof ArrayBuffer ||
      ArrayBuffer.isView(plaintext)
    ) {
      data = plaintext;
    } else if (typeof plaintext === "object") {
      data = enc.encode(JSON.stringify(plaintext));
    } else {
      throw new Error("Unsupported plaintext type for encryption");
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ctBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      data,
    );

    return {
      ciphertext: arrayBufferToBase64(ctBuffer),
      iv: arrayBufferToBase64(iv),
    };
  }

  async function decryptRawBuffer(key, ciphertextB64, ivB64) {
    const ciphertext = base64ToArrayBuffer(ciphertextB64);
    const iv = base64ToArrayBuffer(ivB64);

    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
  }

  async function decryptJson(key, ciphertextB64, ivB64) {
    const decryptedBuffer = await decryptRawBuffer(key, ciphertextB64, ivB64);
    const decodedString = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(decodedString);
  }

  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function registrationFlow(email, password) {
    isAuthenticatingRef.current = true;
    try {
      const { pdk, saltBase64: pdkSalt } = await derivePDK(password);
      const dek = await generateDEK();
      const { dekEncryptedBase64: dekCiphertext, ivDEKBase64: dekIv } =
        await encryptDEKWithPDK(dek, pdk);
      const {
        keyPair,
        publicKeyBase64: publicKey,
        encryptedPrivateKeyBase64: privateKeyCiphertext,
        ivPrivateKeyBase64: privateKeyIv,
      } = await generateAsymmetricKeys(pdk);

      const { encryptedDek: deviceDekCiphertext, iv: deviceDekIv } =
        await generateDeviceKey(dek);

      const privateKeyRaw = await crypto.subtle.exportKey(
        "pkcs8",
        keyPair.privateKey,
      );
      const ivDekPriv = crypto.getRandomValues(new Uint8Array(12));
      const dekEncryptedPrivKey = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: ivDekPriv },
        dek,
        privateKeyRaw,
      );

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        email: email,
        publicKey,
        isUserFirstTime: true,
        createdAt: new Date().toISOString(),
      });

      const initialUserData = { sharedFriends: [], settings: {} };
      const { ciphertext: encryptedUserData, iv: userDataIv } =
        await encryptWithDEK(dek, initialUserData);

      await setDoc(doc(db, "usersPrivateData", user.uid), {
        pdkSalt,
        dekCiphertext,
        dekIv,
        privateKeyCiphertext,
        privateKeyIv,
        deviceDekCiphertext,
        deviceDekIv,
        dekEncryptedPrivateKey: arrayBufferToBase64(dekEncryptedPrivKey),
        dekEncryptedPrivateKeyIv: arrayBufferToBase64(ivDekPriv),
        encrypted_user_data: encryptedUserData,
        user_data_iv: userDataIv,
      });

      return await signIn(email, password);
    } catch (error) {
      console.error("Firebase Registration Error:", error);
      throw error;
    } finally {
      isAuthenticatingRef.current = false; // 🔓 Unlock the listener
    }
  }

  async function addEvent(eventData, onProgress) {
    try {
      if (!currentUser?.id || !currentUser.userDek) {
        throw new Error("User not authenticated or DEK is missing.");
      }

      if (onProgress) onProgress("encrypting");

      const start = eventData.start || eventData.timeRange?.start;
      const end = eventData.end || eventData.timeRange?.end;
      const eventKey = await generateEventKey();

      const eventPlaintext = {
        title: eventData.title || "",
        description: eventData.description || "",
        color: eventData.color || "#FFD4A9",
        emoji: eventData.emoji || "",
        visibility: eventData.visibility || "visible",
        availability: eventData.availability || "busy",
        start,
        end,
        isFullDay: eventData.isFullDay || false,
        recurrence: eventData.recurrence || { type: "NONE" },
        exdate: eventData.exdate || [],
      };

      const { ciphertext: encryptedEventData, iv: eventDataIv } =
        await encryptWithDEK(eventKey, eventPlaintext);
      const rawEventKey = await crypto.subtle.exportKey("raw", eventKey);

      const { ciphertext: encryptedEventKeyOwner, iv: eventKeyIvOwner } =
        await encryptWithDEK(currentUser.userDek, rawEventKey);

      const sharedFriends = currentUser.userData?.sharedFriends || [];

      // Inside addEvent:
      let participants = [currentUser.id];
      let keys = {
        [currentUser.id]: {
          encrypted_event_key: encryptedEventKeyOwner,
          event_key_iv: eventKeyIvOwner,
        },
      };

      if (eventData.visibility === "visible") {
        const sharedFriends = currentUser.userData?.sharedFriends || [];
        for (const friend of sharedFriends) {
          try {
            const friendPubKey = await crypto.subtle.importKey(
              "spki",
              base64ToArrayBuffer(friend.publicKey),
              { name: "RSA-OAEP", hash: "SHA-256" },
              true,
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
            console.error(err);
          }
        }
      }
      // 🔴 2. If SPECIFIC (Only invited friends)
      else if (
        eventData.visibility === "specific" &&
        eventData.invitedFriendsFull?.length > 0
      ) {
        for (const friend of eventData.invitedFriendsFull) {
          try {
            const friendPubKey = await crypto.subtle.importKey(
              "spki",
              base64ToArrayBuffer(friend.publicKey),
              { name: "RSA-OAEP", hash: "SHA-256" },
              true,
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
            console.error(err);
          }
        }
      }

      if (eventData.visibility === "visible" && sharedFriends.length > 0) {
        for (const friend of sharedFriends) {
          try {
            const friendPubKey = await crypto.subtle.importKey(
              "spki",
              base64ToArrayBuffer(friend.publicKey),
              { name: "RSA-OAEP", hash: "SHA-256" },
              true,
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
            console.error("Failed to encrypt event key for friend:", friend.id);
          }
        }
      }

      if (onProgress) onProgress("uploading");
      const newGroupId = eventData.group_id || crypto.randomUUID();
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
          timeRange: { start, end },
          created_at: createdAt,
        },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async function updateEvent(eventData, onProgress) {
    try {
      if (!currentUser?.id || !currentUser.userDek) {
        throw new Error("User not authenticated or DEK is missing.");
      }

      const eventId = eventData.sourceEventId || eventData.id;
      if (!eventId) throw new Error("Missing event ID for update.");

      if (onProgress) onProgress("encrypting");

      const eventRef = doc(db, "events", eventId);
      const eventSnap = await getDoc(eventRef);

      if (!eventSnap.exists()) {
        throw new Error("Event not found in database.");
      }
      const data = eventSnap.data();

      const myKeyData = data.keys[currentUser.id];
      if (!myKeyData)
        throw new Error("You do not have access to this event's key.");

      let eventKeyRaw;
      if (data.ownerId === currentUser.id) {
        eventKeyRaw = await decryptRawBuffer(
          currentUser.userDek,
          myKeyData.encrypted_event_key,
          myKeyData.event_key_iv,
        );
      } else {
        if (!currentUser.privateKey)
          throw new Error("Missing RSA Private Key to update shared event");
        const encryptedKeyBuffer = base64ToArrayBuffer(
          myKeyData.encrypted_event_key,
        );
        eventKeyRaw = await window.crypto.subtle.decrypt(
          { name: "RSA-OAEP" },
          currentUser.privateKey,
          encryptedKeyBuffer,
        );
      }

      const eventKey = await crypto.subtle.importKey(
        "raw",
        eventKeyRaw,
        { name: "AES-GCM" },
        true,
        ["encrypt"],
      );

      const start = eventData.start || eventData.timeRange?.start;
      const end = eventData.end || eventData.timeRange?.end;

      const eventPlaintext = {
        title: eventData.title || "",
        description: eventData.description || "",
        color: eventData.color,
        emoji: eventData.emoji,
        visibility: eventData.visibility,
        availability: eventData.availability,
        start: start,
        end: end,
        isFullDay: eventData.isFullDay,
        recurrence: eventData.recurrence,
        exdate: eventData.exdate || [],
      };

      const { ciphertext, iv } = await encryptWithDEK(eventKey, eventPlaintext);

      const updatePayload = {
        // Force the value to save outside the encryption layer as a raw clean integer
        reminderMinutes: parseInt(eventData.notification, 10) || 0,
        visibility: eventData.visibility,
        encrypted_event_data: ciphertext,
        event_data_iv: iv,
      };

      if (data.ownerId === currentUser.id) {
        let participants = [currentUser.id];
        let keys = {
          [currentUser.id]: data.keys[currentUser.id],
        };

        // 1. Shared with ALL Friends
        if (eventData.visibility === "visible") {
          const sharedFriends = currentUser.userData?.sharedFriends || [];
          for (const friend of sharedFriends) {
            participants.push(friend.id);
            if (!data.keys[friend.id]) {
              try {
                const friendPubKey = await crypto.subtle.importKey(
                  "spki",
                  base64ToArrayBuffer(friend.publicKey),
                  { name: "RSA-OAEP", hash: "SHA-256" },
                  true,
                  ["encrypt"],
                );
                const encryptedForFriend = await crypto.subtle.encrypt(
                  { name: "RSA-OAEP" },
                  friendPubKey,
                  eventKeyRaw,
                );
                keys[friend.id] = {
                  encrypted_event_key: arrayBufferToBase64(encryptedForFriend),
                };
              } catch (e) {
                console.error("Error securing new key for friend");
              }
            } else {
              // Friend already has a key, retain it
              keys[friend.id] = data.keys[friend.id];
            }
          }
        }
        // 2. Shared with SPECIFIC Friends
        else if (
          eventData.visibility === "specific" &&
          eventData.invitedFriendsFull?.length > 0
        ) {
          for (const friend of eventData.invitedFriendsFull) {
            participants.push(friend.id);
            if (!data.keys[friend.id]) {
              try {
                const friendPubKey = await crypto.subtle.importKey(
                  "spki",
                  base64ToArrayBuffer(friend.publicKey),
                  { name: "RSA-OAEP", hash: "SHA-256" },
                  true,
                  ["encrypt"],
                );
                const encryptedForFriend = await crypto.subtle.encrypt(
                  { name: "RSA-OAEP" },
                  friendPubKey,
                  eventKeyRaw,
                );
                keys[friend.id] = {
                  encrypted_event_key: arrayBufferToBase64(encryptedForFriend),
                };
              } catch (e) {
                console.error("Error securing new key for specific friend");
              }
            } else {
              // Friend already has a key, retain it
              keys[friend.id] = data.keys[friend.id];
            }
          }
        }

        // Apply updated lists to the payload
        updatePayload.participants = participants;
        updatePayload.keys = keys;
      }

      if (onProgress) onProgress("uploading");
      await updateDoc(eventRef, updatePayload);

      return { success: true, event: eventData };
    } catch (err) {
      console.error("Update event error:", err);
      return { success: false, error: err.message };
    }
  }

  async function deleteEvent(eventId) {
    try {
      await deleteDoc(doc(db, "events", eventId));
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function deleteSeries(groupId) {
    try {
      const q = query(
        collection(db, "events"),
        where("group_id", "==", groupId),
      );
      const querySnapshot = await getDocs(q);
      const batch = writeBatch(db);
      querySnapshot.forEach((document) => batch.delete(document.ref));
      await batch.commit();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
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
    if (!currentUser || !currentUser.userDek)
      return { success: false, error: "Not authenticated" };
    if (!friendPublicKeyBase64)
      return { success: false, error: "Missing friend public key" };

    try {
      const currentShared = currentUser.userData?.sharedFriends || [];
      if (!currentShared.find((f) => f.id === friendId)) {
        await updateUserData({
          sharedFriends: [
            ...currentShared,
            { id: friendId, publicKey: friendPublicKeyBase64 },
          ],
        });
      }

      const friendPublicKey = await crypto.subtle.importKey(
        "spki",
        base64ToArrayBuffer(friendPublicKeyBase64),
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"],
      );

      const eventsRef = collection(db, "events");
      const q = query(
        eventsRef,
        where("ownerId", "==", currentUser.id),
        where("visibility", "==", "visible"),
      );
      const snapshot = await getDocs(q);

      const batch = writeBatch(db);

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        if (data.keys?.[friendId]) continue;

        const myKey = data.keys[currentUser.id];
        const rawKey = await decryptRawBuffer(
          currentUser.userDek,
          myKey.encrypted_event_key,
          myKey.event_key_iv,
        );
        const encryptedForFriend = await crypto.subtle.encrypt(
          { name: "RSA-OAEP" },
          friendPublicKey,
          rawKey,
        );

        updateParticipantsAndKeys(batch, docSnap.ref, {
          addUserId: friendId,
          keyData: {
            encrypted_event_key: arrayBufferToBase64(encryptedForFriend),
          },
        });
      }

      await batch.commit();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function revokeFriendAccess(friendId) {
    if (!currentUser) return { success: false, error: "Not authenticated" };

    try {
      const currentShared = currentUser.userData?.sharedFriends || [];
      await updateUserData({
        sharedFriends: currentShared.filter((f) => f.id !== friendId),
      });

      const eventsRef = collection(db, "events");
      const q = query(
        eventsRef,
        where("ownerId", "==", currentUser.id),
        where("participants", "array-contains", friendId),
      );
      const snapshot = await getDocs(q);

      const batch = writeBatch(db);

      snapshot.forEach((docSnap) => {
        updateParticipantsAndKeys(batch, docSnap.ref, {
          removeUserId: friendId,
        });
      });

      await batch.commit();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  function subscribeToEvents(onEventsUpdate) {
    if (!currentUser?.id || !currentUser.userDek) return () => {};

    const eventsRef = collection(db, "events");
    const qEvents = query(
      eventsRef,
      where("participants", "array-contains", currentUser.id),
    );

    // 🔴 includeMetadataChanges: true allows us to detect local writes!
    return onSnapshot(
      qEvents,
      { includeMetadataChanges: true },
      async (snapshot) => {
        // 🔴 IF WE TRIGGERED THIS LOCALLY, IGNORE IT!
        // Our UI's optimistic updates already handled it. This prevents the duplication/flicker.
        if (snapshot.metadata.hasPendingWrites) {
          return;
        }

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
              const myKeyData = data.keys[currentUser.id];
              if (!myKeyData) continue;

              let eventKeyRaw;
              if (data.ownerId === currentUser.id) {
                eventKeyRaw = await decryptRawBuffer(
                  currentUser.userDek,
                  myKeyData.encrypted_event_key,
                  myKeyData.event_key_iv,
                );
              } else {
                if (!currentUser.privateKey) continue;
                const encryptedKeyBuffer = base64ToArrayBuffer(
                  myKeyData.encrypted_event_key,
                );
                eventKeyRaw = await crypto.subtle.decrypt(
                  { name: "RSA-OAEP" },
                  currentUser.privateKey,
                  encryptedKeyBuffer,
                );
              }

              const eventKey = await crypto.subtle.importKey(
                "raw",
                eventKeyRaw,
                { name: "AES-GCM" },
                true,
                ["decrypt"],
              );
              const eventPlaintext = await decryptJson(
                eventKey,
                data.encrypted_event_data,
                data.event_data_iv,
              );

              decryptedEvents.push({
                ...eventPlaintext,
                id: document.id,
                group_id: data.group_id,
                isShared: data.ownerId !== currentUser.id,
                timeRange: {
                  start: eventPlaintext.start,
                  end: eventPlaintext.end,
                },
                created_at: data.created_at,
                ownerId: data.ownerId,
                participants: data.participants,
              });
            } catch (decryptError) {
              console.error(
                `Failed to decrypt event ${document.id}:`,
                decryptError,
              );
            }
          }

          if (needsCleanup) await batch.commit();

          onEventsUpdate({ success: true, events: decryptedEvents });
        } catch (error) {
          console.error("Error inside onSnapshot listener", error);
          onEventsUpdate({ success: false, error: error.message });
        }
      },
      (error) => {
        console.error("Listener failed:", error);
        onEventsUpdate({ success: false, error: error.message });
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
        accessToken,
        decryptRawBuffer,
        decryptJson,
        subscribeToEvents,
        shareVisibleEventsWithFriend,
        revokeFriendAccess,
      }}
    >
      {authStatus === null || authStatus === "loading" ? <Loading /> : children}
    </AuthContext.Provider>
  );
}

function useData() {
  return useContext(AuthContext);
}
export { AuthProvider, useData };
