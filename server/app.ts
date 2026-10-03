import express from "express";
import type { NextFunction, Request, Response } from "express";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const proxyWindowMs = 60_000;
const proxyLimit = 90;
const proxyHits = new Map<string, { count: number; resetAt: number }>();
const adminCookieName = "guestflow_admin_session";
const deviceCookieName = "guestflow_device_credential";
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

function deviceSecret() { return process.env.DEVICE_CREDENTIAL_SECRET?.trim() || adminSecret(); }
function deviceHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function readCookie(req: Request, name: string) {
  const part = (req.headers.cookie || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return part ? part.slice(name.length + 1) : "";
}
function signDeviceCredential(payload: string) { return createHmac("sha256", deviceSecret()).update(payload).digest("hex"); }
function setDeviceCookie(res: Response, value: string, maxAge = 365 * 24 * 60 * 60) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${deviceCookieName}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly${secure}; SameSite=Strict`);
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

  async function getDeviceRecord(hash: string, id = "") {
    const origin = process.env.SPAGYM_API_URL?.trim().replace(/\/+$/, "");
    const apiKey = process.env.SPAGYM_API_KEY;
    if (!origin || !apiKey) return null;
    const url = new URL(`${origin}/api/integrations/guestflow/devices/verify`);
    if (hash) url.searchParams.set("deviceIdHash", hash);
    if (id) url.searchParams.set("id", id);
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!response.ok) return null;
      return ((await response.json()) as { device?: { id?: string; status?: string; branchName?: string } }).device || null;
    } catch { return null; }
  }

  async function requireApprovedDevice(req: Request, res: Response, next: NextFunction) {
    const installationId = String(req.headers["x-guestflow-device-id"] || "").trim();
    const [recordId, issuedAt, signature] = readCookie(req, deviceCookieName).split(".");
    const payload = recordId && issuedAt ? `${recordId}.${issuedAt}` : "";
    const expected = payload ? signDeviceCredential(payload) : "";
    const validSignature = Boolean(signature && expected && signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected)));
    if (!installationId || !validSignature || Date.now() / 1000 - Number(issuedAt) > 365 * 24 * 60 * 60) {
      res.status(403).json({ error: "This device is not approved. Ask the administrator to approve it." }); return;
    }
    const device = await getDeviceRecord(deviceHash(installationId), recordId);
    if (!device || device.status !== "approved" || device.id !== recordId) {
      setDeviceCookie(res, "", 0);
      res.status(403).json({ error: "This device is not approved. Ask the administrator to approve it." }); return;
    }
    next();
  }

  async function requestDevice(req: Request, res: Response) {
    const installationId = String(req.body?.installationId || "").trim();
    if (installationId.length < 20 || installationId.length > 200) { res.status(400).json({ error: "Invalid device identifier." }); return; }
    req.body = { ...req.body, deviceIdHash: deviceHash(installationId), userAgent: String(req.headers["user-agent"] || "") };
    req.method = "POST";
    await spaGymProxy(req, res, "devices");
  }

  // These endpoints are deliberately narrow: the browser never receives the SpaGym API secret.
  function adminHeaderIfPresent(req: Request, res: Response, next: NextFunction) {
    if (req.headers["x-guestflow-admin"] === "1") return requireAdmin(req, res, next);
    return requireApprovedDevice(req, res, next);
  }

  app.post("/api/device/request", limitIntegrationTraffic, requestDevice);
  app.get("/api/device/status", limitIntegrationTraffic, async (req: Request, res: Response) => {
    const installationId = String(req.headers["x-guestflow-device-id"] || "").trim();
    if (installationId.length < 20 || installationId.length > 200) { res.status(400).json({ error: "Invalid device identifier." }); return; }
    let device = await getDeviceRecord(deviceHash(installationId));
    if (!device) {
      req.body = { installationId, branchId: typeof req.query.branchId === "string" ? req.query.branchId : "" };
      await requestDevice(req, res); return;
    }
    if (device.status === "approved" && device.id) {
      const issuedAt = String(Math.floor(Date.now() / 1000));
      setDeviceCookie(res, `${device.id}.${issuedAt}.${signDeviceCredential(`${device.id}.${issuedAt}`)}`);
    } else if (device.status === "revoked") setDeviceCookie(res, "", 0);
    res.setHeader("Cache-Control", "no-store");
    res.json({ status: device.status, branchName: device.branchName || "", deviceId: device.id });
  });
  app.post("/api/device/heartbeat", limitIntegrationTraffic, requireApprovedDevice, async (req: Request, res: Response) => {
    const installationId = String(req.headers["x-guestflow-device-id"] || "").trim();
    req.body = { deviceIdHash: deviceHash(installationId) };
    await spaGymProxy(req, res, "devices/heartbeat");
  });
  app.get("/api/devices", requireAdmin, (req: Request, res: Response) => spaGymProxy(req, res, "devices"));
  app.post("/api/devices/:deviceId/:action", requireAdmin, (req: Request, res: Response) => {
    req.body = { actor: "GuestFlow top administrator" };
    return spaGymProxy(req, res, `devices/${encodeURIComponent(req.params.deviceId)}/${req.params.action}`);
  });

  app.get("/api/spagym/branches", limitIntegrationTraffic, (req: Request, res: Response) => spaGymProxy(req, res, "branches"));
  app.get("/api/spagym/clients/lookup", limitIntegrationTraffic, adminHeaderIfPresent, (req: Request, res: Response) => spaGymProxy(req, res, "clients/lookup"));
  app.post("/api/spagym/clients", limitIntegrationTraffic, adminHeaderIfPresent, (req: Request, res: Response) => spaGymProxy(req, res, "clients"));
  app.post("/api/spagym/clients/reassign", limitIntegrationTraffic, requireAdmin, (req: Request, res: Response) => spaGymProxy(req, res, "clients/reassign"));
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
