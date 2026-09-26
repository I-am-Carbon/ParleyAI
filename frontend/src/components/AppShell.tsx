import type { ReactNode } from 'react';
import { IconGrid, IconLogOut, IconPlus } from './icons';
import { Avatar, Button, Logo, cn } from './ui';

interface Props {
  page: string;
  role: 'candidate' | 'recruiter';
  userName: string;
  onDashboard: () => void;
  onNew: () => void;
  onLogout: () => void;
  children: ReactNode;
}

export default function AppShell({ page, role, userName, onDashboard, onNew, onLogout, children }: Props) {
  const nav =
    role === 'recruiter'
      ? [{ key: 'dashboard', label: 'Candidates', icon: IconGrid, onClick: onDashboard }]
      : [
          { key: 'dashboard', label: 'Dashboard', icon: IconGrid, onClick: onDashboard },
          { key: 'new', label: 'New interview', icon: IconPlus, onClick: onNew },
        ];
  const candidateName = userName;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6">
          <button onClick={onDashboard} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label="Home">
            <Logo />
          </button>

          <nav className="hidden items-center gap-1 sm:flex">
            {nav.map((n) => (
              <button
                key={n.key}
                onClick={n.onClick}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                  page === n.key ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right md:block">
              <div className="text-sm font-medium leading-tight text-slate-900">{candidateName || 'Account'}</div>
              <div className="text-xs text-slate-500">{role === 'recruiter' ? 'Recruiter' : 'Candidate'}</div>
            </div>
            <Avatar name={candidateName || '?'} size="sm" className="ring-slate-100" />
            <div className="h-6 w-px bg-slate-200" />
            <Button variant="ghost" size="sm" onClick={onLogout} aria-label="Log out">
              <IconLogOut />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">{children}</main>
    </div>
  );
}
