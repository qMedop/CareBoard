import styles from "./ToDoPage.module.css";
import CustomButton from "../../components/button/Button";
import {
  AddTaskIcon,
  ArrowDownIcon,
  ArrowRightIcon,
  CalendarAddIcon,
  CheckMarkIcon,
  DetailsIcon,
  MenuDotsVerticalIcon,
  PlusIcon,
  SettingsIcon,
  StarIcon,
  TrashIcon,
} from "../../assets/icons/Icon";
import { useRef, useState, useEffect, useMemo } from "react";
import Textarea from "../../components/textarea/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { DateTime } from "luxon";
import { useTime } from "../../contexts/TimeContext";
import { usePopup } from "../../contexts/PopupContext";
import InputPopup from "../../components/inputPopup/InputPopup";
import ConfirmPopup from "../../components/confirmPopup/confirmPopup";
import ContentEditable from "../../components/textarea/textarea";

function ToDoPage() {
  const { lists, tasks, setTasks } = useTime();
  const handleUpdateTask = (updatedTask) => {
    setTasks(
      tasks.map((task) =>
        task.id === updatedTask.id ? { ...task, ...updatedTask } : task
      )
    );
  };

  const handleAddNewTask = (newTask) => {
    if (newTask.title.trim() !== "") {
      setTasks([...tasks, newTask]);
    }
  };

  const handleDeleteTask = (taskId) => {
    setTasks(tasks.filter((task) => task.id !== taskId));
  };
  useEffect(() => {
    const pageContent = document.getElementById("pageContent");
    if (!pageContent) return;

    let isMouseDown = false;
    let startX = 0;
    let scrollLeft = 0;

    function handleMouseDown(e) {
      // Only left mouse button
      if (e.button !== 0) return;
      isMouseDown = true;
      startX = e.pageX - pageContent.offsetLeft;
      scrollLeft = pageContent.scrollLeft;
      document.body.classList.add("dragging");
    }

    function handleMouseMove(e) {
      if (!isMouseDown) return;
      e.preventDefault();
      const x = e.pageX - pageContent.offsetLeft;
      const walk = x - startX;
      pageContent.scrollLeft = scrollLeft - walk;
    }

    function handleMouseUp() {
      isMouseDown = false;
      document.body.classList.remove("dragging");
    }

    const toDoPageDiv = document.querySelector(`.${styles.toDoPage}`);
    if (!toDoPageDiv) return;

    toDoPageDiv.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      toDoPageDiv.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
    };
  }, []);
  return (
    <div className={`${styles.toDoPage} default-scrollbar `}>
      {lists?.map((list) => {
        const listTasks = tasks.filter((task) => task.task_list_id === list.id);
        return (
          <AnimatePresence key={list.id}>
            {list.view && (
              <motion.div
                key={list.id}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                style={{
                  overflow: "hidden",
                  display: "inline-block",
                  verticalAlign: "top",
                  width: "100%",
                  minWidth: "300px",
                  height: "fit-content",
                }}
                className={styles.tasksComponentAnimate}
              >
                <TasksComponent
                  list={list}
                  tasks={listTasks}
                  onUpdateTask={handleUpdateTask}
                  onAddNewTask={handleAddNewTask}
                  onDeleteTask={handleDeleteTask}
                />
              </motion.div>
            )}
          </AnimatePresence>
        );
      })}
    </div>
  );
}
function TasksComponent({
  list,
  tasks,
  onUpdateTask,
  onAddNewTask,
  onDeleteTask,
}) {
  const [newTask, setNewTask] = useState(null);
  const [isCompletedOpen, setIsCompletedOpen] = useState(false);
  const bottomRef = useRef(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const { openPopup } = usePopup();

  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const handleScroll = () => setIsScrolled(el.scrollTop > 0);
    handleScroll();
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const handleAddTask = () => {
    setNewTask({
      task_list_id: list.id,
      id: Date.now(),
      title: "",
      description: "",
      completed: false,
      started: false,
      created_at: new Date().toISOString(),
      completed_at: null,
      due_date: null,
    });
  };

  const handleNewTaskBlur = (updatedTask) => {
    if (updatedTask.title.trim()) {
      onAddNewTask(updatedTask);
    }
    setNewTask(null);
  };

  // 👇 NEW "FLAT LIST" DATA STRUCTURE FOR SMOOTH ANIMATIONS
  const { renderableItems, completedTasks } = useMemo(() => {
    // 1. Separate completed from incomplete tasks
    const incomplete = tasks.filter((task) => !task.completed);
    const completed = tasks.filter((task) => task.completed);
    completed.sort(
      (a, b) => new Date(b.completed_at) - new Date(a.completed_at)
    );

    if (incomplete.length === 0) {
      return { renderableItems: [], completedTasks: completed };
    }

    const getSectionTitle = (task) => {
      switch (list.sort_by) {
        case "title":
          return "All Tasks";
        case "started":
          return task.started ? "Started" : "Not Started";
        default: {
          // 'date' sorting
          if (!task.due_date) return "No date";
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(new Date().setDate(today.getDate() + 1));
          tomorrow.setHours(0, 0, 0, 0);
          const dueDate = new Date(task.due_date);
          dueDate.setHours(0, 0, 0, 0);

          if (dueDate.getTime() < today.getTime()) return "Past";
          if (dueDate.getTime() === today.getTime()) return "Today";
          if (dueDate.getTime() === tomorrow.getTime()) return "Tomorrow";
          return dueDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
        }
      }
    };
    incomplete.sort((a, b) => {
      const titleA = getSectionTitle(a);
      const titleB = getSectionTitle(b);
      if (titleA !== titleB) {
        if (list.sort_by === "date") {
          const order = ["Past", "Today", "Tomorrow"];
          const aIndex = order.indexOf(titleA);
          const bIndex = order.indexOf(titleB);
          if (aIndex !== -1 || bIndex !== -1) {
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
          }
          if (titleA === "No date") return 1;
          if (titleB === "No date") return -1;
          return new Date(a.due_date) - new Date(b.due_date);
        }
        if (list.sort_by === "started") {
          return titleA === "Started" ? -1 : 1;
        }
      }
      return a.title.localeCompare(b.title);
    });
    const items = [];
    let lastSectionTitle = null;
    incomplete.forEach((task) => {
      const currentSectionTitle = getSectionTitle(task);
      if (currentSectionTitle !== lastSectionTitle) {
        if (list.sort_by !== "title") {
          items.push({ type: "header", id: currentSectionTitle });
        }
        lastSectionTitle = currentSectionTitle;
      }
      items.push({ type: "task", id: task.id, data: task });
    });

    return { renderableItems: items, completedTasks: completed };
  }, [tasks, list.sort_by]);

  function handleTasksEdit(e) {
    e.stopPropagation();
    openPopup(
      "contextual",
      () => <TasksSettings listId={list.id} />,
      e.currentTarget,
      "bottom"
    );
  }
  const headerVariants = {
    initial: { height: 0, opacity: 0 },
    animate: {
      height: "auto",
      opacity: 1,
      transition: { duration: 0.3, ease: "easeInOut" },
    },
    exit: {
      height: 0,
      opacity: 0,
      transition: { duration: 0.3, ease: "easeInOut" },
    },
  };

  return (
    <div
      className={`${styles.tasksComponent} box-shadow ${
        isScrolled ? styles.isScrolled : ""
      }`}
    >
      <div className={styles.top}>
        <div className={styles.topIcon}>
          <span className={styles.icon}></span>
        </div>
        <div className={styles.header}>
          <div className={styles.topInfo}>
            <div className={styles.titleHolder}>
              <div className={styles.title}>
                <p>{list?.title || "My Tasks"}</p>
              </div>
              <div className={styles.settings}>
                <CustomButton onClick={handleTasksEdit} ClickEffect={"scale"}>
                  <MenuDotsVerticalIcon />
                </CustomButton>
              </div>
            </div>
          </div>
          <div className={styles.addTask}>
            <CustomButton
              onClick={handleAddTask}
              ClickEffect={"scale"}
              className="default"
            >
              <div className={styles.icon}>
                <AddTaskIcon />
              </div>
              <div className={styles.text}>
                <p>Add a task</p>
              </div>
            </CustomButton>
          </div>
        </div>
      </div>

      <div ref={bottomRef} className={`default-scrollbar ${styles.bottom}`}>
        <AnimatePresence>
          {newTask && (
            <motion.div
              layout
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, margin: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              <Task
                key={newTask.id}
                task={newTask}
                onUpdateTask={() => {}}
                onBlur={handleNewTaskBlur}
                isNewTask={true}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 👇 RENDER THE FLAT LIST OF HEADERS AND TASKS */}
        <AnimatePresence>
          {renderableItems.map((item, index) =>
            item.type === "header" ? (
              // 👇 2. REMOVE "layout" PROP AND ADD INLINE STYLE
              <motion.div
                key={`${item.id}-${index}`}
                variants={headerVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                style={{ overflow: "hidden" }} // Prevents content spill during animation
                className={`${styles.section} ${
                  item.id.toLowerCase() === "past" ? styles.past : ""
                }`}
              >
                <p className={styles.sectionTitle}>{item.id}</p>
              </motion.div>
            ) : (
              <motion.div
                key={item.id}
                layout // Keep layout here for tasks!
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                style={{ overflow: "hidden" }}
              >
                <Task
                  task={item.data}
                  onUpdateTask={onUpdateTask}
                  onDeleteTask={onDeleteTask}
                />
              </motion.div>
            )
          )}
        </AnimatePresence>

        {/* 👇 Completed Section (Animation already fixed and works well) */}
        <AnimatePresence>
          {completedTasks.length > 0 && (
            <motion.div
              key="completed-section"
              layout
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                transition: { duration: 0.3, when: "afterChildren" },
              }}
              className={styles.completedSection}
            >
              <CustomButton
                ClickEffect={"scale"}
                className={`default ${styles.completedHeader}`}
                onClick={() => setIsCompletedOpen(!isCompletedOpen)}
              >
                <motion.div
                  className={styles.icon}
                  animate={{ rotate: isCompletedOpen ? 90 : 0 }}
                >
                  <ArrowRightIcon />
                </motion.div>
                <p>Completed ({completedTasks.length})</p>
              </CustomButton>
              <AnimatePresence>
                {isCompletedOpen && (
                  <motion.div
                    key="completed-tasks-list"
                    initial="collapsed"
                    animate="open"
                    exit="collapsed"
                    variants={{
                      open: { height: "auto", opacity: 1 },
                      collapsed: { height: 0, opacity: 0 },
                    }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    style={{ overflow: "hidden" }}
                  >
                    <div className={styles.tasks}>
                      <AnimatePresence>
                        {completedTasks.map((task) => (
                          <motion.div
                            key={task.id}
                            layout
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                            style={{ overflow: "hidden" }}
                          >
                            <Task
                              task={task}
                              onUpdateTask={onUpdateTask}
                              onDeleteTask={onDeleteTask}
                            />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
function Task({ task, onUpdateTask, onBlur, isNewTask = false, onDeleteTask }) {
  const [taskState, setTaskState] = useState({
    title: task.title,
    description: task.description,
    completed: task.completed,
    started: task.started,
    isEditing: isNewTask,
  });

  const taskRef = useRef(null);
  const titleInputRef = useRef(null);

  useEffect(() => {
    if (isNewTask && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isNewTask]);

  const handleTitleChange = (e) => {
    const newTitle = e.target.value;
    setTaskState({ ...taskState, title: newTitle });
    if (!isNewTask) {
      onUpdateTask({ ...task, title: newTitle });
    }
  };

  const handleDescriptionChange = (newValue) => {
    setTaskState({ ...taskState, description: newValue });
    if (!isNewTask) {
      onUpdateTask({ ...task, description: newValue });
    }
  };

  const handleTaskCompleted = () => {
    if (isNewTask) return;
    const newCompletedState = !taskState.completed;
    setTaskState({ ...taskState, completed: newCompletedState });
    onUpdateTask({
      ...task,
      completed: newCompletedState,
      completed_at: newCompletedState ? new Date().toISOString() : null,
    });
  };

  const handleTaskStarted = () => {
    const newStartedState = !taskState.started;
    setTaskState({ ...taskState, started: newStartedState });
    onUpdateTask({ ...task, started: newStartedState });
  };

  const handleTaskFocus = (e) => {
    const target = e.target;
    if (target.closest("button") || isNewTask) return;
    setTaskState((prevState) => ({ ...prevState, isEditing: true }));
    if (target.closest(`.${styles.title}`)) {
      taskRef.current.querySelector(`.${styles.taskTitle}`)?.focus();
    }
    if (target.closest(`.${styles.description}`)) {
      taskRef.current.querySelector("textarea")?.focus();
    }
    const handleClickOutside = (e) => {
      if (taskRef.current && !taskRef.current.contains(e.target)) {
        setTaskState((prevState) => ({ ...prevState, isEditing: false }));
        document.removeEventListener("click", handleClickOutside);
      }
    };
    setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 0);
  };

  useEffect(() => {
    if (!isNewTask) return;
    const handleClickOutside = (e) => {
      if (taskRef.current && !taskRef.current.contains(e.target)) {
        onBlur({
          ...task,
          title: taskState.title,
          description: taskState.description,
        });
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isNewTask, taskRef, taskState, onBlur, task]);

  const taskClasses = `${styles.task} ${
    taskState.completed ? styles.completed : ""
  } ${taskState.started ? styles.started : ""} ${
    taskState.isEditing ? styles.editing : ""
  } ${isNewTask ? styles.newTask : ""}`;
  return (
    <div className={taskClasses} onClick={handleTaskFocus} ref={taskRef}>
      <div className={styles.icon}>
        <CustomButton
          onClick={handleTaskCompleted}
          className={`default ${styles.iconBtn}`}
          ClickEffect={"scale"}
        >
          <div className={styles.circle}>
            <span></span>
          </div>
          <div className={styles.check}>
            <CheckMarkIcon />
          </div>
        </CustomButton>
        <div className={styles.effect}>
          <span className={styles.one}></span>
          <span className={styles.two}></span>
          <span className={styles.three}></span>
          <span className={styles.four}></span>
          <span className={styles.five}></span>
          <span className={styles.six}></span>
          <span className={styles.seven}></span>
          <span className={styles.eight}></span>
        </div>
      </div>
      <div className={styles.data}>
        <div className={styles.title}>
          <input
            value={taskState.title}
            onChange={handleTitleChange}
            type="text"
            name="task title"
            className={styles.taskTitle}
            placeholder="Title"
            ref={titleInputRef}
          />
        </div>
        <motion.div
          initial={false}
          animate={{
            height: taskState.isEditing ? "auto" : 28,
            opacity: 1,
          }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          style={{ overflow: "hidden" }}
        >
          <div className={styles.bottom}>
            <div className={styles.description}>
              {taskState.description.length === 0 && <DetailsIcon />}
              <ContentEditable
                readOnly={!taskState.isEditing}
                className={styles.textInput}
                value={taskState.description}
                onChange={handleDescriptionChange}
                placeholder="Details"
              />
            </div>

            <div className={styles.taskTime}>
              <CustomButton
                ClickEffect={"scale"}
                className="default"
                onClick={() => {
                  const today = new Date();
                  today.setUTCHours(0, 0, 0, 0);
                  const iso = today.toISOString();
                  setTaskState((prev) => ({ ...prev, due_date: iso }));
                  if (!isNewTask) {
                    onUpdateTask({ ...task, due_date: iso });
                  }
                }}
              >
                Today
              </CustomButton>
              <CustomButton
                ClickEffect={"scale"}
                className="default"
                onClick={() => {
                  const tomorrow = new Date();
                  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
                  tomorrow.setUTCHours(0, 0, 0, 0);
                  const iso = tomorrow.toISOString();
                  setTaskState((prev) => ({ ...prev, due_date: iso }));
                  if (!isNewTask) {
                    onUpdateTask({ ...task, due_date: iso });
                  }
                }}
              >
                Tomorrow
              </CustomButton>
              <CustomButton ClickEffect={"scale"} className="default">
                <CalendarAddIcon />
              </CustomButton>
            </div>
          </div>
        </motion.div>
      </div>
      <div className={styles.settings}>
        <div className={styles.delete}>
          <CustomButton
            onClick={() => onDeleteTask(task.id)}
            ClickEffect={"scale"}
            className="default"
          >
            <TrashIcon />
          </CustomButton>
        </div>
        <div className={styles.star}>
          <CustomButton
            onClick={handleTaskStarted}
            ClickEffect={"scale"}
            className="default"
          >
            <StarIcon />
          </CustomButton>
        </div>
      </div>
    </div>
  );
}
function ToDoNavControlls() {
  const { openPopup } = usePopup();

  function changeViewType(e) {
    openPopup(
      "contextual",
      () => <ViewTypePopupContent />,
      e.currentTarget,
      "bottom"
    );
  }

  // Get lists from context
  const { lists } = useTime();
  const totalLists = lists.length;
  const shownLists = lists.filter((l) => l.view).length;

  let buttonLabel = "";
  if (shownLists === totalLists) {
    buttonLabel = "All";
  } else if (shownLists === 0) {
    buttonLabel = "None";
  } else {
    buttonLabel = `${shownLists} / ${totalLists} Shown`;
  }

  return (
    <div className={styles.navControls}>
      <CustomButton
        ClickEffect={"scale"}
        onClick={changeViewType}
        className="lineBorder"
        type="list"
      >
        <p>{buttonLabel}</p>
      </CustomButton>
    </div>
  );
}
function ViewTypePopupContent() {
  const { tasks, lists, setLists } = useTime();
  const { openPopup, closePopup } = usePopup();
  function handleCreatingNewList() {
    function onConfirm(newListTitle) {
      setLists((prevLists) => [
        ...prevLists,
        {
          id: Date.now(),
          title: newListTitle,
          view: true,
          is_default: false,
          sort_by: "date",
          created_at: new Date().toISOString(),
        },
      ]);
      closePopup();
    }
    openPopup(
      "centered",
      () => (
        <InputPopup
          header={"Create new list"}
          onConfirm={onConfirm}
          onCancel={closePopup}
        />
      ),
      null
    );
  }
  return (
    <div className={styles.viewPopup}>
      {lists.map((list) => {
        const taskCount = tasks.filter(
          (task) => task.task_list_id === list.id
        ).length;
        return (
          <CustomButton
            ClickEffect="scale"
            className="default"
            key={list.id}
            onClick={() => {
              setLists((prev) =>
                prev.map((l) =>
                  l.id === list.id ? { ...l, view: !l.view } : l
                )
              );
            }}
          >
            <div className={styles.icon}>{list.view && <CheckMarkIcon />}</div>
            <div className={styles.left}>
              <p>{list.title}</p>
              <span>{taskCount}</span>
            </div>
          </CustomButton>
        );
      })}
      <div className={styles.createNewList}>
        <CustomButton
          onClick={handleCreatingNewList}
          ClickEffect="scale"
          className="default"
        >
          <div className={styles.icon}>
            <PlusIcon />
          </div>
          <div className={styles.left}>
            <p>Create new list</p>
          </div>
        </CustomButton>
      </div>
    </div>
  );
}
function TasksSettings({ listId }) {
  const { openPopup, closePopup } = usePopup();
  const { tasks, setLists, lists, setTasks } = useTime();
  const list = lists.find((l) => l.id === listId);
  if (!list) return null;
  const sortingOptions = [
    { label: "Date", value: "date" },
    { label: "Title", value: "title" },
    { label: "Started", value: "started" },
  ];
  const listTasks = tasks.filter((task) => task.task_list_id === list.id);
  function handleChangeListName(e) {
    e.stopPropagation();
    e.preventDefault();
    function onConfirm(newName) {
      setLists((lists) =>
        lists.map((l) => (l.id === list.id ? { ...l, title: newName } : l))
      );
      closePopup();
    }
    openPopup(
      "centered",
      () => (
        <InputPopup
          header={"Rename list"}
          onConfirm={onConfirm}
          onCancel={closePopup}
        />
      ),
      e.currentTarget
    );
  }
  function handleDeleteList(e) {
    e.stopPropagation();
    e.preventDefault();
    if (list.is_default) return;
    function onConfirm() {
      setLists((lists) => lists.filter((l) => l.id !== list.id));
      closePopup();
    }
    function onCancel() {
      closePopup();
    }
    openPopup(
      "centered",
      () => (
        <ConfirmPopup
          message={"Are you sure you want to delete this list?"}
          onYes={onConfirm}
          onNo={onCancel}
        />
      ),
      e.currentTarget
    );
  }
  function handleDeleteCompletedTasks(e) {
    e.stopPropagation();
    e.preventDefault();
    const completedTasks = listTasks.filter((task) => task.completed);
    if (completedTasks.length === 0) return;

    function onConfirm() {
      setTasks((tasks) =>
        tasks.filter(
          (task) => !(task.completed && task.task_list_id === list.id)
        )
      );
      closePopup();
    }
    function onCancel() {
      closePopup();
    }
    openPopup(
      "centered",
      () => (
        <ConfirmPopup
          message={`Are you sure you want to delete all completed tasks? (${completedTasks.length})`}
          onYes={onConfirm}
          onNo={onCancel}
        />
      ),
      e.currentTarget
    );
  }
  function handleDeleteOldTasks(e) {
    e.stopPropagation();
    e.preventDefault();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oldTasks = listTasks.filter(
      (task) =>
        task.due_date &&
        new Date(task.due_date).setHours(0, 0, 0, 0) < today.getTime()
    );
    if (oldTasks.length === 0) return;

    function onConfirm() {
      setTasks((tasks) =>
        tasks.filter(
          (task) =>
            !(task.due_date && new Date(task.due_date) < today) ||
            task.task_list_id !== list.id
        )
      );
      closePopup();
    }
    function onCancel() {
      closePopup();
    }
    openPopup(
      "centered",
      () => (
        <ConfirmPopup
          message={`Are you sure you want to delete all old tasks? (${oldTasks.length})`}
          onYes={onConfirm}
          onNo={onCancel}
        />
      ),
      e.currentTarget
    );
  }
  const hasCompletedTasks = listTasks.some((task) => task.completed);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const hasOldTasks = listTasks.some(
    (task) =>
      task.due_date &&
      new Date(task.due_date).setHours(0, 0, 0, 0) < today.getTime()
  );

  return (
    <div className={styles.tasksSettings}>
      <div className={styles.sort}>
        <span className={styles.sectionName}>Sort by</span>
        <div className={styles.opions}>
          {sortingOptions.map((option) => (
            <div className={styles.option} key={option.value}>
              <CustomButton
                ClickEffect="scale"
                className="default"
                onClick={() =>
                  setLists((lists) =>
                    lists.map((l) =>
                      l.id === list.id ? { ...l, sort_by: option.value } : l
                    )
                  )
                }
              >
                <div className={styles.icon}>
                  {list?.sort_by === option.value && <CheckMarkIcon />}
                </div>
                <p>{option.label}</p>
              </CustomButton>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.line}></div>
      <div className={styles.editList}>
        <div className={styles.options}>
          <div className={styles.option}>
            <CustomButton
              ClickEffect="scale"
              className="default"
              onClick={handleChangeListName}
            >
              <p>Rename List</p>
            </CustomButton>
          </div>
          <div className={styles.option}>
            <CustomButton
              ClickEffect="scale"
              className={`default ${list.is_default ? styles.disabled : ""}`}
              onClick={handleDeleteList}
              disabled={list.is_default}
            >
              {list.is_default ? (
                <div className={styles.text}>
                  <p>Delete list</p>
                  {list.is_default && (
                    <span>Default list can't be deleted</span>
                  )}
                </div>
              ) : (
                <p>Delete list</p>
              )}
            </CustomButton>
          </div>
        </div>
      </div>
      <div className={styles.line}></div>

      <div className={styles.editTasks}>
        <div className={styles.options}>
          <div className={styles.option}>
            <CustomButton
              ClickEffect="scale"
              className={`default ${!hasCompletedTasks ? styles.disabled : ""}`}
              onClick={handleDeleteCompletedTasks}
              disabled={!hasCompletedTasks}
            >
              <p>Delete all completed tasks</p>
            </CustomButton>
          </div>
          <div className={styles.option}>
            <CustomButton
              ClickEffect="scale"
              className={`default ${!hasOldTasks ? styles.disabled : ""}`}
              onClick={handleDeleteOldTasks}
              disabled={!hasOldTasks}
            >
              <p>Delete old tasks</p>
            </CustomButton>
          </div>
        </div>
      </div>
    </div>
  );
}
export { ToDoPage, ToDoNavControlls };
