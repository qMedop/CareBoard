import { Sheet } from "react-modal-sheet";

import styles from "./BottomSheet.module.css";
import { useMemo } from "react";

function BottomSheet({
  isOpen,
  onClose,
  onCloseEnd,
  children,
  detent = "default",
  snapPoints,
  initialSnap,
}) {
  const mountPoint = useMemo(() => document.getElementById("root"), []);
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
      data-event-sheet={"true"}
    >
      <Sheet.Container className={styles.container}>
        <Sheet.Header />

        <Sheet.Content className={styles.content}>{children}</Sheet.Content>
      </Sheet.Container>

      <Sheet.Backdrop onTap={onClose} />
    </Sheet>
  );
}

export default BottomSheet;
