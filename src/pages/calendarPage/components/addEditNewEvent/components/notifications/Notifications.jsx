import { useState } from "react";

import { EVENT_NOTIFICATION_OPTIONS } from "../../../../../../constants/constants";
import CustomButton from "../../../../../../components/button/Button";
import CheckboxGroup from "../../../../../../components/checkboxGroup/CheckboxGroup";
import { useTime } from "../../../../../../contexts/TimeContext";
import { formatDurationFromMinutes } from "../../../../../../utils/formatDurationFromMinutes";

import styles from "./Notifications.module.css";

function normalizeNotificationSelection(notification) {
  if (Array.isArray(notification)) {
    return notification.filter((value) => Number.isFinite(Number(value)));
  }

  if (notification === 0 || notification === "0" || notification == null) {
    return [];
  }

  const parsed = Number(notification);
  return Number.isFinite(parsed) ? [parsed] : [];
}

function Notifications({ eventData, updateGlobalState, closeParent }) {
  const { isMobile } = useTime();
  const [selectedNotifications, setSelectedNotifications] = useState(() =>
    normalizeNotificationSelection(eventData.notification),
  );

  const items = EVENT_NOTIFICATION_OPTIONS.map((notification) => ({
    id: notification,
    label: formatDurationFromMinutes(notification),
  }));

  const handleApply = () => {
    updateGlobalState({ notification: selectedNotifications });
    closeParent();
  };

  return (
    <div className={`${styles.notificationsPopup} ${styles.optionsPopup}`}>
      {isMobile && (
        <div className={styles.popupHeader}>
          <h3 className={styles.header}>Notifications</h3>
          <p className={styles.info}>
            Choose one or more reminders before the event starts
          </p>
        </div>
      )}

      <div className={styles.body}>
        <CheckboxGroup
          items={items}
          selectedIds={selectedNotifications}
          onChange={setSelectedNotifications}
        />
      </div>

      <div className={styles.footer}>
        <CustomButton onClick={closeParent} className="default">
          Cancel
        </CustomButton>
        <CustomButton onClick={handleApply} className="default primary">
          Apply
        </CustomButton>
      </div>
    </div>
  );
}

export default Notifications;
