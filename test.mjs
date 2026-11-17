import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { HostStore, validateHost } from "./host-store.js";

const root = fileURLToPath(new URL("./", import.meta.url));
const html = await readFile(new URL("index.html", import.meta.url), "utf8");
const css = await readFile(new URL("styles.css", import.meta.url), "utf8");
const js = await readFile(new URL("app.js", import.meta.url), "utf8");
const storeSource = await readFile(new URL("host-store.js", import.meta.url), "utf8");
const check = (condition, message) => assert.ok(condition, message);
assert.equal(typeof storeSource, "string");

for (const [token, value] of Object.entries({
  "--main": "#1D2033",
  "--sidebar": "#282B3D",
  "--topbar": "#141729",
  "--toolbar": "#32364A",
  "--secondary-surface": "#3E4257",
  "--text": "#FFFFFF",
  "--muted": "#8D91A5",
})) check(css.includes(`${token}: ${value};`), `missing locked design token ${token}: ${value}`);

for (const label of ["Hosts", "Keychain", "Port Forwarding", "Snippets", "Known Hosts", "Logs", "Vaults", "SFTP", "New host", "Terminal", "Serial"])
  check(html.includes(`>${label}<`) || js.includes(`"${label}"`), `missing reference control: ${label}`);
check(css.includes("repeat(3,minmax(0,1fr))"), "desktop host cards must use three responsive columns");
check(css.includes("border-radius: var(--radius)"), "host cards must use the rounded reference radius");
check(css.includes("overflow-x: clip"), "horizontal overflow must be clipped");
check(css.includes(":focus-visible"), "controls must have visible keyboard focus");
check(css.includes("prefers-reduced-motion"), "reduced motion must be respected");
check(!/transition\s*:\s*all\b/i.test(css), "transition: all is not allowed");
check(!/https?:\/\//.test(js), "shell app must not call out to network services");
check(!/(?:password|private[_ -]?key)\s*[:=]/i.test(js), "demo must not embed credentials");
check(!/localStorage\.(?:setItem)\([^\n]*(?:password|private[_ -]?key)/i.test(js), "application must not persist secrets");
check(js.includes('new HostStore(window.localStorage)'), "host profiles use local-only storage");
check(html.includes("never collects or saves passwords or private keys"), "form must tell users the credential milestone is not implemented");

const memoryStorage = {
  rows: new Map(),
  getItem(key) { return this.rows.get(key) ?? null; },
  setItem(key, value) { this.rows.set(key, value); },
};
const store = new HostStore(memoryStorage);
const hostA = { id: "test-host-1", label: "Build host", hostname: "build.example.net", port: 2202, username: "deployer", authentication: "key", folder: "Staging" };
assert.deepEqual(store.list(), [], "empty profile store starts empty");
assert.deepEqual(store.save(hostA), Object.freeze({ ...hostA }), "saving returns the normalized local profile");
assert.deepEqual(store.list(), [hostA], "saved profiles round-trip locally");
const serialized = memoryStorage.getItem("termino.hosts.v1");
check(serialized.includes("build.example.net"), "host metadata is stored locally");
check(!/(?:password|private[_ -]?key|secret|identityfile)\s*[=:]/i.test(serialized), "stored profiles contain no secret/identity fields");
store.save({ ...hostA, label: "Build host updated", authentication: "password" });
assert.equal(store.list().length, 1, "edits update rather than duplicate a host profile");
assert.equal(store.list()[0].authentication, "password", "authentication method preference persists without a credential");
assert.throws(() => store.save({ ...hostA, id: "invalid-port", port: 65536 }), /Port must be/);
assert.throws(() => store.save({ ...hostA, id: "invalid-host", hostname: "ssh://evil.example" }), /hostname or IP address/);
assert.throws(() => validateHost({ ...hostA, authentication: "password", password: "do-not-accept" }), /password or identity field/);
assert.equal(store.delete(hostA.id), true, "delete removes the selected profile");
assert.deepEqual(store.list(), [], "delete leaves the host store empty");
const preserved = { getItem: () => "{broken", setItem() { throw new Error("must not overwrite"); } };
assert.throws(() => new HostStore(preserved).save(hostA), /not been overwritten/);

const port = 18173 + Math.floor(Math.random() * 20000);
const child = spawn(process.execPath, [fileURLToPath(new URL("server.mjs", import.meta.url))], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
});
const childExited = once(child, "exit");
try {
  const base = `http://127.0.0.1:${port}`;
  let response;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      response = await fetch(`${base}/`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
  }
  check(response?.status === 200, "preview server serves the home page");
  check((await response.text()).includes("Termino"), "served home page identifies the application");
  for (const resource of ["/styles.css", "/app.js", "/host-store.js"]) {
    const asset = await fetch(`${base}${resource}`);
    check(asset.status === 200, `${resource} serves successfully`);
    check(Number(asset.headers.get("content-length")) > 100, `${resource} is not empty`);
  }
  const storeHeaders = await fetch(`${base}/host-store.js`);
  const servedStore = await storeHeaders.text();
  check(servedStore.includes("validateHost"), "browser-visible store exports the validated host schema");
  check((await fetch(`${base}/../../Windows/System.ini`)).status === 404, "static server does not escape its project root");
  check((await fetch(base, { method: "POST" })).status === 405, "static server rejects write methods");
  console.log("PASS: locked theme/layout; accessible host dialog; local CRUD and folder metadata; strict profile validation; credential-field rejection and non-overwrite recovery; offline assets; static-server traversal/write safeguards.");
} finally {
  if (child.exitCode === null && child.signalCode === null) child.kill();
  if (child.exitCode === null && child.signalCode === null) await childExited.catch(() => {});
}