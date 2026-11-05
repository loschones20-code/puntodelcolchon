import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getProducts, getSettings } from "../lib/db.js";
import { send, body, str } from "../lib/http.js";

// POST /api/chat { history:[{role,content}], answers:{...}, step }
// -> { reply, options[], recommend_slug, recommend_size, reasons[] }
// Sin ANTHROPIC_API_KEY responde 204 y el chat usa sus respuestas integradas.
const Turn = z.object({
  reply: z.string(),
  options: z.array(z.string()),
  recommend_slug: z.string(),
  recommend_size: z.string(),
  reasons: z.array(z.string()),
});

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  if (!process.env.ANTHROPIC_API_KEY) { res.statusCode = 204; return res.end(); }
  const b = body(req);
  const history = (Array.isArray(b.history) ? b.history : [])
    .filter(m => (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-16)
    .map(m => ({ role: m.role, content: str(m.content, 1200) }));
  if (!history.length || history[history.length - 1].role !== "user") return send(res, 400, { error: "Falta el mensaje" });

  try {
    const [products, settings] = await Promise.all([getProducts(), getSettings()]);
    const catalog = products.filter(p => p.status !== "borrador").map(p => ({
      slug: p.slug, name: p.name, resumen: p.eyebrow, firmeza: p.firm?.text, garantia: p.warranty?.join(" "), chips: p.chips,
      ficha: (p.specs || []).map(s => `${s.k}: ${s.v}`),
      medidas: (p.sizes || []).filter(s => s.stock !== 0).map(s => ({ name: s.name, dims: s.dims, precio: s.price })),
    }));
    const store = settings?.storeName || "Punto del Colchón";
    const brief = `Eres el asesor de descanso de ${store}, una tienda de colchones en Bucaramanga, Santander (Colombia). Conversas con un cliente en el chat de la página web.

Cómo responder:
- Español de Colombia, cálido y breve: máximo 3 frases cortas por mensaje.
- Usa solo los datos del catálogo y de la tienda. Si no sabes algo (inventario exacto, fechas, descuentos especiales), dilo y ofrece hablar con un asesor por WhatsApp.
- No prometas beneficios médicos.
- Si falta información para recomendar, haz UNA pregunta a la vez y ofrece de 2 a 4 respuestas cortas en "options" (máximo 5 palabras cada una). Si no hay pregunta, deja "options" vacío.
- Cuando ya sepas lo suficiente (cómo duerme, molestias, peso o preferencia de firmeza), o el cliente pida una recomendación, recomienda UN colchón: pon su slug en "recommend_slug", el nombre exacto de una medida en "recommend_size" y 2 o 3 razones cortas en "reasons". Si no recomiendas, deja esos campos vacíos.

Tienda: envíos en el área metropolitana de Bucaramanga en 24 a 48 horas (${settings?.announcement || ""}). Pagos contra entrega, transferencia o tarjeta de crédito en la tienda hasta 6 cuotas. Horario: lunes a sábado de 9:00 a 19:00.

Catálogo: ${JSON.stringify(catalog)}

Respuestas que el cliente ya dio con los botones: ${JSON.stringify(b.answers || {})}`;

    const client = new Anthropic();
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(Turn) },
      messages: [{ role: "user", content: brief }, ...history],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) { res.statusCode = 204; return res.end(); }
    const t = response.parsed_output;
    const valid = catalog.some(p => p.slug === t.recommend_slug);
    send(res, 200, {
      reply: t.reply,
      options: t.options.slice(0, 4).map(o => o.slice(0, 40)),
      recommend_slug: valid ? t.recommend_slug : "",
      recommend_size: valid ? t.recommend_size : "",
      reasons: valid ? t.reasons.slice(0, 3) : [],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.warn("Chat IA: límite de uso");
    else if (e instanceof Anthropic.APIError) console.error("Chat IA:", e.status, e.message);
    else console.error(e);
    res.statusCode = 204; res.end();
  }
}
