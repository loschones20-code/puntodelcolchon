import { sql } from "../lib/db.js";

// GET /api/img?id=xxx -> imagen de producto guardada en la base de datos
export default async function handler(req, res) {
  const id = String(req.query.id || "").slice(0, 40);
  try {
    const rows = await sql`select content_type, data from images where id = ${id}`;
    if (!rows[0]) { res.statusCode = 404; return res.end("No encontrada"); }
    res.statusCode = 200;
    res.setHeader("Content-Type", rows[0].content_type);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(Buffer.from(rows[0].data));
  } catch (e) {
    console.error(e);
    res.statusCode = 500; res.end("Error");
  }
}
