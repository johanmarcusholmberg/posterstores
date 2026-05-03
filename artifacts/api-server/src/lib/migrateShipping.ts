import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function migrateShipping(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS shipping_methods (
        id SERIAL PRIMARY KEY,
        store_key TEXT NOT NULL DEFAULT 'postsofspain',
        name TEXT NOT NULL,
        description TEXT,
        courier_name TEXT,
        delivery_estimate TEXT,
        price NUMERIC(10,2) NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'EUR',
        supported_countries TEXT[],
        active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    const addColumnIfMissing = async (table: string, column: string, type: string) => {
      const res = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
        [table, column]
      );
      if (res.rows.length === 0) {
        await client.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        logger.info(`Added column ${column} to ${table}`);
      }
    };

    await addColumnIfMissing("orders", "customer_phone", "TEXT");
    await addColumnIfMissing("orders", "selected_shipping_method_id", "INTEGER");
    await addColumnIfMissing("orders", "selected_shipping_method_name", "TEXT");
    await addColumnIfMissing("orders", "selected_shipping_method_courier", "TEXT");
    await addColumnIfMissing("orders", "selected_shipping_method_estimate", "TEXT");

    const existing = await client.query("SELECT COUNT(*) FROM shipping_methods");
    if (Number(existing.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO shipping_methods (store_key, name, description, courier_name, delivery_estimate, price, currency, sort_order)
        VALUES
          ('postsofspain', 'Standard Shipping', 'Tracked standard delivery', 'Standard Post', '5–10 business days', 4.95, 'EUR', 0),
          ('postsofspain', 'Express Shipping', 'Priority tracked delivery', 'Express Courier', '2–4 business days', 9.95, 'EUR', 1)
      `);
      logger.info("Seeded default shipping methods");
    }

    logger.info("Shipping migration completed");
  } catch (err) {
    logger.error({ err }, "Shipping migration failed");
  } finally {
    client.release();
  }
}
