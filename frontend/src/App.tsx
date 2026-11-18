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
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
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
} from 'lucide-react';
import { cognitoAuth } from './auth/cognito';
import type { AccountView } from './auth/cognito';
import { config, hasCloudConfig, hasAuthConfig } from './config';
import { visualLevel } from './audio/sourceCapture';
import { audioFormatLabel, audioSourceExplanation } from './audio/sourcePresentation';
import {
  SeparateStreamAdapter,
  type SeparateStreamHandlers,
} from './services/separateStreamAdapter';
import { createFakeTranscribeTransport } from './services/fakeTranscribeSocket';
import type { CaptionPhase, CaptionView } from './lib/viewModels';
import { ContinuousTranscript } from './components/ContinuousTranscript';
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
    } catch (error: unknown) {
      const errorName = error instanceof Error ? error.name : 'UnknownError';

      setError(`Cognito request failed: ${errorName}. Check your network and Cognito setup.`);
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
          <div className="eyebrow">REAL-TIME AUDIO TRANSCRIPTION</div>
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
  const [checkingSession, setCheckingSession] = useState(config.mode === 'aws' && hasAuthConfig);
  const [page, setPage] = useState<Page>('live');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const storeRef = useRef(new MockSessionStore());
  const [version, setVersion] = useState(0);
  const [selectedId, setSelectedId] = useState(
    config.mode === 'aws' ? config.liveSessionId : 'demo-architecture',
  );
  const [renaming, setRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [toast, setToast] = useState('');
  const [micStatus, setMicStatus] = useState<
    'idle' | 'requesting' | 'recording' | 'paused' | 'error'
  >('idle');
  const [micError, setMicError] = useState('');
  const [useMicrophone, setUseMicrophone] = useState(true);
  const [useSystemAudio, setUseSystemAudio] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [micInputLevel, setMicInputLevel] = useState(0);
  const [systemInputLevel, setSystemInputLevel] = useState(0);
  const micDisplayLevel = visualLevel(micInputLevel);
  const systemDisplayLevel = visualLevel(systemInputLevel);
  const audioSelection = { microphone: useMicrophone, system: useSystemAudio };
  const micRef = useRef<SeparateStreamAdapter | null>(null);
  const captureRunRef = useRef(0);
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
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!micRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    if (config.mode === 'aws' && hasAuthConfig) {
      void cognitoAuth
        .currentUser()
        .then(setAccount)
        .finally(() => setCheckingSession(false));
    }
    return () => {
      window.removeEventListener('beforeunload', warnBeforeLeaving);
      for (const timer of timersRef.current) clearTimeout(timer);
      void micRef.current?.stop();
    };
  }, []);

  function navigateTo(nextPage: Page): void {
    if (nextPage !== 'live' && micRef.current) {
      setToast('Finalize the active transcript before leaving this session.');
      return;
    }
    setPage(nextPage);
  }

  function selectSession(id: string) {
    if (micRef.current) {
      setToast('Finalize the active transcript before opening another session.');
      return;
    }
    setSelectedId(id);
    setPage('history');
    setLiveDemoCaptions([]);
    setRenaming(false);
  }

  function newSession() {
    if (micRef.current) {
      setToast('Finalize the active transcript before creating another session.');
      return;
    }
    if (config.mode === 'aws') {
      setToast('Session creation awaits the reviewed Zod request schema.');
      return;
    }
    const created = storeRef.current.create();
    setSelectedId(created.id);
    setLiveDemoCaptions([]);
    captureRunRef.current = 0;
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
      setMicStatus('requesting');
      const active = micRef.current;
      try {
        await active?.pause();
        setMicStatus('paused');
        setToast(
          config.mode === 'mock'
            ? 'Paused. Resume will reuse the same audio permissions.'
            : 'Paused. The selected audio remains authorized for this session.',
        );
      } catch {
        setMicStatus('error');
        setMicError('Unable to pause transcription. Please retry.');
      }
      setMicInputLevel(0);
      setSystemInputLevel(0);
      return;
    }
    if (!consentGiven) {
      setMicError('Confirm participant notification and permission before starting.');
      return;
    }
    if (!useMicrophone && !useSystemAudio) {
      setMicError('Select Microphone, System audio, or both.');
      return;
    }
    if (config.mode === 'aws' && !hasCloudConfig) {
      setMicError(
        'Set VITE_API_BASE_URL to the deployed API Gateway URL before live transcription.',
      );
      return;
    }
    if (config.mode === 'aws' && !selectedId) {
      setMicError(
        'AWS transcription requires a session owned by your test account. Set VITE_LIVE_SESSION_ID.',
      );
      return;
    }
    setMicStatus('requesting');
    setMicError('');
    setMicInputLevel(0);
    setSystemInputLevel(0);
    const retained = micStatus === 'paused' ? micRef.current : null;
    if (retained) {
      try {
        await retained.resume();
        if (micRef.current === retained) setMicStatus('recording');
      } catch (error) {
        if (micRef.current !== retained) return;
        setMicInputLevel(0);
        setSystemInputLevel(0);
        setMicError(error instanceof Error ? error.message : 'Unable to resume transcription.');
        setMicStatus('paused');
      }
      return;
    }

    const captureRun = captureRunRef.current + 1;
    captureRunRef.current = captureRun;

    const adapter = new SeparateStreamAdapter({
      selection: { microphone: useMicrophone, system: useSystemAudio },
      stereo: config.mode === 'aws' && useMicrophone && useSystemAudio,
      requestStereoCapability: async (sessionId) => {
        const api = new TeamApi(config.apiBaseUrl, cognitoAuth.getAccessToken);
        const capability = await api.requestStereoStreamCapability(sessionId);
        // Fail closed: NEVER send two-channel PCM to a mono signed connection.
        const signed = new URL(capability.url);
        if (
          capability.channels !== 2 ||
          signed.searchParams.get('number-of-channels') !== '2' ||
          signed.searchParams.get('enable-channel-identification') !== 'true'
        ) {
          throw new Error(
            'The deployed AWS backend has not enabled stereo channel identification. Ask your teammate to deploy the v5 signer update.',
          );
        }
        return { url: capability.url, streamEpoch: capability.streamEpoch };
      },
      requestCapability:
        config.mode === 'mock'
          ? async () => ({
              url: 'wss://local-fake.invalid/stream-transcription-websocket',
              streamEpoch: Date.now(),
            })
          : async (sessionId) => {
              const api = new TeamApi(config.apiBaseUrl, cognitoAuth.getAccessToken);
              const capability = await api.requestStreamCapability(sessionId);
              return { url: capability.url, streamEpoch: capability.streamEpoch };
            },
      ...(config.mode === 'mock' ? { createTransport: createFakeTranscribeTransport } : {}),
      onCaptureStatus: (status) => {
        setMicInputLevel((previous) => Math.max(status.micLevel, previous * 0.35));
        setSystemInputLevel((previous) => Math.max(status.systemLevel, previous * 0.35));
      },
    });
    micRef.current = adapter;
    try {
      // adapter.start() begins getDisplayMedia before its first await.
      await adapter.start(selectedId, streamHandlers(adapter, captureRun));
      if (micRef.current === adapter) setMicStatus('recording');
    } catch (error) {
      if (micRef.current !== adapter) return;
      micRef.current = null;
      await adapter.stop().catch(() => undefined);
      setMicInputLevel(0);
      setSystemInputLevel(0);
      setMicError(error instanceof Error ? error.message : 'Unable to start transcription.');
      setMicStatus('error');
    }
  }

  function streamHandlers(
    adapter: SeparateStreamAdapter,
    captureRun: number,
  ): SeparateStreamHandlers {
    return {
      onCaption: (event) => {
        if (micRef.current !== adapter) return;
        const caption: CaptionView = {
          id: event.source + ':' + String(event.streamEpoch) + ':' + event.resultId,
          speaker: event.source === 'microphone' ? 'Microphone' : 'System audio',
          timestampMs: event.startMs,
          text: event.text,
          phase: event.phase,
          streamEpoch: captureRun,
        };
        setLiveDemoCaptions((current) => [
          ...current.filter((item) => item.id !== caption.id),
          caption,
        ]);
      },
      onFailure: (message) => {
        if (micRef.current !== adapter) return;
        micRef.current = null;
        setMicError(message);
        setMicStatus('error');
      },
      onDisconnected: () => {
        if (micRef.current !== adapter) return;
        micRef.current = null;
        setMicError(
          'The selected audio source ended. Choose the source again to continue this session.',
        );
        setMicStatus('error');
      },
    };
  }

  async function finishSession() {
    if (config.mode === 'aws' && micStatus === 'recording') {
      const active = micRef.current;
      setMicStatus('requesting');
      try {
        await active?.pause();
        setMicStatus('paused');
        setMicError(
          'Capture is paused. Finish again after every observed final shows as durably saved.',
        );
      } catch {
        setMicStatus('error');
        setMicError('Unable to settle the current transcription stream. Please retry.');
      }
      return;
    }
    const unsavedFinals = liveDemoCaptions.some((caption) => caption.phase === 'final-observed');
    if (config.mode === 'aws' && unsavedFinals) {
      setMicError(
        'This session still has final text awaiting durable acknowledgment. Finish is blocked to prevent transcript loss.',
      );
      return;
    }
    const active = micRef.current;
    setMicStatus('requesting');
    setMicError('');
    try {
      await active?.stop();
      if (micRef.current === active) micRef.current = null;
      if (config.mode === 'aws') {
        const api = new TeamApi(config.apiBaseUrl, cognitoAuth.getAccessToken);
        await api.completeSession(selectedId, {});
      } else if (storeRef.current.get(selectedId)) {
        for (const caption of liveDemoCaptions.filter(
          (entry) => entry.phase === 'final-observed' || entry.phase === 'save-acknowledged',
        )) {
          storeRef.current.saveCaption(selectedId, { ...caption, phase: 'save-acknowledged' });
        }
        refresh();
      }
      setMicStatus('idle');
      setMicInputLevel(0);
      setSystemInputLevel(0);
      setToast('Session finalized and closed.');
      setPage('history');
    } catch (error) {
      if (micRef.current === active) micRef.current = null;
      setMicStatus('paused');
      setMicError(error instanceof Error ? error.message : 'Unable to finalize this session.');
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
          streamEpoch: captureRunRef.current || 1,
        };
        setLiveDemoCaptions((current) => [
          ...current.filter((existing) => existing.id !== caption.id),
          caption,
        ]);
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
    if (micRef.current) {
      setToast('Finalize the active transcript before signing out.');
      return;
    }
    if (config.mode === 'aws') await cognitoAuth.logout();
    setAccount(null);
  }

  if (config.mode === 'aws' && !hasAuthConfig)
    return (
      <div className="config-page">
        <Cloud size={42} />
        <h1>Cloud integration is not configured</h1>
        <p>
          Set the public Cognito identifiers in <code>frontend/.env.local</code> before creating an
          account. An API Gateway URL is required later for live transcription.
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
      <aside
        className={`sidebar ${sidebarExpanded ? 'sidebar-expanded' : 'sidebar-collapsed'}`}
        aria-label="Main navigation"
      >
        <div className="brand">
          <span className="brand-mark">
            <AudioLines size={22} />
          </span>
          <span className="sidebar-copy">CloudScribe</span>
          <span className="brand-version sidebar-copy">beta</span>
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={sidebarExpanded ? 'Collapse navigation' : 'Expand navigation'}
            onClick={() => setSidebarExpanded((expanded) => !expanded)}
          >
            {sidebarExpanded ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>
        </div>
        <div className="sidebar-actions">
          <button className="new-button" onClick={newSession} title="New transcription session">
            <Plus size={18} /> <span className="sidebar-copy new-button-label">New session</span>
          </button>
        </div>
        <nav className="main-nav" aria-label="Workspace sections">
          {(['live', 'history', 'settings'] as const).map((name) => {
            const Icon = icons[name];
            return (
              <button
                key={name}
                onClick={() => navigateTo(name)}
                className={`nav-link ${page === name ? 'active' : ''}`}
                aria-current={page === name ? 'page' : undefined}
                title={
                  name === 'live'
                    ? 'Record'
                    : name === 'history'
                      ? 'Transcript library'
                      : 'Settings'
                }
              >
                <Icon size={18} />
                <span className="sidebar-copy">
                  {name === 'live'
                    ? 'Record'
                    : name === 'history'
                      ? 'Transcript library'
                      : 'Settings'}
                </span>
              </button>
            );
          })}
        </nav>
        {sessions.length > 0 && (
          <div className="sidebar-section sidebar-copy">
            <div className="sidebar-section-heading">
              <span>RECENT SESSIONS</span>
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
        )}
        <div className="sidebar-bottom">
          <div className="connection-status">
            <span className={`status-dot ${config.mode === 'aws' ? 'pending' : ''}`} />
            <span className="sidebar-copy">
              {config.mode === 'mock' ? 'Local demo' : 'AWS mode'}
            </span>
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
            <strong>CloudScribe</strong>
            <span>/</span>{' '}
            {page === 'live' ? 'Record' : page === 'history' ? 'Library' : 'Settings'}
          </div>
          <div className="topbar-right">
            <span className="top-label">
              <ShieldCheck size={15} /> {config.mode === 'mock' ? 'Demo mode' : 'Signed in'}
            </span>
            <button
              className="icon-button"
              aria-label="View settings"
              onClick={() => navigateTo('settings')}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </header>
        <main className={`content page-${page}`}>
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
                  <h1>Live transcription</h1>
                  <p>Select an audio source, start capture, and read one continuous transcript.</p>
                </div>
              </div>
              <section className="panel live-workspace">
                <header className="live-workspace-toolbar">
                  <div className="live-workspace-status">
                    <span
                      className={`status-dot ${
                        micStatus === 'recording'
                          ? 'recording'
                          : micStatus === 'paused'
                            ? 'paused'
                            : ''
                      }`}
                    />
                    <div>
                      <strong>
                        {micStatus === 'recording'
                          ? 'Recording'
                          : micStatus === 'paused'
                            ? 'Paused'
                            : 'Ready'}
                      </strong>
                      <span>{audioFormatLabel(config.mode, audioSelection)}</span>
                    </div>
                  </div>
                  <div className="live-session-actions">
                    {(micStatus === 'recording' || micStatus === 'paused') && (
                      <button className="secondary" onClick={() => void finishSession()}>
                        <Square size={14} /> Finish
                      </button>
                    )}
                    <button
                      className={micStatus === 'recording' ? 'danger' : 'primary'}
                      disabled={
                        micStatus === 'requesting' ||
                        (micStatus !== 'recording' &&
                          (!consentGiven || (!useMicrophone && !useSystemAudio)))
                      }
                      onClick={() => void toggleMicrophone()}
                    >
                      {micStatus === 'recording' ? (
                        <>
                          <Pause size={16} /> Pause
                        </>
                      ) : (
                        <>
                          <Mic size={17} />
                          {micStatus === 'requesting'
                            ? 'Working…'
                            : liveDemoCaptions.length
                              ? 'Resume'
                              : 'Start transcription'}
                        </>
                      )}
                    </button>
                  </div>
                </header>

                <div className="live-source-bar">
                  <div className="live-source-options" role="group" aria-label="Audio sources">
                    <label className={useMicrophone ? 'selected' : ''}>
                      <input
                        type="checkbox"
                        checked={useMicrophone}
                        disabled={
                          micStatus === 'requesting' ||
                          micStatus === 'recording' ||
                          (micStatus === 'paused' && micRef.current !== null)
                        }
                        onChange={(event) => setUseMicrophone(event.target.checked)}
                      />
                      <Mic size={16} />
                      <span>Microphone</span>
                    </label>
                    <label className={useSystemAudio ? 'selected' : ''}>
                      <input
                        type="checkbox"
                        checked={useSystemAudio}
                        disabled={
                          micStatus === 'requesting' ||
                          micStatus === 'recording' ||
                          (micStatus === 'paused' && micRef.current !== null)
                        }
                        onChange={(event) => setUseSystemAudio(event.target.checked)}
                      />
                      <AudioLines size={16} />
                      <span>System audio</span>
                    </label>
                  </div>
                  <span className="live-source-help">
                    {micRef.current && useSystemAudio
                      ? 'System audio is selected for this session. Pause and Resume keep the same shared tab authorized.'
                      : audioSourceExplanation(config.mode, audioSelection)}
                  </span>
                </div>

                <div className="live-consent-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={consentGiven}
                      disabled={micStatus === 'requesting' || micStatus === 'recording'}
                      onChange={(event) => setConsentGiven(event.target.checked)}
                    />
                    <span>I have permission to transcribe this audio.</span>
                  </label>
                  <div className="live-levels" aria-label="Audio input levels">
                    {useMicrophone && (
                      <span title={`Microphone level ${Math.round(micDisplayLevel * 100)}%`}>
                        Mic
                        <i style={{ width: `${Math.max(4, micDisplayLevel * 100)}%` }} />
                      </span>
                    )}
                    {useSystemAudio && (
                      <span title={`System audio level ${Math.round(systemDisplayLevel * 100)}%`}>
                        System
                        <i style={{ width: `${Math.max(4, systemDisplayLevel * 100)}%` }} />
                      </span>
                    )}
                  </div>
                </div>

                {micError && (
                  <div className="form-feedback live-error" role="alert">
                    {micError}
                  </div>
                )}

                <div className="live-document-shell" aria-live="polite">
                  <ContinuousTranscript
                    captions={selectedDisplay}
                    active={micStatus === 'recording'}
                    simulated={config.mode === 'mock'}
                  />
                </div>

                <footer className="live-workspace-footer">
                  <span>
                    {micStatus === 'recording'
                      ? 'Final results are appended to this document as they arrive.'
                      : micStatus === 'paused'
                        ? 'Paused sources stay authorized. Finish closes and saves the session.'
                        : 'The session is saved only when you finish it.'}
                  </span>
                  {config.mode === 'mock' && (
                    <button className="secondary small" onClick={playMockCaptions}>
                      <Sparkles size={14} /> Preview formatting
                    </button>
                  )}
                </footer>
              </section>
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
                        {session.captions.some(
                          (caption) => caption.phase === 'save-acknowledged',
                        ) ? (
                          <ContinuousTranscript
                            captions={session.captions.filter(
                              (caption) => caption.phase === 'save-acknowledged',
                            )}
                            simulated={config.mode === 'mock'}
                            context="history"
                          />
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
                    AudioWorklet forwards selected audio through the shared EventStream client. AWS
                    mode uses a signed capability from the session API.
                  </p>
                  <span className="tiny-status">CAPTURE-TO-STREAM CONNECTED</span>
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
      </div>
      {toast && (
        <button className="toast" onClick={() => setToast('')} role="status">
          {toast} <span>×</span>
        </button>
      )}
    </div>
  );
}
