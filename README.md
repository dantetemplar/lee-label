# Lee Label

**The no-nonsense, local-first image labeling app that feels instant ✨** 

Open a folder. Label. Done. No accounts, no cloud upload, no SaaS — your images stay on your machine.

Built with Electron, SolidJS, and SQLite.

## Features

- **Local projects** — open any folder; metadata lives beside your files
- **Image annotation** — rectangles and brushes with keyboard-driven labels
- **File browser** — tree navigation, image/text preview, per-image status
- **Label palette** — custom colors, hotkeys, quick switching
- **Cross-platform** — Linux, Windows, and macOS builds

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

</details>

## License

[MIT](LICENSE) © Ruslan Belkov
