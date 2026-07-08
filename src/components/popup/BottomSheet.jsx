import { Sheet } from "react-modal-sheet";

import styles from "./BottomSheet.module.css";

function BottomSheet({
  isOpen,
  onClose,
  children,
  snapPoints = [0, 0.6, 1],
  initialSnap = 2,
}) {
  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      detent="content-height"
      snapPoints={snapPoints}
      initialSnap={initialSnap}
      className={styles.sheet}
    >
      <Sheet.Container className={styles.container} data-event-sheet="true">
        <Sheet.Header className={styles.header} />

        <Sheet.Content className={styles.content} disableDrag={false}>
          {children}
        </Sheet.Content>
      </Sheet.Container>

      <Sheet.Backdrop onTap={onClose} />
    </Sheet>
  );
}

export default BottomSheet;
