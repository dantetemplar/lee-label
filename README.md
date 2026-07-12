# Lee Label

**The no-nonsense, local-first labeling app for images.** 🏷️✨

Open a folder. Label. Done. No accounts, no cloud upload, no SaaS — your images stay on your machine.

Built with Electron, SolidJS, and SQLite.

## Features

- **Local projects** — open any folder; metadata lives beside your files
- **Image annotation** — rectangles and brushes with keyboard-driven labels
- **File browser** — tree navigation, image/text preview, per-image status
- **Label palette** — custom colors, hotkeys, quick switching
- **Cross-platform** — Linux, Windows, and macOS builds

## Setup

```bash
pnpm install
```

Requires [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/).

## Development

```bash
pnpm dev
```

## Quality checks

```bash
pnpm format && pnpm lint --fix && pnpm typecheck
pnpm test
```

## Build

```bash
pnpm build:linux
pnpm build:win
pnpm build:mac
```

Artifacts are produced via `electron-builder` after `electron-vite build`.

## Stack

| Layer    | Tech                                      |
| -------- | ----------------------------------------- |
| Desktop  | Electron + electron-vite                  |
| UI       | SolidJS, Tailwind CSS, daisyUI            |
| Storage  | SQLite (`better-sqlite3`)                 |

## License

[MIT](LICENSE) © Ruslan Belkov
