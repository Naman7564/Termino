import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { once } from "node:events";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const edge = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const screenshot = resolve(process.argv[2] || join(root, "termino-host-manager.png"));
const debugLog = join(root, ".edge-browser-test.log");
assert.ok(existsSync(edge), "Microsoft Edge is required for the browser interaction test.");
assert.equal(typeof WebSocket, "function", "Node.js with WebSocket support is required for the browser interaction test.");

const rootUrl = join(root, "index.html");
assert.ok(existsSync(rootUrl), "project files are present");
const port = 23200 + Math.floor(Math.random() * 10000);
const debugPort = 33200 + Math.floor(Math.random() * 10000);
const profile = await import("node:fs/promises").then((fs) => fs.mkdtemp(join(os.tmpdir(), "termino-browser-test-")));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [join(root, "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
});
const serverExit = once(server, "exit");
let browser;
let browserExit;
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

async function requestCDP(ws, method, params = {}) {
  const id = ++requestCDP.nextId;
  const answer = new Promise((resolveResponse, rejectResponse) => {
    const deadline = setTimeout(() => {
      ws.removeEventListener("message", handle);
      rejectResponse(new Error(`Chromium DevTools command timed out: ${method}`));
    }, 12000);
    async function handle(event) {
      const message = JSON.parse(typeof event.data === "string" ? event.data : await event.data.text());
      if (message.id !== id) return;
      clearTimeout(deadline);
      ws.removeEventListener("message", handle);
      if (message.error) rejectResponse(new Error(`${method}: ${message.error.message}`));
      else resolveResponse(message.result || {});
    }
    ws.addEventListener("message", handle);
  });
  ws.send(JSON.stringify({ id, method, params }));
  return answer;
}
requestCDP.nextId = 0;

async function evaluate(ws, expression) {
  const result = await requestCDP(ws, "Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser-side test expression failed.");
  return result.result?.value;
}

async function waitFor(condition, name) {
  let last;
  for (let index = 0; index < 100; index++) {
    if (browser && browser.exitCode !== null && browser.signalCode !== null) throw new Error("Edge exited before the page finished loading.");
    try {
      last = await condition();
      if (last) return last;
    } catch {}
    await wait(100);
  }
  throw new Error(`Browser timed out waiting for ${name}.`);
}

try {
  await waitFor(async () => {
    const response = await fetch(base).catch(() => null);
    return response?.ok;
  }, "the local preview server");

  browser = spawn(edge, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--no-proxy-server", "--remote-allow-origins=*", `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`, "--window-size=1280,720", `${base}/`,
  ], { cwd: root, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  browserExit = once(browser, "exit");
  let edgeError = "";
  browser.stderr.setEncoding("utf8");
  browser.stderr.on("data", (chunk) => { edgeError += chunk; });

  let version;
  try {
    version = await waitFor(async () => fetch(`http://127.0.0.1:${debugPort}/json/version`)
      .then((response) => response.ok ? response.json() : null).catch(() => null), "the Edge DevTools endpoint");
  } catch (error) {
    await writeFile(debugLog, `pid=${browser.pid}\nexitCode=${browser.exitCode}\nsignal=${browser.signalCode}\n${edgeError}`);
    throw error;
  }
  let targets = await waitFor(async () => fetch(`http://127.0.0.1:${debugPort}/json/list`)
    .then((response) => response.ok ? response.json() : null).catch(() => null), "the preview page target");
  assert.ok(version.Browser?.includes("Edg"), "page was launched by Microsoft Edge");
  let target = targets.find((candidate) => candidate.type === "page" && candidate.url === `${base}/`);
  if (!target) {
    const created = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`${base}/`)}`, { method: "PUT" }).catch(() => null);
    if (created.ok) target = await created.json();
  }
  if (!target) {
    targets = await waitFor(async () => fetch(`http://127.0.0.1:${debugPort}/json/list`)
      .then((response) => response.ok ? response.json() : null).catch(() => null), "a newly-opened preview tab");
    target = targets.find((candidate) => candidate.type === "page" && candidate.url.includes(`:${port}/`));
  }
  assert.ok(target, "the local application loaded in Edge");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await waitFor(() => ws.readyState === WebSocket.OPEN, "the page DevTools connection");
  const enabled = await requestCDP(ws, "Runtime.enable");
  assert.ok(enabled);
  await requestCDP(ws, "Page.enable");
  const initialState = await waitFor(async () => evaluate(ws, `(() => {
    const grid = document.querySelector('#host-grid');
    const cards = [...grid.querySelectorAll('.host-card')];
    if (!cards.length) return null;
    return {
      title: document.title,
      viewport: [document.documentElement.clientWidth, document.documentElement.clientHeight],
      cards: cards.length,
      firstCard: cards[0].querySelector('.host-name')?.textContent,
      sidebarWidth: document.querySelector('.sidebar').getBoundingClientRect().width,
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      palette: getComputedStyle(document.documentElement).getPropertyValue('--main').trim(),
      initialStorage: localStorage.getItem('termino.hosts.v1'),
    };
  })()`), "the initial host view");

  assert.equal(initialState.title, "Termino");
  assert.equal(initialState.sidebarWidth, 185, "reference sidebar is 185px on desktop");
  assert.equal(initialState.columns, 3, "reference desktop host grid has three columns");
  assert.equal(initialState.palette, "#1D2033", "reference content token is preserved");
  assert.equal(initialState.initialStorage, null, "an empty browser profile remains empty until the user saves a host");

  const capture = await requestCDP(ws, "Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  await writeFile(screenshot, Buffer.from(capture.data, "base64"));

  const saveResult = await evaluate(ws, `(() => {
    document.querySelector('#new-host').click();
    const dialog = document.querySelector('#host-dialog');
    if (!dialog.open) return { failure: 'New host button did not open the form.' };
    const values = { label: 'Browser test host', hostname: 'shell-check.example.invalid', port: '2222', username: 'preview-user', authentication: 'key', folder: 'Browser checks' };
    for (const [name, value] of Object.entries(values)) {
      const field = document.querySelector('[name="' + name + '"]');
      if (!field) return { failure: 'Missing form field: ' + name };
      field.value = value;
      field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    }
    document.querySelector('#host-form').requestSubmit();
    const saved = JSON.parse(localStorage.getItem('termino.hosts.v1') || 'null');
    return { openAfterSave: dialog.open, saved, groups: [...document.querySelectorAll('.host-group-title')].map(node => node.textContent), card: !!document.querySelector('.stored-host-card'), toast: document.querySelector('#toast').textContent };
  })()`);
  assert.ok(!saveResult.failure, saveResult.failure);
  assert.equal(saveResult.openAfterSave, false, "Save host closes the form");
  assert.equal(saveResult.saved.version, 1);
  assert.equal(saveResult.saved.hosts.length, 1);
  assert.deepEqual(saveResult.saved.hosts[0], {
    id: saveResult.saved.hosts[0].id,
    label: "Browser test host",
    hostname: "shell-check.example.invalid",
    port: 2222,
    username: "preview-user",
    authentication: "key",
    folder: "Browser checks",
  });
  assert.ok(!/(?:password|private.?key|passphrase|secret|credential|identity.?file)/i.test(JSON.stringify(saveResult.saved)), "host storage contains no secret or credential fields");
  assert.ok(saveResult.groups.includes("Browser checks"), `new host appears in its folder group: ${JSON.stringify(saveResult)}`);
  assert.ok(saveResult.card, "saved host renders as an editable host card");

  const searchResult = await evaluate(ws, `(() => {
    const search = document.querySelector('#host-search');
    search.value = 'shell-check.example.invalid';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    return { visibleCard: document.querySelectorAll('.stored-host-card').length, group: document.querySelector('.host-group-title')?.textContent, visibleAddress: document.body.innerText.includes('shell-check.example.invalid') };
  })()`);
  assert.equal(searchResult.visibleCard, 1, "search matches a saved hostname");
  assert.equal(searchResult.visibleAddress, true);

  const editResult = await evaluate(ws, `(() => {
    document.querySelector('#host-search').value = '';
    document.querySelector('#host-search').dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.stored-host-card').click();
    const dialog = document.querySelector('#host-dialog');
    if (!dialog.open) return { failure: 'Saved host card did not open its editor.' };
    document.querySelector('#host-label').value = 'Updated local test';
    document.querySelector('#save-host').click();
    const data = JSON.parse(localStorage.getItem('termino.hosts.v1'));
    return { label: data.hosts[0].label, count: data.hosts.length };
  })()`);
  assert.ok(!editResult.failure, editResult.failure);
  assert.equal(editResult.label, "Updated local test");
  assert.equal(editResult.count, 1, "editing updates the same saved profile");

  const invalidResult = await evaluate(ws, `(() => {
    document.querySelector('#new-host').click();
    document.querySelector('#host-label').value = 'Invalid test';
    document.querySelector('#host-hostname').value = 'ssh://not-a-host';
    document.querySelector('#host-port').value = '2222';
    document.querySelector('#host-username').value = 'user';
    document.querySelector('#save-host').click();
    return { open: document.querySelector('#host-dialog').open, error: document.querySelector('#host-form-error').textContent, count: JSON.parse(localStorage.getItem('termino.hosts.v1')).hosts.length };
  })()`);
  assert.equal(invalidResult.open, true, "invalid input keeps the form open");
  assert.ok(invalidResult.error.includes("hostname"), "invalid hostname shows an explanatory form error");
  assert.equal(invalidResult.count, 1, "invalid input does not modify the saved records");

  const cancelResult = await evaluate(ws, `(() => {
    document.querySelector('#cancel-host').click();
    const removeConfirm = window.confirm;
    window.confirm = () => true;
    document.querySelector('.stored-host-card').click();
    document.querySelector('#delete-host').click();
    window.confirm = removeConfirm;
    return { count: JSON.parse(localStorage.getItem('termino.hosts.v1')).hosts.length, dialogOpen: document.querySelector('#host-dialog').open };
  })()`);
  assert.equal(cancelResult.count, 0, "deleting a profile clears only the selected local record");
  assert.equal(cancelResult.dialogOpen, false);
  await ws.close();
  console.log(`PASS: Edge ${version.Browser}; ${initialState.viewport.join("×")} viewport; exact sidebar/grid/palette; New host → locally saved profile → folder display/search/edit; invalid address blocked; secret-free storage; delete. Screenshot: ${screenshot}`);
} finally {
  if (browser && browser.exitCode === null && browser.signalCode === null) browser.kill();
  if (browser && browser.exitCode === null && browser.signalCode === null) await browserExit?.catch(() => {});
  if (server.exitCode === null && server.signalCode === null) server.kill();
  if (server.exitCode === null && server.signalCode === null) await serverExit.catch(() => {});
  await import("node:fs/promises").then((fs) => fs.rm(profile, { recursive: true, force: true })).catch(() => {});
}