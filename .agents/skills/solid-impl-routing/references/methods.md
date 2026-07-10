# solid-impl-routing — API Reference

## Router Components

### Router

```tsx
import { Router } from "@solidjs/router";

<Router
  root?: Component               // Root layout component wrapping all routes
  base?: string                  // Base path prefix for all routes
  explicitLinks?: boolean        // Require rel="external" for external links
  preload?: boolean              // Enable route preloading on hover (default: true)
  singleFlight?: boolean         // Cancel previous navigation on new navigate
>
  {/* Route children or RouteDefinition[] */}
</Router>
```

### HashRouter

```tsx
import { HashRouter } from "@solidjs/router";

<HashRouter
  root?: Component
  base?: string
  explicitLinks?: boolean
  preload?: boolean
>
  {/* Route children or RouteDefinition[] */}
</HashRouter>
```

Uses `/#/path` URLs. ALWAYS use when deploying to static hosting without server-side URL rewriting.

### MemoryRouter

```tsx
import { MemoryRouter } from "@solidjs/router";

<MemoryRouter
  root?: Component
  base?: string
>
  {/* Route children or RouteDefinition[] */}
</MemoryRouter>
```

In-memory navigation without browser history. ALWAYS use in unit tests.

---

## Route Components

### Route

```tsx
import { Route } from "@solidjs/router";

<Route
  path: string | string[]               // URL pattern(s) to match
  component?: Component                  // Component to render (NEVER use element=)
  preload?: RoutePreloadFunc             // Preload function for data fetching
  matchFilters?: MatchFilters            // Additional constraints on dynamic params
  children?: JSX.Element                 // Nested Route elements
/>
```

**Path patterns:**
- `/users` -- static segment
- `/users/:id` -- dynamic parameter
- `/users/:id?` -- optional parameter (appended `?`)
- `/blog/*rest` -- catch-all wildcard
- `["/login", "/register"]` -- multiple paths sharing one component

### Navigate

```tsx
import { Navigate } from "@solidjs/router";

<Navigate
  href: string          // Target path
  state?: unknown        // History state object
/>
```

Renders nothing. Immediately navigates when mounted. ALWAYS use inside `<Show>` for conditional redirects.

---

## A Component (Navigation Link)

```tsx
import { A } from "@solidjs/router";

<A
  href: string                // Target path (relative or absolute)
  noScroll?: boolean          // Disable scroll-to-top on navigation
  replace?: boolean           // Replace current history entry instead of push
  state?: unknown             // State object stored in history.state
  activeClass?: string        // CSS class applied when href matches current URL
  inactiveClass?: string      // CSS class applied when href does NOT match
  end?: boolean               // Exact match only (prevents "/" matching everything)
/>
```

**Active matching behavior:**
- Without `end`: `/users` matches `/users`, `/users/1`, `/users/1/edit`
- With `end`: `/users` matches ONLY `/users`

---

## Navigation Hooks

### useNavigate

```typescript
import { useNavigate } from "@solidjs/router";

function useNavigate(): (
  to: string | number,
  options?: Partial<NavigateOptions>
) => void;

interface NavigateOptions<S = unknown> {
  resolve: boolean;   // Resolve path relative to current route (default: true)
  replace: boolean;   // Replace history entry (default: false)
  scroll: boolean;    // Scroll to top after navigation (default: true)
  state: S;           // State stored in history.state
}
```

**Usage:**
```tsx
const navigate = useNavigate();
navigate("/dashboard");                              // Push navigation
navigate("/login", { replace: true });               // Replace (no back)
navigate(-1);                                        // Go back
navigate(1);                                         // Go forward
navigate("/checkout", { state: { from: "cart" } });  // With state
```

### useParams

```typescript
import { useParams } from "@solidjs/router";

function useParams<T extends Params>(): T;

type Params = Record<string, string>;
```

Returns a reactive proxy. NEVER destructure — access properties directly.

```tsx
const params = useParams<{ id: string }>();
// params.id is reactive
```

### useSearchParams

```typescript
import { useSearchParams } from "@solidjs/router";

function useSearchParams<T extends Params>(): [
  T,
  (params: Partial<T>, options?: { replace?: boolean; scroll?: boolean }) => void
];
```

**Usage:**
```tsx
const [search, setSearch] = useSearchParams<{ page: string; sort: string }>();
search.page;                              // Read query param
setSearch({ page: "2" });                 // Merge — other params preserved
setSearch({ sort: undefined });           // Remove a param
setSearch({ page: "1" }, { replace: true }); // Replace history entry
```

### useLocation

```typescript
import { useLocation } from "@solidjs/router";

function useLocation<S = unknown>(): Location<S>;

interface Location<S = unknown> {
  pathname: string;     // e.g., "/users/123"
  search: string;       // e.g., "?page=1&sort=name"
  hash: string;         // e.g., "#section"
  state: S | null;      // History state
  key: string;          // Unique key for this history entry
  query: Params;        // Parsed search params as object
}
```

### useMatch

```typescript
import { useMatch } from "@solidjs/router";

function useMatch<S extends string>(
  path: () => S,
  matchFilters?: MatchFilters
): Accessor<PathMatch | undefined>;

interface PathMatch {
  path: string;
  params: Params;
}
```

**Usage:**
```tsx
const match = useMatch(() => "/users/:id");
// match() returns { path, params } if matched, undefined otherwise
```

### useIsRouting

```typescript
import { useIsRouting } from "@solidjs/router";

function useIsRouting(): Accessor<boolean>;
```

Returns `true` during async navigation transitions (e.g., while preload functions run).

### useBeforeLeave

```typescript
import { useBeforeLeave } from "@solidjs/router";

function useBeforeLeave(
  listener: (e: BeforeLeaveEventArgs) => void
): void;

interface BeforeLeaveEventArgs {
  from: Location;
  to: string | number;
  options?: Partial<NavigateOptions>;
  defaultPrevented: boolean;
  preventDefault: () => void;
  retry: (force?: boolean) => void;
}
```

**Usage:**
```tsx
useBeforeLeave((e) => {
  if (hasUnsavedChanges() && !e.defaultPrevented) {
    e.preventDefault();
    if (confirm("Leave without saving?")) {
      e.retry(true);
    }
  }
});
```

### useCurrentMatches

```typescript
import { useCurrentMatches } from "@solidjs/router";

function useCurrentMatches(): Accessor<RouteMatch[]>;
```

Returns all matched route segments for the current URL. Useful for breadcrumbs.

### usePreloadRoute

```typescript
import { usePreloadRoute } from "@solidjs/router";

function usePreloadRoute(): (href: string, preloadData?: boolean) => void;
```

**Usage:**
```tsx
const preload = usePreloadRoute();
<div onMouseEnter={() => preload("/dashboard")}>Dashboard</div>
```

---

## Route Configuration Types

### RouteDefinition

```typescript
import type { RouteDefinition } from "@solidjs/router";

interface RouteDefinition {
  path: string | string[];
  component?: Component;
  preload?: RoutePreloadFunc;
  matchFilters?: MatchFilters;
  children?: RouteDefinition | RouteDefinition[];
  info?: Record<string, unknown>;
}
```

### RoutePreloadFunc

```typescript
type RoutePreloadFunc<T = unknown> = (args: RoutePreloadFuncArgs) => T;

interface RoutePreloadFuncArgs {
  params: Params;
  location: Location;
  intent: "initial" | "native" | "navigate" | "preload";
}
```

**Intent values:**
- `"initial"` -- First page load
- `"native"` -- Browser back/forward
- `"navigate"` -- Programmatic navigation via `useNavigate()` or `<A>`
- `"preload"` -- Hover-triggered preload (return value ignored)

### MatchFilters

```typescript
type MatchFilters = Record<string, RegExp | ((value: string) => boolean)>;
```

### RouteSectionProps

```typescript
import type { RouteSectionProps } from "@solidjs/router";

interface RouteSectionProps<T = unknown> {
  params: Params;
  location: Location;
  data: T;
  children?: JSX.Element;
}
```

ALWAYS use `RouteSectionProps` for layout components that render nested routes via `props.children`.

---

## Lazy Loading

```typescript
import { lazy } from "solid-js";

function lazy<T extends Component>(
  fn: () => Promise<{ default: T }>
): T & { preload: () => Promise<{ default: T }> };
```

ALWAYS use `lazy()` from `solid-js`, NOT from `@solidjs/router`. The import is `solid-js`, not the router package.
