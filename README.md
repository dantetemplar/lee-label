# Lee Label

**The no-nonsense, local-first image labeling app that feels instant ✨** 

Open a folder. Label. Done. No accounts, no cloud upload, no SaaS — your images stay on your machine.

Built with Electron, SolidJS, and SQLite.

## Features

- **Local-first** — open any folder and start labeling; metadata lives beside your files
- **Cross-platform** — Linux, Windows, and macOS builds are available
- **Instant** — fast image and mask rendering with preloading and WebGL shaders
- **Tailored UX** — you will feel the flow, thanks to well-thought-out processes and hotkeys

## Installation

Download the latest release for your platform from **[GitHub Releases](https://github.com/dantetemplar/lee-label/releases)**.

| Platform | Download | How to install |
| -------- | -------- | -------------- |
| **Linux** | `lee-label-X.Y.Z.AppImage` | `chmod +x lee-label-*.AppImage` then run it (portable, no install) |
| **Linux** | `lee-label_X.Y.Z_amd64.deb` | `sudo dpkg -i lee-label_*.deb` |
| **Windows** | `lee-label-X.Y.Z-setup.exe` | Run the installer and follow the prompts |
| **macOS (Intel)** | `lee-label-X.Y.Z-x64.dmg` or `Lee Label-X.Y.Z-mac.zip` | Open the dmg (or unzip), drag **Lee Label** to Applications |
| **macOS (Apple Silicon)** | `lee-label-X.Y.Z-arm64.dmg` or `Lee Label-X.Y.Z-arm64-mac.zip` | Open the dmg (or unzip), drag **Lee Label** to Applications |

**macOS:** use the **arm64** build on Apple Silicon (M1/M2/M3) and the **x64** build on Intel Macs. If macOS blocks the app (unsigned build), right-click → Open, or allow it in **System Settings → Privacy & Security**.

**Updates:** download and install the new version from Releases. Your labels and metadata stay in your image folders — nothing is stored inside the app.

<details>
  <summary><h2>Development</h2></summary>

**Stack**

| Layer    | Tech                                      |
| -------- | ----------------------------------------- |
| Desktop  | Electron + electron-vite                  |
| UI       | SolidJS, Tailwind CSS, daisyUI            |
| Storage  | SQLite (`better-sqlite3`)                 |


*Required*
* [Node.js](https://nodejs.org/)
* [pnpm](https://pnpm.io/)

Install dependencies:

```bash
pnpm install
```

Run the development server:

```bash
pnpm dev
```

### Quality checks
```bash
pnpm format && pnpm lint --fix && pnpm typecheck
pnpm test
```

### Build

```bash
pnpm build:linux
pnpm build:win
pnpm build:mac
```

Artifacts are produced via `electron-builder` after `electron-vite build`.

### CI/CD

The [Build](.github/workflows/build.yml) workflow builds installers on GitHub Actions.

**Manual build** — Actions → Build → Run workflow (pick branch from the native dropdown):

- Toggle **Linux**, **Windows**, and/or **macOS**
- Download artifacts from the completed run

**Release build** — publish a GitHub Release from a tag; CI builds all platforms, attaches installers, and generates release notes from commits via [git-cliff](https://git-cliff.org) ([`cliff.toml`](cliff.toml)). Use conventional commit prefixes: `feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `test:`.

**Re-run release build** — edit the release description so it **starts with** `[run build]`, then either:

1. Save the release (if [Release Build Trigger](.github/workflows/release-trigger.yml) runs automatically on edit), or
2. Actions → **Release Build Trigger** → Run workflow → enter the tag (e.g. `v0.1.0`)

That dispatches the Build workflow, rebuilds all platforms, uploads assets, and replaces the body with the git-cliff changelog.

Linux CI builds AppImage and deb only (snap remains available via local `pnpm build:linux`).

</details>

## License

[MIT](LICENSE) © Ruslan Belkov
