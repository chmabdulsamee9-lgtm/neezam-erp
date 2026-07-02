import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const isValidPhone = (p) => /^\d{11}$/.test(p.trim())

export default function Login() {
  const [mode, setMode] = useState('login') // "login" | "signup" | "forgot"
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
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSubmitted, setForgotSubmitted] = useState(false)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 480)

  useEffect(() => {
    const savedEmail = localStorage.getItem('neezam_email')
    const savedRemember = localStorage.getItem('neezam_remember')
    if (savedRemember === 'true' && savedEmail) {
      setEmail(savedEmail)
      setRememberMe(true)
    }
  }, [])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 480)
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

  const handleSignup = async (e) => {
    e.preventDefault()
    setError('')
    if (!brandName.trim()) {
      setError('Brand name daalo')
      return
    }
    if (!fullName.trim()) {
      setError('Apna naam daalo')
      return
    }
    if (!isValidPhone(phone)) {
      setError('Phone number exactly 11 digits ka hona chahiye (sirf numbers)')
      return
    }
    if (password.length < 6) {
      setError('Password kam az kam 6 characters ka ho')
      return
    }
    if (password !== confirmPassword) {
      setError('Password aur Confirm Password match nahi karte')
      return
    }
    setLoading(true)
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })
      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
        return
      }
      const userId = signUpData.user?.id
      if (!userId) {
        setError('Signup mein masla hua, dobara try karo')
        setLoading(false)
        return
      }

      // Naya brand (store record) banao — Shopify se baad mein bhi connect ho sakta hai
      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .insert({ store_name: brandName.trim(), shopify_url: null, api_token: null })
        .select()
        .single()

      if (storeError) {
        setError('Brand create karne mein error: ' + storeError.message)
        setLoading(false)
        return
      }

      await supabase.from('profiles').insert({
        id: userId,
        email,
        full_name: fullName.trim(),
        phone: phone.trim(),
        role: 'admin',
        approved: false,
      })

      await supabase.from('user_stores').insert({
        user_id: userId,
        store_id: storeData.id,
      })

      setSignupDone(true)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setError('')
    if (!forgotEmail.trim()) {
      setError('Email daalo')
      return
    }
    setLoading(true)
    try {
      const { error: reqError } = await supabase.from('password_reset_requests').insert({ email: forgotEmail.trim() })
      if (reqError) {
        setError(reqError.message)
        setLoading(false)
        return
      }
      setForgotSubmitted(true)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const inputBoxStyle = {
    width: '100%', padding: '10px', borderRadius: '9px', border: '1px solid var(--ne-border)',
    background: 'var(--ne-bg)', color: 'var(--ne-text)', boxSizing: 'border-box', fontSize: '14px', outline: 'none',
  }

  if (signupDone) {
    return (
      <div className="ne-app-shell" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ background: 'var(--ne-surface-2)', border: '1px solid var(--ne-border)', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          <h2 style={{ color: 'var(--ne-text)', margin: '0 0 8px', fontSize: 18 }}>Account ban gaya!</h2>
          <p style={{ color: 'var(--ne-muted)', fontSize: 13, lineHeight: 1.6 }}>
            Aapka account abhi <strong style={{ color: 'var(--ne-warning)' }}>approval ke liye pending</strong> hai.
            Jaise hi admin approve karega, aap login karke Neezam use kar sakenge.
          </p>
          <button
            onClick={() => { setSignupDone(false); switchMode('login'); setEmail(''); setPassword(''); setConfirmPassword(''); setBrandName(''); setFullName(''); setPhone('') }}
            style={{ marginTop: 16, padding: '9px 20px', borderRadius: 9, border: '1px solid var(--ne-border)', background: 'transparent', color: 'var(--ne-muted)', fontSize: 13, cursor: 'pointer' }}>
            ← Login page pe jao
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'forgot' && forgotSubmitted) {
    return (
      <div className="ne-app-shell" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ background: 'var(--ne-surface-2)', border: '1px solid var(--ne-border)', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📩</div>
          <h2 style={{ color: 'var(--ne-text)', margin: '0 0 8px', fontSize: 18 }}>Request submit ho gayi!</h2>
          <p style={{ color: 'var(--ne-muted)', fontSize: 13, lineHeight: 1.6 }}>
            Aapka password reset request bhej diya gaya hai. Admin se contact hoga.
          </p>
          <button
            onClick={() => { setForgotSubmitted(false); setForgotEmail(''); switchMode('login') }}
            style={{ marginTop: 16, padding: '9px 20px', borderRadius: 9, border: '1px solid var(--ne-border)', background: 'transparent', color: 'var(--ne-muted)', fontSize: 13, cursor: 'pointer' }}>
            ← Login page pe jao
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="ne-app-shell" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: 'var(--ne-surface-2)', border: '1px solid var(--ne-border)', padding: isMobile ? '1.25rem' : '2rem', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 12px 40px rgba(0,0,0,.35)' }}>

        <h1 style={{ color: '#fff', textAlign: 'center', marginBottom: '4px', fontSize: isMobile ? '2rem' : '2.5rem', fontWeight: 700 }}>نظام</h1>
        <p style={{ color: 'var(--ne-muted)', textAlign: 'center', marginBottom: '1.5rem', fontSize: '14px' }}>Neezam ERP</p>

        {mode !== 'forgot' && (
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
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'var(--ne-muted)', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email type karein"
                required
                style={inputBoxStyle}
              />
            </div>

            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ color: 'var(--ne-muted)', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Password</label>
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
              <span
                onClick={() => switchMode('forgot')}
                style={{ color: 'var(--ne-accent)', fontSize: '12px', cursor: 'pointer' }}>
                Forgot Password?
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#5C7CFA' }}
              />
              <label htmlFor="remember" style={{ color: 'var(--ne-muted)', fontSize: '13px', cursor: 'pointer' }}>
                Remember me
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '12px', background: loading ? 'var(--ne-border)' : 'var(--ne-grad)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', cursor: 'pointer', fontWeight: '700' }}
            >
              {loading ? 'Login ho raha hai...' : 'Login'}
            </button>
          </form>
        )}

        {mode === 'signup' && (
          <form onSubmit={handleSignup}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'var(--ne-muted)', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Apna Naam</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Apna naam type karein"
                required
                style={inputBoxStyle}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'var(--ne-muted)', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="03xxxxxxxxx (11 digits)"
                maxLength={11}
                required
                style={inputBoxStyle}
              />
              {phone.length > 0 && !isValidPhone(phone) && (
                <p style={{ color: 'var(--ne-danger)', fontSize: '11px', margin: '4px 0 0' }}>Phone number exactly 11 digits ka hona chahiye</p>
              )}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'var(--ne-muted)', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Brand / Store Name</label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="Brand name type karein"
                required
                style={inputBoxStyle}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'var(--ne-muted)', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email type karein"
                required
                style={inputBoxStyle}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'var(--ne-muted)', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Password</label>
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
              <label style={{ color: 'var(--ne-muted)', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Password dobara type karein"
                required
                style={inputBoxStyle}
              />
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <p style={{ color: 'var(--ne-danger)', fontSize: '11px', margin: '4px 0 0' }}>Password match nahi kar raha</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '12px', background: loading ? 'var(--ne-border)' : 'var(--ne-success)', color: loading ? 'var(--ne-muted)' : '#0A2E1A', border: 'none', borderRadius: '10px', fontSize: '16px', cursor: 'pointer', fontWeight: '700' }}
            >
              {loading ? 'Account ban raha hai...' : 'Sign Up'}
            </button>
            <p style={{ color: 'var(--ne-muted-2)', fontSize: '11px', marginTop: '10px', textAlign: 'center' }}>
              Account banane ke baad admin approval ka wait karna hoga.
            </p>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword}>
            <p style={{ color: 'var(--ne-muted)', fontSize: '13px', margin: '0 0 1rem', lineHeight: 1.6 }}>
              Apna account email daalo — admin ko request chali jayegi aur wo aapka password reset kar dega.
            </p>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ color: 'var(--ne-muted)', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Email</label>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="Email type karein"
                required
                style={inputBoxStyle}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '12px', background: loading ? 'var(--ne-border)' : 'var(--ne-grad)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', cursor: 'pointer', fontWeight: '700', marginBottom: '10px' }}
            >
              {loading ? 'Bhej rahe hain...' : 'Reset Request Bhejo'}
            </button>
            <p style={{ textAlign: 'center' }}>
              <span onClick={() => switchMode('login')} style={{ color: 'var(--ne-muted)', fontSize: '12px', cursor: 'pointer' }}>← Login page pe wapas jao</span>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
