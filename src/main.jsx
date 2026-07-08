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
import { UserSettingsProvider } from "./contexts/UserSettingsContext";
import { EventSheetProvider } from "./contexts/EventSheetContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <UserSettingsProvider>
          <TimeProvider>
            <NotificationProvider>
              <InfoProvider>
                <PopupProvider>
                  <EventSheetProvider>
                    <App />
                  </EventSheetProvider>
                </PopupProvider>
              </InfoProvider>
            </NotificationProvider>
          </TimeProvider>
        </UserSettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
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
