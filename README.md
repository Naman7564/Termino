# Termino

An offline, browser-previewable Windows app shell for a small, local-first terminal workspace. The shell is built from scratch and takes its palette and navigation from the supplied Termius screenshots. Its sample host names and icons are fictional and have no destinations or credentials.

## Run the shell

- Windows PowerShell: run `start.cmd` or `npm start`.
- With Node installed directly: run `node server.mjs` and open `http://127.0.0.1:4173` in Edge.
- Verify host storage and the local static server with `npm test`.
- Verify browser interactions in Edge with `npm run test:browser`; the test writes `termino-host-manager.png`.

This milestone is a local static UI; the server binds to loopback only, accepts GET/HEAD, serves files from this directory and makes no outbound requests.

## Milestone status

- **1 — App shell:** implemented; exact screenshot color tokens, desktop navigation, action bars and three-column host cards; includes search and responsive navigation.
- **2 — Host manager:** implemented for the local browser-preview shell; supports adding, editing, deleting, search, grouping, and separate save/connect actions. Browser `localStorage` contains only a strict allowlist of non-secret host metadata. SSH credentials are not collected, and hosts cannot connect until a native backend is implemented.
- **3 — PTY/SSH terminal and session tabs:** not implemented.
- **4 — SFTP, port forwarding and snippets:** navigation/empty states only, not functional.
- **5 — Windows Credential Manager/known hosts:** not implemented.
- **6 — Settings, splits and polished shortcuts:** not implemented. Ctrl+K and Escape apply only to the preview shell.

The sample preview host addresses are not real; placeholder hosts are replaced with only user-saved host records when the first profile is saved. Saved host addresses and usernames are unencrypted browser `localStorage` metadata; do not add production secrets or rely on this storage as a secure credential store. Password and private-key fields are rejected by the host-store API, and no credential input is provided. Production use must wait for a native OS-protected storage backend and a secure path for handling input.

## Native Windows packaging blocker

The machine used to create this project does not currently expose Rust/Rustup or the MSVC C++ Build Tools/Windows SDK required to compile a Tauri 2 Windows app. Installing the Rustup `winget` package was attempted, but the current package manifest has no applicable installer on this machine. This first milestone is deliberately dependency-free so its appearance and behavior can be reviewed without misrepresenting a browser preview as a packaged desktop app. A future native build needs a compatible Rust MSVC toolchain and the Visual Studio C++ Build Tools + Windows SDK, then an explicit Tauri wrapper and a signed, tested installer.

There is no database, cloud account, telemetry, bundled Termius code, or Termius asset in this repository.