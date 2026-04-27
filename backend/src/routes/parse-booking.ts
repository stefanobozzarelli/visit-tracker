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

const PARSE_PROMPT = `You are a travel booking data extractor. Analyze this document (booking confirmation, e-ticket, screenshot, or photo) and extract ALL flight segments and hotel bookings.

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
- date: flight departure date as YYYY-MM-DD. If year is missing infer it from context (nearest future date). null if truly not determinable.
- route: "DEP_IATA-ARR_IATA" using 3-letter IATA airport codes (e.g. "BLQ-IST"). If IATA codes are not shown, derive them from city/airport names.
- details: "FLIGHTCODE HH:MM/HH:MM" where HH:MM is departure/arrival time (e.g. "TK1322 10:30/15:50"). If times are missing use just the flight code.
- Extract EVERY flight leg including connections in multi-city itineraries.
- hotels checkOut: the LAST NIGHT of stay (NOT the day of departure). E.g. if guest departs 22 March, checkOut = "2026-03-21".
- If you see train or ferry bookings, include them as flights with route and details (e.g. details: "Trenitalia FR9604 08:00/10:30").
- Return valid JSON only. Empty arrays if nothing found.`;

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

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [contentBlock, { type: 'text', text: PARSE_PROMPT }],
      }],
    });

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
