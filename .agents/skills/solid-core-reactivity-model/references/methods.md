# solid-core-reactivity-model — API Methods Reference

## Ownership and Scope Primitives

### createRoot

Creates a new reactive ownership root. Computations created inside are owned by this root and disposed when `dispose` is called.

```typescript
import { createRoot } from "solid-js";

function createRoot<T>(fn: (dispose: () => void) => T): T;
```

**Parameters:**
- `fn` — Function that receives a `dispose` callback. All reactive computations created inside `fn` are owned by this root.

**Returns:** The return value of `fn`.

**Behavior:**
- Creates a non-tracked, non-owned scope
- Child computations (effects, memos) are automatically disposed when `dispose()` is called
- ALWAYS use when creating reactive computations outside the component tree
- Component rendering internally uses `createRoot` — you do NOT need it inside components

```typescript
// Standalone reactive system (outside component tree)
const dispose = createRoot((dispose) => {
  const [count, setCount] = createSignal(0);
  createEffect(() => console.log("Count:", count()));
  return dispose;
});

// Later: clean up all reactive computations
dispose();
```

---

### getOwner

Returns the current reactive owner context, or `null` if called outside any reactive scope.

```typescript
import { getOwner } from "solid-js";

function getOwner(): Owner | null;
```

**Returns:** The current `Owner` object, or `null`.

**Use cases:**
- Capture owner before async boundaries
- Pass owner to `runWithOwner` for deferred reactive setup
- Debug ownership hierarchy

```typescript
function MyComponent() {
  const owner = getOwner(); // Captures current component's owner
  console.log(owner); // Owner object with computation tree

  setTimeout(() => {
    // owner is still valid here — captured synchronously
    runWithOwner(owner!, () => {
      createEffect(() => { /* has proper ownership */ });
    });
  }, 1000);
}
```

---

### runWithOwner

Executes a function under a specific owner's reactive scope. Necessary when creating reactive computations in async contexts where the original owner has been lost.

```typescript
import { runWithOwner } from "solid-js";

function runWithOwner<T>(owner: Owner, fn: () => T): T | undefined;
```

**Parameters:**
- `owner` — The owner scope to execute under (obtained from `getOwner()`)
- `fn` — Function to execute within that owner's scope

**Returns:** The return value of `fn`, or `undefined` if owner is invalid.

**CRITICAL:** Async callbacks (after `await`, inside `setTimeout`, in Promise `.then()`) lose their tracking owner. Without `runWithOwner`, effects created in these contexts have no owner, causing memory leaks and missing cleanup.

```typescript
function DataLoader() {
  const owner = getOwner();

  onMount(async () => {
    const data = await loadData();

    // WRONG: No owner in async context
    createEffect(() => process(data, filter())); // Memory leak!

    // CORRECT: Restore owner explicitly
    runWithOwner(owner!, () => {
      createEffect(() => process(data, filter())); // Properly owned
    });
  });
}
```

---

## Tracking Scope Primitives

### createSignal

Creates a reactive signal — the fundamental reactive source in SolidJS.

```typescript
import { createSignal } from "solid-js";

function createSignal<T>(): Signal<T | undefined>;
function createSignal<T>(value: T, options?: SignalOptions<T>): Signal<T>;

type Signal<T> = [get: Accessor<T>, set: Setter<T>];
type Accessor<T> = () => T;

interface SignalOptions<T> {
  name?: string;
  equals?: false | ((prev: T, next: T) => boolean);
  internal?: boolean;
}
```

**Getter behavior:** Calling the getter inside a tracking scope registers a dependency. Calling it outside a tracking scope returns the value without subscribing.

**Setter behavior:** Updates the value and synchronously (1.x) or batch-notifies (2.x) all subscribers. Accepts a direct value or a function `(prev: T) => T`.

**Equality:** Default `===` comparison. Set `equals: false` to always notify. Provide a custom function for complex types.

---

### createEffect

Creates a reactive side effect that re-executes when tracked dependencies change.

```typescript
import { createEffect } from "solid-js";

function createEffect<Next>(
  fn: EffectFunction<undefined | NoInfer<Next>, Next>
): void;

function createEffect<Next, Init = Next>(
  fn: EffectFunction<Init | Next, Next>,
  value: Init,
  options?: { name?: string }
): void;
```

**Timing (1.x):** Runs after current rendering phase completes, after DOM creation, before browser paint. Subsequent runs fire when dependencies change.

**Tracking:** All signal/memo reads inside `fn` are automatically tracked. No dependency array.

**Cleanup:** Use `onCleanup()` inside the effect — do NOT return a cleanup function.

---

### createMemo

Creates a cached derived computation that only recalculates when dependencies change.

```typescript
import { createMemo } from "solid-js";

function createMemo<T>(
  fn: (v: T) => T,
  value?: T,
  options?: {
    equals?: false | ((prev: T, next: T) => boolean);
    name?: string;
  }
): Accessor<T>;
```

**Returns:** A read-only accessor `() => T` that IS itself a reactive source — other computations can track it.

**Caching:** Result is cached. Multiple reads return the cached value without recalculating. Only recalculates when a tracked dependency changes.

**Equality gating:** If the new result equals the previous (per `equals`), downstream dependents are NOT notified.

---

### createRenderEffect

Creates a synchronous effect that runs during the render phase (before DOM mounting on first run).

```typescript
import { createRenderEffect } from "solid-js";

function createRenderEffect<Next>(
  fn: EffectFunction<undefined | NoInfer<Next>, Next>
): void;

function createRenderEffect<Next, Init = Next>(
  fn: EffectFunction<Init | Next, Next>,
  value: Init,
  options?: { name?: string }
): void;
```

**Key difference from createEffect:** Runs synchronously during render. Refs are NOT available on initial run. Runs during SSR's synchronous phase.

---

### createComputed

Creates a computation that runs before the rendering phase for state synchronization.

```typescript
import { createComputed } from "solid-js";

function createComputed<Next>(
  fn: EffectFunction<undefined | NoInfer<Next>, Next>
): void;

function createComputed<Next, Init = Next>(
  fn: EffectFunction<Init | Next, Next>,
  value: Init,
  options?: { name?: string }
): void;
```

**Purpose:** Synchronize derived state before render to prevent double-render cycles.

---

## Reactive Utilities

### batch

Defers all downstream computations until the callback completes.

```typescript
import { batch } from "solid-js";

function batch<T>(fn: () => T): T;
```

**In 1.x:** Explicit batching — multiple signal updates trigger downstream ONCE.
**In 2.x:** All updates are microtask-batched by default; `batch()` is rarely needed.

---

### untrack

Prevents dependency tracking for code executed within its scope.

```typescript
import { untrack } from "solid-js";

function untrack<T>(fn: () => T): T;
```

**Use case:** Read a signal's value without subscribing to it.

---

### on

Wraps an effect function to only track explicitly specified dependencies.

```typescript
import { on } from "solid-js";

function on<S, Next>(
  deps: Accessor<S> | AccessorArray<S>,
  fn: (input: S, prevInput: S, prev: Next) => Next,
  options?: { defer?: boolean }
): EffectFunction<undefined | NoInfer<Next>, Next>;
```

**`defer: true`** skips the initial run — the effect only fires on subsequent dependency changes.

---

## Lifecycle

### onMount

Runs once after initial rendering and DOM mounting. Non-tracking.

```typescript
import { onMount } from "solid-js";

function onMount(fn: () => void): void;
```

**SolidJS 2.x:** Renamed to `onSettled`, which can return a cleanup function.

---

### onCleanup

Registers a cleanup function for when the current scope disposes or re-executes.

```typescript
import { onCleanup } from "solid-js";

function onCleanup(fn: () => void): void;
```

**Execution order:** Multiple `onCleanup` calls within a scope execute in reverse order (LIFO).

---

## 2.x-Specific Primitives

### flush (SolidJS 2.x only)

Forces immediate propagation of all pending batched updates.

```typescript
import { flush } from "solid-js";

function flush(): void;
```

**Use case:** When synchronous behavior is required in the 2.x microtask-batched model.

### onSettled (SolidJS 2.x only)

Replacement for `onMount`. Runs after initial rendering settles. Can return a cleanup function.

```typescript
import { onSettled } from "solid-js";

function onSettled(fn: () => (() => void) | void): void;
```
