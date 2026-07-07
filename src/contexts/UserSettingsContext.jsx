import { createContext, useContext, useState } from "react";

const UserSettingsContext = createContext();

function UserSettingsProvider({ children }) {
  const [userSettings, setUserSettings] = useState({
    weekStartDay: 6,
    timeFormat: "24h",
    language: "en",
    defaultView: "week",
  });

  return (
    <UserSettingsContext.Provider
      value={{
        userSettings,
        setUserSettings,
      }}
    >
      {children}
    </UserSettingsContext.Provider>
  );
}

function useUserSettings() {
  const context = useContext(UserSettingsContext);

  if (!context) {
    throw new Error(
      "useUserSettings must be used within a UserSettingsProvider",
    );
  }

  return context;
}

export { UserSettingsProvider, useUserSettings };
