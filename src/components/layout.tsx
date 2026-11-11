import {
  Activity,
  BarChart3,
  ChartNoAxesCombined,
  ChevronsUpDown,
  CircleHelp,
  Database,
  FileText,
  Gauge,
  Layers3,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  Sun,
  TrendingUp,
  Users,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { useWorkspace } from "../context";

const navigation = [
  {
    title: "Workspace",
    links: [
      { label: "Overview", path: "/", icon: Gauge },
      { label: "Review explorer", path: "/reviews", icon: MessageSquareText },
      { label: "Live sentiment", path: "/sentiment", icon: Sparkles },
    ],
  },
  {
    title: "Intelligence",
    links: [
      { label: "Products", path: "/products", icon: Layers3 },
      { label: "Topics & complaints", path: "/topics", icon: Activity },
      { label: "Customer segments", path: "/segments", icon: Users },
      { label: "Sentiment trends", path: "/trends", icon: TrendingUp },
      { label: "Recommendations", path: "/recommendations", icon: CircleHelp },
    ],
  },
  {
    title: "Operations",
    links: [
      { label: "Model center", path: "/models", icon: BarChart3 },
      { label: "Data management", path: "/data", icon: Database },
      { label: "Reports", path: "/reports", icon: FileText },
      { label: "Settings", path: "/settings", icon: Settings },
    ],
  },
];

export function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark">
        <ChartNoAxesCombined size={21} strokeWidth={2.6} />
      </span>
      <span className="brand-copy">
        <strong>VERDICTRA</strong>
        <small>Review intelligence</small>
      </span>
    </Link>
  );
}

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const location = useLocation();
  const active = navigation
    .flatMap((group) => group.links)
    .find((link) => link.path === location.pathname);
  const {
    theme,
    setTheme,
    dataset,
    datasets,
    selectDataset,
    profile,
    setProfile,
  } = useWorkspace();
  return (
    <div
      className={`shell ${collapsed ? "collapsed" : ""} ${mobile ? "mobile-open" : ""}`}
    >
      {mobile && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button collapse-button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
          </button>
        </div>
        <nav>
          {navigation.map((group) => (
            <div key={group.title} className="nav-group">
              <p>{group.title}</p>
              {group.links.map(({ label, path, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  end={path === "/"}
                  title={label}
                  onClick={() => setMobile(false)}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-account">
          <div className="avatar">
            {profile?.role === "member"
              ? profile.email.slice(0, 2).toUpperCase()
              : "VD"}
          </div>
          <div>
            <strong>
              {profile?.role === "member"
                ? profile.email.split("@")[0]
                : "Demo workspace"}
            </strong>
            <small>
              {profile?.role === "member" ? "Member" : "Read-only viewer"}
            </small>
          </div>
          {profile ? (
            <button
              className="icon-button"
              title="Sign out"
              onClick={() => setProfile(null)}
            >
              <LogOut size={15} />
            </button>
          ) : (
            <Link className="icon-button" title="Sign in" to="/login">
              <ChevronsUpDown size={15} />
            </Link>
          )}
        </div>
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span className="divider">/</span>
            <strong>{active?.label || "Overview"}</strong>
          </div>
          <div className="topbar-actions">
            <label className="dataset-control">
              <Database size={14} />
              <select
                aria-label="Active dataset"
                value={dataset?.id || ""}
                onChange={(event) => selectDataset(Number(event.target.value))}
              >
                {datasets.length ? (
                  datasets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.is_demo ? "Demo dataset" : item.name}
                    </option>
                  ))
                ) : (
                  <option value="">Demo dataset</option>
                )}
              </select>
            </label>
            <button
              className="icon-button theme-button"
              aria-label={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            {profile ? (
              <Link
                to="/settings"
                className="avatar top-avatar"
                title="Account settings"
              >
                {profile.email.slice(0, 2).toUpperCase()}
              </Link>
            ) : (
              <Link className="button ghost small" to="/login">
                Sign in
              </Link>
            )}
          </div>
        </header>
        <main id="main">
          <Outlet />
        </main>
        <footer>
          <span>VERDICTRA</span>
          <span>Product Review Intelligence</span>
        </footer>
      </div>
    </div>
  );
}
