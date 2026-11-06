// cors.js — Merkeziyetçi CORS yardımcısı.
// Credentialed isteklerde (credentials:"include") Access-Control-Allow-Origin
// "*" olamaz; tarayıcı çerezi bloke eder. Bu yüzden Origin header'ını yansıtıyoruz.
const ALLOWED_ORIGINS = [
  "https://vefaeser-kestik.static.hf.space"
];

export function corsHeaders(request) {
  const origin = request?.headers?.get?.("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
