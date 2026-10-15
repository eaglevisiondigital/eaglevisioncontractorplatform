import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import {
  modules,
  sampleCompanies,
  type CompanyProfile,
} from './domain/platform';
import { supabase } from './lib/supabase';
import { Mfa } from './Mfa';

export function App() {
  const path = window.location.pathname;
  const sample = path.startsWith('/preview');
  const platform = path === '/super-admin' || path === '/preview/super-admin';
  const [companies, setCompanies] = useState<CompanyProfile[]>(
    sample ? sampleCompanies : [],
  );
  const [companyId, setCompanyId] = useState(
    sample ? sampleCompanies[0].id : '',
  );
  const [section, setSection] = useState('Overview');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [authorized, setAuthorized] = useState(sample);
  const [loading, setLoading] = useState(!sample && !!supabase);
  useEffect(() => {
    if (sample || !supabase) return;
    const client = supabase;
    let active = true;
    async function load() {
      if (active) {
        setAuthorized(false);
        setCompanies([]);
        setCompanyId('');
        setLoading(true);
      }
      try {
        const {
          data: { session },
        } = await client.auth.getSession();
        if (!session) return;
        if (platform) {
          const { data, error } = await client.rpc('platform_access');
          if (error || data !== true)
            throw new Error(
              'Super Admin requires an explicit platform grant and MFA (AAL2).',
            );
        }
        const { data, error } = await client
          .from('organizations')
          .select('*')
          .order('name');
        if (error) throw new Error('Unable to load authorized organizations.');
        if (!platform && !data?.length) {
          throw new Error(
            'No company access. Verify MFA for administrative access, or request a membership from your administrator.',
          );
        }
        if (active) {
          setCompanies(data ?? []);
          setCompanyId(data?.[0]?.id ?? '');
          setAuthorized(true);
        }
      } catch (error) {
        if (active)
          setMessage(error instanceof Error ? error.message : 'Access denied');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(() => {
      window.setTimeout(() => void load(), 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [sample, platform]);
  async function login(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setPassword('');
    setMessage(
      error
        ? 'Sign-in failed. Check your credentials.'
        : 'Signed in. If MFA is required, complete verification through your configured identity flow.',
    );
  }
  if (path.startsWith('/intake') || path.startsWith('/portal'))
    return (
      <main className="landing">
        <a className="wordmark" href="/">
          EV / EAGLE VISION
        </a>
        <h1>
          {path.startsWith('/portal')
            ? 'Your project, connected.'
            : 'A better start to every project.'}
        </h1>
        <p>
          {path.startsWith('/portal')
            ? 'The customer portal is reserved for secure, customer-specific access in a later phase.'
            : 'Company-branded public requests will be available after abuse controls, consent and attachment scanning are configured.'}
        </p>
        <p className="notice">
          This surface does not accept submissions in Phase 1.
        </p>
        <a href="/">Return to platform</a>
      </main>
    );
  if (!authorized)
    return (
      <main className="landing">
        <span className="eyebrow">EAGLE VISION / CONTRACTOR PLATFORM</span>
        <h1>
          Independent companies.
          <br />
          One clear vision.
        </h1>
        <p>
          A dedicated workspace for every business, from first request to final
          reconciliation.
        </p>
        {loading ? (
          <p role="status">Checking access…</p>
        ) : supabase ? (
          <form onSubmit={login}>
            <h2>{platform ? 'Super Admin' : 'Company'} sign in</h2>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button type="submit">Sign in</button>
          </form>
        ) : (
          <p className="notice">
            Connected access is unavailable. Configure the browser-safe Supabase
            environment to enable sign in.
          </p>
        )}
        <p role="status">{message}</p>
        {supabase && <Mfa />}
        <a className="button" href="/preview">
          Explore sample workspace →
        </a>
        <div className="surface-links">
          <a href="/super-admin">Super Admin</a>
          <a href="/intake">Public intake</a>
          <a href="/portal">Customer portal</a>
        </div>
      </main>
    );
  const company = companies.find((c) => c.id === companyId);
  const current = modules.find((m) => m.name === section);
  return (
    <div
      className="workspace"
      style={
        {
          '--company-color': /^#[0-9a-f]{6}$/i.test(
            company?.primary_color ?? '',
          )
            ? company!.primary_color
            : '#247364',
        } as CSSProperties
      }
    >
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside>
        <a href="/" className="wordmark">
          <span className="mark">EV</span>
          <span>
            EAGLE VISION<small>CONTRACTOR PLATFORM</small>
          </span>
        </a>
        <div className="workspace-label">
          {platform ? 'PLATFORM CONTROL' : 'COMPANY WORKSPACE'}
        </div>
        <label className="company-label">
          Company context
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label="Workspace">
          {(platform
            ? [
                'Organizations',
                'Access & security',
                'Module readiness',
                'Activity',
              ]
            : modules.map((m) => m.name)
          ).map((name, i) => (
            <button
              key={name}
              className={
                section === name ||
                (platform && section === 'Overview' && i === 0)
                  ? 'active'
                  : ''
              }
              onClick={() => setSection(name)}
            >
              <span aria-hidden="true">
                {['◈', '▦', '↗', '≡', '▤', '▧', '○', '▣', '⚙'][i]}
              </span>
              {name}
              {!platform &&
                (modules.find((m) => m.name === name)?.phase ?? 1) > 1 && (
                  <small>SOON</small>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <strong>Built for your business.</strong>
          <p>Isolated data. Individual identity.</p>
          <a
            href={
              sample
                ? platform
                  ? '/preview'
                  : '/preview/super-admin'
                : platform
                  ? '/app'
                  : '/super-admin'
            }
          >
            {platform ? 'Company workspace' : 'Eagle Vision control plane'} ↗
          </a>
        </div>
      </aside>
      <div className="content">
        <header>
          <span>
            {platform ? 'Eagle Vision / Super Admin' : `Workspace / ${section}`}
          </span>
          <div>
            <span className="status-dot" />
            {sample ? 'Sample environment' : 'Connected workspace'}
            {!sample && (
              <button onClick={() => void supabase?.auth.signOut()}>
                Sign out
              </button>
            )}
          </div>
        </header>
        <main id="main">
          <div className="notice">
            {sample
              ? 'SAMPLE WORKSPACE · Synthetic company context for foundation review. No live records or financial activity.'
              : 'PHASE 1 · Foundation access only. Financial and customer delivery workflows are disabled.'}
          </div>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {platform
                  ? 'THE BIG PICTURE'
                  : (company?.industry.replaceAll('_', ' ') ??
                    'NO COMPANY ACCESS')}
              </span>
              <h1>
                {platform
                  ? 'A platform built to grow.'
                  : section === 'Overview'
                    ? 'A clear view of what’s next.'
                    : section}
              </h1>
              <p>
                {platform
                  ? 'Independent companies. Shared standards. Secure boundaries.'
                  : (company?.name ??
                    'Ask your administrator for a company membership.')}
              </p>
            </div>
            <span className="phase-pill">PHASE 01 / FOUNDATION</span>
          </div>
          {platform ? (
            <>
              <div className="section-title">
                <h2>{section === 'Overview' ? 'Organizations' : section}</h2>
                <span>{companies.length} visible organizations</span>
              </div>
              {section === 'Overview' || section === 'Organizations' ? (
                <div className="company-grid">
                  {companies.map((c) => (
                    <article key={c.id}>
                      <div className="company-avatar">
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="eyebrow">
                        {c.industry.replaceAll('_', ' ')}
                      </span>
                      <h2>{c.name}</h2>
                      <p>Independent brand and tenant boundary</p>
                      <span className="tag">
                        {sample
                          ? 'Illustrative profile'
                          : 'Authorized organization'}
                      </span>
                    </article>
                  ))}
                </div>
              ) : (
                <article>
                  <h2>{section}</h2>
                  <p>
                    Platform grants and membership provisioning require reviewed
                    administrative operations. This shell exposes no
                    cross-company customer or document access.
                  </p>
                </article>
              )}
            </>
          ) : section === 'Overview' ? (
            <>
              <div className="metrics">
                {[
                  ['01', 'Company identity', 'Branding and industry context'],
                  [
                    '02',
                    'Secure operations',
                    'Memberships and tenant policies',
                  ],
                  [
                    '03',
                    'Connected lifecycle',
                    'Modules prepared for next phases',
                  ],
                ].map(([n, title, detail]) => (
                  <article key={n}>
                    <span className="metric-index">{n}</span>
                    <h2>{title}</h2>
                    <p>{detail}</p>
                  </article>
                ))}
              </div>
              <div className="overview-grid">
                <article className="journey">
                  <span className="eyebrow">
                    FROM FIRST CONTACT TO FINAL HANDOFF
                  </span>
                  <h2>
                    Every project starts
                    <br />
                    with a strong foundation.
                  </h2>
                  <p>
                    Bring your people, customers and service locations into one
                    company workspace.
                  </p>
                  <button onClick={() => setSection('Intake')}>
                    View intake foundation →
                  </button>
                  <div className="steps">
                    <span>Intake</span>
                    <span>Estimate</span>
                    <span>Contract</span>
                    <span>Payment</span>
                  </div>
                </article>
                <article>
                  <span className="eyebrow">WORKSPACE READINESS</span>
                  <h2>Ready for the next chapter</h2>
                  {[
                    'Company boundaries',
                    'Role-based access',
                    'Private document policies',
                    'Auditable activity',
                  ].map((s) => (
                    <div className="readiness" key={s}>
                      <span className="check">✓</span>
                      {s}
                      <small>FOUNDATION</small>
                    </div>
                  ))}
                  <p className="muted">
                    Provisioning and security verification are required before
                    connecting live operations.
                  </p>
                </article>
              </div>
            </>
          ) : (
            <article>
              <span className="eyebrow">
                {current && current.phase > 1
                  ? 'PLANNED MODULE'
                  : 'FOUNDATION MODULE'}
              </span>
              <h2>{current?.detail}</h2>
              {section === 'Company settings' && company ? (
                <dl>
                  <dt>Business name</dt>
                  <dd>{company.name}</dd>
                  <dt>Industry template</dt>
                  <dd>{company.industry.replaceAll('_', ' ')}</dd>
                  <dt>Brand color</dt>
                  <dd>{company.primary_color}</dd>
                  <dt>Merchant configuration</dt>
                  <dd>Separate per company · live processing disabled</dd>
                </dl>
              ) : (
                <p>
                  {section === 'Documents'
                    ? 'Private bucket policies require tenant membership and clean scan status. Upload and download issuance remain disabled until quarantine scanning is configured.'
                    : 'No live records are displayed in this foundation shell. Data operations will be connected in the next implementation phase.'}
                </p>
              )}
            </article>
          )}
          {!sample && (
            <details>
              <summary>Verify privileged access</summary>
              <Mfa />
            </details>
          )}
          <footer>
            Eagle Vision Contractor Platform{' '}
            <span>One platform. Every company’s own workspace.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
