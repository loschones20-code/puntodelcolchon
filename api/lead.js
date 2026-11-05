import { sql } from "../lib/db.js";
import { send, body, str, num, rid } from "../lib/http.js";

// POST /api/lead  { answers:{...}, suggestion:{...} }  -> guarda la consulta del asesor
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  const b = body(req), a = b.answers || {}, s = b.suggestion || {};
  // Completar un registro ya creado: nombre, WhatsApp o "abrió WhatsApp"
  if (b.id && b.patch) {
    try {
      const id = str(b.id, 40), p = b.patch || {};
      const rows = await sql`select data from leads where id = ${id}`;
      if (!rows[0]) return send(res, 404, { error: "No existe" });
      const d = rows[0].data;
      if (p.name !== undefined) d.answers.name = str(p.name, 60);
      if (p.phone !== undefined) d.answers.phone = str(p.phone, 30);
      if (p.wa) d.wa = true;
      if (p.suggestion) d.suggestion = { ...d.suggestion, slug: str(p.suggestion.slug, 60), name: str(p.suggestion.name, 60), size: str(p.suggestion.size, 40), price: num(p.suggestion.price), reasons: (Array.isArray(p.suggestion.reasons) ? p.suggestion.reasons : []).slice(0, 3).map(r => str(r, 300)), by: p.suggestion.by === "ia" ? "ia" : "reglas" };
      await sql`update leads set data = ${JSON.stringify(d)} where id = ${id}`;
      return send(res, 200, { id });
    } catch (e) { console.error(e); return send(res, 500, { error: "No se pudo actualizar" }); }
  }
  const lead = {
    id: rid(), at: new Date().toISOString(),
    answers: { name: str(a.name, 60), phone: str(a.phone, 30), weight: num(a.weight) || null, size: str(a.size, 60), pos: str(a.pos, 40), pain: str(a.pain, 40), firm: str(a.firm, 40), who: str(a.who, 40), budget: num(a.budget) || null, notes: str(a.notes, 400) },
    wa: !!b.wa,
    suggestion: { slug: str(s.slug, 60), name: str(s.name, 60), size: str(s.size, 40), price: num(s.price), reasons: (Array.isArray(s.reasons) ? s.reasons : []).slice(0, 3).map(r => str(r, 300)), by: s.by === "ia" ? "ia" : "reglas" }
  };
  try {
    await sql`insert into leads (id, data, created_at) values (${lead.id}, ${JSON.stringify(lead)}, now())`;
    send(res, 200, { id: lead.id });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "No se pudo guardar" });
  }
}
