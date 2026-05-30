import styles from "./LoginTopNav.module.css";
import { WebsiteIcon } from "../../assets/icons/Icon";
import CustomButton from "../button/Button";
import { useTime } from "../../contexts/TimeContext";

export function LoginTopNav() {
  const { websiteTitle } = useTime();
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
