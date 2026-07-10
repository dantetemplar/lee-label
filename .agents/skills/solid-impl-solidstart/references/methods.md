# API Signatures Reference (SolidStart 1.x)

## query

Wraps an async fetcher with caching, deduplication, and revalidation support.

```typescript
import { query } from "@solidjs/router";

function query<T extends (...args: any) => any>(
  fn: T,
  name: string
): CachedFunction<T>;
```

**Return type properties:**
- `getUser.key` -- base cache key (`"user"`)
- `getUser.keyFor(...args)` -- argument-specific cache key (`"user[\"abc\"]"`)

**Cache behavior:**
- Deduplicates within 5-second preload window
- Reuses while components actively consume via `createAsync`
- Preserved on back/forward navigation (up to 5 minutes)
- Deduplicated within a single SSR request
- Arguments serialized with `JSON.stringify` (sorted keys)

---

## createAsync

Reactive async primitive that integrates with Suspense and ErrorBoundary.

```typescript
import { createAsync } from "@solidjs/router";

function createAsync<T>(
  fn: (prev: T | undefined) => Promise<T>,
  options?: {
    name?: string;
    initialValue?: T;
    deferStream?: boolean;
  }
): AccessorWithLatest<T | undefined>;
```

**Key behaviors:**
- Returns `undefined` until Promise resolves (unless `initialValue` provided)
- Automatically re-runs when reactive dependencies change
- Integrates with `<Suspense>` for loading states
- Integrates with `<ErrorBoundary>` for error handling
- `deferStream: true` delays streaming SSR until fetcher completes

---

## createAsyncStore

Like `createAsync` but uses store reconciliation for fine-grained updates.

```typescript
import { createAsyncStore } from "@solidjs/router";

function createAsyncStore<T>(
  fn: (prev: T | undefined) => Promise<T>,
  options?: {
    name?: string;
    initialValue?: T;
    deferStream?: boolean;
    reconcile?: ReconcileOptions;
  }
): AccessorWithLatest<T | undefined>;
```

When new data arrives, intelligently merges with existing store -- updates only changed fields while preserving unchanged state.

---

## action

Wraps a mutation function with submission tracking and automatic query revalidation.

```typescript
import { action } from "@solidjs/router";

function action<T extends Array<any>, U = void>(
  fn: (...args: T) => Promise<U>,
  name?: string
): Action<T, U>;

// With options:
function action<T extends Array<any>, U = void>(
  fn: (...args: T) => Promise<U>,
  options?: {
    name?: string;
    onComplete?: (s: Submission<T, U>) => void;
  }
): Action<T, U>;
```

**Return type methods:**
- `myAction.with(...args)` -- prepend arguments before FormData in form submissions

---

## useAction

Returns a function to invoke an action programmatically (outside forms).

```typescript
import { useAction } from "@solidjs/router";

function useAction<T extends Array<any>, U>(
  action: Action<T, U>
): (...args: T) => Promise<U>;
```

---

## useSubmission

Tracks the latest submission for a given action.

```typescript
import { useSubmission } from "@solidjs/router";

function useSubmission<T extends Array<any>, U>(
  action: Action<T, U>,
  filter?: (input: T) => boolean
): Submission<T, U>;

interface Submission<T, U> {
  input: T;          // Original arguments
  result: U;         // Resolved value
  error: any;        // Error if failed
  pending: boolean;  // Currently executing
  clear: () => void; // Reset submission state
  retry: () => void; // Re-execute with same input
}
```

---

## useSubmissions

Tracks ALL active submissions for a given action (for concurrent mutations).

```typescript
import { useSubmissions } from "@solidjs/router";

function useSubmissions<T extends Array<any>, U>(
  action: Action<T, U>,
  filter?: (input: T) => boolean
): Submission<T, U>[];
```

---

## redirect

Generates a redirect response. MUST be thrown from server functions, NEVER returned.

```typescript
import { redirect } from "@solidjs/router";

function redirect(
  url: string,
  options?: {
    status?: number;        // Default: 302
    revalidate?: string | string[];  // Query keys to revalidate
    headers?: HeadersInit;
  }
): Response;
```

**CRITICAL:** ALWAYS `throw redirect(...)` -- NEVER `return redirect(...)`.

---

## json

Returns a JSON response from a server function.

```typescript
import { json } from "@solidjs/router";

function json<T>(
  data: T,
  options?: {
    status?: number;
    headers?: HeadersInit;
    revalidate?: string | string[];
  }
): Response;
```

---

## reload

Forces a page reload after an action completes.

```typescript
import { reload } from "@solidjs/router";

function reload(
  options?: {
    revalidate?: string | string[];
  }
): Response;
```

---

## revalidate

Manually triggers revalidation of cached queries.

```typescript
import { revalidate } from "@solidjs/router";

function revalidate(
  key?: string | string[],
  force?: boolean
): Promise<void>;
```

- No arguments: revalidates ALL active queries
- With key: revalidates specific query by its cache key
- `force: true`: bypasses cache and forces re-fetch

---

## renderToString

Synchronous server-side rendering. Generates complete HTML string with hydration markers.

```typescript
import { renderToString } from "solid-js/web";

function renderToString<T>(
  fn: () => T,
  options?: {
    nonce?: string;
    renderId?: string;
  }
): string;
```

---

## renderToStream

Streaming server-side rendering. Renders shell synchronously, streams async content as Suspense boundaries resolve.

```typescript
import { renderToStream } from "solid-js/web";

function renderToStream<T>(
  fn: () => T,
  options?: {
    nonce?: string;
    renderId?: string;
    onCompleteShell?: () => void;
    onCompleteAll?: () => void;
  }
): {
  pipe: (writable: { write: (v: string) => void }) => void;
  pipeTo: (writable: WritableStream) => void;
};
```

**Callbacks:**
- `onCompleteShell` -- fires when synchronous rendering completes (before first flush)
- `onCompleteAll` -- fires when ALL Suspense boundaries settle

---

## hydrate

Attaches client-side reactivity to server-rendered HTML without re-rendering the DOM.

```typescript
import { hydrate } from "solid-js/web";

function hydrate(
  fn: () => JSX.Element,
  node: MountableElement,
  options?: {
    renderId?: string;
    owner?: unknown;
  }
): () => void;  // Returns dispose function
```

---

## HydrationScript / generateHydrationScript

Bootstrap script that captures user events before Solid loads, then replays them after hydration.

```typescript
import { HydrationScript, generateHydrationScript } from "solid-js/web";

// JSX component (use in templates)
function HydrationScript(props: {
  nonce?: string;
  eventNames?: string[];  // Default: ["click", "input"]
}): JSX.Element;

// String generator (use in manual HTML construction)
function generateHydrationScript(options: {
  nonce?: string;
  eventNames?: string[];
}): string;
```

MUST be placed once in the HTML `<head>`. Captures delegated, composed, bubbling events only.

---

## isServer

Compile-time boolean constant for environment detection.

```typescript
import { isServer } from "solid-js/web";

const isServer: boolean;
// true on server, false on client
// Tree-shaken at build time -- dead code eliminated
```

---

## FileRoutes

Component that generates route definitions from the `routes/` directory.

```typescript
import { FileRoutes } from "@solidjs/start/router";

function FileRoutes(): JSX.Element;
```

ALWAYS wrap in `<Router>` with a `<Suspense>` root layout.

---

## APIEvent

Type for HTTP method handler parameters in API routes.

```typescript
import type { APIEvent } from "@solidjs/start/server";

interface APIEvent {
  request: Request;                      // Standard Web Request
  params: Record<string, string>;        // Dynamic route params
  fetch: (
    input: RequestInfo,
    init?: RequestInit
  ) => Promise<Response>;                // Internal fetch
}
```
