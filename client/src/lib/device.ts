const STORAGE_KEY = "guestflow_device_installation_id";

export function getDeviceInstallationId() {
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing && existing.length >= 20) return existing;
  const generated = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(STORAGE_KEY, generated);
  return generated;
}

export async function getDeviceStatus(branchId = "") {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  const response = await fetch(`/api/device/status${query}`, {
    headers: { "X-GuestFlow-Device-Id": getDeviceInstallationId() },
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not register this device.");
  const result = payload.status ? payload : payload.device || payload.data?.device || payload.data;
  if (!result?.status) {
    if (payload.error) throw new Error(payload.error);
    // A newly-created request can briefly return without the serialized record
    // while the integration finishes its write. Keep polling instead of taking
    // down the kiosk screen.
    return { status: "pending" };
  }
  return result as { status: "pending" | "approved" | "revoked"; branchName?: string };
}

export async function sendDeviceHeartbeat() {
  const response = await fetch("/api/device/heartbeat", {
    method: "POST",
    headers: { "X-GuestFlow-Device-Id": getDeviceInstallationId() },
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Device heartbeat failed.");
}
