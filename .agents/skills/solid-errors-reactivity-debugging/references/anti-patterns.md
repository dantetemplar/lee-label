# Debugging Anti-Patterns

## Anti-Pattern 1: Console.log Outside Tracking Scope

### The Mistake

```typescript
// WRONG — logging in the component body does NOT re-run
function Counter() {
  const [count, setCount] = createSignal(0);
  console.log("Current count:", count()); // Runs once during setup, NEVER again
  return <button onClick={() => setCount((c) => c + 1)}>{count()}</button>;
}
```

### Why It Fails

The component function body runs exactly once. It is NOT a tracking scope. The `console.log` reads `count()` once and never re-executes.

### Correct Approach

```typescript
function Counter() {
  const [count, setCount] = createSignal(0);

  createEffect(() => {
    console.log("Current count:", count()); // Re-runs on every change
  });

  return <button onClick={() => setCount((c) => c + 1)}>{count()}</button>;
}
```

---

## Anti-Pattern 2: Debugging by Destructuring

### The Mistake

```typescript
// WRONG — destructuring to "simplify" debugging actually breaks reactivity
createEffect(() => {
  const { name, age } = store.user; // Reads once, snapshot values
  console.log("User:", name, age);  // These are static strings/numbers
});
```

### Why It Fails

Destructuring `store.user` extracts the property values at that moment. The `name` and `age` variables hold plain strings/numbers, not reactive references. The effect has NO dependency on `store.user.name` or `store.user.age` — it depends only on the `store.user` object reference itself.

### Correct Approach

```typescript
createEffect(() => {
  console.log("User:", store.user.name, store.user.age); // Access props directly
});
```

---

## Anti-Pattern 3: Adding Tracking to Event Handlers

### The Mistake

```typescript
// WRONG — wrapping event handler in createEffect expecting reactive behavior
function SearchBox() {
  const [query, setQuery] = createSignal("");

  createEffect(() => {
    // This runs on every query change — but it's not an event handler
    document.getElementById("search")?.focus();
    console.log(query()); // Unintended: effect re-runs on EVERY keystroke
  });

  return <input id="search" onInput={(e) => setQuery(e.target.value)} />;
}
```

### Why It Fails

Event handlers in SolidJS are intentionally NOT tracking scopes. If you need reactive behavior, use `createEffect`. But do not conflate event-driven logic (user clicks, input) with reactive dependencies (signal changes). This creates unnecessary effect re-runs.

### Correct Approach

```typescript
function SearchBox() {
  const [query, setQuery] = createSignal("");

  // Effect for reactive side effects ONLY
  createEffect(() => {
    console.log("Query changed:", query());
  });

  // Event handler for user-initiated actions
  const handleInput = (e: InputEvent) => {
    setQuery((e.target as HTMLInputElement).value);
  };

  return <input onInput={handleInput} />;
}
```

---

## Anti-Pattern 4: Using JSON.stringify on Store Proxies

### The Mistake

```typescript
// WRONG — JSON.stringify on a proxy may produce unexpected results
console.log("Store:", JSON.stringify(store));
```

### Why It Fails

Store proxies intercept property access. `JSON.stringify` triggers all getters, which registers every property as a dependency if called inside a tracking scope. This can cause effects to re-run on ANY store change, not just the properties you care about.

### Correct Approach

```typescript
import { unwrap } from "solid-js/store";

// unwrap strips the proxy — safe for serialization
console.log("Store:", JSON.stringify(unwrap(store), null, 2));

// Or log specific properties
console.log("User:", store.user.name, store.user.age);
```

---

## Anti-Pattern 5: Debugging with Intermediate Variables

### The Mistake

```typescript
// WRONG — intermediate variable captures snapshot
createEffect(() => {
  const data = fetchedData(); // Tracked, but...
  const items = data?.items;   // Plain array snapshot
  const count = items?.length; // Plain number
  console.log("Items:", count); // Fine for this run, but misleading for store data
});
```

### Why It Is Misleading

For signals, this works because the effect re-runs when `fetchedData` changes and re-extracts everything. But for **stores**, intermediate variables break the fine-grained tracking chain:

```typescript
// WRONG for stores — breaks fine-grained tracking
createEffect(() => {
  const user = store.user;      // Tracks store.user reference
  const name = user.name;       // Does NOT track store.user.name separately
  console.log("Name:", name);   // May miss updates to store.user.name
});
```

### Correct Approach for Stores

```typescript
// CORRECT — access the full property path to maintain fine-grained tracking
createEffect(() => {
  console.log("Name:", store.user.name); // Tracks store.user.name specifically
});
```

---

## Anti-Pattern 6: Wrapping Everything in createEffect for Debugging

### The Mistake

```typescript
// WRONG — creating effects just to watch values pollutes the reactive graph
createEffect(() => console.log("a =", a()));
createEffect(() => console.log("b =", b()));
createEffect(() => console.log("c =", c()));
createEffect(() => console.log("d =", d()));
createEffect(() => console.log("store =", JSON.stringify(unwrap(store))));
```

### Why It Is Problematic

Each `createEffect` registers as a subscriber, increasing memory usage and execution overhead. In production, forgotten debug effects cause unnecessary computation. They also alter timing — adding effects can mask or create race conditions.

### Correct Approach

Use solid-devtools for production-grade inspection. For temporary logging, use a single consolidated effect and remove it before committing:

```typescript
// Single debug effect — easy to find and remove
if (import.meta.env.DEV) {
  createEffect(() => {
    console.log("[DEBUG]", {
      a: a(),
      b: b(),
      c: c(),
    });
  });
}
```

---

## Anti-Pattern 7: Expecting Component Re-Render Logs

### The Mistake

```typescript
// WRONG — expecting this to log on every state change (React mental model)
function Counter() {
  const [count, setCount] = createSignal(0);
  console.log("Component rendered with count:", count());
  // ^ This logs ONCE. SolidJS components do NOT re-render.

  return <div>{count()}</div>;
}
```

### Why It Fails

SolidJS component functions run **exactly once** to set up the reactive graph. There is no re-render cycle. The `console.log` in the component body executes during setup and never again. Only code inside tracking scopes (effects, memos, JSX expressions) re-executes.

### Correct Approach

```typescript
function Counter() {
  const [count, setCount] = createSignal(0);

  // Use an effect to log reactive changes
  createEffect(() => {
    console.log("Count updated to:", count());
  });

  return <div>{count()}</div>;
}
```

---

## Summary: Debug Logging Rules

| Rule | Rationale |
|------|-----------|
| ALWAYS place debug logs inside `createEffect` | Component body runs once, effects track changes |
| NEVER destructure stores for debugging | Breaks fine-grained tracking chain |
| ALWAYS use `unwrap()` before `JSON.stringify` on stores | Prevents proxy interference and accidental dependency registration |
| NEVER leave debug effects in production code | Pollutes reactive graph, wastes computation |
| ALWAYS use `import.meta.env.DEV` guard for debug effects | Ensures tree-shaking removes debug code in production |
| ALWAYS access store properties via full path | Maintains fine-grained reactivity tracking |
| NEVER assume component body re-runs | SolidJS components execute once — use effects for reactive logging |
