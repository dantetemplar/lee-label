# Lee Label

Desktop image and file labeling app built with Electron, SolidJS, and SQLite.

Open a folder as a project, browse files in a tree, preview images and text, annotate images with rectangle and brush tools, and track per-image status.

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

## Quality checks

```bash
pnpm format && pnpm lint --fix && pnpm typecheck
```

## Build

```bash
pnpm build:linux
pnpm build:win
pnpm build:mac
```

Build artifacts are produced via `electron-builder` after `electron-vite build`.
