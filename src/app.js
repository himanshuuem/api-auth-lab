import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApiRouter } from "./api/router.js";
import { createAuthStore } from "./api/auth.js";
import { createLabClient } from "./client/lab.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export const AUTH_KINDS = [
  { kind: "none", title: "No auth", endpoint: "GET /api/random", blurb: "Public data. Anyone can call it, so there's nothing to send." },
  { kind: "basic", title: "Basic auth", endpoint: "GET /api/all?page=", blurb: "username:password, base64-encoded in the Authorization header. Only safe over HTTPS." },
  { kind: "apikey", title: "API key", endpoint: "GET /api/filter?score=", blurb: "A long random key that identifies the app, not the user. Sent here as an X-API-Key header." },
  { kind: "bearer", title: "Bearer token", endpoint: "GET /api/secrets/:id", blurb: "A short-lived, signed token issued after login. Expires, so a leak is bounded." },
];

export function createApp({ apiBaseUrl }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("view engine", "ejs");
  app.set("views", path.join(root, "views"));
  app.use(express.static(path.join(root, "public")));

  app.use("/api", createApiRouter(createAuthStore()));

  // Created lazily: the base URL may depend on the port, which is only known after listen().
  let lab;
  const getLab = () => (lab ??= createLabClient(apiBaseUrl()));

  app.get("/", (req, res) => res.render("index", { kinds: AUTH_KINDS, result: null }));

  app.get("/try/:kind", async (req, res, next) => {
    try {
      const result = await getLab().call(req.params.kind, req.query);
      res.render("index", { kinds: AUTH_KINDS, result });
    } catch (error) {
      if (error instanceof RangeError) return res.status(404).render("index", { kinds: AUTH_KINDS, result: null });
      next(error);
    }
  });

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(502).render("index", {
      kinds: AUTH_KINDS,
      result: { kind: "error", request: null, response: { status: 502, ms: 0, body: { error: "Couldn't reach the Secrets API." } } },
    });
  });

  return app;
}
