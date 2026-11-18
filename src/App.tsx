import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { FirebaseProvider } from './context/FirebaseContext';
import { FacilitatorPage } from './pages/FacilitatorPage';
import { HomePage } from './pages/HomePage';
import { ParticipantPage } from './pages/ParticipantPage';
import { PresentationPage } from './pages/PresentationPage';

function AppShell() {
  const { pathname } = useLocation();
  const isPresentationMode = pathname.startsWith('/layar');

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col">
      {!isPresentationMode && <Header />}
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/fasilitator" element={<FacilitatorPage />} />
          <Route path="/layar/:kode" element={<PresentationPage />} />
          <Route path="/peserta" element={<ParticipantPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <FirebaseProvider>
        <HashRouter>
          <AppShell />
        </HashRouter>
      </FirebaseProvider>
    </ErrorBoundary>
  );
}
