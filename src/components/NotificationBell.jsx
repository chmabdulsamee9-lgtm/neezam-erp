import { useState, useEffect, useRef } from 'react'
import Icon from './Icon'

// Admin UI overhaul, Part D2. Diagnose confirmed no merchant-facing notification/alert
// backend exists anywhere — this is new storage+display+read-tracking plumbing only.
// Nothing in the app currently creates a row in merchant_notifications; wiring real
// events (new order, low stock, etc.) to actually insert notifications is future work,
// not part of this task.
function timeAgo(iso, t) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return t('notif.justNow')
  if (mins < 60) return `${mins}${t('notif.minsAgoSuffix')}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}${t('notif.hoursAgoSuffix')}`
  const days = Math.floor(hours / 24)
  return `${days}${t('notif.daysAgoSuffix')}`
}

export default function NotificationBell({ cfUrl, session, storeId, t }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef(null)

  const load = async () => {
    if (!storeId) return
    setLoading(true)
    try {
      const res = await fetch(`${cfUrl}/list-notifications?store_id=${encodeURIComponent(storeId)}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      setNotifications(data.notifications || [])
      setUnreadCount(data.unread_count || 0)
    } catch (err) {
      setNotifications([]); setUnreadCount(0)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    const iv = setInterval(load, 120000)
    return () => clearInterval(iv)
  }, [storeId])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
    setUnreadCount(0)
    try {
      await fetch(`${cfUrl}/mark-notifications-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ store_id: storeId }),
      })
    } catch (err) {}
  }

  return (
    <div className="ne-bell-wrap" ref={boxRef}>
      <button className="ne-bell-btn" onClick={() => setOpen((v) => !v)} title={t('notif.bellTitle')}>
        <Icon name="bell" size={16} />
        {unreadCount > 0 && <span className="ne-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="ne-notif-dropdown">
          <div className="ne-notif-header">
            <span>{t('notif.title')}</span>
            {unreadCount > 0 && (
              <button className="ne-notif-markread" onClick={markAllRead}>{t('notif.markAllRead')}</button>
            )}
          </div>
          <div className="ne-notif-list">
            {loading && <div className="ne-notif-empty">{t('notif.loading')}</div>}
            {!loading && notifications.length === 0 && <div className="ne-notif-empty">{t('notif.empty')}</div>}
            {notifications.map((n) => (
              <div key={n.id} className={`ne-notif-item${n.read_at ? '' : ' unread'}`}>
                <div className="ne-notif-item-title">{n.title}</div>
                {n.body && <div className="ne-notif-item-body">{n.body}</div>}
                <div className="ne-notif-item-time">{timeAgo(n.created_at, t)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
