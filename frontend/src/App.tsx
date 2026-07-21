import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import InventoryList from './pages/InventoryList';
import InventoryDetail from './pages/InventoryDetail';
import InventoryImport from './pages/InventoryImport';
import TagsPage from './pages/Tags';
import StoragePage from './pages/Storage';
import ScanQR from './pages/ScanQR';
import PlaceholderPage from './pages/Placeholder';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventory" element={<InventoryList />} />
        <Route path="/inventory/new" element={<InventoryDetail />} />
        <Route path="/inventory/:id" element={<InventoryDetail />} />
        <Route path="/inventory/import" element={<InventoryImport />} />
        <Route path="/tags" element={<TagsPage />} />
        <Route path="/storage" element={<StoragePage />} />
        <Route path="/storage/:id" element={<StoragePage />} />
        <Route path="/scan-qr" element={<ScanQR />} />
        <Route path="/listings" element={<PlaceholderPage title="Listings" />} />
        <Route path="/orders" element={<PlaceholderPage title="Orders" />} />
        <Route path="/revenue" element={<PlaceholderPage title="Revenue" />} />
        <Route path="/expenses" element={<PlaceholderPage title="Expenses" />} />
        <Route path="/analytics" element={<PlaceholderPage title="Analytics" />} />
        <Route path="/actions" element={<PlaceholderPage title="Action Center" />} />
        <Route path="/integrations" element={<PlaceholderPage title="Integrations" />} />
        <Route path="/reports" element={<PlaceholderPage title="Reports" />} />
        <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
