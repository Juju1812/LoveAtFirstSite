import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

function AuthShell({ title, subtitle, children, alt }: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  alt: React.ReactNode;
}) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <Link to="/" className="auth-back">← back</Link>
        <div className="auth-logo">👀</div>
        <h1 className="auth-title">{title}</h1>
        <p className="auth-sub">{subtitle}</p>
        {children}
        <div className="auth-alt">{alt}</div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back."
      subtitle="Your profile follows you to any device."
      alt={<>New here? <Link to="/signup">Create an account →</Link></>}
    >
      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await signup(email.trim(), password);
      navigate('/profile', { replace: true });
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Make it official."
      subtitle="One account. Your profile, anywhere you sign in."
      alt={<>Already have one? <Link to="/login">Sign in →</Link></>}
    >
      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <span className="field-hint">8+ characters</span>
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <p className="auth-fineprint">No emails sent. We only need this so you can log in from another device.</p>
      </form>
    </AuthShell>
  );
}
