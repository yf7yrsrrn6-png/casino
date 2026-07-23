import { useState, useRef, useEffect } from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/store/useSession'
import { useWallet } from '@/store/useWallet'
import { useRealtime } from '@/store/useRealtime'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { Logo } from '@/components/layout/Logo'
import { BalanceChip } from '@/components/layout/BalanceChip'
import { NotificationsBell } from '@/components/layout/NotificationsBell'
import { Button } from '@/components/ui/Button'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `relative px-1 py-2 text-sm font-semibold transition-colors ${
    isActive ? 'text-gold-soft' : 'text-lilac hover:text-white'
  }`

export function Header() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useSession((s) => s.user)
  const logoutSession = useSession((s) => s.logout)
  const isAuthenticated = Boolean(user)
  const email = user?.email ?? null
  const isAdmin = user?.role === 'admin'
  const balance = useWallet((s) => s.balance)
  const online = useRealtime((s) => s.online)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [gamesOpen, setGamesOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const gamesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
      if (gamesRef.current && !gamesRef.current.contains(e.target as Node)) {
        setGamesOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const gameLinks = [
    { to: '/slots', label: t('nav.slots'), icon: '🎰' },
    { to: '/blackjack', label: t('nav.blackjack'), icon: '🃏' },
    { to: '/roulette', label: t('nav.roulette'), icon: '🎡' },
    { to: '/baccarat', label: t('nav.baccarat'), icon: '🀄' },
    { to: '/crash', label: t('nav.crash'), icon: '🚀' },
    { to: '/dice', label: t('nav.dice'), icon: '🎲' },
    { to: '/plinko', label: t('nav.plinko'), icon: '🔵' },
    { to: '/keno', label: t('nav.keno'), icon: '🔢' },
  ]

  async function handleLogout() {
    await logoutSession()
    setProfileOpen(false)
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="shrink-0">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-5 lg:flex">
            <NavLink to="/" end className={navLinkClass}>
              {t('nav.home')}
            </NavLink>
            <div className="relative" ref={gamesRef}>
              <button
                onClick={() => setGamesOpen((v) => !v)}
                className="flex items-center gap-1 px-1 py-2 text-sm font-semibold text-lilac hover:text-white cursor-pointer"
              >
                {t('nav.games')}
                <svg width="10" height="6" viewBox="0 0 10 6" className={gamesOpen ? 'rotate-180' : ''}>
                  <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
              </button>
              {gamesOpen && (
                <div className="absolute left-0 top-full mt-2 grid w-64 grid-cols-2 gap-1 rounded-2xl border border-white/12 bg-surface-2 p-2 shadow-glow-violet">
                  {gameLinks.map((g) => (
                    <NavLink
                      key={g.to}
                      to={g.to}
                      onClick={() => setGamesOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
                          isActive ? 'bg-gold/15 text-gold-soft' : 'text-lilac hover:bg-white/5 hover:text-white'
                        }`
                      }
                    >
                      <span>{g.icon}</span>
                      {g.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
            <NavLink to="/leaderboard" className={navLinkClass}>
              {t('nav.leaderboard')}
            </NavLink>
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          {online > 0 && (
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald/30 bg-emerald/10 px-2.5 py-1.5 text-xs font-bold text-emerald xl:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-blink" />
              {online.toLocaleString('en-US')} {t('header.online')}
            </span>
          )}
          <LanguageSwitcher />
          {isAuthenticated ? (
            <>
              <Link
                to="/vip"
                className="hidden items-center gap-1 rounded-lg border border-violet/40 bg-violet/12 px-2.5 py-1.5 text-xs font-bold text-violet hover:border-violet/70 sm:flex"
                title={t('nav.vip')}
              >
                ⭐ {t('header.level')} {user?.vipLevel ?? 0}
              </Link>
              <BalanceChip balance={balance} />
              <Link to="/bonuses" className="hidden sm:block">
                <Button variant="secondary" size="sm">
                  🎁
                </Button>
              </Link>
              <NotificationsBell />
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => setProfileOpen((v) => !v)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-2 text-lg hover:border-gold/50 cursor-pointer"
                  title={email ?? ''}
                >
                  👤
                </button>
                {profileOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface-2 py-1.5 shadow-glow-violet">
                    <div className="truncate border-b border-border px-3.5 py-2.5 text-xs text-white/50">
                      {email}
                    </div>
                    <Link
                      to="/profile"
                      onClick={() => setProfileOpen(false)}
                      className="block px-3.5 py-2.5 text-sm text-white/80 hover:bg-white/5"
                    >
                      {t('nav.profile')}
                    </Link>
                    <Link
                      to="/wallet"
                      onClick={() => setProfileOpen(false)}
                      className="block px-3.5 py-2.5 text-sm text-white/80 hover:bg-white/5"
                    >
                      {t('nav.wallet')}
                    </Link>
                    <Link
                      to="/vip"
                      onClick={() => setProfileOpen(false)}
                      className="block px-3.5 py-2.5 text-sm text-white/80 hover:bg-white/5"
                    >
                      {t('nav.vip')}
                    </Link>
                    <Link
                      to="/bonuses"
                      onClick={() => setProfileOpen(false)}
                      className="block px-3.5 py-2.5 text-sm text-white/80 hover:bg-white/5"
                    >
                      {t('nav.bonuses')}
                    </Link>
                    <Link
                      to="/fair"
                      onClick={() => setProfileOpen(false)}
                      className="block px-3.5 py-2.5 text-sm text-white/80 hover:bg-white/5"
                    >
                      {t('nav.fairness')}
                    </Link>
                    <Link
                      to="/settings"
                      onClick={() => setProfileOpen(false)}
                      className="block px-3.5 py-2.5 text-sm text-white/80 hover:bg-white/5"
                    >
                      {t('nav.settings')}
                    </Link>
                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setProfileOpen(false)}
                        className="block px-3.5 py-2.5 text-sm text-gold-soft hover:bg-white/5"
                      >
                        {t('nav.admin')}
                      </Link>
                    )}
                    <button
                      onClick={handleLogout}
                      className="block w-full px-3.5 py-2.5 text-left text-sm text-ruby hover:bg-white/5 cursor-pointer"
                    >
                      {t('nav.logout')}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  {t('nav.login')}
                </Button>
              </Link>
              <Link to="/register">
                <Button variant="primary" size="sm">
                  {t('nav.register')}
                </Button>
              </Link>
            </div>
          )}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-white/80 lg:hidden cursor-pointer"
            aria-label="Menu"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <path d="M0 1h18M0 7h18M0 13h18" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-surface px-4 py-3 lg:hidden">
          <nav className="flex flex-col gap-1">
            <NavLink
              to="/"
              end
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2.5 text-sm font-semibold ${isActive ? 'bg-gold/10 text-gold-soft' : 'text-white/70'}`
              }
            >
              {t('nav.home')}
            </NavLink>
            <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-white/30">
              {t('nav.games')}
            </div>
            {gameLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${
                    isActive ? 'bg-gold/10 text-gold-soft' : 'text-white/70'
                  }`
                }
              >
                <span>{link.icon}</span>
                {link.label}
              </NavLink>
            ))}
            <NavLink
              to="/leaderboard"
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2.5 text-sm font-semibold ${isActive ? 'bg-gold/10 text-gold-soft' : 'text-white/70'}`
              }
            >
              {t('nav.leaderboard')}
            </NavLink>
            {isAuthenticated ? (
              <>
                <NavLink
                  to="/wallet"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-white/70"
                >
                  {t('nav.wallet')}
                </NavLink>
                <NavLink
                  to="/profile"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-white/70"
                >
                  {t('nav.profile')}
                </NavLink>
                <NavLink
                  to="/settings"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-white/70"
                >
                  {t('nav.settings')}
                </NavLink>
                <button
                  onClick={() => {
                    handleLogout()
                    setMobileOpen(false)
                  }}
                  className="rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-ruby cursor-pointer"
                >
                  {t('nav.logout')}
                </button>
              </>
            ) : (
              <div className="mt-2 flex gap-2">
                <Link to="/login" className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Button variant="secondary" size="sm" className="w-full">
                    {t('nav.login')}
                  </Button>
                </Link>
                <Link to="/register" className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Button variant="primary" size="sm" className="w-full">
                    {t('nav.register')}
                  </Button>
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
