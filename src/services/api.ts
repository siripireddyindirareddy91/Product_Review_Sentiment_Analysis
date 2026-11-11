const root = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export function endpoint(
  path: string,
  dataset?: number,
  filters: Record<string, string | number | boolean | undefined> = {},
) {
  const query = new URLSearchParams();
  if (dataset !== undefined) query.set("dataset", String(dataset));
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return `${path}${query.size ? `?${query}` : ""}`;
}

async function request(path: string, token?: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (typeof init?.body === "string")
    headers.set("Content-Type", "application/json");
  const response = await fetch(`${root}/api${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = body.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((item) => item.msg).join(" · ")
          : `Request failed (${response.status}).`,
    );
  }
  return response;
}

export async function api<T>(
  path: string,
  token?: string,
  init?: RequestInit,
): Promise<T> {
  const response = await request(path, token, init);
  return response.status === 204 ? (undefined as T) : response.json();
}

export async function download(path: string, filename: string, token?: string) {
  const response = await request(path, token);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
