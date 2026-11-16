export async function pbFetch(env, path, options = {}) {
  const base = (env.PB_URL || "https://pb.canopiagrow.com").replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

export function getToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : auth || null;
}

export async function pbVerifyToken(env, token) {
  if (!token || token.length > 4096) return null;
  const { ok, data } = await pbFetch(env, "/api/collections/users/auth-refresh", {
    method: "POST",
    headers: { Authorization: token },
  });
  return ok && data?.record?.id ? data.record : null;
}
