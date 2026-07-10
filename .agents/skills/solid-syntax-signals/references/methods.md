# Reactive Primitives — Complete API Signatures

All primitives import from `"solid-js"` unless noted otherwise.

---

## createSignal

```typescript
import { createSignal } from "solid-js";

// Overloads
function createSignal<T>(): Signal<T | undefined>;
function createSignal<T>(value: T, options?: SignalOptions<T>): Signal<T>;

// Return type
type Signal<T> = [get: Accessor<T>, set: Setter<T>];
type Accessor<T> = () => T;

type Setter<T> = {
  <U extends T>(value: Exclude<U, Function> | ((prev: T) => U)): U;
  <U extends T>(value: (prev: T) => U): U;
  <U extends T>(value: Exclude<U, Function>): U;
};

interface SignalOptions<T> {
  name?: string;                                    // Debug label (stripped in production)
  equals?: false | ((prev: T, next: T) => boolean); // Custom equality, default: ===
  internal?: boolean;                                // Hide from devtools
}
```

**Behavior:**
- Default equality: `===` (reference equality). If new value equals old, no updates propagate.
- Set `equals: false` to ALWAYS propagate, even if value is identical.
- Functional updates receive previous value: `setCount((prev) => prev + 1)`.
- Calling the getter inside a tracking scope registers a dependency.
- Calling the getter outside a tracking scope returns the current value without tracking.

---

## createEffect

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

type EffectFunction<Prev, Next extends Prev = Prev> = (v: Prev) => Next;
```

**Behavior:**
- Initial run: scheduled AFTER rendering completes, AFTER DOM creation, BEFORE browser paint.
- Refs ARE available on first run.
- Subsequent runs: whenever tracked dependencies change.
- Multiple dependency changes in same batch trigger effect ONCE.
- Order among multiple effects is NOT guaranteed.
- ALWAYS runs after all pure computations (memos) in same update cycle.
- NEVER runs during SSR.
- Does NOT run during initial client hydration.
- Second parameter is the initial value for `prev` on first run.

---

## createMemo

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

**Behavior:**
- Returns a read-only `Accessor<T>` (getter function).
- Result is cached; only recalculates when tracked dependencies change.
- IS a reactive source: other effects/memos can track it.
- If new result equals previous (per `equals`), downstream dependents are NOT notified.
- `fn` receives previous return value. Should be pure (no side effects).
- `value` is the optional initial value passed to `fn` on first execution.

---

## createResource

```typescript
import { createResource } from "solid-js";

// Without source
function createResource<T, R = unknown>(
  fetcher: ResourceFetcher<true, T, R>,
  options?: ResourceOptions<T>
): ResourceReturn<T, R>;

// With source (reactive trigger)
function createResource<T, S, R = unknown>(
  source: ResourceSource<S>,
  fetcher: ResourceFetcher<S, T, R>,
  options?: ResourceOptions<T, S>
): ResourceReturn<T, R>;

type ResourceReturn<T, R = unknown> = [Resource<T>, ResourceActions<T, R>];

type Resource<T> = {
  (): T | undefined;
  state: "unresolved" | "pending" | "ready" | "refreshing" | "errored";
  loading: boolean;
  error: any;
  latest: T | undefined;
};

type ResourceActions<T, R = unknown> = {
  mutate: (value: T | undefined) => T | undefined;
  refetch: (info?: R) => Promise<T> | T | undefined;
};

type ResourceSource<S> =
  | S
  | false
  | null
  | undefined
  | (() => S | false | null | undefined);

type ResourceFetcher<S, T, R = unknown> = (
  source: S,
  info: { value: T | undefined; refetching: R | boolean }
) => T | Promise<T>;

interface ResourceOptions<T, S = unknown> {
  initialValue?: T;
  name?: string;
  deferStream?: boolean;
  ssrLoadFrom?: "initial" | "server";
  storage?: (init: T | undefined) => [Accessor<T | undefined>, Setter<T | undefined>];
  onHydrated?: (k: S | undefined, info: { value: T | undefined }) => void;
}
```

**Behavior:**
- Source `false | null | undefined` prevents fetching until truthy.
- `fetcher` receives resolved source value and info object with previous value and refetching flag.
- `mutate` updates the resource value without re-fetching (optimistic updates).
- `refetch` re-triggers the fetcher. Optional `info` parameter passed as `info.refetching`.
- `data.latest` retains the last successfully resolved value during refreshing/errored states.
- Integrates with `<Suspense>` and `<ErrorBoundary>` automatically.

**State machine:**

| State | loading | error | latest | Trigger |
|-------|---------|-------|--------|---------|
| `unresolved` | false | undefined | undefined | Initial, before first fetch |
| `pending` | true | undefined | undefined | First fetch started |
| `ready` | false | undefined | T | Fetch resolved |
| `refreshing` | true | undefined | T | Re-fetch with prior value |
| `errored` | false | any | undefined | Fetch rejected |

---

## createRenderEffect

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

**Behavior:**
- Runs synchronously during the render phase (before DOM mount on initial run).
- Refs are NOT set during initial run.
- Re-runs after all memos complete in the update cycle.
- Runs once during SSR's synchronous phase (unlike createEffect which never runs during SSR).
- Use for DOM measurements that must happen synchronously.

---

## createComputed

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

**Behavior:**
- Runs BEFORE the rendering phase.
- Used for synchronizing state to prevent double-render cycles.
- Similar to createRenderEffect but executes earlier in the update cycle.

---

## batch

```typescript
import { batch } from "solid-js";

function batch<T>(fn: () => T): T;
```

**Behavior:**
- Defers all downstream computations until callback completes.
- Returns the callback's return value.
- Accessing a signal/memo inside batch triggers immediate recalculation if needed (since Solid 1.4).
- Async breaks batching: only updates before the first `await` are batched.
- Nesting is supported: multiple `batch()` calls combine into one logical batch.
- SolidJS auto-batches updates in `createEffect`, `onMount`, and store setters.

---

## untrack

```typescript
import { untrack } from "solid-js";

function untrack<T>(fn: () => T): T;
```

**Behavior:**
- Executes `fn` without registering any dependency tracking.
- Returns the value produced by `fn`.
- Signals read inside `untrack` do NOT become dependencies of the surrounding scope.
- Use for reading initial/default values without subscribing to changes.

---

## on

```typescript
import { on } from "solid-js";

function on<S, Next>(
  deps: Accessor<S> | AccessorArray<S>,
  fn: (input: S, prevInput: S, prev: Next) => Next,
  options?: { defer?: boolean }
): EffectFunction<undefined | NoInfer<Next>, Next>;

type AccessorArray<T> = [...Accessor<T>[]];
```

**Behavior:**
- Wraps an effect function to only track the specified dependencies.
- Any signals read inside `fn` are NOT tracked (only `deps` are tracked).
- `defer: true` skips the initial run; effect fires only on subsequent changes.
- Supports single accessor or array of accessors.
- When using array deps, `fn` receives arrays for `input` and `prevInput`.

---

## onMount

```typescript
import { onMount } from "solid-js";

function onMount(fn: () => void): void;
```

**Behavior:**
- Runs ONCE after initial rendering completes and DOM elements are mounted.
- Non-tracking: does NOT create reactive dependencies (signals read inside are NOT tracked).
- Equivalent to `createEffect` with no reactive dependencies.
- DOM refs ARE available.
- Can be async (returns void, but the callback can be async).

---

## onCleanup

```typescript
import { onCleanup } from "solid-js";

function onCleanup(fn: () => void): void;
```

**Behavior:**
- Registers a cleanup function for the current reactive scope.
- Runs when: component unmounts, effect recalculates (before new run), memo refreshes, `createRoot` scope disposes.
- Multiple `onCleanup` calls execute in LIFO order (Last In, First Out).
- Can be called inside effects, memos, components, or any reactive scope.

---

## observable

```typescript
import { observable } from "solid-js";

function observable<T>(input: Accessor<T>): Observable<T>;

// Standard Observable interface
interface Observable<T> {
  subscribe(observer: ObservableObserver<T>): { unsubscribe(): void };
}
```

**Behavior:**
- Converts a SolidJS signal accessor to a standard TC39 Observable.
- Compatible with RxJS `from()` for interop.
- Each subscription creates a reactive tracking scope.
- Unsubscribing disposes the tracking scope.

---

## from

```typescript
import { from } from "solid-js";

function from<T>(
  producer:
    | ((setter: (v: T) => T) => () => void)
    | {
        subscribe: (
          fn: (v: T) => void
        ) => (() => void) | { unsubscribe: () => void };
      }
): Accessor<T | undefined>;
```

**Behavior:**
- Bridges external reactive systems into SolidJS signals.
- Accepts either a producer function or an object with `subscribe` method.
- Producer form: receives a setter, returns a cleanup function.
- Subscribe form: compatible with RxJS Observables and Svelte stores.
- Cleanup runs automatically when the enclosing reactive scope disposes.
- Returns a read-only accessor (getter function).
