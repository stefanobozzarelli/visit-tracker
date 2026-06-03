import axios from 'axios';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';

/**
 * Integrazione Microsoft Graph per creare BOZZE in Outlook con PDF allegato.
 *
 * Flusso OAuth2 (authorization code + refresh) con permessi delegati:
 *   Mail.ReadWrite, offline_access, User.Read, openid, email, profile.
 * Salviamo refresh_token sull'utente e rinnoviamo l'access token quando scade.
 */
export class MicrosoftGraphService {
  private clientId = process.env.MS_CLIENT_ID || '';
  private clientSecret = process.env.MS_CLIENT_SECRET || '';
  private tenant = process.env.MS_TENANT || 'common';
  private redirectUri =
    process.env.MS_REDIRECT_URI ||
    'https://visit-tracker-backend-production.up.railway.app/api/auth/microsoft/callback';

  private scopes = [
    'openid',
    'profile',
    'email',
    'offline_access',
    'User.Read',
    'Mail.ReadWrite',
  ];

  private get authority() {
    return `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0`;
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  /** URL a cui mandare l'utente per autorizzare. `state` lega il callback all'utente. */
  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      response_mode: 'query',
      scope: this.scopes.join(' '),
      state,
      prompt: 'select_account',
    });
    return `${this.authority}/authorize?${params.toString()}`;
  }

  /** Scambia il code del callback per access + refresh token e li salva sull'utente. */
  async exchangeCodeForUser(userId: string, code: string): Promise<User> {
    const tokens = await this.requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });
    return this.persistTokens(userId, tokens);
  }

  /** Ritorna un access token valido, rinnovandolo col refresh token se scaduto. */
  async getValidAccessToken(user: User): Promise<string> {
    const now = Date.now();
    const expiry = user.ms_token_expiry ? Number(user.ms_token_expiry) : 0;

    if (user.ms_access_token && expiry - 60_000 > now) {
      return user.ms_access_token;
    }

    if (!user.ms_refresh_token) {
      throw new Error('Outlook non collegato. Collega prima il tuo account Microsoft.');
    }

    const tokens = await this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: user.ms_refresh_token,
    });
    const updated = await this.persistTokens(user.id, tokens);
    return updated.ms_access_token as string;
  }

  async disconnect(userId: string): Promise<void> {
    const repo = AppDataSource.getRepository(User);
    await repo.update(userId, {
      ms_refresh_token: null,
      ms_access_token: null,
      ms_token_expiry: null,
      ms_email: null,
    });
  }

  /**
   * Crea una bozza in Outlook con il PDF allegato. Ritorna il webLink della bozza.
   * Gestisce sia allegati piccoli (POST diretto) sia grandi (upload session).
   */
  async createDraftWithPdf(
    user: User,
    opts: { subject: string; body: string; filename: string; pdf: Buffer; to?: string[] },
  ): Promise<{ webLink: string; id: string }> {
    const accessToken = await this.getValidAccessToken(user);
    const auth = { headers: { Authorization: `Bearer ${accessToken}` } };

    // 1. Crea la bozza (senza allegato)
    const draftRes = await axios.post(
      'https://graph.microsoft.com/v1.0/me/messages',
      {
        subject: opts.subject,
        body: { contentType: 'Text', content: opts.body },
        toRecipients: (opts.to || []).map((email) => ({ emailAddress: { address: email } })),
      },
      auth,
    );

    const messageId: string = draftRes.data.id;
    const webLink: string = draftRes.data.webLink;

    // 2. Allega il PDF (soglia Graph per upload diretto ~3MB)
    const SIMPLE_LIMIT = 3_000_000;
    if (opts.pdf.length < SIMPLE_LIMIT) {
      await axios.post(
        `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments`,
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: opts.filename,
          contentType: 'application/pdf',
          contentBytes: opts.pdf.toString('base64'),
        },
        auth,
      );
    } else {
      await this.uploadLargeAttachment(accessToken, messageId, opts.filename, opts.pdf);
    }

    return { webLink, id: messageId };
  }

  // ── interni ────────────────────────────────────────────────────────────────

  private async requestToken(extra: Record<string, string>): Promise<any> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: this.scopes.join(' '),
      ...extra,
    });
    try {
      const res = await axios.post(`${this.authority}/token`, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      return res.data;
    } catch (err: any) {
      const detail = err?.response?.data?.error_description || err?.message || 'errore sconosciuto';
      throw new Error(`Microsoft OAuth: ${detail}`);
    }
  }

  private async persistTokens(userId: string, tokens: any): Promise<User> {
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({ where: { id: userId } });
    if (!user) throw new Error('Utente non trovato');

    user.ms_access_token = tokens.access_token;
    // refresh_token può non essere restituito al refresh → conserva il precedente
    if (tokens.refresh_token) user.ms_refresh_token = tokens.refresh_token;
    user.ms_token_expiry = String(Date.now() + (tokens.expires_in || 3600) * 1000);

    // Recupera l'email Microsoft (per mostrarla nell'UI), best-effort
    if (!user.ms_email) {
      try {
        const me = await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        user.ms_email = me.data.mail || me.data.userPrincipalName || null;
      } catch { /* non bloccante */ }
    }

    await repo.save(user);
    return user;
  }

  /** Allegati > ~3MB: upload session a chunk (multipli di 320KB). */
  private async uploadLargeAttachment(
    accessToken: string,
    messageId: string,
    filename: string,
    buffer: Buffer,
  ): Promise<void> {
    const auth = { headers: { Authorization: `Bearer ${accessToken}` } };

    const sessionRes = await axios.post(
      `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments/createUploadSession`,
      {
        AttachmentItem: {
          attachmentType: 'file',
          name: filename,
          size: buffer.length,
          contentType: 'application/pdf',
        },
      },
      auth,
    );

    const uploadUrl: string = sessionRes.data.uploadUrl;
    const CHUNK = 320 * 1024 * 9; // ~2.9MB, multiplo di 320KB
    let start = 0;

    while (start < buffer.length) {
      const end = Math.min(start + CHUNK, buffer.length);
      const slice = buffer.subarray(start, end);
      await axios.put(uploadUrl, slice, {
        headers: {
          'Content-Length': String(slice.length),
          'Content-Range': `bytes ${start}-${end - 1}/${buffer.length}`,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      start = end;
    }
  }
}
