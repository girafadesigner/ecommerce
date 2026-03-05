require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const morgan = require("morgan");
const { initializeDatabase } = require("./db");

const publicRoutes = require("./routes/public");
const cartRoutes = require("./routes/cart");
const adminRoutes = require("./routes/admin");
const paymentRoutes = require("./routes/payments");
const checkoutRoutes = require("./routes/checkout");
const customerRoutes = require("./routes/customers");

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = String(process.env.NODE_ENV || "development").toLowerCase();
const AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 10);
const authRateLimitStore = new Map();

function getMissingEnv(requiredNames) {
  return requiredNames.filter((name) => !String(process.env[name] || "").trim());
}

function validateEnvironment() {
  const baseRequired = NODE_ENV === "production" ? ["JWT_SECRET"] : [];
  const required = baseRequired;
  const missing = getMissingEnv(required);

  if (missing.length > 0) {
    throw new Error(`Variaveis de ambiente obrigatorias ausentes: ${missing.join(", ")}`);
  }

  if (NODE_ENV === "production") {
    const mockEnabled = String(process.env.ENABLE_MOCK_NOTIFICATIONS || "").toLowerCase() === "true";
    if (mockEnabled) {
      throw new Error("ENABLE_MOCK_NOTIFICATIONS=true nao pode ser usado em producao.");
    }

    const corsOrigin = String(process.env.CORS_ORIGIN || "").trim();
    if (!corsOrigin || corsOrigin === "*") {
      throw new Error("Defina CORS_ORIGIN com o dominio real do frontend em producao.");
    }
  }
}

function buildCorsOptions() {
  const defaultAllowedOrigins = [
    "https://girafadesigner.github.io",
    "https://www.girafadesigner.github.io"
  ];

  function normalizeOrigin(value) {
    return String(value || "")
      .trim()
      .replace(/\/+$/, "")
      .toLowerCase();
  }

  const corsOrigin = String(process.env.CORS_ORIGIN || "*").trim();
  if (!corsOrigin || corsOrigin === "*") {
    return {
      origin: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      optionsSuccessStatus: 204
    };
  }

  const allowed = corsOrigin
    .split(",")
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);

  defaultAllowedOrigins.forEach((origin) => {
    const normalized = normalizeOrigin(origin);
    if (!allowed.includes(normalized)) {
      allowed.push(normalized);
    }
  });

  return {
    origin(origin, callback) {
      const normalizedOrigin = normalizeOrigin(origin);
      if (!origin || allowed.includes(normalizedOrigin)) return callback(null, true);
      return callback(new Error("Origem CORS nao permitida."));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204
  };
}

function applySecurityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (NODE_ENV === "production" && req.secure) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return next();
}

function createAuthRateLimiter() {
  return (req, res, next) => {
    const now = Date.now();
    const ip = String(req.ip || req.socket?.remoteAddress || "unknown");
    const key = `${ip}|${req.path}`;
    const current = authRateLimitStore.get(key);

    if (!current || now > current.resetAt) {
      authRateLimitStore.set(key, { count: 1, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS });
      return next();
    }

    if (current.count >= AUTH_RATE_LIMIT_MAX) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        error: "Muitas tentativas. Aguarde alguns minutos e tente novamente."
      });
    }

    current.count += 1;
    authRateLimitStore.set(key, current);
    return next();
  };
}

validateEnvironment();

app.disable("x-powered-by");
if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const corsOptions = buildCorsOptions();
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(applySecurityHeaders);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(morgan("dev"));
app.use(
  [
    "/api/admin/login",
    "/api/admin/forgot-password",
    "/api/admin/reset-password",
    "/api/customers/login",
    "/api/customers/register",
    "/api/customers/forgot-password",
    "/api/customers/reset-password"
  ],
  createAuthRateLimiter()
);

app.use("/assets", express.static(path.join(__dirname, "..", "assets")));
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "girafa-designer-ecommerce" });
});

app.use("/api", publicRoutes);
app.use("/api", cartRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", paymentRoutes);
app.use("/api", checkoutRoutes);
app.use("/api", customerRoutes);

app.get("/cart", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "cart.html"));
});
app.get("/cart/index.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "cart.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "admin-login.html"));
});
app.get("/admin/index.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "admin-login.html"));
});

app.get("/admin/panel", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "admin-panel.html"));
});
app.get("/admin/panel/index.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "admin-panel.html"));
});

app.get("/account", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "account.html"));
});
app.get("/account/index.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "account.html"));
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

initializeDatabase()
  .then(() => {
    const server = app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });

    server.on("error", (error) => {
      if (error && error.code === "EADDRINUSE") {
        // eslint-disable-next-line no-console
        console.error(
          `Porta ${PORT} em uso. Finalize o processo atual ou altere PORT no .env (ex: PORT=3001).`
        );
        process.exit(1);
      }

      // eslint-disable-next-line no-console
      console.error("Erro ao iniciar servidor:", error);
      process.exit(1);
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Erro ao inicializar banco:", error);
    process.exit(1);
  });
