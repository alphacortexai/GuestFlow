export type SpaGymClient = {
  id: string;
  name: string;
  phoneNumber: string;
  phone: string;
  birthMonth: number | null;
  birthDay: number | null;
  month: string;
  day: string;
  branch: string;
  createdAt: string | null;
};

export type SpaGymBranch = { id: string; name: string };

export type SpaGymVisit = {
  id: string;
  clientId: string;
  clientName: string;
  clientCreatedAt: string | null;
  name: string;
  phoneNumber: string;
  phone: string;
  birthMonth: number | null;
  birthDay: number | null;
  branch: string;
  visitDate: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  checkedOutBy: string;
  source: string;
};

export class SpaGymApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/spagym${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      cache: 'no-store',
    });
  } catch {
    throw new SpaGymApiError('Unable to connect to SpaGym. Check the network and try again.', 503);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SpaGymApiError(payload.error || 'SpaGym could not complete the request.', response.status, payload.code);
  }
  return payload as T;
}

export async function lookupClient(phone: string) {
  const result = await request<{ client: SpaGymClient }>(`/clients/lookup?phone=${encodeURIComponent(phone)}`);
  return result.client;
}

export async function getBranches() {
  const result = await request<{ branches: SpaGymBranch[] }>('/branches');
  return result.branches;
}

export async function createClient(input: { name: string; phone: string; day: string; month: string; branchId?: string }) {
  return request<{ client: SpaGymClient; created: boolean }>('/clients', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function checkIn(phone: string, branchId?: string) {
  return request<{ client: SpaGymClient; visit: SpaGymVisit; alreadyCheckedIn: boolean }>('/check-ins', {
    method: 'POST',
    body: JSON.stringify({ phone, ...(branchId ? { branchId } : {}) }),
  });
}

export async function getCheckIns() {
  const result = await request<{ visits: SpaGymVisit[] }>('/check-ins');
  return result.visits;
}

export async function getSummary(branchId?: string) {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
  return request<{ clientCount: number; visitCount: number; visits: SpaGymVisit[]; date: string }>(`/summary${query}`);
}

export async function checkOut(visitId: string) {
  const result = await request<{ visit: SpaGymVisit }>(`/check-ins/${encodeURIComponent(visitId)}/checkout`, {
    method: 'POST',
  });
  return result.visit;
}
