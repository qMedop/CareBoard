import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import styles from "./NotificationContext.module.css";
import { getToken } from "firebase/messaging";
import { arrayUnion, doc, updateDoc } from "firebase/firestore";
import { useData } from "./AuthContext";
import { db, messaging } from "../../firebase";

const NotificationContext = createContext({
  notify: () => {},
  closeNotification: () => {},
});

export function NotificationProvider({ children }) {
  const VAPID_KEY =
    "BEqtHiLbkDbz6T4jQgy5Scp7B6nRHiuY5TOf7cVZpbvBgs-NG25D_6WJZ8yISCe5L7nbiNCrkAWZ9cVbHntCGBw";

  const [notifications, setNotifications] = useState([]);
  const counters = useRef({}); // keep track of timeouts for auto-hide

  const { currentUser, authStatus } = useData();

  const closeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (counters.current[id]) {
      clearTimeout(counters.current[id]);
      delete counters.current[id];
    }
  }, []);

  // n = { id, message, icon, type, duration (optional) }
  const notify = useCallback(
    (n) => {
      setNotifications((prev) => {
        const existingIdx = prev.findIndex((item) => item.id === n.id);

        let newNotif = { ...n };

        if (existingIdx !== -1) {
          // Update existing
          const newList = [...prev];
          newList[existingIdx] = { ...newList[existingIdx], ...n };
          return newList;
        } else {
          // Add new
          return [...prev, newNotif];
        }
      });

      // Handle auto-close resets
      if (counters.current[n.id]) {
        clearTimeout(counters.current[n.id]);
        delete counters.current[n.id];
      }

      // If a specific duration is provided, use it
      if (n.duration) {
        counters.current[n.id] = setTimeout(() => {
          closeNotification(n.id);
        }, n.duration);
      }
      // Otherwise, auto-close EVERYTHING after 3 seconds EXCEPT 'loading'
      else if (n.type !== "loading") {
        counters.current[n.id] = setTimeout(() => {
          closeNotification(n.id);
        }, 3000);
      }
    },
    [closeNotification], // Now properly tracking the dependency
  );
  /* cite: uploaded:NotificationContext.jsx */
  useEffect(() => {
    if (authStatus === "done" && currentUser) {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          navigator.serviceWorker.ready.then((registration) => {
            // =========================================================================
            // SAFEGUARD GATING: Verify if the browser environment explicitly supports Push
            // =========================================================================
            if (!("PushManager" in window) || !messaging) {
              console.warn(
                "Push messaging channels are not supported or available on this platform layout.",
              );
              return; // Gracefully exits on PC desktop browsers instead of throwing a crash!
            }

            getToken(messaging, {
              vapidKey: VAPID_KEY,
              serviceWorkerRegistration: registration,
            })
              .then((currentToken) => {
                if (currentToken) {
                  console.log(
                    "Background Mobile Token Generated:",
                    currentToken,
                  );

                  // Make sure to use currentUser.id instead of uid to align with your user mapping logic
                  const userRef = doc(db, "users", currentUser.id);
                  updateDoc(userRef, {
                    fcmTokens: arrayUnion(currentToken),
                  });
                }
              })
              .catch((err) =>
                console.error("Error retrieving background push token:", err),
              );
          });
        }
      });
    }
  }, [authStatus, currentUser]);
  return (
    <NotificationContext.Provider value={{ notify, closeNotification }}>
      {children}
      <div className={styles.notificationContainer}>
        <AnimatePresence mode="popLayout">
          {notifications.map((n) => (
            <motion.div
              layout
              key={n.id}
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              className={`${styles.notification} ${n.type ? styles[n.type] : ""}`}
            >
              {n.icon && <div className={styles.icon}>{n.icon}</div>}
              <div className={styles.message}>{n.message}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
}

export const useNotification = () => useContext(NotificationContext);
