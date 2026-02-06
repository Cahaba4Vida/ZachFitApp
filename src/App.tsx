import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import netlifyIdentity from 'netlify-identity-widget';
import { api } from './lib/api';
import { MeResponse } from './lib/types';
import { t, setLang } from './lib/i18n';

netlifyIdentity.init();

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const onChange = () => setReduced(!!mq.matches);
    onChange();
    // eslint-disable-next-line deprecation/deprecation
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    return () => {
      // eslint-disable-next-line deprecation/deprecation
      mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}

function CountUp({
  value,
  duration = 360,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const prefersReduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState<number>(value);
  const prevRef = React.useRef<number>(value);

  useEffect(() => {
    if (prefersReduced) {
      prevRef.current = value;
      setDisplay(value);
      return;
    }

    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) {
      setDisplay(value);
      return;
    }

    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // calm ease-out

    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const v = from + (to - from) * ease(p);
      setDisplay(Math.round(v));
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, prefersReduced]);

  return <span className={className}>{display}</span>;
}

function Nav({ me }: { me: MeResponse | null }) {
  const role = me?.user.role;
  return (
    <nav className="ff-nav">
      <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : undefined)}>Home</NavLink>
      {me && (
        <>
          <NavLink to="/today" className={({ isActive }) => (isActive ? 'active' : undefined)}>Today</NavLink>
          <NavLink to="/progress" className={({ isActive }) => (isActive ? 'active' : undefined)}>Progress</NavLink>
          <NavLink to="/history" className={({ isActive }) => (isActive ? 'active' : undefined)}>History</NavLink>
        </>
      )}
      {me && <NavLink to="/inbox" className={({ isActive }) => (isActive ? 'active' : undefined)}>Inbox</NavLink>}
      {me && <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : undefined)}>Settings</NavLink>}
      {me && (role === 'admin' || role === 'super_admin') && (
        <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : undefined)}>Admin</NavLink>
      )}
      <span className="ff-spacer" />
      {!me ? (
        <button className="ff-btn-primary" onClick={() => netlifyIdentity.open()}>{t('login')}</button>
      ) : (
        <button onClick={() => netlifyIdentity.logout()}>{t('logout')}</button>
      )}
    </nav>
  );

}

function RebuildInfo() {
  const [info, setInfo] = useState<{ daysLeft: number; endDate: string } | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await api.get('/api/today');
        if (!res?.program?.end_date) return;
        const end = new Date(String(res.program.end_date) + 'T00:00:00Z');
        const now = new Date();
        const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
        setInfo({ daysLeft, endDate: String(res.program.end_date) });
      } catch {
        // ignore
      }
    };
    void run();
  }, []);

  if (!info) return null;

  const pct = Math.min(100, Math.max(0, Math.round(((28 - info.daysLeft) / 28) * 100)));
  return (
    <div className="ff-card ff-card-pad ff-fade-in" style={{ margin: '12px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <b>Next rebuild</b>
        <span className="ff-muted">
          <CountUp value={info.daysLeft} className="ff-num ff-num-sm" /> days
        </span>
      </div>
      <div className="ff-progress-track" style={{ marginTop: 10 }}>
        <div className="ff-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <div className="ff-muted" style={{ marginTop: 8 }}>Program ends: {info.endDate}</div>
    </div>
  );
}


function FormsDueBanner({ me }: { me: MeResponse | null }) {
  if (!me) return null;
  const due = me.onboarding.forms_due_at ? new Date(me.onboarding.forms_due_at) : null;
  const required = !!me.onboarding.forms_required_now;
  const signed = me.onboarding.forms_signed_all;
  if (!due || signed) return null;

  const now = new Date();
  const ms = due.getTime() - now.getTime();
  const days = Math.ceil(ms / 86400000);

  if (required) return null; // hard gate handled on pages

  // Show banner starting day 5 (i.e., when <= 2 days left to 7-day deadline, or if already past but not required flag)
  if (days > 2) return null;

  return (
    <div className="ff-banner-warn">
      <b>Forms due:</b>{' '}
      {days <= 0 ? (
        'Due now'
      ) : (
        <>
          Due in <CountUp value={days} className="ff-num" /> day{days === 1 ? '' : 's'}
        </>
      )}
      .{' '}
      <Link to="/onboarding">Sign now</Link>
    </div>
  );
}



function SplashScreen({ phase }: { phase: 'show' | 'hide' }) {
  return (
    <div className={phase === 'hide' ? 'ff-splash is-exiting' : 'ff-splash'} aria-hidden="true" />
  );
}

export default function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [identityUser, setIdentityUser] = useState<any>(() => netlifyIdentity.currentUser());
  const [profileStatus, setProfileStatus] = useState<'idle'|'loading'|'ready'|'error'>('idle');
  const [profileError, setProfileError] = useState<string | null>(null);

  const [banner, setBanner] = useState<string | null>(null);
  const [onbGoal, setOnbGoal] = useState<'strength'|'hypertrophy'|'fat_loss'>('strength');
  const [onbExperience, setOnbExperience] = useState<'beginner'|'intermediate'|'advanced'>('beginner');
  const [onbDays, setOnbDays] = useState<number>(3);
  const [onbEquipment, setOnbEquipment] = useState<string>('full_gym');
  const [onbConstraints, setOnbConstraints] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const location = useLocation();
  const nav = useNavigate();

  const [splashPhase, setSplashPhase] = useState<'show' | 'hide' | 'gone'>('show');

  useEffect(() => {
    // Initial load splash: short, calm, and non-blocking. Respects reduced-motion in CSS.
    const t1 = window.setTimeout(() => setSplashPhase('hide'), 650);
    const t2 = window.setTimeout(() => setSplashPhase('gone'), 900);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);


  const refreshMe = async (opts: { treatFailureAsLogout?: boolean } = {}) => {
  setLoading(true);
  setProfileStatus('loading');
  setProfileError(null);
  try {
    const data = await api.get<MeResponse>('/api/me');
    setMe(data);
    setLang(data.settings.language);
    setProfileStatus('ready');
  } catch (e: any) {
    const msg = String(e?.message || '');
    const looksLikeAuth = /login required|forbidden|unauthorized/i.test(msg);

    // If the backend says we aren't logged in, our Identity session is stale/missing a token.
    // Clear it so the UI can recover (show login) instead of hanging.
    if (looksLikeAuth) {
      try { netlifyIdentity.logout(); } catch { /* ignore */ }
      setIdentityUser(null);
      setMe(null);
      setLang('en');
      setProfileStatus('idle');
      setProfileError(null);
      return;
    }

    // Important: a backend failure is NOT the same as being logged out.
    // Only treat it as logout if we truly have no identity user.
    if (opts.treatFailureAsLogout || !netlifyIdentity.currentUser()) {
      setMe(null);
      setLang('en');
      setIdentityUser(null);
    }
    setProfileStatus('error');
    setProfileError(msg || 'Failed to load your profile');
  } finally {
    setLoading(false);
  }
};


  useEffect(() => {
  const onLogin = (user: any) => {
    setIdentityUser(user);
    // Go to a dedicated callback route that waits for a usable token and bootstraps the app state.
    if (location.pathname !== '/auth/callback') nav('/auth/callback', { replace: true });
    // Allow the callback route to render immediately; it will manage its own loading state.
    setLoading(false);
  };
  const onLogout = () => {
    setIdentityUser(null);
    setMe(null);
    setProfileStatus('idle');
    setProfileError(null);
    setLang('en');
    if (location.pathname !== '/') nav('/', { replace: true });
  };

  netlifyIdentity.on('login', onLogin);
  netlifyIdentity.on('logout', onLogout);

  // On initial load, if an identity session exists, bootstrap via callback.
  const u = netlifyIdentity.currentUser();
  if (u) {
    setIdentityUser(u);
    if (location.pathname !== '/auth/callback') nav('/auth/callback', { replace: true });
    // Allow the callback route to render immediately.
    setLoading(false);
  } else {
    // Not logged in: we can attempt /me, but failures should be treated as logged out.
    void refreshMe({ treatFailureAsLogout: true });
  }

  return () => {
    netlifyIdentity.off('login', onLogin);
    netlifyIdentity.off('logout', onLogout);
  };
}, []);


  useEffect(() => {
    // refresh auth-gated views on route change
    if (me) void refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const ctx = useMemo(() => ({ me, refreshMe }), [me]);

  return (
    <div className="ff-app">
      {splashPhase !== 'gone' && <SplashScreen phase={splashPhase === 'hide' ? 'hide' : 'show'} />}
      <Nav me={me} />
      <FormsDueBanner me={me} />
      <div className="ff-container">
        {(loading && location.pathname !== '/auth/callback') ? (
          <div>Loading...</div>
        ) : (
          <div className="ff-route" key={location.pathname}>

            <Routes>
              <Route path="/auth/callback" element={<AuthCallback me={me} setMe={setMe} refreshMe={refreshMe} profileStatus={profileStatus} profileError={profileError} />} />
            <Route path="/" element={<Home me={me} isAuthed={!!identityUser} profileStatus={profileStatus} profileError={profileError} />} />
            <Route path="/onboarding" element={<Onboarding me={me} onDone={ctx.refreshMe} />} />
            <Route path="/today" element={<Today me={me} />} />
            <Route path="/progress" element={<Progress me={me} />} />
            <Route path="/history" element={<History me={me} />} />
            <Route path="/settings" element={<Settings me={me} onSaved={ctx.refreshMe} />} />
            <Route path="/inbox" element={<Inbox me={me} />} />
            <Route path="/admin/*" element={<Admin me={me} />} />
            <Route path="*" element={<NotFound />} />
            </Routes>

          </div>
        )}
      </div>
    </div>
  );
}




function AuthCallback({
  me,
  setMe,
  refreshMe,
  profileStatus,
  profileError,
}: {
  me: MeResponse | null;
  setMe: (m: MeResponse | null) => void;
  refreshMe: (opts?: { treatFailureAsLogout?: boolean }) => Promise<void>;
  profileStatus: 'idle'|'loading'|'ready'|'error';
  profileError: string | null;
}) {
  const nav = useNavigate();

  const waitForJwt = async () => {
    const user = netlifyIdentity.currentUser();
    if (!user) throw new Error('No identity session');
    // Retry a few times—right after signup the token can be briefly unavailable.
    let lastErr: any = null;
    for (let i = 0; i < 6; i++) {
      try {
        // Prefer non-forced jwt first (less fragile), then fall back to forced refresh.
        const tok = await (user.jwt ? user.jwt() : Promise.resolve((user as any).token?.access_token));
        if (tok) return tok;
      } catch (e) {
        lastErr = e;
      }
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
    // final attempt forced
    try {
      const tok = await (user.jwt ? user.jwt(true) : Promise.resolve(null));
      if (tok) return tok;
    } catch (e) {
      lastErr = e;
    }
    throw new Error(lastErr?.message || 'Token not ready');
  };

  const bootstrap = async () => {
    await waitForJwt();
    await refreshMe({ treatFailureAsLogout: false });
  };

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!me) return;
    if (me.onboarding.program_created) nav('/today', { replace: true });
    else nav('/onboarding', { replace: true });
  }, [me, nav]);

  const loggedInEmail = (() => {
    const u = netlifyIdentity.currentUser();
    return u?.email || u?.user_metadata?.email || '';
  })();

  return (
    <div className="ff-fade-in" style={{ maxWidth: 560, margin: '22px auto 0' }}>
      <div className="ff-card ff-card-pad">
        <h1 style={{ marginBottom: 8 }}>Setting up your account…</h1>
        <p className="ff-text-3" style={{ marginTop: 0 }}>
          {loggedInEmail ? `Signed in as ${loggedInEmail}` : 'Signed in'}
        </p>

        {profileStatus === 'loading' && (
          <div className="ff-text-3" style={{ marginTop: 10 }}>Loading your profile…</div>
        )}

        {profileStatus === 'error' && (
          <div style={{ marginTop: 12 }}>
            <div className="ff-badge ff-badge-warn">Couldn’t load your profile</div>
            <div className="ff-text-3" style={{ marginTop: 8, fontSize: 12 }}>
              {profileError || 'Please try again.'}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="ff-btn-primary" onClick={() => void bootstrap()}>Retry</button>
              <button className="ff-btn" onClick={() => netlifyIdentity.logout()}>Log out</button>
            </div>
          </div>
        )}

        {profileStatus === 'ready' && (
          <div className="ff-text-3" style={{ marginTop: 10 }}>Redirecting…</div>
        )}
      </div>
    </div>
  );
}
function Home({
  me,
  isAuthed,
  profileStatus,
  profileError,
}: {
  me: MeResponse | null;
  isAuthed: boolean;
  profileStatus: 'idle' | 'loading' | 'ready' | 'error';
  profileError: string | null;
}) {
  // If we already have profile state, route immediately.
  const nav = useNavigate();
  useEffect(() => {
    if (!me) return;
    if (me.onboarding.program_created) nav('/today', { replace: true });
    else nav('/onboarding', { replace: true });
  }, [me, nav]);

  // Identity says logged in, but profile isn't ready yet.
  if (!me && isAuthed) {
    return (
      <div className="ff-fade-in" style={{ maxWidth: 560, margin: '22px auto 0' }}>
        <div className="ff-card ff-card-pad">
          <h1 style={{ marginBottom: 8 }}>Signed in</h1>

          {profileStatus === 'loading' && <p className="ff-text-3">Loading your profile…</p>}

          {profileStatus === 'error' && (
            <>
              <div className="ff-badge ff-badge-warn">Profile load failed</div>
              <p className="ff-text-3" style={{ marginTop: 10 }}>{profileError || 'Please retry.'}</p>
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <Link className="ff-btn-primary" to="/auth/callback">Retry</Link>
                <button className="ff-btn" onClick={() => netlifyIdentity.logout()}>Log out</button>
              </div>
            </>
          )}

          {profileStatus === 'idle' && (
            <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link className="ff-btn-primary" to="/auth/callback">Continue</Link>
              <button className="ff-btn" onClick={() => netlifyIdentity.logout()}>Log out</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Not logged in: show landing + login
  if (!me) {
    return (
      <div className="ff-fade-in" style={{ maxWidth: 560, margin: '22px auto 0' }}>
        <div className="ff-card ff-card-pad">
          <h1 style={{ marginBottom: 8 }}>FITFLOW</h1>
          <p className="ff-text-3" style={{ marginTop: 0 }}>{t('home_logged_out')}</p>
          <div style={{ marginTop: 14 }}>
            <button className="ff-btn-primary" onClick={() => netlifyIdentity.open()}>{t('login')}</button>
          </div>
        </div>
      </div>
    );
  }

  return <div className="ff-muted">Redirecting…</div>;
}

function Onboarding({ me, onDone }: { me: MeResponse | null; onDone: () => void }) {
  if (!me) return <div>{t('login_required')}</div>;

  const { onboarding } = me;
  const aiLocked = me.ai_status === 'pending';

  return (
    <div className="ff-fade-in">
      <h2>{t('onboarding_title')}</h2>
      <p>{t('onboarding_desc')}</p>

      <div className="ff-card ff-card-pad" style={{ marginBottom: 14 }}>
  <div className="ff-row" style={{ gap: 12, flexWrap: 'wrap' }}>
    <label className="ff-muted-2" style={{ fontSize: 13 }}>
      Goal
      <select value={onbGoal} onChange={(e)=>setOnbGoal(e.target.value as any)} style={{ display: 'block', marginTop: 6 }}>
        <option value="strength">Strength</option>
        <option value="hypertrophy">Muscle gain</option>
        <option value="fat_loss">Fat loss</option>
      </select>
    </label>

    <label className="ff-muted-2" style={{ fontSize: 13 }}>
      Experience
      <select value={onbExperience} onChange={(e)=>setOnbExperience(e.target.value as any)} style={{ display: 'block', marginTop: 6 }}>
        <option value="beginner">Beginner</option>
        <option value="intermediate">Intermediate</option>
        <option value="advanced">Advanced</option>
      </select>
    </label>

    <label className="ff-muted-2" style={{ fontSize: 13 }}>
      Days/week
      <input type="number" min={1} max={7} value={onbDays} onChange={(e)=>setOnbDays(Number(e.target.value||3))} style={{ display: 'block', marginTop: 6, width: 90 }} />
    </label>

    <label className="ff-muted-2" style={{ fontSize: 13 }}>
      Equipment
      <select value={onbEquipment} onChange={(e)=>setOnbEquipment(e.target.value)} style={{ display: 'block', marginTop: 6 }}>
        <option value="full_gym">Full gym</option>
        <option value="dumbbells">Dumbbells only</option>
        <option value="home_basic">Home basic</option>
        <option value="bodyweight">Bodyweight</option>
      </select>
    </label>
  </div>

  <label className="ff-muted-2" style={{ fontSize: 13, display: 'block', marginTop: 10 }}>
    Injuries / constraints (optional)
    <textarea rows={2} value={onbConstraints} onChange={(e)=>setOnbConstraints(e.target.value)} placeholder="e.g., sore shoulder, no running" style={{ display: 'block', marginTop: 6, width: '100%' }} />
  </label>
</div>

<ol className="ff-card ff-card-pad" style={{ margin: 0, paddingLeft: 18 }}>

        <li>
          <b>{t('step_design_program')}</b>
          <div>
            <button
              disabled={aiLocked || onboarding.program_created}
              className={!aiLocked && !onboarding.program_created ? 'ff-btn-primary' : undefined}
              onClick={async () => {
                await api.post('/api/onboarding/program/generate', { goal: onbGoal, experience: onbExperience, days_per_week: onbDays, equipment: onbEquipment, constraints: onbConstraints });
                await onDone();
              }}
            >
              {aiLocked ? t('ai_pending_approval') : onboarding.program_created ? t('done') : t('generate_program')}
            </button>
            {aiLocked && (
              <div style={{ marginTop: 6 }}>
                {t('ai_locked_message')} <HaveCode />
              </div>
            )}
          </div>
        </li>
        <li>
          <b>{t('step_sign_forms')}</b>
          <div style={{ marginTop: 6 }}>
            <button
              disabled={onboarding.forms_signed_all}
              className={!onboarding.forms_signed_all ? 'ff-btn-primary' : undefined}
              onClick={async () => {
                await api.post('/api/forms/sign', { full_name: 'Your Full Name' });
                await onDone();
              }}
            >
              {onboarding.forms_signed_all ? t('done') : t('sign_forms')}
            </button>
            <p className="ff-muted">
              {t('forms_note')} {onboarding.forms_due_at ? `(Due: ${new Date(onboarding.forms_due_at).toLocaleDateString()})` : ''}
            </p>
          </div>
        </li>
        <li>
          <b>{t('step_get_started')}</b>
          <div style={{ marginTop: 6 }}>
            <button
              disabled={!onboarding.program_created || onboarding.is_unlocked}
              className={onboarding.program_created && !onboarding.is_unlocked ? 'ff-btn-primary' : undefined}
              onClick={async () => {
                await api.post('/api/onboarding/complete', {});
                await onDone();
              }}
            >
              {onboarding.is_unlocked ? t('done') : t('unlock_app')}
            </button>
          </div>
        </li>
      </ol>
    </div>
  );
}

function HaveCode() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 600 }}>{t('have_code')}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('promo_code')} />
        <button
          onClick={async () => {
            setStatus(null);
            const res = await api.post<{ status: string; checkout_url?: string; message?: string }>(
              '/api/promo/redeem',
              { code }
            );
            if (res.status === 'checkout_required' && res.checkout_url) {
              window.location.href = res.checkout_url;
              return;
            }
            setStatus(res.message ?? res.status);
          }}
        >
          {t('redeem')}
        </button>
      </div>
      {status && <div style={{ marginTop: 6 }}>{status}</div>}
    </div>
  );
}


function Today({ me }: { me: MeResponse | null }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [adjusted, setAdjusted] = useState<any>(null);
  const [showAdjusted, setShowAdjusted] = useState(false);
  const [botInput, setBotInput] = useState('');
  const [botReply, setBotReply] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!me) return;
      setLoading(true);
      try {
        const res = await api.get('/api/today');
        setData(res);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [me?.user.id]);

  if (!me) return <div>{t('login_required')}</div>;
  if (!me.onboarding.program_created) return <div>{t('onboarding_required_short')} <Link to="/onboarding">{t('go_to_onboarding')}</Link></div>;

  // Hard forms gate after due date
  if (me.onboarding.forms_required_now && !me.onboarding.forms_signed_all) {
    return (
      <div className="ff-fade-in" style={{ maxWidth: 720 }}>
        <div className="ff-card ff-card-pad">
          <h2>Forms required</h2>
          <p className="ff-muted">Please sign the required forms to continue using the app.</p>
          <Link to="/onboarding">Go sign forms</Link>
        </div>
      </div>
    );
  }

  const oneTapLog = async () => {
  if (!data?.day?.id) return;
  await api.post('/api/workout/log', { program_day_id: data.day.id, status: 'completed', log_as_prescribed: true });
  alert('Logged ✅');
};


  const exercises = (showAdjusted && adjusted?.exercises) ? adjusted.exercises : data?.exercises;

  return (
    <div className="ff-fade-in">
      <div className="ff-row" style={{ alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>Today</h2>
          <button onClick={oneTapLog}>Log as prescribed (1 tap)</button>
        {data?.day?.day_index && (
          <div className="ff-muted">
            Day <CountUp value={data.day.day_index} className="ff-num" /> / 28
          </div>
        )}
      </div>

      {loading && <p>Loading…</p>}

      {data?.day && (
        <div className="ff-card ff-card-pad" style={{ marginTop: 12 }}>
          <div className="ff-row">
            <b>{data.day.name}</b>
            {adjusted && (
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={showAdjusted} onChange={(e) => setShowAdjusted(e.target.checked)} />
                Original / Adjusted
              </label>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            {(exercises || []).map((ex: any) => (
              <div key={ex.slug} className="ff-list-row">
                <div className="ff-row">
                  <div><b>{ex.name}</b></div>
                  <div className="ff-muted">
                    {ex.prescription?.sets} × {ex.prescription?.reps}
                  </div>
                </div>
                {ex.prescription?.notes ? <div className="ff-muted" style={{ marginTop: 4 }}>{ex.prescription.notes}</div> : null}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button
              className="ff-btn-primary"
              onClick={async () => {
                await api.post('/api/workout/log', { program_day_id: data.day.id, status: 'completed', log_as_prescribed: true });
                alert('Logged ✅');
              }}
            >
              One‑tap log (as prescribed)
            </button>

            <button
              disabled={!me.entitlements.can_use_ai}
              onClick={async () => {
                const res = await api.post('/api/chat/adjust', { request: botInput || 'Adjust today.' });
                // keep bot reply ONE sentence (server enforces, but we also hard trim)
                const msg = String(res.message || '').split(/(?<=[.!?])\s+/)[0].trim();
                setBotReply(msg);

                // For demo: create a tiny adjusted version by reducing sets by 1
                const adjExercises = (data.exercises || []).map((e: any) => ({
                  ...e,
                  prescription: { ...e.prescription, sets: Math.max(1, Number(e.prescription?.sets || 1) - 1), notes: 'Adjusted by coach bot.' }
                }));
                setAdjusted({ exercises: adjExercises });
                setShowAdjusted(true);
              }}
            >
              Adjust workout (Coach)
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Coach (1 sentence)</div>
            <input
              style={{ width: '100%' }}
              placeholder="e.g., feeling beat up / hotel gym / tweak…"
              value={botInput}
              onChange={(e) => setBotInput(e.target.value)}
            />
            {botReply && (
              <div className="ff-card" style={{ marginTop: 10, padding: 12 }}>
                {botReply}
              </div>
            )}
          </div>
        </div>
      )}

      {!data?.day && !loading && <p>No workout found for today.</p>}
    </div>
  );
}

function Settings({ me, onSaved }: { me: MeResponse | null; onSaved: () => void }) {
  if (!me) return <div>{t('login_required')}</div>;
  const [aiInstr, setAiInstr] = useState(me.settings.ai_user_instructions ?? '');
  const [language, setLanguage] = useState(me.settings.language);
  const maxChars = 500;

  return (
    <div className="ff-fade-in">
      <h2>{t('settings')}</h2>
      <RebuildInfo />
      <div className="ff-card ff-card-pad" style={{ marginBottom: 16 }}>
        <div className="ff-row" style={{ alignItems: 'center' }}>
          <label>
            {t('language')}:&nbsp;
            <select value={language} onChange={(e) => setLanguage(e.target.value as any)}>
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
          <button
            className="ff-btn-primary"
            onClick={async () => {
              await api.post('/api/settings/update', { language });
              await onSaved();
            }}
          >
            {t('save')}
          </button>
        </div>
      </div>

      <div className="ff-card ff-card-pad">
        <h3>{t('custom_ai_instructions')}</h3>
        <textarea
          style={{ width: '100%', minHeight: 120 }}
          value={aiInstr}
          maxLength={maxChars}
          onChange={(e) => setAiInstr(e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span className="ff-muted-2">{aiInstr.length}/{maxChars}</span>
          <button
            className="ff-btn-primary"
            onClick={async () => {
              await api.post('/api/settings/ai-instructions', { ai_user_instructions: aiInstr });
              await onSaved();
            }}
          >
            {t('save')}
          </button>
        </div>
        <p className="ff-muted">{t('ai_instructions_note')}</p>
      </div>
    </div>
  );
}

function Inbox({ me }: { me: MeResponse | null }) {
  if (!me) return <div>{t('login_required')}</div>;
  return (
    <div className="ff-fade-in">
      <h2>{t('inbox')}</h2>
      <p>{t('inbox_stub')}</p>
    </div>
  );
}

function Admin({ me }: { me: MeResponse | null }) {
  if (!me) return <div>{t('login_required')}</div>;
  if (!(me.user.role === 'admin' || me.user.role === 'super_admin')) return <div>{t('no_access')}</div>;

  return (
    <Routes>
              <Route path="/" element={<Landing me={me} />} />
      <Route path="growth" element={<GrowthControls />} />
      <Route path="approvals" element={<Approvals />} />
      <Route path="promos" element={<Promos />} />
      <Route path="broadcast" element={<Broadcast />} />
      <Route path="assistant" element={<Assistant />} />
    </Routes>
  );
}

function AdminHome() {
  const [db, setDb] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get('/api/admin/db-usage');
      setDb(res);
      setLast(new Date().toLocaleString());
    } catch (e: any) {
      setErr('Unable to load DB usage.');
      setDb(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div>
      <h2>Admin</h2>

      <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 12, margin: '12px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontWeight: 800 }}>Database usage</div>
          <span style={{ flex: 1 }} />
          <button onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>

        {err && <div style={{ marginTop: 8, color: '#b00020' }}>{err}</div>}

        {db && (
          <>
            <div style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>Total size</div>
                <div style={{ fontWeight: 800 }}>{db.db?.size_pretty ?? '—'}</div>
              </div>
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>Connections</div>
                <div style={{ fontWeight: 800 }}>
                  {db.connections?.active ?? '—'} / {db.connections?.total ?? '—'}
                </div>
              </div>
              <div>
                <div style={{ color: '#666', fontSize: 12 }}>Last updated</div>
                <div style={{ fontWeight: 800 }}>{last ?? '—'}</div>
              </div>
            </div>

            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer' }}>Top tables</summary>
              <div style={{ marginTop: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '6px 0' }}>Table</th>
                      <th style={{ textAlign: 'right', padding: '6px 0' }}>Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(db.top_tables || []).map((t: any) => (
                      <tr key={`${t.schemaname}.${t.table_name}`}>
                        <td style={{ padding: '6px 0', borderTop: '1px solid #f1f1f1' }}>{t.table_name}</td>
                        <td style={{ padding: '6px 0', borderTop: '1px solid #f1f1f1', textAlign: 'right' }}>{t.size_pretty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>

      <ul>
        <li><Link to="/admin/growth">Growth Controls</Link></li>
        <li><Link to="/admin/approvals">AI Approvals</Link></li>
        <li><Link to="/admin/promos">Promo Codes</Link></li>
        <li><Link to="/admin/broadcast">Broadcast</Link></li>
        <li><Link to="/admin/assistant">Broadcast Bot</Link></li>
      </ul>
    </div>
  );
}


function GrowthControls() {
  const [mode, setMode] = useState<'free_flow' | 'limited_flow'>('free_flow');
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const res = await api.get('/api/admin/system-settings');
      setMode(res.growth_mode);
      setInfo(res);
    })();
  }, []);

  return (
    <div className="ff-fade-in">
      <h2>Growth Controls</h2>
      <p>Switch between Free Flow and Limited Flow (AI approval required for new users).</p>
      <select value={mode} onChange={(e) => setMode(e.target.value as any)}>
        <option value="free_flow">Free Flow</option>
        <option value="limited_flow">Limited Flow</option>
      </select>
      <button
        style={{ marginLeft: 8 }}
        onClick={async () => {
          await api.post('/api/admin/growth-mode', { growth_mode: mode });
          const res = await api.get('/api/admin/system-settings');
          setInfo(res);
        }}
      >
        Save
      </button>
      {info && (
        <pre style={{ marginTop: 12 }}>{JSON.stringify(info, null, 2)}</pre>
      )}
    </div>
  );
}

function Approvals() {
  const [rows, setRows] = useState<any[]>([]);
  const load = async () => setRows(await api.get('/api/admin/approvals/pending'));
  useEffect(() => { void load(); }, []);

  return (
    <div>
      <h2>Pending AI Approvals</h2>
      <button onClick={load}>Refresh</button>
      <table style={{ width: '100%', marginTop: 12 }}>
        <thead><tr><th>Email</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.email}</td>
              <td>{new Date(r.created_at).toLocaleString()}</td>
              <td>
                <button onClick={async () => { await api.post(`/api/admin/approvals/${r.id}/approve`, {}); await load(); }}>Approve</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Promos() {
  const [code, setCode] = useState('');
  const [bypass, setBypass] = useState(true);
  const [billing, setBilling] = useState<'none'|'monthly'|'annual_paid'>('none');
  const [duration, setDuration] = useState<number | ''>('');
  const [maxRed, setMaxRed] = useState<number | ''>('');
  const [priceAnnual, setPriceAnnual] = useState('');
  const [rows, setRows] = useState<any[]>([]);

  const load = async () => setRows(await api.get('/api/admin/promo/list'));
  useEffect(() => { void load(); }, []);

  return (
    <div className="ff-fade-in">
      <h2>Promo Codes</h2>
      <div className="ff-card ff-card-pad">
        <h3>Create</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>Code<input value={code} onChange={(e)=>setCode(e.target.value)} /></label>
          <label>Billing
            <select value={billing} onChange={(e)=>setBilling(e.target.value as any)}>
              <option value="none">None (free/comp)</option>
              <option value="monthly">Monthly (normal)</option>
              <option value="annual_paid">Annual Paid (Stripe)</option>
            </select>
          </label>
          <label>Bypass Gate <input type="checkbox" checked={bypass} onChange={(e)=>setBypass(e.target.checked)} /></label>
          <label>Benefit Duration Days<input type="number" value={duration} onChange={(e)=>setDuration(e.target.value===''?'':Number(e.target.value))} /></label>
          <label>Max Redemptions<input type="number" value={maxRed} onChange={(e)=>setMaxRed(e.target.value===''?'':Number(e.target.value))} /></label>
          <label>Stripe Annual Price ID<input value={priceAnnual} onChange={(e)=>setPriceAnnual(e.target.value)} /></label>
        </div>
        <button
          className="ff-btn-primary"
          style={{ marginTop: 10 }}
          onClick={async () => {
            const policy: any = {
              bypass_ai_gate: bypass,
              billing_mode: billing,
              benefit_duration_days: duration === '' ? null : duration,
              force_checkout_on_redeem: billing === 'annual_paid',
              stripe_price_id_annual: billing === 'annual_paid' ? priceAnnual : null
            };
            const body: any = {
              code,
              max_redemptions: maxRed === '' ? null : maxRed,
              policy
            };
            await api.post('/api/admin/promo/create', body);
            setCode('');
            await load();
          }}
        >
          Create
        </button>
      </div>

      <h3 style={{ marginTop: 16 }}>Existing</h3>
      <table style={{ width: '100%', marginTop: 8 }}>
        <thead><tr><th>Code</th><th>Active</th><th>Redemptions</th><th>Policy</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.code}</td>
              <td>{String(r.is_active)}</td>
              <td>{r.redemptions_count}{r.max_redemptions ? `/${r.max_redemptions}` : ''}</td>
              <td><pre style={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}>{JSON.stringify(r.policy, null, 2)}</pre></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Broadcast() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState('all_users');

  return (
    <div className="ff-fade-in">
      <h2>Broadcast</h2>
      <div className="ff-card ff-card-pad">
        <label>Audience
          <select value={segment} onChange={(e) => setSegment(e.target.value)}>
            <option value="all_users">All users</option>
            <option value="subscribers">Subscribers</option>
            <option value="pending_approvals">Pending approvals</option>
          </select>
        </label>
        <div style={{ marginTop: 10 }}>
          <input style={{ width: '100%' }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        </div>
        <div style={{ marginTop: 10 }}>
          <textarea style={{ width: '100%', minHeight: 140 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" />
        </div>
        <button
          className="ff-btn-primary"
          style={{ marginTop: 10 }}
          onClick={async () => {
            await api.post('/api/admin/broadcast/create', { title, body, audience_filter: { segment } });
            setTitle('');
            setBody('');
            alert('Sent');
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function Assistant() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [content, setContent] = useState('Draft an announcement about app improvements');
  const [transcript, setTranscript] = useState<any[]>([]);

  const newThread = async () => {
    const res = await api.post('/api/admin/assistant/thread/create', { title: 'Broadcast Draft' });
    setThreadId(res.thread_id);
    setTranscript([]);
  };

  return (
    <div className="ff-fade-in">
      <h2>Broadcast Bot</h2>
      <p>Transcripts auto-delete after 30 days.</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={newThread}>New Thread</button>
        {threadId && (
          <button
            onClick={async () => {
              const res = await api.get(`/api/admin/assistant/thread/${threadId}`);
              setTranscript(res.messages);
            }}
          >
            Refresh
          </button>
        )}
      </div>

      {!threadId ? (
        <div>Create a thread to start.</div>
      ) : (
        <>
          <div className="ff-card ff-card-pad">
            <textarea style={{ width: '100%', minHeight: 100 }} value={content} onChange={(e) => setContent(e.target.value)} />
            <button
              className="ff-btn-primary"
              style={{ marginTop: 10 }}
              onClick={async () => {
                const res = await api.post(`/api/admin/assistant/thread/${threadId}/message`, {
                  content,
                  audience: 'all_users',
                  language: 'en',
                  need_spanish: true
                });
                setTranscript((prev) => [...prev, { role: 'admin', content }, { role: 'assistant', content: res.assistant_message }]);
              }}
            >
              Send
            </button>
          </div>

          <div className="ff-card ff-card-pad" style={{ marginTop: 14 }}>
            {transcript.map((m, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <b>{m.role}:</b>
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}



function HomeLoggedOut() {
  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>FitFlow</h1>
      <p style={{ color: '#666' }}>Log in to get started.</p>
      <button onClick={() => netlifyIdentity.open()}>Log in</button>
    </div>
  );
}


function Landing({ me }: { me: MeResponse | null }) {
  // Always route users to Today if they have a program; otherwise route to Build Program.
  if (!me) return <HomeLoggedOut />;
  return <Navigate to={me.onboarding.program_created ? '/today' : '/build'} replace />;
}

function NotFound() {
  return <div>Not found</div>;
}


function Sparkline({ points }: { points: { x: string; y: number }[] }) {
  const w = 220, h = 56, pad = 6;
  if (!points.length) return <div className="ff-text-3" style={{ fontSize: 12 }}>No data yet</div>;
  const ys = points.map(p => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scaleX = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1);
  const scaleY = (v: number) => {
    if (maxY === minY) return h / 2;
    return h - pad - ((v - minY) * (h - pad * 2)) / (maxY - minY);
  };
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i).toFixed(1)} ${scaleY(p.y).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label="trend">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.9" />
    </svg>
  );
}

function Progress({ me }: { me: MeResponse | null }) {
  const [data, setData] = useState<{ weekly: any[]; top: any[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    (async () => {
      try {
        setErr(null);
        const res = await api.get('/api/progress');
        setData(res as any);
      } catch (e: any) {
        setErr(e?.message || 'Failed to load progress');
      }
    })();
  }, [me]);

  if (!me) return <div className="ff-card ff-card-pad">Login required.</div>;

  const weeklyPts = (data?.weekly || []).map((r: any) => ({ x: String(r.week_start), y: Number(r.volume || 0) }));

  return (
    <div className="ff-fade-in" style={{ maxWidth: 980, margin: '18px auto 0' }}>
      <div className="ff-card ff-card-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Progress</h2>
          <div className="ff-text-3" style={{ fontSize: 12 }}>Last 8 weeks</div>
        </div>
        {err && <div className="ff-badge ff-badge-warn" style={{ marginTop: 10 }}>{err}</div>}
        {!data && !err && <div className="ff-text-3" style={{ marginTop: 10 }}>Loading…</div>}
        {data && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginTop: 12 }}>
            <div className="ff-card" style={{ padding: 14 }}>
              <div className="ff-text-2" style={{ fontSize: 12, marginBottom: 6 }}>Weekly training volume</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Sparkline points={weeklyPts} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>
                    {weeklyPts.length ? Math.round(weeklyPts[weeklyPts.length - 1].y).toLocaleString() : '—'}
                  </div>
                  <div className="ff-text-3" style={{ fontSize: 12 }}>this week (reps×load)</div>
                </div>
              </div>
            </div>

            <div className="ff-card" style={{ padding: 14 }}>
              <div className="ff-text-2" style={{ fontSize: 12, marginBottom: 10 }}>Top exercises (28 days)</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {(data.top || []).map((r: any) => (
                  <div key={r.slug} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div>{r.name || r.slug}</div>
                    <div className="ff-text-3">{Math.round(Number(r.volume || 0)).toLocaleString()}</div>
                  </div>
                ))}
                {(!data.top || data.top.length === 0) && <div className="ff-text-3" style={{ fontSize: 12 }}>No sets logged yet.</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function History({ me }: { me: MeResponse | null }) {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    (async () => {
      try {
        setErr(null);
        const res: any = await api.get('/api/history');
        setRows(res.workouts || []);
      } catch (e: any) {
        setErr(e?.message || 'Failed to load history');
      }
    })();
  }, [me]);

  if (!me) return <div className="ff-card ff-card-pad">Login required.</div>;

  return (
    <div className="ff-fade-in" style={{ maxWidth: 980, margin: '18px auto 0' }}>
      <div className="ff-card ff-card-pad">
        <h2 style={{ marginTop: 0 }}>History</h2>
        {err && <div className="ff-badge ff-badge-warn" style={{ marginTop: 10 }}>{err}</div>}
        {!err && rows.length === 0 && <div className="ff-text-3" style={{ marginTop: 10 }}>No workouts yet.</div>}
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {rows.map((w: any) => (
            <div key={w.id} className="ff-card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{String(w.status || 'completed').toUpperCase()}</div>
                <div className="ff-text-3" style={{ fontSize: 12 }}>{new Date(w.created_at).toLocaleString()}</div>
              </div>
              <div className="ff-text-3" style={{ fontSize: 12 }}>#{String(w.id).slice(0, 8)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
