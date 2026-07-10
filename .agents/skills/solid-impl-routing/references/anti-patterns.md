# solid-impl-routing — Anti-Patterns

## AP-1: Using `<Link>` Instead of `<A>`

### WRONG (React Router Pattern)

```tsx
import { Link } from "@solidjs/router"; // ERROR: Link does not exist

<Link to="/about">About</Link>
```

### CORRECT (Solid Router)

```tsx
import { A } from "@solidjs/router";

<A href="/about">About</A>
```

**Why:** Solid Router uses `<A>` as its navigation component, not `<Link>`. The prop is `href` (like a native anchor), not `to`. Importing `Link` causes a runtime import error.

---

## AP-2: Using `element={}` Instead of `component={}`

### WRONG (React Router Pattern)

```tsx
// React Router pattern — creates component IMMEDIATELY
<Route path="/dashboard" element={<Dashboard />} />
```

### CORRECT (Solid Router)

```tsx
// Solid Router — defers creation to the router
<Route path="/dashboard" component={Dashboard} />
```

**Why:** In React, `element={<Component />}` is the standard pattern because React re-renders everything. In SolidJS, `element={<Component />}` executes the component function immediately when the Route is defined, NOT when the route matches. This means:
1. The component runs even if the route never matches
2. The component cannot receive route-specific props (params, data, children)
3. Lazy loading is bypassed entirely

ALWAYS pass the component reference, NEVER a JSX expression.

---

## AP-3: Using `useRouter()` for Navigation

### WRONG (Next.js / React Pattern)

```tsx
import { useRouter } from "next/router"; // Does not exist in SolidJS

const router = useRouter();
router.push("/dashboard");
router.replace("/login");
router.back();
```

### CORRECT (Solid Router)

```tsx
import { useNavigate } from "@solidjs/router";

const navigate = useNavigate();
navigate("/dashboard");
navigate("/login", { replace: true });
navigate(-1);
```

**Why:** Solid Router has no `useRouter` hook. Navigation is done exclusively through `useNavigate()`. The returned function accepts either a path string or a number (for history traversal).

---

## AP-4: Destructuring useParams()

### WRONG

```tsx
function UserPage() {
  const { id } = useParams(); // BREAKS reactivity
  return <h1>User {id}</h1>;  // id is frozen, never updates
}
```

### CORRECT

```tsx
function UserPage() {
  const params = useParams<{ id: string }>();
  return <h1>User {params.id}</h1>; // Reactive — updates on navigation
}
```

**Why:** `useParams()` returns a reactive proxy object. Destructuring extracts the value at call time and discards the proxy, breaking SolidJS's fine-grained reactivity. The `id` variable becomes a static string that NEVER updates when the URL changes.

---

## AP-5: Using `useLoaderData()` for Route Data

### WRONG (React Router v6 Pattern)

```tsx
// React Router pattern
export const loader = async ({ params }) => {
  return fetch(`/api/users/${params.id}`);
};

function UserPage() {
  const data = useLoaderData(); // Does not exist in Solid Router
  return <div>{data.name}</div>;
}
```

### CORRECT (Solid Router)

```tsx
import { query, createAsync } from "@solidjs/router";
import type { RoutePreloadFuncArgs } from "@solidjs/router";

const getUser = query(async (id: string) => {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}, "user");

function preloadUser({ params }: RoutePreloadFuncArgs) {
  getUser(params.id);
}

function UserPage() {
  const params = useParams<{ id: string }>();
  const user = createAsync(() => getUser(params.id));
  return <div>{user()?.name}</div>;
}

// In route definition:
<Route path="/users/:id" component={UserPage} preload={preloadUser} />
```

**Why:** Solid Router uses `query()` for cached data fetching and `createAsync()` to consume the result reactively. There is no `useLoaderData` — data flows through the reactive system, not through a loader API.

---

## AP-6: Using `loader` Prop Instead of `preload`

### WRONG (React Router Naming)

```tsx
<Route path="/users/:id" component={UserPage} loader={loadUser} />
```

### CORRECT (Solid Router)

```tsx
<Route path="/users/:id" component={UserPage} preload={preloadUser} />
```

**Why:** Solid Router calls its data prefetching function `preload`, not `loader`. The `loader` prop is silently ignored, resulting in no data prefetching.

---

## AP-7: Fetching Data in onMount/createEffect

### WRONG (React useEffect Pattern)

```tsx
import { createSignal, onMount } from "solid-js";

function UserPage() {
  const [user, setUser] = createSignal(null);
  const params = useParams();

  onMount(async () => {
    const res = await fetch(`/api/users/${params.id}`);
    setUser(await res.json());
  });

  return <div>{user()?.name}</div>;
}
```

### CORRECT (Solid Router Data Pattern)

```tsx
import { query, createAsync } from "@solidjs/router";
import { Suspense } from "solid-js";

const getUser = query(async (id: string) => {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}, "user");

function UserPage() {
  const params = useParams<{ id: string }>();
  const user = createAsync(() => getUser(params.id));

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <div>{user()?.name}</div>
    </Suspense>
  );
}
```

**Why:** Using `onMount` or `createEffect` for data fetching bypasses Solid Router's caching, deduplication, preloading, and SSR integration. The `query` + `createAsync` pattern provides:
1. Automatic caching and deduplication
2. Preloading on hover (when combined with `preload` prop)
3. SSR support with streaming
4. Automatic re-fetching when params change reactively

---

## AP-8: Using `React.lazy()` Instead of `lazy()`

### WRONG

```tsx
import React from "react";
const Dashboard = React.lazy(() => import("./Dashboard")); // React import
```

### CORRECT

```tsx
import { lazy } from "solid-js";
const Dashboard = lazy(() => import("./Dashboard"));
```

**Why:** SolidJS has its own `lazy()` function exported from `solid-js`. It integrates with Solid's `<Suspense>` boundary and the router's preloading system. React's `lazy` does not work with SolidJS.

---

## AP-9: Wrapping Navigate in useEffect

### WRONG (React Pattern)

```tsx
import { createEffect } from "solid-js";
import { useNavigate } from "@solidjs/router";

function AuthCheck() {
  const navigate = useNavigate();

  createEffect(() => {
    if (!isLoggedIn()) {
      navigate("/login"); // Effect fires on every reactive update
    }
  });

  return <div>Content</div>;
}
```

### CORRECT (Declarative Redirect)

```tsx
import { Navigate } from "@solidjs/router";
import { Show } from "solid-js";

function AuthCheck(props: RouteSectionProps) {
  return (
    <Show when={isLoggedIn()} fallback={<Navigate href="/login" />}>
      {props.children}
    </Show>
  );
}
```

**Why:** Using `createEffect` for navigation causes re-evaluation on every signal update and can trigger navigation loops. The `<Navigate>` component is declarative and only activates when rendered. Wrapping it in `<Show>` provides clean conditional redirecting.

---

## AP-10: Forgetting `end` Prop on Root Links

### WRONG

```tsx
<A href="/" activeClass="active">Home</A>
<A href="/about" activeClass="active">About</A>
```

In this setup, the Home link is ALWAYS active because `/` matches every URL.

### CORRECT

```tsx
<A href="/" activeClass="active" end>Home</A>
<A href="/about" activeClass="active">About</A>
```

**Why:** Without `end`, the `<A>` component uses prefix matching. The path `/` is a prefix of every URL (`/about`, `/users/1`, etc.), so the Home link always has the active class. ALWAYS add `end` to root-level navigation links.

---

## AP-11: Using `to` Prop Instead of `href`

### WRONG (React Router Naming)

```tsx
<A to="/about">About</A>  // "to" prop is silently ignored
```

### CORRECT

```tsx
<A href="/about">About</A>
```

**Why:** Solid Router's `<A>` component uses `href`, matching the native HTML anchor element. The `to` prop from React Router is not recognized and produces a link with no destination.

---

## Summary: React Router to Solid Router Migration Checklist

| React Router | Solid Router | Notes |
|-------------|-------------|-------|
| `<Link to="...">` | `<A href="...">` | Different component name AND prop name |
| `element={<Comp />}` | `component={Comp}` | Pass reference, not JSX |
| `useRouter()` | `useNavigate()` | No router object in Solid |
| `useLoaderData()` | `createAsync(() => query(...))` | Reactive data, not loader |
| `loader` prop | `preload` prop | Different name on Route |
| `React.lazy()` | `lazy()` from `solid-js` | Different import |
| `useNavigate()` in useEffect | `<Navigate>` in `<Show>` | Declarative redirects |
| Destructure params | Access via proxy | `params.id`, not `{ id }` |
| `<Link>` `to` prop | `<A>` `href` prop | HTML-native naming |
