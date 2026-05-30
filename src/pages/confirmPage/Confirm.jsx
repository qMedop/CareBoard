import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useData } from "../../contexts/AuthContext";

function ConfirmPage() {
  const { token } = useParams(); // token from /confirm/:token
  const { loginAfterConfirm } = useData(); // 👈 Get the function from context

  const [status, setStatus] = useState("loading"); // loading | success | expired | invalid | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      setMessage("No token provided.");
      return;
    }

    async function confirmEmail() {
      try {
        const res = await fetch(`http://localhost:3000/api/confirm/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        const data = await res.json();

        if (res.ok && data.success) {
          setStatus("success");
          setMessage("Email confirmed! Redirecting you now...");
          // ✅ NEW: Log the user in with the data from the server
          setTimeout(() => {
            loginAfterConfirm(data);
          }, 1500); // Small delay to show the message
        } else {
          // handle specific error codes from server
          if (data.error === "TOKEN_EXPIRED") {
            setStatus("expired");
            setMessage(
              "Token expired. Please request a new confirmation email."
            );
          } else if (data.error === "TOKEN_INVALID") {
            setStatus("invalid");
            setMessage("Invalid confirmation token.");
          } else {
            setStatus("error");
            setMessage("An unknown error occurred.");
          }
        }
      } catch (err) {
        console.error(err);
        setStatus("error");
        setMessage("Failed to contact server.");
      }
    }

    confirmEmail();
  }, [token, loginAfterConfirm]);

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      {status === "loading" && <p>Confirming your email...</p>}
      {status !== "loading" && <p>{message}</p>}
      {status === "expired" && <button>Resend confirmation email</button>}
    </div>
  );
}

export default ConfirmPage;
