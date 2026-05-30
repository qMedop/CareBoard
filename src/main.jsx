import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { InfoProvider } from "./contexts/infoContext";
import { TimeProvider } from "./contexts/TimeContext";
import { PopupProvider } from "./contexts/PopupContext";
import { NotificationProvider } from "./contexts/NotificationContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <TimeProvider>
          <NotificationProvider>
            <InfoProvider>
              <PopupProvider>
                <App />
              </PopupProvider>
            </InfoProvider>
          </NotificationProvider>
        </TimeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
/* cite: uploaded:src/main.jsx */
// Append this to the bottom of your src/main.jsx file

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Force the scope to the absolute root '/'
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        console.log(
          "PWA Unified Root Service Worker registered successfully:",
          registration.scope,
        );
      })
      .catch((error) => {
        console.error("PWA Service Worker registration failed:", error);
      });
  });
}
