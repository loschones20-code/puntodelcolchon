import { sql, getProducts, getSettings } from "../lib/db.js";
import { send, body, str, num, rid } from "../lib/http.js";

// POST /api/order  { items:[{slug,sizeId,qty}], pillow:n, code, customer:{...} }
// Recalcula precios en el servidor con los datos de la base, y guarda el pedido.
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  const b = body(req);
  try {
    const [products, settings] = await Promise.all([getProducts(), getSettings()]);
    const items = [];
    for (const it of (Array.isArray(b.items) ? b.items : []).slice(0, 20)) {
      const p = products.find(x => x.slug === it.slug && x.status !== "borrador");
      const s = p?.sizes?.find(x => x.id === it.sizeId);
      const qty = Math.max(1, Math.min(10, Math.round(num(it.qty))));
      if (p && s) items.push({ slug: p.slug, sizeId: s.id, name: `Colchón ${p.name} ${s.name} (${s.dims})`, qty, price: s.price });
    }
    const pillowQty = Math.max(0, Math.min(10, Math.round(num(b.pillow))));
    if (pillowQty && settings?.pillow?.price) items.push({ slug: null, name: settings.pillow.name, qty: pillowQty, price: settings.pillow.price });
    if (!items.length) return send(res, 400, { error: "El pedido está vacío" });

    const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
    let discount = null;
    if (b.code) {
      const code = str(b.code, 40).toUpperCase();
      const rows = await sql`select data from discounts where code = ${code}`;
      const d = rows[0]?.data;
      if (d && d.active !== false) discount = { code: d.code, pct: d.pct };
    }
    const total = subtotal - (discount ? Math.round(subtotal * discount.pct / 100) : 0);
    const c = b.customer || {};
    const order = {
      id: rid(), at: new Date().toISOString(), items, discount, subtotal, total,
      customer: { name: str(c.name, 80), phone: str(c.phone, 30), addr: str(c.addr, 160), city: str(c.city, 40), pay: str(c.pay, 40) }
    };
    await sql`insert into orders (id, data, status, created_at) values (${order.id}, ${JSON.stringify(order)}, 'nuevo', now())`;
    send(res, 200, { id: order.id, total });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "No se pudo guardar el pedido" });
  }
}
