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
  return (payload.status ? payload : payload.device) as { status: "pending" | "approved" | "revoked"; branchName?: string };
}
