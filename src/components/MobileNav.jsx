import Icon from './Icon'
import BottomSheet from './BottomSheet'

// Phone navigation (rendered only below the mobile breakpoint): a bottom tab bar with up to 4 pages + Menu,
// and the Menu sheet that lists every page the user may open (same entries and grouping as the desktop sidebar).

// Shopify-style floating glass pill: search, the main pages (icons, labels for screen readers) and Menu
export function MobileBottomNav({ tabs, activeId, onSelect, onMenu, menuOpen, menuLabel, onSearch, searchLabel = 'Search', dotIds = [] }) {
  return (
    <nav className={`ne-mnav ne-glass-bar${menuOpen ? ' ne-mnav-away' : ''}`} aria-label={menuLabel}>
      {onSearch && (
        <button className="ne-glass-circle ne-mnav-search" onClick={onSearch} aria-label={searchLabel}>
          <Icon name="search" size={19} />
        </button>
      )}
      <div className="ne-mnav-pill">
      {tabs.map((tab) => (
        <button key={tab.id} aria-label={tab.label} className={`ne-mnav-item${activeId === tab.id && !menuOpen ? ' active' : ''}`} onClick={() => onSelect(tab.id)} aria-current={activeId === tab.id ? 'page' : undefined}>
          <span className="ne-mnav-ic">{tab.icon}{dotIds.includes(tab.id) && <span className="ne-mnav-dot" aria-hidden="true" />}</span>
          <span className="ne-mnav-label">{tab.label}</span>
        </button>
      ))}
      <button className={`ne-mnav-item${menuOpen ? ' active' : ''}`} onClick={onMenu} aria-expanded={menuOpen}>
        <span className="ne-mnav-ic"><Icon name="menu" size={20} /></span>
        <span className="ne-mnav-label">{menuLabel}</span>
      </button>
      </div>
    </nav>
  )
}

/** compact top bar for phones: page title, store name (opens the Menu), bell */
export function MobileTopBar({ title, storeName, onStore, bell, storeLabel, storeRef }) {
  return (
    <header className="ne-mtop">
      <h1 className="ne-mtop-title">{title}</h1>
      <button ref={storeRef} className="ne-mtop-store" onClick={onStore} aria-label={storeLabel}>
        <Icon name="store" size={14} /><span>{storeName}</span>
      </button>
      {bell}
    </header>
  )
}

/**
 * entries: [{ item:{id,label}, children:[{id,label}], groupHeading }] exactly as the sidebar builds them
 * extra: the account area (store switcher, Settings, language, theme, account, logout) rendered at the end
 */
export function MobileMenuSheet({ open, onClose, entries, icons, activeId, onGo, title, closeLabel, dotIds = [], onSettings, settingsLabel = 'Settings', children }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title} closeLabel={closeLabel} full>
      <div className="ne-mmenu">
        {entries.map((entry) => (
          <div key={entry.item.id}>
            {entry.groupHeading && <div className="ne-mmenu-group">{entry.groupHeading}</div>}
            <button className={`ne-mmenu-row${activeId === entry.item.id ? ' active' : ''}`} onClick={() => onGo(entry.item.id)}>
              <span className="ne-mmenu-ic">{icons[entry.item.id]}</span>
              <span className="ne-mmenu-label">{entry.item.label}</span>
              {dotIds.includes(entry.item.id) && <span className="ne-mnav-dot ne-mmenu-dot" aria-hidden="true" />}
              <Icon name="chevronRight" size={14} style={{ opacity: 0.45 }} />
            </button>
            {entry.children.map((c) => (
              <button key={c.id} className={`ne-mmenu-row ne-mmenu-sub${activeId === c.id ? ' active' : ''}`} onClick={() => onGo(c.id)}>
                <span className="ne-mmenu-ic">{icons[c.id]}</span>
                <span className="ne-mmenu-label">{c.label}</span>
                <Icon name="chevronRight" size={14} style={{ opacity: 0.45 }} />
              </button>
            ))}
          </div>
        ))}
        {children}
      </div>
      {/* Shopify: a floating glass row at the bottom of the menu with Settings and Close */}
      <div className="ne-mmenu-dock">
        {onSettings && <button type="button" className="ne-glass-circle" onClick={onSettings} aria-label={settingsLabel}><Icon name="settings" size={18} /></button>}
        <button type="button" className="ne-glass-circle" onClick={onClose} aria-label={closeLabel}><Icon name="close" size={16} /></button>
      </div>
    </BottomSheet>
  )
}
