import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useOfflineSync } from './hooks/useOfflineSync';
import { useDataPreload } from './hooks/useDataPreload';
import { useOfflineDatabaseInit } from './hooks/useOfflineDatabaseInit';
import { Login } from './pages/Login';
import { Profile } from './pages/Profile';
import { Dashboard } from './pages/Dashboard';
import { Clients } from './pages/Clients';
import { ClientDetail } from './pages/ClientDetail';
import { ClientForm } from './pages/ClientForm';
import { Companies } from './pages/Companies';
import { Visits } from './pages/Visits';
import { NewVisit } from './pages/NewVisit';
import { VisitDetail } from './pages/VisitDetail';
import { ReportDetail } from './pages/ReportDetail';
import { ExportPdf } from './pages/ExportPdf';
import { Reports } from './pages/Reports';
import { Tasks } from './pages/Tasks';
import { Settings } from './pages/Settings';
import { Revenue } from './pages/Revenue';
import { Amministrazione } from './pages/Amministrazione';
import { TodoForm } from './pages/TodoForm';
import { OrderForm } from './pages/OrderForm';
import { Projects } from './pages/Projects';
import { ProjectForm } from './pages/ProjectForm';
import { Claims } from './pages/Claims';
import { ClaimForm } from './pages/ClaimForm';
import { CompanyVisits } from './pages/CompanyVisits';
import { CompanyVisitForm } from './pages/CompanyVisitForm';
import { CompanyVisitDetail } from './pages/CompanyVisitDetail';
import { Showrooms } from './pages/Showrooms';
import { ShowroomForm } from './pages/ShowroomForm';
import { ShowroomDetail } from './pages/ShowroomDetail';
import { ShowroomMap } from './pages/ShowroomMap';
import { Offers } from './pages/Offers';
import { OfferForm } from './pages/OfferForm';
import { OfferDetail } from './pages/OfferDetail';
import { CompanyDetail } from './pages/CompanyDetail';
import { ProjectDetail } from './pages/ProjectDetail';
import { TodoDetail } from './pages/TodoDetail';
import { ClaimDetail } from './pages/ClaimDetail';
import { Orders } from './pages/Orders';
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
        <Route path="/register" element={<Navigate to="/login" replace />} />

        {/* Protected routes — inside sidebar layout */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/visits" element={<Visits />} />
          <Route path="/visits/new" element={<NewVisit />} />
          <Route path="/visits/:id/edit" element={<NewVisit />} />
          <Route path="/visits/:id" element={<VisitDetail />} />
          <Route path="/visits/:visitId/reports/:reportId" element={<ReportDetail />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/companies/:id" element={<CompanyDetail />} />
          <Route path="/contacts" element={<Clients />} />
          <Route path="/contacts/:id/edit" element={<ClientForm />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/new" element={<ProjectForm />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects/:id/edit" element={<ProjectForm />} />
          <Route path="/company-visits" element={<CompanyVisits />} />
          <Route path="/company-visits/new" element={<CompanyVisitForm />} />
          <Route path="/company-visits/:id" element={<CompanyVisitDetail />} />
          <Route path="/company-visits/:id/edit" element={<CompanyVisitForm />} />
          <Route path="/showrooms" element={<Showrooms />} />
          <Route path="/showrooms/map" element={<ShowroomMap />} />
          <Route path="/showrooms/new" element={<ShowroomForm />} />
          <Route path="/showrooms/:id" element={<ShowroomDetail />} />
          <Route path="/showrooms/:id/edit" element={<ShowroomForm />} />
          <Route path="/offers" element={<Offers />} />
          <Route path="/offers/new" element={<OfferForm />} />
          <Route path="/offers/:id" element={<OfferDetail />} />
          <Route path="/offers/:id/edit" element={<OfferForm />} />
          <Route path="/claims" element={<Claims />} />
          <Route path="/claims/new" element={<ClaimForm />} />
          <Route path="/claims/:id" element={<ClaimDetail />} />
          <Route path="/claims/:id/edit" element={<ClaimForm />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/legacy" element={<ExportPdf />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/revenue" element={<Navigate to="/amministrazione/fatturato" replace />} />
          <Route path="/amministrazione" element={<Navigate to="/amministrazione/fatturato" replace />} />
          <Route path="/amministrazione/*" element={<Amministrazione />} />
          <Route path="/todos/new" element={<TodoForm />} />
          <Route path="/todos/:id" element={<TodoDetail />} />
          <Route path="/todos/edit/:id" element={<TodoForm />} />
          <Route path="/orders" element={<Orders />} />
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
