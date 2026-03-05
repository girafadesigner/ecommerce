const express = require("express");
const { all, get } = require("../db");

const router = express.Router();

router.get("/categories", async (req, res) => {
  try {
    const categories = await all("SELECT id, name FROM categories ORDER BY name ASC");
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: "Erro ao listar categorias." });
  }
});

router.get("/products", async (req, res) => {
  try {
    const { search = "", category = "", minPrice = "", maxPrice = "" } = req.query;
    const params = [];
    const conditions = [];

    if (search.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push("(p.name LIKE ? OR p.description LIKE ?)");
      params.push(`%${search.trim()}%`);
    }

    if (category) {
      params.push(Number(category));
      conditions.push("p.category_id = ?");
    }

    if (minPrice) {
      params.push(Number(minPrice));
      conditions.push("p.price >= ?");
    }

    if (maxPrice) {
      params.push(Number(maxPrice));
      conditions.push("p.price <= ?");
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const products = await all(
      `
      SELECT
        p.id,
        p.name,
        p.description,
        p.price,
        p.image_url,
        p.category_id,
        c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${whereClause}
      ORDER BY p.created_at DESC
    `,
      params
    );

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: "Erro ao listar produtos." });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const product = await get(
      `
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = ?
    `,
      [Number(req.params.id)]
    );

    if (!product) {
      return res.status(404).json({ error: "Produto nao encontrado." });
    }

    return res.json(product);
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar produto." });
  }
});

module.exports = router;
