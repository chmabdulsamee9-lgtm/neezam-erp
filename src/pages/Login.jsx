import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [mode, setMode] = useState('login') // "login" | "signup"
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [brandName, setBrandName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [signupDone, setSignupDone] = useState(false)

  useEffect(() => {
    const savedEmail = localStorage.getItem('neezam_email')
    const savedRemember = localStorage.getItem('neezam_remember')
    if (savedRemember === 'true' && savedEmail) {
      setEmail(savedEmail)
      setRememberMe(true)
    }
  }, [])

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
    if (password.length < 6) {
      setError('Password kam az kam 6 characters ka ho')
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

  const inputBoxStyle = {
    width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #334155',
    background: '#0f172a', color: '#fff', boxSizing: 'border-box', fontSize: '14px', outline: 'none',
  }

  if (signupDone) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ background: '#1e293b', borderRadius: '12px', padding: '2rem', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          <h2 style={{ color: '#fff', margin: '0 0 8px', fontSize: 18 }}>Account ban gaya!</h2>
          <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
            Aapka account abhi <strong style={{ color: '#eab308' }}>approval ke liye pending</strong> hai.
            Jaise hi admin approve karega, aap login karke Neezam use kar sakenge.
          </p>
          <button
            onClick={() => { setSignupDone(false); setMode('login'); setEmail(''); setPassword(''); setBrandName('') }}
            style={{ marginTop: 16, padding: '9px 20px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
            ← Login page pe jao
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#1e293b', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '400px' }}>

        <h1 style={{ color: '#fff', textAlign: 'center', marginBottom: '4px', fontSize: '2.5rem' }}>نظام</h1>
        <p style={{ color: '#94a3b8', textAlign: 'center', marginBottom: '1.5rem', fontSize: '14px' }}>Neezam ERP</p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: '#0f172a', borderRadius: 10, padding: 4 }}>
          <button
            onClick={() => { setMode('login'); setError('') }}
            style={{
              flex: 1, padding: '8px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: mode === 'login' ? '#3b82f6' : 'transparent',
              color: mode === 'login' ? '#fff' : '#94a3b8',
            }}>
            Login
          </button>
          <button
            onClick={() => { setMode('signup'); setError('') }}
            style={{
              flex: 1, padding: '8px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: mode === 'signup' ? '#3b82f6' : 'transparent',
              color: mode === 'signup' ? '#fff' : '#94a3b8',
            }}>
            Sign Up
          </button>
        </div>

        {error && (
          <div style={{ background: '#dc2626', color: '#fff', padding: '10px', borderRadius: '8px', marginBottom: '1rem', fontSize: '14px' }}>
            {error}
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: '#94a3b8', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
                style={inputBoxStyle}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: '#94a3b8', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{ ...inputBoxStyle, paddingRight: '60px' }}
                />
                <span
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', cursor: 'pointer', fontSize: '12px', userSelect: 'none' }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#3b82f6' }}
              />
              <label htmlFor="remember" style={{ color: '#94a3b8', fontSize: '13px', cursor: 'pointer' }}>
                Remember me
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '12px', background: loading ? '#1d4ed8' : '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer', fontWeight: '500' }}
            >
              {loading ? 'Login ho raha hai...' : 'Login'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: '#94a3b8', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Brand / Store Name</label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="DewareKhas"
                required
                style={inputBoxStyle}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: '#94a3b8', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
                style={inputBoxStyle}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: '#94a3b8', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="kam az kam 6 characters"
                  required
                  style={{ ...inputBoxStyle, paddingRight: '60px' }}
                />
                <span
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', cursor: 'pointer', fontSize: '12px', userSelect: 'none' }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '12px', background: loading ? '#15803d' : '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer', fontWeight: '500' }}
            >
              {loading ? 'Account ban raha hai...' : 'Sign Up'}
            </button>
            <p style={{ color: '#64748b', fontSize: '11px', marginTop: '10px', textAlign: 'center' }}>
              Account banane ke baad admin approval ka wait karna hoga.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}