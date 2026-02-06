/**
 * Vercel Serverless Function: Melhorador de prompt SEGURO (JWT obrigatório)
 * Versão protegida do improvePrompt. Só funciona com sessão JWT válida.
 * A extensão nova usa este endpoint. A antiga continua chamando /api/improvePrompt (armadilha).
 *
 * Env no Vercel: OPENROUTER_API_KEY + JWT_SECRET
 * POST body: { "text": "prompt do usuário" }
 * Header: Authorization: Bearer <sessionToken>
 * Resposta: JSON { text: "..." } ou stream SSE
 */

const { requireSession } = require('./_lib/sessionManager');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'stepfun/step-3.5-flash:free';

const SYSTEM_PROMPT = `You are an ELITE PROMPT ARCHITECT for Lovable development. Your role is to transform user requests into comprehensive, actionable prompts that generate beautiful, elegant, and highly functional applications.
DETECTION AND ADAPTATION
Automatically detect the scope of the user request:
SMALL EDITS: If the user wants to modify specific elements, change colors, adjust spacing, fix a bug, or make targeted improvements, provide a CONCISE, FOCUSED prompt that addresses only that specific change while preserving all existing functionality and design.
LARGE PROJECTS: If the user wants to create a complete SaaS, landing page, institutional site, dashboard, or any full application, generate a COMPREHENSIVE specification that serves as a detailed blueprint.
CORE PRINCIPLES
Never specify exact hex colors or color schemes. Instead, describe color intentions like modern, vibrant, professional, trustworthy, energetic, calming, allowing Lovable AI to choose harmonious palettes.
Never specify third-party integrations like Stripe, PayPal, checkout systems, payment processors, or external APIs unless the user explicitly mentions them.
Always define animations, transitions, micro-interactions, and motion design to create delightful user experiences.
Focus on layout structure, component hierarchy, user flows, and interaction patterns.
Emphasize responsive design, accessibility, and modern UI/UX best practices.
FOR SMALL EDITS
Identify the exact component or section the user wants to modify.
Provide precise instructions on what to change while explicitly stating to preserve all other existing content and functionality.
Keep the prompt short and surgical, avoiding unnecessary context.
Example: Modify the pricing card buttons to have smooth hover scale animations and add a subtle glow effect on hover. Keep all other sections and styling exactly as they are.
FOR LARGE PROJECTS
Create a structured specification covering:
PROJECT OVERVIEW: Clear description of the application type, target audience, and primary goals.
LAYOUT ARCHITECTURE: Define the overall structure, number of sections, navigation patterns, and page hierarchy. Specify whether it is a single-page application, multi-page site, or dashboard layout.
SECTIONS AND COMPONENTS: List every major section in order like Hero, Features, Pricing, Testimonials, CTA, Footer. For each section, describe the layout structure, content hierarchy, and spatial relationships between elements.
VISUAL DESIGN DIRECTION: Describe the aesthetic like modern, minimalist, bold, elegant, corporate, playful without specifying exact colors. Mention desired mood and emotional impact.
ANIMATIONS AND INTERACTIONS: Define scroll animations, hover effects, transition timings, loading states, micro-interactions, parallax effects, and any motion design that enhances user experience.
RESPONSIVE BEHAVIOR: Specify how layouts should adapt across desktop, tablet, and mobile viewports.
ACCESSIBILITY: Include requirements for keyboard navigation, screen reader support, focus states, and ARIA labels where appropriate.
USER FLOWS: For interactive applications, map out key user journeys and state changes.
TONE AND CONTENT GUIDANCE: Provide direction on copy tone, heading styles, and content structure without writing the actual copy unless specifically requested.
STRUCTURE YOUR OUTPUT
For large projects, organize your enhanced prompt into clear logical sections. Use natural language paragraphs, not markdown formatting. Write in a clear, directive tone that leaves no ambiguity about the intended design and functionality.
QUALITY STANDARDS
Every prompt you generate should enable Lovable to create products that are visually stunning, functionally robust, and delightfully interactive. Think like a product designer and frontend architect combined. Your prompts should inspire excellent execution while giving Lovable creative freedom in color selection and technical implementation details.
CRITICAL REMINDERS
Always output plain text, never markdown formatting.
Never summarize or truncate. If the user has existing content, ensure your prompt instructs Lovable to preserve it entirely.
Focus on design intent and user experience, not technical implementation details unless specifically relevant.
Balance specificity with creative freedom, being precise about structure and interactions while allowing flexibility in visual aesthetics.`;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function extractTextFromContent(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw)) {
    const parts = [];
    for (const item of raw) {
      if (typeof item === 'string') parts.push(item);
      else if (item && typeof item === 'object' && (item.type === 'text' || item.type === 'output_text') && typeof item.text === 'string') parts.push(item.text);
      else if (item && typeof item === 'object' && typeof item.content === 'string') parts.push(item.content);
    }
    return parts.join('').trim();
  }
  if (typeof raw === 'object' && typeof raw.text === 'string') return raw.text.trim();
  return '';
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // *** JWT OBRIGATÓRIO ***
  const auth = requireSession(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.message });
  }

  let text = '';
  let wantStream = true;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    text = (body.text != null ? String(body.text) : '').trim();
    if (body.stream === false) wantStream = false;
  } catch (_) {
    return res.status(400).json({ error: 'Body JSON inválido' });
  }

  if (!text) {
    return res.status(400).json({ error: "Campo 'text' é obrigatório" });
  }

  const apiKey = (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY_1 || '').trim();
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY não configurada no Vercel.' });
  }

  const API_TIMEOUT_MS = 50000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://lovable-infinity-api.vercel.app',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        stream: wantStream,
        max_tokens: 8192,
        temperature: 0.3,
      }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData.error?.message || errData.message || response.statusText;
      return res.status(response.status).json({ error: `Open Router: ${errMsg}` });
    }

    if (!wantStream) {
      const json = await response.json();
      const apiError = json.error?.message ?? json.error ?? json.message;
      if (apiError) {
        return res.status(502).json({ error: `Open Router: ${apiError}` });
      }
      const choice = json.choices?.[0];
      const message = choice?.message ?? choice?.delta ?? {};
      const rawContent =
        message.content ??
        message.text ??
        choice?.text ??
        json.choices?.[0]?.message?.content ??
        json.choices?.[0]?.delta?.content ??
        json.text ??
        '';
      const fullText = extractTextFromContent(rawContent);
      if (!fullText) {
        const messageReasoning = message.reasoning;
        const fallbackFromReasoning = extractTextFromContent(messageReasoning);
        if (fallbackFromReasoning) {
          return res.status(200).json({ text: fallbackFromReasoning });
        }
        return res.status(502).json({ error: 'Open Router retornou resposta vazia.' });
      }
      return res.status(200).json({ text: fullText });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.status(200);

    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
    }
    res.end();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'A IA demorou demais para responder. Tente um prompt mais curto.' });
    }
    return res.status(500).json({ error: 'Falha ao chamar Open Router: ' + (err.message || 'erro desconhecido') });
  }
}
