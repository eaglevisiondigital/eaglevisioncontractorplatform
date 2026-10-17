import { PlatformBrand } from './PlatformBrand';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mfa } from '../Mfa';
import { useTask } from './forms-state';
export function Join({ sample }: { sample: boolean }) {
  const task = useTask();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '',
  );
  return (
    <main className="landing">
      <PlatformBrand prominent />
      <span className="eyebrow">STAFF ACCESS</span>
      <h1>Join your company workspace.</h1>
      <p>
        Sign in with the verified account matching your invitation.
        Administrator invitations require MFA. Accounts are provisioned through
        an approved identity process; no email is sent here.
      </p>
      {sample ? (
        <p className="notice">
          Synthetic invitation preview. No Auth account or membership is
          changed.
        </p>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task.run(async () => {
                if (!supabase) throw new Error('Service unavailable');
                const { error } = await supabase.auth.signInWithPassword({
                  email,
                  password,
                });
                setPassword('');
                if (error)
                  throw new Error('Sign in failed. Verify your credentials.');
              }, 'Signed in. Verify MFA if required, then accept your invitation.');
            }}
          >
            <label>
              Account email
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Account password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={task.busy || !supabase}>
              Sign in to accept invitation
            </button>
          </form>
          <Mfa />
          <button
            disabled={task.busy || !token || !supabase}
            onClick={() =>
              void task.run(async () => {
                if (!supabase) throw new Error('Service unavailable');
                const { error } = await supabase.rpc('accept_invitation', {
                  p_token: token,
                });
                if (error)
                  throw new Error(
                    'Invitation unavailable. Verify account, MFA and expiration.',
                  );
                window.history.replaceState(null, '', '/join');
              }, 'Invitation accepted. Open your company workspace.')
            }
          >
            Accept invitation
          </button>
        </>
      )}
      <p role="status">{task.message}</p>
      <a href="/app">Sign in / open workspace</a>
    </main>
  );
}
