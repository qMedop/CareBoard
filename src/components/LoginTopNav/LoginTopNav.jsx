import styles from "./LoginTopNav.module.css";
import { ThreeLinesDashedIcon, WebsiteIcon } from "../../assets/icons/Icon";
import CustomButton from "../button/Button";
import { useTime } from "../../contexts/TimeContext";
import { usePopup } from "../../contexts/PopupContext";

export function LoginTopNav() {
  const { websiteTitle } = useTime();
  const { openPopup } = usePopup();
  const openMenu = (e) => {
    openPopup(
      "contextual",
      () => (
        <div className={`${styles.contextMenu} glassEffect`}>
          <CustomButton ClickEffect={"scale"} link={true} href="/">
            <p>Privacy & security</p>
          </CustomButton>
          <CustomButton ClickEffect={"scale"} link={true} href="/">
            <p>About</p>
          </CustomButton>
          <CustomButton ClickEffect={"scale"} link={true} href="/">
            <p>Contact me</p>
          </CustomButton>
        </div>
      ),
      e.currentTarget,
      "TopRight",
    );
  };
  return (
    <nav className={styles.topNav}>
      <div className={styles.logo}>
        <div className={styles.icon}>
          <WebsiteIcon />
        </div>
      </div>
      <div className={styles.right}>
        <div className={styles.title}>
          <h2 className={styles.titleText}>{websiteTitle}</h2>
        </div>
        <div className={styles.links}>
          <CustomButton
            className={styles.contextMenuBtn}
            ClickEffect={"scale"}
            onClick={openMenu}
          >
            <ThreeLinesDashedIcon />
          </CustomButton>
          <ul className={styles.list}>
            <li>
              <CustomButton ClickEffect={false} link={true} href="/">
                <p>Privacy & security</p>
              </CustomButton>
            </li>
            <li>
              <CustomButton ClickEffect={false} link={true} href="/">
                <p>About</p>
              </CustomButton>
            </li>
            <li>
              <CustomButton ClickEffect={false} link={true} href="/">
                <p>Contact me</p>
              </CustomButton>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}
