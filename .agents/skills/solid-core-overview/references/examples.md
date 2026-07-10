# Examples: App Setup and Version-Specific Patterns

## 1. Minimal SolidJS App (Client-Only, No SolidStart)

### Installation

```bash
npm init solid@latest my-app
cd my-app
npm install
npm run dev
```

### Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    target: "esnext",
  },
});
```

### Entry Point

```typescript
// src/index.tsx
import { render } from "solid-js/web";
import App from "./App";

render(() => <App />, document.getElementById("root")!);
```

### Root Component

```tsx
// src/App.tsx
import { createSignal } from "solid-js";

export default function App() {
  const [count, setCount] = createSignal(0);

  return (
    <div>
      <h1>SolidJS App</h1>
      <button onClick={() => setCount((c) => c + 1)}>
        Count: {count()}
      </button>
    </div>
  );
}
```

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "noEmit": true
  }
}
```

---

## 2. SolidStart Full-Stack App

### Installation

```bash
npm init solid@latest my-start-app
# Select "with SolidStart" template
cd my-start-app
npm install
npm run dev
```

### Project Structure

```
my-start-app/
├── public/
├── src/
│   ├── routes/
│   │   ├── index.tsx          # Home page (/)
│   │   ├── about.tsx          # About page (/about)
│   │   └── users/
│   │       ├── index.tsx      # Users list (/users)
│   │       └── [id].tsx       # User detail (/users/:id)
│   ├── components/
│   │   └── Nav.tsx
│   ├── lib/
│   │   └── db.ts              # Database/API layer
│   ├── entry-client.tsx       # Client hydration (rarely modified)
│   ├── entry-server.tsx       # Server handler (rarely modified)
│   └── app.tsx                # Root layout
├── app.config.ts              # SolidStart config
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### Root Layout (app.tsx)

```tsx
// src/app.tsx
import { Suspense } from "solid-js";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import Nav from "~/components/Nav";

export default function App() {
  return (
    <Router
      root={(props) => (
        <>
          <Nav />
          <Suspense fallback={<p>Loading...</p>}>
            {props.children}
          </Suspense>
        </>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
```

### Data Loading with query + createAsync

```tsx
// src/routes/users/[id].tsx
import { createAsync } from "@solidjs/router";
import { useParams } from "@solidjs/router";
import { query } from "@solidjs/router";
import { Suspense } from "solid-js";

const getUser = query(async (id: string) => {
  "use server";
  const res = await fetch(`https://api.example.com/users/${id}`);
  if (!res.ok) throw new Error("User not found");
  return res.json() as Promise<{ name: string; email: string }>;
}, "user");

export default function UserPage() {
  const params = useParams();
  const user = createAsync(() => getUser(params.id));

  return (
    <Suspense fallback={<p>Loading user...</p>}>
      <div>
        <h1>{user()?.name}</h1>
        <p>{user()?.email}</p>
      </div>
    </Suspense>
  );
}
```

### Mutations with action

```tsx
// src/routes/users/index.tsx
import { createAsync, action, useSubmission } from "@solidjs/router";
import { query } from "@solidjs/router";
import { For, Suspense } from "solid-js";

const getUsers = query(async () => {
  "use server";
  return db.getUsers();
}, "users");

const addUser = action(async (formData: FormData) => {
  "use server";
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  await db.createUser({ name, email });
}, "addUser");

export default function UsersPage() {
  const users = createAsync(() => getUsers());
  const submission = useSubmission(addUser);

  return (
    <div>
      <h1>Users</h1>

      <form action={addUser} method="post">
        <input name="name" placeholder="Name" required />
        <input name="email" placeholder="Email" required />
        <button type="submit" disabled={submission.pending}>
          {submission.pending ? "Adding..." : "Add User"}
        </button>
      </form>

      <Suspense fallback={<p>Loading users...</p>}>
        <For each={users()}>
          {(user) => <p>{user.name} ({user.email})</p>}
        </For>
      </Suspense>
    </div>
  );
}
```

### API Route

```typescript
// src/routes/api/users/[id].ts
import type { APIEvent } from "@solidjs/start/server";

export async function GET({ params }: APIEvent) {
  const user = await db.getUser(params.id);
  if (!user) {
    return new Response("Not found", { status: 404 });
  }
  return user; // Automatically serialized to JSON
}

export async function DELETE({ params }: APIEvent) {
  await db.deleteUser(params.id);
  return new Response(null, { status: 204 });
}
```

---

## 3. SolidJS 1.x Patterns (Current Stable)

### Reactive Data Fetching with createResource

```tsx
import { createSignal, createResource, Suspense, ErrorBoundary } from "solid-js";
import { Show } from "solid-js";

async function fetchUser(id: number): Promise<{ name: string }> {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

function UserProfile() {
  const [userId, setUserId] = createSignal(1);
  const [user, { refetch, mutate }] = createResource(userId, fetchUser);

  return (
    <ErrorBoundary fallback={(err) => <p>Error: {err.message}</p>}>
      <Suspense fallback={<p>Loading...</p>}>
        <Show when={user()}>
          {(u) => <h1>{u().name}</h1>}
        </Show>
        <button onClick={() => setUserId((id) => id + 1)}>Next User</button>
        <button onClick={() => refetch()}>Refresh</button>
      </Suspense>
    </ErrorBoundary>
  );
}
```

### Store with Path Syntax Updates

```tsx
import { createStore } from "solid-js/store";
import { For } from "solid-js";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

function TodoApp() {
  const [store, setStore] = createStore<{ todos: Todo[] }>({
    todos: [
      { id: 1, text: "Learn SolidJS", done: false },
      { id: 2, text: "Build an app", done: false },
    ],
  });

  const toggleTodo = (id: number) => {
    setStore("todos", (todo) => todo.id === id, "done", (done) => !done);
  };

  const addTodo = (text: string) => {
    setStore("todos", store.todos.length, {
      id: Date.now(),
      text,
      done: false,
    });
  };

  return (
    <div>
      <For each={store.todos}>
        {(todo) => (
          <div>
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => toggleTodo(todo.id)}
            />
            <span style={{ "text-decoration": todo.done ? "line-through" : "none" }}>
              {todo.text}
            </span>
          </div>
        )}
      </For>
    </div>
  );
}
```

### Context Provider Pattern

```tsx
import { createSignal, createContext, useContext, ParentProps } from "solid-js";
import type { Accessor } from "solid-js";

interface ThemeContextType {
  theme: Accessor<"light" | "dark">;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType>();

function ThemeProvider(props: ParentProps) {
  const [theme, setTheme] = createSignal<"light" | "dark">("light");
  const toggle = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {props.children}
    </ThemeContext.Provider>
  );
}

function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
```

---

## 4. SolidJS 2.x Patterns (Beta)

### Microtask Batching (Default in 2.x)

```typescript
// In 1.x: updates propagate synchronously
const [a, setA] = createSignal(0);
const [b, setB] = createSignal(0);
setA(1); // Downstream updates immediately
setB(2); // Downstream updates again

// In 2.x: updates are microtask-batched by default
setA(1); // Queued
setB(2); // Queued
// Both propagate together in next microtask

// Use flush() for immediate propagation in 2.x when needed
```

### onSettled (Replaces onMount in 2.x)

```typescript
// 1.x pattern
import { onMount, onCleanup } from "solid-js";
onMount(() => {
  const timer = setInterval(tick, 1000);
  onCleanup(() => clearInterval(timer));
});

// 2.x pattern
import { onSettled } from "solid-js";
onSettled(() => {
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer); // Cleanup via return value
});
```

### Derived Signals (New in 2.x)

```typescript
// 1.x: createMemo for derived values
const double = createMemo(() => count() * 2);

// 2.x: createSignal accepts functions for derived-but-writable patterns
const double = createSignal(() => count() * 2);
```

---

## 5. SolidStart Configuration

### app.config.ts

```typescript
import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  // Server configuration
  server: {
    preset: "node-server", // or "netlify", "vercel", "cloudflare-pages"
  },
  // Vite configuration passthrough
  vite: {
    // Standard Vite config options
  },
});
```

### Common Deployment Presets

| Preset | Target |
|--------|--------|
| `node-server` | Standard Node.js server |
| `netlify` | Netlify Functions |
| `vercel` | Vercel Serverless |
| `cloudflare-pages` | Cloudflare Pages/Workers |
| `aws-lambda` | AWS Lambda |
| `static` | Static site generation |
