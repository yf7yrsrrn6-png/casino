import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from './Logo'
import { Button } from '@/components/ui/Button'
import {
  IconDashboard,
  IconJournal,
  IconPlans,
  IconCalculator,
  IconSettings,
  IconPlus,
  IconExternal,
  IconSun,
  IconMoon,
  IconLogout,
  IconClose,
  IconTrend,
  IconTarget,
} from '@/components/ui/icons'
import { useSession } from '@/store/useSession'
import { useSettings } from '@/store/useSettings'
import { useTrades } from '@/store/useTrades'

interface NavEntry {
  to: string
  label: string
  icon: typeof IconDashboard
  end?: boolean
}

const SECTIONS: { title: string; items: NavEntry[] }[] = [
  {
    title: 'Робочий простір',
    items: [
      { to: '/', label: 'Огляд', icon: IconDashboard, end: true },
      { to: '/journal', label: 'Журнал позицій', icon: IconJournal },
      { to: '/analytics', label: 'Аналітика', icon: IconTrend },
      { to: '/watchlist', label: 'Watchlist', icon: IconTarget },
    ],
  },
  {
    title: 'Матеріали',
    items: [
      { to: '/plans', label: 'Плани та аналіз', icon: IconPlans },
      { to: '/calculators', label: 'Калькулятори', icon: IconCalculator },
      { to: '/settings', label: 'Налаштування', icon: IconSettings },
    ],
  },
]

const PAGE_TITLES: Record<string, string> = {
  '/': 'Огляд',
  '/journal': 'Журнал позицій',
  '/analytics': 'Аналітика',
  '/watchlist': 'Watchlist',
  '/plans': 'Плани та аналіз',
  '/calculators': 'Калькулятори',
  '/settings': 'Налаштування',
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="space-y-6">
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-subtle">
            {section.title}
          </div>
          <nav className="flex flex-col gap-0.5">
            {section.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors ${
                    isActive
                      ? 'bg-accent-soft text-text'
                      : 'text-muted hover:bg-surface-2 hover:text-text'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" />
                    )}
                    <Icon
                      width={18}
                      height={18}
                      className={isActive ? 'text-accent' : 'text-subtle group-hover:text-text'}
                    />
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      ))}
    </div>
  )
}

function QuickLinks() {
  const links = useSettings((s) => s.settings.quickLinks)
  if (!links.length) return null
  return (
    <div className="hidden items-center gap-1.5 lg:flex">
      {links.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noreferrer"
          className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-semibold text-text transition-colors hover:border-accent-line hover:text-accent"
        >
          {l.label}
          <IconExternal width={13} height={13} className="opacity-60" />
        </a>
      ))}
    </div>
  )
}

function ThemeToggle() {
  const theme = useSettings((s) => s.settings.theme)
  const save = useSettings((s) => s.save)
  const applyTheme = useSettings((s) => s.applyTheme)
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      onClick={() => {
        applyTheme(next)
        void save({ theme: next })
      }}
      className="focus-ring grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-text"
      aria-label="Змінити тему"
      title={next === 'dark' ? 'Темна тема' : 'Світла тема'}
    >
      {theme === 'dark' ? <IconSun width={18} height={18} /> : <IconMoon width={18} height={18} />}
    </button>
  )
}

function SidebarFooter() {
  const user = useSession((s) => s.user)
  const logout = useSession((s) => s.logout)
  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-white text-[13px] font-bold text-[#0a0b0d]">
          {user?.displayName?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-text">{user?.displayName}</div>
          <div className="truncate text-[11px] text-subtle">{user?.email}</div>
        </div>
        <button
          onClick={() => void logout()}
          className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-loss"
          title="Вийти"
          aria-label="Вийти"
        >
          <IconLogout width={17} height={17} />
        </button>
      </div>
    </div>
  )
}

const NAV_KEYS: Record<string, string> = {
  d: '/',
  j: '/journal',
  a: '/analytics',
  w: '/watchlist',
  p: '/plans',
  c: '/calculators',
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const openEditor = useTrades((s) => s.openEditor)
  const editorOpen = useTrades((s) => s.editorOpen)
  const title = PAGE_TITLES[location.pathname] ?? ''

  // Global keyboard shortcuts: N = new position, G+<key> = navigate.
  useEffect(() => {
    let awaitingGoto = false
    let gotoTimer: ReturnType<typeof setTimeout> | undefined
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      const key = e.key.toLowerCase()
      if (awaitingGoto) {
        awaitingGoto = false
        clearTimeout(gotoTimer)
        if (NAV_KEYS[key]) {
          e.preventDefault()
          navigate(NAV_KEYS[key])
        }
        return
      }
      if (key === 'g') {
        awaitingGoto = true
        gotoTimer = setTimeout(() => (awaitingGoto = false), 900)
        return
      }
      if (key === 'n' && !editorOpen) {
        e.preventDefault()
        openEditor()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, openEditor, editorOpen])

  return (
    <div className="min-h-svh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] flex-col border-r border-border bg-bg-elev md:flex">
        <div className="px-4 py-5">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <NavItems />
        </div>
        <SidebarFooter />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="animate-overlay absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="animate-sheet absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-bg-elev">
            <div className="flex items-center justify-between px-4 py-5">
              <Logo />
              <button
                onClick={() => setMobileOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
              >
                <IconClose width={18} height={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              <NavItems onNavigate={() => setMobileOpen(false)} />
            </div>
            <SidebarFooter />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="md:pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              onClick={() => setMobileOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted md:hidden"
              aria-label="Меню"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-bold tracking-tight text-text">{title}</h1>
            <div className="ml-auto flex items-center gap-2">
              <QuickLinks />
              <ThemeToggle />
              <Button variant="primary" size="md" onClick={() => openEditor()}>
                <IconPlus width={17} height={17} />
                <span className="hidden sm:inline">Нова позиція</span>
              </Button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  )
}
