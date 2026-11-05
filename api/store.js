import { sql, getProducts, getSettings } from "../lib/db.js";
import { send, str } from "../lib/http.js";

// GET /api/store            -> configuración y productos activos
// GET /api/store?code=XXXX  -> valida un código de descuento
export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Método no permitido" });
  try {
    if (req.query.code) {
      const code = str(req.query.code, 40).toUpperCase();
      const rows = await sql`select data from discounts where code = ${code}`;
      const d = rows[0]?.data;
      if (!d || d.active === false) return send(res, 404, { error: "Código no válido" });
      return send(res, 200, { code: d.code, pct: d.pct });
    }
    const [settings, products, reviews] = await Promise.all([getSettings(), getProducts(), sql`select data from reviews where published order by (data->>${"date"}) desc nulls last, created_at desc limit 200`]);
    res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ settings, products: products.filter(p => p.status !== "borrador"), reviews: reviews.map(r => r.data) }));
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "No se pudo leer la tienda" });
  }
}
