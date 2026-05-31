import { NavLink, useLocation } from "react-router-dom";
import styles from "./SideNav.module.css";
import {
  ArrowRightIcon,
  ArrowRightLineIcon,
  CalendarIcon,
  GameIcon,
  HomeIcon,
  MenuDotsHoriantalIcon,
  MoneyIcon,
  NoteIcon,
  SettingsIcon,
  ThreeLinesDashedIcon,
  TimekIcon,
  ToDoIcon,
  WebsiteIcon,
} from "../../assets/icons/Icon";
import { useEffect, useState } from "react";
import { useData } from "../../contexts/AuthContext";
import { useTime } from "../../contexts/TimeContext";
import CustomButton from "../button/Button";
import { usePopup } from "../../contexts/PopupContext";
function SideNav() {
  const location = useLocation();
  const { currentUser } = useData();
  const { isMobile } = useTime();
  const [activePage, setActivePage] = useState(location.pathname);
  const { openPopup, closePopup: closeContextPopup } = usePopup();

  const openMobileMenu = (e) => {
    openPopup("contextual", () => <MobileMenu />, e.currentTarget, "TopRight");
  };

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
          {isMobile && (
            <div>
              <CustomButton
                ClickEffect={false}
                className="default"
                onClick={(e) => {
                  openMobileMenu(e);
                }}
              >
                <ArrowRightLineIcon />
              </CustomButton>
            </div>
          )}
          {!isMobile && (
            <>
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
            </>
          )}
        </div>
      </div>
      {!isMobile && (
        <>
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
        </>
      )}
    </div>
  );
}

function MobileMenu() {
  const [activePage, setActivePage] = useState(location.pathname);
  const { currentUser } = useData();
  return (
    <div className={styles.mobileMoreMenu}>
      <div>
        <CustomButton
          link={true}
          href={"/games"}
          className={"default"}
          ClickEffect={"scale"}
        >
          <GameIcon active={activePage.startsWith("/games")} />
          <p>Games</p>
        </CustomButton>
      </div>
      <div>
        <CustomButton
          link={true}
          href={"/time"}
          className={"default"}
          ClickEffect={"scale"}
        >
          <TimekIcon active={activePage.startsWith("/time")} />
          <p>Time</p>
        </CustomButton>
      </div>
      <div>
        <CustomButton
          link={true}
          href={"/money"}
          className={"default"}
          ClickEffect={"scale"}
        >
          <MoneyIcon active={activePage.startsWith("/money")} />
          <p>Money</p>
        </CustomButton>
      </div>
      <div className={styles.settings}>
        <CustomButton
          link={true}
          href={"/settings"}
          className={"default"}
          ClickEffect={"scale"}
        >
          <SettingsIcon active={activePage.startsWith("/settings")} />
          <p>Settings</p>
        </CustomButton>
      </div>
      <div className={styles.profile}>
        <CustomButton
          link={true}
          href={"/profile"}
          className={"default"}
          ClickEffect={"scale"}
        >
          <img src={currentUser.pfpUrl} alt="" />
          <p>Profile</p>
        </CustomButton>
      </div>
    </div>
  );
}
export default SideNav;
