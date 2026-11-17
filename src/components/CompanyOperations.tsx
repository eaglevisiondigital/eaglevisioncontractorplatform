import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { Operations } from '../lib/operations';
import type { CompanyProfile } from '../domain/platform';
import { Customers } from './Customers';
import { CompanySettings } from './CompanySettings';
import { Team } from './Team';
import { IntakeQueue } from './IntakeQueue';
import { Pagination, ResourceStatus } from './forms';
import { useResource } from './forms-state';
export function CompanyOperations({
  repo,
  company,
  section,
  onSaved,
  onCustomers,
  onIntake,
}: {
  repo: Operations;
  company: CompanyProfile;
  section: string;
  onSaved: () => void;
  onCustomers: () => void;
  onIntake: () => void;
}) {
  const modules = useResource(
    useCallback(() => repo.listModules(company.id), [repo, company.id]),
  );
  const access = useResource(
    useCallback(() => repo.companyAccess(company.id), [repo, company.id]),
  );
  const module = {
    Customers: 'crm',
    Intake: 'intake',
    Team: 'team',
    'Company settings': 'settings',
  }[section];
  if (access.loading || access.error)
    return (
      <article>
        <ResourceStatus {...access} />
      </article>
    );
  const capability = {
    Customers: access.data?.crm,
    Intake: access.data?.intake_read,
    Team: access.data?.team,
    'Company settings': access.data?.settings,
  }[section];
  if (!capability)
    return (
      <article>
        <h2>Access restricted</h2>
        <p>Your company role does not grant access to this module.</p>
      </article>
    );
  if (modules.loading || modules.error)
    return (
      <article>
        <ResourceStatus {...modules} />
      </article>
    );
  if (!modules.data?.some((m) => m.module === module && m.enabled))
    return (
      <article>
        <h2>Module unavailable</h2>
        <p>
          This module is disabled for the selected organization. Ask Eagle
          Vision to review the company configuration.
        </p>
      </article>
    );
  return section === 'Customers' ? (
    <Customers repo={repo} org={company.id} />
  ) : section === 'Intake' ? (
    <IntakeQueue
      repo={repo}
      org={company.id}
      canManage={access.data?.intake_manage ?? false}
      onReviewCustomer={access.data?.crm ? onCustomers : undefined}
      onTest={access.data?.intake_manage ? onIntake : undefined}
    />
  ) : section === 'Team' ? (
    <Team repo={repo} org={company.id} />
  ) : (
    <CompanySettings repo={repo} company={company} onSaved={onSaved} />
  );
}
const intakeStages = ['new', 'reviewing', 'qualified', 'closed'] as const;
type IntakeStage = (typeof intakeStages)[number];
type IntakeViewProps = { repo: Operations; org: string; onOpen: () => void };
export function NewLeadDashboard({ repo, org, onOpen }: IntakeViewProps) {
  const [display, setDisplay] = useState({
    repo,
    org,
    board: false,
    version: 0,
  });
  const latest = useRef(display);
  useLayoutEffect(() => {
    latest.current = display;
  }, [display]);
  const [blocked, setBlocked] = useState<{
    display: typeof display;
    reason: 'restricted' | 'unavailable';
  }>();
  const onBlocked = useCallback(
    (reason: 'restricted' | 'unavailable') => {
      if (latest.current === display) setBlocked({ display, reason });
    },
    [display],
  );
  const current = display.repo === repo && display.org === org;
  const board = current && display.board;
  if (!current) setDisplay({ repo, org, board: false, version: 0 });
  return (
    <>
      <div className="filters" role="group" aria-label="Intake display">
        <button
          type="button"
          className="secondary"
          aria-pressed={!board}
          onClick={() => setDisplay({ repo, org, board: false, version: 0 })}
        >
          Request queue
        </button>
        <button
          type="button"
          className="secondary"
          aria-pressed={board}
          onClick={() => setDisplay({ repo, org, board: true, version: 0 })}
        >
          Pipeline board
        </button>
      </div>
      {board ? (
        <section aria-label="Intake pipeline board">
          <h2>Intake pipeline</h2>
          <p>
            Review requests by their current intake stage. Each stage has its
            own page and count. Use Review intake to manage requests.
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setDisplay({
                repo,
                org,
                board: true,
                version: display.version + 1,
              })
            }
          >
            Refresh pipeline board
          </button>
          {blocked?.display === display ? (
            <p>
              {blocked.reason === 'restricted'
                ? 'Your company role does not grant access to intake.'
                : 'Intake is disabled for the selected organization.'}
            </p>
          ) : (
            <div
              key={display.version}
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))',
                gap: '1rem',
                alignItems: 'start',
              }}
            >
              {intakeStages.map((stage) => (
                <IntakeStageView
                  key={stage}
                  repo={repo}
                  org={org}
                  onOpen={onOpen}
                  fixedStage={stage}
                  onBlocked={onBlocked}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <IntakeStageView repo={repo} org={org} onOpen={onOpen} />
      )}
    </>
  );
}
function IntakeStageView({
  repo,
  org,
  onOpen,
  fixedStage,
  onBlocked,
}: IntakeViewProps & {
  fixedStage?: IntakeStage;
  onBlocked?: (reason: 'restricted' | 'unavailable') => void;
}) {
  const stages = intakeStages;
  type Stage = IntakeStage;
  const [selection, setSelection] = useState({
    repo,
    org,
    page: 0,
    stage: (fixedStage ?? 'new') as Stage,
    fixedStage,
    version: 0,
  });
  const sameContext =
    selection.repo === repo &&
    selection.org === org &&
    selection.fixedStage === fixedStage;
  const page = sameContext ? selection.page : 0;
  const stage = fixedStage ?? (sameContext ? selection.stage : 'new');
  const version = sameContext ? selection.version : 0;
  if (!sameContext)
    setSelection({
      repo,
      org,
      page: 0,
      stage: fixedStage ?? 'new',
      fixedStage,
      version: 0,
    });
  const leads = useResource(
    useCallback(async () => {
      const identity = { repo, org, page, stage, version };
      try {
        const available = async () => {
          const [access, modules] = await Promise.all([
            repo.companyAccess(org),
            repo.listModules(org),
          ]);
          if (!access.intake_read) {
            onBlocked?.('restricted');
            return 'restricted' as const;
          }
          if (!modules.some((m) => m.module === 'intake' && m.enabled)) {
            onBlocked?.('unavailable');
            return 'unavailable' as const;
          }
          return 'allowed' as const;
        };
        const access = await available();
        if (access !== 'allowed') return { ...identity, state: access };
        const result = await repo.listIntake(org, stage, page);
        if (
          !Number.isSafeInteger(result.count) ||
          result.count < 0 ||
          !Array.isArray(result.rows) ||
          result.rows.length > 10 ||
          result.count < result.rows.length ||
          new Set(result.rows.map((row) => row.id)).size !==
            result.rows.length ||
          result.rows.some(
            (row) => row.organization_id !== org || row.status !== stage,
          )
        )
          throw Error(
            'Intake results do not match the current company and stage.',
          );
        const currentAccess = await available();
        if (currentAccess !== 'allowed')
          return { ...identity, state: currentAccess };
        return { ...identity, state: 'ready' as const, result };
      } catch (error) {
        return {
          ...identity,
          state: 'error' as const,
          message: error instanceof Error ? error.message : 'Unable to load',
        };
      }
    }, [repo, org, page, stage, version, onBlocked]),
  );
  const current =
    !leads.loading &&
    leads.data?.repo === repo &&
    leads.data.org === org &&
    leads.data.page === page &&
    leads.data.stage === stage &&
    leads.data.version === version
      ? leads.data
      : undefined;
  return (
    <article
      className="lead-dashboard"
      style={
        fixedStage
          ? {
              padding: '1rem',
              marginBottom: 0,
              minWidth: 0,
              overflowWrap: 'anywhere',
              background: '#f1f8f5',
            }
          : undefined
      }
      aria-label={
        fixedStage
          ? `${fixedStage} intake stage`
          : stage === 'new'
            ? 'New lead inbox'
            : 'Intake pipeline inbox'
      }
    >
      <div
        className="section-title"
        style={
          fixedStage
            ? {
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '.5rem',
              }
            : undefined
        }
      >
        <div>
          <span className="eyebrow">INTAKE PIPELINE</span>
          {fixedStage ? (
            <h3>{stage[0].toUpperCase() + stage.slice(1)}</h3>
          ) : (
            <h2>Your request review queue</h2>
          )}
        </div>
        {current?.state === 'ready' && (
          <button onClick={onOpen}>Review intake</button>
        )}
      </div>
      <div className="filters">
        {!fixedStage && (
          <label>
            Intake stage
            <select
              value={stage}
              onChange={(event) => {
                const next = event.target.value;
                if (stages.some((item) => item === next))
                  setSelection({
                    repo,
                    org,
                    page: 0,
                    stage: next as Stage,
                    fixedStage,
                    version: 0,
                  });
              }}
            >
              {stages.map((value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="secondary"
          disabled={!current}
          onClick={() =>
            setSelection({
              repo,
              org,
              page,
              stage,
              fixedStage,
              version: version + 1,
            })
          }
        >
          Refresh intake view
        </button>
      </div>
      <ResourceStatus
        loading={!current && !leads.error}
        error={current?.state === 'error' ? current.message : leads.error}
      />
      {current?.state === 'restricted' && (
        <p>Your company role does not grant access to intake.</p>
      )}
      {current?.state === 'unavailable' && (
        <p>Intake is disabled for the selected organization.</p>
      )}
      {current?.state === 'ready' && (
        <>
          <p role="status">
            {stage === 'new'
              ? `${current.result.count} new requests await review.`
              : `${current.result.count} ${stage} requests in this stage.`}
          </p>
          <dl
            className="metrics"
            style={{
              gridTemplateColumns: fixedStage
                ? 'repeat(2, minmax(0, 1fr))'
                : 'repeat(auto-fit, minmax(9rem, 1fr))',
              ...(fixedStage ? { gap: '.6rem', margin: '.75rem 0' } : {}),
            }}
          >
            <div className={fixedStage ? undefined : 'notice'}>
              <dt style={{ color: '#304c40' }}>Requests in selected stage</dt>
              <dd>{current.result.count}</dd>
            </div>
            <div className={fixedStage ? undefined : 'notice'}>
              <dt style={{ color: '#304c40' }}>Requests on this page</dt>
              <dd>{current.result.rows.length}</dd>
            </div>
          </dl>
          <p className="muted">
            {stage === 'new'
              ? 'New intake requests only. '
              : 'Selected intake stage only. '}
            This count does not represent all leads, customers, jobs or revenue.
            Qualified is an internal intake status, not customer acceptance or
            payment.
          </p>
          {page > 0 && page * 10 >= current.result.count ? (
            <>
              <p>
                This page is no longer available. Return to the first page to
                review current requests.
              </p>
              <button
                onClick={() =>
                  setSelection({
                    repo,
                    org,
                    page: 0,
                    stage,
                    fixedStage,
                    version: 0,
                  })
                }
              >
                Return to first page
              </button>
            </>
          ) : (
            <>
              <div className="record-list">
                {current.result.rows.map((r) => (
                  <section className="request-card" key={r.id}>
                    <div className="section-title">
                      <span className="tag">
                        {r.status} · {r.source}
                      </span>
                      <small>
                        Submitted{' '}
                        <time dateTime={r.created_at}>
                          {new Date(r.created_at).toLocaleDateString()}
                        </time>
                      </small>
                    </div>
                    <h3>{r.service_category}</h3>
                    <p>{r.summary}</p>
                  </section>
                ))}
              </div>
              {!current.result.rows.length && (
                <p>
                  {stage === 'new'
                    ? 'No new requests in this view.'
                    : 'No requests in this stage.'}
                </p>
              )}
              <Pagination
                page={page}
                count={current.result.count}
                onChange={(next) =>
                  setSelection({
                    repo,
                    org,
                    page: next,
                    stage,
                    fixedStage,
                    version: 0,
                  })
                }
              />
            </>
          )}
        </>
      )}
      <p className="muted">
        In-app notifications only. External messaging is disabled.
      </p>
    </article>
  );
}
