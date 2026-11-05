import { sql, getProducts, getSettings } from "../lib/db.js";
import { send, body, str, num, rid } from "../lib/http.js";
import { isAdmin, checkPassword, sessionCookie, clearCookie } from "../lib/auth.js";

const STATUSES = ["nuevo", "confirmado", "entregado", "cancelado"];
const RESERVED = ["dashboard", "asesor", "comparar", "reviews"];
const slugify = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

// Todo lo del panel del dueño pasa por aquí: /api/admin?action=...
export default async function handler(req, res) {
  const action = String(req.query.action || "");
  try {
    if (action === "login" && req.method === "POST") {
      await new Promise(r => setTimeout(r, 400)); // frena intentos repetidos
      if (!checkPassword(body(req).password)) return send(res, 401, { error: "Contraseña incorrecta" });
      res.setHeader("Set-Cookie", sessionCookie());
      return send(res, 200, { ok: true });
    }
    if (action === "logout") { res.setHeader("Set-Cookie", clearCookie); return send(res, 200, { ok: true }); }
    if (action === "me") return send(res, 200, { admin: isAdmin(req) });

    if (!isAdmin(req)) return send(res, 401, { error: "Inicia sesión como dueño" });

    if (action === "data" && req.method === "GET") {
      const [products, settings, discounts, orders, leads, reviews] = await Promise.all([
        getProducts(), getSettings(),
        sql`select data from discounts order by code`,
        sql`select data, status from orders order by created_at desc limit 500`,
        sql`select data from leads order by created_at desc limit 500`,
        sql`select data, published from reviews order by created_at desc limit 500`,
      ]);
      return send(res, 200, {
        products, settings,
        discounts: discounts.map(r => r.data),
        orders: orders.map(r => ({ ...r.data, status: r.status })),
        leads: leads.map(r => r.data),
        reviews: reviews.map(r => ({ ...r.data, published: r.published })),
      });
    }

    if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
    const b = body(req);

    if (action === "saveProduct") {
      const p = b.product || {};
      const slug = slugify(p.slug || p.name);
      if (!slug || RESERVED.includes(slug)) return send(res, 400, { error: "Dirección web no válida" });
      if (b.isNew) {
        const exists = await sql`select 1 from products where slug = ${slug}`;
        if (exists.length) return send(res, 409, { error: "Ya existe un producto con esa dirección web" });
      }
      const clean = { ...p, slug, name: str(p.name, 80), order: num(p.order) || 1, status: p.status === "borrador" ? "borrador" : "activo" };
      delete clean._new;
      const json = JSON.stringify(clean);
      if (json.length > 200000) return send(res, 400, { error: "El producto es demasiado grande" });
      await sql`insert into products (slug, data, updated_at) values (${slug}, ${json}, now())
                on conflict (slug) do update set data = excluded.data, updated_at = now()`;
      return send(res, 200, { ok: true, slug });
    }
    if (action === "deleteProduct") {
      await sql`delete from products where slug = ${str(b.slug, 60)}`;
      return send(res, 200, { ok: true });
    }
    if (action === "saveSettings") {
      const cur = (await getSettings()) || {};
      const s = b.settings || {};
      const next = { ...cur };
      if (s.storeName !== undefined) next.storeName = str(s.storeName, 80) || "Punto del Colchón";
      if (s.whatsapp !== undefined) next.whatsapp = String(s.whatsapp).replace(/\D/g, "").slice(0, 15);
      if (s.announcement !== undefined) next.announcement = str(s.announcement, 200);
      if (s.pillow !== undefined) next.pillow = { name: str(s.pillow.name, 80), price: num(s.pillow.price) };
      if (s.palette !== undefined) {
        const hex = v => /^#[0-9a-f]{6}$/i.test(v) ? v : null;
        next.palette = { ...(cur.palette || {}) };
        for (const k of ["brand", "accent", "sale", "bar"]) if (hex(s.palette[k])) next.palette[k] = s.palette[k];
      }
      await sql`insert into settings (id, data) values ('store', ${JSON.stringify(next)})
                on conflict (id) do update set data = excluded.data`;
      return send(res, 200, { ok: true, settings: next });
    }
    if (action === "saveDiscount") {
      const code = String(b.code || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 30);
      const pct = Math.max(1, Math.min(90, Math.round(num(b.pct))));
      if (!code) return send(res, 400, { error: "Código no válido" });
      const d = { code, pct, active: b.active !== false };
      await sql`insert into discounts (code, data) values (${code}, ${JSON.stringify(d)})
                on conflict (code) do update set data = excluded.data`;
      return send(res, 200, { ok: true });
    }
    if (action === "deleteDiscount") {
      await sql`delete from discounts where code = ${str(b.code, 30)}`;
      return send(res, 200, { ok: true });
    }
    if (action === "orderStatus") {
      if (!STATUSES.includes(b.status)) return send(res, 400, { error: "Estado no válido" });
      await sql`update orders set status = ${b.status} where id = ${str(b.id, 40)}`;
      return send(res, 200, { ok: true });
    }
    if (action === "saveReview") {
      const r = b.review || {};
      const stars = Math.max(1, Math.min(5, Math.round(num(r.stars))));
      const name = str(r.name, 60), text = str(r.text, 1200);
      if (!name || !text) return send(res, 400, { error: "Escribe el nombre y el comentario" });
      const date = /^d{4}-d{2}-d{2}$/.test(String(r.date || "")) ? r.date : new Date().toISOString().slice(0, 10);
      const id = /^[a-z0-9]{6,40}$/.test(String(r.id || "")) ? r.id : rid();
      const review = { id, name, city: str(r.city, 60), product: str(r.product, 60), stars, title: str(r.title, 100), text, date, source: str(r.source, 30) };
      const published = r.published !== false;
      await sql`insert into reviews (id, data, published, created_at) values (${id}, ${JSON.stringify(review)}, ${published}, now())
                on conflict (id) do update set data = excluded.data, published = excluded.published`;
      return send(res, 200, { ok: true, id });
    }
    if (action === "deleteReview") {
      await sql`delete from reviews where id = ${str(b.id, 40)}`;
      return send(res, 200, { ok: true });
    }
    if (action === "uploadImage") {
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(b.dataUrl || ""));
      if (!m) return send(res, 400, { error: "Usa una imagen JPG, PNG o WebP" });
      const buf = Buffer.from(m[2], "base64");
      if (buf.length > 3 * 1024 * 1024) return send(res, 413, { error: "La imagen es muy pesada" });
      const id = rid();
      await sql`insert into images (id, content_type, data, created_at) values (${id}, ${m[1]}, ${buf}, now())`;
      return send(res, 200, { url: `/api/img?id=${id}` });
    }
    send(res, 400, { error: "Acción desconocida" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "Error del servidor" });
  }
}
