import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import Logo, { Monogram, Wordmark } from '../components/Logo'

const CF_URL = 'https://neezam-erp.chmabdulsamee9.workers.dev'
const isValidPhone = (p) => /^\d{11}$/.test(p.trim())

export default function Login() {
  // "login" | "signup" | "signup-otp" | "forgot" | "forgot-otp" | "forgot-reset"
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [brandName, setBrandName] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [signupDone, setSignupDone] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 900)

  // Signup OTP
  const [signupOtp, setSignupOtp] = useState('')

  // Forgot-password OTP
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotOtp, setForgotOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')

  useEffect(() => {
    const savedEmail = localStorage.getItem('neezam_email')
    const savedRemember = localStorage.getItem('neezam_remember')
    if (savedRemember === 'true' && savedEmail) {
      setEmail(savedEmail)
      setRememberMe(true)
    }
  }, [])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const switchMode = (m) => {
    setMode(m)
    setError('')
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (rememberMe) {
      localStorage.setItem('neezam_email', email)
      localStorage.setItem('neezam_remember', 'true')
    } else {
      localStorage.removeItem('neezam_email')
      localStorage.removeItem('neezam_remember')
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Email ya password galat hai!')
    setLoading(false)
  }

  // ---------- SIGNUP (OTP-gated) ----------
  const handleSignupSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!brandName.trim()) { setError('Brand name daalo'); return }
    if (!fullName.trim()) { setError('Apna naam daalo'); return }
    if (!isValidPhone(phone)) { setError('Phone number exactly 11 digits ka hona chahiye (sirf numbers)'); return }
    if (password.length < 6) { setError('Password kam az kam 6 characters ka ho'); return }
    if (password !== confirmPassword) { setError('Password aur Confirm Password match nahi karte'); return }

    setLoading(true)
    try {
      const res = await fetch(`${CF_URL}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'signup' }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setLoading(false); return }
      setSignupOtp('')
      setMode('signup-otp')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const resendSignupOtp = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${CF_URL}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'signup' }),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const handleVerifySignupOtp = async (e) => {
    e.preventDefault()
    setError('')
    if (!signupOtp.trim()) { setError('Code daalo'); return }
    setLoading(true)
    try {
      const verifyRes = await fetch(`${CF_URL}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'signup', code: signupOtp.trim() }),
      })
      const verifyData = await verifyRes.json()
      if (verifyData.error) { setError(verifyData.error); setLoading(false); return }

      // OTP verified — ab asal account/brand/profile banao
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) { setError(signUpError.message); setLoading(false); return }
      const userId = signUpData.user?.id
      if (!userId) { setError('Signup mein masla hua, dobara try karo'); setLoading(false); return }

      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .insert({ store_name: brandName.trim(), shopify_url: null, api_token: null })
        .select()
        .single()
      if (storeError) { setError('Brand create karne mein error: ' + storeError.message); setLoading(false); return }

      await supabase.from('profiles').insert({
        id: userId,
        email,
        full_name: fullName.trim(),
        phone: phone.trim(),
        role: 'admin',
        approved: false,
      })

      await supabase.from('user_stores').insert({ user_id: userId, store_id: storeData.id })

      // Welcome email best-effort hai — fail ho to bhi signup complete maana jayega
      fetch(`${CF_URL}/send-welcome-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName: fullName.trim() }),
      }).catch(() => {})

      setSignupDone(true)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  // ---------- FORGOT PASSWORD (OTP-gated) ----------
  const handleForgotSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!forgotEmail.trim()) { setError('Email daalo'); return }
    setLoading(true)
    try {
      const res = await fetch(`${CF_URL}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim(), purpose: 'password_reset' }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setLoading(false); return }
      setForgotOtp('')
      setMode('forgot-otp')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const resendForgotOtp = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${CF_URL}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim(), purpose: 'password_reset' }),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const handleVerifyForgotOtp = async (e) => {
    e.preventDefault()
    setError('')
    if (!forgotOtp.trim()) { setError('Code daalo'); return }
    setLoading(true)
    try {
      const res = await fetch(`${CF_URL}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim(), purpose: 'password_reset', code: forgotOtp.trim() }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setLoading(false); return }
      setMode('forgot-reset')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < 6) { setError('Password kam az kam 6 characters ka ho'); return }
    if (newPassword !== confirmNewPassword) { setError('Password match nahi karte'); return }
    setLoading(true)
    try {
      const res = await fetch(`${CF_URL}/reset-password-with-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim(), code: forgotOtp.trim(), newPassword }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setLoading(false); return }

      setEmail(forgotEmail.trim())
      setPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setForgotEmail('')
      setForgotOtp('')
      setResetSuccess(true)
      switchMode('login')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const inputBoxStyle = {
    width: '100%', padding: '10px', borderRadius: '9px', border: '1px solid var(--ne-border)',
    background: 'var(--ne-bg)', color: 'var(--ne-text)', boxSizing: 'border-box', fontSize: '14px', outline: 'none',
  }
  const labelStyle = { color: 'var(--ne-muted)', fontSize: '13px', display: 'block', marginBottom: '4px' }

  // ---------- SPLIT-LAYOUT SHELL (PostEx-style, Aurora Ledger theme) ----------
  const Shell = ({ children }) => (
    <div className="ne-app-shell" style={{ minHeight: '100dvh', display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>
      {!isMobile && (
        <div style={{ flex: 1, background: '#0A0E26', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(60% 50% at 30% 20%, rgba(92,124,250,.28), transparent 60%), radial-gradient(50% 45% at 80% 80%, rgba(168,85,247,.22), transparent 60%)',
          }} />
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <Monogram size={64} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <Wordmark size={34} />
            </div>
            <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, maxWidth: 320, lineHeight: 1.6, margin: '0 auto' }}>
              Multi-tenant order management ERP — Shopify, COD couriers, ads, aur finance sab ek jagah.
            </p>
          </div>
        </div>
      )}
      <div style={{ flex: isMobile ? 'none' : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', minHeight: isMobile ? '100dvh' : 'auto', boxSizing: 'border-box' }}>
        <div style={{ background: 'var(--ne-surface-2)', border: '1px solid var(--ne-border)', padding: isMobile ? '1.25rem' : '2rem', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 12px 40px rgba(0,0,0,.35)' }}>
          {isMobile && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <Logo size={40} wordmarkSize={24} gap={10} />
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  )

  if (signupDone) {
    return (
      <Shell>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          <h2 style={{ color: 'var(--ne-text)', margin: '0 0 8px', fontSize: 18 }}>Account ban gaya!</h2>
          <p style={{ color: 'var(--ne-muted)', fontSize: 13, lineHeight: 1.6 }}>
            Aapka account abhi <strong style={{ color: 'var(--ne-warning)' }}>approval ke liye pending</strong> hai.
            Jaise hi admin approve karega, aap login karke eNeezam use kar sakenge.
          </p>
          <button
            onClick={() => { setSignupDone(false); switchMode('login'); setEmail(''); setPassword(''); setConfirmPassword(''); setBrandName(''); setFullName(''); setPhone('') }}
            style={{ marginTop: 16, padding: '9px 20px', borderRadius: 9, border: '1px solid var(--ne-border)', background: 'transparent', color: 'var(--ne-muted)', fontSize: 13, cursor: 'pointer' }}>
            ← Login page pe jao
          </button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      {mode !== 'signup-otp' && mode !== 'forgot' && mode !== 'forgot-otp' && mode !== 'forgot-reset' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'var(--ne-bg)', border: '1px solid var(--ne-border)', borderRadius: 12, padding: 4 }}>
          <button
            onClick={() => switchMode('login')}
            style={{
              flex: 1, padding: '8px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              background: mode === 'login' ? 'var(--ne-grad)' : 'transparent',
              color: mode === 'login' ? '#fff' : 'var(--ne-muted)',
            }}>
            Login
          </button>
          <button
            onClick={() => switchMode('signup')}
            style={{
              flex: 1, padding: '8px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              background: mode === 'signup' ? 'var(--ne-grad)' : 'transparent',
              color: mode === 'signup' ? '#fff' : 'var(--ne-muted)',
            }}>
            Sign Up
          </button>
        </div>
      )}

      {error && (
        <div style={{ background: 'var(--ne-danger-soft)', border: '1px solid var(--ne-danger)', color: 'var(--ne-danger)', padding: '10px', borderRadius: '9px', marginBottom: '1rem', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {mode === 'login' && (
        <form onSubmit={handleLogin}>
          {resetSuccess && (
            <div style={{ background: 'var(--ne-success-soft)', border: '1px solid var(--ne-success)', color: 'var(--ne-success)', padding: '10px', borderRadius: '9px', marginBottom: '1rem', fontSize: '13px' }}>
              ✓ Password change ho gaya — naye password se login karo.
            </div>
          )}
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email type karein" required style={inputBoxStyle} />
          </div>

          <div style={{ marginBottom: '0.5rem' }}>
            <label style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password type karein"
                required
                style={{ ...inputBoxStyle, paddingRight: '60px' }}
              />
              <span
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ne-muted)', cursor: 'pointer', fontSize: '12px', userSelect: 'none' }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </span>
            </div>
          </div>

          <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
            <span onClick={() => { setResetSuccess(false); switchMode('forgot') }} style={{ color: 'var(--ne-accent)', fontSize: '12px', cursor: 'pointer' }}>
              Forgot Password?
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
            <input type="checkbox" id="remember" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#5C7CFA' }} />
            <label htmlFor="remember" style={{ color: 'var(--ne-muted)', fontSize: '13px', cursor: 'pointer' }}>Remember me</label>
          </div>

          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px', background: loading ? 'var(--ne-border)' : 'var(--ne-grad)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', cursor: 'pointer', fontWeight: '700' }}>
            {loading ? 'Login ho raha hai...' : 'Login'}
          </button>
        </form>
      )}

      {mode === 'signup' && (
        <form onSubmit={handleSignupSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Apna Naam</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Apna naam type karein" required style={inputBoxStyle} />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Phone Number</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="03xxxxxxxxx (11 digits)" maxLength={11} required style={inputBoxStyle} />
            {phone.length > 0 && !isValidPhone(phone) && (
              <p style={{ color: 'var(--ne-danger)', fontSize: '11px', margin: '4px 0 0' }}>Phone number exactly 11 digits ka hona chahiye</p>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Brand / Store Name</label>
            <input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Brand name type karein" required style={inputBoxStyle} />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email type karein" required style={inputBoxStyle} />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password type karein (min 6 characters)"
                required
                style={{ ...inputBoxStyle, paddingRight: '60px' }}
              />
              <span
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ne-muted)', cursor: 'pointer', fontSize: '12px', userSelect: 'none' }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </span>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Confirm Password</label>
            <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Password dobara type karein" required style={inputBoxStyle} />
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <p style={{ color: 'var(--ne-danger)', fontSize: '11px', margin: '4px 0 0' }}>Password match nahi kar raha</p>
            )}
          </div>

          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px', background: loading ? 'var(--ne-border)' : 'var(--ne-success)', color: loading ? 'var(--ne-muted)' : '#0A2E1A', border: 'none', borderRadius: '10px', fontSize: '16px', cursor: 'pointer', fontWeight: '700' }}>
            {loading ? 'Code bhej rahe hain...' : 'Sign Up'}
          </button>
          <p style={{ color: 'var(--ne-muted-2)', fontSize: '11px', marginTop: '10px', textAlign: 'center' }}>
            Email verify karne ke liye ek code bheja jayega, phir admin approval ka wait karna hoga.
          </p>
        </form>
      )}

      {mode === 'signup-otp' && (
        <form onSubmit={handleVerifySignupOtp}>
          <button type="button" onClick={() => switchMode('signup')} style={{ background: 'none', border: 'none', color: 'var(--ne-muted)', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 14 }}>
            ← Wapas
          </button>
          <p style={{ color: 'var(--ne-muted)', fontSize: '13px', margin: '0 0 1rem', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--ne-text)' }}>{email}</strong> pe 6-digit code bheja gaya hai — daal do.
          </p>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={labelStyle}>Verification Code</label>
            <input type="text" value={signupOtp} onChange={(e) => setSignupOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" maxLength={6} required
              style={{ ...inputBoxStyle, letterSpacing: '4px', fontSize: '18px', textAlign: 'center' }} />
          </div>
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px', background: loading ? 'var(--ne-border)' : 'var(--ne-grad)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', cursor: 'pointer', fontWeight: '700', marginBottom: '10px' }}>
            {loading ? 'Verify ho raha hai...' : 'Verify & Create Account'}
          </button>
          <p style={{ textAlign: 'center' }}>
            <span onClick={resendSignupOtp} style={{ color: 'var(--ne-accent)', fontSize: '12px', cursor: 'pointer' }}>Code dobara bhejo</span>
          </p>
        </form>
      )}

      {mode === 'forgot' && (
        <form onSubmit={handleForgotSubmit}>
          <button type="button" onClick={() => switchMode('login')} style={{ background: 'none', border: 'none', color: 'var(--ne-muted)', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 14 }}>
            ← Wapas
          </button>
          <p style={{ color: 'var(--ne-muted)', fontSize: '13px', margin: '0 0 1rem', lineHeight: 1.6 }}>
            Apna account email daalo — verification code bheja jayega.
          </p>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={labelStyle}>Email</label>
            <input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="Email type karein" required style={inputBoxStyle} />
          </div>
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px', background: loading ? 'var(--ne-border)' : 'var(--ne-grad)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', cursor: 'pointer', fontWeight: '700' }}>
            {loading ? 'Code bhej rahe hain...' : 'Code Bhejo'}
          </button>
        </form>
      )}

      {mode === 'forgot-otp' && (
        <form onSubmit={handleVerifyForgotOtp}>
          <button type="button" onClick={() => switchMode('forgot')} style={{ background: 'none', border: 'none', color: 'var(--ne-muted)', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 14 }}>
            ← Wapas
          </button>
          <p style={{ color: 'var(--ne-muted)', fontSize: '13px', margin: '0 0 1rem', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--ne-text)' }}>{forgotEmail}</strong> pe 6-digit code bheja gaya hai — daal do.
          </p>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={labelStyle}>Verification Code</label>
            <input type="text" value={forgotOtp} onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" maxLength={6} required
              style={{ ...inputBoxStyle, letterSpacing: '4px', fontSize: '18px', textAlign: 'center' }} />
          </div>
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px', background: loading ? 'var(--ne-border)' : 'var(--ne-grad)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', cursor: 'pointer', fontWeight: '700', marginBottom: '10px' }}>
            {loading ? 'Verify ho raha hai...' : 'Verify Code'}
          </button>
          <p style={{ textAlign: 'center' }}>
            <span onClick={resendForgotOtp} style={{ color: 'var(--ne-accent)', fontSize: '12px', cursor: 'pointer' }}>Code dobara bhejo</span>
          </p>
        </form>
      )}

      {mode === 'forgot-reset' && (
        <form onSubmit={handleResetPasswordSubmit}>
          <p style={{ color: 'var(--ne-muted)', fontSize: '13px', margin: '0 0 1rem', lineHeight: 1.6 }}>
            Naya password set karo.
          </p>
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Naya Password</label>
            <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" required style={inputBoxStyle} />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={labelStyle}>Confirm Password</label>
            <input type={showPassword ? 'text' : 'password'} value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} placeholder="Password dobara type karein" required style={inputBoxStyle} />
            {confirmNewPassword.length > 0 && newPassword !== confirmNewPassword && (
              <p style={{ color: 'var(--ne-danger)', fontSize: '11px', margin: '4px 0 0' }}>Password match nahi kar raha</p>
            )}
          </div>
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px', background: loading ? 'var(--ne-border)' : 'var(--ne-success)', color: loading ? 'var(--ne-muted)' : '#0A2E1A', border: 'none', borderRadius: '10px', fontSize: '16px', cursor: 'pointer', fontWeight: '700' }}>
            {loading ? 'Save ho raha hai...' : 'Password Set Karo'}
          </button>
        </form>
      )}
    </Shell>
  )
}
