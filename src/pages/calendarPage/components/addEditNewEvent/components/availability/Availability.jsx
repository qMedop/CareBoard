import { useState } from "react";

import { EVENT_AVAILABILITY_OPTIONS } from "../../../../../../constants/constants";
import CustomButton from "../../../../../../components/button/Button";
import {
  ListChooser,
  ListItem,
} from "../../../../../../components/ListChooser/ListChooser";
import { useTime } from "../../../../../../contexts/TimeContext";

import styles from "./Availability.module.css";

function Availability({ eventData, updateGlobalState, closeParent }) {
  const { isMobile } = useTime();
  const [selectedAvailability, setSelectedAvailability] = useState(
    eventData.availability || EVENT_AVAILABILITY_OPTIONS[0],
  );

  const handleSelect = (availability) => {
    setSelectedAvailability(availability);

    if (!isMobile) {
      updateGlobalState({ availability });
      closeParent();
    }
  };

  const handleMobileSubmit = () => {
    updateGlobalState({ availability: selectedAvailability });
    closeParent();
  };

  return (
    <div
      className={`${styles.availabilityPopup} ${styles.optionsPopup} ${styles.addEventPopup}`}
    >
      {isMobile && (
        <div className={styles.popupHeader}>
          <h3 className={styles.header}>Availability</h3>
          <p className={styles.info}>Choose whether you are busy or free</p>
        </div>
      )}

      <ListChooser
        state={selectedAvailability}
        setState={handleSelect}
        className={styles.listChooser}
      >
        <ListItem className={styles.item} value="busy" label="Busy">
          <div className={styles.itemLeft}>
            <div className={`${styles.icon} ${styles.busyIcon}`} />
            <p>Busy</p>
          </div>
        </ListItem>

        <ListItem className={styles.item} value="free" label="Free">
          <div className={styles.itemLeft}>
            <div className={`${styles.icon} ${styles.freeIcon}`} />
            <p>Free</p>
          </div>
        </ListItem>
      </ListChooser>

      {isMobile && (
        <div>
          <CustomButton
            onClick={handleMobileSubmit}
            ClickEffect={"scale"}
            className={` ${styles.confirm}`}
          >
            Confirm
          </CustomButton>
        </div>
      )}
    </div>
  );
}

export default Availability;
