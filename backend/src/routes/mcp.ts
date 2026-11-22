import express, { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AuthService } from '../services/AuthService';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { AuthPayload } from '../types';
import { mcpTools, McpAccessError } from '../services/McpToolsService';

/**
 * Claude connector for TradeFlow.
 *
 *   POST /mcp                      MCP endpoint (Streamable HTTP, stateless, read-only tools)
 *   /.well-known/oauth-*           OAuth discovery
 *   /oauth/register|authorize|token  minimal OAuth 2.1 (authorization code + PKCE)
 *
 * The user signs in with their TradeFlow email and password on /oauth/authorize;
 * every tool then runs with that user's own role and visibility.
 *
 * Tokens issued here are signed with a key derived from JWT_SECRET, so they are
 * NOT accepted by the regular /api routes: the connector can only read through
 * the tools in McpToolsService.
 */

const router = Router();
const authService = new AuthService();
const form = express.urlencoded({ extended: false });

const SCOPE = 'tradeflow.read';
const ACCESS_TTL = 60 * 60; // 1 hour
const REFRESH_TTL = 60 * 60 * 24 * 30; // 30 days
const CODE_TTL = 5 * 60; // 5 minutes
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const DEFAULT_REDIRECTS = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'];

// ─── Helpers ─────────────────────────────────────────────

/** Signing key for connector tokens; null when JWT_SECRET is not configured. */
function mcpSecret(): string | null {
  const base = process.env.JWT_SECRET;
  if (!base) return null;
  return crypto.createHash('sha256').update(`${base}:tradeflow-mcp`).digest('hex');
}

function requireSecret(res: Response): string | null {
  const secret = mcpSecret();
  if (!secret) {
    res.status(503).json({ error: 'server_error', error_description: 'JWT_SECRET is not configured: the connector is disabled.' });
  }
  return secret;
}

function baseUrl(req: Request): string {
  if (process.env.MCP_PUBLIC_URL) return process.env.MCP_PUBLIC_URL.replace(/\/+$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

function allowedRedirects(): string[] {
  const extra = (process.env.MCP_ALLOWED_REDIRECT_URIS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...DEFAULT_REDIRECTS, ...extra];
}

const isAllowedRedirect = (uri: any) => typeof uri === 'string' && allowedRedirects().includes(uri);

const esc = (s: any) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const first = (v: any): string => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''));

// Best-effort, per-instance guards (the app runs as a single Railway service).
const loginAttempts = new Map<string, { count: number; reset: number }>();
const usedCodes = new Map<string, number>();

function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.reset < now) {
    loginAttempts.set(ip, { count: 1, reset: now + 15 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}

function markCodeUsed(jti: string, expSeconds: number): boolean {
  const now = Date.now();
  for (const [k, exp] of usedCodes) if (exp < now) usedCodes.delete(k);
  if (usedCodes.has(jti)) return false;
  usedCodes.set(jti, expSeconds * 1000);
  return true;
}

async function loadUser(id: string): Promise<AuthPayload | null> {
  const user = await AppDataSource.getRepository(User).findOne({ where: { id } });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    can_view_revenue: !!(user as any).can_view_revenue,
  };
}

function issueTokens(secret: string, userId: string, clientId: string) {
  const access_token = jwt.sign({ typ: 'mcp_access', sub: userId, cid: clientId }, secret, { expiresIn: ACCESS_TTL });
  const refresh_token = jwt.sign({ typ: 'mcp_refresh', sub: userId, cid: clientId }, secret, { expiresIn: REFRESH_TTL });
  return { access_token, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token, scope: SCOPE };
}

// ─── OAuth discovery ─────────────────────────────────────

const protectedResource = (req: Request, res: Response) => {
  const base = baseUrl(req);
  res.json({
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ['header'],
    scopes_supported: [SCOPE],
    resource_name: 'TradeFlow',
  });
};
router.get('/.well-known/oauth-protected-resource', protectedResource);
router.get('/.well-known/oauth-protected-resource/mcp', protectedResource);

const authorizationServer = (req: Request, res: Response) => {
  const base = baseUrl(req);
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE],
    client_id_metadata_document_supported: true,
  });
};
router.get('/.well-known/oauth-authorization-server', authorizationServer);
router.get('/.well-known/oauth-authorization-server/mcp', authorizationServer);

// ─── OAuth: client registration ──────────────────────────
// Clients are public (PKCE, no secret) and stateless: what protects the flow is
// the redirect URI allowlist, so any client id is accepted.

router.post('/oauth/register', (req: Request, res: Response) => {
  const redirectUris = req.body?.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every(isAllowedRedirect)) {
    return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris must be Claude callback URLs.' });
  }
  res.status(201).json({
    client_id: `tf_${crypto.randomBytes(16).toString('hex')}`,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: typeof req.body?.client_name === 'string' ? req.body.client_name.slice(0, 100) : 'Claude',
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: SCOPE,
  });
});

// ─── OAuth: authorize (login page) ───────────────────────

interface AuthorizeParams {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
}

function readAuthorizeParams(src: any): { params?: AuthorizeParams; error?: string } {
  const params: AuthorizeParams = {
    client_id: first(src.client_id),
    redirect_uri: first(src.redirect_uri),
    state: first(src.state),
    code_challenge: first(src.code_challenge),
  };
  if (!isAllowedRedirect(params.redirect_uri)) return { error: 'Indirizzo di ritorno non consentito.' };
  if (!params.client_id) return { error: 'Richiesta non valida: client_id mancante.' };
  if (first(src.response_type) !== 'code') return { error: 'Richiesta non valida: response_type deve essere "code".' };
  if (!params.code_challenge || first(src.code_challenge_method) !== 'S256') {
    return { error: 'Richiesta non valida: serve PKCE con metodo S256.' };
  }
  return { params };
}

function page(res: Response, status: number, body: string) {
  res.status(status)
    .set('Content-Type', 'text/html; charset=utf-8')
    .set('Cache-Control', 'no-store')
    .set('X-Frame-Options', 'DENY')
    .set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'")
    .send(`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TradeFlow - Accesso per Claude</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#f4f6fb;color:#1a1f36;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{background:#fff;border-radius:12px;padding:32px;width:100%;max-width:360px;box-shadow:0 4px 24px rgba(17,55,163,.12)}
h1{font-size:20px;margin:0 0 8px;color:#1137a3}p{font-size:14px;line-height:1.5;margin:0 0 16px}
label{display:block;font-size:13px;margin:12px 0 4px}input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c9d0e0;border-radius:8px;font-size:15px}
button{margin-top:20px;width:100%;padding:11px;border:0;border-radius:8px;background:#1137a3;color:#fff;font-size:15px;cursor:pointer}
.err{color:#b42318;background:#fef3f2;padding:10px;border-radius:8px}
</style></head><body><main>${body}</main></body></html>`);
}

function loginPage(res: Response, status: number, p: AuthorizeParams, error?: string) {
  const hidden = (Object.keys(p) as (keyof AuthorizeParams)[])
    .map((k) => `<input type="hidden" name="${k}" value="${esc(p[k])}">`)
    .join('');
  page(res, status, `<h1>TradeFlow</h1>
<p>Claude chiede di <strong>leggere</strong> i tuoi dati TradeFlow (fatture, provvigioni, visite, clienti, task). Non può modificare nulla.</p>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="post" action="/oauth/authorize">
${hidden}<input type="hidden" name="response_type" value="code"><input type="hidden" name="code_challenge_method" value="S256">
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Accedi e autorizza</button>
</form>`);
}

router.get('/oauth/authorize', (req: Request, res: Response) => {
  if (!mcpSecret()) return page(res, 503, '<h1>TradeFlow</h1><p class="err">Connettore non configurato sul server.</p>');
  const { params, error } = readAuthorizeParams(req.query);
  if (!params) return page(res, 400, `<h1>TradeFlow</h1><p class="err">${esc(error)}</p>`);
  loginPage(res, 200, params);
});

router.post('/oauth/authorize', form, async (req: Request, res: Response) => {
  const secret = mcpSecret();
  if (!secret) return page(res, 503, '<h1>TradeFlow</h1><p class="err">Connettore non configurato sul server.</p>');
  const { params, error } = readAuthorizeParams(req.body || {});
  if (!params) return page(res, 400, `<h1>TradeFlow</h1><p class="err">${esc(error)}</p>`);

  // req.ip honours "trust proxy" (set in index.ts), so a client cannot dodge
  // the limit by sending its own X-Forwarded-For header.
  const ip = req.ip || 'unknown';
  if (tooManyAttempts(ip)) {
    return loginPage(res, 429, params, 'Troppi tentativi. Riprova tra 15 minuti.');
  }

  try {
    const { user } = await authService.login({ email: first(req.body.email).trim(), password: first(req.body.password) });
    const code = jwt.sign(
      { typ: 'mcp_code', sub: user.id, cid: params.client_id, ru: params.redirect_uri, cc: params.code_challenge, jti: crypto.randomBytes(16).toString('hex') },
      secret,
      { expiresIn: CODE_TTL }
    );
    const target = new URL(params.redirect_uri);
    target.searchParams.set('code', code);
    if (params.state) target.searchParams.set('state', params.state);
    res.set('Cache-Control', 'no-store').redirect(302, target.toString());
  } catch {
    loginPage(res, 401, params, 'Email o password non corretti.');
  }
});

// ─── OAuth: token ────────────────────────────────────────

router.post('/oauth/token', form, async (req: Request, res: Response) => {
  const secret = requireSecret(res);
  if (!secret) return;
  res.set('Cache-Control', 'no-store');
  const body = req.body || {};
  const fail = (error: string, description: string) => res.status(400).json({ error, error_description: description });

  try {
    if (body.grant_type === 'authorization_code') {
      let code: any;
      try {
        code = jwt.verify(first(body.code), secret);
      } catch {
        return fail('invalid_grant', 'Authorization code is invalid or expired.');
      }
      if (code.typ !== 'mcp_code') return fail('invalid_grant', 'Not an authorization code.');
      if (code.cid !== first(body.client_id)) return fail('invalid_grant', 'client_id does not match.');
      if (code.ru !== first(body.redirect_uri)) return fail('invalid_grant', 'redirect_uri does not match.');
      const verifier = first(body.code_verifier);
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      if (!verifier || challenge !== code.cc) return fail('invalid_grant', 'PKCE verification failed.');
      if (!markCodeUsed(code.jti, code.exp)) return fail('invalid_grant', 'Authorization code already used.');
      if (!(await loadUser(code.sub))) return fail('invalid_grant', 'User no longer exists.');
      return res.json(issueTokens(secret, code.sub, code.cid));
    }

    if (body.grant_type === 'refresh_token') {
      let token: any;
      try {
        token = jwt.verify(first(body.refresh_token), secret);
      } catch {
        return fail('invalid_grant', 'Refresh token is invalid or expired.');
      }
      if (token.typ !== 'mcp_refresh') return fail('invalid_grant', 'Not a refresh token.');
      if (body.client_id && token.cid !== first(body.client_id)) return fail('invalid_grant', 'client_id does not match.');
      if (!(await loadUser(token.sub))) return fail('invalid_grant', 'User no longer exists.');
      return res.json(issueTokens(secret, token.sub, token.cid));
    }

    return fail('unsupported_grant_type', 'Use authorization_code or refresh_token.');
  } catch (e) {
    console.error('[MCP] token error:', (e as Error).message);
    res.status(500).json({ error: 'server_error' });
  }
});

// ─── MCP endpoint ────────────────────────────────────────

async function authenticate(req: Request, res: Response): Promise<AuthPayload | null> {
  const secret = requireSecret(res);
  if (!secret) return null;
  const challenge = () => {
    res.status(401)
      .set('WWW-Authenticate', `Bearer resource_metadata="${baseUrl(req)}/.well-known/oauth-protected-resource/mcp", scope="${SCOPE}"`)
      .json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Authentication required' } });
    return null;
  };
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return challenge();
  try {
    const decoded: any = jwt.verify(token, secret);
    if (decoded.typ !== 'mcp_access') return challenge();
    // Reload the user on every request so role changes and removals apply at once.
    const user = await loadUser(decoded.sub);
    return user || challenge();
  } catch {
    return challenge();
  }
}

const rpcError = (id: any, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function handleMessage(msg: any, user: AuthPayload): Promise<any | null> {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(msg?.id, -32600, 'Invalid Request');
  }
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification) return null; // notifications (e.g. notifications/initialized) need no reply
  const ok = (result: any) => ({ jsonrpc: '2.0', id: msg.id, result });

  switch (msg.method) {
    case 'initialize': {
      const requested = msg.params?.protocolVersion;
      return ok({
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'tradeflow', title: 'TradeFlow', version: '1.0.0' },
        instructions:
          'Dati di sola lettura di TradeFlow (gestione visite, clienti e provvigioni). Ogni strumento restituisce righe piatte in "rows". I filtri per nome vogliono il nome esatto: usa tradeflow_clienti e tradeflow_aziende per trovarli.',
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({
        tools: mcpTools.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        })),
      });
    case 'tools/call': {
      const tool = mcpTools.find((t) => t.name === msg.params?.name);
      if (!tool) return rpcError(msg.id, -32602, `Unknown tool: ${msg.params?.name}`);
      const args = msg.params?.arguments && typeof msg.params.arguments === 'object' ? msg.params.arguments : {};
      try {
        const rows = await tool.run(user, args);
        const payload = { rows, count: rows.length };
        return ok({ content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload, isError: false });
      } catch (e) {
        const message = e instanceof McpAccessError ? e.message : 'Errore nel leggere i dati da TradeFlow.';
        if (!(e instanceof McpAccessError)) console.error(`[MCP] ${tool.name} failed:`, (e as Error).message);
        return ok({ content: [{ type: 'text', text: message }], isError: true });
      }
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

router.post('/mcp', async (req: Request, res: Response) => {
  const user = await authenticate(req, res);
  if (!user) return;
  try {
    const body = req.body;
    if (Array.isArray(body)) {
      const replies = (await Promise.all(body.map((m) => handleMessage(m, user)))).filter(Boolean);
      return replies.length ? res.json(replies) : res.status(202).end();
    }
    const reply = await handleMessage(body, user);
    return reply ? res.json(reply) : res.status(202).end();
  } catch (e) {
    console.error('[MCP] request error:', (e as Error).message);
    res.status(500).json(rpcError(null, -32603, 'Internal error'));
  }
});

// Stateless server: no SSE stream and no sessions to delete.
const methodNotAllowed = (req: Request, res: Response) => {
  res.status(405).set('Allow', 'POST').json(rpcError(null, -32000, 'Method not allowed'));
};
router.get('/mcp', methodNotAllowed);
router.delete('/mcp', methodNotAllowed);

export default router;
