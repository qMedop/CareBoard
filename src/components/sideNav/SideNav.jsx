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
import defaultAvatar from "../../assets/svg/user-avatar.svg";
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
            <CustomButton
              link={true}
              href={"/"}
              ClickEffect={isMobile ? "scale" : false}
            >
              <HomeIcon active={activePage === "/"} />
            </CustomButton>
          </div>
          <div>
            <CustomButton
              link={true}
              href={"/calendar"}
              ClickEffect={isMobile ? "scale" : false}
            >
              <CalendarIcon active={activePage.startsWith("/calendar")} />
            </CustomButton>
          </div>
          <div>
            <CustomButton
              link={true}
              href={"/to-do"}
              ClickEffect={isMobile ? "scale" : false}
            >
              <ToDoIcon active={activePage.startsWith("/to-do")} />
            </CustomButton>
          </div>
          <div>
            <CustomButton
              link={true}
              href={"/notes"}
              ClickEffect={isMobile ? "scale" : false}
            >
              <NoteIcon active={activePage.startsWith("/notes")} />
            </CustomButton>
          </div>
          {isMobile && (
            <div>
              <CustomButton
                ClickEffect={"scale"}
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
                <CustomButton
                  link={true}
                  href={"/games"}
                  ClickEffect={isMobile ? "scale" : false}
                >
                  <GameIcon active={activePage.startsWith("/games")} />
                </CustomButton>
              </div>
              <div>
                <CustomButton
                  link={true}
                  href={"/time"}
                  ClickEffect={isMobile ? "scale" : false}
                >
                  <TimekIcon active={activePage.startsWith("/time")} />
                </CustomButton>
              </div>
              <div>
                <CustomButton
                  link={true}
                  href={"/money"}
                  ClickEffect={isMobile ? "scale" : false}
                >
                  <MoneyIcon active={activePage.startsWith("/money")} />
                </CustomButton>
              </div>
            </>
          )}
        </div>
      </div>
      {!isMobile && (
        <>
          <div className={styles.bottom}>
            <div className={styles.profile}>
              <CustomButton
                link={true}
                href={"/profile"}
                ClickEffect={isMobile ? "scale" : false}
              >
                <img src={currentUser.pfpUrl || defaultAvatar} alt="" />
              </CustomButton>
            </div>
            <div className={styles.settings}>
              <CustomButton
                link={true}
                href={"/settings"}
                ClickEffect={isMobile ? "scale" : false}
              >
                <SettingsIcon active={activePage.startsWith("/settings")} />
              </CustomButton>
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
          <img src={currentUser.pfpUrl || defaultAvatar} alt="" />
          <p>Profile</p>
        </CustomButton>
      </div>
    </div>
  );
}
export default SideNav;
