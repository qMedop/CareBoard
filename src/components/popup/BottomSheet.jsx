import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Sheet } from "react-modal-sheet";

import styles from "./BottomSheet.module.css";

const EPSILON = 0.005;

function BottomSheet({
  isOpen,
  onClose,
  onBackdropTap,
  onCloseEnd,
  children,

  snapPoints,
  initialSnap,

  adaptiveSnapPoints = false,

  preferredOpenRatio = 0.7,
  maximumOpenRatio = 0.95,

  detent = "default",
}) {
  const mountPoint = useMemo(() => document.getElementById("root"), []);

  const contentRef = useRef(null);

  const [adaptiveSnaps, setAdaptiveSnaps] = useState([
    0,
    preferredOpenRatio,
    1,
  ]);

  const [adaptiveInitialSnap, setAdaptiveInitialSnap] = useState(1);

  const calculateAdaptiveSnapPoints = useCallback(() => {
    const content = contentRef.current;

    if (!adaptiveSnapPoints || !content) {
      return;
    }

    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

    if (viewportHeight <= 0) {
      return;
    }

    /*
     * Natural content height as a viewport ratio.
     */
    const contentRatio = Math.min(content.scrollHeight / viewportHeight, 1);

    /*
     * The maximum position we WANT the editor to reach.
     */
    const maximumRatio = Math.min(contentRatio, maximumOpenRatio);

    /*
     * Open at 70%, unless the editor itself is shorter.
     */
    const openingRatio = Math.min(preferredOpenRatio, maximumRatio);

    /*
     * react-modal-sheet@5.6.0 requirements:
     *
     * - first point MUST be 0
     * - last point MUST be 1
     * - points MUST be ascending
     */

    /*
     * Short editor:
     *
     * content <= 70vh
     *
     * 0 -------- content -------- 1
     */
    if (maximumRatio <= preferredOpenRatio + EPSILON) {
      setAdaptiveSnaps([0, maximumRatio, 1]);

      /*
       * Open at maximumRatio.
       */
      setAdaptiveInitialSnap(1);

      return;
    }

    /*
     * Taller editor:
     *
     * 0 ---- 70% ---- content/max95 ---- 1
     */
    setAdaptiveSnaps([0, openingRatio, maximumRatio, 1]);

    /*
     * Open at 70%.
     */
    setAdaptiveInitialSnap(1);
  }, [adaptiveSnapPoints, preferredOpenRatio, maximumOpenRatio]);

  useLayoutEffect(() => {
    if (!adaptiveSnapPoints || !isOpen) {
      return;
    }

    calculateAdaptiveSnapPoints();

    const content = contentRef.current;

    if (!content) {
      return;
    }

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            calculateAdaptiveSnapPoints();
          })
        : null;

    observer?.observe(content);

    const handleResize = () => {
      calculateAdaptiveSnapPoints();
    };

    window.addEventListener("resize", handleResize);

    window.visualViewport?.addEventListener("resize", handleResize);

    return () => {
      observer?.disconnect();

      window.removeEventListener("resize", handleResize);

      window.visualViewport?.removeEventListener("resize", handleResize);
    };
  }, [adaptiveSnapPoints, isOpen, calculateAdaptiveSnapPoints]);

  const resolvedSnapPoints = adaptiveSnapPoints ? adaptiveSnaps : snapPoints;

  const resolvedInitialSnap = adaptiveSnapPoints
    ? adaptiveInitialSnap
    : initialSnap;

  return (
    <Sheet
      className={styles.sheet}
      isOpen={isOpen}
      onClose={onClose}
      onCloseEnd={onCloseEnd}
      /*
       * Critical:
       *
       * This prevents the physical sheet from becoming
       * taller than its content.
       */
      detent={adaptiveSnapPoints ? "content-height" : detent}
      snapPoints={resolvedSnapPoints}
      initialSnap={resolvedInitialSnap}
      mountPoint={mountPoint}
      data-event-sheet="true"
    >
      <Sheet.Container className={styles.container}>
        <Sheet.Header />

        <Sheet.Content className={styles.content}>{children}</Sheet.Content>
      </Sheet.Container>

      <Sheet.Backdrop onTap={onBackdropTap ?? onClose} />
    </Sheet>
  );
}

export default BottomSheet;
