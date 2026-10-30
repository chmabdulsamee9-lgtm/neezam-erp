import { useEffect, useRef } from 'react'
import Icon from './Icon'
import InitialsAvatar from './InitialsAvatar'

// Admin UI overhaul, Part D3 — clicking the sidebar's store/brand name opens this popup
// instead of the old always-inline store chip + <select>. The multi-store vs single-store
// conditional below is the exact same logic that used to live directly in App.jsx's sidebar
// JSX (userStoresList.length > 1 shows the switcher, otherwise just the identity chip) —
// only its container changed.
export default function BrandSwitcherPopup({
  currentStoreInfo, userStoresList, selectedStoreId, onSwitchStore,
  profile, userEmail, onOpenMasterDashboard, onSignOut, onClose, t,
}) {
  const boxRef = useRef(null)
  useEffect(() => {
    const onDocClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [onClose])

  return (
    <div className="ne-popover ne-brand-popover" ref={boxRef}>
      {userStoresList.length > 1 ? (
        <>
          <div className="ne-popover-label">{t('brandPopup.switchStore')}</div>
          <select value={selectedStoreId || ''} onChange={(e) => onSwitchStore(e.target.value)} className="ne-popover-select">
            {userStoresList.map((us) => (
              <option key={us.store_id} value={us.store_id}>{us.stores?.store_name}</option>
            ))}
          </select>
        </>
      ) : currentStoreInfo && (
        <div className="ne-popover-storechip">
          <Icon name="store" size={13} /> {currentStoreInfo.store_name}
          {currentStoreInfo.eneezam_id && <span className="ne-popover-storechip-id"> · {currentStoreInfo.eneezam_id}</span>}
        </div>
      )}

      {profile.role === 'creator' && (
        <button className="ne-popover-link" onClick={onOpenMasterDashboard}>
          <Icon name="building" size={13} /> {t('brandPopup.masterDashboard')}
        </button>
      )}

      <div className="ne-popover-divider" />

      <div className="ne-popover-profile">
        <InitialsAvatar name={profile?.full_name || userEmail} size={32} />
        <div className="ne-popover-profile-text">
          <div className="ne-popover-profile-name">{profile?.full_name || userEmail}</div>
          <div className="ne-popover-profile-email">{userEmail}</div>
        </div>
      </div>

      <button className="ne-popover-link ne-popover-logout" onClick={onSignOut}>
        <Icon name="logout" size={13} /> {t('action.logout')}
      </button>
    </div>
  )
}
