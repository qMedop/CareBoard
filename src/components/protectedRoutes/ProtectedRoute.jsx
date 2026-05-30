import { Navigate, Outlet } from "react-router-dom";
import { useData } from "../../contexts/AuthContext";
import Loading from "../loading/Loading";

function ProtectedRoute() {
  const { authStatus, currentUser } = useData();

  if (authStatus === "loading") return <Loading />;

  if (authStatus === "not_logged_in" || !currentUser) {
    return <Navigate to="/login/sign-in" replace />;
  }

  // Redirect first-time users to /profile-start
  if (authStatus === "first_time_user") {
    return <Navigate to="/profile-start" replace />;
  }

  return <Outlet />; // regular users
}

export default ProtectedRoute;
