const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const multer = require("multer");
const { all, get, run } = require("../db");
const { generateToken, requireAdmin } = require("../middleware/auth");
const { sendRecoveryCode } = require("../utils/notifier");

const router = express.Router();
const RESET_EXPIRATION_MINUTES = 15;
const ALLOWED_PRODUCTION_STATUSES = [
  "pendente",
  "em_producao",
  "pronto_entrega",
  "entregue",
  "cancelado"
];
const PENDING_ORDER_STATUSES = ["pendente"];
const PRODUCTION_ORDER_STATUSES = ["em_producao", "pronto_entrega"];
const ALLOWED_PAYMENT_STATUSES = ["pending", "paid", "refunded"];
const ALLOWED_PAYMENT_METHODS = ["pix", "cartao", "dinheiro"];
const ALLOWED_PAYMENT_TYPES = ["sinal", "parcial", "saldo_entrega"];
const MAX_UPLOAD_FILE_SIZE = Number(process.env.MAX_UPLOAD_FILE_SIZE || 2 * 1024 * 1024);
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml"
]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);

function inClausePlaceholders(values) {
  return values.map(() => "?").join(", ");
}

function createRecoveryCode() {
  return String(crypto.randomInt(0, 999999)).padStart(6, "0");
}

function normalizeSalesChannel(value) {
  const channel = String(value || "")
    .trim()
    .toLowerCase();
  const allowed = ["whatsapp", "instagram", "loja_fisica", "site", "outro"];
  return allowed.includes(channel) ? channel : "outro";
}

function normalizeProductionStatus(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");

  const aliases = {
    pending: "pendente",
    pendente: "pendente",
    pending_whatsapp: "pendente",
    paid_confirmed: "pendente",
    em_producao: "em_producao",
    in_producao: "em_producao",
    producao: "em_producao",
    inproduction: "em_producao",
    in_production: "em_producao",
    pendente_para_entrega: "pronto_entrega",
    pendente_entrega: "pronto_entrega",
    pending_delivery: "pronto_entrega",
    pronto_entrega: "pronto_entrega",
    entregue: "entregue",
    delivered: "entregue",
    desistido: "cancelado",
    abandoned: "cancelado",
    cancelado: "cancelado",
    cancelada: "cancelado",
    cancelled: "cancelado",
    erro_lancamento: "cancelado",
    erro_de_lancamento: "cancelado",
    launch_error: "cancelado",
    reembolso: "cancelado",
    reembolsado: "cancelado",
    refunded: "cancelado"
  };

  return aliases[normalized] || normalized;
}

function normalizePaymentStatus(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");

  const aliases = {
    pendente: "pending",
    pending: "pending",
    pago: "paid",
    paid: "paid",
    pago_confirmado: "paid",
    confirmado: "paid",
    reembolsado: "refunded",
    reembolso: "refunded",
    refunded: "refunded"
  };

  return aliases[normalized] || normalized;
}

function productionToLegacyStatus(productionStatus) {
  if (productionStatus === "em_producao") return "in_production";
  if (productionStatus === "pronto_entrega") return "pending_delivery";
  if (productionStatus === "entregue") return "delivered";
  if (productionStatus === "cancelado") return "cancelled";
  return "pending_whatsapp";
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, "..", "..", "assets", "uploads"));
  },
  filename: (_req, file, cb) => {
    const cleanName = file.originalname.replace(/\s+/g, "-");
    cb(null, `${Date.now()}-${cleanName}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_FILE_SIZE,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(String(file.originalname || "")).toLowerCase();
    if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype) && ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
      return cb(null, true);
    }
    return cb(new Error("Apenas imagens sao permitidas."));
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Informe usuario e senha." });
    }

    const admin = await get("SELECT * FROM admin_users WHERE username = ?", [username]);
    if (!admin) {
      return res.status(401).json({ error: "Credenciais invalidas." });
    }

    const validPassword = await bcrypt.compare(password, admin.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Credenciais invalidas." });
    }

    const token = generateToken({ id: admin.id, username: admin.username, role: "admin" });
    return res.json({
      token,
      user: { id: admin.id, username: admin.username }
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro no login admin." });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();
    const channel = String(req.body.channel || "email")
      .trim()
      .toLowerCase();

    if (channel !== "email") {
      return res.status(400).json({ error: "Recuperacao admin disponivel apenas por email." });
    }

    if (!username) {
      return res.status(400).json({ error: "Informe o usuario para recuperar a senha." });
    }

    const admin = await get("SELECT id, username FROM admin_users WHERE username = ?", [username]);
    const genericResponse = {
      message: "Se o usuario existir, um codigo de recuperacao foi gerado."
    };

    if (!admin) {
      return res.json(genericResponse);
    }

    const code = createRecoveryCode();
    await run(
      "UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE user_type = ? AND user_id = ? AND used_at IS NULL",
      ["admin", admin.id]
    );
    await run(
      `
      INSERT INTO password_resets (user_type, user_id, email, code, expires_at)
      VALUES (?, ?, ?, ?, datetime('now', ?))
    `,
      ["admin", admin.id, admin.username, code, `+${RESET_EXPIRATION_MINUTES} minutes`]
    );

    const delivery = await sendRecoveryCode({
      channel: "email",
      email: admin.username,
      code,
      name: "Administrador"
    });

    return res.json({
      ...genericResponse,
      channel: delivery.channel,
      destination: delivery.destination,
      expiresInMinutes: RESET_EXPIRATION_MINUTES
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Erro ao iniciar recuperacao de senha admin." });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();
    const code = String(req.body.code || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (!username || !code || newPassword.length < 6) {
      return res.status(400).json({
        error: "Informe usuario, codigo e nova senha (minimo 6 caracteres)."
      });
    }

    const admin = await get("SELECT id FROM admin_users WHERE username = ?", [username]);
    if (!admin) {
      return res.status(400).json({ error: "Codigo invalido ou expirado." });
    }

    const resetRow = await get(
      `
      SELECT id, code
      FROM password_resets
      WHERE user_type = 'admin'
        AND user_id = ?
        AND email = ?
        AND used_at IS NULL
        AND expires_at >= datetime('now')
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [admin.id, username]
    );

    if (!resetRow || resetRow.code !== code) {
      return res.status(400).json({ error: "Codigo invalido ou expirado." });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await run("UPDATE admin_users SET password_hash = ? WHERE id = ?", [hash, admin.id]);
    await run("UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = ?", [resetRow.id]);

    return res.json({ message: "Senha admin redefinida com sucesso." });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao redefinir senha admin." });
  }
});

router.post("/change-password", requireAdmin, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (!currentPassword || newPassword.length < 6) {
      return res.status(400).json({
        error: "Informe a senha atual e a nova senha (minimo 6 caracteres)."
      });
    }

    const admin = await get("SELECT id, password_hash FROM admin_users WHERE id = ?", [req.auth.id]);
    if (!admin) {
      return res.status(404).json({ error: "Usuario admin nao encontrado." });
    }

    const validCurrentPassword = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!validCurrentPassword) {
      return res.status(401).json({ error: "Senha atual incorreta." });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await run("UPDATE admin_users SET password_hash = ? WHERE id = ?", [hash, admin.id]);

    return res.json({ message: "Senha alterada com sucesso." });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao alterar senha admin." });
  }
});

router.get("/products", requireAdmin, async (_req, res) => {
  try {
    const products = await all(
      `
      SELECT p.id, p.name, p.description, p.price, p.cost_price, p.image_url, p.category_id, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY p.id DESC
    `
    );
    return res.json(products);
  } catch (error) {
    return res.status(500).json({ error: "Erro ao listar produtos (admin)." });
  }
});

router.post("/categories", requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Nome da categoria e obrigatorio." });
    }

    await run("INSERT INTO categories (name) VALUES (?)", [name.trim()]);
    const categories = await all("SELECT id, name FROM categories ORDER BY name ASC");
    return res.status(201).json(categories);
  } catch (error) {
    return res.status(500).json({ error: "Erro ao criar categoria." });
  }
});

router.post("/products", requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const { name, description = "", price, cost_price, category_id } = req.body;
    const parsedPrice = Number(price);
    const parsedCostPrice = Number(cost_price || 0);
    const parsedCategoryId = Number(category_id);
    const image_url = req.file ? `/assets/uploads/${req.file.filename}` : req.body.image_url;

    if (!name || !image_url || !Number.isFinite(parsedPrice) || !Number.isFinite(parsedCostPrice)) {
      return res.status(400).json({ error: "Campos obrigatorios: nome, preco, imagem." });
    }

    await run(
      `
      INSERT INTO products (name, description, price, cost_price, image_url, category_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      [name.trim(), description.trim(), parsedPrice, parsedCostPrice, image_url, parsedCategoryId || null]
    );

    return res.status(201).json({ message: "Produto criado com sucesso." });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao cadastrar produto." });
  }
});

router.put("/products/:id", requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await get("SELECT * FROM products WHERE id = ?", [id]);

    if (!existing) {
      return res.status(404).json({ error: "Produto nao encontrado." });
    }

    const nextName = req.body.name ? req.body.name.trim() : existing.name;
    const nextDescription =
      req.body.description !== undefined ? req.body.description.trim() : existing.description;
    const nextPrice = req.body.price !== undefined ? Number(req.body.price) : existing.price;
    const nextCostPrice =
      req.body.cost_price !== undefined ? Number(req.body.cost_price) : Number(existing.cost_price || 0);
    const nextCategoryId =
      req.body.category_id !== undefined ? Number(req.body.category_id) : existing.category_id;
    const nextImage =
      req.file?.filename
        ? `/assets/uploads/${req.file.filename}`
        : req.body.image_url || existing.image_url;

    if (!nextName || !Number.isFinite(nextPrice) || !Number.isFinite(nextCostPrice) || !nextImage) {
      return res.status(400).json({ error: "Dados invalidos para atualizar produto." });
    }

    await run(
      `
      UPDATE products
      SET name = ?, description = ?, price = ?, cost_price = ?, image_url = ?, category_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [nextName, nextDescription, nextPrice, nextCostPrice, nextImage, nextCategoryId || null, id]
    );

    return res.json({ message: "Produto atualizado com sucesso." });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao atualizar produto." });
  }
});

router.delete("/products/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await run("DELETE FROM products WHERE id = ?", [id]);
    await run("DELETE FROM cart_items WHERE product_id = ?", [id]);
    return res.json({ message: "Produto removido com sucesso." });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao excluir produto." });
  }
});

router.get("/inventory-purchases", requireAdmin, async (req, res) => {
  try {
    const limitParam = Number(req.query.limit || 100);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 300) : 100;

    const rows = await all(
      `
      SELECT
        ip.id,
        ip.product_id,
        p.name AS product_name,
        ip.supplier_name,
        ip.quantity,
        ip.unit_cost,
        ip.total_cost,
        ip.purchased_at,
        ip.notes
      FROM inventory_purchases ip
      INNER JOIN products p ON p.id = ip.product_id
      ORDER BY ip.purchased_at DESC, ip.id DESC
      LIMIT ?
    `,
      [limit]
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: "Erro ao listar compras de estoque." });
  }
});

router.post("/inventory-purchases", requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.body.product_id);
    const quantity = Number(req.body.quantity);
    const unitCost = Number(req.body.unit_cost);
    const supplierName = String(req.body.supplier_name || "").trim();
    const notes = String(req.body.notes || "").trim();
    const purchasedAt = String(req.body.purchased_at || "").trim();

    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ error: "Produto invalido." });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: "Quantidade invalida." });
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      return res.status(400).json({ error: "Custo unitario invalido." });
    }

    const product = await get("SELECT id FROM products WHERE id = ?", [productId]);
    if (!product) {
      return res.status(404).json({ error: "Produto nao encontrado." });
    }

    const totalCost = quantity * unitCost;
    await run(
      `
      INSERT INTO inventory_purchases (
        product_id, supplier_name, quantity, unit_cost, total_cost, purchased_at, notes
      )
      VALUES (?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), CURRENT_TIMESTAMP), ?)
    `,
      [productId, supplierName || null, quantity, unitCost, totalCost, purchasedAt, notes || null]
    );

    return res.status(201).json({ message: "Compra de estoque lancada com sucesso." });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao lancar compra de estoque." });
  }
});

router.post("/manual-sales", requireAdmin, async (req, res) => {
  try {
    const customerName = String(req.body.customer_name || "").trim();
    const customerEmail = String(req.body.customer_email || "").trim().toLowerCase();
    const customerPhone = String(req.body.customer_phone || "").replace(/\D/g, "");
    const notes = String(req.body.notes || "").trim();
    const channel = normalizeSalesChannel(req.body.channel);
    const itemsInput = Array.isArray(req.body.items) ? req.body.items : [];
    const productionStatus = normalizeProductionStatus(req.body.production_status || req.body.status || "pendente");
    if (!ALLOWED_PRODUCTION_STATUSES.includes(productionStatus)) {
      return res.status(400).json({ error: "Status de producao invalido para lancamento manual." });
    }

    const status = productionToLegacyStatus(productionStatus);
    const paymentStatusInput = normalizePaymentStatus(req.body.payment_status || "");
    const payment_status = ALLOWED_PAYMENT_STATUSES.includes(paymentStatusInput)
      ? paymentStatusInput
      : status === "cancelled"
        ? "refunded"
        : status === "refunded"
        ? "refunded"
        : status === "paid_confirmed"
          ? "paid"
          : "pending";
    const initialPaidAmount = Number(req.body.initial_paid_amount || 0);
    const paymentMethod = String(req.body.payment_method || "pix").trim().toLowerCase();
    const paymentType = String(req.body.payment_type || "parcial").trim().toLowerCase();
    const paymentNote = String(req.body.payment_note || "").trim();
    const hasInitialPayment = Number.isFinite(initialPaidAmount) && initialPaidAmount > 0;

    const normalizedItems = itemsInput
      .map((item) => ({
        product_id: Number(item.product_id),
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price)
      }))
      .filter(
        (item) =>
          Number.isFinite(item.product_id) &&
          item.product_id > 0 &&
          Number.isFinite(item.quantity) &&
          item.quantity > 0 &&
          Number.isFinite(item.unit_price) &&
          item.unit_price >= 0
      );

    if (!normalizedItems.length) {
      return res.status(400).json({ error: "Informe ao menos um item valido para a venda." });
    }

    let total = 0;
    const resolvedItems = [];
    for (const item of normalizedItems) {
      const product = await get("SELECT id, name, cost_price FROM products WHERE id = ?", [item.product_id]);
      if (!product) {
        return res.status(400).json({ error: `Produto ${item.product_id} nao encontrado.` });
      }

      const lineTotal = item.unit_price * item.quantity;
      total += lineTotal;
      resolvedItems.push({
        ...item,
        unit_cost: Number(product.cost_price || 0)
      });
    }

    const clientId = `manual_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const orderResult = await run(
      `
      INSERT INTO orders (
        client_id, customer_id, customer_name, customer_email, customer_phone, channel, notes, total, status, production_status, payment_status
      )
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        clientId,
        customerName || null,
        customerEmail || null,
        customerPhone || null,
        channel,
        notes || null,
        total,
        status,
        productionStatus,
        payment_status
      ]
    );

    for (const item of resolvedItems) {
      await run(
        `
        INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_cost)
        VALUES (?, ?, ?, ?, ?)
      `,
        [orderResult.lastID, item.product_id, item.quantity, item.unit_price, item.unit_cost]
      );
    }

    if (hasInitialPayment) {
      const cappedAmount = Math.min(initialPaidAmount, total);
      await run(
        `
        INSERT INTO order_payments (order_id, amount, method, type, note)
        VALUES (?, ?, ?, ?, ?)
      `,
        [
          orderResult.lastID,
          cappedAmount,
          ALLOWED_PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : "pix",
          ALLOWED_PAYMENT_TYPES.includes(paymentType) ? paymentType : "parcial",
          paymentNote || null
        ]
      );
    }

    return res.status(201).json({
      message: "Venda manual lancada com sucesso.",
      orderId: orderResult.lastID,
      total
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao lancar venda manual." });
  }
});

router.get("/reports/customers", requireAdmin, async (_req, res) => {
  try {
    const report = await all(
      `
      SELECT
        c.id,
        c.name,
        c.email,
        c.phone,
        COUNT(o.id) AS total_orders,
        COALESCE(SUM(pay.paid_amount), 0) AS total_spent,
        MAX(o.created_at) AS last_purchase
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id AND o.production_status IN ('em_producao', 'pronto_entrega', 'entregue')
      LEFT JOIN (
        SELECT order_id, COALESCE(SUM(amount), 0) AS paid_amount
        FROM order_payments
        GROUP BY order_id
      ) pay ON pay.order_id = o.id
      GROUP BY c.id, c.name, c.email, c.phone
      HAVING COUNT(o.id) > 0
      ORDER BY total_spent DESC, total_orders DESC
    `
    );
    return res.json(report);
  } catch (error) {
    return res.status(500).json({ error: "Erro ao gerar relatorio de clientes." });
  }
});

router.get("/reports/sales-dashboard", requireAdmin, async (req, res) => {
  try {
    const daysParam = String(req.query.days || "30").trim().toLowerCase();
    const useToday = daysParam === "today" || daysParam === "hoje";
    const parsedDays = Number(daysParam);
    const useRange = !useToday && daysParam !== "all" && Number.isFinite(parsedDays) && parsedDays > 0;

    const whereClause = useToday
      ? "WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime')"
      : useRange
        ? "WHERE created_at >= datetime('now', ?)"
        : "";
    const whereParams = useRange ? [`-${parsedDays} days`] : [];
    const ordersWhereClause = useToday
      ? "WHERE DATE(o.created_at, 'localtime') = DATE('now', 'localtime')"
      : useRange
        ? "WHERE o.created_at >= datetime('now', ?)"
        : "";
    const ordersWhereParams = useRange ? [`-${parsedDays} days`] : [];
    const purchasesWhereClause = useToday
      ? "WHERE DATE(ip.purchased_at, 'localtime') = DATE('now', 'localtime')"
      : useRange
        ? "WHERE ip.purchased_at >= datetime('now', ?)"
        : "";
    const purchasesWhereParams = useRange ? [`-${parsedDays} days`] : [];

    const summary = await get(
      `
      SELECT
        COUNT(*) AS total_orders,
        SUM(CASE WHEN o.production_status = 'pendente' THEN 1 ELSE 0 END) AS pending_orders,
        SUM(CASE WHEN o.production_status IN ('em_producao', 'pronto_entrega', 'entregue') THEN 1 ELSE 0 END) AS confirmed_orders,
        SUM(CASE WHEN o.production_status = 'cancelado' THEN 1 ELSE 0 END) AS abandoned_orders,
        COALESCE(SUM(CASE WHEN o.production_status IN ('em_producao', 'pronto_entrega', 'entregue') THEN o.total ELSE 0 END), 0) AS sold_revenue,
        COALESCE(SUM(CASE WHEN o.production_status IN ('em_producao', 'pronto_entrega', 'entregue') THEN COALESCE(pay.paid_amount, 0) ELSE 0 END), 0) AS confirmed_revenue,
        COALESCE(AVG(CASE WHEN o.production_status IN ('em_producao', 'pronto_entrega', 'entregue') THEN o.total END), 0) AS average_ticket
      FROM orders o
      LEFT JOIN (
        SELECT order_id, COALESCE(SUM(amount), 0) AS paid_amount
        FROM order_payments
        GROUP BY order_id
      ) pay ON pay.order_id = o.id
      ${ordersWhereClause}
    `,
      [...ordersWhereParams]
    );

    const costSummary = await get(
      `
      SELECT
        COALESCE(SUM(oi.quantity * oi.unit_cost), 0) AS confirmed_cost
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      WHERE o.production_status IN ('em_producao', 'pronto_entrega', 'entregue')
      ${useRange ? "AND o.created_at >= datetime('now', ?)" : ""}
    `,
      [...ordersWhereParams]
    );

    const daily = await all(
      `
      SELECT
        DATE(created_at) AS day,
        COUNT(*) AS total_orders,
        SUM(CASE WHEN production_status IN ('em_producao', 'pronto_entrega', 'entregue') THEN 1 ELSE 0 END) AS confirmed_orders,
        COALESCE(SUM(CASE WHEN production_status IN ('em_producao', 'pronto_entrega', 'entregue') THEN total ELSE 0 END), 0) AS revenue
      FROM orders
      ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `,
      [...whereParams]
    );

    const topProducts = await all(
      `
      SELECT
        p.id,
        p.name,
        SUM(oi.quantity) AS units_sold,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS revenue
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      INNER JOIN products p ON p.id = oi.product_id
      WHERE o.production_status IN ('em_producao', 'pronto_entrega', 'entregue')
      ${useRange ? "AND o.created_at >= datetime('now', ?)" : ""}
      GROUP BY p.id, p.name
      ORDER BY revenue DESC
      LIMIT 5
    `,
      [...ordersWhereParams]
    );

    const purchasesSummary = await get(
      `
      SELECT
        COALESCE(SUM(ip.total_cost), 0) AS inventory_purchase_cost
      FROM inventory_purchases ip
      ${purchasesWhereClause}
    `,
      [...purchasesWhereParams]
    );

    return res.json({
      range: useToday ? "today" : useRange ? parsedDays : "all",
      summary: {
        total_orders: Number(summary?.total_orders || 0),
        pending_orders: Number(summary?.pending_orders || 0),
        confirmed_orders: Number(summary?.confirmed_orders || 0),
        abandoned_orders: Number(summary?.abandoned_orders || 0),
        sold_revenue: Number(summary?.sold_revenue || 0),
        confirmed_revenue: Number(summary?.confirmed_revenue || 0),
        confirmed_cost: Number(costSummary?.confirmed_cost || 0),
        inventory_purchase_cost: Number(purchasesSummary?.inventory_purchase_cost || 0),
        confirmed_profit: Number(summary?.confirmed_revenue || 0) - Number(costSummary?.confirmed_cost || 0),
        receivable: Number(summary?.sold_revenue || 0) - Number(summary?.confirmed_revenue || 0),
        operating_cashflow:
          Number(summary?.confirmed_revenue || 0) - Number(purchasesSummary?.inventory_purchase_cost || 0),
        profit_margin_percent:
          Number(summary?.confirmed_revenue || 0) > 0
            ? ((Number(summary?.confirmed_revenue || 0) - Number(costSummary?.confirmed_cost || 0)) /
                Number(summary?.confirmed_revenue || 0)) *
              100
            : 0,
        average_ticket: Number(summary?.average_ticket || 0)
      },
      daily,
      top_products: topProducts
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao gerar dashboard de vendas." });
  }
});

router.get("/orders", requireAdmin, async (req, res) => {
  try {
    const scope = String(req.query.scope || "all")
      .trim()
      .toLowerCase();
    let whereClause = "";
    let params = [];

    if (scope === "pending") {
      whereClause = `WHERE o.production_status IN (${inClausePlaceholders(PENDING_ORDER_STATUSES)})`;
      params = [...PENDING_ORDER_STATUSES];
    } else if (scope === "production") {
      whereClause = `WHERE o.production_status IN (${inClausePlaceholders(PRODUCTION_ORDER_STATUSES)})`;
      params = [...PRODUCTION_ORDER_STATUSES];
    } else if (scope === "history") {
      const activeStatuses = [...PENDING_ORDER_STATUSES, ...PRODUCTION_ORDER_STATUSES];
      whereClause = `WHERE o.production_status NOT IN (${inClausePlaceholders(activeStatuses)})`;
      params = activeStatuses;
    }

    const orders = await all(
      `
      SELECT
        o.id,
        o.client_id,
        o.customer_name,
        o.customer_email,
        o.customer_phone,
        o.channel,
        o.notes,
        o.total,
        o.status,
        o.payment_status,
        o.production_status,
        COALESCE(pay.paid_amount, 0) AS paid_amount,
        (o.total - COALESCE(pay.paid_amount, 0)) AS balance,
        CASE
          WHEN COALESCE(pay.paid_amount, 0) <= 0 THEN 'nao_pago'
          WHEN COALESCE(pay.paid_amount, 0) < o.total THEN 'parcial'
          ELSE 'pago'
        END AS payment_summary_status,
        o.created_at,
        o.updated_at
      FROM orders o
      LEFT JOIN (
        SELECT order_id, COALESCE(SUM(amount), 0) AS paid_amount
        FROM order_payments
        GROUP BY order_id
      ) pay ON pay.order_id = o.id
      ${whereClause}
      ORDER BY o.created_at DESC
    `,
      params
    );
    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ error: "Erro ao listar pedidos." });
  }
});

router.delete("/orders/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const order = await get("SELECT id, client_id, production_status FROM orders WHERE id = ?", [id]);
    if (!order) {
      return res.status(404).json({ error: "Pedido nao encontrado." });
    }

    const isManualOrder = String(order.client_id || "").startsWith("manual_");
    const isPendingOrder = String(order.production_status || "") === "pendente";
    if (!isManualOrder && !isPendingOrder) {
      return res.status(400).json({
        error: "A exclusao direta e permitida para lancamentos manuais ou pedidos pendentes."
      });
    }

    await run("DELETE FROM order_items WHERE order_id = ?", [id]);
    await run("DELETE FROM orders WHERE id = ?", [id]);
    return res.json({ message: "Lancamento manual removido com sucesso." });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao remover lancamento manual." });
  }
});

router.patch("/orders/:id/status", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const productionStatus = normalizeProductionStatus(req.body.status || req.body.production_status || "");

    if (!ALLOWED_PRODUCTION_STATUSES.includes(productionStatus)) {
      return res.status(400).json({ error: "Status de producao invalido para o pedido." });
    }

    const order = await get("SELECT id, payment_status FROM orders WHERE id = ?", [id]);
    if (!order) {
      return res.status(404).json({ error: "Pedido nao encontrado." });
    }

    const legacyStatus = productionToLegacyStatus(productionStatus);
    const shouldRefund = productionStatus === "cancelado" && order.payment_status === "paid";
    await run(
      "UPDATE orders SET status = ?, production_status = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [legacyStatus, productionStatus, shouldRefund ? "refunded" : order.payment_status || "pending", id]
    );

    return res.json({ message: "Status do pedido atualizado com sucesso." });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao atualizar status do pedido." });
  }
});

router.post("/orders/:id/payments", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const amount = Number(req.body.amount);
    const method = String(req.body.method || "pix").trim().toLowerCase();
    const type = String(req.body.type || "parcial").trim().toLowerCase();
    const note = String(req.body.note || "").trim();
    const paidAt = String(req.body.paid_at || "").trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Valor de pagamento invalido." });
    }

    const order = await get(
      `
      SELECT
        o.id,
        o.total,
        COALESCE((SELECT SUM(amount) FROM order_payments WHERE order_id = o.id), 0) AS paid_amount
      FROM orders o
      WHERE o.id = ?
    `,
      [id]
    );
    if (!order) {
      return res.status(404).json({ error: "Pedido nao encontrado." });
    }

    const remaining = Number(order.total || 0) - Number(order.paid_amount || 0);
    if (remaining <= 0) {
      return res.status(400).json({ error: "Pedido ja esta totalmente pago." });
    }
    const appliedAmount = Math.min(amount, remaining);

    await run(
      `
      INSERT INTO order_payments (order_id, amount, method, type, note, paid_at)
      VALUES (?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), CURRENT_TIMESTAMP))
    `,
      [
        id,
        appliedAmount,
        ALLOWED_PAYMENT_METHODS.includes(method) ? method : "pix",
        ALLOWED_PAYMENT_TYPES.includes(type) ? type : "parcial",
        note || null,
        paidAt
      ]
    );

    const newPaidRow = await get(
      "SELECT COALESCE(SUM(amount), 0) AS paid_amount FROM order_payments WHERE order_id = ?",
      [id]
    );
    const newPaidAmount = Number(newPaidRow?.paid_amount || 0);
    const nextPaymentStatus = newPaidAmount <= 0 ? "pending" : newPaidAmount < Number(order.total || 0) ? "pending" : "paid";
    await run("UPDATE orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      nextPaymentStatus,
      id
    ]);

    return res.status(201).json({
      message: "Pagamento registrado com sucesso.",
      paid_amount: newPaidAmount,
      balance: Math.max(0, Number(order.total || 0) - newPaidAmount),
      payment_summary_status:
        newPaidAmount <= 0 ? "nao_pago" : newPaidAmount < Number(order.total || 0) ? "parcial" : "pago"
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao registrar pagamento." });
  }
});

router.delete("/orders/:id/payments", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const order = await get("SELECT id FROM orders WHERE id = ?", [id]);
    if (!order) {
      return res.status(404).json({ error: "Pedido nao encontrado." });
    }

    await run("DELETE FROM order_payments WHERE order_id = ?", [id]);
    await run("UPDATE orders SET payment_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      id
    ]);

    return res.json({ message: "Pagamentos do pedido zerados." });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao zerar pagamentos do pedido." });
  }
});

router.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: `Imagem maior que o limite permitido (${Math.floor(MAX_UPLOAD_FILE_SIZE / (1024 * 1024))}MB).`
      });
    }
    return res.status(400).json({ error: "Falha no upload da imagem." });
  }

  if (error?.message === "Apenas imagens sao permitidas.") {
    return res.status(400).json({ error: error.message });
  }

  return next(error);
});

module.exports = router;
