import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  return (
    <div style={{minHeight:'100vh',background:'#0f172a',display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
      <div style={{background:'#1e293b',padding:'2rem',borderRadius:'12px',width:'100%',maxWidth:'400px'}}>
        
        <h1 style={{color:'#fff',textAlign:'center',marginBottom:'4px',fontSize:'2.5rem'}}>نظام</h1>
        <p style={{color:'#94a3b8',textAlign:'center',marginBottom:'2rem',fontSize:'14px'}}>Neezam ERP — Login</p>

        {error && (
          <div style={{background:'#dc2626',color:'#fff',padding:'10px',borderRadius:'8px',marginBottom:'1rem',fontSize:'14px'}}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{marginBottom:'1rem'}}>
            <label style={{color:'#94a3b8',fontSize:'13px',display:'block',marginBottom:'4px'}}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              style={{width:'100%',padding:'10px',borderRadius:'8px',border:'1px solid #334155',background:'#0f172a',color:'#fff',boxSizing:'border-box',fontSize:'14px',outline:'none'}}
            />
          </div>

          <div style={{marginBottom:'1rem'}}>
            <label style={{color:'#94a3b8',fontSize:'13px',display:'block',marginBottom:'4px'}}>Password</label>
            <div style={{position:'relative'}}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{width:'100%',padding:'10px',paddingRight:'60px',borderRadius:'8px',border:'1px solid #334155',background:'#0f172a',color:'#fff',boxSizing:'border-box',fontSize:'14px',outline:'none'}}
              />
              <span
                onClick={() => setShowPassword(!showPassword)}
                style={{position:'absolute',right:'12px',top:'50%',transform:'translateY(-50%)',color:'#94a3b8',cursor:'pointer',fontSize:'12px',userSelect:'none'}}
              >
                {showPassword ? 'Hide' : 'Show'}
              </span>
            </div>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'1.5rem'}}>
            <input
              type="checkbox"
              id="remember"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{width:'16px',height:'16px',cursor:'pointer',accentColor:'#3b82f6'}}
            />
            <label htmlFor="remember" style={{color:'#94a3b8',fontSize:'13px',cursor:'pointer'}}>
              Remember me
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{width:'100%',padding:'12px',background:loading?'#1d4ed8':'#3b82f6',color:'#fff',border:'none',borderRadius:'8px',fontSize:'16px',cursor:'pointer',fontWeight:'500'}}
          >
            {loading ? 'Login ho raha hai...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}