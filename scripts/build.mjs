import fs from "node:fs";

const url = (process.env.EASYCHAT_SUPABASE_URL || "").trim();
const key = (process.env.EASYCHAT_SUPABASE_KEY || "").trim();
const bucket = (process.env.EASYCHAT_STORAGE_BUCKET || "chat-files").trim();

const isValidUrl = /^https:\/\/[^\s]+\.supabase\.co(?:\/.*)?$/i.test(url);
if (process.env.CI && (!isValidUrl || !key)) {
  throw new Error("Missing EASYCHAT_SUPABASE_URL or EASYCHAT_SUPABASE_KEY in the deployment environment.");
}

const safe = value => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "");
const content = `// Generated at build time. Do not commit real keys to source control.
window.EASYCHAT_SUPABASE_URL = "${safe(url || "https://YOUR-PROJECT.supabase.co")}";
window.EASYCHAT_SUPABASE_KEY = "${safe(key || "YOUR-PUBLISHABLE-KEY")}";
window.EASYCHAT_STORAGE_BUCKET = "${safe(bucket)}";
`;
fs.writeFileSync("supabase-config.js", content, "utf8");
console.log(`EasyChat production config generated (${url ? "configured" : "placeholder"}).`);
