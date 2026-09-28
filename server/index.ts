import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const proxyWindowMs = 60_000;
const proxyLimit = 90;
const proxyHits = new Map<string, { count: number; resetAt: number }>();

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "24kb" }));

  function limitIntegrationTraffic(req: express.Request, res: express.Response, next: express.NextFunction) {
    const now = Date.now();
    const address = req.ip || req.socket.remoteAddress || "unknown";
    const current = proxyHits.get(address);
    const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + proxyWindowMs } : current;
    entry.count += 1;
    proxyHits.set(address, entry);
    if (entry.count > proxyLimit) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json({ error: "Too many requests. Please wait and try again." });
      return;
    }
    next();
  }

  async function spaGymProxy(req: express.Request, res: express.Response, upstreamPath: string) {
    const origin = process.env.SPAGYM_API_URL?.trim().replace(/\/+$/, "");
    const apiKey = process.env.SPAGYM_API_KEY;
    if (!origin || !apiKey) {
      res.status(503).json({ error: "SpaGym integration is not configured on the GuestFlow server." });
      return;
    }

    const url = new URL(`${origin}/api/integrations/guestflow/${upstreamPath}`);
    if (req.method === "GET") {
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === "string") url.searchParams.set(key, value);
      }
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const upstream = await fetch(url, {
        method: req.method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(req.method !== "GET" ? { "Content-Type": "application/json" } : {}),
        },
        ...(req.method !== "GET" ? { body: JSON.stringify(req.body || {}) } : {}),
        signal: controller.signal,
      });
      const text = await upstream.text();
      let payload: unknown;
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: "SpaGym returned an invalid response." }; }
      res.setHeader("Cache-Control", "no-store");
      res.status(upstream.status).json(payload);
    } catch (error) {
      console.error("GuestFlow → SpaGym request failed:", error);
      res.status(502).json({ error: "SpaGym is temporarily unavailable. Please try again." });
    } finally {
      clearTimeout(timeout);
    }
  }

  // These endpoints are deliberately narrow: the browser never receives the SpaGym API secret.
  app.get("/api/spagym/clients/lookup", limitIntegrationTraffic, (req, res) => spaGymProxy(req, res, "clients/lookup"));
  app.post("/api/spagym/clients", limitIntegrationTraffic, (req, res) => spaGymProxy(req, res, "clients"));
  app.post("/api/spagym/check-ins", limitIntegrationTraffic, (req, res) => spaGymProxy(req, res, "check-ins"));
  app.get("/api/spagym/check-ins", limitIntegrationTraffic, (req, res) => spaGymProxy(req, res, "check-ins"));
  app.post("/api/spagym/check-ins/:visitId/checkout", limitIntegrationTraffic, (req, res) => {
    req.body = { ...(req.body || {}), id: req.params.visitId };
    return spaGymProxy(req, res, "check-ins/checkout");
  });
  app.get("/api/spagym/summary", limitIntegrationTraffic, (req, res) => spaGymProxy(req, res, "summary"));

  // Serve static files from dist/public in production
  const staticPath = process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, "public")
    : path.resolve(__dirname, "..", "dist", "public");
  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = Number(process.env.PORT || 3000);
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
