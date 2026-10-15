import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { Operations } from '../lib/operations';
import { sampleCompanies } from '../domain/platform';
import { validateIntake } from '../domain/intake';
import { FieldsForm, ResourceStatus, type Field } from './forms';
import { useResource, useTask, options } from './forms-state';
interface Profile {
  name: string;
  slug: string;
  primary_color: string;
  accent_color: string;
  industry: string;
  service_categories: string[];
}
interface PublicConfig {
  profile: Profile;
  site_key: string | null;
  ready: boolean;
}
interface Turnstile {
  render: (
    element: HTMLElement,
    config: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
function Verification({
  siteKey,
  onToken,
  reset,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  reset: number;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widget: string | undefined;
    let active = true;
    const render = () => {
      if (active && element.current && window.turnstile)
        widget = window.turnstile.render(element.current, {
          sitekey: siteKey,
          action: 'estimate_request',
          callback: onToken,
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        });
    };
    let script = document.querySelector<HTMLScriptElement>(
      'script[data-intake-verification]',
    );
    if (window.turnstile) render();
    else {
      if (!script) {
        script = document.createElement('script');
        script.src =
          'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.dataset.intakeVerification = 'true';
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener('load', render);
    }
    return () => {
      active = false;
      script?.removeEventListener('load', render);
      if (widget && window.turnstile) window.turnstile.remove(widget);
    };
  }, [siteKey, onToken, reset]);
  return <div ref={element} aria-label="Spam prevention verification" />;
}
export function PublicIntake({
  slug,
  repo,
  onReview,
}: {
  slug: string;
  repo: Operations;
  onReview?: () => void;
}) {
  const task = useTask();
  const [sent, setSent] = useState(false);
  const [token, setToken] = useState('');
  const [reset, setReset] = useState(0);
  const [key] = useState(() => crypto.randomUUID());
  const config = useResource(
    useCallback(async (): Promise<PublicConfig> => {
      if (repo.sample) {
        const company = sampleCompanies.find((c) => c.slug === slug);
        if (!company) throw new Error('Company intake unavailable');
        return {
          profile: {
            ...company,
            service_categories: [
              'General inquiry',
              'Repairs',
              'Remodeling',
              'Roofing',
            ],
          },
          site_key: null,
          ready: true,
        };
      }
      const response = await fetch(
        `/api/intake-profile?slug=${encodeURIComponent(slug)}`,
      );
      if (!response.ok) throw new Error('Company intake is unavailable.');
      return response.json() as Promise<PublicConfig>;
    }, [repo, slug]),
  );
  const profile = config.data?.profile;
  const fields: Field[] = [
    { name: 'name', label: 'Your name', required: true, maxLength: 200 },
    {
      name: 'email',
      label: 'Email address',
      type: 'email',
      required: true,
      maxLength: 254,
    },
    {
      name: 'phone',
      label: 'Phone number',
      type: 'tel',
      required: true,
      maxLength: 40,
    },
    {
      name: 'address',
      label: 'Job street address',
      required: true,
      maxLength: 500,
    },
    { name: 'city', label: 'City', required: true, maxLength: 120 },
    { name: 'region', label: 'State / region', required: true, maxLength: 120 },
    {
      name: 'postal_code',
      label: 'Postal code',
      required: true,
      maxLength: 30,
    },
    {
      name: 'country_code',
      label: 'Country code',
      required: true,
      maxLength: 2,
    },
    {
      name: 'property_type',
      label: 'Property type',
      type: 'select',
      options: options(['residential', 'commercial']),
    },
    {
      name: 'service_category',
      label: 'Service category',
      type: 'select',
      options: options(profile?.service_categories ?? ['General inquiry']),
    },
    {
      name: 'description',
      label: 'Tell us about your project',
      type: 'textarea',
      required: true,
      maxLength: 5000,
    },
    {
      name: 'preferred_appointment',
      label: 'Preferred appointment or availability',
      maxLength: 500,
    },
    {
      name: 'contact_preference',
      label: 'Preferred contact method',
      type: 'select',
      options: options(['email', 'phone', 'sms']),
    },
    {
      name: 'email_consent',
      label: 'I permit email contact about this request',
      type: 'checkbox',
    },
    {
      name: 'sms_consent',
      label: 'I permit SMS contact about this request',
      type: 'checkbox',
    },
  ];
  return (
    <main
      className="public-intake"
      style={
        {
          '--company-color': /^#[0-9a-f]{6}$/i.test(
            profile?.primary_color ?? '',
          )
            ? profile!.primary_color
            : '#247364',
        } as CSSProperties
      }
    >
      <span className="eyebrow">
        {repo.sample ? 'SYNTHETIC INTAKE PREVIEW' : 'ESTIMATE REQUEST'}
      </span>
      <div className="public-brand">
        <div className="company-avatar">
          {profile?.name.slice(0, 2).toUpperCase() ?? 'EV'}
        </div>
        <strong>{profile?.name ?? 'Company intake'}</strong>
      </div>
      <h1>Let’s bring your project into focus.</h1>
      <p>
        Share the details. Your request goes directly to this company’s private
        workspace.
      </p>
      {repo.sample && (
        <div className="notice">
          Use synthetic details only. This preview stays in memory and resets on
          reload. No messages are sent.
        </div>
      )}
      <ResourceStatus {...config} />
      {sent ? (
        <article>
          <h2>Request received</h2>
          <p>
            Thank you. Your inquiry has been added to the company’s review
            queue. No confirmation message has been sent.
          </p>
          {repo.sample && onReview && (
            <button onClick={onReview}>Review in contractor workspace</button>
          )}
        </article>
      ) : (
        profile && (
          <article>
            <h2>Project details</h2>
            {!config.data?.ready && (
              <p className="notice">
                Submissions are unavailable until verification and gateway
                configuration are approved.
              </p>
            )}
            <p>
              Attachments are disabled until the approved scanning pipeline is
              operational.
            </p>
            {config.data?.site_key && (
              <Verification
                siteKey={config.data.site_key}
                onToken={setToken}
                reset={reset}
              />
            )}
            <FieldsForm
              honeypot
              fields={fields}
              initial={{
                country_code: 'US',
                email_consent: false,
                sms_consent: false,
              }}
              submitLabel="Send estimate request"
              busy={
                task.busy || !config.data?.ready || (!repo.sample && !token)
              }
              onSubmit={async (values) => {
                if (
                  await task.run(async () => {
                    const { _website, ...submittedValues } = values;
                    if (_website) throw new Error('Request denied');
                    const payload = validateIntake({
                      ...submittedValues,
                      consent_version: 'contact-v1',
                    });
                    if (repo.sample) await repo.sampleSubmit(slug, payload);
                    else {
                      const response = await fetch('/api/intake-submit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          slug,
                          payload,
                          verification_token: token,
                          honeypot: String(_website ?? ''),
                          idempotency_key: key,
                        }),
                      });
                      const result = (await response.json()) as {
                        error?: string;
                      };
                      if (!response.ok)
                        throw new Error(result.error ?? 'Unable to submit');
                    }
                    setSent(true);
                  }, 'Request received')
                )
                  return;
                setToken('');
                setReset((n) => n + 1);
              }}
            />
            <p className="muted">
              Contact consent is optional; choose phone contact if you decline
              email and SMS. Consent applies to this inquiry, not marketing.
              Policy: contact-v1.
            </p>
            <p role="status">{task.message}</p>
          </article>
        )
      )}
      <footer>
        Eagle Vision Contractor Platform · Company-specific intake
      </footer>
    </main>
  );
}
