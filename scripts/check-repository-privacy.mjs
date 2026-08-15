import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const candidates = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  encoding: "utf8",
}).split("\0").filter(Boolean).map((path) => path.replaceAll("\\", "/"));

const forbidden = [
  { label: "Dialogue Lab data directory", pattern: /^data\//i },
  { label: "local source asset directory", pattern: /^assets\//i },
  { label: "temporary working directory", pattern: /^tmp\//i },
  { label: "internal UI capture", pattern: /^docs\/ui-references\//i },
  { label: "SQLite database", pattern: /\.(?:sqlite|db)(?:-(?:shm|wal))?$/i },
  { label: "credential encryption key", pattern: /(^|\/)master\.key$/i },
  { label: "environment file", pattern: /(^|\/)\.env(?:\..+)?$/i, allow: /(^|\/)\.env\.example$/i },
  { label: "private key or certificate", pattern: /\.(?:pem|key|p12|pfx)$/i },
];

const violations = candidates.flatMap((path) => forbidden
  .filter((rule) => rule.pattern.test(path) && !rule.allow?.test(path))
  .map((rule) => ({ path, label: rule.label })));

const secretPatterns = [
  { label: "embedded private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "hard-coded credential", pattern: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\b\s*[:=]\s*["'`][^"'`\r\n]{12,}["'`]/i },
];

for (const path of candidates) {
  let bytes;
  try {
    if (statSync(path).size > 2 * 1024 * 1024) continue;
    bytes = readFileSync(path);
  } catch { continue; }
  if (bytes.includes(0)) continue;
  const text = bytes.toString("utf8");
  for (const rule of secretPatterns) if (rule.pattern.test(text)) violations.push({ path, label: rule.label });
}

if (violations.length) {
  console.error("Repository privacy check failed. Remove or ignore these files before committing:");
  for (const violation of violations) console.error(`- ${violation.path} (${violation.label})`);
  process.exitCode = 1;
} else {
  console.log(`Repository privacy check passed (${candidates.length} publishable files inspected).`);
}
