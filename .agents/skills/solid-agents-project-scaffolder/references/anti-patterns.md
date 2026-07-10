# Scaffolding Anti-Patterns

## Anti-Pattern 1: Using React Scaffolding Tools

### WRONG

```bash
npx create-react-app my-app
npx create-next-app my-app
```

Then trying to "convert" to SolidJS by swapping imports. This NEVER works because:
- CRA uses `react-scripts` with a Webpack config hardcoded for React JSX transform
- Next.js has its own compiler pipeline incompatible with SolidJS
- The generated `tsconfig.json` targets React JSX
- The generated `package.json` includes React dependencies that cause type conflicts

### CORRECT

```bash
npm init solid@latest my-app
# Or for manual setup:
npm create vite@latest my-app -- --template solid-ts
```

**ALWAYS** start from a SolidJS-specific template or build the scaffold from scratch using `vite-plugin-solid`.

---

## Anti-Pattern 2: Missing vite-plugin-solid

### WRONG — vite.config.ts without SolidJS plugin

```typescript
import { defineConfig } from "vite";

export default defineConfig({
  // No SolidJS plugin — JSX will NOT compile correctly
});
```

**Result:** Vite falls back to default JSX handling (React or esbuild), producing `React.createElement` calls or broken output. Components render nothing or throw runtime errors.

### CORRECT

```typescript
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
});
```

**ALWAYS** include `vite-plugin-solid` as the first plugin. It configures Babel with `babel-preset-solid` for correct JSX compilation.

---

## Anti-Pattern 3: Wrong jsxImportSource in tsconfig.json

### WRONG — Missing or React jsxImportSource

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

Or simply omitting `jsxImportSource` entirely. TypeScript resolves JSX types from `@types/react` by default, causing:
- Type errors on SolidJS-specific attributes (`classList`, `on:click`, `use:`)
- Missing types for SolidJS event handlers
- Incorrect `children` type (React.ReactNode instead of JSX.Element)

### CORRECT

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "solid-js"
  }
}
```

**ALWAYS** set both `"jsx": "preserve"` and `"jsxImportSource": "solid-js"`. The `preserve` setting lets Vite handle JSX transformation via `babel-preset-solid`.

---

## Anti-Pattern 4: Including React Dependencies

### WRONG

```json
{
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "solid-js": "^1.9.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0"
  }
}
```

**Result:** TypeScript picks up React's JSX types alongside SolidJS's, causing:
- Ambiguous JSX namespace errors
- Event handler type mismatches (`React.MouseEvent` vs SolidJS's native `MouseEvent`)
- `children` typed as `React.ReactNode` instead of `JSX.Element`

### CORRECT

**NEVER** include `react`, `react-dom`, `@types/react`, or `@types/react-dom` in a SolidJS project. Remove them if present:

```bash
npm uninstall react react-dom @types/react @types/react-dom
```

---

## Anti-Pattern 5: Using create-react-app's index.tsx Pattern

### WRONG — React entry point

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### CORRECT — SolidJS entry point

```typescript
import { render } from "solid-js/web";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

render(() => <App />, root);
```

Key differences:
- `render` is imported from `solid-js/web`, NOT `solid-js`
- `render` takes a **function** returning JSX, not a JSX element directly
- There is no `StrictMode` wrapper in SolidJS — it has no equivalent concept
- There is no `createRoot` — `render` handles everything

---

## Anti-Pattern 6: Wrong SolidStart Configuration File

### WRONG — Using vite.config.ts for SolidStart

```typescript
// vite.config.ts — WRONG for SolidStart
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
});
```

SolidStart uses `app.config.ts` (NOT `vite.config.ts`). Using a plain Vite config loses all SolidStart features: file-based routing, server functions, SSR, API routes.

### CORRECT — app.config.ts for SolidStart

```typescript
import { defineConfig } from "@solidjs/start/config";

export default defineConfig({});
```

**ALWAYS** use `app.config.ts` with `@solidjs/start/config` for SolidStart projects. **NEVER** create a `vite.config.ts` alongside it — SolidStart manages Vite internally through Vinxi.

---

## Anti-Pattern 7: Wrong TypeScript Types for SolidStart

### WRONG — Using vite/client types

```json
{
  "compilerOptions": {
    "types": ["vite/client"]
  }
}
```

This works for plain SolidJS + Vite, but SolidStart needs Vinxi's types for correct `import.meta.env` typing and module resolution.

### CORRECT — Using vinxi types

```json
{
  "compilerOptions": {
    "types": ["vinxi/types/client"]
  }
}
```

---

## Anti-Pattern 8: Incorrect Route Component Pattern

### WRONG — React Router's element prop

```typescript
import { Route } from "@solidjs/router";
import Home from "./pages/Home";

<Route path="/" element={<Home />} />
```

In SolidJS, passing JSX via `element` creates the component immediately, bypassing the router's lazy rendering. The component mounts even when the route is not active.

### CORRECT — SolidJS Router's component prop

```typescript
import { Route } from "@solidjs/router";
import Home from "./pages/Home";

<Route path="/" component={Home} />
```

**ALWAYS** use `component={ComponentName}` (passing the reference, not an invocation). This lets the router control when the component mounts and unmounts.

---

## Anti-Pattern 9: Missing Suspense in SolidStart app.tsx

### WRONG — No Suspense boundary

```typescript
export default function App() {
  return (
    <Router>
      <FileRoutes />
    </Router>
  );
}
```

Without `<Suspense>`, any route using `createAsync` or `createResource` will throw an error because there is no boundary to catch the suspended state.

### CORRECT — Suspense in root

```typescript
import { Suspense } from "solid-js";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";

export default function App() {
  return (
    <Router root={(props) => <Suspense>{props.children}</Suspense>}>
      <FileRoutes />
    </Router>
  );
}
```

**ALWAYS** wrap `{props.children}` in `<Suspense>` inside the Router's `root` prop. This provides the boundary for async data loading in any route.

---

## Anti-Pattern 10: Destructuring Props in Scaffolded Components

### WRONG — React-style destructured props

```typescript
function Greeting({ name, class: className }: { name: string; class?: string }) {
  return <h1 class={className}>Hello, {name}!</h1>;
}
```

Destructuring reads prop values once at component creation time. Since SolidJS components run exactly once, the destructured values become static snapshots that NEVER update.

### CORRECT — SolidJS props object

```typescript
import type { Component } from "solid-js";

interface GreetingProps {
  name: string;
  class?: string;
}

const Greeting: Component<GreetingProps> = (props) => {
  return <h1 class={props.class}>Hello, {props.name}!</h1>;
};
```

**ALWAYS** access props via `props.name`, `props.class`, etc. **NEVER** destructure in the function parameter or component body.

---

## Anti-Pattern 11: Missing module type in package.json

### WRONG

```json
{
  "name": "my-app",
  "scripts": { "dev": "vite" }
}
```

Without `"type": "module"`, Node.js treats `.js` files as CommonJS. Vite and SolidJS tooling expect ES modules. This causes `import` statement errors when running dev scripts.

### CORRECT

```json
{
  "name": "my-app",
  "type": "module",
  "scripts": { "dev": "vite" }
}
```

**ALWAYS** include `"type": "module"` in `package.json` for SolidJS projects.

---

## Anti-Pattern 12: Using CommonJS imports in config files

### WRONG

```javascript
const solid = require("vite-plugin-solid");

module.exports = {
  plugins: [solid()],
};
```

### CORRECT

```typescript
import solidPlugin from "vite-plugin-solid";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solidPlugin()],
});
```

**ALWAYS** use ESM `import`/`export` syntax in config files. Name config files with `.ts` extension (`vite.config.ts`, `app.config.ts`, `vitest.config.ts`).

---

## Anti-Pattern 13: Wrong test environment for SolidJS

### WRONG — No jsdom, no Solid plugin

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Missing environment, missing Solid plugin
  },
});
```

Without `jsdom` environment, DOM APIs are unavailable. Without `vite-plugin-solid`, JSX in test files fails to compile.

### CORRECT

```typescript
import { defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  test: {
    environment: "jsdom",
    globals: true,
    transformMode: {
      web: [/\.[jt]sx?$/],
    },
  },
  resolve: {
    conditions: ["development", "browser"],
  },
});
```

**ALWAYS** include:
1. `vite-plugin-solid` in plugins (for JSX compilation)
2. `environment: "jsdom"` (for DOM APIs)
3. `transformMode.web` matching TSX/JSX files
4. `resolve.conditions` with `"development"` and `"browser"` (for correct SolidJS bundle resolution)
