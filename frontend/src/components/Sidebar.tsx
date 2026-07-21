import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { productConfig } from '../config/product';

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, organization, token } = useAuth();
  const [awaitingShipment, setAwaitingShipment] = useState(0);
  const [actionCount, setActionCount] = useState(0);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('gilded_darkMode');
      if (stored !== null) return stored === 'true';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Apply dark mode
  useEffect(() => {
    const html = document.documentElement;
    if (darkMode) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    localStorage.setItem('gilded_darkMode', String(darkMode));
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  useEffect(() => {
    if (!token) return;
    api.get<{ pagination: { total: number } }>('/orders?fulfillmentStatus=AwaitingShipment&limit=1', token)
      .then(res => setAwaitingShipment(res.pagination.total))
      .catch(() => {});
    api.get<{ total: number }>('/actions/count', token)
      .then(res => setActionCount(res.total))
      .catch(() => {});
  }, [token]);

  const navItems = [
    { label: 'Dashboard', path: '/', icon: '📊', badge: null },
    { label: 'Inventory', path: '/inventory', icon: '💎', badge: null },
    { label: 'Listings', path: '/listings', icon: '🏪', badge: null },
    { label: 'Orders', path: '/orders', icon: '📦', badge: awaitingShipment > 0 ? awaitingShipment.toString() : null },
    { label: 'Revenue', path: '/revenue', icon: '💰', badge: null },
    { label: 'Expenses', path: '/expenses', icon: '📉', badge: null },
    { label: 'Calculator', path: '/calculator', icon: '🧮', badge: null },
    { label: 'Analytics', path: '/analytics', icon: '📈', badge: null },
    { label: 'Action Center', path: '/actions', icon: '⚡', badge: actionCount > 0 ? actionCount.toString() : null },
    { label: 'Storage', path: '/storage', icon: '🗄️', badge: null },
    { label: 'Tags', path: '/tags', icon: '🏷️', badge: null },
    { label: 'Integrations', path: '/integrations', icon: '🔗', badge: null },
    { label: 'Reports', path: '/reports', icon: '📋', badge: null },
    { label: 'Settings', path: '/settings', icon: '⚙️', badge: null },
  ];

  const bottomItems = [
    { label: 'Scan QR', path: '/scan-qr', icon: '📷', badge: null },
  ];

  const roleLabel = (role: string) => {
    const labels: Record<string, string> = {
      Owner: 'Owner',
      Manager: 'Manager',
      ListingAssistant: 'Listing Asst.',
      FulfillmentAssistant: 'Fulfill. Asst.',
      ReadOnly: 'Read Only',
    };
    return labels[role] || role;
  };

  const roleColor = (role: string) => {
    const colors: Record<string, string> = {
      Owner: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
      Manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      ListingAssistant: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      FulfillmentAssistant: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      ReadOnly: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden fixed top-3 left-3 z-50 bg-white dark:bg-gray-800 p-2 rounded-lg shadow border border-gray-200 dark:border-gray-700"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-xl">{collapsed ? '☰' : '✕'}</span>
      </button>

      {/* Overlay for mobile */}
      {!collapsed && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-30"
          onClick={() => setCollapsed(true)}
        />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col h-screen
        transition-transform duration-200
        ${collapsed ? '-translate-x-full lg:translate-x-0' : 'translate-x-0'}
      `}>
        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
          <h1 className="font-serif font-bold text-xl text-primary-800 dark:text-primary-300">{productConfig.productName}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{organization?.name || productConfig.niche}</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => { if (window.innerWidth < 1024) setCollapsed(true); }}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-100 text-primary-900 dark:bg-primary-900 dark:text-primary-100'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  item.label === 'Action Center'
                    ? 'bg-red-500 text-white'
                    : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                }`}>
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}

          <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

          {bottomItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => { if (window.innerWidth < 1024) setCollapsed(true); }}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-100 text-primary-900 dark:bg-primary-900 dark:text-primary-100'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white transition-colors"
          >
            <span className="text-lg">{darkMode ? '☀️' : '🌙'}</span>
            <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </nav>

        {/* User info at bottom */}
        {user && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-sm font-bold text-primary-700 dark:text-primary-300">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user.name}</p>
                <span className={`inline-block text-xs px-1.5 py-0.5 rounded-full font-medium mt-0.5 ${roleColor(user.role)}`}>
                  {roleLabel(user.role)}
                </span>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
