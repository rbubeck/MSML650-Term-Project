import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Activity,
  AudioLines,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  Clock3,
  Cloud,
  Download,
  FileAudio,
  FileText,
  HardDrive,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Mic,
  MoreHorizontal,
  Plus,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  UserCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { cognitoAuth } from './auth/cognito';
import type { AccountView } from './auth/cognito';
import { config, hasCloudConfig } from './config';
import { MicrophoneCapture } from './audio/microphone';
import { formatClock } from './lib/viewModels';
import type { CaptionPhase, CaptionView } from './lib/viewModels';
import { exportDemoTranscript, MockSessionStore } from './services/mockSessions';
import { TeamApi } from './services/teamApi';

const icons = { studio: LayoutDashboard, live: Radio, history: BookOpen, settings: Settings2 };
type Page = keyof typeof icons;

function makeDemoAccount(): AccountView {
  return { label: 'Demo researcher', mode: 'demo' };
}

function friendlyDate(date: string): string {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function phaseLabel(phase: CaptionPhase): string {
  return {
    partial: 'Live · partial',
    'final-observed': 'Final observed',
    saving: 'Saving…',
    'save-acknowledged': 'Saved ✓',
    'save-failed': 'Save failed',
  }[phase];
}

function Banner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div className={`notice notice-${tone}`} role="status">
      <CircleAlert size={16} />
      {children}
    </div>
  );
}

function AuthScreen({ onSignedIn }: { onSignedIn: (account: AccountView) => void }) {
  const [authPage, setAuthPage] = useState<'login' | 'register' | 'confirm'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (authPage === 'login') onSignedIn(await cognitoAuth.login(email, password));
      else if (authPage === 'register') {
        await cognitoAuth.register(email, password);
        setAuthPage('confirm');
      } else {
        await cognitoAuth.confirm(email, code);
        setAuthPage('login');
        setError('Email verified. Sign in to continue.');
      }
    } catch {
      setError('Unable to complete this step. Verify your details and Cognito configuration.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-visual">
        <div className="brand light">
          <span className="brand-mark">
            <AudioLines size={23} />
          </span>{' '}
          CloudScribe
        </div>
        <div className="auth-intro">
          <div className="eyebrow">THE FUTURE OF MEETING NOTES</div>
          <h1>
            Every conversation,
            <br />
            <em>captured clearly.</em>
          </h1>
          <p>A seamless transcription workspace built for secure, real-time collaboration.</p>
          <div className="decor-wave">
            <AudioLines size={120} strokeWidth={1} />
            <AudioLines size={120} strokeWidth={1} />
            <AudioLines size={120} strokeWidth={1} />
          </div>
        </div>
        <small>MSML 650 · Cloud Computing Project</small>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-form">
          <div className="eyebrow">WELCOME TO CLOUDSCRIBE</div>
          <h2>
            {authPage === 'login'
              ? 'Sign in to your workspace'
              : authPage === 'register'
                ? 'Create your account'
                : 'Verify your email'}
          </h2>
          <p className="muted">
            {config.mode === 'mock'
              ? 'Preview every screen without AWS.'
              : 'Secure sign-in powered by Amazon Cognito.'}
          </p>
          {config.mode === 'mock' ? (
            <>
              <button className="primary full" onClick={() => onSignedIn(makeDemoAccount())}>
                Explore workspace <span>↗</span>
              </button>
              <Banner>Demo only. No AWS calls, real transcription, or persistent accounts.</Banner>
            </>
          ) : (
            <form onSubmit={(event) => void submit(event)}>
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              {authPage !== 'confirm' ? (
                <>
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    autoComplete={authPage === 'login' ? 'current-password' : 'new-password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </>
              ) : (
                <>
                  <label htmlFor="code">Email confirmation code</label>
                  <input
                    id="code"
                    required
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </>
              )}
              <button className="primary full" disabled={busy}>
                {busy
                  ? 'Working…'
                  : authPage === 'login'
                    ? 'Sign in'
                    : authPage === 'register'
                      ? 'Sign up'
                      : 'Verify email'}
              </button>
              {error && (
                <p className="form-feedback" role="status">
                  {error}
                </p>
              )}
              <button
                className="text-link"
                type="button"
                onClick={() => {
                  setError('');
                  setAuthPage(authPage === 'login' ? 'register' : 'login');
                }}
              >
                {authPage === 'login' ? 'New here? Create an account' : 'Back to sign in'}
              </button>
            </form>
          )}
          <div className="auth-security">
            <ShieldCheck size={16} /> No audio or private transcripts are saved by this frontend
            preview.
          </div>
        </div>
      </div>
    </div>
  );
}

function CaptionRow({ caption }: { caption: CaptionView }) {
  const saved = caption.phase === 'save-acknowledged';
  return (
    <div className={`caption-row phase-${caption.phase}`}>
      <div className="avatar">{caption.speaker.endsWith('2') ? 'B' : 'A'}</div>
      <div className="caption-body">
        <div className="caption-head">
          <strong>{caption.speaker}</strong>
          <time>{formatClock(caption.timestampMs)}</time>
          <span
            className={`phase-indicator ${saved ? 'saved' : ''}`}
            aria-label={phaseLabel(caption.phase)}
          >
            {saved ? (
              <CheckCheck size={13} />
            ) : caption.phase === 'saving' ? (
              <Clock3 size={13} />
            ) : (
              <span className="dot" />
            )}
            {phaseLabel(caption.phase)}
          </span>
        </div>
        <p>{caption.text}</p>
      </div>
    </div>
  );
}

function EmptyTranscript() {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <AudioLines size={28} />
      </div>
      <h3>Every word has a place.</h3>
      <p>
        Start a microphone check or run the clearly marked sample captions to explore the interface.
      </p>
    </div>
  );
}

export function App() {
  const [account, setAccount] = useState<AccountView | null>(null);
  const [checkingSession, setCheckingSession] = useState(config.mode === 'aws' && hasCloudConfig);
  const [page, setPage] = useState<Page>('studio');
  const [query, setQuery] = useState('');
  const storeRef = useRef(new MockSessionStore());
  const [version, setVersion] = useState(0);
  const [selectedId, setSelectedId] = useState('demo-architecture');
  const [renaming, setRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [toast, setToast] = useState('');
  const [micStatus, setMicStatus] = useState<'idle' | 'requesting' | 'recording' | 'error'>('idle');
  const [micError, setMicError] = useState('');
  const [micChunks, setMicChunks] = useState(0);
  const [micNativeRate, setMicNativeRate] = useState(0);
  const micRef = useRef<MicrophoneCapture | null>(null);
  const [liveDemoCaptions, setLiveDemoCaptions] = useState<CaptionView[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [apiHealth, setApiHealth] = useState<'unknown' | 'checking' | 'reachable' | 'unavailable'>(
    'unknown',
  );

  const sessions = useMemo(
    () => (config.mode === 'mock' ? storeRef.current.list() : []),
    [version],
  );
  const session = useMemo(
    () => sessions.find((entry) => entry.id === selectedId),
    [selectedId, sessions],
  );
  const filtered = sessions.filter((entry) =>
    entry.title.toLowerCase().includes(query.toLowerCase()),
  );
  const refresh = () => setVersion((current) => current + 1);

  useEffect(() => {
    if (config.mode === 'aws' && hasCloudConfig) {
      void cognitoAuth
        .currentUser()
        .then(setAccount)
        .finally(() => setCheckingSession(false));
    }
    return () => {
      for (const timer of timersRef.current) clearTimeout(timer);
      void micRef.current?.stop();
    };
  }, []);

  function selectSession(id: string) {
    setSelectedId(id);
    setPage('history');
    setLiveDemoCaptions([]);
    setRenaming(false);
  }

  function newSession() {
    if (config.mode === 'aws') {
      setToast('Session creation awaits the reviewed Zod request schema.');
      return;
    }
    const created = storeRef.current.create();
    setSelectedId(created.id);
    setLiveDemoCaptions([]);
    setPage('live');
    refresh();
  }

  function renameSession() {
    if (!session) return;
    if (config.mode === 'aws') {
      setToast('Cloud rename will use the approved PATCH /v1/sessions/{id} contract.');
      return;
    }
    storeRef.current.rename(session.id, newTitle);
    refresh();
    setRenaming(false);
  }

  function deleteSession(id: string) {
    if (config.mode === 'aws') return;
    if (!window.confirm('Delete this demo transcript?')) return;
    storeRef.current.delete(id);
    if (selectedId === id) setSelectedId(storeRef.current.list()[0]?.id ?? '');
    setLiveDemoCaptions([]);
    refresh();
  }

  async function toggleMicrophone() {
    if (micStatus === 'recording') {
      await micRef.current?.stop();
      micRef.current = null;
      setMicStatus('idle');
      setToast('Microphone stopped. Captured PCM was not stored or uploaded.');
      return;
    }
    setMicStatus('requesting');
    setMicError('');
    setMicChunks(0);
    const capture = new MicrophoneCapture(
      () => {
        /* No raw PCM is persisted or transmitted in this scaffold. */
      },
      (status) => {
        setMicChunks(status.receivedChunks);
        setMicNativeRate(status.sampleRate);
      },
    );
    try {
      await capture.start();
      micRef.current = capture;
      setMicStatus('recording');
    } catch {
      micRef.current = null;
      setMicError(
        'Microphone access was blocked or is unavailable. Check browser permissions and HTTPS/localhost.',
      );
      setMicStatus('error');
    }
  }

  function playMockCaptions() {
    if (config.mode !== 'mock') return;
    const id = selectedId;
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current = [];
    const base = Date.now();
    const steps: Array<{ delay: number; text: string; phase: CaptionPhase }> = [
      { delay: 100, text: 'The cloud integration', phase: 'partial' },
      {
        delay: 900,
        text: 'The cloud integration starts with secure authentication.',
        phase: 'partial',
      },
      {
        delay: 1_650,
        text: 'The cloud integration starts with secure authentication.',
        phase: 'final-observed',
      },
      {
        delay: 2_150,
        text: 'The cloud integration starts with secure authentication.',
        phase: 'saving',
      },
      {
        delay: 2_850,
        text: 'The cloud integration starts with secure authentication.',
        phase: 'save-acknowledged',
      },
    ];
    const resultId = `demo-final-${base}`;
    for (const item of steps) {
      const timer = setTimeout(() => {
        const caption: CaptionView = {
          id: resultId,
          speaker: 'Speaker 1',
          timestampMs: 0,
          text: item.text,
          phase: item.phase,
        };
        setLiveDemoCaptions([caption]);
        if (item.phase === 'save-acknowledged' && storeRef.current.get(id)) {
          storeRef.current.saveCaption(id, caption);
          refresh();
        }
      }, item.delay);
      timersRef.current.push(timer);
    }
  }

  async function checkApi() {
    if (config.mode !== 'aws' || !hasCloudConfig) return;
    setApiHealth('checking');
    try {
      const api = new TeamApi(config.apiBaseUrl, cognitoAuth.getAccessToken);
      // Response deliberately remains unknown until shared Zod application schemas exist.
      await api.listSessions();
      setApiHealth('reachable');
    } catch {
      setApiHealth('unavailable');
    }
  }

  async function logout() {
    if (config.mode === 'aws') await cognitoAuth.logout();
    setAccount(null);
  }

  if (config.mode === 'aws' && !hasCloudConfig)
    return (
      <div className="config-page">
        <Cloud size={42} />
        <h1>Cloud integration is not configured</h1>
        <p>
          Set the public Cognito identifiers and deployed API URL in <code>frontend/.env</code>{' '}
          before starting AWS mode.
        </p>
        <pre>
          VITE_APP_MODE=aws{'\n'}VITE_API_BASE_URL=https://…{'\n'}VITE_COGNITO_USER_POOL_ID=…{'\n'}
          VITE_COGNITO_CLIENT_ID=…{'\n'}VITE_COGNITO_REGION=…
        </pre>
        <p>No secret keys belong in frontend variables.</p>
      </div>
    );
  if (checkingSession)
    return (
      <div className="config-page">
        <div className="spinner" />
        <p>Checking sign-in session…</p>
      </div>
    );
  if (!account) return <AuthScreen onSignedIn={setAccount} />;

  const selectedDisplay: CaptionView[] =
    page === 'live' && liveDemoCaptions.length > 0 ? liveDemoCaptions : (session?.captions ?? []);

  return (
    <div className="app-frame">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark">
            <AudioLines size={22} />
          </span>
          <span>CloudScribe</span>
          <span className="brand-version">beta</span>
        </div>
        <div className="sidebar-actions">
          <button className="new-button" onClick={newSession}>
            <Plus size={18} /> New session <span>⌘ K</span>
          </button>
        </div>
        <nav className="main-nav" aria-label="Workspace sections">
          {(['studio', 'live', 'history', 'settings'] as const).map((name) => {
            const Icon = icons[name];
            return (
              <button
                key={name}
                onClick={() => setPage(name)}
                className={`nav-link ${page === name ? 'active' : ''}`}
                aria-current={page === name ? 'page' : undefined}
              >
                <Icon size={18} />
                {name === 'studio'
                  ? 'Workspace'
                  : name === 'live'
                    ? 'Live transcription'
                    : name === 'history'
                      ? 'Transcript library'
                      : 'Settings'}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-section">
          <div className="sidebar-section-heading">
            <span>YOUR SESSIONS</span>
            <MoreHorizontal size={16} />
          </div>
          <div className="sidebar-session-list">
            {sessions.slice(0, 8).map((item) => (
              <button
                key={item.id}
                className={`sidebar-session ${selectedId === item.id ? 'selected' : ''}`}
                onClick={() => selectSession(item.id)}
              >
                <FileText size={15} />
                <span>{item.title}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="connection-status">
            <span className={`status-dot ${config.mode === 'aws' ? 'pending' : ''}`} />
            {config.mode === 'mock' ? 'Local demo environment' : 'AWS integration mode'}
          </div>
          <button className="profile" onClick={() => void logout()} title="Sign out">
            <div className="profile-avatar">
              <UserCircle size={23} />
            </div>
            <div>
              <strong>{account.label}</strong>
              <small>{account.mode === 'demo' ? 'Demo account' : 'Cognito account'}</small>
            </div>
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{' '}
            <strong>
              {page === 'studio'
                ? 'Overview'
                : page === 'live'
                  ? 'Live studio'
                  : page === 'history'
                    ? 'Transcript library'
                    : 'Settings'}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="top-label">
              <ShieldCheck size={15} />{' '}
              {config.mode === 'mock' ? 'Safe demo mode' : 'Cognito enabled'}
            </span>
            <button
              className="icon-button"
              aria-label="View settings"
              onClick={() => setPage('settings')}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </header>
        <main className="content">
          {config.mode === 'mock' ? (
            <Banner>
              <strong>Demo mode:</strong> captions and sessions use fake data. Microphone checks
              capture real PCM locally but do not send or save audio.
            </Banner>
          ) : (
            <Banner tone="warn">
              <strong>AWS integration:</strong> Cognito is configurable; API routes remain proposed,
              and the shared streaming client is not yet implemented.
            </Banner>
          )}

          {page === 'studio' && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <div className="eyebrow accent">YOUR TRANSCRIPTION WORKSPACE</div>
                  <h1>
                    Turn conversations into <span>clarity.</span>
                  </h1>
                  <p>
                    Capture important moments, follow live captions, and return to what matters—all
                    in one workspace.
                  </p>
                  <div className="hero-buttons">
                    <button
                      className="primary"
                      onClick={() => {
                        setPage('live');
                        if (config.mode === 'mock' && !session) newSession();
                      }}
                    >
                      <Mic size={18} /> Open live studio
                    </button>
                    <button className="secondary" onClick={() => setPage('history')}>
                      <BookOpen size={17} /> View transcripts
                    </button>
                  </div>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orb orb-a" />
                  <div className="orb orb-b" />
                  <div className="hero-wave">
                    <AudioLines size={142} strokeWidth={1.1} />
                  </div>
                  <div className="floating-chip">
                    <span className="pulse-dot" /> Capturing ideas in real time
                  </div>
                </div>
              </section>
              <div className="section-title">
                <div>
                  <h2>Start something new</h2>
                  <p>Everything you need for a productive conversation.</p>
                </div>
              </div>
              <div className="feature-grid">
                <button className="feature-card" onClick={() => setPage('live')}>
                  <span className="feature-icon violet">
                    <Mic size={23} />
                  </span>
                  <div>
                    <h3>Live transcription</h3>
                    <p>Prepare your microphone, see captions, and track save acknowledgments.</p>
                  </div>
                  <span className="feature-arrow">↗</span>
                </button>
                <button className="feature-card" onClick={() => setPage('history')}>
                  <span className="feature-icon blue">
                    <FileText size={23} />
                  </span>
                  <div>
                    <h3>Transcript library</h3>
                    <p>Find previous sessions, rename them, and export saved text.</p>
                  </div>
                  <span className="feature-arrow">↗</span>
                </button>
                <div className="feature-card feature-disabled">
                  <span className="feature-icon orange">
                    <FileAudio size={23} />
                  </span>
                  <div>
                    <h3>Batch audio upload</h3>
                    <p>Planned extension. Not part of the initial Option A streaming scope.</p>
                  </div>
                  <span className="coming-soon">Later</span>
                </div>
              </div>
              <div className="section-title recent-title">
                <div>
                  <h2>Recent transcripts</h2>
                  <p>Pick up where you left off.</p>
                </div>
                <button className="quiet-link" onClick={() => setPage('history')}>
                  View all →
                </button>
              </div>
              <div className="session-table">
                <div className="table-header">
                  <span>SESSION</span>
                  <span>LANGUAGE</span>
                  <span>DATE</span>
                  <span></span>
                </div>
                {sessions.slice(0, 4).map((entry) => (
                  <button
                    className="table-row"
                    key={entry.id}
                    onClick={() => selectSession(entry.id)}
                  >
                    <span className="session-name">
                      <FileText size={18} />
                      <strong>{entry.title}</strong>
                    </span>
                    <span className="muted">{entry.language}</span>
                    <span className="muted">{friendlyDate(entry.createdAt)}</span>
                    <ChevronDown className="rotate-left" size={17} />
                  </button>
                ))}
              </div>
            </>
          )}

          {page === 'live' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow accent">LIVE STUDIO</div>
                  <h1>Capture the conversation</h1>
                  <p>
                    Review real microphone PCM preparation and clearly distinguished caption/save
                    states.
                  </p>
                </div>
                <span className="pill">
                  <Radio size={15} /> Audio workspace
                </span>
              </div>
              <div className="live-grid">
                <section className="panel recording-panel">
                  <div className="panel-top">
                    <span className="panel-kicker">
                      <span
                        className={`status-dot ${micStatus === 'recording' ? 'recording' : ''}`}
                      />
                      {micStatus === 'recording' ? 'Microphone recording' : 'Microphone idle'}
                    </span>
                    <span className="mode-label">16 kHz • Mono • PCM 16-bit</span>
                  </div>
                  <div className={`record-visual ${micStatus === 'recording' ? 'active' : ''}`}>
                    <div className="record-circle">
                      <Mic size={38} />
                    </div>
                    <div className="wave-bars" aria-hidden="true">
                      {Array.from({ length: 23 }, (_, index) => (
                        <span key={index} style={{ height: `${16 + ((index * 23) % 48)}px` }} />
                      ))}
                    </div>
                  </div>
                  <h2>
                    {micStatus === 'recording'
                      ? 'Microphone capture active'
                      : 'Ready to test your microphone?'}
                  </h2>
                  <p>
                    With your permission, audio is resampled off the UI thread. No audio is
                    transmitted in this scaffold.
                  </p>
                  <div className="live-stats">
                    <div>
                      <strong>{micChunks}</strong>
                      <span>PCM chunks</span>
                    </div>
                    <div>
                      <strong>
                        {micNativeRate ? `${(micNativeRate / 1_000).toFixed(1)} kHz` : '—'}
                      </strong>
                      <span>Browser input</span>
                    </div>
                    <div>
                      <strong>16 kHz</strong>
                      <span>PCM output</span>
                    </div>
                  </div>
                  <button
                    className={
                      micStatus === 'recording'
                        ? 'danger recording-button'
                        : 'primary recording-button'
                    }
                    disabled={micStatus === 'requesting'}
                    onClick={() => void toggleMicrophone()}
                  >
                    {micStatus === 'recording' ? (
                      <>
                        <Square size={17} /> Stop capture
                      </>
                    ) : (
                      <>
                        <Mic size={18} />{' '}
                        {micStatus === 'requesting' ? 'Requesting permission…' : 'Test microphone'}
                      </>
                    )}
                  </button>
                  {micError && (
                    <div className="form-feedback" role="alert">
                      {micError}
                    </div>
                  )}
                  <p className="consent-note">
                    <LockKeyhole size={13} /> Microphone access begins only when you press the
                    button. Captured PCM is discarded after the check.
                  </p>
                </section>
                <section className="panel captions-panel">
                  <div className="panel-top">
                    <div>
                      <strong>Live captions</strong>
                      <p>Reviewable transcript states</p>
                    </div>
                    <div className="live-pill">
                      <span /> {config.mode === 'mock' ? 'Simulated' : 'Not connected'}
                    </div>
                  </div>
                  <div className="captions-scroller" aria-live="polite">
                    {selectedDisplay.length ? (
                      selectedDisplay.map((caption) => (
                        <CaptionRow key={caption.id} caption={caption} />
                      ))
                    ) : (
                      <EmptyTranscript />
                    )}
                  </div>
                  <div className="caption-footer">
                    <div className="caption-legend">
                      <span>
                        <span className="dot purple" /> Partial
                      </span>
                      <span>
                        <span className="dot orange" /> Final observed
                      </span>
                      <span>
                        <CheckCheck size={12} /> Saved
                      </span>
                    </div>
                    {config.mode === 'mock' ? (
                      <button className="secondary small" onClick={playMockCaptions}>
                        <Sparkles size={15} /> Play sample captions
                      </button>
                    ) : (
                      <button
                        className="secondary small"
                        disabled
                        title="Pending Person 3 stream client and accepted contracts"
                      >
                        <WifiOff size={15} /> Streaming integration pending
                      </button>
                    )}
                  </div>
                </section>
              </div>
              <Banner>
                In the real AWS flow, final text must be acknowledged by the session API before the
                UI marks it saved. Partial captions are never durable.
              </Banner>
            </>
          )}

          {page === 'history' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow accent">YOUR LIBRARY</div>
                  <h1>Transcript history</h1>
                  <p>Organized conversations with explicit saved-result visibility.</p>
                </div>
                <span className="pill">
                  <FileText size={15} />
                  {config.mode === 'mock'
                    ? `${sessions.length} demo sessions`
                    : 'Integration pending'}
                </span>
              </div>
              <div className="history-layout">
                <div className="panel history-list">
                  <div className="library-search">
                    <Search size={17} />
                    <input
                      aria-label="Search session titles"
                      placeholder="Search sessions…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                  <div className="history-items">
                    {filtered.map((entry) => (
                      <button
                        className={`history-item ${selectedId === entry.id ? 'active' : ''}`}
                        key={entry.id}
                        onClick={() => selectSession(entry.id)}
                      >
                        <span className="history-icon">
                          <FileText size={19} />
                        </span>
                        <span className="history-label">
                          <strong>{entry.title}</strong>
                          <small>
                            {friendlyDate(entry.createdAt)} · {entry.language}
                          </small>
                        </span>
                      </button>
                    ))}
                    {filtered.length === 0 && <p className="padded-muted">No matching sessions.</p>}
                  </div>
                </div>
                <div className="panel history-detail">
                  {session ? (
                    <>
                      <div className="detail-top">
                        <div>
                          <div className="eyebrow accent">TRANSCRIPT</div>
                          {renaming ? (
                            <div className="rename-row">
                              <input
                                aria-label="Rename session"
                                maxLength={80}
                                value={newTitle}
                                onChange={(event) => setNewTitle(event.target.value)}
                              />
                              <button
                                className="icon-button"
                                onClick={renameSession}
                                aria-label="Save title"
                              >
                                <Check size={18} />
                              </button>
                            </div>
                          ) : (
                            <h2>{session.title}</h2>
                          )}
                          <p>
                            {friendlyDate(session.createdAt)} · {session.language} ·{' '}
                            {session.captions.length} saved segments
                          </p>
                        </div>
                        <div className="detail-actions">
                          <button
                            className="icon-button"
                            aria-label="Rename transcript"
                            title="Rename"
                            disabled={config.mode === 'aws'}
                            onClick={() => {
                              setNewTitle(session.title);
                              setRenaming(true);
                            }}
                          >
                            <Settings2 size={16} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Download transcript"
                            title="Export TXT"
                            disabled={config.mode === 'aws'}
                            onClick={() => exportDemoTranscript(session)}
                          >
                            <Download size={17} />
                          </button>
                          <button
                            className="icon-button danger-outline"
                            aria-label="Delete transcript"
                            title="Delete"
                            disabled={config.mode === 'aws'}
                            onClick={() => deleteSession(session.id)}
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </div>
                      <div className="detail-meta">
                        <span>
                          <Clock3 size={14} />
                          {Math.max(1, Math.ceil(session.durationSeconds / 60))} min
                        </span>
                        <span>
                          <CheckCheck size={14} /> Demo saved finals
                        </span>
                      </div>
                      <div className="detail-caption-list">
                        {session.captions.length ? (
                          session.captions
                            .filter((caption) => caption.phase === 'save-acknowledged')
                            .map((caption) => <CaptionRow key={caption.id} caption={caption} />)
                        ) : (
                          <EmptyTranscript />
                        )}
                      </div>
                      <div className="detail-bottom">
                        <LockKeyhole size={14} /> History in this preview is memory-only and resets
                        on refresh.
                      </div>
                    </>
                  ) : (
                    <EmptyTranscript />
                  )}
                </div>
              </div>
            </>
          )}

          {page === 'settings' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow accent">SYSTEM READINESS</div>
                  <h1>Integration overview</h1>
                  <p>Know exactly which pieces are real, mocked or awaiting team acceptance.</p>
                </div>
              </div>
              <div className="settings-grid">
                <section className="panel setting-card">
                  <div className="setting-icon">
                    <UserCircle size={22} />
                  </div>
                  <h3>Authentication</h3>
                  <p>
                    {config.mode === 'mock'
                      ? 'Local demo account only.'
                      : 'Amazon Cognito client configured. Backend identity enforcement remains the API owner’s responsibility.'}
                  </p>
                  <span className="tiny-status">
                    {config.mode === 'mock' ? 'FAKE-BACKED' : 'COGNITO CLIENT'}
                  </span>
                </section>
                <section className="panel setting-card">
                  <div className="setting-icon">
                    <Activity size={22} />
                  </div>
                  <h3>Streaming</h3>
                  <p>
                    AudioWorklet is prepared. EventStream and signed connections belong exclusively
                    to the reviewed stream-client package.
                  </p>
                  <span className="tiny-status warning">INTEGRATION PENDING</span>
                </section>
                <section className="panel setting-card">
                  <div className="setting-icon">
                    <HardDrive size={22} />
                  </div>
                  <h3>Persistence</h3>
                  <p>
                    DynamoDB-backed session APIs and private S3 exports must be deployed and
                    approved by the backend team.
                  </p>
                  <span className="tiny-status warning">SCHEMA PENDING</span>
                </section>
              </div>
              {config.mode === 'aws' && (
                <section className="panel api-check">
                  <div>
                    <h3>API connectivity</h3>
                    <p>
                      Calls GET /v1/sessions with the Cognito access token. Does not infer a
                      response shape.
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => void checkApi()}
                    disabled={apiHealth === 'checking'}
                  >
                    <Wifi size={17} /> {apiHealth === 'checking' ? 'Checking…' : 'Test control API'}
                  </button>
                  <span role="status">
                    {apiHealth === 'reachable'
                      ? 'HTTP request succeeded; contract parsing is still pending.'
                      : apiHealth === 'unavailable'
                        ? 'API request failed. Check deployment, CORS, authorizer and contract.'
                        : ''}
                  </span>
                </section>
              )}
              <section className="panel architecture-note">
                <h3>Accepted team architecture · Option A</h3>
                <div className="architecture-flow">
                  <span>React UI + AudioWorklet</span>
                  <span>→</span>
                  <span>Shared stream client</span>
                  <span>→</span>
                  <span>Amazon Transcribe</span>
                </div>
                <div className="architecture-flow secondary-flow">
                  <span>Cognito token</span>
                  <span>→</span>
                  <span>API Gateway + Lambda</span>
                  <span>→</span>
                  <span>DynamoDB / S3</span>
                </div>
                <p>
                  Important: No 16-byte application header, no browser AWS secret, and no raw
                  microphone archive in the accepted initial design.
                </p>
              </section>
            </>
          )}
        </main>
        <footer className="footer">
          <span>CloudScribe • MSML 650</span>
          <span>
            {config.mode === 'mock'
              ? 'No AWS charges · Demo data only'
              : 'AWS account authorization required for paid testing'}
          </span>
        </footer>
      </div>
      {toast && (
        <button className="toast" onClick={() => setToast('')} role="status">
          {toast} <span>×</span>
        </button>
      )}
    </div>
  );
}
