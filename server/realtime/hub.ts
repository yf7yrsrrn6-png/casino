import type { Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { config } from '../config.ts'
import { verifySession } from '../lib/token.ts'

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim())
  }
  return null
}

interface Client {
  ws: WebSocket
  userId: string | null
}

const clients = new Set<Client>()
let wss: WebSocketServer | null = null

export interface RealtimeEvent {
  type: string
  [key: string]: unknown
}

function send(client: Client, event: RealtimeEvent) {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(event))
  }
}

export function broadcast(event: RealtimeEvent) {
  for (const c of clients) send(c, event)
}

export function pushToUser(userId: string, event: RealtimeEvent) {
  for (const c of clients) if (c.userId === userId) send(c, event)
}

/** Distinct signed-in users + anonymous sockets, a lively "players online" figure. */
export function onlineCount(): number {
  const users = new Set<string>()
  let anon = 0
  for (const c of clients) {
    if (c.userId) users.add(c.userId)
    else anon += 1
  }
  return users.size + anon
}

function broadcastOnline() {
  broadcast({ type: 'online', count: onlineCount() })
}

export function initRealtime(server: Server, onSnapshot: (client: { userId: string | null }) => RealtimeEvent[]) {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws, req) => {
    const token = readCookie(req.headers.cookie, config.cookieName)
    const session = token ? verifySession(token) : null
    const client: Client = { ws, userId: session?.sub ?? null }
    clients.add(client)

    // Send an initial snapshot (jackpot, online count, unread notifications…).
    for (const event of onSnapshot({ userId: client.userId })) send(client, event)
    broadcastOnline()

    ws.on('close', () => {
      clients.delete(client)
      broadcastOnline()
    })
    ws.on('error', () => {
      clients.delete(client)
    })
  })

  // Heartbeat: drop dead sockets so the online count stays honest.
  const interval = setInterval(() => {
    for (const c of clients) {
      if (c.ws.readyState !== WebSocket.OPEN) clients.delete(c)
    }
  }, 30000)
  interval.unref?.()
}
