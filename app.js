"use strict";

import { HostStore, validateHost } from "./host-store.js";

const hostGrid = document.getElementById("host-grid");
const hostSearch = document.getElementById("host-search");
const connectSearch = document.getElementById("search-connect");
const hostCount = document.getElementById("host-count");
const emptySearch = document.getElementById("empty-search");
const hostsView = document.getElementById("hosts-view");
const genericView = document.getElementById("generic-view");
const sidebar = document.getElementById("sidebar");
const toast = document.getElementById("toast");
const hostGroups = document.getElementById("host-groups");
const noHosts = document.getElementById("no-hosts");
const folderStrip = document.getElementById("folder-strip");
const hostDialog = document.getElementById("host-dialog");
const hostForm = document.getElementById("host-form");
const formError = document.getElementById("host-form-error");
const hostStore = new HostStore(window.localStorage);
let storedHosts = [];
let activeFolder = "";
let editingHostId = "";

// Clearly fictional, inert examples retain the dense shell preview until a real host is saved.
const previewHosts = [
  { label: "Ubuntu", user: "ubuntu", icon: "ubuntu" },
  { label: "staging", user: "deploy", icon: "server" },
  { label: "Cent OS", user: "opc", icon: "centos" },
  { label: "Alma Linux", user: "admin", icon: "alma" },
  { label: "new server", user: "ubuntu", icon: "ubuntu" },
  { label: "production", user: "devops", icon: "ubuntu" },
  { label: "Rocky Linux", user: "rocky", icon: "rocky" },
  { label: "build host", user: "admin", icon: "server" },
  { label: "Linux", user: "rocky", icon: "server" },
  { label: "remote host", user: "operator", icon: "server" },
  { label: "local shell", user: "local", icon: "server" },
  { label: "test machine", user: "tester", icon: "rocky" },
  { label: "Red Hat", user: "ec2-user", icon: "redhat" },
  { label: "development", user: "developer", icon: "server" },
];

const palettes = {
  ubuntu: { color: "#EB5820", title: "Ubuntu Linux" },
  server: { color: "#006194", title: "SSH host" },
  centos: { color: "#F0A51A", title: "CentOS" },
  alma: { color: "#06316E", title: "Linux host" },
  rocky: { color: "#31CFA0", title: "Rocky Linux" },
  redhat: { color: "#F00012", title: "Red Hat Linux" },
};

function iconMarkup(kind) {
  const art = {
    ubuntu: '<circle cx="12" cy="12" r="6.7"/><circle cx="12" cy="5.3" r="1.25" fill="currentColor" stroke="none"/><circle cx="6.2" cy="15.4" r="1.25" fill="currentColor" stroke="none"/><circle cx="17.8" cy="15.4" r="1.25" fill="currentColor" stroke="none"/><path d="m8.2 8 2.4 1.4m3 0L16 8m-5 5.2-2.5 1.4m4.5-1.4 2.5 1.4"/>',
    server: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M6.5 7.5h2v3h-2zm0 6h2v3h-2zm5-6h6m-6 3h6m-6 3h6m-6 3h6"/>',
    centos: '<path d="m12 3 4.3 4.3v9.4L12 21l-4.3-4.3V7.3zM7.7 7.3 4 11l3.7 3.7m8.6-7.4L20 11l-3.7 3.7M12 3v6m0 2.2v6m-4.3-6H14m-6.3 0H16"/>',
    alma: '<path d="m12 3 2.3 2.2 3.1.5.5 3.1 2.2 2.2-2.2 2.3-.5 3-3.1.6-2.3 2.1-2.2-2.1-3.1-.6-.5-3L4 11l2.2-2.2.5-3 3.1-.5z"/><path d="M8 14.5 12 8l4 6.5h-2L12 12l-2 2.5z"/>',
    rocky: '<path d="M4 15.5 10.3 6a2 2 0 0 1 3.4 0l6.3 9.5a2 2 0 0 1-1.7 3H5.7a2 2 0 0 1-1.7-3Z"/><path d="m8 15 3-4 2 2 2-3 2 5z"/>',
    redhat: '<path d="M5 9c2.8-2.4 5-2.2 7 .3 1.7 2.1 3.4 2.7 6 1.2l1.1 3c-3 2.3-6 2.4-8.5.7-1.8-1.3-3.4-1.6-6 .5L3.5 12zm-.7-2.4a.8.8 0 1 1-1.6 0 .8.8 0 0 1 1.6 0Z"/><path d="M7 16.2c2.2 1.5 5.9 2.3 9.5.6M8 5c1.7-1.2 4-1.7 6-1"/>',
  };
  return `<svg viewBox="0 0 24 24" role="img" aria-label="${palettes[kind].title}">${art[kind] || art.server}</svg>`;
}

function renderHosts(query = "") {
  const normalized = query.trim().toLocaleLowerCase();
  const profileMode = storedHosts.length > 0;
  const matches = (profileMode ? storedHosts : previewHosts).filter((host) => {
    const searchText = profileMode
      ? `${host.label} ${host.username} ${host.hostname} ${host.folder} ssh ${host.username}@${host.hostname}`
      : `${host.label} ${host.user} ssh ${host.user}@${host.label}`;
    return searchText.toLocaleLowerCase().includes(normalized)
      && (!activeFolder || (host.folder || "") === activeFolder);
  });
  hostGrid.replaceChildren(...matches.map((host) => {
    const palette = palettes[host.icon] || palettes.server;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "host-card";
    button.setAttribute("aria-label", storedHosts.includes(host)
      ? `${host.label}, SSH, ${host.username}@${host.hostname}, port ${host.port}`
      : `${host.label}, SSH, ${host.user}; fictional preview only`);
    button.style.setProperty("--host-color", palette.color);
    const icon = document.createElement("span");
    icon.className = "host-icon";
    icon.innerHTML = iconMarkup(host.icon);
    const info = document.createElement("span");
    info.className = "host-info";
    const label = document.createElement("span");
    label.className = "host-name";
    label.textContent = host.label;
    const meta = document.createElement("span");
    meta.className = "host-meta";
    meta.textContent = storedHosts.includes(host)
      ? `ssh, ${host.username}${host.folder ? ` · ${host.folder}` : ""}`
      : `ssh, ${host.user}`;
    info.append(label, meta);
    button.append(icon, info);
    button.addEventListener("click", () => showToast("Fictional preview only. Save your own host profile to edit a connection."));
    return button;
  }));
  hostCount.textContent = normalized ? `${matches.length}` : "";
  const hasStoredHosts = profileMode;
  const showPreview = !hasStoredHosts;
  const hasResults = matches.length > 0;
  const noMatches = showPreview && !hasResults && !normalized;
  const searchMiss = !hasResults && Boolean(normalized);
  hostGrid.hidden = !hasResults || Boolean(activeFolder && !showPreview);
  hostGroups.hidden = showPreview;
  emptySearch.hidden = !searchMiss;
  noHosts.hidden = !noMatches;
  if (hasStoredHosts) renderFolders(normalized);
  else {
    folderStrip.hidden = true;
    hostGroups.replaceChildren();
  }
  if (hasStoredHosts) {
    hostGrid.hidden = true;
    renderGroupedHosts(normalized);
  }
}

function renderFolders(query = "") {
  const folders = [...new Set(storedHosts.map((host) => host.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  folderStrip.hidden = folders.length === 0 && !activeFolder;
  folderStrip.replaceChildren();
  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = `folder-chip${activeFolder ? "" : " is-selected"}`;
  allButton.textContent = `All hosts · ${storedHosts.length}`;
  allButton.setAttribute("aria-pressed", String(!activeFolder));
  allButton.addEventListener("click", () => { activeFolder = ""; renderHosts(hostSearch.value); });
  folderStrip.append(allButton);
  for (const folder of folders) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `folder-chip${activeFolder === folder ? " is-selected" : ""}`;
    button.textContent = `${folder} · ${storedHosts.filter((host) => host.folder === folder).length}`;
    button.setAttribute("aria-pressed", String(activeFolder === folder));
    button.addEventListener("click", () => { activeFolder = activeFolder === folder ? "" : folder; renderHosts(hostSearch.value); });
    folderStrip.append(button);
  }
}

function makeStoredHostCard(host) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "host-card stored-host-card";
  button.setAttribute("aria-label", `${host.label}, SSH, ${host.username}@${host.hostname}, port ${host.port}; select to edit`);
  button.style.setProperty("--host-color", palettes.server.color);
  const icon = document.createElement("span");
  icon.className = "host-icon";
  icon.innerHTML = iconMarkup("server");
  const info = document.createElement("span");
  info.className = "host-info";
  const label = document.createElement("span");
  label.className = "host-name";
  label.textContent = host.label;
  const meta = document.createElement("span");
  meta.className = "host-meta";
  meta.textContent = `${host.username} · ${host.hostname}:${host.port}${host.folder ? ` · ${host.folder}` : ""}`;
  info.append(label, meta);
  const editHint = document.createElement("span");
  editHint.className = "host-edit-hint";
  editHint.textContent = "Edit";
  button.append(icon, info, editHint);
  button.addEventListener("click", () => openHostEditor(host));
  return button;
}

function renderGroupedHosts(query = "") {
  const needle = query.trim().toLocaleLowerCase();
  const shown = storedHosts.filter((host) =>
    (!activeFolder || (host.folder || "") === activeFolder)
      && (!needle || `${host.label} ${host.hostname} ${host.username} ${host.folder}`.toLocaleLowerCase().includes(needle)),
  );
  const groups = new Map();
  for (const host of shown) {
    const folder = host.folder || "Unfiled";
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(host);
  }
  const sorted = [...groups.entries()].sort(([a], [b]) => a === "Unfiled" ? 1 : b === "Unfiled" ? -1 : a.localeCompare(b));
  hostGroups.replaceChildren(...sorted.map(([folder, hosts]) => {
    const section = document.createElement("section");
    section.className = "host-group";
    const heading = document.createElement("h2");
    heading.className = "host-group-title";
    heading.textContent = folder;
    section.append(heading);
    const grid = document.createElement("div");
    grid.className = "host-grid";
    grid.append(...hosts.map(makeStoredHostCard));
    section.append(grid);
    return section;
  }));
  hostCount.textContent = needle ? String(shown.length) : String(storedHosts.length);
}

const genericViews = {
  "Port Forwarding": { title: "Set up port forwarding", description: "Save port forwarding to access databases, web apps, and other services.", icon: "forward", action: "New forwarding" },
  "SFTP": { title: "Secure file transfer", description: "Transfer files securely after connecting to an SSH host.", icon: "folder" },
  "Keychain": { title: "Your keys, on this device", description: "SSH keys and saved credentials will be stored securely in your Windows keychain.", icon: "key" },
  "Known Hosts": { title: "No known hosts yet", description: "Server fingerprints will appear here after verifying an SSH connection.", icon: "fingerprint" },
  "Snippets": { title: "Save a command for later", description: "Keep reusable commands close at hand for your next terminal session.", icon: "braces", action: "New snippet" },
  "Logs": { title: "Connection history", description: "Your local connection activity will appear here.", icon: "logs" },
  "Settings": { title: "Make your workspace yours", description: "Theme, terminal behavior, keybindings, and more.", icon: "settings" },
  "Serial": { title: "Serial connections", description: "Serial device support is planned for a later milestone.", icon: "terminal" },
};

function genericIcon(name) {
  const paths = {
    forward: '<path d="M3 6h8V3l6 7-6 7v-3H7a4 4 0 0 1-4-4z"/>',
    folder: '<path d="M3 6h7l2 2h9v9H3z"/><path d="M5 11h14m-9 0v4m4-4v4"/>',
    key: '<circle cx="8" cy="7" r="3"/><path d="M8 10v7m0-3h3m-3-2h2"/>',
    fingerprint: '<path d="M4 15V9a8 8 0 0 1 16 0v6m-12 1v-5a4 4 0 0 1 8 0v5m-4 1v-4m-8 0c0 2 .5 3.5 1.5 4.5m14-4.5c0 1.7-.3 3-.8 4"/>',
    braces: '<path d="m7 5-4 5 4 5m10-10 4 5-4 5m-3-12-4 14"/>',
    logs: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2"/>',
    settings: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="2.5"/>',
    terminal: '<rect x="2.5" y="4" width="15" height="12" rx="2"/><path d="m6 8 2 2-2 2m4 0h4"/>',
  };
  return `<svg viewBox="0 0 20 20" aria-hidden="true">${paths[name] || paths.terminal}</svg>`;
}

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function showView(name) {
  const isHosts = name === "Hosts";
  hostsView.hidden = !isHosts;
  genericView.hidden = isHosts;
  document.querySelectorAll(".nav-item").forEach((item) => {
    const active = item.dataset.nav === name;
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  if (isHosts) {
    hostSearch.focus({ preventScroll: true });
    return;
  }
  const view = genericViews[name] || genericViews.SFTP;
  document.getElementById("view-title").textContent = view.title;
  document.getElementById("view-description").textContent = view.description;
  document.getElementById("empty-icon").innerHTML = genericIcon(view.icon);
  const action = document.getElementById("empty-action");
  action.hidden = !view.action;
  action.replaceChildren();
  if (view.action) {
    action.insertAdjacentHTML("afterbegin", `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>`);
    action.append(document.createTextNode(view.action));
    action.onclick = () => showToast(`${view.action} will be available in a later milestone.`);
  }
}

document.querySelectorAll("[data-nav]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.nav));
});
document.getElementById("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (hostSearch.value.trim()) showToast("Search your saved hosts, or add a host to connect.");
});
hostSearch.addEventListener("input", () => {
  connectSearch.disabled = hostSearch.value.trim().length === 0;
  renderHosts(hostSearch.value);
});
function resetHostForm() {
  hostForm.reset();
  hostForm.elements.port.value = "22";
  formError.hidden = true;
  formError.textContent = "";
}

function openHostEditor(host = null) {
  resetHostForm();
  editingHostId = host?.id || "";
  document.getElementById("host-dialog-title").textContent = host ? "Edit host" : "New host";
  document.getElementById("save-host").textContent = host ? "Save changes" : "Save host";
  document.getElementById("connect-host").hidden = false;
  document.getElementById("delete-host").hidden = !host;
  document.getElementById("host-label").value = host?.label || "";
  document.getElementById("host-hostname").value = host?.hostname || "";
  document.getElementById("host-port").value = host?.port || "22";
  document.getElementById("host-username").value = host?.username || "";
  document.getElementById("host-authentication").value = host?.authentication || "key";
  document.getElementById("host-folder").value = host?.folder || "";
  hostDialog.showModal();
  document.getElementById("host-label").focus();
}

function readHostForm() {
  const formData = new FormData(hostForm);
  return validateHost({
    id: editingHostId || crypto.randomUUID(),
    label: formData.get("label"),
    hostname: formData.get("hostname"),
    port: formData.get("port"),
    username: formData.get("username"),
    authentication: formData.get("authentication"),
    folder: formData.get("folder"),
  });
}

document.getElementById("new-host").addEventListener("click", () => openHostEditor());
document.getElementById("new-host-menu").addEventListener("click", () => openHostEditor());
document.getElementById("empty-new-host").addEventListener("click", () => openHostEditor());
document.getElementById("create-from-search").addEventListener("click", () => openHostEditor());
document.getElementById("close-host-dialog").addEventListener("click", () => hostDialog.close());
document.getElementById("cancel-host").addEventListener("click", () => hostDialog.close());
hostDialog.addEventListener("click", (event) => {
  if (event.target === hostDialog) hostDialog.close();
});
document.getElementById("connect-host").addEventListener("click", () => {
  try {
    const candidate = readHostForm();
    if (!editingHostId) {
      if (storedHosts.length === 0 && !window.confirm("Save this connection profile on this device before continuing? The address and username are not encrypted in this preview. SSH connections are not implemented yet.")) return;
      hostStore.save(candidate);
      loadHosts();
    }
    hostDialog.close();
    showToast(editingHostId
      ? "SSH connections are not implemented yet. Existing host details are unchanged."
      : "SSH connections are not implemented yet. The host profile was saved on this device.");
  } catch (error) {
    formError.textContent = error.message;
    formError.hidden = false;
    hostForm.reportValidity();
  }
});
document.getElementById("delete-host").addEventListener("click", () => {
  if (!editingHostId || !window.confirm("Delete this host profile from this device?")) return;
  try {
    hostStore.delete(editingHostId);
    loadHosts();
    hostDialog.close();
    showToast("Host profile removed from this device.");
  } catch (error) {
    formError.textContent = error.message;
    formError.hidden = false;
  }
});
hostForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const saved = hostStore.save(readHostForm());
    loadHosts();
    hostDialog.close();
    showToast(`${saved.label} saved on this device. Credentials have not been collected or stored.`);
  } catch (error) {
    formError.textContent = error.message;
    formError.hidden = false;
    hostForm.reportValidity();
  }
});
document.getElementById("local-terminal").addEventListener("click", () => showToast("Local terminal sessions arrive after host profiles and the terminal core."));
document.getElementById("top-add").addEventListener("click", () => showToast("Session tabs arrive with the terminal core."));
document.getElementById("menu-toggle").addEventListener("click", (event) => {
  const collapsed = document.body.classList.toggle("sidebar-collapsed");
  event.currentTarget.setAttribute("aria-expanded", String(!collapsed));
  sidebar.setAttribute("aria-label", collapsed ? "Main navigation, collapsed" : "Main navigation");
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
    event.preventDefault();
    if (!hostDialog.open) openHostEditor();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && hostDialog.open) {
    event.preventDefault();
    hostForm.requestSubmit();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    showView("Hosts");
    hostSearch.focus();
    hostSearch.select();
  }
  if (event.key === "Escape" && document.activeElement === hostSearch) {
    hostSearch.value = "";
    hostSearch.dispatchEvent(new Event("input", { bubbles: true }));
  }
});

function loadHosts() {
  try {
    storedHosts = hostStore.list();
    if (activeFolder && !storedHosts.some((host) => host.folder === activeFolder)) activeFolder = "";
    renderHosts(hostSearch.value);
  } catch (error) {
    storedHosts = [];
    renderHosts(hostSearch.value);
    showToast(error.message);
  }
}

loadHosts();