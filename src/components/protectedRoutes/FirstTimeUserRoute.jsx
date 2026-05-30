import { Navigate, Outlet } from "react-router-dom";
import { useData } from "../../contexts/AuthContext";
import Loading from "../loading/Loading";

function FirstTimeUserRoute() {
  const { authStatus, currentUser } = useData();

  if (authStatus === "loading") {
    return <Loading />;
  }

  // Not logged in → go to login
  if (authStatus === "not_logged_in" || !currentUser) {
    return <Navigate to="/login/sign-in" replace />;
  }

  // Logged in & first time → allow access to /profile-start
  if (authStatus === "first_time_user") {
    return <Outlet />; // renders ProfileStartPage
  }

  // Logged in but NOT first time → redirect to home
  return <Navigate to="/" replace />;
}

export default FirstTimeUserRoute;
