import { PlatformBrand } from '../PlatformBrand';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Mfa } from '../../Mfa';
import { ReleaseRepository } from '../../lib/release';
import { FieldsForm, type Values } from '../forms';
import {
  invoiceBalance,
  verifyLedger,
  type ReleaseAction,
  type ReleaseActor,
  type ReleaseContext,
  type ReleaseInput,
  type ReleaseWorkspace,
  type SellingScope,
} from '../../domain/release/types';
import './release.css';
const money = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    n /
      10 **
        (new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency,
        }).resolvedOptions().maximumFractionDigits ?? 2),
  );
function Scope({ scope }: { scope: SellingScope }) {
  return (
    <div
      className="release-document"
      style={{ borderTopColor: scope.company.primary_color }}
    >
      <span className="eyebrow">INTERNAL TEST · CUSTOMER PRICE PROJECTION</span>
      <h2>{scope.company.name}</h2>
      <p>
        {scope.company.business_address} · {scope.company.contact_email}
      </p>
      <h3>{scope.project.name}</h3>
      <p>{scope.customer.display_name}</p>
      <p>{scope.project.description}</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Included scope</th>
              <th scope="col">Quantity</th>
              <th scope="col">Selling price</th>
            </tr>
          </thead>
          <tbody>
            {scope.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td>
                <td>
                  {l.quantity_milli / 1000} {l.unit.replaceAll('_', ' ')}
                </td>
                <td>{money(l.amount_minor, scope.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Subtotal {money(scope.subtotal_minor, scope.currency)} · Discount{' '}
        {money(scope.discount_minor, scope.currency)} · Tax{' '}
        {money(scope.tax_minor, scope.currency)}
      </p>
      <strong>Total {money(scope.total_minor, scope.currency)}</strong>
      <p>{scope.notes}</p>
      <p className="release-terms">{scope.terms}</p>
      {scope.schedule.length > 0 && (
        <>
          <h3>Proposed deposit and schedule</h3>
          {scope.schedule.map((s, i) => (
            <p key={i}>
              {s.label} · {money(s.amount_minor, scope.currency)} ·{' '}
              {s.due_on ?? 'Milestone authorization required'}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
export function ReleaseApp({ sample }: { sample: boolean }) {
  const repo = useMemo(() => new ReleaseRepository(sample), [sample]);
  const [contexts, setContexts] = useState<ReleaseContext[]>([]),
    [org, setOrg] = useState(''),
    [actor, setActor] = useState<ReleaseActor>('staff'),
    [storedData, setData] = useState<ReleaseWorkspace | null>(null),
    [loadedKey, setLoadedKey] = useState(''),
    [versions, setVersions] = useState<{ id: string; label: string }[]>([]),
    [version, setVersion] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [offerId, setOfferId] = useState(''),
    [contractId, setContractId] = useState(''),
    [invoiceId, setInvoiceId] = useState('');
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const rows = await repo.contexts();
        if (live) {
          setContexts(rows);
          setOrg(rows[0]?.id ?? '');
          setActor(rows[0]?.actor ?? 'staff');
        }
      } catch {
        if (live)
          setMessage(
            'Internal testing is unavailable. Sign in with an approved test identity.',
          );
      } finally {
        if (live) setLoading(false);
      }
    }
    void load();
    const subscription =
      !sample && supabase
        ? supabase.auth.onAuthStateChange(() => {
            void load();
          })
        : null;
    return () => {
      live = false;
      subscription?.data.subscription.unsubscribe();
    };
  }, [repo, sample]);
  useEffect(() => {
    let live = true;
    if (!org) return;
    async function load() {
      try {
        const w = await repo.read(org, actor);
        const v = w.actor === 'staff' ? await repo.versions(org) : [];
        if (live) {
          setData(w);
          setLoadedKey(`${org}:${actor}`);
          setOfferId('');
          setContractId('');
          setInvoiceId('');
          setVersions(v);
          setVersion(v[0]?.id ?? '');
        }
      } catch {
        if (live) setMessage('Unable to load authorized internal test data.');
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [org, actor, repo]);
  async function run(action: ReleaseAction, input: ReleaseInput) {
    setBusy(true);
    setMessage('');
    try {
      await repo.command(org, actor, action, input);
      setData(await repo.read(org, actor));
      setLoadedKey(`${org}:${actor}`);
      setMessage('Internal test transition recorded. No external execution.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Transition failed');
    } finally {
      setBusy(false);
    }
  }
  const data = loadedKey === `${org}:${actor}` ? storedData : null;
  const offer =
      data?.release_offers.find((o) => o.id === offerId) ??
      data?.release_offers.at(-1),
    contract =
      data?.release_contracts.find((o) => o.id === contractId) ??
      data?.release_contracts.at(-1),
    invoice =
      data?.release_invoices.find((o) => o.id === invoiceId) ??
      data?.release_invoices.at(-1);
  const decision = data?.release_decisions.find(
      (d) => d.offer_id === offer?.id,
    ),
    signature = data?.release_signatures.find(
      (s) => s.contract_id === contract?.id,
    );
  let balance: number | null = null,
    reconciled = false;
  if (invoice && data) {
    try {
      balance = invoiceBalance(invoice, data.release_payment_events);
      verifyLedger(
        invoice,
        data.release_ledger_entries,
        data.release_payment_events,
      );
      reconciled = true;
    } catch {
      balance = null;
    }
  }
  const staff = data?.actor === 'staff';
  return (
    <main className="release-shell">
      <PlatformBrand href="/preview" />
      <span className="eyebrow">RELEASE 1.0 · INTERNAL DEVELOPMENT</span>
      <h1>Customer workflow laboratory</h1>
      <p className="notice">
        {sample
          ? 'Synthetic preview · in-memory records reset on reload. Role switching is a fixture control.'
          : 'Connected internal development · actual signed-in identity and server grants apply.'}{' '}
        Outside access, live delivery, signatures for real agreements, charges
        and payroll execution remain disabled.
      </p>
      <p role="status">
        {message}
        {loading ? ' Loading authorized contexts…' : ''}
      </p>
      {!sample && contexts.length === 0 && (
        <section>
          <h2>Approved internal sign-in</h2>
          <FieldsForm
            fields={[
              { name: 'email', label: 'Internal test email', type: 'email' },
              { name: 'password', label: 'Password', type: 'password' },
            ]}
            submitLabel="Sign in"
            onSubmit={async (v) => {
              if (!supabase) return;
              const r = await supabase.auth.signInWithPassword({
                email: String(v.email),
                password: String(v.password),
              });
              if (r.error) setMessage('Sign-in failed.');
            }}
          />
          <Mfa />
          <p>
            An expiring operator test grant is required. Company ownership alone
            cannot enable this workspace.
          </p>
        </section>
      )}
      {contexts.length > 0 && (
        <section className="release-controls">
          <label>
            Company context
            <select
              value={org}
              onChange={(e) => {
                setOrg(e.target.value);
                if (!sample)
                  setActor(
                    contexts.find((c) => c.id === e.target.value)!.actor,
                  );
              }}
            >
              {contexts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {sample && (
            <label>
              Synthetic actor
              <select
                value={actor}
                onChange={(e) => setActor(e.target.value as ReleaseActor)}
              >
                <option value="staff">Company administrator</option>
                <option value="customer">Customer</option>
              </select>
            </label>
          )}
          <strong>
            {data?.actor === 'customer'
              ? 'Customer portal view'
              : 'Contractor administration'}
          </strong>
        </section>
      )}
      {data && (
        <div className="release-grid">
          {!sample && staff && (
            <section>
              <h2>Approved internal customer identity</h2>
              <p>
                Only a verified identity with a current operator-issued test
                grant can be linked. This sends no invitation or message.
              </p>
              <FieldsForm
                key={org}
                fields={[
                  {
                    name: 'customer_id',
                    label: 'Company customer UUID',
                    maxLength: 36,
                  },
                  {
                    name: 'user_id',
                    label: 'Approved internal Auth user UUID',
                    maxLength: 36,
                  },
                  {
                    name: 'active',
                    label: 'Customer portal identity active',
                    type: 'checkbox',
                  },
                ]}
                initial={{ active: true }}
                submitLabel="Link approved test identity"
                busy={busy}
                onSubmit={(v) =>
                  run('link_customer', {
                    customer_id: v.customer_id,
                    user_id: v.user_id,
                    active: v.active === true,
                  })
                }
              />
            </section>
          )}

          <section>
            <h2>1. Estimate delivery and decision</h2>
            {staff && (
              <>
                <label>
                  Issued estimate version
                  <select
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                  >
                    {versions.map((v) => (
                      <option value={v.id} key={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={busy || !version}
                  onClick={() =>
                    void run('publish_offer', { version_id: version })
                  }
                >
                  Publish to internal portal and sink
                </button>
              </>
            )}
            {data.release_offers.length > 0 && (
              <label>
                Published offer
                <select
                  value={offer?.id ?? ''}
                  onChange={(e) => setOfferId(e.target.value)}
                >
                  {data.release_offers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.snapshot.project.name} · {o.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {offer && (
              <>
                <Scope scope={offer.snapshot} />
                <p>
                  Offer expires {new Date(offer.expires_at).toLocaleString()} ·{' '}
                  {decision?.decision ?? 'Awaiting customer decision'}
                </p>
                {!staff && !decision && (
                  <FieldsForm
                    key={offer.id}
                    fields={[
                      {
                        name: 'decision',
                        label: 'Estimate decision',
                        type: 'select',
                        options: [
                          { value: 'accepted', label: 'Accept exact scope' },
                          { value: 'declined', label: 'Decline' },
                          {
                            value: 'changes_requested',
                            label: 'Request changes',
                          },
                        ],
                      },
                      {
                        name: 'note',
                        label: 'Decision note',
                        type: 'textarea',
                        required: false,
                        maxLength: 2000,
                      },
                      {
                        name: 'consent',
                        label:
                          'I understand this records a synthetic internal test decision',
                        type: 'checkbox',
                      },
                    ]}
                    initial={{ decision: 'accepted' }}
                    submitLabel="Record test decision"
                    busy={busy}
                    onSubmit={(v) =>
                      run('decide_offer', {
                        offer_id: offer.id,
                        decision: v.decision,
                        note: v.note ?? '',
                        consent: v.consent === true,
                      })
                    }
                  />
                )}
              </>
            )}
          </section>
          <section>
            <h2>2. Contract and signature evidence</h2>
            {staff &&
              offer &&
              decision?.decision === 'accepted' &&
              !data.release_contracts.some((c) => c.offer_id === offer.id) && (
                <FieldsForm
                  fields={[
                    {
                      name: 'legal_reference',
                      label: 'Reviewed template reference',
                      maxLength: 1000,
                    },
                    {
                      name: 'terms',
                      label: 'Contract terms',
                      type: 'textarea',
                      maxLength: 20000,
                    },
                  ]}
                  initial={{
                    legal_reference: 'Synthetic internal template v1',
                    terms:
                      'Synthetic contract terms for internal workflow testing only. No actual agreement is executed.',
                  }}
                  submitLabel="Create immutable test contract"
                  busy={busy}
                  onSubmit={(v) =>
                    run('create_contract', {
                      offer_id: offer.id,
                      terms: v.terms,
                      legal_reference: v.legal_reference,
                    })
                  }
                />
              )}
            {data.release_contracts.length > 0 && (
              <label>
                Contract
                <select
                  value={contract?.id ?? ''}
                  onChange={(e) => setContractId(e.target.value)}
                >
                  {data.release_contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.legal_reference} · {c.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {contract && (
              <>
                <h3>{contract.document.scope.company.name}</h3>
                <p>
                  {contract.document.scope.project.name} ·{' '}
                  {money(
                    contract.document.scope.total_minor,
                    contract.document.scope.currency,
                  )}
                </p>
                <p className="release-terms">{contract.terms}</p>
                <small className="release-hash">
                  Document SHA-256: {contract.document_hash}
                </small>
                <p>
                  {signature
                    ? `Test signature: ${signature.typed_name} · ${new Date(signature.signed_at).toLocaleString()}`
                    : 'Awaiting customer test signature'}
                </p>
                {!staff && !signature && (
                  <FieldsForm
                    fields={[
                      {
                        name: 'typed_name',
                        label: 'Typed signature name',
                        maxLength: 160,
                      },
                      {
                        name: 'consent',
                        label:
                          'I reviewed this exact contract and consent to a synthetic electronic test signature',
                        type: 'checkbox',
                      },
                    ]}
                    submitLabel="Sign internal test contract"
                    busy={busy}
                    onSubmit={(v) =>
                      run('sign_contract', {
                        contract_id: contract.id,
                        document_hash: contract.document_hash,
                        typed_name: v.typed_name,
                        consent: v.consent === true,
                      })
                    }
                  />
                )}
              </>
            )}
          </section>
          <section className="release-invoice-section">
            <h2>3. Branded invoice and authorized deposit</h2>
            {staff &&
              contract &&
              signature &&
              !data.release_invoices.some(
                (i) => i.contract_id === contract.id,
              ) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run('create_invoice', { contract_id: contract.id })
                  }
                >
                  Create invoice from signed test contract
                </button>
              )}
            {data.release_invoices.length > 0 && (
              <label>
                Invoice
                <select
                  value={invoice?.id ?? ''}
                  onChange={(e) => setInvoiceId(e.target.value)}
                >
                  {data.release_invoices.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.invoice_number}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {invoice && (
              <>
                <div className="release-invoice-print">
                  <h3>{invoice.invoice_number}</h3>
                  <Scope scope={invoice.snapshot} />
                  <p>
                    <strong>
                      Outstanding test balance:{' '}
                      {balance === null
                        ? 'Reconciliation error'
                        : money(balance, invoice.currency)}
                    </strong>
                  </p>
                </div>
                <p>
                  {reconciled
                    ? 'Ledger reconciled · tax is separate from sales'
                    : 'Ledger requires review'}
                </p>
                <button disabled={!reconciled} onClick={() => window.print()}>
                  Print internal invoice preview
                </button>
                {!staff && balance !== null && balance > 0 && (
                  <FieldsForm
                    key={invoice.id}
                    fields={[
                      {
                        name: 'amount_minor',
                        label: 'Authorize test amount (currency minor units)',
                        type: 'number',
                        min: 1,
                        max: balance,
                      },
                      {
                        name: 'consent',
                        label:
                          'Authorize this one-time synthetic test amount only; no real charge',
                        type: 'checkbox',
                      },
                    ]}
                    initial={{
                      amount_minor: Math.min(
                        balance,
                        invoice.snapshot.schedule[0]?.amount_minor ?? balance,
                      ),
                    }}
                    submitLabel="Authorize synthetic payment"
                    busy={busy}
                    onSubmit={(v) =>
                      run('authorize_payment', {
                        invoice_id: invoice.id,
                        amount_minor: Number(v.amount_minor),
                        consent: v.consent === true,
                      })
                    }
                  />
                )}
                {staff &&
                  data.release_authorizations
                    .filter(
                      (a) =>
                        a.invoice_id === invoice.id &&
                        !data.release_payment_events.some(
                          (e) =>
                            e.authorization_id === a.id &&
                            e.kind === 'synthetic_capture',
                        ),
                    )
                    .map((a) => (
                      <article key={a.id}>
                        <p>
                          Customer authorized{' '}
                          {money(a.amount_minor, a.currency)} · one-time
                          internal test
                        </p>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run('synthetic_capture', {
                              invoice_id: invoice.id,
                              authorization_id: a.id,
                              amount_minor: a.amount_minor,
                              idempotency_key: crypto.randomUUID(),
                              adjusts_event_id: null,
                            })
                          }
                        >
                          Record synthetic capture
                        </button>
                      </article>
                    ))}
                {data.release_payment_events
                  .filter((e) => e.invoice_id === invoice.id)
                  .map((e) => (
                    <article key={e.id}>
                      <strong>
                        {e.kind.replaceAll('_', ' ')} ·{' '}
                        {money(e.amount_minor, e.currency)}
                      </strong>
                      <p>
                        {e.id} · {new Date(e.created_at).toLocaleString()}
                      </p>
                      {staff &&
                        e.kind === 'synthetic_capture' &&
                        !data.release_payment_events.some(
                          (r) => r.adjusts_event_id === e.id,
                        ) && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run('synthetic_refund', {
                                invoice_id: invoice.id,
                                authorization_id: e.authorization_id,
                                amount_minor: e.amount_minor,
                                idempotency_key: crypto.randomUUID(),
                                adjusts_event_id: e.id,
                              })
                            }
                          >
                            Record full synthetic refund
                          </button>
                        )}
                    </article>
                  ))}
              </>
            )}
          </section>
          <section>
            <h2>4. Company email configuration and internal delivery</h2>
            {staff ? (
              <>
                <FieldsForm
                  key={org}
                  fields={[
                    {
                      name: 'sender_name',
                      label: 'Company sender name',
                      maxLength: 160,
                    },
                    {
                      name: 'sender_email',
                      label: 'Company sender email',
                      type: 'email',
                      maxLength: 254,
                    },
                    { name: 'domain', label: 'Sending domain', maxLength: 253 },
                  ]}
                  initial={{
                    sender_name: contexts.find((c) => c.id === org)?.name ?? '',
                    sender_email: 'office@example.test',
                    domain: 'example.test',
                    ...data.email_profile,
                  }}
                  submitLabel="Save unverified sender configuration"
                  busy={busy}
                  onSubmit={(v: Values) =>
                    run('configure_email', {
                      sender_name: v.sender_name,
                      sender_email: v.sender_email,
                      domain: v.domain,
                    })
                  }
                />
                <p>
                  Domain status:{' '}
                  {data.email_profile?.status ?? 'Not configured'}. Verification
                  requires independent provider evidence; this form cannot
                  verify or send.
                </p>
              </>
            ) : (
              <p>
                Only customer-authorized selling prices and scope are visible.
                Company payroll and supplier costs remain private.
              </p>
            )}
            <h3>Internal sink messages</h3>
            {data.release_messages.map((m) => (
              <article key={m.id}>
                <strong>{m.subject}</strong>
                <p>{m.body}</p>
                <small>
                  {m.channel} · {new Date(m.created_at).toLocaleString()}
                </small>
              </article>
            ))}
          </section>
        </div>
      )}
      <p>
        Internal electronic consent and synthetic ledger entries do not
        establish production legal, signature-provider, merchant or email
        readiness.
      </p>
    </main>
  );
}
