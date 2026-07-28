'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Check, Loader2, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { AccountState, getAccount, loginAccount, logoutAccount, registerAccount } from '@/lib/backend-api'

const empty: AccountState = { authenticated: false, user: null, searches: [] }

export default function AccountPage() {
  const [account, setAccount] = useState<AccountState>(empty)
  const [mode, setMode] = useState<'register' | 'login'>('register')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('error')
      ? 'Google sign-in could not be completed. Check your OAuth redirect configuration.'
      : ''
  })

  useEffect(() => {
    getAccount().then(setAccount).catch(() => undefined).finally(() => setBusy(false))
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const next = mode === 'register'
        ? await registerAccount({ name, email, password })
        : await loginAccount({ email, password })
      setAccount(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete account request.')
    } finally {
      setBusy(false)
    }
  }

  if (busy && !account.user) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>

  return (
    <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-5xl items-center justify-center px-4 py-10">
      <div className="grid w-full overflow-hidden rounded-3xl border border-border bg-card shadow-2xl lg:grid-cols-[1fr_0.9fr]">
        <div className="hidden bg-primary p-10 text-primary-foreground lg:block">
          <div className="mb-16 flex size-11 items-center justify-center rounded-2xl bg-black/15"><UserRound /></div>
          <h1 className="text-4xl font-semibold tracking-tight">Your Reelhouse.</h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed opacity-80">Keep your searches, downloads, and preferences together across sessions.</p>
          <div className="mt-10 space-y-3 text-sm"><p className="flex gap-2"><Check className="size-4" /> Saved search history</p><p className="flex gap-2"><Check className="size-4" /> Protected account session</p><p className="flex gap-2"><Check className="size-4" /> Download history that survives restarts</p></div>
        </div>
        <div className="p-6 sm:p-10">
          {account.authenticated ? (
            <>
              <p className="text-sm text-muted-foreground">Signed in as</p><h2 className="mt-1 text-2xl font-semibold">{account.user?.name || account.user?.email}</h2><p className="mt-1 text-sm text-muted-foreground">{account.user?.email}</p>
              <div className="mt-8 rounded-2xl border border-border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent searches</p>{account.searches.length ? <div className="mt-3 flex flex-wrap gap-2">{account.searches.map((s) => <span key={s} className="rounded-full bg-muted px-3 py-1 text-sm">{s}</span>)}</div> : <p className="mt-3 text-sm text-muted-foreground">Your searches will appear here.</p>}</div>
              <button onClick={() => logoutAccount().then(setAccount)} className="mt-6 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><LogOut className="size-4" /> Sign out</button>
            </>
          ) : (
            <><div className="mb-8"><p className="text-sm font-medium text-primary">REELHOUSE ACCOUNT</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">{mode === 'register' ? 'Create your account' : 'Welcome back'}</h2><p className="mt-2 text-sm text-muted-foreground">{mode === 'register' ? 'Start saving your Reelhouse activity.' : 'Sign in to continue where you left off.'}</p></div>
              <button type="button" onClick={() => window.location.assign('/api/backend/account/google/start/')} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border font-semibold hover:bg-muted"><span className="text-base font-bold">G</span> Continue with Google</button>
              <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /> or use email <span className="h-px flex-1 bg-border" /></div>
              <form onSubmit={submit} className="space-y-4">{mode === 'register' && <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" />}<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" /><input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ characters)" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" />{error && <p className="text-sm text-destructive">{error}</p>}<button disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90">{busy && <Loader2 className="size-4 animate-spin" />}{mode === 'register' ? 'Create account' : 'Sign in'}</button></form>
              <button onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError('') }} className="mt-5 w-full text-sm text-muted-foreground hover:text-foreground">{mode === 'register' ? 'Already have an account? Sign in' : 'Need an account? Register'}</button><p className="mt-6 flex gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0" /> Passwords are hashed by Django and are never stored in the browser.</p></>
          )}
        </div>
      </div>
    </div>
  )
}
