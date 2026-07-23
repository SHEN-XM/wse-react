import { createBrowserRouter, Navigate } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import { menuLeaves } from "../data/menu";
import ApplyAccountPage from "../pages/ApplyAccountPage";
import DataCollectionPage from "../pages/DataCollectionPage";
import DailyHotPage from "../pages/DailyHotPage";
import DictionaryPage from "../pages/DictionaryPage";
import FilePage from "../pages/FilePage";
import ForbiddenPage from "../pages/ForbiddenPage";
import AiTextPage from "../pages/AiTextPage";
import HotWordsPage from "../pages/HotWordsPage";
import LogPage from "../pages/LogPage";
import LoginPage from "../pages/LoginPage";
import ModulePage from "../pages/ModulePage";
import PermissionPage from "../pages/PermissionPage";
import RequireAuth from "./RequireAuth";
import RolePage from "../pages/RolePage";
import UserPage from "../pages/UserPage";

const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "");

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />
  },
  {
    path: "/forbidden",
    element: <ForbiddenPage />
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AdminShell />,
        children: [
          {
            index: true,
            element: <DailyHotPage />
          },
          ...menuLeaves.filter((item) => item.path !== "/").map((item) => ({
            path: item.path,
            element:
              item.key === "daily-hot" ? (
                <DailyHotPage />
              ) : item.key === "account-apply" ? (
                <ApplyAccountPage />
              ) : item.key === "hot-words" ? (
                <HotWordsPage />
              ) : item.key === "ai-text" ? (
                <AiTextPage />
              ) : item.key === "collection" ? (
                <DataCollectionPage />
              ) : item.key === "dictionary" ? (
                <DictionaryPage />
              ) : item.key === "permission" ? (
                <PermissionPage />
              ) : item.key === "role" ? (
                <RolePage />
              ) : item.key === "user" ? (
                <UserPage />
              ) : item.key === "logs" ? (
                <LogPage />
              ) : item.key === "files" ? (
                <FilePage />
              ) : (
                <ModulePage menuKey={item.key} />
              )
          })),
          {
            path: "*",
            element: <Navigate to="/" replace />
          }
        ]
      }
    ]
  }
], routerBase ? { basename: routerBase } : undefined);
