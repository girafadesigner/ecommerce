const jwt = require("jsonwebtoken");

const NODE_ENV = String(process.env.NODE_ENV || "development").toLowerCase();
const JWT_SECRET = String(process.env.JWT_SECRET || "").trim();

function getJwtSecret() {
  if (!JWT_SECRET) {
    throw new Error(
      NODE_ENV === "production"
        ? "JWT_SECRET obrigatorio em producao."
        : "JWT_SECRET obrigatorio. Defina no arquivo .env."
    );
  }
  return JWT_SECRET;
}

function generateToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "8h" });
}

function readToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

function requireRole(role) {
  return (req, res, next) => {
    const token = readToken(req);
    if (!token) {
      return res.status(401).json({ error: "Token ausente." });
    }

    try {
      const decoded = jwt.verify(token, getJwtSecret());
      if (decoded.role !== role) {
        return res.status(403).json({ error: "Acesso nao autorizado." });
      }
      req.auth = decoded;
      return next();
    } catch (error) {
      return res.status(401).json({ error: "Token invalido ou expirado." });
    }
  };
}

function requireAdmin(req, res, next) {
  return requireRole("admin")(req, res, next);
}

function requireCustomer(req, res, next) {
  return requireRole("customer")(req, res, next);
}

module.exports = {
  generateToken,
  requireAdmin,
  requireCustomer
};
