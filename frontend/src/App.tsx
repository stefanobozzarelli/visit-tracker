import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useOfflineSync } from './hooks/useOfflineSync';
import { useDataPreload } from './hooks/useDataPreload';
import { useOfflineDatabaseInit } from './hooks/useOfflineDatabaseInit';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Clients } from './pages/Clients';
import { ClientDetail } from './pages/ClientDetail';
import { Companies } from './pages/Companies';
import { Visits } from './pages/Visits';
import { NewVisit } from './pages/NewVisit';
import { VisitDetail } from './pages/VisitDetail';
import { ReportDetail } from './pages/ReportDetail';
import { ExportPdf } from './pages/ExportPdf';
import { Tasks } from './pages/Tasks';
import { Settings } from './pages/Settings';
import { TodoForm } from './pages/TodoForm';
import { OrderForm } from './pages/OrderForm';
import './styles/App.css';

const AppInitializer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useOfflineDatabaseInit();
  useOfflineSync();
  useDataPreload();
  return <>{children}</>;
};

const AppContent: React.FC = () => {
  return (
    <AppInitializer>
      <Routes>
        {/* Public routes — no sidebar */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected routes — inside sidebar layout */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/visits" element={<Visits />} />
          <Route path="/visits/new" element={<NewVisit />} />
          <Route path="/visits/:id" element={<VisitDetail />} />
          <Route path="/visits/:visitId/reports/:reportId" element={<ReportDetail />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/contacts" element={<Clients />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/reports" element={<ExportPdf />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/todos/new" element={<TodoForm />} />
          <Route path="/orders/new/:visitId" element={<OrderForm />} />
          <Route path="/orders/:id/edit" element={<OrderForm />} />
        </Route>

        {/* Redirects from old paths */}
        <Route path="/clients" element={<Navigate to="/contacts" replace />} />
        <Route path="/my-todos" element={<Navigate to="/tasks" replace />} />
        <Route path="/export-pdf" element={<Navigate to="/reports" replace />} />
        <Route path="/admin/users" element={<Navigate to="/settings" replace />} />
        <Route path="/admin/todos" element={<Navigate to="/tasks" replace />} />
        <Route path="/admin/permissions/view" element={<Navigate to="/settings" replace />} />
        <Route path="/admin/permissions/assign" element={<Navigate to="/settings" replace />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppInitializer>
  );
};

export const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
};

export default App;
