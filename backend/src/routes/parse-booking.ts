import { Router, Request, Response } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Store files in memory (max 20 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function buildPrompt(): string {
  const today = new Date().toISOString().slice(0, 10); // e.g. "2026-04-27"
  const year = today.slice(0, 4);
  return `You are a travel booking data extractor. Today's date is ${today}.
Analyze this document (booking confirmation, e-ticket, screenshot, or photo) and extract ALL flight segments and hotel bookings.

Return ONLY a JSON object — no explanation, no markdown, no code fences — in exactly this structure:
{
  "type": "flight" | "hotel" | "mixed" | "unknown",
  "flights": [
    {
      "date": "YYYY-MM-DD or null",
      "route": "BLQ-IST",
      "details": "TK1322 10:30/15:50"
    }
  ],
  "hotels": [
    {
      "name": "Full hotel name",
      "checkIn": "YYYY-MM-DD or null",
      "checkOut": "YYYY-MM-DD or null"
    }
  ]
}

Extraction rules:
- date: the LOCAL DEPARTURE DATE of that specific flight leg as YYYY-MM-DD. This is critical for multi-leg itineraries:
  * Each leg has its own departure date based on when THAT leg takes off.
  * Example: if leg 1 departs July 8 at 23:05 and arrives July 9 at 05:15, then leg 2 which departs July 9 at 07:50 has date "YYYY-07-09" (NOT July 8).
  * Do NOT use the section header date for all legs — read each leg's actual departure time.
- year: if shown in the document use it exactly. If missing, current year is ${year}. Use next year (${parseInt(year) + 1}) only if the date is already in the past relative to today (${today}).
- route: "DEP_IATA-ARR_IATA" using 3-letter IATA airport codes (e.g. "BLQ-IST"). Derive from city/airport names if codes not shown.
- details: "FLIGHTCODE HH:MM/HH:MM" — departure time / arrival time of that leg (e.g. "TK1322 10:30/14:10"). Use just the code if times are missing.
- Extract EVERY flight leg separately, including each connection in multi-city itineraries.
- hotels checkOut: the LAST NIGHT of stay (NOT the departure day). E.g. if guest departs 22 March, checkOut = "${year}-03-21".
- Train/ferry bookings: include as flights with appropriate route and details.
- Return valid JSON only. Empty arrays if nothing found.`;
}

router.post('/', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Nessun file caricato' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, message: 'ANTHROPIC_API_KEY non configurata' });
  }

  const { buffer, mimetype } = req.file;
  const base64 = buffer.toString('base64');

  // Build message content based on file type
  let contentBlock: any;
  if (mimetype === 'application/pdf') {
    contentBlock = {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    };
  } else if (['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'].includes(mimetype)) {
    const imageType = mimetype === 'image/jpg' ? 'image/jpeg' : mimetype;
    contentBlock = {
      type: 'image',
      source: { type: 'base64', media_type: imageType, data: base64 },
    };
  } else {
    return res.status(400).json({ success: false, message: `Tipo file non supportato: ${mimetype}. Usa PDF, JPG, PNG o WEBP.` });
  }

  // Try models in order until one works (API key may not have access to all models)
  const MODELS = [
    'claude-opus-4-5',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-haiku-20240307',
  ];

  try {
    const client = new Anthropic({ apiKey });
    let response: any = null;
    let lastError: any = null;
    for (const model of MODELS) {
      try {
        response = await client.messages.create({
          model,
          max_tokens: 2048,
          messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: buildPrompt() }] }],
        });
        console.log(`parse-booking: used model ${model}`);
        break;
      } catch (modelErr: any) {
        lastError = modelErr;
        if (modelErr?.status === 404 || modelErr?.error?.error?.type === 'not_found_error') {
          console.warn(`Model ${model} not available, trying next...`);
          continue;
        }
        throw modelErr; // non-404 error → propagate immediately
      }
    }
    if (!response) throw lastError;

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Strip markdown code fences if model added them anyway
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('AI response did not contain JSON:', text.substring(0, 500));
      return res.status(500).json({ success: false, message: 'Risposta AI non valida' });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return res.json({ success: true, data: parsed });
  } catch (err: any) {
    console.error('parse-booking error:', err);
    return res.status(500).json({ success: false, message: 'Errore AI: ' + (err?.message || String(err)) });
  }
});

export default router;
