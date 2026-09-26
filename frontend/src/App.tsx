import { useState } from 'react';
import { api, session } from './api/client';
import AppShell from './components/AppShell';
import Dashboard from './pages/Dashboard';
import InterviewRoom from './pages/InterviewRoom';
import Login from './pages/Login';
import NewInterview from './pages/NewInterview';
import RecruiterDashboard from './pages/RecruiterDashboard';
import Report from './pages/Report';

type Page = 'login' | 'dashboard' | 'new' | 'interview' | 'report';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!session.token());
  const [page, setPage] = useState<Page>(() => (session.token() ? 'dashboard' : 'login'));
  const [interviewId, setInterviewId] = useState<number | null>(null);
  const role = session.role();

  const goToNew = () => setPage('new');
  const goToDashboard = () => setPage('dashboard');
  const startInterview = (id: number) => {
    setInterviewId(id);
    setPage('interview');
  };
  const goToReport = (id: number) => {
    setInterviewId(id);
    setPage('report');
  };
  const handleLogin = () => {
    setIsAuthenticated(true);
    setPage('dashboard');
  };
  const handleLogout = () => {
    api.auth.logout().catch(() => {}); // revoke the session server-side; sign out locally regardless
    session.clear();
    setIsAuthenticated(false);
    setPage('login');
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  // The interview room is a full-screen, distraction-free experience.
  if (page === 'interview' && interviewId && role === 'candidate') {
    return <InterviewRoom id={interviewId} onFinish={() => goToReport(interviewId)} onExit={goToDashboard} />;
  }

  return (
    <AppShell page={page} role={role} userName={session.name()} onDashboard={goToDashboard} onNew={goToNew} onLogout={handleLogout}>
      {page === 'dashboard' &&
        (role === 'recruiter' ? (
          <RecruiterDashboard onReport={goToReport} />
        ) : (
          <Dashboard onNew={goToNew} onInterview={startInterview} onReport={goToReport} />
        ))}
      {page === 'new' && role === 'candidate' && <NewInterview onBack={goToDashboard} onCreated={startInterview} />}
      {page === 'report' && interviewId && <Report id={interviewId} onBack={goToDashboard} />}
    </AppShell>
  );
}
