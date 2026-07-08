import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import BottomSheet from "../components/popup/BottomSheet";
import AddEditNewEvent from "../pages/calendarPage/components/addEditNewEvent/AddEditNewEvent";

const EventSheetContext = createContext(null);

function EventSheetProvider({ children }) {
  const [sheetState, setSheetState] = useState({
    isOpen: false,
    eventId: null,
  });

  const [childSheetStack, setChildSheetStack] = useState([]);

  const addEditRef = useRef(null);
  const attemptCloseRef = useRef(null);
  const childSheetIdRef = useRef(0);

  const openEventSheet = useCallback(({ eventId, attemptClose }) => {
    attemptCloseRef.current =
      typeof attemptClose === "function" ? attemptClose : null;

    setChildSheetStack([]);

    setSheetState({
      isOpen: true,
      eventId,
    });
  }, []);

  const reopenEventSheet = useCallback(() => {
    setSheetState((current) => {
      if (!current.eventId) return current;

      return {
        ...current,
        isOpen: true,
      };
    });
  }, []);

  const openEventSubSheet = useCallback(
    ({
      content,
      snapPoints = [0, 1],
      initialSnap = 1,
      onBeforeClose = null,
    }) => {
      if (!content) return null;

      const id = ++childSheetIdRef.current;

      setChildSheetStack((current) => [
        ...current,
        {
          id,
          content,
          snapPoints,
          initialSnap,
          onBeforeClose:
            typeof onBeforeClose === "function" ? onBeforeClose : null,
        },
      ]);

      return id;
    },
    [],
  );

  const closeEventSubSheet = useCallback(() => {
    const topSheet = childSheetStack[childSheetStack.length - 1];

    if (!topSheet) return true;

    if (topSheet.onBeforeClose) {
      const result = topSheet.onBeforeClose();

      if (result === false) {
        return false;
      }
    }

    setChildSheetStack((current) => current.slice(0, -1));

    return true;
  }, [childSheetStack]);

  const forceCloseEventSubSheet = useCallback(() => {
    setChildSheetStack((current) => current.slice(0, -1));
  }, []);

  const closeAllEventSubSheets = useCallback(() => {
    setChildSheetStack([]);
  }, []);

  const requestCloseEventSheet = useCallback(() => {
    if (childSheetStack.length > 0) {
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
  }, [childSheetStack.length, closeEventSubSheet]);

  const forceCloseEventSheet = useCallback(() => {
    attemptCloseRef.current = null;

    setChildSheetStack([]);

    setSheetState({
      isOpen: false,
      eventId: null,
    });
  }, []);

  const topChildSheet =
    childSheetStack.length > 0
      ? childSheetStack[childSheetStack.length - 1]
      : null;

  const contextValue = useMemo(
    () => ({
      openEventSheet,
      reopenEventSheet,
      requestCloseEventSheet,
      forceCloseEventSheet,

      isEventSheetOpen: sheetState.isOpen,
      eventSheetId: sheetState.eventId,

      addEditRef,

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

  return (
    <EventSheetContext.Provider value={contextValue}>
      {children}

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

      <BottomSheet
        isOpen={Boolean(topChildSheet)}
        onClose={closeEventSubSheet}
        snapPoints={topChildSheet?.snapPoints || [0, 1]}
        initialSnap={topChildSheet?.initialSnap ?? 1}
      >
        {topChildSheet?.content}
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
