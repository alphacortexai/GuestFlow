import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";

type AdminLoginProps = { onAuthenticated: () => void };

export default function AdminLogin({ onAuthenticated }: AdminLoginProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "Unable to sign in. Please try again.");
        return;
      }
      onAuthenticated();
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="admin-auth-screen">
      <div className="admin-auth-glow admin-auth-glow-one" />
      <div className="admin-auth-glow admin-auth-glow-two" />
      <section className="admin-auth-card" aria-labelledby="admin-login-title">
        <div className="admin-auth-brand"><span className="brand-mark"><Sparkles size={17} /></span><span>guestflow</span></div>
        <div className="admin-auth-icon"><LockKeyhole size={25} /></div>
        <span className="admin-auth-kicker">ADMIN ACCESS</span>
        <h1 id="admin-login-title">Welcome<br /><em>back.</em></h1>
        <p>Enter the admin password to open the front-desk dashboard.</p>
        <form onSubmit={submit} className="admin-auth-form">
          <label htmlFor="admin-password">Password</label>
          <input id="admin-password" type="password" autoFocus autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          {error && <div className="admin-auth-error" role="alert">{error}</div>}
          <button type="submit" disabled={isSubmitting}><span>{isSubmitting ? "Signing in…" : "Open dashboard"}</span><ArrowRight size={17} /></button>
        </form>
        <div className="admin-auth-note">The client check-in screen remains publicly accessible.</div>
      </section>
    </main>
  );
}
