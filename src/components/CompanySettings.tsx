import { useCallback } from 'react';
import type { Operations, Row } from '../lib/operations';
import type { CompanyProfile } from '../domain/platform';
import { FieldsForm, ResourceStatus, type Field } from './forms';
import { useResource, useTask, options } from './forms-state';
const settingsFields: Field[] = [
  { name: 'name', label: 'Company name', required: true, maxLength: 160 },
  {
    name: 'industry',
    label: 'Industry type',
    type: 'select',
    options: options(['property_services', 'construction', 'roofing']),
  },
  { name: 'primary_color', label: 'Primary brand color', type: 'color' },
  { name: 'accent_color', label: 'Accent brand color', type: 'color' },
  {
    name: 'business_address',
    label: 'Business address',
    type: 'textarea',
    maxLength: 500,
  },
  {
    name: 'contact_email',
    label: 'Business email',
    type: 'email',
    maxLength: 254,
  },
  {
    name: 'contact_phone',
    label: 'Business phone',
    type: 'tel',
    maxLength: 40,
  },
  { name: 'website', label: 'Website (HTTPS)', maxLength: 500 },
  {
    name: 'service_areas',
    label: 'Service areas',
    type: 'textarea',
    maxLength: 2000,
  },
  {
    name: 'specialties',
    label: 'Industry specialties',
    type: 'textarea',
    maxLength: 2000,
  },
  {
    name: 'license_metadata',
    label: 'License information',
    type: 'textarea',
    maxLength: 2000,
    hint: 'Non-secret license number, jurisdiction and expiration.',
  },
  {
    name: 'insurance_metadata',
    label: 'Insurance information',
    type: 'textarea',
    maxLength: 2000,
    hint: 'Coverage and expiration metadata only. Do not enter sensitive policy documents.',
  },
  {
    name: 'estimate_prefix',
    label: 'Estimate number prefix',
    required: true,
    maxLength: 12,
  },
  {
    name: 'estimate_next_number',
    label: 'Next estimate number',
    type: 'number',
    min: 1,
    max: 999999999,
    required: true,
  },
  {
    name: 'expiration_days',
    label: 'Estimate expiration (days)',
    type: 'number',
    min: 1,
    max: 365,
    required: true,
  },
  {
    name: 'default_terms',
    label: 'Default draft terms',
    type: 'textarea',
    maxLength: 10000,
    hint: 'Draft configuration; legal approval is required before use in contracts.',
  },
  {
    name: 'material_markup_bps',
    label: 'Materials markup (basis points)',
    type: 'number',
    min: 0,
    max: 100000,
    required: true,
    hint: '100 basis points = 1%. Does not execute pricing.',
  },
  {
    name: 'labor_rate_minor',
    label: 'Default hourly labor rate (minor units)',
    type: 'number',
    min: 0,
    max: 100000000,
    required: true,
    hint: 'USD example: 10000 = $100.00.',
  },
  { name: 'currency', label: 'Currency code', required: true, maxLength: 3 },
  {
    name: 'intake_enabled',
    label: 'Publish branded intake profile',
    type: 'checkbox',
    hint: 'Submission also requires server CAPTCHA and gateway configuration.',
  },
  {
    name: 'service_categories',
    label: 'Intake service categories',
    type: 'textarea',
    required: true,
    maxLength: 2000,
    hint: 'One service category per line.',
  },
];
export function CompanySettings({
  repo,
  company,
  onSaved,
}: {
  repo: Operations;
  company: CompanyProfile;
  onSaved: () => void;
}) {
  const org = company.id;
  const settings = useResource(
    useCallback(() => repo.getSettings(org), [repo, org]),
  );
  const images = useResource(
    useCallback(() => repo.listCleanImages(org), [repo, org]),
  );
  const task = useTask();
  return (
    <article>
      <h2>Company profile and operating defaults</h2>
      <p>
        Brand, business information and estimating defaults belong to this
        company.
      </p>
      <ResourceStatus {...settings} />
      {settings.data && !settings.loading && (
        <FieldsForm
          key={settings.data.updated_at}
          fields={[
            ...settingsFields,
            {
              name: 'logo_document_id',
              label: 'Approved company logo',
              type: 'select',
              options: [
                { value: '', label: 'Use company initials' },
                ...(images.data ?? []).map((d) => ({
                  value: d.id,
                  label: d.display_name,
                })),
              ],
              hint: 'Only scanned company images can be selected. Uploads remain disabled.',
            },
          ]}
          initial={{
            ...settings.data,
            ...company,
            service_categories: settings.data.service_categories.join('\n'),
            logo_document_id: company.logo_document_id ?? '',
          }}
          submitLabel="Save company settings"
          busy={task.busy}
          onSubmit={async (values) => {
            const {
              name,
              industry,
              primary_color,
              accent_color,
              logo_document_id,
              ...rest
            } = values;
            const profile = {
              name: String(name),
              industry: String(industry) as CompanyProfile['industry'],
              primary_color: String(primary_color),
              accent_color: String(accent_color),
              logo_document_id: String(logo_document_id) || null,
            };
            const next = {
              ...rest,
              service_categories: String(rest.service_categories)
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            } as Partial<Row<'company_settings'>>;
            if (await task.run(() => repo.saveSettings(org, profile, next))) {
              settings.reload();
              onSaved();
            }
          }}
        />
      )}
      <p role="status">{task.message}</p>
      <div className="notice">
        <strong>Merchant account configuration</strong>
        <p>
          Each company will have a separately approved merchant account.
          Provider credentials and banking details are never collected here.
          Payment execution remains disabled.
        </p>
      </div>
    </article>
  );
}
