import { useCallback } from 'react';
import type { Operations } from '../lib/operations';
import type { CompanyProfile } from '../domain/platform';
import { FieldsForm, ResourceStatus, type Values } from './forms';
import { useResource, useTask, options } from './forms-state';
function CompanyControl({
  repo,
  company,
  onSaved,
}: {
  repo: Operations;
  company: CompanyProfile;
  onSaved: () => void;
}) {
  const modules = useResource(
    useCallback(() => repo.listModules(company.id), [repo, company.id]),
  );
  const task = useTask();
  async function configure(v: Values) {
    const { status, plan, owner, ...flags } = v;
    if (
      await task.run(() =>
        repo.configure(
          company.id,
          String(status),
          String(plan),
          Object.fromEntries(
            Object.entries(flags).map(([k, v]) => [k, Boolean(v)]),
          ),
          String(owner) || undefined,
        ),
      )
    )
      onSaved();
  }
  return (
    <section className="company-control">
      <h3>{company.name}</h3>
      <p>
        {company.slug} · {company.industry.replaceAll('_', ' ')}
      </p>
      <ResourceStatus {...modules} />
      {modules.data && (
        <FieldsForm
          fields={[
            {
              name: 'status',
              label: 'Organization status',
              type: 'select',
              options: options(['onboarding', 'active', 'suspended']),
            },
            {
              name: 'plan',
              label: 'Subscription configuration',
              type: 'select',
              options: options(['pilot', 'standard', 'professional']),
            },
            {
              name: 'owner',
              label: 'Assign additional verified owner (account UUID)',
              maxLength: 36,
              hint: 'Existing verified Auth account only. Does not expose account lookup or send email.',
            },
            ...modules.data
              .filter(
                (m) =>
                  !['contracts', 'payments', 'invoices'].includes(m.module),
              )
              .map((m) => ({
                name: m.module,
                label: `Enable ${m.module}`,
                type: 'checkbox' as const,
              })),
          ]}
          initial={{
            status: company.status ?? 'active',
            plan: company.subscription_plan ?? 'pilot',
            ...Object.fromEntries(
              modules.data.map((m) => [m.module, m.enabled]),
            ),
          }}
          submitLabel="Apply organization configuration"
          onSubmit={configure}
          busy={task.busy}
        />
      )}
      <details>
        <summary>Revoke an owner’s access</summary>
        <p>
          At least one active owner must remain. This operation requires
          platform authorization and MFA.
        </p>
        <FieldsForm
          fields={[
            {
              name: 'user',
              label: 'Owner account UUID to revoke',
              required: true,
              maxLength: 36,
            },
          ]}
          submitLabel="Revoke owner membership"
          busy={task.busy}
          onSubmit={async (v) => {
            if (
              await task.run(
                () => repo.revokeOwner(company.id, String(v.user)),
                'Owner membership revoked.',
              )
            )
              onSaved();
          }}
        />
      </details>
      <p role="status">{task.message}</p>
      <small>
        Contracts, invoices and payments remain server-disabled pending Release
        1.0 acceptance.
      </small>
    </section>
  );
}
export function ControlPlane({
  repo,
  companies,
  section,
  onSaved,
}: {
  repo: Operations;
  companies: CompanyProfile[];
  section: string;
  onSaved: () => void;
}) {
  const task = useTask();
  const metrics = useResource(useCallback(() => repo.metrics(), [repo]));
  const activity = useResource(
    useCallback(() => repo.platformActivity(), [repo]),
  );
  const refresh = () => {
    metrics.reload();
    activity.reload();
    onSaved();
  };
  if (section === 'Activity')
    return (
      <article>
        <h2>Platform administrative activity</h2>
        <ResourceStatus {...activity} />
        <div className="timeline">
          {activity.data?.map((e) => (
            <div key={e.id}>
              <strong>{e.action}</strong>
              <p>
                {companies.find((c) => c.id === e.organization_id)?.name ??
                  'Organization'}{' '}
                · {new Date(e.occurred_at).toLocaleString()}
              </p>
              <small>Actor {e.actor_id}</small>
            </div>
          ))}
          {!activity.loading && !activity.data?.length && (
            <p>No platform actions in this view.</p>
          )}
        </div>
      </article>
    );
  return (
    <>
      <article>
        <h2>Company-level operational metrics</h2>
        <p>
          Aggregate usage only. Customer records and private documents remain
          behind company membership.
        </p>
        <ResourceStatus {...metrics} />
        <div className="company-grid">
          {metrics.data?.map((m) => (
            <section key={m.organization_id}>
              <h3>
                {companies.find((c) => c.id === m.organization_id)?.name ??
                  'Organization'}
              </h3>
              <dl>
                <dt>Active memberships</dt>
                <dd>{m.members}</dd>
                <dt>Customers</dt>
                <dd>{m.customers}</dd>
                <dt>New inquiries</dt>
                <dd>{m.new_requests}</dd>
                <dt>Documents</dt>
                <dd>{m.documents}</dd>
              </dl>
            </section>
          ))}
        </div>
      </article>
      {section !== 'Module readiness' && (
        <article>
          <h2>Provision contractor organization</h2>
          <p>
            Provisioning is atomic and audited. New organizations start in
            onboarding status. A verified owner account is required.
          </p>
          <FieldsForm
            fields={[
              {
                name: 'name',
                label: 'New company name',
                required: true,
                maxLength: 160,
              },
              {
                name: 'slug',
                label: 'Unique public company slug',
                required: true,
                maxLength: 100,
              },
              {
                name: 'industry',
                label: 'Industry template',
                type: 'select',
                options: options([
                  'property_services',
                  'construction',
                  'roofing',
                ]),
              },
              {
                name: 'owner',
                label: 'Verified owner account UUID',
                required: true,
                maxLength: 36,
              },
            ]}
            submitLabel="Provision company"
            busy={task.busy}
            onSubmit={async (v) => {
              if (
                await task.run(async () => {
                  await repo.provision(
                    String(v.name),
                    String(v.slug),
                    String(v.industry) as CompanyProfile['industry'],
                    String(v.owner),
                  );
                }, 'Organization provisioned in onboarding status.')
              )
                refresh();
            }}
          />
          <p role="status">{task.message}</p>
        </article>
      )}
      <article>
        <h2>Organization configuration</h2>
        {companies.map((company) => (
          <CompanyControl
            key={company.id}
            repo={repo}
            company={company}
            onSaved={refresh}
          />
        ))}
      </article>
    </>
  );
}
