import { NavLink, useLocation } from "react-router-dom";
import styles from "./SideNav.module.css";
import {
  CalendarIcon,
  GameIcon,
  HomeIcon,
  MoneyIcon,
  NoteIcon,
  SettingsIcon,
  TimekIcon,
  ToDoIcon,
  WebsiteIcon,
} from "../../assets/icons/Icon";
import { useEffect, useState } from "react";
import { useData } from "../../contexts/AuthContext";
function SideNav() {
  const location = useLocation();
  const { currentUser } = useData();
  const [activePage, setActivePage] = useState(location.pathname);
  useEffect(() => {
    setActivePage(location.pathname);
  }, [location.pathname]);
  return (
    <div className={`${styles.sideNav} box-shadow`}>
      <div className={styles.top}>
        <div className={styles.logo}>
          <NavLink to="/">
            <WebsiteIcon />
          </NavLink>
        </div>
        <div className={styles.menuItems}>
          <div>
            <NavLink to="/">
              <HomeIcon active={activePage === "/"} />
            </NavLink>
          </div>
          <div>
            <NavLink to="/calendar">
              <CalendarIcon active={activePage.startsWith("/calendar")} />
            </NavLink>
          </div>
          <div>
            <NavLink to="/to-do">
              <ToDoIcon active={activePage.startsWith("/to-do")} />
            </NavLink>
          </div>
          <div>
            <NavLink to="/notes">
              <NoteIcon active={activePage.startsWith("/notes")} />
            </NavLink>
          </div>
          <div>
            <NavLink to="/games">
              <GameIcon active={activePage.startsWith("/games")} />
            </NavLink>
          </div>
          <div>
            <NavLink to="/time">
              <TimekIcon active={activePage.startsWith("/time")} />
            </NavLink>
          </div>
          <div>
            <NavLink to="/money">
              <MoneyIcon active={activePage.startsWith("/money")} />
            </NavLink>
          </div>
        </div>
      </div>
      <div className={styles.bottom}>
        <div className={styles.profile}>
          <NavLink to="/profile">
            <img src={currentUser.pfpUrl} alt="" />
          </NavLink>
        </div>
        <div className={styles.settings}>
          <NavLink to="/settings">
            <SettingsIcon active={activePage.startsWith("/settings")} />
          </NavLink>
        </div>
      </div>
    </div>
  );
}

export default SideNav;
