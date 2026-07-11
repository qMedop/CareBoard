import { useMemo } from "react";
import { Sheet } from "react-modal-sheet";
import styles from "./BottomSheet.module.css";

function BottomSheet({
  isOpen,
  onClose,
  onBackdropTap = onClose,
  onCloseEnd,
  children,
  snapPoints,
  initialSnap,
  detent = "default",
  duration = 0.3,
  ease = "easeInOut",
  headderHeight = "32px",
}) {
  const mountPoint = useMemo(() => document.getElementById("root"), []);

  function handleBackdropTap() {
    onBackdropTap?.();
  }

  return (
    <Sheet
      className={styles.sheet}
      isOpen={isOpen}
      onClose={onClose}
      onCloseEnd={onCloseEnd}
      detent={detent}
      snapPoints={snapPoints}
      initialSnap={initialSnap}
      mountPoint={mountPoint}
      data-event-sheet="true"
      tweenConfig={{
        ease,
        duration,
      }}
    >
      <Sheet.Container className={styles.container}>
        <Sheet.Header
          style={{ "--headderHeight": headderHeight }}
          className={styles.header}
        />

        <Sheet.Content className={styles.content}>{children}</Sheet.Content>
      </Sheet.Container>

      <Sheet.Backdrop onTap={handleBackdropTap} />
    </Sheet>
  );
}

export default BottomSheet;
