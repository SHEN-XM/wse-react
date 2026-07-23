import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { menuLeaves } from "../data/menu";
import { getAllowedPaths, getStoredUser, hasPathAccess, isLoggedIn } from "../utils/authState";
import { redirectToPublicHome } from "../utils/publicHome";

function getFirstAllowedRoute() {
  const user = getStoredUser();
  if (!user) return "";

  const allowedPaths = getAllowedPaths(user);
  return menuLeaves.find((item) => allowedPaths.has(item.path))?.path || "";
}

function PublicHomeRedirect() {
  useEffect(() => {
    redirectToPublicHome();
  }, []);

  return null;
}

export default function RequireAuth() {
  const location = useLocation();

  if (!isLoggedIn()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const user = getStoredUser();
  const firstAllowedRoute = getFirstAllowedRoute();
  if (!firstAllowedRoute) {
    return <PublicHomeRedirect />;
  }

  if (location.pathname === "/" && firstAllowedRoute && firstAllowedRoute !== "/") {
    return <Navigate to={firstAllowedRoute} replace />;
  }

  if (!hasPathAccess(location.pathname, user)) {
    return <Navigate to={firstAllowedRoute} replace />;
  }

  return <Outlet />;
}
