# Lee Label

**The no-nonsense, local-first image labeling app that feels instant ✨** 

Open a folder. Label. Done. No accounts, no cloud upload, no SaaS — your images stay on your machine.

Built with Electron, SolidJS, and SQLite.

## Features

- **Local-first** — open any folder and start labeling; metadata lives beside your files
- **Cross-platform** — Linux, Windows, and macOS builds are available
- **Instant** — fast image and mask rendering with preloading and WebGL shaders
- **Tailored UX** — you will feel the flow, thanks to well-thought-out processes and hotkeys

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

**Release build** — publish a GitHub Release from a tag; the workflow builds all platforms and attaches installers automatically.

Linux CI builds AppImage and deb only (snap remains available via local `pnpm build:linux`).

</details>

## License

[MIT](LICENSE) © Ruslan Belkov
