import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { menuLeaves } from "../data/menu";
import { getStoredUser, hasPathAccess, isLoggedIn } from "../utils/authState";
import { redirectToPublicHome } from "../utils/publicHome";

function getFirstAllowedRoute() {
  const user = getStoredUser();
  if (!user) return "";

  return menuLeaves.find((item) => hasPathAccess(item.permissionPath || item.path, user))?.path || "";
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

  const routeItem = menuLeaves.find((item) => item.path === location.pathname);
  const permissionPath = routeItem?.permissionPath || location.pathname;
  if (!hasPathAccess(permissionPath, user)) {
    return <Navigate to={firstAllowedRoute} replace />;
  }

  return <Outlet />;
}
