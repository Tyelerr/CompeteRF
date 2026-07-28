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
  try {
    fs.renameSync(nmDir, target);
  } catch (err) {
    // On Windows a running Metro/Expo dev server keeps a watcher handle on any
    // folder named `node_modules` (including this one under dist/), so the
    // in-place rename fails with EPERM. Fall back to copying the fonts to
    // assets/nm and leaving the locked original in place — Vercel drops the
    // `node_modules` copy from the upload anyway, so only assets/nm ships.
    if (err && err.code === "EPERM") {
      fs.cpSync(nmDir, target, { recursive: true });
      console.log(
        "[web:publish] Rename blocked (dev server watcher); copied assets/node_modules -> assets/nm instead.",
      );
    } else {
      throw err;
    }
  }
  console.log(
    "[web:publish] Remapped assets/node_modules -> assets/nm so icon fonts deploy (Vercel ignores node_modules).",
  );
}

remapNodeModulesAssets(distPath);

// Expo's web export can skip dotfile directories, so copy the Universal/App Link
// association files (public/.well-known) into the deploy output explicitly.
function copyWellKnown(distDir) {
  const src = path.join(root, "public", ".well-known");
  if (!fs.existsSync(src)) return;
  const dest = path.join(distDir, ".well-known");
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    fs.copyFileSync(path.join(src, name), path.join(dest, name));
  }
  console.log("[web:publish] Copied .well-known association files into dist/.");
}
copyWellKnown(distPath);

// SPA fallback: Expo's web export is a single-page app, so a direct hit or
// refresh on a client route (e.g. /billiards) would 404 on Vercel. Rewrite
// unknown paths to index.html. Real files (assets, *.html) match the filesystem
// first and are served as-is, so only app routes fall through to the shell.
function writeSpaConfig(distDir) {
  const cfg = {
    // Universal/App Link association files must be served as real JSON and must
    // NOT fall through to the SPA shell. Vercel matches the filesystem before
    // rewrites, but the extensionless AASA needs an explicit JSON content-type.
    rewrites: [
      { source: "/.well-known/apple-app-site-association", destination: "/.well-known/apple-app-site-association" },
      { source: "/.well-known/assetlinks.json", destination: "/.well-known/assetlinks.json" },
      { source: "/(.*)", destination: "/index.html" },
    ],
    // Force the HTML shell to always revalidate so a new deploy (with a new
    // entry-<hash>.js) shows up without a manual hard-refresh. The hashed JS/CSS
    // assets are content-addressed, so they stay cached immutably.
    headers: [
      {
        source: "/",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/index.html",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/_expo/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Apple requires the AASA (no file extension) to be application/json.
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ],
  };
  fs.writeFileSync(
    path.join(distDir, "vercel.json"),
    JSON.stringify(cfg, null, 2),
  );
  console.log("[web:publish] Wrote SPA rewrite + cache headers (vercel.json).");
}
writeSpaConfig(distPath);

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
