import { productBrand } from './domain/brand';
import { useState, type FormEvent } from 'react';
import { supabase } from './lib/supabase';

export function Mfa() {
  const [factorId, setFactorId] = useState('');
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  async function prepare() {
    if (!supabase) return;
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setMessage('Sign in first, then set up or verify MFA.');
      return;
    }
    const existing = data.totp.find((f) => f.status === 'verified');
    if (existing) {
      setFactorId(existing.id);
      setMessage('Enter the code from your authenticator.');
      return;
    }
    const result = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `${productBrand.shortName} authenticator`,
    });
    if (result.error) {
      setMessage('Unable to enroll MFA. Contact your administrator.');
      return;
    }
    setFactorId(result.data.id);
    setQr(result.data.totp.qr_code);
    setMessage('Scan this QR code with your authenticator, then verify.');
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !factorId) return;
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    setCode('');
    if (error) {
      setMessage('Verification failed. Try a current authenticator code.');
      return;
    }
    setQr('');
    setMessage('MFA verified.');
    window.location.reload();
  }
  return (
    <section aria-label="Multi-factor verification">
      <p className="mfa-product">{productBrand.shortName} · Account security</p>
      <button type="button" onClick={() => void prepare()}>
        Set up or verify MFA
      </button>
      <p role="status">{message}</p>
      {qr && (
        <img
          className="mfa-qr"
          src={qr}
          alt="Authenticator enrollment QR code. Keep this private."
        />
      )}
      {factorId && (
        <form onSubmit={verify}>
          <label>
            Authenticator code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button type="submit">Verify code</button>
        </form>
      )}
    </section>
  );
}
