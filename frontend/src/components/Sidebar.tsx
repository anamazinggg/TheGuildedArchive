import { useState } from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { label: 'Dashboard', path: '/', icon: '📊', badge: null },
  { label: 'Inventory', path: '/inventory', icon: '💎', badge: null },
  { label: 'Listings', path: '/listings', icon: '🏪', badge: null },
  { label: 'Orders', path: '/orders', icon: '📦', badge: '0' },
  { label: 'Revenue', path: '/revenue', icon: '💰', badge: null },
  { label: 'Expenses', path: '/expenses', icon: '📉', badge: null },
  { label: 'Analytics', path: '/analytics', icon: '📈', badge: null },
  { label: 'Action Center', path: '/actions', icon: '⚡', badge: '!' },
  { label: 'Storage', path: '/storage', icon: '🗄️', badge: null },
  { label: 'Tags', path: '/tags', icon: '🏷️', badge: null },
  { label: 'Integrations', path: '/integrations', icon: '🔗', badge: null },
  { label: 'Reports', path: '/reports', icon: '📋', badge: null },
  { label: 'Settings', path: '/settings', icon: '⚙️', badge: null },
];

const bottomItems = [
  { label: 'Scan QR', path: '/scan-qr', icon: '📷', badge: null },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden fixed top-3 left-3 z-50 bg-white p-2 rounded-lg shadow border border-gray-200"
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
        w-64 bg-white border-r border-gray-200 flex flex-col h-screen
        transition-transform duration-200
        ${collapsed ? '-translate-x-full lg:translate-x-0' : 'translate-x-0'}
      `}>
        <div className="p-5 border-b border-gray-200">
          <h1 className="font-serif font-bold text-xl text-primary-800">The Gilded Archive</h1>
          <p className="text-xs text-gray-500 mt-1">Inventory Management</p>
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
                    ? 'bg-primary-100 text-primary-900'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  item.badge === '!'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}

          <div className="border-t border-gray-200 my-2" />

          {bottomItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => { if (window.innerWidth < 1024) setCollapsed(true); }}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-100 text-primary-900'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
