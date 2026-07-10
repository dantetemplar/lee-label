# Complete Anti-Pattern Examples Catalog

Every anti-pattern with WRONG (React) and CORRECT (SolidJS) code side by side.

---

## AP-001: Destructuring Props

### WRONG -- Destructured in function signature

```tsx
function UserCard({ name, email, avatar }: UserCardProps) {
  return (
    <div class="card">
      <img src={avatar} alt={name} />
      <h2>{name}</h2>
      <p>{email}</p>
    </div>
  );
}
// Result: name, email, avatar are frozen at their initial values. Parent
// updates to these props are NEVER reflected in the rendered output.
```

### WRONG -- Destructured in component body

```tsx
function UserCard(props: UserCardProps) {
  const { name, email, avatar } = props;
  return (
    <div class="card">
      <img src={avatar} alt={name} />
      <h2>{name}</h2>
      <p>{email}</p>
    </div>
  );
}
// Same problem: values captured once, reactive connection severed.
```

### WRONG -- Single prop extracted to variable

```tsx
function UserCard(props: UserCardProps) {
  const name = props.name; // Snapshot at component setup
  return <h2>{name}</h2>;  // Never updates
}
```

### CORRECT -- Direct prop access

```tsx
function UserCard(props: UserCardProps) {
  return (
    <div class="card">
      <img src={props.avatar} alt={props.name} />
      <h2>{props.name}</h2>
      <p>{props.email}</p>
    </div>
  );
}
```

### CORRECT -- splitProps for prop separation

```tsx
import { splitProps } from "solid-js";

function UserCard(props: UserCardProps & { class?: string }) {
  const [local, rest] = splitProps(props, ["name", "email", "avatar"]);
  return (
    <div {...rest}>
      <img src={local.avatar} alt={local.name} />
      <h2>{local.name}</h2>
      <p>{local.email}</p>
    </div>
  );
}
```

### CORRECT -- Derived accessor when needed outside JSX

```tsx
function UserCard(props: UserCardProps) {
  const displayName = () => props.name.toUpperCase();
  return <h2>{displayName()}</h2>;
}
```

---

## AP-002: Destructuring Signal Value

### WRONG -- Snapshot in component body

```tsx
function Counter() {
  const [count, setCount] = createSignal(0);
  const value = count(); // Frozen at 0

  return (
    <div>
      <p>Count: {value}</p>
      <button onClick={() => setCount((c) => c + 1)}>+</button>
    </div>
  );
}
// Clicking the button updates the signal, but {value} always shows 0.
```

### WRONG -- Snapshot passed to setTimeout

```tsx
function DelayedLogger() {
  const [message, setMessage] = createSignal("hello");
  const msg = message(); // Captured once

  setTimeout(() => {
    console.log(msg); // Always "hello", even if signal changed
  }, 2000);

  return <input onInput={(e) => setMessage(e.target.value)} />;
}
```

### CORRECT -- Call getter in JSX

```tsx
function Counter() {
  const [count, setCount] = createSignal(0);

  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => setCount((c) => c + 1)}>+</button>
    </div>
  );
}
```

### CORRECT -- Call getter at point of use

```tsx
function DelayedLogger() {
  const [message, setMessage] = createSignal("hello");

  setTimeout(() => {
    console.log(message()); // Reads current value at execution time
  }, 2000);

  return <input onInput={(e) => setMessage(e.target.value)} />;
}
```

---

## AP-003: useState vs createSignal

### WRONG -- React API

```tsx
import { useState } from "react";

function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>; // count is a value, not a function
}
```

### CORRECT -- SolidJS API

```tsx
import { createSignal } from "solid-js";

function Counter() {
  const [count, setCount] = createSignal(0);
  return <div>{count()}</div>; // count is a GETTER -- must call it
}
```

---

## AP-004: useEffect vs createEffect

### WRONG -- Dependency array pattern

```tsx
import { useEffect } from "react";

function TitleUpdater() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    document.title = `Count: ${count}`;
  }, [count]); // Manual dependency list
}
```

### WRONG -- Accidentally passing array as initial value

```tsx
import { createEffect, createSignal } from "solid-js";

function TitleUpdater() {
  const [count, setCount] = createSignal(0);
  // WRONG: [count] is passed as the initial prev value, NOT as deps
  createEffect(() => {
    document.title = `Count: ${count()}`;
  }, [count]);
}
```

### CORRECT -- Automatic tracking

```tsx
import { createEffect, createSignal } from "solid-js";

function TitleUpdater() {
  const [count, setCount] = createSignal(0);
  createEffect(() => {
    document.title = `Count: ${count()}`; // Auto-tracked
  });
}
```

---

## AP-005: useMemo vs createMemo

### WRONG -- React pattern

```tsx
import { useMemo } from "react";

function ExpensiveList({ items, filter }) {
  const filtered = useMemo(
    () => items.filter((i) => i.name.includes(filter)),
    [items, filter]
  );
  return <ul>{filtered.map((i) => <li>{i.name}</li>)}</ul>;
}
```

### CORRECT -- SolidJS pattern

```tsx
import { createMemo } from "solid-js";
import { For } from "solid-js";

function ExpensiveList(props: { items: Item[]; filter: string }) {
  const filtered = createMemo(() =>
    props.items.filter((i) => i.name.includes(props.filter))
  );

  return (
    <ul>
      <For each={filtered()}>
        {(item) => <li>{item.name}</li>}
      </For>
    </ul>
  );
}
```

---

## AP-006: Re-Render Assumption

### WRONG -- Derived value as plain variable

```tsx
function PriceDisplay() {
  const [price, setPrice] = createSignal(100);
  const [tax, setTax] = createSignal(0.21);
  const total = price() * (1 + tax()); // Computed ONCE at setup

  return <p>Total: {total}</p>; // NEVER updates
}
```

### WRONG -- Console.log expecting re-runs

```tsx
function DebugComponent() {
  const [count, setCount] = createSignal(0);
  console.log("Current count:", count()); // Logs ONCE at setup

  return <button onClick={() => setCount((c) => c + 1)}>Click</button>;
}
```

### CORRECT -- Derived accessor function

```tsx
function PriceDisplay() {
  const [price, setPrice] = createSignal(100);
  const [tax, setTax] = createSignal(0.21);
  const total = () => price() * (1 + tax()); // Function -- re-evaluates on access

  return <p>Total: {total()}</p>; // Reactive
}
```

### CORRECT -- createMemo for cached derived value

```tsx
function PriceDisplay() {
  const [price, setPrice] = createSignal(100);
  const [tax, setTax] = createSignal(0.21);
  const total = createMemo(() => price() * (1 + tax())); // Cached, reactive

  return <p>Total: {total()}</p>;
}
```

### CORRECT -- createEffect for side effects

```tsx
function DebugComponent() {
  const [count, setCount] = createSignal(0);
  createEffect(() => {
    console.log("Current count:", count()); // Logs on EVERY change
  });

  return <button onClick={() => setCount((c) => c + 1)}>Click</button>;
}
```

---

## AP-007: Conditional Signal Access

### WRONG -- Signal only tracked conditionally

```tsx
function ConditionalDisplay() {
  const [showDetails, setShowDetails] = createSignal(false);
  const [details, setDetails] = createSignal("initial");

  createEffect(() => {
    if (showDetails()) {
      console.log(details()); // NOT tracked when showDetails() is false
    }
  });
}
// When showDetails is false and details changes, the effect does NOT re-run.
// When showDetails later becomes true, it shows the current details value,
// but missed all intermediate changes.
```

### CORRECT -- Read all signals first

```tsx
function ConditionalDisplay() {
  const [showDetails, setShowDetails] = createSignal(false);
  const [details, setDetails] = createSignal("initial");

  createEffect(() => {
    const show = showDetails();
    const currentDetails = details(); // ALWAYS tracked
    if (show) {
      console.log(currentDetails);
    }
  });
}
```

---

## AP-008: Early Return Before Signal Access

### WRONG -- Signals after return never tracked

```tsx
function DataDisplay() {
  const [loading, setLoading] = createSignal(true);
  const [data, setData] = createSignal<string | null>(null);

  createEffect(() => {
    if (loading()) return; // When true, data() is never read
    console.log("Data loaded:", data());
  });
}
// Effect only tracks loading(). When loading becomes false, it runs and
// tracks data(). But if data changed while loading was true, it was missed.
```

### CORRECT -- Read all signals before conditions

```tsx
function DataDisplay() {
  const [loading, setLoading] = createSignal(true);
  const [data, setData] = createSignal<string | null>(null);

  createEffect(() => {
    const isLoading = loading();
    const currentData = data(); // Always tracked
    if (isLoading) return;
    console.log("Data loaded:", currentData);
  });
}
```

---

## AP-009: Storing Signal in Variable

### WRONG -- Variable holds stale snapshot

```tsx
function SearchBar() {
  const [query, setQuery] = createSignal("");
  const currentQuery = query(); // Snapshot: always ""

  const handleSearch = () => {
    fetch(`/api/search?q=${currentQuery}`); // Always searches ""
  };

  return (
    <div>
      <input onInput={(e) => setQuery(e.target.value)} />
      <button onClick={handleSearch}>Search</button>
    </div>
  );
}
```

### CORRECT -- Read signal at point of use

```tsx
function SearchBar() {
  const [query, setQuery] = createSignal("");

  const handleSearch = () => {
    fetch(`/api/search?q=${query()}`); // Reads current value
  };

  return (
    <div>
      <input onInput={(e) => setQuery(e.target.value)} />
      <button onClick={handleSearch}>Search</button>
    </div>
  );
}
```

---

## AP-010: Spreading Props Unsafely

### WRONG -- Raw spread

```tsx
function CustomButton(props: { variant: string } & JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button class={`btn-${props.variant}`} {...props} />;
  // props includes variant, which may override class or cause unexpected attributes
}
```

### CORRECT -- splitProps

```tsx
import { splitProps } from "solid-js";

function CustomButton(props: { variant: string } & JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [local, rest] = splitProps(props, ["variant"]);
  return <button class={`btn-${local.variant}`} {...rest} />;
}
```

---

## AP-011: Array.map for Lists

### WRONG -- React pattern recreates all nodes

```tsx
function TodoList(props: { todos: Todo[] }) {
  return (
    <ul>
      {props.todos.map((todo) => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  );
}
// Every array change recreates ALL <li> elements from scratch.
```

### CORRECT -- For component with reference tracking

```tsx
import { For } from "solid-js";

function TodoList(props: { todos: Todo[] }) {
  return (
    <ul>
      <For each={props.todos} fallback={<li>No todos</li>}>
        {(todo, index) => (
          <li>#{index() + 1}: {todo.text}</li>
        )}
      </For>
    </ul>
  );
}
// Only changed/added/removed items update. Existing DOM nodes are reused.
```

### CORRECT -- Index for primitive arrays

```tsx
import { Index } from "solid-js";

function TagList(props: { tags: string[] }) {
  return (
    <ul>
      <Index each={props.tags}>
        {(tag, i) => <li>{tag()}</li>}
      </Index>
    </ul>
  );
}
// Note: in Index, item is a signal (tag()), index is a plain number.
```

---

## AP-012: Ternary Instead of Show

### WRONG -- Ternary can cause unnecessary DOM recreation

```tsx
function AuthView() {
  const [loggedIn, setLoggedIn] = createSignal(false);
  return (
    <div>
      {loggedIn() ? <Dashboard /> : <LoginForm />}
    </div>
  );
}
```

### CORRECT -- Show component

```tsx
import { Show } from "solid-js";

function AuthView() {
  const [loggedIn, setLoggedIn] = createSignal(false);
  return (
    <div>
      <Show when={loggedIn()} fallback={<LoginForm />}>
        <Dashboard />
      </Show>
    </div>
  );
}
```

---

## AP-013: switch/case in Component Body

### WRONG -- Switch runs once, never re-evaluates

```tsx
function PageContent(props: { page: string }) {
  switch (props.page) {
    case "home": return <Home />;
    case "about": return <About />;
    case "contact": return <Contact />;
    default: return <NotFound />;
  }
}
// Component body runs ONCE. If props.page changes, this switch never re-runs.
```

### CORRECT -- Switch/Match components

```tsx
import { Switch, Match } from "solid-js";

function PageContent(props: { page: string }) {
  return (
    <Switch fallback={<NotFound />}>
      <Match when={props.page === "home"}><Home /></Match>
      <Match when={props.page === "about"}><About /></Match>
      <Match when={props.page === "contact"}><Contact /></Match>
    </Switch>
  );
}
```

---

## AP-014: key Prop on List Items

### WRONG -- key prop is ignored in SolidJS

```tsx
<For each={items()}>
  {(item) => <div key={item.id}>{item.name}</div>}
</For>
// The key prop has no effect. For tracks by reference, not by key.
```

### CORRECT -- No key needed

```tsx
<For each={items()}>
  {(item) => <div>{item.name}</div>}
</For>
```

---

## AP-015: useRef vs let ref

### WRONG -- React ref pattern

```tsx
import { useRef, useEffect } from "react";

function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    ctx?.fillRect(0, 0, 100, 100);
  }, []);
  return <canvas ref={canvasRef} />;
}
```

### CORRECT -- SolidJS ref pattern

```tsx
import { onMount } from "solid-js";

function Canvas() {
  let canvasRef!: HTMLCanvasElement; // Definite assignment assertion
  onMount(() => {
    const ctx = canvasRef.getContext("2d"); // Direct access, no .current
    ctx.fillRect(0, 0, 100, 100);
  });
  return <canvas ref={canvasRef} />;
}
```

---

## AP-016: React.createElement Assumption

### WRONG -- Assuming virtual DOM

```tsx
// React: JSX compiles to React.createElement("div", { class: "x" }, children)
// This creates a virtual DOM node that gets diffed and reconciled.

// Attempting manual element creation:
const element = React.createElement("div", null, "Hello");
```

### CORRECT -- SolidJS compiles to real DOM

```tsx
// SolidJS: JSX compiles to direct DOM creation.
// There is no virtual DOM. No diffing. No reconciliation.
// Simply use JSX:
const element = <div>Hello</div>; // Creates actual DOM node
```

---

## AP-017: Children as Static Value

### WRONG -- Accessing props.children directly multiple times

```tsx
function Wrapper(props: { children: JSX.Element }) {
  createEffect(() => {
    console.log(props.children); // May re-create children!
  });
  return <div class="wrapper">{props.children}</div>; // May re-create again!
}
```

### WRONG -- Storing children in variable

```tsx
function Wrapper(props: { children: JSX.Element }) {
  const kids = props.children; // Captured, may not be stable
  return <div>{kids}</div>;
}
```

### CORRECT -- Use children() helper

```tsx
import { children } from "solid-js";

function Wrapper(props: { children: JSX.Element }) {
  const resolved = children(() => props.children);

  createEffect(() => {
    console.log(resolved()); // Stable, cached reference
  });

  return <div class="wrapper">{resolved()}</div>;
}
```

---

## AP-018: useEffect Cleanup Return

### WRONG -- React cleanup pattern

```tsx
// React: cleanup is the return value of useEffect
useEffect(() => {
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer); // Cleanup via return
}, []);
```

### WRONG -- Accidentally using return in SolidJS effect

```tsx
createEffect(() => {
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer); // This does NOT register cleanup!
  // The return value becomes the "prev" value for the next effect run.
});
```

### CORRECT -- onCleanup as separate call

```tsx
import { createEffect, onCleanup } from "solid-js";

createEffect(() => {
  const timer = setInterval(tick, 1000);
  onCleanup(() => clearInterval(timer)); // Explicit cleanup registration
});
```

### CORRECT -- onMount with onCleanup

```tsx
import { onMount, onCleanup } from "solid-js";

function Timer() {
  onMount(() => {
    const timer = setInterval(tick, 1000);
    onCleanup(() => clearInterval(timer));
  });
  return <div>Timer running</div>;
}
```

---

## AP-019: useRouter / Next.js Router

### WRONG -- React/Next.js router

```tsx
import { useRouter } from "next/router";

function NavButton() {
  const router = useRouter();
  return <button onClick={() => router.push("/dashboard")}>Go</button>;
}
```

### WRONG -- React Router useHistory

```tsx
import { useHistory } from "react-router-dom";

function NavButton() {
  const history = useHistory();
  return <button onClick={() => history.push("/dashboard")}>Go</button>;
}
```

### CORRECT -- Solid Router useNavigate

```tsx
import { useNavigate } from "@solidjs/router";

function NavButton() {
  const navigate = useNavigate();
  return <button onClick={() => navigate("/dashboard")}>Go</button>;
}
```

---

## AP-020: Data Fetching in useEffect/createEffect

### WRONG -- React pattern: manual fetch in effect

```tsx
function UserProfile(props: { id: string }) {
  const [user, setUser] = createSignal(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(null);

  createEffect(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${props.id}`);
      setUser(await res.json());
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  });

  return (
    <Show when={!loading()} fallback={<p>Loading...</p>}>
      <div>{user()?.name}</div>
    </Show>
  );
}
```

### CORRECT -- createResource

```tsx
import { createResource, Suspense, Show } from "solid-js";

const fetchUser = async (id: string) => {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
};

function UserProfile(props: { id: string }) {
  const [user] = createResource(() => props.id, fetchUser);

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Show when={user()}>
        {(u) => <div>{u().name}</div>}
      </Show>
    </Suspense>
  );
}
```

### CORRECT -- createAsync with query (SolidStart)

```tsx
import { query, createAsync } from "@solidjs/router";
import { useParams } from "@solidjs/router";

const getUser = query(async (id: string) => {
  "use server";
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}, "user");

function UserProfile() {
  const params = useParams();
  const user = createAsync(() => getUser(params.id));

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <div>{user()?.name}</div>
    </Suspense>
  );
}
```

---

## AP-021: element Prop on Route

### WRONG -- React Router pattern

```tsx
import { Route } from "@solidjs/router";

<Route path="/dashboard" element={<Dashboard />} />
// element={<Dashboard />} creates the component IMMEDIATELY, not lazily.
```

### CORRECT -- component prop

```tsx
import { Route } from "@solidjs/router";

<Route path="/dashboard" component={Dashboard} />
// component={Dashboard} passes the reference. Router creates it when needed.
```

---

## AP-022: getServerSideProps Pattern

### WRONG -- Next.js data loading

```tsx
// pages/users/[id].tsx (Next.js)
export async function getServerSideProps({ params }) {
  const user = await fetchUser(params.id);
  return { props: { user } };
}

export default function UserPage({ user }) {
  return <div>{user.name}</div>;
}
```

### CORRECT -- SolidStart pattern

```tsx
// routes/users/[id].tsx (SolidStart)
import { query, createAsync } from "@solidjs/router";
import { useParams } from "@solidjs/router";

const getUser = query(async (id: string) => {
  "use server";
  return fetchUser(id);
}, "user");

export default function UserPage() {
  const params = useParams();
  const user = createAsync(() => getUser(params.id));
  return <div>{user()?.name}</div>;
}
```

---

## AP-023: Form onSubmit with preventDefault

### WRONG -- JavaScript-only form handling

```tsx
function TodoForm() {
  const [value, setValue] = createSignal("");

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    await fetch("/api/todos", {
      method: "POST",
      body: JSON.stringify({ title: value() }),
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={value()} onInput={(e) => setValue(e.target.value)} />
      <button type="submit">Add</button>
    </form>
  );
}
// Does not work without JavaScript. No progressive enhancement.
```

### CORRECT -- SolidStart action with progressive enhancement

```tsx
import { action } from "@solidjs/router";

const addTodo = action(async (formData: FormData) => {
  "use server";
  const title = formData.get("title") as string;
  await db.addTodo(title);
}, "addTodo");

function TodoForm() {
  return (
    <form action={addTodo} method="post">
      <input name="title" />
      <button type="submit">Add</button>
    </form>
  );
}
// Works WITH and WITHOUT JavaScript. Progressive enhancement by default.
```
