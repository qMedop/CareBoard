// NotesPage.jsx

import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTime } from "../../contexts/TimeContext";
import styles from "./NotesPage.module.css"; // <-- Import CSS Module
import ContentEditable from "../../components/textarea/textarea";
import { usePopup } from "../../contexts/PopupContext";
import {
  ArchiveIecon,
  CheckMarkIcon,
  DropSlashIcon,
  PalletIecon,
  PinIcon,
  PlusIcon,
  PlusInCircleIcon,
  RedoIcon,
  TrashIcon,
  UndoIcon,
} from "../../assets/icons/Icon";
import CustomButton from "../../components/button/Button";
import ConfirmPopup from "../../components/confirmPopup/confirmPopup";

// --- Animation Variants for Cards ---
const cardVariants = {
  initial: { opacity: 0, y: 20, scale: 0.95 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.3, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    y: -20,
    scale: 0.95,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};
// --- Main Notes Page Component ---
function NotesPage() {
  const { notes, setNotes } = useTime();
  const [isArchivedOpen, setIsArchivedOpen] = useState(false);

  const debounceTimeoutRef = useRef(null);
  const debouncedUpdate = useCallback(
    (updatedNote) => {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = setTimeout(() => {
        setNotes((prevNotes) =>
          prevNotes.map((n) => (n.id === updatedNote.id ? updatedNote : n)),
        );
      }, 500);
    },
    [setNotes],
  );

  const { archivedItems, pinnedItems, regularNotes, regularPersons } =
    useMemo(() => {
      const archived = [];
      const unarchived = [];

      for (const note of notes) {
        if (note.archived) archived.push(note);
        else unarchived.push(note);
      }

      const pinned = unarchived
        .filter((n) => n.pinned_at)
        .sort((a, b) => new Date(b.pinned_at) - new Date(a.pinned_at));

      const pinnedIds = new Set(pinned.map((p) => p.id));
      const otherItems = unarchived.filter((n) => !pinnedIds.has(n.id));

      return {
        archivedItems: archived,
        pinnedItems: pinned,
        regularNotes: otherItems.filter((n) => n.type === "normal"),
        regularPersons: otherItems.filter((n) => n.type === "person"),
      };
    }, [notes]);

  const renderItem = (item) => {
    if (item.type === "normal")
      return <Note key={item.id} data={item} onUpdate={debouncedUpdate} />;
    if (item.type === "person")
      return <Person key={item.id} data={item} onUpdate={debouncedUpdate} />;
    return null;
  };

  return (
    <div className={styles.notesPageContainer}>
      {archivedItems.length > 0 && (
        <section className={styles.notesSection}>
          <h2
            className={`${styles.sectionTitle} ${styles.collapsible}`}
            onClick={() => setIsArchivedOpen(!isArchivedOpen)}
          >
            Archived ({archivedItems.length})
            <span
              className={`${styles.chevron} ${
                isArchivedOpen ? styles.open : ""
              }`}
            >
              ›
            </span>
          </h2>
          <AnimatePresence>
            {isArchivedOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className={styles.notesGrid}
              >
                {archivedItems.map(renderItem)}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {pinnedItems.length > 0 && (
        <div className={styles.notesSection}>
          <h2 className={styles.sectionTitle}>Pinned</h2>
          <div className={styles.notesGrid}>
            <AnimatePresence>{pinnedItems.map(renderItem)}</AnimatePresence>
          </div>
        </div>
      )}

      {regularNotes.length > 0 && (
        <div className={styles.notesSection}>
          <h2 className={styles.sectionTitle}>Notes</h2>
          <div className={styles.notesGrid}>
            <AnimatePresence>{regularNotes.map(renderItem)}</AnimatePresence>
          </div>
        </div>
      )}

      {regularPersons.length > 0 && (
        <div className={styles.notesSection}>
          <h2 className={styles.sectionTitle}>People</h2>
          <div className={styles.notesGrid}>
            <AnimatePresence>{regularPersons.map(renderItem)}</AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Enhanced Note Component ---
function Note({ data }) {
  const { openPopup } = usePopup();
  function handleOpenNote(e) {
    openPopup("centered", () => <NoteEditing id={data.id} />, e.currentTarget);
  }
  return (
    <div
      onClick={handleOpenNote}
      className={styles.noteCard}
      style={{ backgroundColor: `${data.color}` }}
    >
      <div className={styles.headder}>
        <h3 className={styles.noteTitle}>{data.title}</h3>
      </div>
      <div className={styles.content}>
        <p className={styles.noteContent}>{data.content}</p>
      </div>
    </div>
  );
}

// --- Enhanced Person Component ---
function Person({ data }) {
  const { openPopup } = usePopup();

  function handleOpenNote(e) {
    openPopup("centered", () => <NoteEditing id={data.id} />, e.currentTarget);
  }
  return (
    <div
      onClick={handleOpenNote}
      className={`${styles.noteCard} ${styles.personCard}`}
      style={{ backgroundColor: `${data.color}` }}
    >
      <div className={styles.title}>
        <h3 className={styles.noteTitle}>{data.title}</h3>
      </div>
      <div className={styles.content}>
        <div className={styles.personFields}>
          {data.fields.map((field, index) => (
            <div key={index} className={styles.field}>
              <p className={styles.noteContent}>
                <span className={styles.fieldKey}>{field.key}</span>
                <span className={styles.fieldseperator}>:</span>
                <span className={styles.fieldValue}>{field.value}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function NoteEditing({ id }) {
  const { notes, setNotes } = useTime();
  const { openPopup, closePopup } = usePopup();

  const data = notes.find((note) => note.id === id);

  // --- State Management ---
  const [currentContent, setCurrentContent] = useState(data?.content || "");
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // --- Helper Function (to keep code DRY) ---
  const updateGlobalNote = useCallback(
    (updatedFields) => {
      const updatedNote = { ...data, ...updatedFields };
      setNotes((prevNotes) =>
        prevNotes.map((note) => (note.id === data.id ? updatedNote : note)),
      );
    },
    [data, setNotes],
  );

  // --- Debounced Save Effect ---
  useEffect(() => {
    if (!data) return;
    if (currentContent === data.content) {
      return;
    }
    const handler = setTimeout(() => {
      setUndoStack((prevStack) => [...prevStack, data.content]);
      setRedoStack([]);
      updateGlobalNote({ content: currentContent });
    }, 500);

    return () => clearTimeout(handler);
  }, [currentContent, data?.content, updateGlobalNote]);

  // --- Undo / Redo Logic ---
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;

    const newUndoStack = [...undoStack];
    const contentToRestore = newUndoStack.pop();

    setRedoStack((prevStack) => [...prevStack, data.content]);
    setUndoStack(newUndoStack);
    setCurrentContent(contentToRestore);
    updateGlobalNote({ content: contentToRestore });
  }, [undoStack, data?.content, updateGlobalNote]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;

    const newRedoStack = [...redoStack];
    const contentToRestore = newRedoStack.pop();

    setUndoStack((prevStack) => [...prevStack, data.content]);
    setRedoStack(newRedoStack);
    setCurrentContent(contentToRestore);
    updateGlobalNote({ content: contentToRestore });
  }, [redoStack, data?.content, updateGlobalNote]);

  // --- Keyboard Shortcut Effect ---
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Use `metaKey` for Command key on macOS
      if (event.ctrlKey || event.metaKey) {
        if (event.key === "z") {
          event.preventDefault(); // Prevent the browser's default undo action
          // Handle Ctrl+Shift+Z as a redo action
          if (event.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        } else if (event.key === "y") {
          event.preventDefault(); // Prevent the browser's default redo action
          handleRedo();
        }
      }
    };

    // Add listener to the whole document
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup: remove the listener when the component unmounts
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleUndo, handleRedo]); // Re-link the listener if handlers change

  if (!data) return null;

  // --- Other Note Handlers ---
  function handleContentChange(newContent) {
    setCurrentContent(newContent);
  }

  function handleTitleChange(newTitle) {
    updateGlobalNote({ title: newTitle });
  }

  function handlePinToggle() {
    updateGlobalNote({
      pinned_at: data.pinned_at ? null : new Date().toISOString(),
    });
  }

  function handleArchiveToggle() {
    updateGlobalNote({ archived: !data.archived });
  }

  function handleChangeColor() {
    /* Your logic here */
  }
  function handleAddtag() {
    /* Your logic here */
  }

  function handleDelete() {
    function onConfirm() {
      closePopup();
      closePopup();
      setTimeout(() => {
        setNotes((prevNotes) =>
          prevNotes.filter((note) => note.id !== data.id),
        );
      }, 200);
    }
    function onCancel() {
      closePopup();
    }
    openPopup("centered", () => (
      <ConfirmPopup
        message={"Are you sure you want to delete this note?"}
        onYes={onConfirm}
        onNo={onCancel}
      />
    ));
  }

  return (
    <div
      className={`${styles.noteEditing} box-shadow`}
      style={{ backgroundColor: `${data?.color}` }}
    >
      <div className={styles.container}>
        <div className={styles.top}>
          <div className={styles.title}>
            <ContentEditable
              value={data?.title}
              onChange={handleTitleChange}
              placeholder="Title"
              className={styles.textInput}
            />
          </div>
          <div className={styles.icon}>
            <CustomButton
              ClickEffect={"scale"}
              onClick={handlePinToggle}
              className={styles.pinButton}
            >
              <PinIcon size={22} active={data.pinned_at !== null} />
            </CustomButton>
          </div>
        </div>
        <div className={styles.bottom}>
          <div className={styles.content}>
            {data.type === "person" ? (
              <PersonFieldsEditor
                fields={data.fields}
                onChange={(updatedFields) =>
                  updateGlobalNote({ fields: updatedFields })
                }
              />
            ) : (
              <ContentEditable
                value={currentContent}
                onChange={handleContentChange}
                placeholder="Content"
                className={styles.textInput}
              />
            )}
          </div>
        </div>
      </div>
      <div className={styles.lastEdited}>
        <span>Edited 5:32PM</span>
      </div>
      <div className={styles.options}>
        <div className={styles.left}>
          <div>
            <CustomButton ClickEffect={"scale"} className={styles.option}>
              <PalletIecon onClick={handleChangeColor} />
            </CustomButton>
          </div>
          <div>
            <CustomButton
              onClick={handleArchiveToggle}
              ClickEffect={"scale"}
              className={styles.option}
            >
              <ArchiveIecon active={data.archived} />
            </CustomButton>
          </div>
          <div>
            <CustomButton
              onClick={handleAddtag}
              ClickEffect={"scale"}
              className={styles.option}
            >
              <PlusInCircleIcon />
            </CustomButton>
          </div>
          <div>
            <CustomButton
              onClick={handleDelete}
              ClickEffect={"scale"}
              className={styles.option}
            >
              <TrashIcon />
            </CustomButton>
          </div>
          <div className={styles.undoRedo}>
            <div>
              <CustomButton
                onClick={handleUndo}
                ClickEffect={"scale"}
                className={styles.option}
                style={{ opacity: undoStack.length === 0 ? 0.6 : 1 }}
                disabled={undoStack.length === 0}
              >
                <UndoIcon />
              </CustomButton>
            </div>
            <div>
              <CustomButton
                onClick={handleRedo}
                ClickEffect={"scale"}
                className={styles.option}
                style={{ opacity: redoStack.length === 0 ? 0.6 : 1 }}
                disabled={redoStack.length === 0}
              >
                <RedoIcon />
              </CustomButton>
            </div>
          </div>
        </div>
        <div className={styles.close}>
          <CustomButton
            onClick={closePopup}
            ClickEffect={"scale"}
            className={`default ${styles.option}`}
          >
            Close
          </CustomButton>
        </div>
      </div>{" "}
    </div>
  );
}
export default NotesPage;

function ColorsPopup({ id }) {
  const { notes, setNotes } = useTime();
  const data = notes.find((note) => note.id === id);
  if (!data) return null;
  const colors = [];
  return (
    <div className={styles.colorsPopupContainer}>
      <div
        className={`${styles.color} ${styles.noColor} ${
          data.color == "" || data.color == null ? styles.selected : ""
        }`}
      >
        <div className={styles.icon}>
          <DropSlashIcon />
        </div>
        <div className={styles.selected}>
          <CheckMarkIcon />
        </div>
      </div>
    </div>
  );
}
function PersonFieldsEditor({ fields, onChange }) {
  const [localFields, setLocalFields] = useState(fields || []);

  const handleKeyChange = (index, newKey) => {
    const updated = [...localFields];
    updated[index].key = newKey;
    setLocalFields(updated);
    onChange(updated);
  };

  const handleValueChange = (index, newValue) => {
    const updated = [...localFields];
    updated[index].value = newValue;
    setLocalFields(updated);
    onChange(updated);
  };

  const handleKeyDown = (e, index, isKeyField) => {
    if (isKeyField && e.key === ":") {
      e.preventDefault();
      // Move focus to value input
      const nextInput = document.querySelector(`[data-field="value-${index}"]`);
      if (nextInput) nextInput.focus();
    }

    if (e.key === "Enter") {
      e.preventDefault();
      // Add new row
      const updated = [...localFields, { key: "", value: "" }];
      setLocalFields(updated);
      onChange(updated);

      // Focus the new row’s key input
      setTimeout(() => {
        const newInput = document.querySelector(
          `[data-field="key-${updated.length - 1}"]`,
        );
        if (newInput) newInput.focus();
      }, 0);
    }
  };

  return (
    <div className={styles.fieldsEditor}>
      {localFields.map((field, index) => (
        <div key={index} className={styles.fieldRow}>
          <input
            type="text"
            value={field.key}
            placeholder="Field name"
            onChange={(e) => handleKeyChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, index, true)}
            data-field={`key-${index}`}
            className={styles.keyInput}
          />
          <span className={styles.separator}>:</span>
          <input
            type="text"
            value={field.value}
            placeholder="Value"
            onChange={(e) => handleValueChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, index, false)}
            data-field={`value-${index}`}
            className={styles.valueInput}
          />
        </div>
      ))}
    </div>
  );
}
