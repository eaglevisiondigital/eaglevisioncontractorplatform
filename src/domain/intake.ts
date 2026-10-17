export interface IntakePayload {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  region: string;
  postal_code: string;
  country_code: string;
  property_type: 'residential' | 'commercial';
  service_category: string;
  description: string;
  preferred_appointment: string;
  contact_preference: 'email' | 'phone' | 'sms';
  email_consent: boolean;
  sms_consent: boolean;
  consent_version: 'contact-v1';
}
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateIntake(value: unknown): IntakePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid request');
  const p = value as Record<string, unknown>;
  const bounds: Record<string, [number, number]> = {
    name: [1, 200],
    email: [3, 254],
    phone: [5, 40],
    address: [1, 500],
    city: [1, 120],
    region: [1, 120],
    postal_code: [1, 30],
    country_code: [2, 2],
    service_category: [1, 120],
    description: [10, 5000],
    preferred_appointment: [0, 500],
  };
  const keys = [
    ...Object.keys(bounds),
    'property_type',
    'contact_preference',
    'email_consent',
    'sms_consent',
    'consent_version',
  ];
  if (Object.keys(p).some((k) => !keys.includes(k)))
    throw new Error('Unexpected request field');
  for (const [key, [min, max]] of Object.entries(bounds))
    if (
      typeof p[key] !== 'string' ||
      (p[key] as string).trim().length < min ||
      (p[key] as string).length > max
    )
      throw new Error(`Check ${key.replaceAll('_', ' ')}`);
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.email)) ||
    !/[0-9]/.test(String(p.phone)) ||
    !/^[A-Z]{2}$/.test(String(p.country_code))
  )
    throw new Error('Check your contact details');
  if (
    !['residential', 'commercial'].includes(String(p.property_type)) ||
    !['email', 'phone', 'sms'].includes(String(p.contact_preference)) ||
    typeof p.email_consent !== 'boolean' ||
    typeof p.sms_consent !== 'boolean' ||
    p.consent_version !== 'contact-v1'
  )
    throw new Error('Check your preferences');
  if (
    (p.contact_preference === 'email' && !p.email_consent) ||
    (p.contact_preference === 'sms' && !p.sms_consent)
  )
    throw new Error('Consent is required for your selected contact method');
  return p as unknown as IntakePayload;
}
