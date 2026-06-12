import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../../../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  getDoc,
  onSnapshot,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { useData } from "../../contexts/AuthContext";
import { useNotification } from "../../contexts/NotificationContext";
import styles from "./ProfilePage.module.css";
import CustomButton from "../../components/button/Button";
import Loading from "../../components/loading/Loading";
import { SearchIcon, CheckMarkIcon, CloseIcon } from "../../assets/icons/Icon";
import defaultAvatar from "../../assets/svg/user-avatar.svg";
export default function ProfilePage() {
  const { username: urlUsername } = useParams();
  const username = urlUsername?.startsWith("@")
    ? urlUsername.slice(1)
    : urlUsername;
  const navigate = useNavigate();

  const { currentUser, shareVisibleEventsWithFriend, revokeFriendAccess } =
    useData();
  const { notify } = useNotification();

  const isOwnProfile = !username || username === currentUser.username;
  const [targetUser, setTargetUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [friendStatus, setFriendStatus] = useState("none");
  const [friendshipDocId, setFriendshipDocId] = useState(null);
  const [friendsSince, setFriendsSince] = useState(null);

  const [myFriends, setMyFriends] = useState([]);
  const [myNotifications, setMyNotifications] = useState([]);
  const debounceRef = useRef(null);

  // --- 1. SEARCH LOGIC ---
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const usersRef = collection(db, "users");
        const q = query(
          usersRef,
          where("username", ">=", searchQuery),
          where("username", "<=", searchQuery + "\uf8ff"),
        );
        const snapshot = await getDocs(q);
        const results = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          results.push({
            id: doc.id,
            username: data.username,
            displayName: data.displayName,
            pfpUrl: data.pfpUrl || defaultAvatar,
          });
        });
        setSearchResults(results.filter((u) => u.id !== currentUser.id));
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setIsSearching(false);
      }
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, currentUser.id]);

  // --- 2. LOAD TARGET PROFILE ---
  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      try {
        if (isOwnProfile) {
          setTargetUser(currentUser);
        } else {
          const usersRef = collection(db, "users");
          const q = query(usersRef, where("username", "==", username));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            setTargetUser({
              id: snapshot.docs[0].id,
              username: data.username,
              displayName: data.displayName,
              pfpUrl: data.pfpUrl || defaultAvatar,
              created_at: data.created_at,
              publicKey: data.publicKey,
            });
          }
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
      }
      setLoading(false);
    }
    loadProfile();
  }, [username, currentUser, isOwnProfile]);

  // --- 3. FAST REAL-TIME FRIENDSHIPS ---
  useEffect(() => {
    if (!currentUser?.id) return;

    const friendsRef = collection(db, "friendships");
    const q = query(
      friendsRef,
      where("users", "array-contains", currentUser.id),
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        let foundStatus = "none";
        let foundDocId = null;
        let foundFriendsSince = null;

        // 1. SYNCHRONOUS PASS: Update the UI for the specific target user IMMEDIATELY
        if (targetUser) {
          for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            if (data.users.includes(targetUser.id)) {
              foundDocId = docSnap.id;
              if (data.status === "accepted") {
                foundStatus = "friends";
                foundFriendsSince = data.created_at;
              } else if (data.status === "pending") {
                foundStatus =
                  data.action_user === currentUser.id
                    ? "pending_sent"
                    : "pending_received";
              }
              break;
            }
          }
          setFriendStatus(foundStatus);
          setFriendshipDocId(foundDocId);
          setFriendsSince(foundFriendsSince);
        }

        // 2. ASYNCHRONOUS PASS: Fetch data for the dashboard side-lists
        if (isOwnProfile) {
          const friends = [];
          const notifications = [];

          const userPromises = snapshot.docs.map(async (document) => {
            const data = document.data();
            const otherUserId = data.users.find((id) => id !== currentUser.id);

            if (otherUserId) {
              const userDoc = await getDoc(doc(db, "users", otherUserId));
              if (userDoc.exists()) {
                const otherUserData = { id: userDoc.id, ...userDoc.data() };
                if (data.status === "accepted") {
                  friends.push(otherUserData);
                } else if (
                  data.status === "pending" &&
                  data.action_user !== currentUser.id
                ) {
                  notifications.push({
                    docId: document.id,
                    user: otherUserData,
                    type: "friend_request",
                  });
                }
              }
            }
          });

          await Promise.all(userPromises);
          setMyFriends(friends);
          setMyNotifications(notifications);
        }
      },
      (error) => {
        console.error("Realtime friendship error:", error);
      },
    );

    return () => unsubscribe();
  }, [currentUser, targetUser, isOwnProfile]);

  // --- 4. OPTIMISTIC UI ACTIONS ---
  const sendFriendRequest = async () => {
    const previousStatus = friendStatus;
    try {
      setFriendStatus("pending_sent");
      const newDocRef = doc(collection(db, "friendships"));
      setFriendshipDocId(newDocRef.id);

      await setDoc(newDocRef, {
        users: [currentUser.id, targetUser.id],
        status: "pending",
        action_user: currentUser.id,
        created_at: new Date().toISOString(),
      });

      notify({
        id: "req-sent",
        type: "success",
        message: "Friend request sent!",
      });
    } catch (error) {
      setFriendStatus(previousStatus);
      setFriendshipDocId(null);
      notify({
        id: "req-err",
        type: "error",
        message: "Failed to send request.",
      });
    }
  };

  const acceptFriendRequest = async (docIdToAccept = friendshipDocId) => {
    const previousStatus = friendStatus;
    try {
      if (!isOwnProfile) setFriendStatus("friends");
      setMyNotifications((prev) =>
        prev.filter((n) => n.docId !== docIdToAccept),
      );

      await updateDoc(doc(db, "friendships", docIdToAccept), {
        status: "accepted",
        created_at: new Date().toISOString(),
      });

      notify({
        id: "friend-accept",
        type: "success",
        message: "Friend request accepted!",
      });
    } catch (error) {
      if (!isOwnProfile) setFriendStatus(previousStatus);
      notify({
        id: "friend-err",
        type: "error",
        message: "Failed to accept request.",
      });
    }
  };

  const removeFriendOrCancel = async (docIdToRemove = friendshipDocId) => {
    const previousStatus = friendStatus;
    try {
      if (!isOwnProfile) {
        setFriendStatus("none");
        setFriendshipDocId(null);
      }
      setMyNotifications((prev) =>
        prev.filter((n) => n.docId !== docIdToRemove),
      );

      if (previousStatus === "friends") {
        await revokeFriendAccess(targetUser.id);
      }
      await deleteDoc(doc(db, "friendships", docIdToRemove));

      notify({
        id: "friend-removed",
        type: "info",
        message: "Friend removed.",
      });
    } catch (error) {
      if (!isOwnProfile) setFriendStatus(previousStatus);
      notify({
        id: "friend-rem-err",
        type: "error",
        message: "Failed to remove friend.",
      });
    }
  };

  const handleShareEvents = async () => {
    try {
      notify({
        id: "share-load",
        type: "loading",
        message: "Sharing events...",
        duration: 2000,
      });

      const res = await shareVisibleEventsWithFriend(
        targetUser.id,
        targetUser.publicKey,
      );
      if (!res.success) throw new Error(res.error);

      notify({
        id: "share-success",
        type: "success",
        message: "Your events are now shared!",
      });
    } catch (error) {
      notify({
        id: "share-err",
        type: "error",
        message: "Failed to share events.",
      });
    }
  };

  const handleStopSharing = async () => {
    try {
      notify({
        id: "unshare-load",
        type: "loading",
        message: "Revoking access...",
        duration: 2000,
      });

      const res = await revokeFriendAccess(targetUser.id);
      if (!res.success) throw new Error(res.error);

      notify({
        id: "unshare-success",
        type: "success",
        message: "Access revoked.",
      });
    } catch (error) {
      notify({
        id: "unshare-err",
        type: "error",
        message: "Failed to revoke access.",
      });
    }
  };

  if (loading)
    return (
      <div className={styles.loader}>
        <Loading />
      </div>
    );
  if (!targetUser)
    return (
      <div className={styles.notFound}>
        <h2>User not found</h2>
      </div>
    );

  return (
    <div className={`${styles.profilePage} default-scrollbar`}>
      <div className={styles.leftColumn}>
        <div className={styles.searchSection}>
          <div className={styles.searchInput}>
            <SearchIcon />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {searchQuery && (
            <div className={styles.searchResults}>
              {isSearching ? (
                <p className={styles.searchHint}>Searching...</p>
              ) : searchResults.length > 0 ? (
                searchResults.map((u) => (
                  <div
                    key={u.id}
                    className={styles.searchItem}
                    onClick={() => {
                      setSearchQuery("");
                      navigate(`/profile/@${u.username}`);
                    }}
                  >
                    <img src={u.pfpUrl || defaultAvatar} alt={u.username} />
                    <div className={styles.searchItemText}>
                      <p>{u.displayName}</p>
                      <span>@{u.username}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className={styles.searchHint}>No users found.</p>
              )}
            </div>
          )}
        </div>

        {isOwnProfile && (
          <div className={styles.notificationsSection}>
            <h3>Notifications</h3>
            {myNotifications.length === 0 ? (
              <p className={styles.emptyText}>No new notifications.</p>
            ) : (
              myNotifications.map((noti) => (
                <div key={noti.docId} className={styles.notificationCard}>
                  <img src={noti.user.pfpUrl || defaultAvatar} alt="" />
                  <div className={styles.notiInfo}>
                    <p>
                      <strong>{noti.user.displayName}</strong> wants to connect!
                    </p>
                    <div className={styles.notiActions}>
                      <CustomButton
                        ClickEffect="scale"
                        className={`default ${styles.acceptBtn}`}
                        onClick={() => acceptFriendRequest(noti.docId)}
                      >
                        <CheckMarkIcon /> Accept
                      </CustomButton>
                      <CustomButton
                        ClickEffect="scale"
                        className={`default ${styles.declineBtn}`}
                        onClick={() => removeFriendOrCancel(noti.docId)}
                      >
                        <CloseIcon />
                      </CustomButton>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className={styles.rightColumn}>
        <div className={styles.profileCard}>
          <img
            src={targetUser.pfpUrl || defaultAvatar}
            alt="Profile"
            className={styles.pfp}
          />
          <h2>{targetUser.displayName}</h2>
          <p className={styles.username}>@{targetUser.username}</p>
          <p className={styles.joinDate}>
            Joined{" "}
            {new Date(targetUser.created_at || Date.now()).toLocaleDateString(
              "en-US",
              { month: "long", year: "numeric" },
            )}
          </p>

          {!isOwnProfile && (
            <div className={styles.actionButtons}>
              {friendStatus === "none" && (
                <CustomButton
                  ClickEffect="scaleDown"
                  className={`default ${styles.primaryBtn}`}
                  onClick={sendFriendRequest}
                >
                  Add Friend
                </CustomButton>
              )}
              {friendStatus === "pending_sent" && (
                <CustomButton
                  ClickEffect="scaleDown"
                  className={`default ${styles.secondaryBtn}`}
                  onClick={() => removeFriendOrCancel()}
                >
                  Cancel Request
                </CustomButton>
              )}
              {friendStatus === "pending_received" && (
                <CustomButton
                  ClickEffect="scaleDown"
                  className={`default ${styles.primaryBtn}`}
                  onClick={() => acceptFriendRequest()}
                >
                  Accept Request
                </CustomButton>
              )}
              {friendStatus === "friends" && (
                <div className={styles.friendsContainer}>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <CustomButton
                      ClickEffect="scaleDown"
                      className={`default ${styles.primaryBtn}`}
                      onClick={handleShareEvents}
                    >
                      Share My Events
                    </CustomButton>
                    <CustomButton
                      ClickEffect="scaleDown"
                      className={`default ${styles.secondaryBtn}`}
                      onClick={handleStopSharing}
                    >
                      Stop Sharing
                    </CustomButton>
                  </div>
                  <CustomButton
                    ClickEffect="scaleDown"
                    className={`default ${styles.dangerBtn}`}
                    onClick={() => removeFriendOrCancel()}
                  >
                    Unfriend
                  </CustomButton>
                </div>
              )}
            </div>
          )}
        </div>

        {isOwnProfile && (
          <div className={styles.friendsListSection}>
            <h3>My Friends ({myFriends.length})</h3>
            <div className={styles.friendsGrid}>
              {myFriends.map((friend) => (
                <div
                  key={friend.id}
                  className={styles.friendCard}
                  onClick={() => navigate(`/profile/@${friend.username}`)}
                >
                  <img
                    src={friend.pfpUrl || defaultAvatar}
                    alt={friend.username}
                  />
                  <div>
                    <p>{friend.displayName}</p>
                    <span>@{friend.username}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
