import { Navigate, Outlet, useLocation } from "react-router-dom";
import { hasPathAccess, isLoggedIn } from "../utils/authState";

export default function RequireAuth() {
  const location = useLocation();

  if (!isLoggedIn()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!hasPathAccess(location.pathname)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
