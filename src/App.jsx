import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import HomePage from "./pages/homePage/HomePage.jsx";
import TopNav from "./components/topNav/TopNav.jsx";
import { CalendarPage } from "./pages/calendarPage/CalendarPage.jsx";
import { ToDoPage } from "./pages/toDoPage/ToDoPage.jsx";
import NotesPage from "./pages/notesPage/NotesPage.jsx";
import GamesPage from "./pages/gamesPage/GamesPage.jsx";
import MoneyPage from "./pages/moneyPage/MoneyPage.jsx";
import TimePage from "./pages/timePage/TimePage.jsx";
import SettingsPage from "./pages/settingsPage/SettingsPage.jsx";
import NotFoundPage from "./pages/notFoundPage/NotFoundPage.jsx";
import SideNav from "./components/sideNav/SideNav.jsx";
import { useEffect, useState } from "react";
import ConfirmPage from "./pages/confirmPage/Confirm.jsx";
import ProtectedRoute from "./components/protectedRoutes/ProtectedRoute.jsx";
import { useData } from "./contexts/AuthContext.jsx";
import ProfileStart from "./pages/profileStart/ProfileStart.jsx";
import FirstTimeUserRoute from "./components/protectedRoutes/FirstTimeUserRoute.jsx";
import { LoginTopNav } from "./components/LoginTopNav/LoginTopNav.jsx";
import LoginPage from "./pages/loginPage/LoginPage.jsx";
import ProfilePage from "./pages/profilePage/ProfilePage.jsx";

function App() {
  const location = useLocation();
  const [activePage, setActivePage] = useState(location.pathname);

  const { currentUser, authStatus } = useData();
  const showNavs = authStatus === "done" && currentUser;
  const showSNav =
    activePage.startsWith("/login") || activePage.startsWith("/profile-start");

  return (
    <>
      {showSNav && (
        <>
          <LoginTopNav />
        </>
      )}
      {showNavs && (
        <>
          <TopNav />
          <SideNav />
        </>
      )}

      <div
        id="pageContent"
        className={`page-content default-scrollbar ${
          activePage.split("/")[1] || "home"
        }`}
      >
        <Routes>
          <Route path="/login/:mode" element={<LoginPage />} />
          <Route path="/confirm/:token" element={<ConfirmPage />} />

          <Route element={<FirstTimeUserRoute />}>
            <Route path="/profile-start" element={<ProfileStart />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route index element={<HomePage />} />
            <Route
              path="/calendar"
              element={<Navigate to={`/calendar/week/`} replace />}
            />
            <Route path="/calendar/:view" element={<CalendarPage />} />
            <Route
              path="/calendar/:view/:day/:month/:year"
              element={<CalendarPage />}
            />
            <Route path="/to-do" element={<ToDoPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/time" element={<TimePage />} />
            <Route path="/money" element={<MoneyPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route
              path="/login"
              element={<Navigate to={`/login/sign-in/`} replace />}
            />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/:username" element={<ProfilePage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </>
  );
}

export default App;
