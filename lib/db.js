import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL no está definida");
}

export const sql = neon(process.env.DATABASE_URL || "postgresql://invalid");

export async function getProducts() {
  const rows = await sql`select data from products order by (data->>'order')::int nulls last, slug`;
  return rows.map(r => r.data);
}

export async function getSettings() {
  const rows = await sql`select data from settings where id = 'store'`;
  return rows[0]?.data || null;
}
