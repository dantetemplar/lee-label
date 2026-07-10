# solid-agents-review: Review Examples

Review scenarios demonstrating bad code, what is wrong, and the correct fix. Use these as reference patterns when reviewing generated SolidJS code.

---

## Scenario 1: Counter Component (Signal Access)

### Bad Code

```tsx
import { createSignal } from "solid-js";

function Counter() {
  const [count, setCount] = createSignal(0);
  const doubled = count() * 2;

  return (
    <div>
      <p>Count: {count}</p>
      <p>Doubled: {doubled}</p>
      <button onClick={() => setCount(count() + 1)}>Increment</button>
    </div>
  );
}
```

### Issues Found

1. **CRITICAL (CHECK-S01)**: `{count}` -- signal not called as function, renders function reference
2. **CRITICAL (CHECK-S02)**: `const doubled = count() * 2` -- snapshot at component creation, never updates

### Fixed Code

```tsx
import { createSignal, createMemo } from "solid-js";

function Counter() {
  const [count, setCount] = createSignal(0);
  const doubled = createMemo(() => count() * 2);

  return (
    <div>
      <p>Count: {count()}</p>
      <p>Doubled: {doubled()}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </div>
  );
}
```

---

## Scenario 2: User Card (Props Destructuring)

### Bad Code

```tsx
interface UserCardProps {
  name: string;
  email: string;
  role?: string;
}

function UserCard({ name, email, role = "viewer" }: UserCardProps) {
  return (
    <div class="user-card">
      <h2>{name}</h2>
      <p>{email}</p>
      <span>{role}</span>
    </div>
  );
}
```

### Issues Found

1. **CRITICAL (CHECK-P01)**: Props destructured in function signature -- all values frozen at initial render
2. **WARNING (CHECK-P03)**: Default value for `role` should use `mergeProps`

### Fixed Code

```tsx
import { mergeProps } from "solid-js";

interface UserCardProps {
  name: string;
  email: string;
  role?: string;
}

function UserCard(props: UserCardProps) {
  const merged = mergeProps({ role: "viewer" }, props);

  return (
    <div class="user-card">
      <h2>{merged.name}</h2>
      <p>{merged.email}</p>
      <span>{merged.role}</span>
    </div>
  );
}
```

---

## Scenario 3: Todo List (Control Flow)

### Bad Code

```tsx
import { createSignal } from "solid-js";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

function TodoList() {
  const [todos, setTodos] = createSignal<Todo[]>([]);
  const [filter, setFilter] = createSignal("all");

  const filtered = todos().filter((t) =>
    filter() === "all" ? true : filter() === "done" ? t.done : !t.done
  );

  return (
    <div>
      {filtered.length === 0 ? (
        <p>No todos</p>
      ) : (
        <ul>
          {filtered.map((todo) => (
            <li key={todo.id}>
              <input type="checkbox" checked={todo.done} />
              {todo.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Issues Found

1. **CRITICAL (CHECK-S02)**: `filtered` is a snapshot -- computed once at component creation, never updates
2. **WARNING (CHECK-CF01)**: `Array.map()` used instead of `<For>`
3. **WARNING (CHECK-CF02)**: Ternary used instead of `<Show>`
4. **INFO (CHECK-CF04)**: `key={todo.id}` prop is ignored in SolidJS

### Fixed Code

```tsx
import { createSignal, createMemo, For, Show } from "solid-js";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

function TodoList() {
  const [todos, setTodos] = createSignal<Todo[]>([]);
  const [filter, setFilter] = createSignal("all");

  const filtered = createMemo(() =>
    todos().filter((t) =>
      filter() === "all" ? true : filter() === "done" ? t.done : !t.done
    )
  );

  return (
    <div>
      <Show when={filtered().length > 0} fallback={<p>No todos</p>}>
        <ul>
          <For each={filtered()}>
            {(todo) => (
              <li>
                <input type="checkbox" checked={todo.done} />
                {todo.text}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
```

---

## Scenario 4: Store Mutations

### Bad Code

```tsx
import { createStore } from "solid-js/store";

interface AppState {
  user: { name: string; settings: { theme: string } };
  notifications: string[];
}

function Dashboard() {
  const [store, setStore] = createStore<AppState>({
    user: { name: "Alice", settings: { theme: "light" } },
    notifications: [],
  });

  const { name } = store.user;
  const theme = store.user.settings.theme;

  function toggleTheme() {
    setStore({
      ...store,
      user: {
        ...store.user,
        settings: {
          ...store.user.settings,
          theme: store.user.settings.theme === "light" ? "dark" : "light",
        },
      },
    });
  }

  function addNotification(msg: string) {
    setStore({ ...store, notifications: [...store.notifications, msg] });
  }

  return (
    <div>
      <p>Hello {name}</p>
      <p>Theme: {theme}</p>
      <button onClick={toggleTheme}>Toggle Theme</button>
    </div>
  );
}
```

### Issues Found

1. **CRITICAL (CHECK-ST01)**: `const { name } = store.user` -- destructured, loses reactivity
2. **CRITICAL (CHECK-ST01)**: `const theme = store.user.settings.theme` -- snapshot, never updates
3. **CRITICAL (CHECK-ST02)**: Spread-replace pattern `setStore({ ...store, ... })` -- destroys fine-grained tracking

### Fixed Code

```tsx
import { createStore, produce } from "solid-js/store";

interface AppState {
  user: { name: string; settings: { theme: string } };
  notifications: string[];
}

function Dashboard() {
  const [store, setStore] = createStore<AppState>({
    user: { name: "Alice", settings: { theme: "light" } },
    notifications: [],
  });

  function toggleTheme() {
    setStore(
      "user",
      "settings",
      "theme",
      (prev) => (prev === "light" ? "dark" : "light")
    );
  }

  function addNotification(msg: string) {
    setStore("notifications", (prev) => [...prev, msg]);
  }

  return (
    <div>
      <p>Hello {store.user.name}</p>
      <p>Theme: {store.user.settings.theme}</p>
      <button onClick={toggleTheme}>Toggle Theme</button>
    </div>
  );
}
```

---

## Scenario 5: Effect Cleanup (React Pattern Contamination)

### Bad Code

```tsx
import { createSignal, createEffect } from "solid-js";

function Timer() {
  const [count, setCount] = createSignal(0);
  const [running, setRunning] = createSignal(false);

  createEffect(() => {
    if (running()) {
      const id = setInterval(() => {
        setCount((c) => c + 1);
      }, 1000);
      return () => clearInterval(id);
    }
  }, [running]);

  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => setRunning(!running())}>
        {running() ? "Stop" : "Start"}
      </button>
    </div>
  );
}
```

### Issues Found

1. **CRITICAL (CHECK-C05)**: `return () => clearInterval(id)` -- React cleanup pattern, return value is ignored
2. **CRITICAL (CHECK-C06)**: `[running]` -- dependency array passed as second argument, treated as initial value

### Fixed Code

```tsx
import { createSignal, createEffect, onCleanup } from "solid-js";

function Timer() {
  const [count, setCount] = createSignal(0);
  const [running, setRunning] = createSignal(false);

  createEffect(() => {
    if (running()) {
      const id = setInterval(() => {
        setCount((c) => c + 1);
      }, 1000);
      onCleanup(() => clearInterval(id));
    }
  });

  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => setRunning(!running())}>
        {running() ? "Stop" : "Start"}
      </button>
    </div>
  );
}
```

---

## Scenario 6: Data Fetching (Full React Contamination)

### Bad Code

```tsx
import { useState, useEffect } from "react";

function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/users/${userId}`)
      .then((r) => r.json())
      .then(setUser)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;
  return <div>{user?.name}</div>;
}
```

### Issues Found

1. **CRITICAL (CHECK-RC01)**: Imports from `react` -- wrong framework
2. **CRITICAL (CHECK-RC02)**: `useState`, `useEffect` -- React hooks
3. **CRITICAL (CHECK-P01)**: Props destructured in function signature
4. **CRITICAL (CHECK-C01)**: Early returns for conditional rendering
5. **CRITICAL (CHECK-C06)**: Dependency array `[userId]`

### Fixed Code

```tsx
import { createResource, Show, Suspense, ErrorBoundary } from "solid-js";

function UserProfile(props: { userId: string }) {
  const [user] = createResource(
    () => props.userId,
    async (id) => {
      const response = await fetch(`/api/users/${id}`);
      if (!response.ok) throw new Error("Failed to load user");
      return response.json();
    }
  );

  return (
    <ErrorBoundary fallback={(err) => <p>Error: {err.message}</p>}>
      <Suspense fallback={<p>Loading...</p>}>
        <div>{user()?.name}</div>
      </Suspense>
    </ErrorBoundary>
  );
}
```

---

## Scenario 7: Forwarding Refs and Event Binding

### Bad Code

```tsx
import { forwardRef, useRef, useEffect } from "react";

const FancyInput = forwardRef<HTMLInputElement, { label: string }>(
  ({ label }, ref) => {
    return (
      <label>
        {label}
        <input ref={ref} />
      </label>
    );
  }
);

function Form() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return <FancyInput ref={inputRef} label="Name" />;
}
```

### Issues Found

1. **CRITICAL (CHECK-RC01)**: Imports from `react`
2. **CRITICAL (CHECK-RC02)**: `useRef`, `useEffect`
3. **CRITICAL (CHECK-RC03)**: `forwardRef` wrapper
4. **CRITICAL (CHECK-P01)**: Props destructured
5. **CRITICAL (CHECK-C06)**: Empty dependency array `[]`

### Fixed Code

```tsx
import { onMount } from "solid-js";

function FancyInput(props: {
  label: string;
  ref: HTMLInputElement | ((el: HTMLInputElement) => void);
}) {
  return (
    <label>
      {props.label}
      <input ref={props.ref} />
    </label>
  );
}

function Form() {
  let inputRef!: HTMLInputElement;

  onMount(() => {
    inputRef.focus();
  });

  return <FancyInput ref={inputRef} label="Name" />;
}
```

---

## Scenario 8: Routing (React Router Patterns)

### Bad Code

```tsx
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";

function App() {
  return (
    <BrowserRouter>
      <nav>
        <Link to="/home">Home</Link>
        <Link to="/about">About</Link>
      </nav>
      <Routes>
        <Route path="/home" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### Issues Found

1. **CRITICAL (CHECK-RC01)**: Imports from `react-router-dom`
2. **CRITICAL (CHECK-RC05)**: `element={<Home />}` instead of `component={Home}`
3. **WARNING (CHECK-RC07)**: `<Link to="...">` instead of `<A href="...">`

### Fixed Code

```tsx
import { Router, Route } from "@solidjs/router";
import { A } from "@solidjs/router";

function App() {
  return (
    <Router>
      <nav>
        <A href="/home">Home</A>
        <A href="/about">About</A>
      </nav>
      <Route path="/home" component={Home} />
      <Route path="/about" component={About} />
    </Router>
  );
}
```
