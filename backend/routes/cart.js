const express = require("express");
const { all, get, run } = require("../db");

const router = express.Router();

async function ensureCart(clientId) {
  let cart = await get("SELECT id, client_id FROM carts WHERE client_id = ?", [clientId]);
  if (!cart) {
    const result = await run("INSERT INTO carts (client_id) VALUES (?)", [clientId]);
    cart = { id: result.lastID, client_id: clientId };
  }
  return cart;
}

router.get("/cart/:clientId", async (req, res) => {
  try {
    const clientId = String(req.params.clientId || "").trim();
    if (!clientId) {
      return res.status(400).json({ error: "clientId invalido." });
    }

    const cart = await ensureCart(clientId);
    const items = await all(
      `
      SELECT
        ci.id,
        ci.product_id,
        ci.quantity,
        p.name,
        p.price,
        p.image_url
      FROM cart_items ci
      INNER JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ?
      ORDER BY ci.id DESC
    `,
      [cart.id]
    );

    const total = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    return res.json({ cartId: cart.id, clientId, items, total });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao carregar carrinho." });
  }
});

router.put("/cart/:clientId", async (req, res) => {
  try {
    const clientId = String(req.params.clientId || "").trim();
    const incomingItems = Array.isArray(req.body.items) ? req.body.items : [];

    if (!clientId) {
      return res.status(400).json({ error: "clientId invalido." });
    }

    const sanitizedItems = incomingItems
      .map((item) => ({
        product_id: Number(item.product_id),
        quantity: Math.max(1, Number(item.quantity) || 1)
      }))
      .filter((item) => Number.isFinite(item.product_id) && item.product_id > 0);

    const cart = await ensureCart(clientId);
    await run("DELETE FROM cart_items WHERE cart_id = ?", [cart.id]);

    for (const item of sanitizedItems) {
      const product = await get("SELECT id FROM products WHERE id = ?", [item.product_id]);
      if (product) {
        await run(
          "INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)",
          [cart.id, item.product_id, item.quantity]
        );
      }
    }

    await run("UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [cart.id]);

    const items = await all(
      `
      SELECT
        ci.id,
        ci.product_id,
        ci.quantity,
        p.name,
        p.price,
        p.image_url
      FROM cart_items ci
      INNER JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ?
      ORDER BY ci.id DESC
    `,
      [cart.id]
    );

    const total = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    return res.json({ cartId: cart.id, clientId, items, total });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao salvar carrinho." });
  }
});

module.exports = router;
