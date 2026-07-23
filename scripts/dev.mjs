// Runs the backend (tsx watch) and the Vite dev server together, streaming both
// logs with prefixes. Ctrl-C stops both. No extra dependency required.
import { spawn } from 'node:child_process'

const procs = [
  { name: 'server', cmd: 'npm', args: ['run', 'dev:server'], color: '\x1b[35m' },
  { name: 'web', cmd: 'npm', args: ['run', 'dev:web'], color: '\x1b[36m' },
]

const children = procs.map(({ name, cmd, args, color }) => {
  const child = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'], env: process.env })
  const prefix = `${color}[${name}]\x1b[0m `
  const pipe = (stream) => {
    stream.setEncoding('utf8')
    let buf = ''
    stream.on('data', (chunk) => {
      buf += chunk
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) process.stdout.write(prefix + line + '\n')
    })
  }
  pipe(child.stdout)
  pipe(child.stderr)
  child.on('exit', (code) => {
    process.stdout.write(prefix + `exited with code ${code}\n`)
    shutdown()
  })
  return child
})

let shuttingDown = false
function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  for (const c of children) c.kill('SIGTERM')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
