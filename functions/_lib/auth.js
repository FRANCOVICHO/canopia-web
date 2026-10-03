import { verifyJwt } from "./jwt.js";

export async function checkAdmin(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return { ok: false, error: "Token requerido." };
  }

  // Fallback a ADMIN_TOKEN
  const adminToken = env.ADMIN_TOKEN;
  if (adminToken && token === adminToken) {
    return { ok: true };
  }

  // Validar como JWT
  if (env.JWT_SECRET) {
    const payload = await verifyJwt(token, env.JWT_SECRET);
    const adminEmails = (env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
    if (payload && payload.email && adminEmails.includes(payload.email)) {
      return { ok: true };
    }
  }

  return { ok: false, error: "Clave o acceso incorrecto." };
}
