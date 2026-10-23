import express from "express";
import { SECRETS } from "./secrets.js";

const PAGE_SIZE = 4;

const fail = (res, status, error) => res.status(status).json({ error });

export function createApiRouter(auth) {
  const router = express.Router();
  router.use(express.json({ limit: "4kb" }));
  router.use(express.urlencoded({ extended: false, limit: "4kb" }));

  // ---- Credentials -------------------------------------------------------
  router.post("/register", (req, res, next) => {
    try {
      auth.register(req.body.username, req.body.password);
      res.status(201).json({ success: "Registered. You can now use Basic auth or request a token." });
    } catch (error) {
      next(error);
    }
  });

  router.get("/generate-api-key", (req, res) => res.json({ apiKey: auth.issueApiKey() }));

  router.post("/get-auth-token", (req, res) => {
    const { username, password } = req.body;
    if (!auth.verifyPassword(username, password)) return fail(res, 401, "Invalid username or password.");
    res.json({ token: auth.issueToken(username) });
  });

  // ---- Auth guards --------------------------------------------------------
  const basicAuth = (req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization ?? "").split(" ");
    if (scheme !== "Basic" || !encoded) {
      res.set("WWW-Authenticate", 'Basic realm="Secrets API"');
      return fail(res, 401, "Basic authentication required.");
    }
    const decoded = Buffer.from(encoded, "base64").toString();
    const separator = decoded.indexOf(":");
    const [username, password] = [decoded.slice(0, separator), decoded.slice(separator + 1)];
    if (separator < 0 || !auth.verifyPassword(username, password)) return fail(res, 401, "Invalid credentials.");
    req.user = username;
    next();
  };

  const apiKeyAuth = (req, res, next) => {
    const key = req.get("X-API-Key") ?? req.query.apiKey;
    if (!auth.hasApiKey(key)) return fail(res, 401, "A valid API key is required (X-API-Key header or ?apiKey=).");
    next();
  };

  const bearerAuth = (req, res, next) => {
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");
    const claims = scheme === "Bearer" ? auth.verifyToken(token) : null;
    if (!claims) return fail(res, 401, "A valid Bearer token is required.");
    req.user = claims.sub;
    next();
  };

  // ---- Resources ----------------------------------------------------------
  router.get("/random", (req, res) => {
    res.json(SECRETS[Math.floor(Math.random() * SECRETS.length)]);
  });

  router.get("/all", basicAuth, (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const totalPages = Math.ceil(SECRETS.length / PAGE_SIZE);
    if (page > totalPages) return fail(res, 404, `Page ${page} doesn't exist (last page is ${totalPages}).`);
    res.json({ page, totalPages, data: SECRETS.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) });
  });

  router.get("/filter", apiKeyAuth, (req, res) => {
    const score = Number(req.query.score ?? 5);
    if (!Number.isFinite(score) || score < 1 || score > 10) return fail(res, 400, "score must be between 1 and 10.");
    res.json(SECRETS.filter((s) => s.emScore >= score));
  });

  router.get("/secrets/:id", bearerAuth, (req, res) => {
    const secret = SECRETS.find((s) => s.id === Number(req.params.id));
    if (!secret) return fail(res, 404, `No secret with id ${req.params.id}.`);
    res.json({ ...secret, requestedBy: req.user });
  });

  router.use((req, res) => fail(res, 404, "Unknown API route."));
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => fail(res, err.status ?? 500, err.status ? err.message : "Internal error."));

  return router;
}
