const express = require("express");

const router = express.Router();
const providers = ["pix", "mercadopago", "stripe"];

router.post("/payments/:provider/create-intent", async (req, res) => {
  const provider = String(req.params.provider || "").toLowerCase();
  const amount = Number(req.body.amount || 0);

  if (!providers.includes(provider)) {
    return res.status(404).json({ error: "Gateway de pagamento nao suportado." });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "Valor invalido para pagamento." });
  }

  return res.json({
    provider,
    status: "mock_ready",
    message: `Estrutura pronta para integrar ${provider}.`,
    intentId: `${provider}_${Date.now()}`,
    amount
  });
});

module.exports = router;
