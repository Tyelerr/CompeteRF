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

// Vercel silently drops any `node_modules` directory from a deployment. Expo's
// web export puts vendored icon fonts under dist/assets/node_modules/... — so on
// the deployed site those fonts 404 and every icon renders as an empty box.
// Rename that folder to a name Vercel keeps, and rewrite the references in the
// exported text files (JS bundle, html, css, json, maps) to match.
function remapNodeModulesAssets(distDir) {
  const nmDir = path.join(distDir, "assets", "node_modules");
  if (!fs.existsSync(nmDir)) return;
  const textExt = new Set([".js", ".html", ".json", ".css", ".map"]);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue; // skip the font binaries
        walk(p);
      } else if (textExt.has(path.extname(entry.name))) {
        const content = fs.readFileSync(p, "utf8");
        if (content.includes("assets/node_modules")) {
          fs.writeFileSync(
            p,
            content.split("assets/node_modules").join("assets/nm"),
          );
        }
      }
    }
  };
  walk(distDir);
  // A leftover assets/nm from a previous publish (expo export doesn't clean it)
  // would make the rename fail with EPERM on Windows — remove it first.
  const target = path.join(distDir, "assets", "nm");
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(nmDir, target);
  console.log(
    "[web:publish] Remapped assets/node_modules -> assets/nm so icon fonts deploy (Vercel ignores node_modules).",
  );
}

remapNodeModulesAssets(distPath);

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
