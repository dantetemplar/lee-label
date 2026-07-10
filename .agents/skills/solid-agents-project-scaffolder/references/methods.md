# Scaffolding Templates

## package.json — Plain SolidJS

```json
{
  "name": "my-solid-app",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "solid-js": "^1.9.0"
  },
  "devDependencies": {
    "@solidjs/testing-library": "^0.8.0",
    "jsdom": "^24.0.0",
    "typescript": "^5.4.0",
    "vite": "^5.0.0",
    "vite-plugin-solid": "^2.10.0",
    "vitest": "^2.0.0"
  }
}
```

### With Routing

Add to `dependencies`:
```json
{
  "@solidjs/router": "^0.15.0"
}
```

---

## package.json — SolidStart

```json
{
  "name": "my-solidstart-app",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vinxi dev",
    "build": "vinxi build",
    "start": "vinxi start",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "@solidjs/meta": "^0.29.0",
    "@solidjs/router": "^0.15.0",
    "@solidjs/start": "^1.0.0",
    "solid-js": "^1.9.0"
  },
  "devDependencies": {
    "@solidjs/testing-library": "^0.8.0",
    "jsdom": "^24.0.0",
    "typescript": "^5.4.0",
    "vinxi": "^0.4.0",
    "vitest": "^2.0.0"
  }
}
```

---

## vite.config.ts — Plain SolidJS

```typescript
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    port: 3000,
  },
  build: {
    target: "esnext",
  },
});
```

### With Path Aliases

```typescript
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import path from "path";

export default defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
  },
  build: {
    target: "esnext",
  },
});
```

---

## app.config.ts — SolidStart

### Minimal

```typescript
import { defineConfig } from "@solidjs/start/config";

export default defineConfig({});
```

### With SSR Disabled (SPA Mode)

```typescript
import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  server: {
    preset: "static",
  },
});
```

### With Deployment Preset

```typescript
import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  server: {
    preset: "vercel",    // or "netlify", "cloudflare-pages", "node-server"
  },
});
```

---

## tsconfig.json — Plain SolidJS

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "types": ["vite/client"],
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

### With Path Aliases

Add to `compilerOptions`:
```json
{
  "paths": {
    "~/*": ["./src/*"]
  }
}
```

---

## tsconfig.json — SolidStart

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "types": ["vinxi/types/client"],
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "~/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

---

## vitest.config.ts — Both Project Types

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

---

## .gitignore

```
node_modules/
dist/
.output/
.vinxi/
.solid/
*.local
.env
.env.*
!.env.example
```

---

## Component Templates

### Basic Component — src/components/Counter.tsx

```typescript
import { createSignal, type Component } from "solid-js";

const Counter: Component = () => {
  const [count, setCount] = createSignal(0);

  return (
    <button type="button" onClick={() => setCount((prev) => prev + 1)}>
      Count: {count()}
    </button>
  );
};

export default Counter;
```

### Component with Props

```typescript
import type { Component } from "solid-js";

interface GreetingProps {
  name: string;
  class?: string;
}

const Greeting: Component<GreetingProps> = (props) => {
  return <h1 class={props.class}>Hello, {props.name}!</h1>;
};

export default Greeting;
```

**NEVER** destructure `props` in the function signature. ALWAYS access `props.name`, `props.class`, etc. directly to preserve reactivity.

### Component with Children

```typescript
import type { ParentComponent } from "solid-js";

const Card: ParentComponent<{ title: string }> = (props) => {
  return (
    <div class="card">
      <h2>{props.title}</h2>
      <div class="card-body">{props.children}</div>
    </div>
  );
};

export default Card;
```

---

## Route Page Template — SolidStart

### Basic Route — src/routes/index.tsx

```typescript
import { Title } from "@solidjs/meta";
import Counter from "~/components/Counter";

export default function Home() {
  return (
    <main>
      <Title>Home</Title>
      <h1>Welcome</h1>
      <Counter />
    </main>
  );
}
```

### Route with Data Loading — src/routes/users/[id].tsx

```typescript
import { createAsync, useParams, type RouteDefinition } from "@solidjs/router";
import { query } from "@solidjs/router";
import { Suspense } from "solid-js";
import { Title } from "@solidjs/meta";

const getUser = query(async (id: string) => {
  "use server";
  const response = await fetch(`https://api.example.com/users/${id}`);
  if (!response.ok) throw new Error("User not found");
  return response.json() as Promise<{ name: string; email: string }>;
}, "user");

export const route = {
  preload({ params }) {
    getUser(params.id);
  },
} satisfies RouteDefinition;

export default function UserPage() {
  const params = useParams();
  const user = createAsync(() => getUser(params.id));

  return (
    <main>
      <Title>{user()?.name ?? "Loading..."}</Title>
      <Suspense fallback={<p>Loading user...</p>}>
        <h1>{user()?.name}</h1>
        <p>{user()?.email}</p>
      </Suspense>
    </main>
  );
}
```

---

## API Route Template — src/routes/api/hello.ts

```typescript
import type { APIEvent } from "@solidjs/start/server";

export function GET(event: APIEvent) {
  return { message: "Hello from the API" };
}
```

---

## Context Provider Template — src/context/AppContext.tsx

```typescript
import { createContext, useContext, type ParentProps } from "solid-js";
import { createStore } from "solid-js/store";

interface AppState {
  user: { name: string; email: string } | null;
  theme: "light" | "dark";
}

interface AppActions {
  setUser: (user: AppState["user"]) => void;
  toggleTheme: () => void;
}

const AppContext = createContext<[AppState, AppActions]>();

export function AppProvider(props: ParentProps) {
  const [state, setState] = createStore<AppState>({
    user: null,
    theme: "light",
  });

  const actions: AppActions = {
    setUser: (user) => setState("user", user),
    toggleTheme: () =>
      setState("theme", (prev) => (prev === "light" ? "dark" : "light")),
  };

  return (
    <AppContext.Provider value={[state, actions]}>
      {props.children}
    </AppContext.Provider>
  );
}

export function useApp(): [AppState, AppActions] {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
```

---

## Import Map Quick Reference

```typescript
// Core — from "solid-js"
import { createSignal, createEffect, createMemo, createResource, onMount, onCleanup, batch, untrack, splitProps, mergeProps } from "solid-js";

// Types — from "solid-js"
import type { Component, ParentComponent, ParentProps, Accessor, Setter } from "solid-js";

// Control flow — from "solid-js"
import { Show, For, Switch, Match, Index, ErrorBoundary, Suspense } from "solid-js";

// Stores — from "solid-js/store" (SEPARATE ENTRY POINT)
import { createStore, produce, reconcile, unwrap } from "solid-js/store";

// Rendering — from "solid-js/web" (SEPARATE ENTRY POINT)
import { render, hydrate, isServer, Portal, Dynamic } from "solid-js/web";

// Router — from "@solidjs/router"
import { Router, Route, A, useParams, useNavigate, useSearchParams, useLocation } from "@solidjs/router";

// Router data APIs — from "@solidjs/router"
import { query, action, createAsync, createAsyncStore, redirect, reload, revalidate } from "@solidjs/router";

// SolidStart router — from "@solidjs/start/router"
import { FileRoutes } from "@solidjs/start/router";

// SolidStart client — from "@solidjs/start/client"
import { mount, StartClient } from "@solidjs/start/client";

// SolidStart server — from "@solidjs/start/server"
import { createHandler, StartServer } from "@solidjs/start/server";

// Meta — from "@solidjs/meta"
import { Title, Meta, Link, Style } from "@solidjs/meta";
```
