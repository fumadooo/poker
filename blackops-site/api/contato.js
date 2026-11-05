// POST /api/contato — grava a mensagem em public.site_messages (Supabase, service_role só no servidor) e devolve o protocolo.
const crypto = require("crypto");
const KINDS = new Set(["contato", "reclamacao", "privacidade", "denuncia"]);
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, SALT = process.env.SITE_IP_SALT || "";
const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "") || null;
const sb = (path, init = {}) => fetch(SB + "/rest/v1/" + path, { ...init, headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", ...(init.headers || {}) } });

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "Método não permitido." });
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b !== "object") return res.status(400).json({ ok: false, message: "Requisição inválida." });
  if (b.website) return res.status(200).json({ ok: true, protocol: "BO-0" }); // honeypot
  const kind = KINDS.has(b.kind) ? b.kind : null;
  const anonymous = b.anonymous === true;
  const message = clip(b.message, 5000);
  if (!kind || !message || message.length < 10) return res.status(400).json({ ok: false, message: "Escolha o assunto e escreva uma mensagem com pelo menos 10 caracteres." });
  const name = anonymous ? null : clip(b.name, 160), email = anonymous ? null : clip(b.email, 200), phone = anonymous ? null : clip(b.phone, 40);
  if (!anonymous && !email && !phone) return res.status(400).json({ ok: false, message: "Informe e-mail ou telefone, ou marque a opção anônima." });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, message: "E-mail inválido." });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "0";
  const ipHash = crypto.createHash("sha256").update(SALT + ip).digest("hex");
  // limite: 5 mensagens por IP por hora
  const since = new Date(Date.now() - 3600e3).toISOString();
  const c = await sb(`site_messages?select=id&ip_hash=eq.${ipHash}&created_at=gte.${since}`, { headers: { Prefer: "count=exact", Range: "0-0" } });
  const total = Number((c.headers.get("content-range") || "*/0").split("/")[1] || 0);
  if (total >= 5) return res.status(429).json({ ok: false, message: "Muitas mensagens em pouco tempo. Tente de novo mais tarde." });
  const d = new Date(), ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
  const protocol = `BO-${ymd}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const r = await sb("site_messages", { method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ protocol, kind, anonymous, name, email, phone, message, ip_hash: ipHash }) });
  if (!r.ok) return res.status(500).json({ ok: false, message: "Não foi possível registrar agora. Tente de novo em instantes." });
  return res.status(200).json({ ok: true, protocol });
};
