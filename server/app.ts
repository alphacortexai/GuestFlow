import express from "express";
import type { NextFunction, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const proxyWindowMs = 60_000;
const proxyLimit = 90;
const proxyHits = new Map<string, { count: number; resetAt: number }>();
const adminCookieName = "guestflow_admin_session";
const adminSessionTtlSeconds = 8 * 60 * 60;

function adminSecret() {
  return process.env.ADMIN_SESSION_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim() || "";
}

function signAdminSession(timestamp: string) {
  return createHmac("sha256", adminSecret()).update(timestamp).digest("hex");
}

function hasAdminSession(req: Request) {
  const cookieHeader = req.headers.cookie || "";
  const cookies = Object.fromEntries(cookieHeader.split(";").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, value.join("=")];
  }).filter(([key]) => key));
  const raw = cookies[adminCookieName] || "";
  const [timestamp, signature] = raw.split(".");
  const issuedAt = Number(timestamp);
  if (!adminSecret() || !timestamp || !signature || !Number.isFinite(issuedAt)) return false;
  if (Math.floor(Date.now() / 1000) - issuedAt > adminSessionTtlSeconds) return false;
  const expected = signAdminSession(timestamp);
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function setAdminCookie(res: Response, value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${adminCookieName}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`);
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!hasAdminSession(req)) {
    res.status(401).json({ error: "Admin login required." });
    return;
  }
  next();
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "24kb" }));

  app.post("/api/auth/login", (req: Request, res: Response) => {
    const configuredPassword = process.env.ADMIN_PASSWORD?.trim();
    if (!configuredPassword) {
      res.status(503).json({ error: "Admin password is not configured on the GuestFlow server." });
      return;
    }
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const passwordBuffer = Buffer.from(password);
    const configuredBuffer = Buffer.from(configuredPassword);
    const matches = passwordBuffer.length === configuredBuffer.length && timingSafeEqual(passwordBuffer, configuredBuffer);
    if (!matches) {
      res.status(401).json({ error: "Incorrect admin password." });
      return;
    }
    const timestamp = String(Math.floor(Date.now() / 1000));
    setAdminCookie(res, `${timestamp}.${signAdminSession(timestamp)}`, adminSessionTtlSeconds);
    res.json({ authenticated: true });
  });

  app.get("/api/auth/session", (req: Request, res: Response) => {
    res.json({ authenticated: hasAdminSession(req) });
  });

  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    setAdminCookie(res, "", 0);
    res.json({ authenticated: false });
  });

  // Vercel rewrites /api/:path* to api/index.ts and exposes the wildcard as
  // a `path` query parameter. Restore the original Express URL before routing.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const rewrittenPath = req.query.path;
    if (typeof rewrittenPath === "string" && rewrittenPath.length > 0) {
      const query = new URL(req.originalUrl || req.url, "http://localhost").searchParams;
      query.delete("path");
      const queryString = query.toString();
      req.url = `/api/${rewrittenPath.replace(/^\/+/, "")}${queryString ? `?${queryString}` : ""}`;
    }
    next();
  });

  function limitIntegrationTraffic(req: Request, res: Response, next: NextFunction) {
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

  async function spaGymProxy(req: Request, res: Response, upstreamPath: string) {
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
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { error: "SpaGym returned an invalid response." };
      }
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
  function adminHeaderIfPresent(req: Request, res: Response, next: NextFunction) {
    if (req.headers["x-guestflow-admin"] === "1") return requireAdmin(req, res, next);
    next();
  }

  app.get("/api/spagym/branches", limitIntegrationTraffic, adminHeaderIfPresent, (req: Request, res: Response) => spaGymProxy(req, res, "branches"));
  app.get("/api/spagym/clients/lookup", limitIntegrationTraffic, adminHeaderIfPresent, (req: Request, res: Response) => spaGymProxy(req, res, "clients/lookup"));
  app.post("/api/spagym/clients", limitIntegrationTraffic, adminHeaderIfPresent, (req: Request, res: Response) => spaGymProxy(req, res, "clients"));
  app.post("/api/spagym/check-ins", limitIntegrationTraffic, adminHeaderIfPresent, (req: Request, res: Response) => spaGymProxy(req, res, "check-ins"));
  app.get("/api/spagym/check-ins", limitIntegrationTraffic, adminHeaderIfPresent, (req: Request, res: Response) => spaGymProxy(req, res, "check-ins"));
  app.post("/api/spagym/check-ins/:visitId/checkout", limitIntegrationTraffic, adminHeaderIfPresent, (req: Request, res: Response) => {
    req.body = { ...(req.body || {}), id: req.params.visitId };
    return spaGymProxy(req, res, "check-ins/checkout");
  });
  app.get("/api/spagym/summary", limitIntegrationTraffic, requireAdmin, (req: Request, res: Response) => spaGymProxy(req, res, "summary"));

  // Vercel serves the Vite output as static files. The fallback is only needed by the local standalone server.
  if (!process.env.VERCEL) {
    const staticPath = process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");
    app.use(express.static(staticPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  }

  return app;
}

export const app = createApp();
