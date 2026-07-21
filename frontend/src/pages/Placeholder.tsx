import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PlaceholderPage({ title }: { title: string }) {
  const { user } = useAuth();

  if (title === 'Settings') {
    return (
      <div>
        <h1 className="font-serif font-bold text-2xl text-gray-900 dark:text-white mb-6">Settings</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {user?.role === 'Owner' && (
            <Link to="/settings/users" className="card hover:shadow-md transition-shadow">
              <span className="text-2xl">👥</span>
              <h2 className="font-semibold text-gray-900 dark:text-white mt-3">Staff Users</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage staff accounts and permissions</p>
            </Link>
          )}
          <Link to="/settings/activity" className="card hover:shadow-md transition-shadow">
            <span className="text-2xl">📜</span>
            <h2 className="font-semibold text-gray-900 dark:text-white mt-3">Activity Log</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">View all system activity and changes</p>
          </Link>
          <div className="card opacity-50">
            <span className="text-2xl">🔔</span>
            <h2 className="font-semibold text-gray-900 dark:text-white mt-3">Notifications</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Coming soon</p>
          </div>
          <div className="card opacity-50">
            <span className="text-2xl">📧</span>
            <h2 className="font-semibold text-gray-900 dark:text-white mt-3">Email Settings</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Coming soon</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <h1 className="font-serif font-bold text-2xl text-gray-900 dark:text-white mb-2">{title}</h1>
      <p className="text-gray-400 dark:text-gray-500">Coming soon</p>
    </div>
  );
}
