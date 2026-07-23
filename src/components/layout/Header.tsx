import { useState, useRef, useEffect } from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/store/useSession'
import { useWallet } from '@/store/useWallet'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { Logo } from '@/components/layout/Logo'
import { BalanceChip } from '@/components/layout/BalanceChip'
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const links = [
    { to: '/', label: t('nav.home') },
    { to: '/slots', label: t('nav.slots') },
    { to: '/blackjack', label: t('nav.blackjack') },
    { to: '/roulette', label: t('nav.roulette') },
  ]

  async function handleLogout() {
    await logoutSession()
    setProfileOpen(false)
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link to="/" className="shrink-0">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === '/'} className={navLinkClass}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <LanguageSwitcher />
          {isAuthenticated ? (
            <>
              <BalanceChip balance={balance} />
              <Link to="/wallet" className="hidden sm:block">
                <Button variant="secondary" size="sm">
                  {t('nav.deposit')}
                </Button>
              </Link>
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
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-white/80 md:hidden cursor-pointer"
            aria-label="Menu"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <path d="M0 1h18M0 7h18M0 13h18" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-surface px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2.5 text-sm font-semibold ${
                    isActive ? 'bg-gold/10 text-gold-soft' : 'text-white/70'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
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
