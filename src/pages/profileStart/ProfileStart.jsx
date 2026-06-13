import {
  useLayoutEffect,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import styles from "./ProfileStart.module.css";
import PinInput from "../../components/pinInput/PinInput";
import CustomButton from "../../components/button/Button";
import {
  ArrowLeftThinIcon,
  ArrowRightThinIcon,
  ArrowUpThinIcon,
  LoadingIcon,
  UsernameIcon,
} from "../../assets/icons/Icon";
import { motion, AnimatePresence } from "framer-motion";
import {
  GenderFemaleIllustratior,
  GenderMaleIllustratior,
  WelcomeIllustratior,
} from "../../assets/Illustrations/Illustrations";
import { useData } from "../../contexts/AuthContext";
import defaultAvatar from "../../assets/svg/user-avatar.svg";
import maleAvatar from "../../assets/svg/male-avatar.svg";
import femaleAvatar from "../../assets/svg/female-avatar.svg";

const variants = {
  enter: (direction) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.4, ease: "easeInOut" },
  },
  exit: (direction) => ({
    x: direction < 0 ? 60 : -60,
    opacity: 0,
    transition: { duration: 0.3, ease: "easeInOut" },
  }),
};

function ProfileStart() {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({
    username: "",
    displayName: "",
    gender: "",
    displayPicture: null,
    pin: "",
  });
  const [errors, setErrors] = useState({});
  const [direction, setDirection] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { updateUserProfile, checkUsernameAvailability } = useData();

  useEffect(() => {
    if (step < components.length - 1) {
      setIsSubmitting(false);
    }
  }, [step]);

  const handleInputChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: null }));
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setErrors({});
      setDirection(-1);
      setStep((s) => s - 1);
    }
  };

  const handleNext = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    if (step === 0) {
      setDirection(1);
      setStep(1);
      setIsSubmitting(false);
      return;
    }

    const validationErrors = await validate(
      step,
      formData,
      checkUsernameAvailability,
    );

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setIsSubmitting(false);
      return;
    }

    setErrors({});

    if (step < components.length - 1) {
      setDirection(1);
      setStep((s) => s + 1);
      setIsSubmitting(false);
      return;
    }

    try {
      let finalErrors = {};

      for (let i = 1; i <= 5; i++) {
        const stepErrors = await validate(
          i,
          formData,
          checkUsernameAvailability,
        );
        if (Object.keys(stepErrors).length > 0) {
          finalErrors = { ...finalErrors, ...stepErrors };
          setErrors(finalErrors);
          setDirection(-1);
          setStep(i);
          setIsSubmitting(false);
          return;
        }
      }

      let finalFormData = { ...formData };

      if (!finalFormData.displayPicture) {
        delete finalFormData.displayPicture;
      }

      const result = await updateUserProfile(finalFormData);
      if (result.success) {
      } else {
        console.error(result.error);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    handleNext();
  };

  const isNextDisabled = () => {
    return isSubmitting;
  };

  const components = [
    <WelcomeSection />,
    <UserName
      formData={formData}
      handleInputChange={handleInputChange}
      error={errors.username}
      validate={validate}
      setErrors={setErrors}
      checkUsernameAvailability={checkUsernameAvailability}
    />,
    <DisplayName
      formData={formData}
      handleInputChange={handleInputChange}
      error={errors.displayName}
    />,
    <Gender
      formData={formData}
      handleInputChange={handleInputChange}
      error={errors.gender}
    />,
    <CustomPfp formData={formData} handleInputChange={handleInputChange} />,
    <Pin
      handleInputChange={handleInputChange}
      error={errors.pin}
      onFocus={() => setErrors((prev) => ({ ...prev, pin: null }))}
    />,
  ];

  return (
    <form onSubmit={handleFormSubmit} className={styles.formWrapper}>
      <div className={styles.firstTimeContainer}>
        <div className={`${styles.left} ${step !== 0 && styles.default}`}>
          {step === 0 ? (
            <div className={styles.sections}>
              <WelcomeSection />
              <div className={styles.buttons}>
                <CustomButton
                  ClickEffect={"scale"}
                  onClick={handleNext}
                  className={`default ${styles.welcome}`}
                >
                  <p>Start</p> <ArrowRightThinIcon />
                </CustomButton>
              </div>
            </div>
          ) : (
            <div className={styles.sections}>
              <div className={styles.sectionsContainer}>
                <AutoHeight step={step}>
                  <AnimatePresence initial={false} custom={direction}>
                    <motion.div
                      key={step}
                      custom={direction}
                      variants={variants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      className={styles.section}
                    >
                      {components[step]}
                    </motion.div>
                  </AnimatePresence>
                </AutoHeight>
              </div>
              <div className={styles.buttons}>
                <CustomButton
                  ClickEffect={"scale"}
                  onClick={handleBack}
                  className={`default ${styles.backButton}`}
                  type="button"
                >
                  <ArrowLeftThinIcon />
                </CustomButton>
                <div style={{ marginLeft: "auto" }}>
                  <CustomButton
                    ClickEffect={"scale"}
                    onClick={
                      step === components.length - 1 ? undefined : handleNext
                    }
                    className={`default ${styles.nextButton} ${
                      isNextDisabled() && styles.disabled
                    }`}
                    type={step === components.length - 1 ? "submit" : "button"}
                    disabled={isNextDisabled()}
                  >
                    {isSubmitting ? (
                      <LoadingIcon />
                    ) : step === components.length - 1 ? (
                      <ArrowUpThinIcon />
                    ) : (
                      <ArrowRightThinIcon />
                    )}
                  </CustomButton>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className={styles.right}>
          <div className={styles.illustration}>
            <div className={`${styles.color} ${styles.red}`}></div>
            <div className={`${styles.color} ${styles.blue}`}></div>
            <div className={`${styles.color} ${styles.black}`}></div>
            <div className={`${styles.color} ${styles.white}`}></div>
            <WelcomeIllustratior />
          </div>
        </div>
      </div>
    </form>
  );
}

const validate = async (step, formData, checkUsernameAvailability) => {
  const { username, displayName, gender, pin } = formData;
  const newErrors = {};

  switch (step) {
    case 1: {
      const username = formData.username?.trim();
      if (!username) {
        newErrors.username = "Username is required.";
      } else if (username.length < 3) {
        newErrors.username = "Username must be at least 3 characters.";
      } else if (username.length > 10) {
        newErrors.username = "Username can't be more than 10 characters.";
      } else if (!/^[a-zA-Z0-9._]+$/.test(username)) {
        newErrors.username =
          "Only letters, numbers, dots, and underscores are allowed.";
      } else {
        const { available } = await checkUsernameAvailability(username);
        if (!available) {
          newErrors.username = "This username is already taken.";
        }
      }
      break;
    }

    case 2: {
      const displayName = formData.displayName?.trim();
      if (!displayName) {
        newErrors.displayName = "Display name is required.";
      } else if (displayName.length < 3) {
        newErrors.displayName = "Display name must be at least 3 letters.";
      } else if (!/^[A-Za-z ]+$/.test(displayName)) {
        newErrors.displayName =
          "Display name must contain only English letters.";
      }
      break;
    }

    case 3:
      if (!gender) {
        newErrors.gender = "Please make a selection.";
      }
      break;
    case 5: {
      const pin = formData.pin?.trim();
      if (!pin) {
        newErrors.pin = "PIN is required.";
      } else if (!/^[0-9]+$/.test(pin)) {
        newErrors.pin = "PIN must contain only numbers.";
      } else if (pin.length < 4) {
        newErrors.pin = "PIN must be at least 4 digits.";
      }
      break;
    }
  }
  return newErrors;
};

function WelcomeSection() {
  return (
    <div className={styles.welcome}>
      <div className={styles.title}>
        <h1>Welcome to CareBoard 🎉</h1>
      </div>
      <div className={styles.text}>
        <p>
          We’re excited to have you on board! Let’s set up your account so you
          can start using CareBoard right away.
        </p>
        <div className={styles.privacy}>
          Your privacy matters to us. Learn more on our{" "}
          <CustomButton
            ClickEffect={false}
            className="default"
            link={true}
            href="/"
          >
            Privacy & Security page
          </CustomButton>
          . By continuing, you agree to our Privacy Policy.
        </div>
      </div>
    </div>
  );
}

function UserName({
  handleInputChange,
  formData,
  error,
  validate,
  setErrors,
  checkUsernameAvailability,
}) {
  const typingTimer = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);
  useEffect(() => {
    return () => {
      if (typingTimer.current) {
        clearTimeout(typingTimer.current);
      }
    };
  }, []);
  const triggerValidation = async (value) => {
    const validationErrors = await validate(
      1,
      { ...formData, username: value },
      checkUsernameAvailability,
    );
    setErrors(validationErrors);
  };

  const handleChange = (e) => {
    const newValue = e.target.value;
    handleInputChange("username", newValue);

    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
    }

    typingTimer.current = setTimeout(() => {
      triggerValidation(newValue);
    }, 500);
  };

  const handleBlur = () => {
    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
    }
    triggerValidation(formData.username);
  };

  const handleFocus = () => {
    setErrors((prev) => ({ ...prev, username: null }));
  };

  return (
    <div className={styles.username}>
      <div className={styles.headder}>
        <h1>Create your unique username.</h1>
      </div>
      <div className={styles.content}>
        <div className={`${styles.inputContainer} ${error && styles.error}`}>
          <div className="icon">
            <UsernameIcon />
          </div>
          <input
            ref={inputRef}
            value={formData.username}
            type="text"
            placeholder="username"
            onChange={handleChange}
            onBlur={handleBlur}
            onFocus={handleFocus}
          />
        </div>
        <p className={`${styles.info} ${styles.error}`}>{error}</p>
      </div>
    </div>
  );
}

function DisplayName({ handleInputChange, formData, error }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  return (
    <div className={styles.displayName}>
      <div className={styles.headder}>
        <h1>What should we call you?</h1>
      </div>
      <div className={styles.content}>
        <div className={`${styles.inputContainer} ${error && styles.error}`}>
          <div className="icon">
            <UsernameIcon />
          </div>
          <input
            ref={inputRef}
            value={formData.displayName}
            type="text"
            placeholder="ex. Lena Rotondi"
            onChange={(e) => handleInputChange("displayName", e.target.value)}
            onFocus={() =>
              handleInputChange("displayName", formData.displayName)
            }
          />
        </div>
        <p className={`${styles.info} ${styles.error}`}>{error}</p>
      </div>
    </div>
  );
}

function Gender({ handleInputChange, formData, error }) {
  return (
    <div className={styles.gender}>
      <div className={styles.headder}>
        <h1>What about your gender?</h1>
      </div>
      <div className={styles.content}>
        <div className={styles.options}>
          <div className={styles.option}>
            <p>Male</p>
            <CustomButton
              onClick={() => handleInputChange("gender", "male")}
              ClickEffect={false}
              className={`default ${styles.male} ${
                formData.gender === "male" && styles.selected
              }`}
            >
              <GenderMaleIllustratior />
            </CustomButton>
          </div>
          <div className={styles.option}>
            <p>Female</p>
            <CustomButton
              onClick={() => handleInputChange("gender", "female")}
              ClickEffect={false}
              className={`default ${styles.female} ${
                formData.gender === "female" && styles.selected
              }`}
            >
              <GenderFemaleIllustratior />
            </CustomButton>
          </div>
        </div>
        <div className={styles.bottom}>
          <CustomButton
            onClick={() => handleInputChange("gender", "others")}
            ClickEffect={false}
            className={`default ${styles.others} ${
              formData.gender === "others" && styles.selected
            }`}
          >
            <p>Prefer not to say</p>
          </CustomButton>
        </div>

        <p className={`${styles.info} ${styles.error} ${styles.genderError}`}>
          {error}
        </p>
      </div>
    </div>
  );
}

function CustomPfp({ handleInputChange, formData }) {
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  const isFileUploaded = formData.displayPicture instanceof File;

  useEffect(() => {
    let objectUrl = null;
    if (isFileUploaded) {
      objectUrl = URL.createObjectURL(formData.displayPicture);
      setImagePreview(objectUrl);
    } else {
      const defaultPicture =
        formData.gender === "male"
          ? maleAvatar
          : formData.gender === "female"
            ? femaleAvatar
            : defaultAvatar;
      setImagePreview(defaultPicture);
    }

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [formData.displayPicture, formData.gender, isFileUploaded]);

  const handleDelete = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    handleInputChange("displayPicture", null);
  };

  const handleOverlayClick = () => {
    if (isFileUploaded) {
      handleDelete();
    } else {
      fileInputRef.current.click();
    }
  };

  return (
    <div className={styles.displayPicture}>
      <div className={styles.headder}>
        <h1>Upload a profile image.</h1>
      </div>
      <div className={styles.content}>
        <div className={styles.imageWrapper} onClick={handleOverlayClick}>
          <img
            src={imagePreview}
            alt="Profile Preview"
            className={styles.profileImage}
          />
          <div className={styles.overlay}>
            {isFileUploaded ? <>Delete</> : <>Upload</>}
          </div>
          <input
            ref={fileInputRef}
            id="fileInput"
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleInputChange("displayPicture", e.target.files[0]);
              }
            }}
          />
        </div>
        <div className={styles.info}>
          <p>Not ready to upload? Just hit Next to keep the default avatar.</p>
        </div>
      </div>
    </div>
  );
}

function Pin({ handleInputChange, error, onFocus }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      const input = containerRef.current.querySelector("input");
      if (input) {
        input.focus();
      }
    }
  }, []);

  return (
    <div className={styles.pin}>
      <div className={styles.headder}>
        <h1>Add a 4-digit PIN for quick security.</h1>
      </div>
      <div className={styles.content}>
        <div
          className={styles.pinContainer}
          onFocus={onFocus}
          ref={containerRef}
        >
          <PinInput
            onChange={(pin) => handleInputChange("pin", pin)}
            error={!!error}
          />
        </div>
        {error ? (
          <p className={`${styles.info} ${styles.error}`}>{error}</p>
        ) : (
          <p className={styles.info}>
            Use your PIN to lock your profile or make quick changes.
          </p>
        )}
      </div>
    </div>
  );
}

function AutoHeight({ children }) {
  const ref = useRef(null);
  const [h, setH] = useState(0);

  const updateHeight = useCallback(() => {
    if (ref.current?.lastChild?.scrollHeight) {
      setH(ref.current.lastChild.scrollHeight);
    }
  }, []);

  useLayoutEffect(() => {
    updateHeight();
  }, [children, updateHeight]);

  useEffect(() => {
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, [updateHeight]);

  return (
    <motion.div
      style={{ overflow: "hidden" }}
      initial={false}
      animate={{ height: h || "auto" }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
    >
      <div ref={ref}>{children}</div>
    </motion.div>
  );
}

export default ProfileStart;
