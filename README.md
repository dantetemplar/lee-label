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
| **macOS** | `lee-label-X.Y.Z.dmg` or `Lee Label-X.Y.Z-*-mac.zip` | Open the dmg (or unzip), drag **Lee Label** to Applications |

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

**Manual build** — Actions → Build → Run workflow:

- **ref** — branch or tag to build (e.g. `main`, `v1.0.0`)
- Toggle **Linux**, **Windows**, and/or **macOS**
- Download artifacts from the completed run

**Release build** — publish a GitHub Release from a tag; the workflow builds all platforms and attaches installers automatically. Use **Generate release notes** when drafting a release (configured in [.github/release.yml](.github/release.yml)).

Linux CI builds AppImage and deb only (snap remains available via local `pnpm build:linux`).

</details>

## License

[MIT](LICENSE) © Ruslan Belkov
