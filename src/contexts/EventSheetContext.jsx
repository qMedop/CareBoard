import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import BottomSheet from "../components/popup/BottomSheet";

import AddEditNewEvent from "../pages/calendarPage/components/addEditNewEvent/AddEditNewEvent";

const EventSheetContext = createContext(null);

/*
 * This should roughly match react-modal-sheet's close animation.
 *
 * Later, if you expose an animation-complete callback from BottomSheet,
 * you can remove this timeout entirely.
 */
const CHILD_SHEET_ANIMATION_MS = 300;

function EventSheetProvider({ children }) {
  /*
   * MAIN EVENT SHEET
   */

  const [sheetState, setSheetState] = useState({
    isOpen: false,
    eventId: null,
  });

  const addEditRef = useRef(null);

  const attemptCloseRef = useRef(null);

  /*
   * CHILD SHEET STACK
   *
   * The stack is navigation history.
   *
   * Example:
   *
   * [
   *   VisibilityPopup,
   *   CustomPopup,
   * ]
   */
  const [childSheetStack, setChildSheetStack] = useState([]);

  /*
   * IMPORTANT:
   *
   * renderedChildSheet is separate from the stack.
   *
   * This allows us to:
   *
   * 1. Keep content mounted during close animation.
   * 2. Mount content BEFORE opening animation.
   * 3. Transition correctly between nested sheets.
   */
  const [renderedChildSheet, setRenderedChildSheet] = useState(null);

  const [isChildSheetOpen, setIsChildSheetOpen] = useState(false);

  const childSheetIdRef = useRef(0);

  const childCloseTimerRef = useRef(null);

  const childOpenFrameRef = useRef(null);

  const childSecondOpenFrameRef = useRef(null);
  const reopenFrameRef = useRef(null);
  const reopenSecondFrameRef = useRef(null);

  /*
   * Prevent duplicate close requests while the sheet
   * is already animating closed.
   */
  const childIsClosingRef = useRef(false);

  /*
   * --------------------------------------------------
   * INTERNAL CHILD SHEET HELPERS
   * --------------------------------------------------
   */

  const clearChildCloseTimer = useCallback(() => {
    if (childCloseTimerRef.current !== null) {
      clearTimeout(childCloseTimerRef.current);

      childCloseTimerRef.current = null;
    }
  }, []);

  const clearChildOpenFrames = useCallback(() => {
    if (childOpenFrameRef.current !== null) {
      cancelAnimationFrame(childOpenFrameRef.current);

      childOpenFrameRef.current = null;
    }

    if (childSecondOpenFrameRef.current !== null) {
      cancelAnimationFrame(childSecondOpenFrameRef.current);

      childSecondOpenFrameRef.current = null;
    }
  }, []);

  const scheduleChildSheetOpen = useCallback(() => {
    clearChildOpenFrames();

    /*
     * Double RAF:
     *
     * Frame 1:
     * React/browser commits the mounted content while closed.
     *
     * Frame 2:
     * isOpen becomes true and the library animates open.
     */
    childOpenFrameRef.current = requestAnimationFrame(() => {
      childOpenFrameRef.current = null;

      childSecondOpenFrameRef.current = requestAnimationFrame(() => {
        childSecondOpenFrameRef.current = null;

        setIsChildSheetOpen(true);
      });
    });
  }, [clearChildOpenFrames]);

  const mountAndOpenChildSheet = useCallback(
    (sheet) => {
      clearChildCloseTimer();
      clearChildOpenFrames();

      childIsClosingRef.current = false;

      /*
       * First render the content closed.
       */
      setIsChildSheetOpen(false);

      setRenderedChildSheet(sheet);

      /*
       * Then open after the browser commits the content.
       */
      scheduleChildSheetOpen();
    },
    [clearChildCloseTimer, clearChildOpenFrames, scheduleChildSheetOpen],
  );

  /*
   * --------------------------------------------------
   * MAIN EVENT SHEET
   * --------------------------------------------------
   */

  const openEventSheet = useCallback(
    ({ eventId, attemptClose }) => {
      attemptCloseRef.current =
        typeof attemptClose === "function" ? attemptClose : null;

      clearChildCloseTimer();
      clearChildOpenFrames();

      childIsClosingRef.current = false;

      setChildSheetStack([]);

      setRenderedChildSheet(null);

      setIsChildSheetOpen(false);

      setSheetState({
        isOpen: true,
        eventId,
      });
    },
    [clearChildCloseTimer, clearChildOpenFrames],
  );

  const reopenEventSheet = useCallback(() => {
    /*
     * Force react-modal-sheet back into a known closed state.
     */
    setSheetState((current) => ({
      ...current,
      isOpen: false,
    }));

    if (reopenFrameRef.current !== null) {
      cancelAnimationFrame(reopenFrameRef.current);
    }

    if (reopenSecondFrameRef.current !== null) {
      cancelAnimationFrame(reopenSecondFrameRef.current);
    }

    reopenFrameRef.current = requestAnimationFrame(() => {
      reopenFrameRef.current = null;

      reopenSecondFrameRef.current = requestAnimationFrame(() => {
        reopenSecondFrameRef.current = null;

        setSheetState((current) => {
          if (!current.eventId) {
            return current;
          }

          return {
            ...current,
            isOpen: true,
          };
        });
      });
    });
  }, []);
  /*
   * --------------------------------------------------
   * OPEN CHILD SHEET
   * --------------------------------------------------
   */

  const openEventSubSheet = useCallback(
    ({
      content,
      snapPoints = [0, 1],
      initialSnap = 1,
      onBeforeClose = null,
    }) => {
      if (!content) {
        return null;
      }

      const id = ++childSheetIdRef.current;

      const newSheet = {
        id,

        content,

        snapPoints,

        initialSnap,

        onBeforeClose:
          typeof onBeforeClose === "function" ? onBeforeClose : null,
      };

      /*
       * FIRST CHILD SHEET
       *
       * No transition needed.
       *
       * Mount closed -> open.
       */
      if (!renderedChildSheet) {
        setChildSheetStack([newSheet]);

        mountAndOpenChildSheet(newSheet);

        return id;
      }

      /*
       * NESTED CHILD SHEET
       *
       * Example:
       *
       * Visibility
       *      ↓
       * Custom popup
       *
       * We must:
       *
       * close current sheet
       * keep current content mounted
       * wait for animation
       * push new sheet
       * mount new sheet closed
       * open new sheet
       */

      if (childIsClosingRef.current) {
        return null;
      }

      childIsClosingRef.current = true;

      clearChildCloseTimer();
      clearChildOpenFrames();

      setIsChildSheetOpen(false);

      childCloseTimerRef.current = setTimeout(() => {
        childCloseTimerRef.current = null;

        setChildSheetStack((current) => [...current, newSheet]);

        mountAndOpenChildSheet(newSheet);
      }, CHILD_SHEET_ANIMATION_MS);

      return id;
    },
    [
      renderedChildSheet,
      mountAndOpenChildSheet,
      clearChildCloseTimer,
      clearChildOpenFrames,
    ],
  );

  /*
   * --------------------------------------------------
   * CLOSE TOP CHILD SHEET
   * --------------------------------------------------
   */

  const closeEventSubSheet = useCallback(() => {
    if (!renderedChildSheet || childIsClosingRef.current) {
      return false;
    }

    if (renderedChildSheet.onBeforeClose) {
      const result = renderedChildSheet.onBeforeClose();

      if (result === false) {
        return false;
      }
    }

    childIsClosingRef.current = true;

    clearChildCloseTimer();
    clearChildOpenFrames();

    /*
     * Start closing.
     *
     * DO NOT remove content yet.
     */
    setIsChildSheetOpen(false);

    childCloseTimerRef.current = setTimeout(() => {
      childCloseTimerRef.current = null;

      setChildSheetStack((current) => {
        if (current.length === 0) {
          setRenderedChildSheet(null);

          childIsClosingRef.current = false;

          return current;
        }

        const nextStack = current.slice(0, -1);

        const previousSheet =
          nextStack.length > 0 ? nextStack[nextStack.length - 1] : null;

        if (!previousSheet) {
          setRenderedChildSheet(null);

          setIsChildSheetOpen(false);

          childIsClosingRef.current = false;

          return nextStack;
        }

        /*
         * Previous child exists.
         *
         * Mount it closed, then animate it back in.
         */
        setRenderedChildSheet(previousSheet);

        setIsChildSheetOpen(false);

        childIsClosingRef.current = false;

        scheduleChildSheetOpen();

        return nextStack;
      });
    }, CHILD_SHEET_ANIMATION_MS);

    return true;
  }, [
    renderedChildSheet,
    clearChildCloseTimer,
    clearChildOpenFrames,
    scheduleChildSheetOpen,
  ]);

  /*
   * --------------------------------------------------
   * FORCE CLOSE TOP CHILD
   * --------------------------------------------------
   *
   * Skips onBeforeClose.
   */

  const forceCloseEventSubSheet = useCallback(() => {
    if (!renderedChildSheet || childIsClosingRef.current) {
      return false;
    }

    childIsClosingRef.current = true;

    clearChildCloseTimer();
    clearChildOpenFrames();

    setIsChildSheetOpen(false);

    childCloseTimerRef.current = setTimeout(() => {
      childCloseTimerRef.current = null;

      setChildSheetStack((current) => {
        const nextStack = current.slice(0, -1);

        const previousSheet =
          nextStack.length > 0 ? nextStack[nextStack.length - 1] : null;

        if (!previousSheet) {
          setRenderedChildSheet(null);

          setIsChildSheetOpen(false);

          childIsClosingRef.current = false;

          return nextStack;
        }

        setRenderedChildSheet(previousSheet);

        setIsChildSheetOpen(false);

        childIsClosingRef.current = false;

        scheduleChildSheetOpen();

        return nextStack;
      });
    }, CHILD_SHEET_ANIMATION_MS);

    return true;
  }, [
    renderedChildSheet,
    clearChildCloseTimer,
    clearChildOpenFrames,
    scheduleChildSheetOpen,
  ]);

  /*
   * --------------------------------------------------
   * CLOSE ALL CHILD SHEETS
   * --------------------------------------------------
   */

  const closeAllEventSubSheets = useCallback(() => {
    clearChildCloseTimer();
    clearChildOpenFrames();

    /*
     * Nothing rendered.
     */
    if (!renderedChildSheet) {
      setChildSheetStack([]);

      setIsChildSheetOpen(false);

      childIsClosingRef.current = false;

      return;
    }

    childIsClosingRef.current = true;

    /*
     * Animate current child out.
     */
    setIsChildSheetOpen(false);

    childCloseTimerRef.current = setTimeout(() => {
      childCloseTimerRef.current = null;

      setChildSheetStack([]);

      setRenderedChildSheet(null);

      setIsChildSheetOpen(false);

      childIsClosingRef.current = false;
    }, CHILD_SHEET_ANIMATION_MS);
  }, [renderedChildSheet, clearChildCloseTimer, clearChildOpenFrames]);

  /*
   * --------------------------------------------------
   * REQUEST MAIN SHEET CLOSE
   * --------------------------------------------------
   */

  const requestCloseEventSheet = useCallback(() => {
    /*
     * If a child is visible, close the child first.
     */
    if (renderedChildSheet) {
      closeEventSubSheet();

      return false;
    }

    const attemptClose = attemptCloseRef.current;

    if (attemptClose) {
      const canClose = attemptClose();

      if (canClose === false) {
        return false;
      }
    }

    setSheetState((current) => ({
      ...current,
      isOpen: false,
    }));

    return true;
  }, [renderedChildSheet, closeEventSubSheet]);

  /*
   * --------------------------------------------------
   * FORCE CLOSE MAIN EVENT SHEET
   * --------------------------------------------------
   */

  const forceCloseEventSheet = useCallback(() => {
    attemptCloseRef.current = null;

    clearChildCloseTimer();
    clearChildOpenFrames();

    childIsClosingRef.current = false;

    setChildSheetStack([]);

    setRenderedChildSheet(null);

    setIsChildSheetOpen(false);

    setSheetState({
      isOpen: false,
      eventId: null,
    });
  }, [clearChildCloseTimer, clearChildOpenFrames]);

  /*
   * --------------------------------------------------
   * CLEANUP
   * --------------------------------------------------
   */

  useEffect(() => {
    return () => {
      if (childCloseTimerRef.current !== null) {
        clearTimeout(childCloseTimerRef.current);
      }

      if (childOpenFrameRef.current !== null) {
        cancelAnimationFrame(childOpenFrameRef.current);
      }

      if (childSecondOpenFrameRef.current !== null) {
        cancelAnimationFrame(childSecondOpenFrameRef.current);
      }
    };
  }, []);

  /*
   * --------------------------------------------------
   * CONTEXT VALUE
   * --------------------------------------------------
   */

  const contextValue = useMemo(
    () => ({
      /*
       * Main editor.
       */

      openEventSheet,

      reopenEventSheet,

      requestCloseEventSheet,

      forceCloseEventSheet,

      isEventSheetOpen: sheetState.isOpen,

      eventSheetId: sheetState.eventId,

      addEditRef,

      /*
       * Child sheets.
       */

      openEventSubSheet,

      closeEventSubSheet,

      forceCloseEventSubSheet,

      closeAllEventSubSheets,

      hasEventSubSheet: childSheetStack.length > 0,

      eventSubSheetDepth: childSheetStack.length,
    }),
    [
      openEventSheet,

      reopenEventSheet,

      requestCloseEventSheet,

      forceCloseEventSheet,

      sheetState.isOpen,

      sheetState.eventId,

      openEventSubSheet,

      closeEventSubSheet,

      forceCloseEventSubSheet,

      closeAllEventSubSheets,

      childSheetStack.length,
    ],
  );

  /*
   * --------------------------------------------------
   * RENDER
   * --------------------------------------------------
   */

  return (
    <EventSheetContext.Provider value={contextValue}>
      {children}

      {/* MAIN EVENT EDITOR */}

      <BottomSheet
        isOpen={sheetState.isOpen}
        onClose={requestCloseEventSheet}
        snapPoints={[0, 1]}
        initialSnap={1}
      >
        {sheetState.eventId && (
          <AddEditNewEvent
            ref={addEditRef}
            eventId={sheetState.eventId}
            onClose={forceCloseEventSheet}
          />
        )}
      </BottomSheet>

      {/* CHILD / NESTED SHEET */}

      <BottomSheet
        isOpen={isChildSheetOpen}
        onClose={closeEventSubSheet}
        snapPoints={renderedChildSheet?.snapPoints || [0, 1]}
        initialSnap={renderedChildSheet?.initialSnap ?? 1}
      >
        {renderedChildSheet?.content}
      </BottomSheet>
    </EventSheetContext.Provider>
  );
}

function useEventSheet() {
  const context = useContext(EventSheetContext);

  if (!context) {
    throw new Error("useEventSheet must be used inside EventSheetProvider.");
  }

  return context;
}

export { EventSheetProvider, useEventSheet };
