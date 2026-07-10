# Complete Import Map

## Entry Point: `solid-js`

### Reactivity Primitives

```typescript
import {
  createSignal,       // (value?, options?) => [Accessor<T>, Setter<T>]
  createEffect,       // (fn, initialValue?, options?) => void
  createMemo,         // (fn, value?, options?) => Accessor<T>
  createResource,     // (source?, fetcher, options?) => [Resource<T>, ResourceActions]
  createComputed,     // (fn, value?, options?) => void
  createRenderEffect, // (fn, value?, options?) => void
} from "solid-js";
```

### Reactive Utilities

```typescript
import {
  batch,       // (fn) => T — defer downstream computations until fn completes
  untrack,     // (fn) => T — read signals without creating dependencies
  on,          // (deps, fn, options?) => EffectFunction — explicit dependency tracking
  observable,  // (accessor) => Observable<T> — convert signal to RxJS Observable
  from,        // (producer | subscribable) => Accessor<T> — bridge external reactivity
} from "solid-js";
```

### Lifecycle

```typescript
import {
  onMount,   // (fn) => void — runs once after DOM mount, non-tracking
  onCleanup, // (fn) => void — cleanup on unmount or effect re-run
} from "solid-js";
```

### Component Utilities

```typescript
import {
  splitProps,    // (props, keys[]) => [picked, rest] — split props reactively
  mergeProps,    // (...sources) => merged — merge props with reactive defaults
  createContext, // (defaultValue?) => Context<T>
  useContext,    // (context) => T
  lazy,          // (loader) => Component — code-split dynamic import
  children,      // (fn) => ResolvedChildren — resolve and track children
  createRoot,    // (fn) => T — create independent tracking scope
  createUniqueId, // () => string — SSR-safe unique ID
  createDeferred, // (source, options?) => Accessor<T> — deferred computation
  createSelector, // (source, fn?, options?) => (key) => boolean — efficient selection
  mapArray,      // (list, mapFn, options?) => Accessor<U[]> — reactive list mapping
  indexArray,    // (list, mapFn) => Accessor<U[]> — reactive indexed mapping
} from "solid-js";
```

### Control Flow Components

```typescript
import {
  Show,          // <Show when={condition} fallback={alt}>{children}</Show>
  For,           // <For each={list}>{(item, index) => JSX}</For>
  Index,         // <Index each={list}>{(item, index) => JSX}</Index>
  Switch,        // <Switch fallback={default}><Match when={...}>...</Match></Switch>
  Match,         // Used inside <Switch>
  Suspense,      // <Suspense fallback={loading}>{children}</Suspense>
  SuspenseList,  // Coordinate multiple Suspense boundaries
  ErrorBoundary, // <ErrorBoundary fallback={errorUI}>{children}</ErrorBoundary>
  Portal,        // <Portal mount={target}>{children}</Portal>
  Dynamic,       // <Dynamic component={comp} {...props} />
} from "solid-js";
```

### Type Exports

```typescript
import type {
  Accessor,
  Setter,
  Signal,
  Resource,
  ResourceReturn,
  Component,
  ParentComponent,
  ParentProps,
  FlowComponent,
  FlowProps,
  VoidComponent,
  VoidProps,
  JSX,
  Owner,
} from "solid-js";
```

---

## Entry Point: `solid-js/store`

```typescript
import {
  createStore,   // (state) => [Store<T>, SetStoreFunction<T>]
  createMutable, // (state) => Store<T> — direct-mutation reactive proxy
  produce,       // (fn) => StoreSetter — Immer-style mutation syntax
  reconcile,     // (value, options?) => StoreSetter — diff-based updates
  unwrap,        // (store) => T — strip reactive proxy
  modifyMutable, // (mutable, modifier) => void — apply produce/reconcile to mutable
} from "solid-js/store";
```

### Store Type Exports

```typescript
import type {
  Store,
  SetStoreFunction,
  StoreNode,
  NotWrappable,
  StoreSetter,
} from "solid-js/store";
```

---

## Entry Point: `solid-js/web`

```typescript
import {
  render,                  // (fn, element) => dispose — mount app to DOM
  hydrate,                 // (fn, element, options?) => dispose — attach to server HTML
  renderToString,          // (fn, options?) => string — synchronous SSR
  renderToStream,          // (fn, options?) => { pipe, pipeTo } — streaming SSR
  isServer,                // boolean — true on server, tree-shaken at build
  HydrationScript,         // JSX component — bootstrap script for hydration
  generateHydrationScript, // (options?) => string — string version of above
  getRequestEvent,         // () => RequestEvent — access current server request
  DEV,                     // Dev mode utilities (undefined in production)
} from "solid-js/web";
```

---

## Entry Point: `@solidjs/router`

### Components

```typescript
import {
  Router,        // <Router root={Layout}>{routes}</Router>
  Route,         // <Route path="/path" component={Page} preload={fn} />
  A,             // <A href="/path" activeClass="active">Link</A>
  Navigate,      // <Navigate href="/redirect" /> — redirect component
  HashRouter,    // Hash-based routing (#/path)
  MemoryRouter,  // In-memory routing (testing)
} from "@solidjs/router";
```

### Navigation Hooks

```typescript
import {
  useNavigate,       // () => navigate(path, options?) — programmatic navigation
  useParams,         // () => Params — dynamic route parameters
  useSearchParams,   // () => [params, setParams] — URL search parameters
  useLocation,       // () => Location — pathname, search, hash, state
  useMatch,          // (path) => match | undefined — check route match
  useIsRouting,      // () => boolean — true during navigation transition
  useBeforeLeave,    // (guard) => void — navigation guard
  useCurrentMatches, // () => RouteMatch[] — all matched segments
  usePreloadRoute,   // () => preload(path) — trigger preloading
} from "@solidjs/router";
```

### Data APIs

```typescript
import {
  query,            // (fn, name) => CachedFunction — cached server data
  createAsync,      // (fn, options?) => Accessor<T> — reactive async primitive
  createAsyncStore, // (fn, options?) => Accessor<T> — async with store reconciliation
  action,           // (fn, name?) => Action — mutation wrapper
  useAction,        // (action) => fn — programmatic action invocation
  useSubmission,    // (action) => Submission — track single mutation status
  useSubmissions,   // (action) => Submission[] — track all active mutations
} from "@solidjs/router";
```

### Response Helpers

```typescript
import {
  redirect,    // (url, options?) — server redirect (THROW, not return)
  reload,      // (options?) — force page reload after action
  json,        // (data, options?) — return JSON response
  revalidate,  // (key?) — manually revalidate queries
} from "@solidjs/router";
```

### Type Exports

```typescript
import type {
  RouteDefinition,
  RouteSectionProps,
  RoutePreloadFunc,
  RoutePreloadFuncArgs,
  Params,
  NavigateOptions,
  MatchFilters,
} from "@solidjs/router";
```

---

## Entry Point: `@solidjs/start`

### Router Integration

```typescript
import { FileRoutes } from "@solidjs/start/router";
// <FileRoutes /> — generates routes from src/routes/ directory
```

### Server Utilities

```typescript
import { getServerFunctionMeta } from "@solidjs/start/server";
// Provides stable function identifiers for multi-worker environments

import type { APIEvent } from "@solidjs/start/server";
// Type for API route handlers: { request, params, fetch }
```

### Server Directives (Not Imports)

```typescript
// "use server" — marks functions as server-only RPC endpoints
// Place as first statement in function body or at file top level
const getData = async (id: string) => {
  "use server";
  return db.get(id);
};
```

---

## Import Rules

**ALWAYS** import store utilities from `solid-js/store` — NEVER from `solid-js`:
```typescript
// WRONG
import { createStore } from "solid-js";        // Does not exist here

// CORRECT
import { createStore } from "solid-js/store";  // Correct entry point
```

**ALWAYS** import rendering functions from `solid-js/web` — NEVER from `solid-js`:
```typescript
// WRONG
import { render } from "solid-js";             // Does not exist here

// CORRECT
import { render } from "solid-js/web";         // Correct entry point
```

**ALWAYS** import `FileRoutes` from `@solidjs/start/router` — NEVER from `@solidjs/router`:
```typescript
// WRONG
import { FileRoutes } from "@solidjs/router";        // Does not exist here

// CORRECT
import { FileRoutes } from "@solidjs/start/router";  // SolidStart-specific
```

**ALWAYS** use `query` instead of `cache` in router 0.15+:
```typescript
// WRONG (deprecated)
import { cache } from "@solidjs/router";

// CORRECT
import { query } from "@solidjs/router";
```
