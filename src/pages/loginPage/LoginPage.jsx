// LoginPage.jsx
import { useEffect, useRef, useState } from "react";
import { useData } from "../../contexts/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import styles from "./LoginPage.module.css";
import {
  EmailIcon,
  EyeClosedIcon,
  EyeIcon,
  LockIcon,
  PersonIcon,
  WebsiteIcon,
} from "../../assets/icons/Icon";
import { useTime } from "../../contexts/TimeContext";
import CustomButton from "../../components/button/Button";
function LoginPage() {
  const { mode } = useParams();
  const containerRef = useRef(null);
  const { currentUser } = useData();
  const navigate = useNavigate();
  const { isMobile } = useTime();
  useEffect(() => {
    if (currentUser) navigate("/");
  }, [navigate, currentUser]);

  useEffect(() => {
    const timer = setTimeout(() => {
      containerRef.current?.style.setProperty(
        "--switch-transition",
        "0.3s ease-in-out",
      );
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={styles.loginPageContainer}>
      <div
        ref={containerRef}
        style={{
          "--switch-transition": `0s ease-in-out`,
        }}
        className={`${styles.container} ${
          mode === "sign-up" ? styles.signUp : ""
        } ${mode === "reset-password" ? styles.resetPassword : ""}`}
      >
        <SignInForm resetTrigger={mode} />
        <SignUpForm resetTrigger={mode} />
        <ResetPassword resetTrigger={mode} />

        <div className={`${styles.overlayContainer}`}>
          <div className={`${styles.overlay}`}>
            <div className={`${styles.overlayPanel} ${styles.signUpPanel}`}>
              <h2>Welcome Back!</h2>
              <p>
                To keep connected with us please login with your personal info.
              </p>
              <CustomButton
                ClickEffect={"scaleDown"}
                className={`${styles.navigateBtn} default`}
                link={true}
                href="/login/sign-up"
              >
                <p>Sign up</p>
              </CustomButton>
            </div>
            <div className={`${styles.overlayPanel} ${styles.signInPanel}`}>
              <h2>Hello, Friend!</h2>
              <p>Enter your personal details and start journey with us.</p>
              <CustomButton
                ClickEffect={"scaleDown"}
                className={`${styles.navigateBtn} default`}
                link={true}
                href="/login/sign-in"
              >
                <p>Sign in</p>
              </CustomButton>
            </div>
            <div
              className={`${styles.overlayPanel} ${styles.resetPasswordPanel}`}
            >
              <h2>Lost your secret code?</h2>
              <div className={styles.newUser}>
                <div>
                  <CustomButton
                    ClickEffect={"scaleDown"}
                    className={`${styles.navigateBtn} default `}
                    link={true}
                    href="/login/sign-in"
                  >
                    <p>Sign in</p>
                  </CustomButton>
                  <CustomButton
                    ClickEffect={"scaleDown"}
                    className={`${styles.navigateBtn} default`}
                    link={true}
                    href="/login/sign-up"
                  >
                    <p>Sign up</p>
                  </CustomButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignInForm({ resetTrigger }) {
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signInshowPass, setSignInshowPass] = useState(false);
  const [inputType, setInputType] = useState("text");
  const [signInUsernameErr, setSignInUsernameErr] = useState(null);
  const [signInPassErr, setSignInPassErr] = useState(null);
  const [apiError, setApiError] = useState(null); // For server errors
  const { signIn } = useData();
  // Reset state when switching tabs
  useEffect(() => {
    setSignInEmail("");
    setSignInPassword("");
    setSignInUsernameErr(null);
    setSignInPassErr(null);
    setSignInshowPass(false);
    setInputType("text");
  }, [resetTrigger]);

  function handleChange(e) {
    const newValue = e.target.value;
    setSignInEmail(newValue);
    setInputType(newValue.includes("@") ? "email" : "text");
  }

  function handleUsernameValidate() {
    if (!signInEmail || signInEmail.length === 0) {
      setSignInUsernameErr(true);
      return false;
    }
    if (signInEmail.includes("@")) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(signInEmail)) {
        setSignInUsernameErr("Invalid email format.");
        return false;
      }
    } else {
      if (signInEmail.length < 3) {
        setSignInUsernameErr("Username must be at least 3 characters.");
        return false;
      }
      if (signInEmail.length > 10) {
        setSignInUsernameErr("Username can't be more than 10 characters.");
        return false;
      }
      if (!/^[a-zA-Z0-9._]+$/.test(signInEmail)) {
        setSignInUsernameErr(
          "Only letters, numbers, dots and underscores are allowed.",
        );
        return false;
      }
    }
    setSignInUsernameErr(null);
    return true;
  }

  function handlePasswordValidate() {
    if (signInPassword.length === 0) {
      setSignInPassErr(true);
      return false;
    } else if (signInPassword.length < 8) {
      setSignInPassErr("Password must be at least 8 characters");
      return false;
    } else {
      setSignInPassErr(null);
      return true;
    }
  }

  async function handleSignInSubmit(e) {
    e.preventDefault();
    setApiError(null);

    const usernameValid = handleUsernameValidate();
    const passwordValid = handlePasswordValidate();

    console.log(passwordValid, usernameValid);
    if (!usernameValid || !passwordValid) return;
    const result = await signIn(signInEmail, signInPassword);

    if (!result.success) {
      setApiError(result.error);
    }
  }
  return (
    <div className={`${styles.signInContainer} ${styles.formContainer}`}>
      <h2>Sign in</h2>
      <form onSubmit={handleSignInSubmit}>
        <div className={styles.userData}>
          <div
            className={`${styles.username} ${styles.field} ${
              signInUsernameErr && styles.error
            } ${signInUsernameErr?.length > 1 && styles.errorMess}`}
          >
            <div className={styles.icon}>
              <PersonIcon />
            </div>
            <input
              type={inputType}
              placeholder="Email or username"
              value={signInEmail}
              onChange={handleChange}
              onFocus={() => setSignInUsernameErr(null)}
              onBlur={handleUsernameValidate}
            />
          </div>
          {signInUsernameErr?.length > 0 && (
            <div className={styles.errorMessage}>
              <span>{signInUsernameErr}</span>
            </div>
          )}

          <div
            className={`${styles.password} ${styles.field} ${
              signInPassErr && styles.error
            } ${signInPassErr?.length > 1 && styles.errorMess}`}
          >
            <div className={styles.icon}>
              <LockIcon />
            </div>
            <input
              type={signInshowPass ? "text" : "password"}
              placeholder="Password"
              value={signInPassword}
              onChange={(e) => setSignInPassword(e.target.value)}
              onFocus={() => setSignInPassErr(null)}
              onBlur={handlePasswordValidate}
            />
            <CustomButton
              tabIndex={-1}
              dataInfo={signInshowPass ? "Hide password" : "Show password"}
              ClickEffect={false}
              className={`${styles.showHidePassword} default`}
              type="button"
              onClick={() => setSignInshowPass((prev) => !prev)}
            >
              <div className={styles.icon}>
                {signInshowPass ? <EyeClosedIcon /> : <EyeIcon />}
              </div>
            </CustomButton>
          </div>
          {signInPassErr?.length > 0 && (
            <div className={styles.errorMessage}>
              <span>{signInPassErr}</span>
            </div>
          )}
        </div>

        <div className={styles.submit}>
          <CustomButton
            ClickEffect={"scaleDown"}
            className={`${styles.signUp} default`}
            type="submit"
          >
            <p>Sign in</p>
          </CustomButton>
        </div>

        <div className={styles.forgotPassword}>
          <CustomButton
            className="default"
            ClickEffect={false}
            link={true}
            href="/login/reset-password"
          >
            <p>Forgot your password?</p>
          </CustomButton>
        </div>
        <CustomButton
          ClickEffect={"scaleDown"}
          className={`${styles.smallScreenBtn} default `}
          link={true}
          href="/login/sign-up"
        >
          <p>Sign up</p>
        </CustomButton>
      </form>
    </div>
  );
}
function SignUpForm({ resetTrigger }) {
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpPassword2, setSignUpPassword2] = useState("");
  const [signUpshowPass, setSignUpshowPass] = useState(false);

  const [signUpUsernameErr, setSignUpUsernameErr] = useState(null);
  const [signUpPassErr, setSignUpPassErr] = useState(null);
  const [signUpPassMatchErr, setSignUpPassMatchErr] = useState(null);

  const { registrationFlow } = useData();

  const navigate = useNavigate(); // 👈 ADD THIS HERE
  useEffect(() => {
    setSignUpEmail("");
    setSignUpPassword("");
    setSignUpPassword2("");
    setSignUpshowPass(false);
    setSignUpUsernameErr(null);
    setSignUpPassErr(null);
    setSignUpPassMatchErr(null);
  }, [resetTrigger]);

  function handleEmailValidate() {
    if (!signUpEmail || signUpEmail.length === 0) {
      setSignUpUsernameErr(true);
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(signUpEmail)) {
      setSignUpUsernameErr("Invalid email format.");
      return;
    }
    setSignUpUsernameErr(null);
  }

  function handlePasswordValidate() {
    if (signUpPassword.length === 0) {
      setSignUpPassErr(true);
    } else if (signUpPassword.length < 8) {
      setSignUpPassErr("Password must be at least 8 characters.");
    } else {
      setSignUpPassErr(null);
    }
  }
  function handlePasswordValidate2() {
    if (signUpPassword2.length === 0) {
      setSignUpPassMatchErr(true);
    } else if (
      signUpPassword2.length > 0 &&
      signUpPassword !== signUpPassword2
    ) {
      setSignUpPassMatchErr("Password does not match.");
    } else {
      setSignUpPassMatchErr(null);
    }
  }

  async function handleSignUpSubmit(e) {
    e.preventDefault();

    // run validations
    handleEmailValidate();
    handlePasswordValidate();
    handlePasswordValidate2();

    // Wait a tiny bit for states to update, or just check the current values
    if (!signUpUsernameErr && !signUpPassErr && !signUpPassMatchErr) {
      try {
        // 1️⃣ Run the Firebase registration flow (generates keys & saves to Firestore)
        const result = await registrationFlow(signUpEmail, signUpPassword);

        if (result.success) {
          alert("Signup successful! Please sign in with your new account.");
          // Redirect to the sign-in tab so they can generate their initial device keys
          navigate("/login/sign-in");
        }
      } catch (err) {
        console.error("Error during registration:", err);

        // Handle specific Firebase errors nicely
        if (err.code === "auth/email-already-in-use") {
          setSignUpUsernameErr("This email is already registered.");
        } else {
          alert("Signup failed: " + (err.message || "Unknown error"));
        }
      }
    }
  }

  return (
    <div className={`${styles.signUpContainer} ${styles.formContainer}`}>
      <h2>Sign up</h2>
      <form onSubmit={handleSignUpSubmit}>
        <div className={styles.userData}>
          <div
            className={`${styles.username} ${styles.field} ${
              signUpUsernameErr && styles.error
            } ${signUpUsernameErr?.length > 1 && styles.errorMess}`}
          >
            <div className={styles.icon}>
              <EmailIcon />
            </div>
            <input
              type="email"
              placeholder="Email"
              value={signUpEmail}
              onChange={(e) => setSignUpEmail(e.target.value)}
              onFocus={() => setSignUpUsernameErr(null)}
              onBlur={handleEmailValidate}
            />
          </div>
          {signUpUsernameErr?.length > 0 && (
            <div className={styles.errorMessage}>
              <span>{signUpUsernameErr}</span>
            </div>
          )}

          <div
            className={`${styles.password} ${styles.field} ${
              signUpPassErr && styles.error
            } ${signUpPassErr?.length > 1 && styles.errorMess}`}
          >
            <div className={styles.icon}>
              <LockIcon />
            </div>
            <input
              type={signUpshowPass ? "text" : "password"}
              placeholder="Password"
              value={signUpPassword}
              onChange={(e) => setSignUpPassword(e.target.value)}
              onFocus={() => setSignUpPassErr(null)}
              onBlur={handlePasswordValidate}
            />
            <CustomButton
              tabIndex={-1}
              dataInfo={signUpshowPass ? "Hide password" : "Show password"}
              ClickEffect={false}
              className={`${styles.showHidePassword} default`}
              type="button"
              onClick={() => setSignUpshowPass((prev) => !prev)}
            >
              <div className={styles.icon}>
                {signUpshowPass ? <EyeClosedIcon /> : <EyeIcon />}
              </div>
            </CustomButton>
          </div>
          {signUpPassErr?.length > 0 && (
            <div className={styles.errorMessage}>
              <span>{signUpPassErr}</span>
            </div>
          )}

          <div
            className={`${styles.password2} ${styles.field} ${
              signUpPassMatchErr && styles.error
            } ${signUpPassMatchErr?.length > 1 && styles.errorMess}`}
          >
            <div className={styles.icon}>
              <LockIcon />
            </div>
            <input
              type={signUpshowPass ? "text" : "password"}
              placeholder="Reenter your password"
              value={signUpPassword2}
              onChange={(e) => setSignUpPassword2(e.target.value)}
              onFocus={() => setSignUpPassMatchErr(null)}
              onBlur={handlePasswordValidate2}
            />
            <CustomButton
              tabIndex={-1}
              dataInfo={signUpshowPass ? "Hide password" : "Show password"}
              ClickEffect={false}
              className={`${styles.showHidePassword} default`}
              type="button"
              onClick={() => setSignUpshowPass((prev) => !prev)}
            >
              <div className={styles.icon}>
                {signUpshowPass ? <EyeClosedIcon /> : <EyeIcon />}
              </div>
            </CustomButton>
          </div>
          {signUpPassMatchErr?.length > 0 && (
            <div className={styles.errorMessage}>
              <span>{signUpPassMatchErr}</span>
            </div>
          )}
        </div>

        <div className={styles.submit}>
          <CustomButton
            ClickEffect={"scaleDown"}
            className={`${styles.signUp} default`}
            type="submit"
          >
            <p>Sign up</p>
          </CustomButton>
        </div>
        <CustomButton
          ClickEffect={"scaleDown"}
          className={`default ${styles.smallScreenBtn}`}
          link={true}
          href="/login/sign-in"
        >
          <p>Sign in</p>
        </CustomButton>
      </form>
    </div>
  );
}
function ResetPassword({ resetTrigger }) {
  const [signUpEmail, setSignUpEmail] = useState("");

  useEffect(() => {
    setSignUpEmail("");
  }, [resetTrigger]);

  return (
    <div className={`${styles.resetPasswordContainer} ${styles.formContainer}`}>
      <h2>password Recovery</h2>
      <div className={styles.securityNotice}>
        <p>
          Your data is protected with end-to-end encryption and secured using a
          key generated from your password.
        </p>
        <p>To ensure maximum privacy, we never store your password.</p>
        <p>
          This means that if you forget your password, we cannot recover it or
          reset it for you.
        </p>
        <p>
          Unfortunately, without your password, your encrypted data cannot be
          accessed.
        </p>
        <p className={styles.warning}>Please keep your password safe.</p>
      </div>
      <div className={styles.buttonsContainer}>
        <CustomButton
          ClickEffect={"scaleDown"}
          className={`${styles.navigateBtn} default ${styles.smallScreenBtn}`}
          link={true}
          href="/login/sign-in"
        >
          <p>Sign in</p>
        </CustomButton>
        <CustomButton
          ClickEffect={"scaleDown"}
          className={`${styles.navigateBtn} default ${styles.smallScreenBtn}`}
          link={true}
          href="/login/sign-up"
        >
          <p>Sign up</p>
        </CustomButton>
      </div>
    </div>
  );
}

export default LoginPage;
