# Debugging Methods Reference

## solid-devtools

### Installation

```bash
npm install --save-dev solid-devtools
```

### Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import devtools from "solid-devtools/vite";

export default defineConfig({
  plugins: [
    devtools({
      autoname: true,    // Automatically names signals/effects for devtools
      locator: true,     // Click-to-source in browser
    }),
    solidPlugin(),
  ],
});
```

### Entry Point Import

```typescript
// src/index.tsx — MUST be the first import
import "solid-devtools";
import { render } from "solid-js/web";
import App from "./App";

render(() => <App />, document.getElementById("root")!);
```

### Browser Extension Features

| Feature | What It Shows | Use When |
|---------|--------------|----------|
| Signal Inspector | Current value of every signal | Verify signal is updating |
| Dependency Graph | Which computations depend on which signals | Find missing or unexpected dependencies |
| Component Tree | Live component hierarchy with props | Verify props flow correctly |
| Computation List | All effects/memos and their re-run count | Find effects that never re-run |
| Update Highlighting | Visual flash on DOM updates | Verify which DOM nodes update |

---

## Console Logging Strategies

### Strategy 1: Isolation Effect

Create a dedicated effect that reads ONLY the suspect signal. If it fires, the signal works — the bug is in how your component accesses it.

```typescript
import { createEffect } from "solid-js";

// ALWAYS place isolation effects at component top level
createEffect(() => {
  console.log("[DEBUG:count]", count());
});
```

### Strategy 2: Effect Entry/Exit Logging

Log when an effect enters and what dependencies it reads:

```typescript
createEffect(() => {
  console.log("[EFFECT:start] user-sync");
  const name = userName();
  const age = userAge();
  console.log("[EFFECT:deps]", { name, age });
  // ... actual effect logic ...
  console.log("[EFFECT:end] user-sync");
});
```

### Strategy 3: Setter Interception

Wrap a setter to log every update:

```typescript
const [count, _setCount] = createSignal(0);
const setCount = (v: number | ((prev: number) => number)) => {
  const result = _setCount(v as any);
  console.log("[SET:count]", count());
  return result;
};
```

### Strategy 4: Store Path Logging

For stores, log specific paths to verify updates propagate:

```typescript
import { createEffect } from "solid-js";

// Log a specific store path
createEffect(() => {
  console.log("[STORE:user.name]", store.user.name);
});

// Log array length changes
createEffect(() => {
  console.log("[STORE:items.length]", store.items.length);
});
```

### Strategy 5: Cleanup Logging

Verify effects are being disposed and re-created correctly:

```typescript
import { createEffect, onCleanup } from "solid-js";

createEffect(() => {
  const id = Math.random().toString(36).slice(2, 8);
  console.log(`[EFFECT:${id}] created, count =`, count());
  onCleanup(() => console.log(`[EFFECT:${id}] disposed`));
});
```

---

## Tracking Scope Identification

### Method 1: getOwner() Check

Use `getOwner()` to verify you are inside a tracking scope:

```typescript
import { getOwner } from "solid-js";

function debugTrackingScope(label: string): void {
  const owner = getOwner();
  if (owner) {
    console.log(`[TRACKING:${label}] Inside tracking scope`);
  } else {
    console.warn(`[TRACKING:${label}] NOT in tracking scope — reads will NOT be tracked`);
  }
}

// Usage
createEffect(() => {
  debugTrackingScope("my-effect"); // "Inside tracking scope"
  console.log(count());
});

function MyComponent() {
  debugTrackingScope("component-body"); // "NOT in tracking scope"
  return <div>{count()}</div>;
}
```

### Method 2: on() for Explicit Tracking

When automatic tracking is unclear, use `on()` to make dependencies explicit:

```typescript
import { createEffect, on } from "solid-js";

// Explicit: ONLY tracks `userId`, nothing else
createEffect(
  on(userId, (id) => {
    console.log("[EXPLICIT] userId changed to:", id);
    // Any other signal reads here are NOT tracked
  })
);

// Multiple explicit dependencies
createEffect(
  on([firstName, lastName], ([first, last]) => {
    console.log("[EXPLICIT] name changed:", first, last);
  })
);
```

### Method 3: untrack() for Diagnostic Reads

Read a value without adding it as a dependency — useful for logging context without affecting tracking:

```typescript
import { createEffect, untrack } from "solid-js";

createEffect(() => {
  const c = count(); // Tracked
  // Log context without tracking it
  const ctx = untrack(() => ({
    route: currentRoute(),
    user: userName(),
  }));
  console.log("[EFFECT] count =", c, "context =", ctx);
});
```

---

## unwrap() for Store Debugging

Use `unwrap` to inspect raw store data without proxy interference:

```typescript
import { unwrap } from "solid-js/store";

// See the actual data, not the Proxy
console.log("[STORE:raw]", JSON.stringify(unwrap(store), null, 2));

// Compare proxy vs raw
console.log("[STORE:proxy]", store.users);      // Proxy object
console.log("[STORE:raw]", unwrap(store).users); // Plain array
```

**NEVER** use `unwrap` in production code for anything other than debugging — it strips all reactivity.

---

## batch() for Debugging Multiple Updates

When debugging update order, wrap updates in `batch()` to see the combined result:

```typescript
import { batch } from "solid-js";

// Without batch — 3 separate effect runs
setA(1); // effect fires
setB(2); // effect fires
setC(3); // effect fires

// With batch — 1 effect run
batch(() => {
  setA(1);
  setB(2);
  setC(3);
}); // effect fires once with all three updated

// Debug: log before and after batch
console.log("[BATCH:before]", a(), b(), c());
batch(() => {
  setA(10);
  setB(20);
  setC(30);
});
console.log("[BATCH:after]", a(), b(), c());
```
