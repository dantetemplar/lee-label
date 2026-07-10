# Complete Scaffold Examples

## Example 1: Complete Plain SolidJS Project

This is the full file-by-file output for a plain SolidJS client-side SPA with routing, state management, and testing.

### File: package.json

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
    "@solidjs/router": "^0.15.0",
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

### File: index.html

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My Solid App</title>
  </head>
  <body>
    <div id="root"></div>
    <script src="/src/index.tsx" type="module"></script>
  </body>
</html>
```

### File: vite.config.ts

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

### File: tsconfig.json

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

### File: vitest.config.ts

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

### File: .gitignore

```
node_modules/
dist/
*.local
.env
.env.*
!.env.example
```

### File: src/index.tsx

```typescript
import { render } from "solid-js/web";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

render(() => <App />, root);
```

### File: src/App.tsx

```typescript
import { Router, Route } from "@solidjs/router";
import { lazy } from "solid-js";
import { AppProvider } from "./context/AppContext";

const Home = lazy(() => import("./pages/Home"));
const About = lazy(() => import("./pages/About"));
const NotFound = lazy(() => import("./pages/NotFound"));

export default function App() {
  return (
    <AppProvider>
      <Router>
        <Route path="/" component={Home} />
        <Route path="/about" component={About} />
        <Route path="*404" component={NotFound} />
      </Router>
    </AppProvider>
  );
}
```

### File: src/context/AppContext.tsx

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

### File: src/components/Counter.tsx

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

### File: src/components/Nav.tsx

```typescript
import { A } from "@solidjs/router";
import type { Component } from "solid-js";

const Nav: Component = () => {
  return (
    <nav>
      <A href="/" end>
        Home
      </A>
      <A href="/about">About</A>
    </nav>
  );
};

export default Nav;
```

### File: src/pages/Home.tsx

```typescript
import Counter from "../components/Counter";
import Nav from "../components/Nav";

export default function Home() {
  return (
    <main>
      <Nav />
      <h1>Home</h1>
      <Counter />
    </main>
  );
}
```

### File: src/pages/About.tsx

```typescript
import Nav from "../components/Nav";

export default function About() {
  return (
    <main>
      <Nav />
      <h1>About</h1>
      <p>This is a SolidJS application.</p>
    </main>
  );
}
```

### File: src/pages/NotFound.tsx

```typescript
import Nav from "../components/Nav";

export default function NotFound() {
  return (
    <main>
      <Nav />
      <h1>404 — Not Found</h1>
      <p>The page you are looking for does not exist.</p>
    </main>
  );
}
```

### File: src/lib/utils.ts

```typescript
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
```

### File: test/Counter.test.tsx

```typescript
import { render, fireEvent, screen } from "@solidjs/testing-library";
import { describe, it, expect } from "vitest";
import Counter from "../src/components/Counter";

describe("Counter", () => {
  it("renders with initial count of 0", () => {
    render(() => <Counter />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Count: 0");
  });

  it("increments count on click", async () => {
    render(() => <Counter />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(button).toHaveTextContent("Count: 1");
  });
});
```

---

## Example 2: Complete SolidStart Project

This is the full file-by-file output for a SolidStart full-stack application with file-based routing, server functions, data loading, and testing.

### File: package.json

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

### File: app.config.ts

```typescript
import { defineConfig } from "@solidjs/start/config";

export default defineConfig({});
```

### File: tsconfig.json

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

### File: vitest.config.ts

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

### File: .gitignore

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

### File: src/app.tsx

```typescript
import { Suspense } from "solid-js";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { MetaProvider } from "@solidjs/meta";

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Suspense>{props.children}</Suspense>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
```

### File: src/entry-client.tsx

```typescript
// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";

mount(() => <StartClient />, document.getElementById("app")!);
```

### File: src/entry-server.tsx

```typescript
import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
```

### File: src/components/Counter.tsx

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

### File: src/components/Nav.tsx

```typescript
import { A } from "@solidjs/router";
import type { Component } from "solid-js";

const Nav: Component = () => {
  return (
    <nav>
      <A href="/" end>
        Home
      </A>
      <A href="/about">About</A>
    </nav>
  );
};

export default Nav;
```

### File: src/context/AppContext.tsx

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

### File: src/lib/utils.ts

```typescript
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
```

### File: src/routes/index.tsx

```typescript
import { Title } from "@solidjs/meta";
import Counter from "~/components/Counter";
import Nav from "~/components/Nav";

export default function Home() {
  return (
    <main>
      <Title>Home</Title>
      <Nav />
      <h1>Welcome to SolidStart</h1>
      <Counter />
    </main>
  );
}
```

### File: src/routes/about.tsx

```typescript
import { Title } from "@solidjs/meta";
import Nav from "~/components/Nav";

export default function About() {
  return (
    <main>
      <Title>About</Title>
      <Nav />
      <h1>About</h1>
      <p>This is a SolidStart application with server-side rendering.</p>
    </main>
  );
}
```

### File: src/routes/api/hello.ts

```typescript
import type { APIEvent } from "@solidjs/start/server";

export function GET(event: APIEvent) {
  return { message: "Hello from the API" };
}

export function POST(event: APIEvent) {
  return { message: "Received POST request" };
}
```

### File: test/Counter.test.tsx

```typescript
import { render, fireEvent, screen } from "@solidjs/testing-library";
import { describe, it, expect } from "vitest";
import Counter from "../src/components/Counter";

describe("Counter", () => {
  it("renders with initial count of 0", () => {
    render(() => <Counter />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Count: 0");
  });

  it("increments count on click", async () => {
    render(() => <Counter />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(button).toHaveTextContent("Count: 1");
  });
});
```

---

## Example 3: SolidStart with Data Loading and Mutations

### File: src/routes/todos.tsx

```typescript
import { createAsync, useSubmission, action, query } from "@solidjs/router";
import { For, Suspense } from "solid-js";
import { Title } from "@solidjs/meta";

interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

const getTodos = query(async () => {
  "use server";
  // Replace with actual database call
  return [
    { id: "1", title: "Learn SolidJS", completed: false },
    { id: "2", title: "Build an app", completed: false },
  ] as Todo[];
}, "todos");

const addTodo = action(async (formData: FormData) => {
  "use server";
  const title = formData.get("title") as string;
  if (!title) throw new Error("Title is required");
  // Replace with actual database call
  console.log("Adding todo:", title);
}, "addTodo");

export default function TodosPage() {
  const todos = createAsync(() => getTodos());
  const submission = useSubmission(addTodo);

  return (
    <main>
      <Title>Todos</Title>
      <h1>Todos</h1>

      <form action={addTodo} method="post">
        <input
          name="title"
          placeholder="New todo..."
          required
          disabled={submission.pending}
        />
        <button type="submit" disabled={submission.pending}>
          {submission.pending ? "Adding..." : "Add"}
        </button>
      </form>

      <Suspense fallback={<p>Loading todos...</p>}>
        <ul>
          <For each={todos()}>
            {(todo) => (
              <li>
                <span
                  style={{
                    "text-decoration": todo.completed ? "line-through" : "none",
                  }}
                >
                  {todo.title}
                </span>
              </li>
            )}
          </For>
        </ul>
      </Suspense>
    </main>
  );
}
```
