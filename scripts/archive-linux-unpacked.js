const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const dist = path.join(root, "dist");
const source = path.join(dist, "linux-unpacked");
const target = path.join(dist, `chatgpt-linux-${pkg.version}-linux-unpacked.tar.gz`);

if (!fs.existsSync(source)) {
  console.error(`Missing build output: ${source}`);
  process.exit(1);
}

fs.rmSync(target, { force: true });

const result = spawnSync("tar", ["-czf", target, "-C", dist, "linux-unpacked"], {
  stdio: "inherit"
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

const size = fs.statSync(target).size;
console.log(`Created ${path.relative(root, target)} (${size} bytes)`);
