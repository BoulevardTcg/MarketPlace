export const JWT_KEY = "boulevardtcg-market-jwt";
const API = import.meta.env.VITE_API_URL ?? "";

export function getApiUrl(): string {
  return API;
}

export function getJwt(): string | null {
  return localStorage.getItem(JWT_KEY);
}

export function fetchWithAuth(path: string, options: RequestInit = {}): Promise<Response> {
  const jwt = getJwt();
  const headers = new Headers(options.headers);
  if (jwt) headers.set("Authorization", `Bearer ${jwt}`);
  return fetch(`${API}${path}`, { ...options, headers });
}
