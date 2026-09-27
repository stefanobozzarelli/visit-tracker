import { AppDataSource } from '../config/database';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { InvoiceLineItem } from '../entities/InvoiceLineItem';
import { Client } from '../entities/Client';
import { S3Service } from './S3Service';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import Anthropic from '@anthropic-ai/sdk';
// pdf-parse v1 — simple function: pdfParse(buffer) => { text, numpages, info }
const pdfParse = require('pdf-parse');

const getAnthropicClient = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  ANTHROPIC_API_KEY not found - invoice AI extraction disabled');
    return null;
  }
  return new Anthropic({ apiKey });
};

const getS3Client = () => new S3Client({
  region: process.env.AWS_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export class InvoiceService {
  private invoiceRepo = AppDataSource.getRepository(Invoice);
  private lineItemRepo = AppDataSource.getRepository(InvoiceLineItem);
  private clientRepo = AppDataSource.getRepository(Client);
  private s3Service = new S3Service();

  async uploadAndProcess(
    file: Express.Multer.File,
    companyId: string,
    clientId: string | null,
    userId: string
  ): Promise<Invoice> {
    // Upload to S3
    const s3Key = `invoices/${uuidv4()}.pdf`;
    const s3Client = getS3Client();
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET || 'visit-tracker-bucket',
      Key: s3Key,
      Body: file.buffer,
      ContentType: 'application/pdf',
    }));

    // Create invoice record
    const invoice = this.invoiceRepo.create({
      company_id: companyId,
      client_id: clientId || undefined,
      status: InvoiceStatus.PROCESSING,
      s3_key: s3Key,
      original_filename: file.originalname,
      file_size: file.size,
      uploaded_by_user_id: userId,
    });
    await this.invoiceRepo.save(invoice);

    // Fire-and-forget AI extraction
    this.processInvoice(invoice.id).catch(err => {
      console.error(`[INVOICE] Processing failed for ${invoice.id}:`, err.message);
    });

    return invoice;
  }

  async processInvoice(invoiceId: string): Promise<void> {
    const invoice = await this.invoiceRepo.findOneBy({ id: invoiceId });
    if (!invoice) throw new Error('Invoice not found');

    try {
      // Download PDF from S3
      const s3Client = getS3Client();
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET || 'visit-tracker-bucket',
        Key: invoice.s3_key,
      }));

      const bodyBytes = await response.Body?.transformToByteArray();
      if (!bodyBytes) throw new Error('Empty PDF file');
      const pdfBuffer = Buffer.from(bodyBytes);

      // Extract text from PDF
      const pdfData = await pdfParse(pdfBuffer);
      const extractedText = pdfData.text;

      if (!extractedText || extractedText.trim().length < 10) {
        throw new Error('Could not extract text from PDF - file may be scanned/image-based');
      }

      // Save raw text
      invoice.raw_extracted_text = extractedText;
      await this.invoiceRepo.save(invoice);

      // AI extraction
      const client = getAnthropicClient();
      if (!client) {
        throw new Error('Anthropic API key not configured');
      }

      const aiResponse = await client.messages.create({
        model: 'claude-opus-5',
        max_tokens: 16000,
        messages: [{
          role: 'user',
          content: `You are an invoice data extraction system for an Italian sales agency. Extract structured data from this invoice text.

INVOICE TEXT:
"""
${extractedText.substring(0, 15000)}
"""

Extract and return ONLY valid JSON with this structure:
{
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "total_amount": number or null,
  "currency": "EUR",
  "line_items": [
    {
      "line_number": 1,
      "article_code": "string or null",
      "description": "string",
      "quantity": number,
      "unit": "m2" or "pz" or "ml" or "kg" or "lt" or "other",
      "unit_price": number,
      "discount_percent": number or null,
      "line_total": number,
      "raw_text": "original line text from PDF"
    }
  ]
}

RULES:
- Italian invoices: look for "Fattura", "Nr.", "N.", "Data", "Importo", "Totale"
- Article codes may be alphanumeric like "ABK-123", "FLV.456", "60x120" etc.
- Units: "mq" or "m2" or "m²" = square meters (use "m2"), "pz" = pieces, "ml" = linear meters, "kg" = kilograms
- Prices may use comma as decimal separator (15,50 = 15.50) — convert to dot decimal
- Discount may appear as percentage or compound discount (50+10)
- For compound discounts like "50+10", calculate the effective single percentage
- If you cannot determine a field, use null
- All monetary amounts must be numbers (not strings)

CRITICAL — how to identify quantity and unit_price:
- READ THE COLUMN HEADERS in the PDF carefully. The column labeled "Quantity" or "Quantità" or "Qta" contains the quantity. The column labeled "Price" or "Prezzo" contains the unit price.
- DO NOT assume which number is larger or smaller. The quantity in m2 can be LARGER than the price per m2.
- Example from a real invoice: Code 0013288, Quantity = 87.84 M2, Price = 24.50 EUR/m2, Amount = 2152.08 EUR. Here 87.84 is the quantity (m2) and 24.50 is the price.
- ALWAYS verify: quantity × unit_price should approximately equal line_total (the Amount column)
- If your extracted quantity × unit_price does NOT match the line_total, you probably swapped them — fix it
- The quantity often has the unit written next to it (e.g. "87,84 M2" or "3,36 M2")

- Return ONLY the JSON, no explanation or markdown`
        }]
      });

      // Parse AI response
      const textBlock = aiResponse.content.find((b) => b.type === 'text');
      const responseText = textBlock?.type === 'text' ? textBlock.text : '';
      let parsed: any;
      try {
        // Try to extract JSON from response (may have markdown wrappers)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in AI response');
        parsed = JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        throw new Error(`Failed to parse AI response: ${(parseErr as Error).message}`);
      }

      // Update invoice header
      if (parsed.invoice_number) invoice.invoice_number = parsed.invoice_number;
      if (parsed.invoice_date) invoice.invoice_date = parsed.invoice_date;
      if (parsed.total_amount) invoice.total_amount = parsed.total_amount;
      if (parsed.currency) invoice.currency = parsed.currency;

      // Save line items
      if (parsed.line_items && Array.isArray(parsed.line_items)) {
        const lineItems = parsed.line_items.map((item: any, idx: number) => {
          return this.lineItemRepo.create({
            invoice_id: invoice.id,
            line_number: item.line_number || idx + 1,
            article_code: item.article_code || null,
            description: item.description || 'Unknown',
            quantity: Number(item.quantity) || 0,
            unit: item.unit || 'pz',
            unit_price: Number(item.unit_price) || 0,
            discount_percent: item.discount_percent ? Number(item.discount_percent) : null,
            line_total: Number(item.line_total) || 0,
            raw_text: item.raw_text || null,
          });
        });
        await this.lineItemRepo.save(lineItems);

        // Recalculate total if not provided
        if (!parsed.total_amount) {
          invoice.total_amount = lineItems.reduce((sum: number, item: any) => sum + Number(item.line_total), 0);
        }
      }

      invoice.status = InvoiceStatus.PROCESSED;
      invoice.error_message = null as any;
      await this.invoiceRepo.save(invoice);
      console.log(`[INVOICE] ✅ Processed ${invoice.id}: ${parsed.line_items?.length || 0} line items`);

      // Find the customer among existing clients (never overrides a client chosen at upload)
      if (!invoice.client_id) {
        try {
          await this.matchClient(invoice.id);
        } catch (matchErr) {
          console.warn(`[INVOICE] ⚠️ Client match failed for ${invoice.id}:`, (matchErr as Error).message);
        }
      }

      // Auto-calculate commission
      try {
        const { CommissionService } = require('./CommissionService');
        const commService = new CommissionService();
        await commService.calculateInvoiceCommission(invoice.id);
        console.log(`[INVOICE] ✅ Commission calculated for ${invoice.id}`);
      } catch (commErr) {
        console.warn(`[INVOICE] ⚠️ Commission calc failed for ${invoice.id}:`, (commErr as Error).message);
      }

    } catch (err) {
      invoice.status = InvoiceStatus.ERROR;
      invoice.error_message = (err as Error).message;
      await this.invoiceRepo.save(invoice);
      console.error(`[INVOICE] ❌ Error processing ${invoice.id}:`, (err as Error).message);
    }
  }

  async getInvoices(filters: {
    company_id?: string;
    client_id?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ invoices: Invoice[]; total: number }> {
    const qb = this.invoiceRepo.createQueryBuilder('inv')
      .leftJoinAndSelect('inv.company', 'company')
      .leftJoinAndSelect('inv.client', 'client')
      .leftJoinAndSelect('inv.uploaded_by_user', 'user');

    if (filters.company_id) qb.andWhere('inv.company_id = :companyId', { companyId: filters.company_id });
    if (filters.client_id) qb.andWhere('inv.client_id = :clientId', { clientId: filters.client_id });
    if (filters.status) qb.andWhere('inv.status = :status', { status: filters.status });
    if (filters.start_date) qb.andWhere('inv.invoice_date >= :startDate', { startDate: filters.start_date });
    if (filters.end_date) qb.andWhere('inv.invoice_date <= :endDate', { endDate: filters.end_date });

    qb.orderBy('inv.created_at', 'DESC');

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    qb.skip((page - 1) * limit).take(limit);

    const [invoices, total] = await qb.getManyAndCount();
    return { invoices, total };
  }

  async getInvoiceById(id: string): Promise<Invoice | null> {
    return this.invoiceRepo.findOne({
      where: { id },
      relations: ['company', 'client', 'uploaded_by_user', 'items'],
      order: { items: { line_number: 'ASC' } } as any,
    });
  }

  async deleteInvoice(id: string): Promise<void> {
    const invoice = await this.invoiceRepo.findOneBy({ id });
    if (!invoice) throw new Error('Invoice not found');

    // Delete from S3
    try { await this.s3Service.deleteFile(invoice.s3_key); } catch (e) { /* ignore S3 errors */ }

    // Delete record (cascade deletes line items)
    await this.invoiceRepo.remove(invoice);
  }

  async reprocessInvoice(id: string): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOneBy({ id });
    if (!invoice) throw new Error('Invoice not found');

    // Delete existing line items
    await this.lineItemRepo.delete({ invoice_id: id });

    // Reset status
    invoice.status = InvoiceStatus.PROCESSING;
    invoice.error_message = null as any;
    await this.invoiceRepo.save(invoice);

    // Re-process
    this.processInvoice(id).catch(err => {
      console.error(`[INVOICE] Reprocess failed for ${id}:`, err.message);
    });

    return invoice;
  }

  async getStats(filters: {
    company_id?: string;
    company_ids?: string[];
    client_id?: string;
    country?: string;
    start_date?: string;
    end_date?: string;
  } = {}): Promise<any> {
    const whereClause: string[] = ["inv.status = 'processed'"];
    const params: any = {};

    if (filters.company_id) { whereClause.push('inv.company_id = :companyId'); params.companyId = filters.company_id; }
    if (filters.company_ids?.length) { whereClause.push('inv.company_id IN (:...companyIds)'); params.companyIds = filters.company_ids; }
    if (filters.client_id) { whereClause.push('inv.client_id = :clientId'); params.clientId = filters.client_id; }
    if (filters.country) { whereClause.push('cl.country = :country'); params.country = filters.country; }
    if (filters.start_date) { whereClause.push('inv.invoice_date >= :startDate'); params.startDate = filters.start_date; }
    if (filters.end_date) { whereClause.push('inv.invoice_date <= :endDate'); params.endDate = filters.end_date; }

    const where = whereClause.join(' AND ');

    // Revenue by company
    const revenueByCompany = await this.invoiceRepo.createQueryBuilder('inv')
      .select('inv.company_id', 'company_id')
      .addSelect('c.name', 'company_name')
      .addSelect('SUM(inv.total_amount)', 'total')
      .addSelect('COUNT(inv.id)', 'count')
      .leftJoin('inv.company', 'c')
      .leftJoin('inv.client', 'cl')
      .where(where, params)
      .groupBy('inv.company_id')
      .addGroupBy('c.name')
      .orderBy('total', 'DESC')
      .getRawMany();

    // Revenue by client
    const revenueByClient = await this.invoiceRepo.createQueryBuilder('inv')
      .select('inv.client_id', 'client_id')
      .addSelect('cl.name', 'client_name')
      .addSelect('SUM(inv.total_amount)', 'total')
      .addSelect('COUNT(inv.id)', 'count')
      .leftJoin('inv.client', 'cl')
      .where(where + ' AND inv.client_id IS NOT NULL', params)
      .groupBy('inv.client_id')
      .addGroupBy('cl.name')
      .orderBy('total', 'DESC')
      .getRawMany();

    // Revenue by country
    const revenueByCountry = await this.invoiceRepo.createQueryBuilder('inv')
      .select("COALESCE(cl.country, 'N/D')", 'country')
      .addSelect('SUM(inv.total_amount)', 'total')
      .addSelect('COUNT(inv.id)', 'count')
      .leftJoin('inv.client', 'cl')
      .where(where, params)
      .groupBy('cl.country')
      .orderBy('total', 'DESC')
      .getRawMany();

    // Revenue by month
    const revenueByMonth = await this.invoiceRepo.createQueryBuilder('inv')
      .leftJoin('inv.client', 'cl')
      .select("TO_CHAR(inv.invoice_date, 'YYYY-MM')", 'month')
      .addSelect('SUM(inv.total_amount)', 'total')
      .addSelect('COUNT(inv.id)', 'count')
      .where(where + ' AND inv.invoice_date IS NOT NULL', params)
      .groupBy("TO_CHAR(inv.invoice_date, 'YYYY-MM')")
      .orderBy('month', 'DESC')
      .getRawMany();

    // Top articles
    const topArticles = await this.lineItemRepo.createQueryBuilder('li')
      .select('li.article_code', 'article_code')
      .addSelect('li.description', 'description')
      .addSelect('li.unit', 'unit')
      .addSelect('SUM(li.quantity)', 'total_quantity')
      .addSelect('SUM(li.line_total)', 'total_revenue')
      .addSelect('AVG(li.unit_price)', 'avg_price')
      .innerJoin('li.invoice', 'inv')
      .leftJoin('inv.client', 'cl')
      .where(where, params)
      .andWhere('li.article_code IS NOT NULL')
      .groupBy('li.article_code')
      .addGroupBy('li.description')
      .addGroupBy('li.unit')
      .orderBy('total_revenue', 'DESC')
      .limit(50)
      .getRawMany();

    // Unit totals (m2, pz, etc.)
    const unitTotals = await this.lineItemRepo.createQueryBuilder('li')
      .select('li.unit', 'unit')
      .addSelect('SUM(li.quantity)', 'total_quantity')
      .addSelect('SUM(li.line_total)', 'total_revenue')
      .innerJoin('li.invoice', 'inv')
      .leftJoin('inv.client', 'cl')
      .where(where, params)
      .groupBy('li.unit')
      .orderBy('total_revenue', 'DESC')
      .getRawMany();

    // Grand totals
    const grandTotal = await this.invoiceRepo.createQueryBuilder('inv')
      .leftJoin('inv.client', 'cl')
      .select('SUM(inv.total_amount)', 'total')
      .addSelect('COUNT(inv.id)', 'count')
      .where(where, params)
      .getRawOne();

    return {
      revenue_by_company: revenueByCompany,
      revenue_by_client: revenueByClient,
      revenue_by_country: revenueByCountry,
      revenue_by_month: revenueByMonth,
      top_articles: topArticles,
      unit_totals: unitTotals,
      grand_total: Number(grandTotal?.total) || 0,
      invoice_count: Number(grandTotal?.count) || 0,
    };
  }

  async askQuestion(question: string): Promise<string> {
    const client = getAnthropicClient();
    if (!client) return 'API Anthropic non configurata. Configura ANTHROPIC_API_KEY per usare l\'assistente AI.';

    // Fetch summary data for context
    const stats = await this.getStats();

    const contextData = JSON.stringify({
      totale_fatturato: stats.grand_total,
      numero_fatture: stats.invoice_count,
      fatturato_per_azienda: stats.revenue_by_company,
      fatturato_per_cliente: stats.revenue_by_client,
      fatturato_per_mese: stats.revenue_by_month,
      articoli_principali: stats.top_articles.slice(0, 20),
      totali_per_unita: stats.unit_totals,
    }, null, 2);

    const aiResponse = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      messages: [{
        role: 'user',
        content: `Sei un assistente di analisi vendite per un'agenzia di rappresentanza italiana (Primula).
Le aziende rappresentate sono i brand (es. ABK, Flaviker, Novabell, etc.).
I clienti sono i rivenditori/distributori/architetti che comprano.

Ecco i dati delle fatture disponibili:
${contextData}

DOMANDA: ${question}

Rispondi in italiano, in modo chiaro e conciso. Se ci sono numeri, formattali con il separatore delle migliaia (es. 1.234,56 €).
Se non hai abbastanza dati per rispondere, dillo chiaramente.`
      }]
    });

    const textBlock = aiResponse.content.find((b) => b.type === 'text');
    return textBlock?.type === 'text' ? textBlock.text : 'Risposta non disponibile.';
  }

  async getDownloadUrl(id: string): Promise<string> {
    const invoice = await this.invoiceRepo.findOneBy({ id });
    if (!invoice) throw new Error('Invoice not found');
    return this.s3Service.getDownloadUrl(invoice.s3_key);
  }

  // ─── Line Item Editing ─────────────────────────────────

  async updateLineItem(invoiceId: string, itemId: string, data: Partial<InvoiceLineItem>): Promise<InvoiceLineItem | null> {
    const item = await this.lineItemRepo.findOne({ where: { id: itemId, invoice_id: invoiceId } });
    if (!item) return null;
    Object.assign(item, data);
    if (data.quantity !== undefined || data.unit_price !== undefined) {
      item.line_total = Number(item.quantity) * Number(item.unit_price);
    }
    await this.lineItemRepo.save(item);
    await this.recalcInvoiceTotal(invoiceId);
    return item;
  }

  async addLineItem(invoiceId: string, data: Partial<InvoiceLineItem>): Promise<InvoiceLineItem> {
    const maxLine = await this.lineItemRepo.createQueryBuilder('li')
      .where('li.invoice_id = :id', { id: invoiceId })
      .select('MAX(li.line_number)', 'max')
      .getRawOne();
    const item = this.lineItemRepo.create({
      ...data,
      invoice_id: invoiceId,
      line_number: (Number(maxLine?.max) || 0) + 1,
      line_total: Number(data.quantity || 0) * Number(data.unit_price || 0),
    } as any);
    const saved = await this.lineItemRepo.save(item) as any as InvoiceLineItem;
    await this.recalcInvoiceTotal(invoiceId);
    return saved;
  }

  async deleteLineItem(invoiceId: string, itemId: string): Promise<void> {
    await this.lineItemRepo.delete({ id: itemId, invoice_id: invoiceId });
    await this.recalcInvoiceTotal(invoiceId);
  }

  /**
   * Reads the invoice recipient from the extracted text and compares it with existing clients.
   * An unambiguous match is assigned directly; a plausible one is stored as a suggestion
   * for the user to confirm.
   */
  async matchClient(invoiceId: string): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOneBy({ id: invoiceId });
    if (!invoice) throw new Error('Invoice not found');
    if (!invoice.raw_extracted_text) throw new Error('Invoice text not available');

    const client = getAnthropicClient();
    if (!client) throw new Error('Anthropic API key not configured');

    const knownClients = await this.clientRepo.find({ select: ['id', 'name', 'city', 'country'] });
    const clientList = knownClients
      .map(c => `${c.id} | ${c.name} | ${c.city || ''} | ${c.country || ''}`)
      .join('\n');

    const aiResponse = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      output_config: { effort: 'low' },
      messages: [{
        role: 'user',
        content: `Find the customer of this invoice among our known clients.

The customer is the invoice RECIPIENT (the buyer: "Cliente", "Destinatario", "Spett.le", "Intestatario", "Sede legale" of the buyer, "Destinazione merce"), NOT the issuer/seller that prints its own name and logo at the top.

INVOICE TEXT:
"""
${invoice.raw_extracted_text.substring(0, 8000)}
"""

KNOWN CLIENTS (id | name | city | country):
${clientList || '(none)'}

Return ONLY valid JSON:
{
  "customer_name": "recipient name as written on the invoice, or null",
  "match_id": "id from KNOWN CLIENTS or null",
  "confidence": "exact" | "likely" | "none"
}

- "exact": clearly the same business (same name ignoring legal suffixes like srl/spa/snc/ltd, case, punctuation, abbreviations).
- "likely": the most similar known client is plausibly the same business but not certain (e.g. partial name, different branch, spelling variant, same city). Use it so a human can confirm.
- "none": no known client is plausibly the recipient; match_id must be null.`
      }]
    });

    const textBlock = aiResponse.content.find((b) => b.type === 'text');
    const responseText = textBlock?.type === 'text' ? textBlock.text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in AI response');
    const parsed = JSON.parse(jsonMatch[0]);

    const matchId = knownClients.some(c => c.id === parsed.match_id) ? parsed.match_id : null;
    invoice.customer_name = parsed.customer_name || null;
    invoice.suggested_client_id = null as any;

    if (matchId && parsed.confidence === 'exact') {
      invoice.client_id = matchId;
      await this.invoiceRepo.save(invoice);
      console.log(`[INVOICE] Matched customer "${parsed.customer_name}" to client ${matchId}`);
      try {
        const { CommissionService } = require('./CommissionService');
        await new CommissionService().calculateInvoiceCommission(invoice.id);
      } catch (e) { /* ignore */ }
    } else {
      if (matchId && parsed.confidence === 'likely') invoice.suggested_client_id = matchId;
      await this.invoiceRepo.save(invoice);
    }
    return invoice;
  }

  async updateInvoiceClient(invoiceId: string, clientId: string | null): Promise<void> {
    await this.invoiceRepo.update(invoiceId, { client_id: clientId as any, suggested_client_id: null as any });
    // Recalculate commission (rates can depend on client and country)
    try {
      const { CommissionService } = require('./CommissionService');
      const commService = new CommissionService();
      await commService.calculateInvoiceCommission(invoiceId);
    } catch (e) { /* ignore */ }
  }

  async updateInvoiceTotal(invoiceId: string, total: number): Promise<void> {
    await this.invoiceRepo.update(invoiceId, { total_amount: total });
    // Recalculate commission
    try {
      const { CommissionService } = require('./CommissionService');
      const commService = new CommissionService();
      await commService.calculateInvoiceCommission(invoiceId);
    } catch (e) { /* ignore */ }
  }

  private async recalcInvoiceTotal(invoiceId: string): Promise<void> {
    const items = await this.lineItemRepo.find({ where: { invoice_id: invoiceId } });
    const total = items.reduce((sum, item) => sum + Number(item.line_total), 0);
    await this.invoiceRepo.update(invoiceId, { total_amount: total });
    // Recalculate commission
    try {
      const { CommissionService } = require('./CommissionService');
      const commService = new CommissionService();
      await commService.calculateInvoiceCommission(invoiceId);
    } catch (e) { /* ignore */ }
  }
}
