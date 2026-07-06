import { ChevronDown, ChevronLeft, LogOut, Menu, Search, SunMedium } from "lucide-react";
import { useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { menuGroups, menuLeaves, type MenuLeaf } from "../data/menu";
import { useTheme, type ThemeName } from "../theme/ThemeProvider";
import { clearAuth, getAllowedPaths, getStoredUser } from "../utils/authState";

function findInitialMenu(): MenuLeaf {
  return menuLeaves.find((item) => item.path === window.location.pathname) ?? menuLeaves.find((item) => item.key === "daily-hot") ?? menuLeaves[0];
}

export default function AdminShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [openKeys, setOpenKeys] = useState<string[]>(menuGroups.map((item) => item.key));
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const { theme, themes, setTheme, toggleTheme } = useTheme();

  const activeItem = useMemo(
    () => menuLeaves.find((item) => item.path === location.pathname) ?? findInitialMenu(),
    [location.pathname]
  );
  const user = getStoredUser();
  const allowedPaths = useMemo(() => getAllowedPaths(user), [user]);
  const visibleMenuGroups = useMemo(() => {
    if (allowedPaths === null) return menuGroups;
    return menuGroups
      .map((group) => ({
        ...group,
        children: group.children.filter((item) => item.path === "/" || allowedPaths.has(item.path))
      }))
      .filter((group) => group.children.length > 0);
  }, [allowedPaths]);

  const filteredGroups = useMemo(() => {
    const keyword = query.trim();
    const source = visibleMenuGroups;
    if (!keyword) {
      return source;
    }
    return source
      .map((group) => ({
        ...group,
        children: group.children.filter(
          (item) => item.label.includes(keyword) || item.description.includes(keyword)
        )
      }))
      .filter((group) => group.children.length > 0 || group.label.includes(keyword));
  }, [query, visibleMenuGroups]);

  const toggleGroup = (key: string) => {
    setOpenKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };

  return (
    <div className={`admin-shell ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="admin-sidebar">
        <div className="brand-row">
          <div className="brand-mark">WSE</div>
          <button className="icon-button" type="button" onClick={() => setCollapsed((value) => !value)} title="收起侧栏">
            {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {!collapsed && (
          <label className="sidebar-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索菜单"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} title="清空">
                ×
              </button>
            )}
          </label>
        )}

        <nav className="sidebar-menu">
          {filteredGroups.map((group) => {
            const GroupIcon = group.icon;
            const isOpen = openKeys.includes(group.key);
            const groupActive = group.children.some((item) => item.path === activeItem.path);
            return (
              <section className="menu-group" key={group.key}>
                <button
                  className={`menu-group-title ${groupActive ? "active" : ""}`}
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  title={group.label}
                >
                  <GroupIcon size={18} />
                  {!collapsed && <span>{group.label}</span>}
                  {!collapsed && <ChevronDown className={isOpen ? "open" : ""} size={16} />}
                </button>
                {isOpen && !collapsed && (
                  <div className="menu-children">
                    {group.children.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <button
                          className={`menu-child ${activeItem.path === item.path ? "active" : ""}`}
                          type="button"
                          key={item.key}
                          onClick={() => navigate(item.path)}
                        >
                          <ItemIcon size={16} />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </nav>
      </aside>

      <main className="admin-main">
        <header className="topbar">
          <div>
            <div className="breadcrumb">后台管理 / {activeItem.label}</div>
          </div>
          <div className="top-actions">
            <span className="user-chip">{user?.nickname || user?.realname || user?.username || "管理员"}</span>
            <select className="theme-select" value={theme} onChange={(event) => setTheme(event.target.value as ThemeName)} title="主题">
              {themes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button className="icon-button" type="button" title="切换明暗主题" onClick={toggleTheme}>
              <SunMedium size={18} />
            </button>
            <button
              className="icon-button"
              type="button"
              title="退出登录"
              onClick={() => {
                clearAuth();
                navigate("/login", { replace: true });
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
