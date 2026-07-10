# API Signatures: Error Handling

## ErrorBoundary

```typescript
import { ErrorBoundary } from "solid-js";

interface ErrorBoundaryProps {
  fallback: JSX.Element | ((err: any, reset: () => void) => JSX.Element);
  children: JSX.Element;
}

function ErrorBoundary(props: ErrorBoundaryProps): JSX.Element;
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `fallback` | `JSX.Element \| ((err: any, reset: () => void) => JSX.Element)` | YES | Static JSX or function receiving error and reset callback |
| `children` | `JSX.Element` | YES | Components to protect with error boundary |

### Fallback Function Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `err` | `any` | The caught error object (typically `Error` instance) |
| `reset` | `() => void` | Clears the error state and re-renders children |

### Behavior

- Catches errors during rendering, in `createEffect`, `createMemo`, and `createResource`
- Does NOT catch errors in event handlers, `setTimeout`, `setInterval`, or async code outside reactive scope
- Calling `reset()` clears the error and attempts to re-render children
- Errors thrown inside the `fallback` function propagate to the PARENT ErrorBoundary
- Available since SolidJS 1.0

---

## Suspense

```typescript
import { Suspense } from "solid-js";

interface SuspenseProps {
  fallback?: JSX.Element;
  children: JSX.Element;
}

function Suspense(props: SuspenseProps): JSX.Element;
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `fallback` | `JSX.Element` | NO | Loading UI shown while resources are pending |
| `children` | `JSX.Element` | YES | Content shown after all tracked resources resolve |

### Behavior

- Tracks ALL `createResource` calls within its boundary
- Children DOM nodes are created immediately but NOT attached to the document
- Fallback is displayed while resources are in `pending` or `refreshing` state
- When ALL tracked resources resolve, children are attached and fallback is removed
- `onMount` and `createEffect` inside Suspense run AFTER resources resolve
- Both fallback and children branches exist in memory simultaneously
- Nested Suspense boundaries resolve independently
- Available since SolidJS 1.0

---

## SuspenseList

```typescript
import { SuspenseList } from "solid-js";

interface SuspenseListProps {
  children: JSX.Element;
  revealOrder: "forwards" | "backwards" | "together";
  tail?: "collapsed" | "hidden";
}

function SuspenseList(props: SuspenseListProps): JSX.Element;
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `children` | `JSX.Element` | YES | Multiple `<Suspense>` boundaries to coordinate |
| `revealOrder` | `"forwards" \| "backwards" \| "together"` | YES | Order in which children are revealed |
| `tail` | `"collapsed" \| "hidden"` | NO | Controls fallback display for unrevealed items |

### revealOrder Values

| Value | Behavior |
|-------|----------|
| `"forwards"` | Reveals Suspense children in order, top to bottom |
| `"backwards"` | Reveals Suspense children in reverse order |
| `"together"` | Waits for ALL Suspense children to resolve, then reveals all at once |

### tail Values

| Value | Behavior |
|-------|----------|
| `"collapsed"` | Shows only the next fallback in the reveal sequence |
| `"hidden"` | Hides all fallbacks for unrevealed items |

---

## catchError

```typescript
import { catchError } from "solid-js";

function catchError<T>(
  tryFn: () => T,
  onError: (err: any) => void
): T;
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `tryFn` | `() => T` | Function containing reactive computations to monitor |
| `onError` | `(err: any) => void` | Error handler called when an error occurs in `tryFn` scope |

### Behavior

- Catches errors in reactive computations created within `tryFn`
- Does NOT render fallback UI -- use for programmatic error handling
- The `onError` callback receives the error object
- Errors in `onError` itself are NOT caught -- they propagate normally
- Available since SolidJS 1.0

---

## createResource (Error-Related Properties)

```typescript
import { createResource } from "solid-js";

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
```

### Error-Related Members

| Member | Type | Description |
|--------|------|-------------|
| `resource.error` | `any` | Error object when resource is in `errored` state; `undefined` otherwise |
| `resource.state` | `string` | Current state; check for `"errored"` to detect failures |
| `resource.loading` | `boolean` | `true` during `pending` and `refreshing` states |
| `resource.latest` | `T \| undefined` | Most recent successful value; preserved during `refreshing` and `errored` states |
| `refetch()` | `() => Promise<T>` | Re-triggers the fetcher; use after `reset()` for error recovery |
| `mutate()` | `(value) => value` | Optimistically update value without re-fetching |
