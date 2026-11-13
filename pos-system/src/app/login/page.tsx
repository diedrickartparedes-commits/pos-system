"use client";
import { FormEvent, useState } from "react";
export default function Login() {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setError(""); const f = new FormData(e.currentTarget); const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: f.get("username"), password: f.get("password") }) }); const d = await r.json(); setBusy(false); if (!r.ok) setError(d.error); else location.assign(new URLSearchParams(location.search).get("next") || "/"); }
  return <main className="login-page"><div className="login-card"><div className="brand-mark">H&A</div><span className="eyebrow">HOME CENTRE</span><h1>Welcome back</h1><p>Sign in to your point of sale.</p><form onSubmit={submit}><label>Username<input autoComplete="username" name="username" required /></label><label>Password<input type="password" autoComplete="current-password" name="password" required /></label>{error && <div className="alert error">{error}</div>}<button className="primary full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></form><small>Secure staff access</small></div></main>;
}
