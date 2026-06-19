export function checkAdmin(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const adminToken = env.ADMIN_TOKEN;

  if (!adminToken) {
    return { ok: false, error: "Admin no configurado. Agrega ADMIN_TOKEN en Cloudflare Pages." };
  }
  if (!token || token !== adminToken) {
    return { ok: false, error: "Clave incorrecta." };
  }
  return { ok: true };
}
