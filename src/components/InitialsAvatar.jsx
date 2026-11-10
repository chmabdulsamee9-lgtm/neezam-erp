// Shared name -> initials + deterministic color utility (Admin UI overhaul, Part C2).
// No store-specific hardcoding — colors are picked from the existing --ne-*-soft theme
// tokens only, keyed by a stable hash of the name/email so the same person always gets
// the same color without a database field. Used by the sidebar bottom block (brand-popup
// profile row) and the new Settings shell's store-identity/user-row blocks.
const PALETTE = [
  { bg: 'var(--ne-accent-soft)', fg: 'var(--ne-accent)' },
  { bg: 'var(--ne-success-soft)', fg: 'var(--ne-success)' },
  { bg: 'var(--ne-warning-soft)', fg: 'var(--ne-warning)' },
  { bg: 'var(--ne-pink-soft)', fg: 'var(--ne-pink)' },
  { bg: 'var(--ne-orange-soft)', fg: 'var(--ne-orange)' },
  { bg: 'var(--ne-accent2-soft)', fg: 'var(--ne-accent2)' },
]

export function getInitials(name) {
  const clean = String(name || '').trim()
  if (!clean) return '?'
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function hashSeed(seed) {
  const s = String(seed || '')
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  return hash
}

export function getAvatarColors(seed) {
  return PALETTE[hashSeed(seed) % PALETTE.length]
}

export default function InitialsAvatar({ name, seed, size = 28, fontSize }) {
  const colors = getAvatarColors(seed || name)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: colors.bg, color: colors.fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: fontSize || Math.round(size * 0.42), fontWeight: 800,
    }}>
      {getInitials(name)}
    </div>
  )
}
