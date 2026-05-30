import styles from "./TopNav.module.css";
import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import {
  CalendarIcon,
  ClockIcon,
  HomeIcon,
  WeatherSunnyIcon,
} from "../../assets/icons/Icon";
import { CalendarNavControlls } from "../../pages/calendarPage/CalendarPage";
import { ToDoNavControlls } from "../../pages/toDoPage/ToDoPage";
function TopNav() {
  const location = useLocation();
  const [activePage, setActivePage] = useState(location.pathname);

  useEffect(() => {
    setActivePage(location.pathname);
  }, [location.pathname]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const [is24HourFormat, setIs24HourFormat] = useState(false);

  const lastClickTime = useRef(0);

  function toggleFullScreen() {
    if (
      !document.fullscreenElement &&
      !document.mozFullScreenElement &&
      !document.webkitFullscreenElement &&
      !document.msFullscreenElement
    ) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      } else if (document.documentElement.mozRequestFullScreen) {
        document.documentElement.mozRequestFullScreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen();
      } else if (document.documentElement.msRequestFullscreen) {
        document.documentElement.msRequestFullscreen();
      } else {
        console.error("Fullscreen API is not supported.");
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  }

  const handleDoubleClick = () => {
    const currentTime = new Date().getTime();
    if (currentTime - lastClickTime.current <= 300) {
      toggleFullScreen();
      lastClickTime.current = 0;
    } else {
      lastClickTime.current = currentTime;
    }
  };

  return (
    <div className={styles.topNav}>
      <div className={styles.left}>
        <div className={styles.pageTitle} onClick={handleDoubleClick}>
          {activePage === "/" && "Home"}
          {activePage.startsWith("/calendar") && "Calendar"}
          {activePage.startsWith("/to-do") && "To Do"}
          {activePage.startsWith("/notes") && "Notes"}
          {activePage.startsWith("/games") && "Games"}
          {activePage.startsWith("/time") && "Time"}
          {activePage.startsWith("/money") && "Money"}
          {activePage.startsWith("/settings") && "Settings"}
        </div>
        <div className={styles.pageIcon}>
          {activePage === "/" && <HomeIcon />}
          {activePage.startsWith("/calendar") && <CalendarIcon active={true} />}
          {/* {activePage.startsWith("/to-do") && <ToDoIcon />}
          {activePage.startsWith("/notes") && <NotesIcon />}
          {activePage.startsWith("/games") && <GamesIcon />}
          {activePage.startsWith("/time") && <TimeIcon />}
          {activePage.startsWith("/money") && <MoneyIcon />}
          {activePage.startsWith("/settings") && <SettingsIcon />} */}
        </div>
      </div>
      <div className={styles.pageComponent}>
        {activePage.startsWith("/calendar") && <CalendarNavControlls />}
        {activePage.startsWith("/to-do") && <ToDoNavControlls />}
      </div>
      <div className={styles.right}>
        <div className={styles.time}>
          <ClockIcon />
          <span>
            {currentTime.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              hour12: !is24HourFormat,
            })}
          </span>
        </div>
        <div className={styles.weather}>
          <WeatherSunnyIcon size={48} />
          <span>25°C</span>
        </div>
      </div>
    </div>
  );
}

export default TopNav;
