const express = require("express");
const { all, get, run } = require("../db");
const { requireCustomer } = require("../middleware/auth");

const router = express.Router();
const WHATSAPP_NUMBER = (process.env.WHATSAPP_NUMBER || "5521977461002").replace(/\D/g, "");

function currency(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizePhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  return digits;
}

router.post("/checkout/whatsapp", requireCustomer, async (req, res) => {
  try {
    const clientId = String(req.body.clientId || "").trim();
    const customerNameFromBody = String(req.body.customerName || "").trim();
    const customerPhoneFromBody = normalizePhone(req.body.customerPhone);

    if (!clientId) {
      return res.status(400).json({ error: "clientId obrigatorio." });
    }
    const customer = await get("SELECT id, name, email, phone FROM customers WHERE id = ?", [req.auth.id]);
    if (!customer) {
      return res.status(404).json({ error: "Cliente nao encontrado." });
    }

    const cart = await get("SELECT id FROM carts WHERE client_id = ?", [clientId]);
    if (!cart) {
      return res.status(404).json({ error: "Carrinho nao encontrado." });
    }

    const items = await all(
      `
      SELECT
        ci.product_id,
        ci.quantity,
        p.name,
        p.price,
        p.cost_price
      FROM cart_items ci
      INNER JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ?
      ORDER BY ci.id ASC
    `,
      [cart.id]
    );

    if (!items.length) {
      return res.status(400).json({ error: "Carrinho vazio." });
    }

    const total = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const finalCustomerName = customerNameFromBody || customer.name;
    const finalCustomerPhone = customerPhoneFromBody || normalizePhone(customer.phone);
    const orderResult = await run(
      `
      INSERT INTO orders (
        client_id,
        customer_id,
        customer_name,
        customer_email,
        customer_phone,
        channel,
        total,
        status,
        production_status,
        payment_status
      )
      VALUES (?, ?, ?, ?, ?, 'whatsapp', ?, 'pending_whatsapp', 'pendente', 'pending')
    `,
      [
        clientId,
        customer.id,
        finalCustomerName || null,
        customer.email,
        finalCustomerPhone || null,
        total
      ]
    );

    const orderId = orderResult.lastID;
    for (const item of items) {
      await run(
        `
        INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_cost)
        VALUES (?, ?, ?, ?, ?)
      `,
        [orderId, item.product_id, item.quantity, item.price, Number(item.cost_price || 0)]
      );
    }

    const itemLines = items
      .map((item) => `- ${item.name} | Qtd: ${item.quantity} | ${currency(item.price * item.quantity)}`)
      .join("\n");

    const textMessage = [
      "Ola, equipe Girafa Designer!",
      `Quero finalizar o pedido #${orderId}.`,
      "",
      `Cliente: ${finalCustomerName || "Nao informado"}`,
      `Email: ${customer.email}`,
      `Telefone: ${finalCustomerPhone || "Nao informado"}`,
      "",
      "Itens:",
      itemLines,
      "",
      `Total: ${currency(total)}`,
      "",
      "Pode me enviar o PIX ou link de pagamento para concluir?"
    ].join("\n");

    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(textMessage)}`;

    // Carrinho e limpo depois da criacao do pedido para evitar duplicidade acidental.
    await run("DELETE FROM cart_items WHERE cart_id = ?", [cart.id]);

    return res.status(201).json({
      orderId,
      total,
      whatsappUrl,
      whatsappNumber: WHATSAPP_NUMBER,
      message: "Pedido gerado e pronto para envio no WhatsApp."
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao finalizar checkout no WhatsApp." });
  }
});

module.exports = router;
