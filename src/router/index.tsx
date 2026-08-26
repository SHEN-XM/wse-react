import { createBrowserRouter, Navigate } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import { menuLeaves } from "../data/menu";
import ApplyAccountPage from "../pages/ApplyAccountPage";
import DataCollectionPage from "../pages/DataCollectionPage";
import DailyHotPage from "../pages/DailyHotPage";
import DictionaryPage from "../pages/DictionaryPage";
import DramaHotPage from "../pages/DramaHotPage";
import DramaSubjectPage from "../pages/DramaSubjectPage";
import FilePage from "../pages/FilePage";
import ForbiddenPage from "../pages/ForbiddenPage";
import AiTextPage from "../pages/AiTextPage";
import HotWordsPage from "../pages/HotWordsPage";
import LosslessVideoPage from "../pages/LosslessVideoPage";
import LogPage from "../pages/LogPage";
import LoginPage from "../pages/LoginPage";
import ModulePage from "../pages/ModulePage";
import PermissionPage from "../pages/PermissionPage";
import RequireAuth from "./RequireAuth";
import RolePage from "../pages/RolePage";
import UserPage from "../pages/UserPage";
import CoverMakerPage from "../pages/CoverMakerPage";

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
              ) : item.key === "drama-hot-subject" ? (
                <DramaSubjectPage />
              ) : item.key === "drama-hot-new" ? (
                <DramaHotPage fixedListType={1} />
              ) : item.key === "drama-hot-reserve" ? (
                <DramaHotPage fixedListType={2} />
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
              ) : item.key === "lossless-video" ? (
                <LosslessVideoPage />
              ) : item.key === "cover-maker" ? (
                <CoverMakerPage />
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
