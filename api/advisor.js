import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getProducts, getSettings } from "../lib/db.js";
import { send, body, str, num } from "../lib/http.js";

// POST /api/advisor { answers } -> { slug, size, reasons, tip, by:"ia" }
// Sin ANTHROPIC_API_KEY responde 204 y la página usa sus reglas internas.
const Recommendation = z.object({
  slug: z.string(),
  size: z.string(),
  reasons: z.array(z.string()),
  tip: z.string(),
});

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  if (!process.env.ANTHROPIC_API_KEY) { res.statusCode = 204; return res.end(); }
  const a = body(req).answers || {};
  try {
    const [products, settings] = await Promise.all([getProducts(), getSettings()]);
    const active = products.filter(p => p.status !== "borrador");
    const catalog = active.map(p => ({
      slug: p.slug, name: p.name, firmeza: p.firm?.text, nivel: p.firm?.level, chips: p.chips,
      ficha: (p.specs || []).map(s => `${s.k}: ${s.v}`),
      medidas: (p.sizes || []).filter(s => s.stock !== 0).map(s => ({ name: s.name, dims: s.dims, precio: s.price })),
    }));
    const customer = {
      peso_kg: num(a.weight) || null, medida: str(a.size, 60) || "no sabe", posicion: str(a.pos, 40), molestia: str(a.pain, 40),
      sensacion_preferida: str(a.firm, 40), duerme: str(a.who, 40), presupuesto_cop: num(a.budget) || "sin límite", notas: str(a.notes, 400),
    };
    const prompt = `Eres el asesor de descanso de ${settings?.storeName || "Punto del Colchón"}, una tienda de colchones en Bucaramanga, Colombia. Recomienda UN colchón del catálogo para este cliente. Usa solo datos del catálogo; no inventes características ni precios. Escribe en español de Colombia, claro y cálido, sin prometer beneficios médicos.

CATÁLOGO:
${JSON.stringify(catalog)}

CLIENTE:
${JSON.stringify(customer)}

Devuelve: slug (uno del catálogo), size (nombre exacto de una medida de ese colchón), reasons (2 o 3 frases cortas que expliquen por qué le sirve) y tip (un consejo corto).`;

    const client = new Anthropic();
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(Recommendation) },
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) { res.statusCode = 204; return res.end(); }
    const r = response.parsed_output;
    if (!active.some(p => p.slug === r.slug)) { res.statusCode = 204; return res.end(); }
    send(res, 200, { slug: r.slug, size: r.size, reasons: r.reasons.slice(0, 3), tip: r.tip, by: "ia" });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.warn("Asesor IA: límite de uso");
    else if (e instanceof Anthropic.APIError) console.error("Asesor IA:", e.status, e.message);
    else console.error(e);
    res.statusCode = 204; res.end();
  }
}
