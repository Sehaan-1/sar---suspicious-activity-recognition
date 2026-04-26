import { Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { LayoutDashboard, Video, AlertTriangle, Settings as SettingsIcon, LogOut } from 'lucide-react';
import { cn } from './lib/utils';
import { isAuthenticated, logout } from './lib/auth';
import Dashboard from './pages/Dashboard';
import Events from './pages/Events';
import Feeds from './pages/Feeds';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Analytics from './pages/Analytics';
import { BarChart3 } from 'lucide-react';

// ---------------------------------------------------------------------------
// PrivateRoute — wraps all protected pages
// ---------------------------------------------------------------------------
function PrivateRoute({ children }: { children: React.ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />;
}

// ---------------------------------------------------------------------------
// Sidebar + page shell (only shown when authenticated)
// ---------------------------------------------------------------------------
function AppShell() {
  const location = useLocation();
  const navigate  = useNavigate();

  const navItems = [
    { name: 'Dashboard',  path: '/',        icon: LayoutDashboard },
    { name: 'Live Feeds', path: '/feeds',   icon: Video },
    { name: 'Events Log', path: '/events',  icon: AlertTriangle },
    { name: 'Analytics',  path: '/analytics', icon: BarChart3 },
    { name: 'Settings',   path: '/settings', icon: SettingsIcon },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white rounded-full"></div>
          </div>
          <h1 className="font-bold tracking-tight text-xl">SAR.ai</h1>
        </div>

        <nav className="flex-1 p-4 space-y-1 block">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium text-sm",
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-500 hover:bg-slate-50"
                )}
              >
                {isActive ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0"></span>
                ) : (
                  <div className="w-1.5 h-1.5 shrink-0"></div>
                )}
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Bottom bar — system status + logout */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-2">
          <div className="flex items-center gap-3 px-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 italic">
              System Online: 15 FPS
            </span>
          </div>
          <button
            id="logout-btn"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-slate-400
                       hover:bg-red-50 hover:text-red-500 transition-colors text-sm font-medium"
          >
            <LogOut size={15} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        <Routes>
          <Route path="/"         element={<Dashboard />} />
          <Route path="/feeds"    element={<Feeds />} />
          <Route path="/events"   element={<Events />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={
            <div className="flex-1 flex items-center justify-center flex-col gap-4 text-[#8b949e]">
              <Video size={48} className="opacity-20" />
              <p>Module under construction</p>
            </div>
          } />
        </Routes>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root App — public /login route + protected everything else
// ---------------------------------------------------------------------------
function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Protected — redirect to /login if not authenticated */}
      <Route path="/*" element={
        <PrivateRoute>
          <AppShell />
        </PrivateRoute>
      } />
    </Routes>
  );
}

export default App;
