# Punto del Colchón

Tienda en línea de **Punto del Colchón** (Bucaramanga): catálogo de colchones (Támesis, Orion, Sueño Flex), asesor de descanso, carrito con códigos de descuento, pedidos por WhatsApp y un panel para el dueño.

- **Tienda:** `/`, y cada colchón en `/#tamesis`, `/#orion`, `/#sueno-flex`
- **Panel del dueño:** `/#dashboard` (pide la contraseña `ADMIN_PASSWORD`)

## Cómo está hecha

| Parte | Dónde |
|---|---|
| Página (HTML, CSS y JS sin framework) | `public/index.html`, imágenes en `public/img/` |
| API (funciones de Vercel, Node) | `api/` |
| Base de datos | Postgres en [Neon](https://neon.tech), conexión en `lib/db.js` |
| Esquema y catálogo inicial | `scripts/setup-db.mjs`, `data/seed.json` |

### API

| Ruta | Para qué |
|---|---|
| `GET /api/store` | Ajustes de la tienda y productos activos |
| `GET /api/store?code=XXX` | Valida un código de descuento |
| `POST /api/order` | Guarda un pedido (los precios se recalculan en el servidor) |
| `POST /api/lead` | Guarda una consulta del asesor |
| `POST /api/advisor` | Sugerencia con IA de Claude (si hay `ANTHROPIC_API_KEY`; si no, la página usa reglas) |
| `GET /api/img?id=` | Imágenes subidas desde el panel |
| `/api/admin?action=…` | Inicio de sesión y todo lo del panel (productos, precios, inventario, pedidos, descuentos, paleta, ajustes, subir imágenes) |

## Variables de entorno

Copia `.env.example` y llena los valores (en Vercel: *Settings → Environment Variables*).

| Variable | Obligatoria | Qué es |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión de Neon |
| `ADMIN_PASSWORD` | Sí | Contraseña del panel del dueño |
| `SESSION_SECRET` | Sí | Texto aleatorio largo para firmar la sesión |
| `ANTHROPIC_API_KEY` | No | Activa el asesor con IA |

## Puesta en marcha

```bash
npm install
DATABASE_URL="postgresql://..." npm run setup-db   # crea tablas y carga los 3 colchones
vercel dev                                         # prueba local
vercel deploy --prod                               # publica
```

`setup-db` no borra nada: si ya hay productos, no los toca.
