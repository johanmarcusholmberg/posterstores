import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";
import { adminLimiter } from "../middleware/rateLimiter";
import { z } from "zod";

const router = Router();

const ShippingMethodSchema = z.object({
  storeKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  courierName: z.string().optional().nullable(),
  deliveryEstimate: z.string().optional().nullable(),
  price: z.number().min(0),
  currency: z.string().default("EUR"),
  supportedCountries: z.array(z.string()).optional().nullable(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

function serializeMethod(row: any) {
  return {
    id: row.id,
    storeKey: row.store_key,
    name: row.name,
    description: row.description ?? null,
    courierName: row.courier_name ?? null,
    deliveryEstimate: row.delivery_estimate ?? null,
    price: Number(row.price),
    currency: row.currency,
    supportedCountries: row.supported_countries ?? null,
    active: row.active,
    sortOrder: row.sort_order,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  };
}

router.get("/shipping-methods", async (req, res) => {
  const storeKey = typeof req.query.storeKey === "string" ? req.query.storeKey : null;
  const country = typeof req.query.country === "string" ? req.query.country : null;

  const client = await pool.connect();
  try {
    let query = "SELECT * FROM shipping_methods WHERE active = TRUE";
    const params: any[] = [];

    if (storeKey) {
      params.push(storeKey);
      query += ` AND store_key = $${params.length}`;
    }

    query += " ORDER BY sort_order ASC, id ASC";

    const result = await client.query(query, params);

    let methods = result.rows.map(serializeMethod);

    if (country) {
      methods = methods.filter((m) => {
        if (!m.supportedCountries || m.supportedCountries.length === 0) return true;
        return m.supportedCountries.includes(country);
      });
    }

    return res.json(methods);
  } finally {
    client.release();
  }
});

router.get("/shipping-methods/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const client = await pool.connect();
  try {
    const result = await client.query("SELECT * FROM shipping_methods WHERE id = $1", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
    return res.json(serializeMethod(result.rows[0]));
  } finally {
    client.release();
  }
});

router.post("/admin/shipping-methods", requireAdmin, async (req, res) => {
  const parsed = ShippingMethodSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const d = parsed.data;
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO shipping_methods (store_key, name, description, courier_name, delivery_estimate, price, currency, supported_countries, active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [d.storeKey, d.name, d.description ?? null, d.courierName ?? null, d.deliveryEstimate ?? null,
       d.price, d.currency, d.supportedCountries ?? null, d.active, d.sortOrder]
    );
    return res.status(201).json(serializeMethod(result.rows[0]));
  } finally {
    client.release();
  }
});

router.put("/admin/shipping-methods/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = ShippingMethodSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const d = parsed.data;
  const client = await pool.connect();
  try {
    const sets: string[] = ["updated_at = NOW()"];
    const vals: any[] = [];

    const map: Record<string, string> = {
      storeKey: "store_key", name: "name", description: "description",
      courierName: "courier_name", deliveryEstimate: "delivery_estimate",
      price: "price", currency: "currency", supportedCountries: "supported_countries",
      active: "active", sortOrder: "sort_order",
    };

    for (const [key, col] of Object.entries(map)) {
      if ((d as any)[key] !== undefined) {
        vals.push((d as any)[key]);
        sets.push(`${col} = $${vals.length}`);
      }
    }

    vals.push(id);
    const result = await client.query(
      `UPDATE shipping_methods SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
    return res.json(serializeMethod(result.rows[0]));
  } finally {
    client.release();
  }
});

router.delete("/admin/shipping-methods/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const client = await pool.connect();
  try {
    await client.query("DELETE FROM shipping_methods WHERE id = $1", [id]);
    return res.status(204).send();
  } finally {
    client.release();
  }
});

export default router;
