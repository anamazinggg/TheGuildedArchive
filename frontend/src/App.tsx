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
import Integrations from './pages/Integrations';
import Listings from './pages/Listings';
import ListingDetail from './pages/ListingDetail';
import ListingTemplates from './pages/ListingTemplates';
import CreateListing from './pages/CreateListing';
import Orders from './pages/Orders';
import Revenue from './pages/Revenue';
import Expenses from './pages/Expenses';
import Calculator from './pages/Calculator';
import Analytics from './pages/Analytics';
import ActionCenter from './pages/ActionCenter';
import Reports from './pages/Reports';
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
        <Route path="/inventory/:id/create-listing" element={<CreateListing />} />
        <Route path="/tags" element={<TagsPage />} />
        <Route path="/storage" element={<StoragePage />} />
        <Route path="/storage/:id" element={<StoragePage />} />
        <Route path="/scan-qr" element={<ScanQR />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/listings" element={<Listings />} />
        <Route path="/listings/templates" element={<ListingTemplates />} />
        <Route path="/listings/:id" element={<ListingDetail />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<Orders />} />
        <Route path="/revenue" element={<Revenue />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/calculator" element={<Calculator />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/actions" element={<ActionCenter />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
