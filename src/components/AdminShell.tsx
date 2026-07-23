import { ChevronDown, ChevronLeft, LogOut, Menu, Moon, Search, SunMedium, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { menuGroups, menuLeaves } from "../data/menu";
import { useTheme } from "../theme/ThemeProvider";
import { clearAuth, getAllowedPaths, getStoredUser } from "../utils/authState";

export default function AdminShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [openKeys, setOpenKeys] = useState<string[]>(menuGroups.map((item) => item.key));
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const { theme, toggleTheme } = useTheme();

  const user = getStoredUser();
  const displayName = user?.nickname || user?.realname || user?.username || "管理员";
  const primaryRoleName = user?.roleName || "";
  const allowedPaths = useMemo(() => getAllowedPaths(user), [user]);
  const visibleMenuGroups = useMemo(() => {
    return menuGroups
      .map((group) => ({
        ...group,
        children: group.children.filter((item) => allowedPaths.has(item.path))
      }))
      .filter((group) => group.children.length > 0);
  }, [allowedPaths]);
  const visibleMenuLeaves = useMemo(() => visibleMenuGroups.flatMap((group) => group.children), [visibleMenuGroups]);
  const activeItem = useMemo(
    () => visibleMenuLeaves.find((item) => item.path === location.pathname) ?? visibleMenuLeaves[0] ?? menuLeaves[0],
    [location.pathname, visibleMenuLeaves]
  );

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

  const logout = () => {
    clearAuth();
    navigate("/login", { replace: true });
  };

  return (
    <div className={`admin-shell ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="admin-sidebar">
        <div className="brand-row">
          <div className="brand-block">
            {!collapsed && <strong>写作后台情报局</strong>}
          </div>
          <button className="icon-button" type="button" onClick={() => setCollapsed((value) => !value)}>
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
              <button type="button" onClick={() => setQuery("")}>
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
                >
                  <GroupIcon size={18} />
                  {!collapsed && <span>{group.label}</span>}
                  {!collapsed && <ChevronDown className={isOpen ? "open" : ""} size={16} />}
                </button>
                {collapsed && (
                  <div className="collapsed-menu-flyout">
                    <div className="collapsed-menu-title">
                      <GroupIcon size={16} />
                      <strong>{group.label}</strong>
                    </div>
                    <div className="collapsed-menu-children">
                      {group.children.map((item) => {
                        const ItemIcon = item.icon;
                        return (
                          <button
                            className={`collapsed-menu-child ${activeItem.path === item.path ? "active" : ""}`}
                            type="button"
                            key={item.key}
                            onClick={() => navigate(item.path)}
                          >
                            <ItemIcon size={15} />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
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
            <div className="breadcrumb">写作后台情报局 / {activeItem.label}</div>
          </div>
          <div className="top-actions">
            <div className="user-menu-wrap">
              <button className="user-chip" type="button">
                <UserRound size={15} />
                <span>{displayName}</span>
                {primaryRoleName ? <em>{primaryRoleName}</em> : null}
              </button>
              <div className="user-menu">
                <button type="button" onClick={logout}>
                  <LogOut size={16} />
                  退出
                </button>
              </div>
            </div>
            <button className="top-action-button icon-only" type="button" onClick={toggleTheme}>
              {theme === "dark" ? <Moon size={18} /> : <SunMedium size={18} />}
            </button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
