#!/usr/bin/env node
// dsh-docker session-auth service.
//
// Serves the login page and validates session cookies for the host Nginx
// `auth_request` subrequest. Zero npm dependencies (node:http + node:crypto).
//
// Sessions are stored in memory and expire after AUTH_TTL_HOURS (default 24).
// Restarting this container (`docker compose restart auth`) invalidates every
// session immediately.
//
// Configuration (via docker-compose env_file .env):
//   AUTH_PASSWORD          plaintext login password (>= 8 chars)
//   AUTH_PASSWORD_SHA256   64-char hex sha256 digest, alternative to the above
//   AUTH_TTL_HOURS         session lifetime in hours (default 24)
//   AUTH_PORT              listen port (default 8081)
//
// Endpoints (only reachable through the host Nginx reverse proxy; the
// published Docker port must stay bound to loopback):
//   GET  /login/            login form
//   POST /login/            submit password; on success sets the session
//                           cookie and redirects to `next` (same-site path)
//   GET  /login/?logout=1   destroy the session cookie
//   GET  /auth              internal auth_request check: 200 valid, 401 not

import { createServer } from 'node:http'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const PORT = Number.parseInt(process.env.AUTH_PORT ?? '8081', 10)
const COOKIE_NAME = 'dsh_session'

const ttlHours = Number.parseFloat(process.env.AUTH_TTL_HOURS ?? '24')
const SESSION_TTL_MS =
  (Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 24) * 60 * 60 * 1000
const SESSION_TTL_SECONDS = Math.max(1, Math.round(SESSION_TTL_MS / 1000))

const MAX_ATTEMPTS = 5
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const MAX_BODY_BYTES = 8192

const passwordDigest = resolvePasswordDigest()

const sessions = new Map() // sessionId -> expiresAt (epoch ms)
const attempts = new Map() // ip -> { count, windowStart }

// ---------------------------------------------------------------------------
// helpers

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex')
}

function resolvePasswordDigest() {
  const envHash = process.env.AUTH_PASSWORD_SHA256
  if (envHash) {
    const hash = envHash.toLowerCase()
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      console.error('auth: AUTH_PASSWORD_SHA256 must be a 64-char hex sha256 digest')
      process.exit(1)
    }
    return Buffer.from(hash, 'hex')
  }
  const password = process.env.AUTH_PASSWORD
  if (!password || password.length < 8) {
    console.error('auth: set AUTH_PASSWORD (>= 8 chars) or AUTH_PASSWORD_SHA256 in .env')
    process.exit(1)
  }
  return Buffer.from(sha256Hex(password), 'hex')
}

function prune() {
  const now = Date.now()
  for (const [id, expiresAt] of sessions) {
    if (expiresAt <= now) sessions.delete(id)
  }
  for (const [ip, entry] of attempts) {
    if (now - entry.windowStart >= ATTEMPT_WINDOW_MS) attempts.delete(ip)
  }
}
const pruneTimer = setInterval(prune, 10 * 60 * 1000)
pruneTimer.unref()

function parseCookies(header) {
  const cookies = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (name) cookies[name] = part.slice(eq + 1).trim()
  }
  return cookies
}

function sessionValid(cookieValue) {
  if (typeof cookieValue !== 'string' || !/^[0-9a-f]{64}$/.test(cookieValue)) return false
  const expiresAt = sessions.get(cookieValue)
  return typeof expiresAt === 'number' && expiresAt > Date.now()
}

function clientIp(req) {
  const forwarded = req.headers['x-real-ip']
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim()
  return req.socket.remoteAddress ?? 'unknown'
}

function isSecure(req) {
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim()
  return proto === 'https'
}

function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// Only accept same-site absolute paths; block "//host" and control chars.
function safeNext(raw) {
  if (typeof raw !== 'string') return '/'
  const next = raw.trim()
  if (
    !next.startsWith('/') ||
    next.startsWith('//') ||
    next.startsWith('/\\') ||
    /[\u0000-\u001f\s<>"'`]/.test(next)
  ) {
    return '/'
  }
  return next
}

function sessionCookieHeader(value, req) {
  const parts = [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${value === '' ? 0 : SESSION_TTL_SECONDS}`,
  ]
  if (isSecure(req)) parts.push('Secure')
  return parts.join('; ')
}

function redirect(res, location, cookie) {
  res.writeHead(302, {
    Location: location,
    'Cache-Control': 'no-store',
    ...(cookie ? { 'Set-Cookie': cookie } : {}),
  })
  res.end()
}

// ---------------------------------------------------------------------------
// pages

const MESSAGES = {
  expired: ['error', '会话已过期，请重新登录。'],
  bad: ['error', '密码错误。'],
  limited: ['error', '尝试次数过多，请 15 分钟后再试。'],
  logout: ['info', '已退出登录。'],
}

function loginPage(msgKey) {
  const [cls, text] = MESSAGES[msgKey] ?? ['info', '']
  const ttlDisplay = SESSION_TTL_MS < 3600000 ? '<1' : String(Math.round(SESSION_TTL_MS / 3600000))
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DeepSeek Harness · 登录</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #0d1117; color: #e6edf3;
         font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", sans-serif; }
  .card { width: 320px; padding: 32px; background: #161b22; border: 1px solid #30363d; border-radius: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { font-size: 13px; color: #8b949e; margin: 0 0 20px; }
  label { font-size: 13px; color: #8b949e; }
  input[type="password"] { width: 100%; box-sizing: border-box; margin: 6px 0 16px; padding: 8px 10px;
         background: #0d1117; border: 1px solid #30363d; border-radius: 6px;
         color: #e6edf3; font-size: 14px; }
  input[type="password"]:focus { outline: 1px solid #1f6feb; }
  button { width: 100%; padding: 8px 10px; background: #1f6feb; border: 0; border-radius: 6px;
         color: #fff; font-size: 14px; cursor: pointer; }
  button:hover { background: #388bfd; }
  .msg { margin-top: 16px; padding: 8px 10px; border-radius: 6px; font-size: 13px; }
  .msg.error { background: #3d1616; color: #f85149; border: 1px solid #6e2b2b; }
  .msg.info { background: #122a3d; color: #79c0ff; border: 1px solid #1f4a70; }
  .msg.hidden { display: none; }
  .hint { margin-top: 16px; font-size: 12px; color: #8b949e; line-height: 1.5; }
</style>
</head>
<body>
<form class="card" method="post" action="/login/">
  <h1>DeepSeek Harness</h1>
  <p class="sub">登录会话 ${ttlDisplay} 小时后过期</p>
  <label for="password">访问密码</label>
  <input id="password" name="password" type="password" autofocus
         autocomplete="current-password" required>
  <button type="submit">登录</button>
  <div class="msg ${cls}${text ? '' : ' hidden'}">${text}</div>
  <div class="hint">会话只保存在你的浏览器中；服务重启后全部会话失效。</div>
</form>
</body>
</html>
`
}

// ---------------------------------------------------------------------------
// handlers

function handleLoginGet(req, res, query) {
  let msgKey = ''

  if (query.get('logout') !== null) {
    const cookies = parseCookies(req.headers.cookie)
    const sid = cookies[COOKIE_NAME] ?? ''
    if (sid) sessions.delete(sid)
    console.log(`auth: logout ${clientIp(req)}`)
    return redirect(res, '/login/?msg=logout', sessionCookieHeader('', req))
  }

  if (MESSAGES[query.get('msg') ?? '']) msgKey = query.get('msg')

  // A stale cookie means the session expired server-side.
  const cookies = parseCookies(req.headers.cookie)
  const sid = cookies[COOKIE_NAME]
  if (!msgKey && sid && !sessionValid(sid)) msgKey = 'expired'

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(loginPage(msgKey))
}

async function handleLoginPost(req, res) {
  const ip = clientIp(req)

  const now = Date.now()
  const entry = attempts.get(ip)
  if (entry && now - entry.windowStart < ATTEMPT_WINDOW_MS && entry.count >= MAX_ATTEMPTS) {
    console.log(`auth: rate-limited ${ip}`)
    res.writeHead(429, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    return res.end(loginPage('limited'))
  }
  if (!entry || now - entry.windowStart >= ATTEMPT_WINDOW_MS) {
    attempts.set(ip, { count: 0, windowStart: now })
  }
  const bucket = attempts.get(ip)

  let params
  try {
    params = new URLSearchParams(await readBody(req))
  } catch {
    params = new URLSearchParams()
  }
  const password = params.get('password') ?? ''

  const submitted = Buffer.from(sha256Hex(password), 'hex')
  const match = submitted.length === passwordDigest.length && timingSafeEqual(submitted, passwordDigest)

  if (!match) {
    bucket.count += 1
    console.log(`auth: failed login ${ip} (${bucket.count}/${MAX_ATTEMPTS})`)
    res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    return res.end(loginPage('bad'))
  }

  attempts.delete(ip)
  const sessionId = randomBytes(32).toString('hex')
  sessions.set(sessionId, Date.now() + SESSION_TTL_MS)
  console.log(`auth: login ok ${ip} (session ttl ${Math.round(SESSION_TTL_MS / 60000)} min)`)

  redirect(res, safeNext(params.get('next')), sessionCookieHeader(sessionId, req))
}

function handleAuth(req, res) {
  const cookies = parseCookies(req.headers.cookie)
  const valid = sessionValid(cookies[COOKIE_NAME])
  res.writeHead(valid ? 200 : 401, { 'Cache-Control': 'no-store', 'Content-Length': '0' })
  res.end()
}

// ---------------------------------------------------------------------------
// server

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname

  try {
    if (path === '/auth') return handleAuth(req, res)
    if (path === '/login' && req.method === 'GET') return redirect(res, '/login/', undefined)
    if (path === '/login/') {
      if (req.method === 'GET') return handleLoginGet(req, res, url.searchParams)
      if (req.method === 'POST') return handleLoginPost(req, res)
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('not found')
  } catch (err) {
    console.error('auth: request failed', err)
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('internal error')
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`auth: listening on :${PORT}, session ttl ${Math.round(SESSION_TTL_MS / 60000)} min`)
})
