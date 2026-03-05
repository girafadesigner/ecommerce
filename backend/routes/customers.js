const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { get, run, all } = require("../db");
const { generateToken, requireCustomer } = require("../middleware/auth");
const { sendRecoveryCode } = require("../utils/notifier");

const router = express.Router();
const RESET_EXPIRATION_MINUTES = 15;

function createRecoveryCode() {
  return String(crypto.randomInt(0, 999999)).padStart(6, "0");
}

function normalizePhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  return digits;
}

router.post("/customers/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");

    if (!name || !email || phone.length < 10 || password.length < 6) {
      return res.status(400).json({ error: "Informe nome, email, telefone e senha (minimo 6)." });
    }

    const exists = await get("SELECT id FROM customers WHERE email = ?", [email]);
    if (exists) {
      return res.status(409).json({ error: "Ja existe cadastro com este email." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await run(
      "INSERT INTO customers (name, email, phone, password_hash) VALUES (?, ?, ?, ?)",
      [name, email, phone, passwordHash]
    );

    const token = generateToken({ id: result.lastID, email, role: "customer" });
    return res.status(201).json({
      token,
      customer: { id: result.lastID, name, email, phone }
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao cadastrar cliente." });
  }
});

router.post("/customers/login", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Informe email e senha." });
    }

    const customer = await get("SELECT * FROM customers WHERE email = ?", [email]);
    if (!customer) {
      return res.status(401).json({ error: "Credenciais invalidas." });
    }

    const validPassword = await bcrypt.compare(password, customer.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Credenciais invalidas." });
    }

    const token = generateToken({ id: customer.id, email: customer.email, role: "customer" });
    return res.json({
      token,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone
      }
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao realizar login do cliente." });
  }
});

router.get("/customers/me", requireCustomer, async (req, res) => {
  try {
    const customer = await get("SELECT id, name, email, phone, created_at FROM customers WHERE id = ?", [
      req.auth.id
    ]);
    if (!customer) {
      return res.status(404).json({ error: "Cliente nao encontrado." });
    }
    return res.json(customer);
  } catch (error) {
    return res.status(500).json({ error: "Erro ao carregar perfil do cliente." });
  }
});

router.get("/customers/orders", requireCustomer, async (req, res) => {
  try {
    const limitParam = Number(req.query.limit || 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 30) : 10;
    const customerEmail = String(req.auth.email || "")
      .trim()
      .toLowerCase();

    const orders = await all(
      `
      SELECT
        o.id,
        o.total,
        o.status,
        o.production_status,
        o.payment_status,
        o.created_at
      FROM orders o
      WHERE o.customer_id = ?
         OR (LOWER(COALESCE(o.customer_email, '')) = ?)
      ORDER BY o.created_at DESC
      LIMIT ?
    `,
      [req.auth.id, customerEmail, limit]
    );

    const result = [];
    for (const order of orders) {
      const items = await all(
        `
        SELECT
          oi.product_id,
          p.name AS product_name,
          oi.quantity,
          oi.unit_price
        FROM order_items oi
        INNER JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = ?
        ORDER BY oi.id ASC
      `,
        [order.id]
      );

      result.push({
        ...order,
        items
      });
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: "Erro ao carregar historico de compras." });
  }
});

router.post("/customers/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const channel = String(req.body.channel || "email").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ error: "Informe o email." });
    }

    if (channel !== "email") {
      return res.status(400).json({ error: "Somente o canal email esta habilitado no momento." });
    }

    const customer = await get("SELECT id, name, email, phone FROM customers WHERE email = ?", [email]);
    const genericResponse = {
      message: "Se o email existir, um codigo de recuperacao foi gerado."
    };

    if (!customer) {
      return res.json(genericResponse);
    }

    const code = createRecoveryCode();
    await run("UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE user_type = ? AND user_id = ? AND used_at IS NULL", [
      "customer",
      customer.id
    ]);
    await run(
      `
      INSERT INTO password_resets (user_type, user_id, email, code, expires_at)
      VALUES (?, ?, ?, ?, datetime('now', ?))
    `,
      ["customer", customer.id, customer.email, code, `+${RESET_EXPIRATION_MINUTES} minutes`]
    );

    const delivery = await sendRecoveryCode({
      channel,
      email: customer.email,
      phone: customer.phone,
      code,
      name: customer.name
    });

    return res.json({
      ...genericResponse,
      channel: delivery.channel,
      destination: delivery.destination,
      expiresInMinutes: RESET_EXPIRATION_MINUTES
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Erro ao iniciar recuperacao de senha." });
  }
});

router.post("/customers/reset-password", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const code = String(req.body.code || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (!email || !code || newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "Informe email, codigo e nova senha (minimo 6 caracteres)." });
    }

    const customer = await get("SELECT id FROM customers WHERE email = ?", [email]);
    if (!customer) {
      return res.status(400).json({ error: "Codigo invalido ou expirado." });
    }

    const resetRow = await get(
      `
      SELECT id, code
      FROM password_resets
      WHERE user_type = 'customer'
        AND user_id = ?
        AND email = ?
        AND used_at IS NULL
        AND expires_at >= datetime('now')
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [customer.id, email]
    );

    if (!resetRow || resetRow.code !== code) {
      return res.status(400).json({ error: "Codigo invalido ou expirado." });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await run("UPDATE customers SET password_hash = ? WHERE id = ?", [hash, customer.id]);
    await run("UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = ?", [resetRow.id]);

    return res.json({ message: "Senha redefinida com sucesso." });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao redefinir senha." });
  }
});

module.exports = router;
