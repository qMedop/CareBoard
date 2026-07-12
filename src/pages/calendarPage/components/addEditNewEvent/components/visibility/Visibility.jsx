import { useState } from "react";

import {
  ArrowRightLineIcon,
  EyeClosedIcon,
  StarIcon,
  TwoPersonsIcon,
} from "../../../../../../assets/icons/Icon";
import CustomButton from "../../../../../../components/button/Button";
import CheckboxGroup from "../../../../../../components/checkboxGroup/CheckboxGroup";
import {
  ListChooser,
  ListItem,
} from "../../../../../../components/ListChooser/ListChooser";
import { usePopup } from "../../../../../../contexts/PopupContext";

import styles from "./Visibility.module.css";
import { useTime } from "../../../../../../contexts/TimeContext";

const SPECIFIC_FRIENDS_POPUP_ID = "specific-friends-popup";

function VisibilityPopup({
  eventData,
  updateGlobalState,
  friends,
  closeParent,
}) {
  const { openPopup, closePopup } = usePopup();
  const { defaultAvatarUrl, isMobile } = useTime();
  const [selectedVisibility, setSelectedVisibility] = useState(
    eventData.visibility || "visible",
  );

  const [selectedFriendIds, setSelectedFriendIds] = useState(
    () => eventData.invitedIds || [],
  );

  const handleSelect = (visibility) => {
    setSelectedVisibility(visibility);
    if (!isMobile) {
      updateGlobalState({
        visibility,
      });
    }
  };

  const handleSpecificApply = (selectedIds) => {
    const selectedFriends = friends.filter((friend) =>
      selectedIds.includes(friend.id),
    );

    setSelectedVisibility("specific");
    setSelectedFriendIds(selectedIds);

    updateGlobalState({
      visibility: "specific",
      invitedIds: selectedIds,
      invitedFriendsFull: selectedFriends.map((friend) => ({
        id: friend.id,
        publicKey: friend.publicKey,
      })),
    });

    closePopup(SPECIFIC_FRIENDS_POPUP_ID, true);
  };

  const handleSpecificClick = (event) => {
    event.stopPropagation();

    openPopup(
      "centered",
      () => (
        <SpecificFriendsPopup
          friends={friends}
          initialSelectedIds={selectedFriendIds}
          onApply={handleSpecificApply}
          onCancel={() => closePopup(SPECIFIC_FRIENDS_POPUP_ID, true)}
        />
      ),
      document.body,
      "center",
      null,
      () => true,
      SPECIFIC_FRIENDS_POPUP_ID,
    );
  };
  const handleMobileSubmit = () => {
    updateGlobalState({
      visibility: selectedVisibility,
      invitedIds: selectedVisibility === "specific" ? selectedFriendIds : [],
      invitedFriendsFull:
        selectedVisibility === "specific"
          ? friends
              .filter((friend) => selectedFriendIds.includes(friend.id))
              .map((friend) => ({
                id: friend.id,
                publicKey: friend.publicKey,
              }))
          : [],
    });
    closeParent();
  };
  return (
    <div
      className={`${styles.visibilityPopup} ${styles.optionsPopup} ${styles.addEventPopup}`}
    >
      {isMobile && (
        <div className={styles.popupHeader}>
          <h3 className={styles.header}>Visibility</h3>
          <p className={styles.info}>Choose who can see this event</p>
        </div>
      )}
      <ListChooser
        state={selectedVisibility}
        setState={handleSelect}
        className={styles.listChooser}
      >
        <ListItem className={styles.item} value="visible" label="Friends">
          <div className={styles.itemLeft}>
            <div className={styles.icon}>
              <TwoPersonsIcon active={selectedVisibility === "visible"} />
            </div>

            <p>Friends</p>
          </div>
        </ListItem>

        <ListItem className={styles.item} value="private" label="Private">
          <div className={styles.itemLeft}>
            <div className={styles.icon}>
              <EyeClosedIcon active={selectedVisibility === "private"} />
            </div>

            <p>Private</p>
          </div>
        </ListItem>

        <ListItem
          className={styles.item}
          value="specific"
          label="Specific friends"
        >
          <div className={styles.itemLeft}>
            <div className={styles.icon}>
              <StarIcon active={selectedVisibility === "specific"} />
            </div>

            <div className={styles.selectedFriends}>
              <p>Specific friends</p>

              <div
                className={styles.onlyShareWith}
                onClick={handleSpecificClick}
              >
                {selectedFriendIds.length > 0 ? (
                  <div className={styles.avatarsRow}>
                    {selectedFriendIds.slice(0, 6).map((id, i) => {
                      const friend = friends.find((item) => item.id === id);

                      if (!friend) {
                        return null;
                      }

                      return (
                        <div
                          className={styles.avatar}
                          style={{
                            zIndex: 6 - i,
                            transform: `translateX(${i * -4}px)`,
                          }}
                        >
                          <img
                            key={id}
                            src={defaultAvatarUrl(friend)}
                            alt={friend.displayName || "Friend"}
                          />
                        </div>
                      );
                    })}

                    {selectedFriendIds.length > 3 && (
                      <div className={styles.moreAvatars}>
                        +{selectedFriendIds.length - 3}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className={styles.info}>Click to select</p>
                )}

                <ArrowRightLineIcon size={16} />
              </div>
            </div>
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

function SpecificFriendsPopup({
  friends,
  initialSelectedIds,
  onApply,
  onCancel,
}) {
  const [selected, setSelected] = useState(() => initialSelectedIds || []);

  const items = friends.map((friend) => ({
    id: friend.id,
    label: friend.displayName,
    icon: friend.pfpUrl || "defaultAvatar",
  }));

  return (
    <div className={styles.filterPopup}>
      <div className={styles.filterHeader}>
        <h3>Only share with...</h3>
      </div>

      <div className={styles.filterBody}>
        {friends.length === 0 ? (
          <p className={styles.emptyFriends}>No friends found.</p>
        ) : (
          <CheckboxGroup
            items={items}
            selectedIds={selected}
            onChange={setSelected}
          />
        )}
      </div>

      <div className={styles.filterFooter}>
        <CustomButton onClick={onCancel} className="default">
          Cancel
        </CustomButton>

        <CustomButton
          onClick={() => onApply(selected)}
          className="default primary"
        >
          Apply
        </CustomButton>
      </div>
    </div>
  );
}

export default VisibilityPopup;
