// scripts/deploy-web.js
// ---------------------------------------------------------------------------
// Publishes the already-built web export (dist/) to the linked Vercel project.
//
// `npm run web:build` runs `expo export --platform web`, which REGENERATES dist/
// from scratch — so a `.vercel` link can't live inside it. Instead we identify
// the existing linked project the CI-standard way: by setting VERCEL_ORG_ID and
// VERCEL_PROJECT_ID (read from the repo's .vercel/project.json) before deploying
// the dist/ directory as a production deployment.
//
// One-time setup on a new machine: `vercel login` (and, if not linked yet,
// `vercel link`). After that, `npm run web:publish` is the single command.
// ---------------------------------------------------------------------------

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const linkPath = path.join(root, ".vercel", "project.json");
const distPath = path.join(root, "dist");

if (!fs.existsSync(linkPath)) {
  console.error(
    "[web:publish] No .vercel/project.json found. Run `vercel link` once to link this folder to your Vercel project, then retry.",
  );
  process.exit(1);
}

if (!fs.existsSync(distPath)) {
  console.error(
    "[web:publish] No dist/ found. Run `npm run web:build` first (web:publish normally does this for you).",
  );
  process.exit(1);
}

const link = JSON.parse(fs.readFileSync(linkPath, "utf8"));
if (!link.orgId || !link.projectId) {
  console.error(
    "[web:publish] .vercel/project.json is missing orgId/projectId. Re-run `vercel link`.",
  );
  process.exit(1);
}

console.log(
  `[web:publish] Deploying dist/ to Vercel project "${link.projectName || link.projectId}" (production)...`,
);

try {
  execSync("vercel deploy dist --prod --yes", {
    stdio: "inherit",
    cwd: root,
    env: {
      ...process.env,
      VERCEL_ORG_ID: link.orgId,
      VERCEL_PROJECT_ID: link.projectId,
    },
  });
} catch {
  console.error(
    "\n[web:publish] Deploy failed. If it mentions an invalid/expired token, run `vercel login` once, then retry `npm run web:publish`.",
  );
  process.exit(1);
}
