# Reactive Primitives — Usage Patterns and Examples

All examples use TypeScript + TSX. All code is valid SolidJS.

---

## createSignal Patterns

### Basic Counter

```tsx
import { createSignal } from "solid-js";

function Counter() {
  const [count, setCount] = createSignal(0);

  return (
    <button onClick={() => setCount((prev) => prev + 1)}>
      Count: {count()}
    </button>
  );
}
```

### Typed Signal with Options

```typescript
import { createSignal } from "solid-js";

interface User {
  id: number;
  name: string;
  email: string;
}

const [user, setUser] = createSignal<User>(
  { id: 1, name: "Alice", email: "alice@example.com" },
  {
    equals: (prev, next) => prev.id === next.id,
    name: "currentUser",
  }
);

// Functional update preserving other fields
setUser((prev) => ({ ...prev, name: "Bob" }));
```

### Signal Without Initial Value

```typescript
import { createSignal } from "solid-js";

const [selected, setSelected] = createSignal<string>();
// Type: Accessor<string | undefined>

// ALWAYS handle the undefined case
const display = createMemo(() => selected() ?? "Nothing selected");
```

### Force-Update Signal (Skip Equality)

```typescript
const [tick, setTick] = createSignal(0, { equals: false });

// Every call propagates, even if value is same
setTick(0); // Notifies subscribers
setTick(0); // Notifies subscribers again
```

---

## createEffect Patterns

### DOM Side Effect

```tsx
import { createSignal, createEffect } from "solid-js";

function DocumentTitle() {
  const [title, setTitle] = createSignal("My App");

  createEffect(() => {
    document.title = title(); // Auto-tracked, updates when title changes
  });

  return <input value={title()} onInput={(e) => setTitle(e.target.value)} />;
}
```

### Effect with Previous Value

```typescript
import { createSignal, createEffect } from "solid-js";

const [count, setCount] = createSignal(0);

createEffect((prev: number) => {
  const current = count();
  if (current > prev) {
    console.log("Increased by", current - prev);
  }
  return current; // Becomes prev on next run
}, 0); // Initial prev value
```

### Effect with Cleanup (Event Listener)

```typescript
import { createSignal, createEffect, onCleanup } from "solid-js";

function KeyLogger() {
  const [lastKey, setLastKey] = createSignal("");

  createEffect(() => {
    const handler = (e: KeyboardEvent) => setLastKey(e.key);
    document.addEventListener("keydown", handler);
    onCleanup(() => document.removeEventListener("keydown", handler));
  });

  return <span>Last key: {lastKey()}</span>;
}
```

### Nested Effects (Independent Tracking)

```typescript
import { createSignal, createEffect } from "solid-js";

const [page, setPage] = createSignal("home");
const [theme, setTheme] = createSignal("light");

createEffect(() => {
  console.log("Page:", page()); // Outer tracks page only

  createEffect(() => {
    console.log("Theme:", theme()); // Inner tracks theme only
  });
});

// Changing theme does NOT re-run outer effect
// Changing page re-runs outer (and recreates inner)
```

---

## createMemo Patterns

### Filtered List

```tsx
import { createSignal, createMemo, For } from "solid-js";

function FilteredList() {
  const [query, setQuery] = createSignal("");
  const [items] = createSignal(["Apple", "Banana", "Cherry", "Date"]);

  const filtered = createMemo(() =>
    items().filter((item) =>
      item.toLowerCase().includes(query().toLowerCase())
    )
  );

  return (
    <div>
      <input
        value={query()}
        onInput={(e) => setQuery(e.target.value)}
        placeholder="Filter..."
      />
      <p>Showing {filtered().length} items</p>
      <For each={filtered()}>
        {(item) => <div>{item}</div>}
      </For>
    </div>
  );
}
```

### Chained Memos

```typescript
import { createSignal, createMemo } from "solid-js";

const [price, setPrice] = createSignal(100);
const [taxRate, setTaxRate] = createSignal(0.21);
const [discount, setDiscount] = createSignal(0);

const subtotal = createMemo(() => price() - discount());
const tax = createMemo(() => subtotal() * taxRate());
const total = createMemo(() => subtotal() + tax());

// Changing price recalculates subtotal -> tax -> total
// Changing taxRate recalculates tax -> total (subtotal unchanged)
```

### Memo with Custom Equality

```typescript
import { createSignal, createMemo } from "solid-js";

interface Point {
  x: number;
  y: number;
}

const [rawPosition, setRawPosition] = createSignal<Point>({ x: 0, y: 0 });

// Only propagate if position actually changed (avoid floating point noise)
const position = createMemo(
  () => rawPosition(),
  undefined,
  {
    equals: (prev, next) =>
      Math.abs(prev.x - next.x) < 0.001 &&
      Math.abs(prev.y - next.y) < 0.001,
  }
);
```

---

## createResource Patterns

### Basic Data Fetching

```tsx
import { createResource, Suspense } from "solid-js";

interface Post {
  id: number;
  title: string;
  body: string;
}

async function fetchPosts(): Promise<Post[]> {
  const res = await fetch("https://jsonplaceholder.typicode.com/posts");
  return res.json();
}

function PostList() {
  const [posts] = createResource<Post[]>(fetchPosts);

  return (
    <Suspense fallback={<div>Loading posts...</div>}>
      <For each={posts()}>
        {(post) => <article><h2>{post.title}</h2><p>{post.body}</p></article>}
      </For>
    </Suspense>
  );
}
```

### Source-Based Refetching

```tsx
import { createSignal, createResource, Suspense, ErrorBoundary } from "solid-js";

interface User {
  id: number;
  name: string;
}

function UserProfile() {
  const [userId, setUserId] = createSignal(1);

  const [user] = createResource<User, number>(userId, async (id) => {
    const res = await fetch(`/api/users/${id}`);
    if (!res.ok) throw new Error("User not found");
    return res.json();
  });

  return (
    <ErrorBoundary fallback={(err) => <div>Error: {err.message}</div>}>
      <Suspense fallback={<div>Loading user...</div>}>
        <div>
          <h1>{user()?.name}</h1>
          <button onClick={() => setUserId((prev) => prev + 1)}>
            Next User
          </button>
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}
```

### Optimistic Updates with Mutate

```typescript
import { createResource } from "solid-js";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

const [todos, { mutate, refetch }] = createResource<Todo[]>(fetchTodos);

async function toggleTodo(id: number) {
  // Optimistic: update UI immediately
  mutate((prev) =>
    prev?.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
  );

  try {
    await fetch(`/api/todos/${id}/toggle`, { method: "PATCH" });
  } catch {
    await refetch(); // Revert on failure by re-fetching
  }
}
```

### Conditional Fetching (Falsy Source Prevents Fetch)

```typescript
import { createSignal, createResource } from "solid-js";

const [selectedId, setSelectedId] = createSignal<number | false>(false);

// Does NOT fetch until selectedId is truthy
const [details] = createResource(selectedId, async (id) => {
  const res = await fetch(`/api/items/${id}`);
  return res.json();
});

// Later: trigger first fetch
setSelectedId(42);
```

---

## batch Patterns

### Multiple Signal Updates

```typescript
import { createSignal, batch } from "solid-js";

const [firstName, setFirstName] = createSignal("John");
const [lastName, setLastName] = createSignal("Doe");
const [age, setAge] = createSignal(30);

function updateUser(first: string, last: string, userAge: number) {
  batch(() => {
    setFirstName(first);
    setLastName(last);
    setAge(userAge);
  }); // All effects depending on these signals fire ONCE
}
```

### Batch with Return Value

```typescript
import { createSignal, batch } from "solid-js";

const [count, setCount] = createSignal(0);

const newValue = batch(() => {
  setCount(10);
  setCount((prev) => prev + 5);
  return count(); // Returns 15 (immediate recalculation since Solid 1.4)
});
```

---

## untrack Patterns

### Reading Initial Props Without Tracking

```tsx
import { createSignal, untrack } from "solid-js";

interface Props {
  initialCount: number;
  label: string;
}

function Counter(props: Props) {
  // Read initial value without tracking further changes
  const [count, setCount] = createSignal(untrack(() => props.initialCount));

  return (
    <div>
      <span>{props.label}: {count()}</span>
      <button onClick={() => setCount((prev) => prev + 1)}>+</button>
    </div>
  );
}
```

### Selective Tracking in Effects

```typescript
import { createSignal, createEffect, untrack } from "solid-js";

const [searchQuery, setSearchQuery] = createSignal("");
const [sortOrder, setSortOrder] = createSignal("asc");

createEffect(() => {
  const query = searchQuery(); // Tracked: re-run when query changes
  const sort = untrack(() => sortOrder()); // NOT tracked: read current value only
  console.log(`Searching "${query}" (sorted ${sort})`);
});
```

---

## on Patterns

### Explicit Dependency with Defer

```typescript
import { createSignal, createEffect, on } from "solid-js";

const [count, setCount] = createSignal(0);

// Skip initial run, only fire on changes
createEffect(
  on(count, (value, prevValue) => {
    console.log(`Count changed: ${prevValue} -> ${value}`);
  }, { defer: true })
);
```

### Multiple Dependencies

```typescript
import { createSignal, createEffect, on } from "solid-js";

const [width, setWidth] = createSignal(100);
const [height, setHeight] = createSignal(50);

createEffect(
  on([width, height], ([w, h], [prevW, prevH]) => {
    console.log(`Size: ${prevW}x${prevH} -> ${w}x${h}`);
  })
);
```

---

## Lifecycle Patterns

### onMount for DOM Access

```tsx
import { onMount } from "solid-js";

function AutoFocusInput() {
  let inputRef: HTMLInputElement;

  onMount(() => {
    inputRef.focus(); // DOM is ready, ref is set
  });

  return <input ref={inputRef} placeholder="Auto-focused" />;
}
```

### onCleanup for Resource Disposal

```tsx
import { createSignal, onCleanup } from "solid-js";

function WebSocketComponent() {
  const [messages, setMessages] = createSignal<string[]>([]);

  const ws = new WebSocket("wss://example.com/ws");
  ws.onmessage = (e) => setMessages((prev) => [...prev, e.data]);

  onCleanup(() => {
    ws.close(); // Clean up WebSocket on unmount
  });

  return (
    <ul>
      <For each={messages()}>
        {(msg) => <li>{msg}</li>}
      </For>
    </ul>
  );
}
```

### Combined Lifecycle Pattern

```tsx
import { createSignal, createEffect, onMount, onCleanup } from "solid-js";

function ResizeTracker() {
  const [width, setWidth] = createSignal(0);

  onMount(() => {
    setWidth(window.innerWidth); // Initial measurement after DOM mount
  });

  createEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    onCleanup(() => window.removeEventListener("resize", handler));
  });

  return <div>Window width: {width()}px</div>;
}
```

---

## Reactive Composition Patterns

### Signal + Memo + Effect Pipeline

```tsx
import { createSignal, createMemo, createEffect } from "solid-js";

function SearchResults() {
  // Source: user input
  const [query, setQuery] = createSignal("");

  // Derived: debounced query (simplified)
  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  createEffect(() => {
    const q = query();
    const timeout = setTimeout(() => setDebouncedQuery(q), 300);
    onCleanup(() => clearTimeout(timeout));
  });

  // Derived: filtered results
  const results = createMemo(() => {
    const q = debouncedQuery().toLowerCase();
    if (!q) return allItems();
    return allItems().filter((item) => item.name.toLowerCase().includes(q));
  });

  // Side effect: analytics
  createEffect(() => {
    if (debouncedQuery()) {
      trackSearch(debouncedQuery(), results().length);
    }
  });

  return (
    <div>
      <input
        value={query()}
        onInput={(e) => setQuery(e.target.value)}
      />
      <For each={results()}>
        {(item) => <div>{item.name}</div>}
      </For>
    </div>
  );
}
```

### observable + from (RxJS Interop)

```typescript
import { createSignal, observable, from } from "solid-js";
import { map, filter, debounceTime } from "rxjs/operators";
import { from as rxFrom } from "rxjs";

// SolidJS signal -> RxJS Observable
const [input, setInput] = createSignal("");
const input$ = rxFrom(observable(input));

// RxJS pipeline
const processed$ = input$.pipe(
  debounceTime(300),
  filter((v) => v.length > 2),
  map((v) => v.toUpperCase())
);

// RxJS Observable -> SolidJS signal
const processedSignal = from(processed$);

// Use in JSX
// <div>{processedSignal()}</div>
```

### from with Custom Producer

```typescript
import { from } from "solid-js";

// Bridge a custom event source into SolidJS reactivity
const mousePosition = from<{ x: number; y: number }>((set) => {
  const handler = (e: MouseEvent) => set({ x: e.clientX, y: e.clientY });
  window.addEventListener("mousemove", handler);
  return () => window.removeEventListener("mousemove", handler);
});

// mousePosition() returns { x, y } or undefined
```
