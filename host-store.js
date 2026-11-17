"use strict";

export const HOST_STORAGE_KEY = "termino.hosts.v1";
const allowedFields = new Set(["id", "label", "hostname", "port", "username", "authentication", "folder"]);
const credentialField = /password|passphrase|secret|private.?key|identity.?file|credential|token/i;

export function validateHost(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("This host profile must be an object.");
  const unknownFields = Object.keys(input).filter((field) => credentialField.test(field) || !allowedFields.has(field));
  if (unknownFields.length > 0) throw new Error("Host profiles cannot contain password or identity fields; credentials must be collected by the Windows keychain when connecting.");
  const host = {
    id: typeof input.id === "string" ? input.id.trim() : "",
    label: typeof input.label === "string" ? input.label.trim() : "",
    hostname: typeof input.hostname === "string" ? input.hostname.trim() : "",
    port: Number(input.port),
    username: typeof input.username === "string" ? input.username.trim() : "",
    authentication: input.authentication,
    folder: typeof input.folder === "string" ? input.folder.trim() : "",
  };
  if (!host.id || host.id.length > 80) throw new Error("This host profile has an invalid identifier.");
  if (!host.label || host.label.length > 80) throw new Error("Enter a host label between 1 and 80 characters.");
  if (!host.hostname || host.hostname.length > 253 || !/^[a-zA-Z0-9][a-zA-Z0-9.:%_-]*$/.test(host.hostname)) {
    throw new Error("Enter a hostname or IP address without spaces, schemes, or SSH options.");
  }
  if (!Number.isSafeInteger(host.port) || host.port < 1 || host.port > 65535) {
    throw new Error("Port must be a number between 1 and 65535.");
  }
  if (!host.username || host.username.length > 128 || /[\s\x00-\x1f\x7f]/.test(host.username)) {
    throw new Error("Enter a username between 1 and 128 characters, without whitespace.");
  }
  if (host.authentication !== "key" && host.authentication !== "password") {
    throw new Error("Choose key or password authentication.");
  }
  if (host.folder.length > 80 || /[\x00-\x1f\x7f]/.test(host.folder)) {
    throw new Error("Folder names must be at most 80 characters without control characters.");
  }
  return Object.freeze(host);
}

function parseHostCollection(raw) {
  if (!raw) return [];
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Saved host profiles could not be read. They have not been overwritten.");
  }
  if (!data || data.version !== 1 || !Array.isArray(data.hosts) || data.hosts.length > 5000) {
    throw new Error("Saved host profiles use an unsupported format. They have not been overwritten.");
  }
  const ids = new Set();
  return data.hosts.map((input) => {
    const host = validateHost(input);
    if (ids.has(host.id)) throw new Error("Saved host profiles contain a duplicate ID. They have not been overwritten.");
    ids.add(host.id);
    return host;
  });
}

export class HostStore {
  constructor(storage, key = HOST_STORAGE_KEY) {
    this.storage = storage;
    this.key = key;
  }

  list() {
    return parseHostCollection(this.storage.getItem(this.key));
  }

  save(input) {
    const host = validateHost(input);
    const hosts = this.list();
    const index = hosts.findIndex((existing) => existing.id === host.id);
    if (index < 0 && hosts.length >= 5000) throw new Error("The local host-profile limit has been reached.");
    if (index < 0) hosts.push(host);
    else hosts[index] = host;
    this.write(hosts);
    return host;
  }

  delete(id) {
    const hosts = this.list();
    const filtered = hosts.filter((host) => host.id !== id);
    if (filtered.length !== hosts.length) this.write(filtered);
    return filtered.length !== hosts.length;
  }

  write(hosts) {
    // Deliberately project an allowlist: never accept credential/private-key material.
    const stored = hosts.map((host) => ({
      id: host.id,
      label: host.label,
      hostname: host.hostname,
      port: host.port,
      username: host.username,
      authentication: host.authentication,
      folder: host.folder,
    }));
    try {
      this.storage.setItem(this.key, JSON.stringify({ version: 1, hosts: stored }));
    } catch {
      throw new Error("Could not save host profiles in this browser. Check local storage availability and quota.");
    }
  }
}