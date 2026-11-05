// Crea las tablas en Neon y carga el catálogo inicial si la base está vacía.
// Uso: DATABASE_URL="postgresql://..." npm run setup-db
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("Falta DATABASE_URL"); process.exit(1); }
const sql = neon(url);

await sql`create table if not exists products (slug text primary key, data jsonb not null, updated_at timestamptz default now())`;
await sql`create table if not exists settings (id text primary key, data jsonb not null)`;
await sql`create table if not exists discounts (code text primary key, data jsonb not null)`;
await sql`create table if not exists orders (id text primary key, data jsonb not null, status text not null default 'nuevo', created_at timestamptz default now())`;
await sql`create table if not exists leads (id text primary key, data jsonb not null, created_at timestamptz default now())`;
await sql`create table if not exists images (id text primary key, content_type text not null, data bytea not null, created_at timestamptz default now())`;
await sql`create index if not exists orders_created on orders (created_at desc)`;
await sql`create index if not exists leads_created on leads (created_at desc)`;

const seed = JSON.parse(readFileSync(new URL("../data/seed.json", import.meta.url), "utf8"));
const [{ count }] = await sql`select count(*)::int as count from products`;
if (count === 0) {
  for (const p of seed.products) await sql`insert into products (slug, data) values (${p.slug}, ${JSON.stringify(p)})`;
  console.log(`Productos cargados: ${seed.products.length}`);
} else {
  console.log(`La tabla products ya tiene ${count} productos; no se tocan.`);
}
await sql`insert into settings (id, data) values ('store', ${JSON.stringify(seed.settings)}) on conflict (id) do nothing`;
console.log("Base de datos lista.");
