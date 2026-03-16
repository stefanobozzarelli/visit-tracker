import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Header } from './components/Header';
import { ProtectedRoute } from './components/ProtectedRoute';
import { OfflineIndicator } from './components/OfflineIndicator';
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
import { AssignPermissions } from './pages/AssignPermissions';
import { ViewPermissions } from './pages/ViewPermissions';
import { ExportPdf } from './pages/ExportPdf';
import { MyTodos } from './pages/MyTodos';
import { AdminTodos } from './pages/AdminTodos';
import { TodoForm } from './pages/TodoForm';
import { OrderForm } from './pages/OrderForm';
import './styles/App.css';

export const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <OfflineIndicator />
        <Header />
        <main>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clients"
              element={
                <ProtectedRoute>
                  <Clients />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clients/:id"
              element={
                <ProtectedRoute>
                  <ClientDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/companies"
              element={
                <ProtectedRoute>
                  <Companies />
                </ProtectedRoute>
              }
            />
            <Route
              path="/visits"
              element={
                <ProtectedRoute>
                  <Visits />
                </ProtectedRoute>
              }
            />
            <Route
              path="/visits/new"
              element={
                <ProtectedRoute>
                  <NewVisit />
                </ProtectedRoute>
              }
            />
            <Route
              path="/visits/:id"
              element={
                <ProtectedRoute>
                  <VisitDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/visits/:visitId/reports/:reportId"
              element={
                <ProtectedRoute>
                  <ReportDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/permissions/assign"
              element={
                <ProtectedRoute>
                  <AssignPermissions />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/permissions/view"
              element={
                <ProtectedRoute>
                  <ViewPermissions />
                </ProtectedRoute>
              }
            />
            <Route
              path="/export-pdf"
              element={
                <ProtectedRoute>
                  <ExportPdf />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-todos"
              element={
                <ProtectedRoute>
                  <MyTodos />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/todos"
              element={
                <ProtectedRoute>
                  <AdminTodos />
                </ProtectedRoute>
              }
            />
            <Route
              path="/todos/new"
              element={
                <ProtectedRoute>
                  <TodoForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders/new/:visitId"
              element={
                <ProtectedRoute>
                  <OrderForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders/:id/edit"
              element={
                <ProtectedRoute>
                  <OrderForm />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </AuthProvider>
    </Router>
  );
};

export default App;
