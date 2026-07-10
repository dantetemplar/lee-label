# Anti-Patterns: Wrong Imports, Version Mismatches, Ecosystem Confusion

## 1. Wrong Import Paths

### WRONG: Importing stores from `solid-js`

```typescript
// WRONG — createStore does NOT exist in solid-js
import { createStore } from "solid-js";
// Runtime error: createStore is not exported from solid-js

// CORRECT — stores have their own entry point
import { createStore } from "solid-js/store";
```

**Applies to ALL store utilities:** `createStore`, `createMutable`, `produce`, `reconcile`, `unwrap`, `modifyMutable` — they ALL live in `solid-js/store`.

### WRONG: Importing render from `solid-js`

```typescript
// WRONG — render does NOT exist in solid-js
import { render } from "solid-js";

// CORRECT — rendering functions live in solid-js/web
import { render } from "solid-js/web";
```

**Applies to ALL rendering functions:** `render`, `hydrate`, `renderToString`, `renderToStream`, `isServer`, `HydrationScript` — they ALL live in `solid-js/web`.

### WRONG: Importing FileRoutes from `@solidjs/router`

```typescript
// WRONG — FileRoutes is SolidStart-specific, not in the router package
import { FileRoutes } from "@solidjs/router";

// CORRECT — FileRoutes comes from SolidStart's router integration
import { FileRoutes } from "@solidjs/start/router";
```

### WRONG: Importing from the old router package

```typescript
// WRONG — solid-app-router is abandoned
import { Router, Route } from "solid-app-router";

// CORRECT — use the current scoped package
import { Router, Route } from "@solidjs/router";
```

### WRONG: Importing deprecated cache function

```typescript
// WRONG — cache is deprecated in router 0.15+
import { cache } from "@solidjs/router";
const getUser = cache(async (id: string) => { /* ... */ }, "user");

// CORRECT — use query (identical API, new name)
import { query } from "@solidjs/router";
const getUser = query(async (id: string) => { /* ... */ }, "user");
```

---

## 2. Version Mismatches

### WRONG: Using SolidStart 0.x APIs in SolidStart 1.0

```typescript
// WRONG — createServerData$ was removed in SolidStart 1.0
import { createServerData$ } from "solid-start/server";
const data = createServerData$(() => fetch("/api/data").then(r => r.json()));

// CORRECT — use query + createAsync + "use server"
import { query, createAsync } from "@solidjs/router";
const getData = query(async () => {
  "use server";
  return fetch("/api/data").then((r) => r.json());
}, "data");

function MyComponent() {
  const data = createAsync(() => getData());
  return <div>{data()?.value}</div>;
}
```

```typescript
// WRONG — createServerAction$ was removed in SolidStart 1.0
import { createServerAction$ } from "solid-start/server";
const [submitting, action] = createServerAction$(async (formData: FormData) => {
  // ...
});

// CORRECT — use action from @solidjs/router
import { action } from "@solidjs/router";
const myAction = action(async (formData: FormData) => {
  "use server";
  // ...
}, "myAction");
```

### WRONG: Using `@solidjs/router` < 0.15 with SolidStart 1.0

SolidStart 1.0 requires `@solidjs/router` 0.15+. If your router version is older, `query`, `createAsync`, and `action` are NOT available.

```json
// WRONG — version too old for SolidStart 1.0
{
  "dependencies": {
    "@solidjs/router": "^0.12.0",
    "@solidjs/start": "^1.0.0"
  }
}

// CORRECT — router 0.15+ for SolidStart 1.0 compatibility
{
  "dependencies": {
    "@solidjs/router": "^0.15.0",
    "@solidjs/start": "^1.0.0"
  }
}
```

### WRONG: Using `@solidjs/router` with `solid-js` < 1.8.4

```json
// WRONG — router requires solid-js 1.8.4+
{
  "dependencies": {
    "solid-js": "^1.7.0",
    "@solidjs/router": "^0.15.0"
  }
}

// CORRECT — ensure solid-js is 1.8.4 or later
{
  "dependencies": {
    "solid-js": "^1.8.4",
    "@solidjs/router": "^0.15.0"
  }
}
```

### WRONG: Mixing SolidJS 1.x and 2.x patterns

```typescript
// WRONG in 2.x — onMount is replaced by onSettled
import { onMount } from "solid-js"; // Still exists but deprecated in 2.x

// CORRECT in 2.x
import { onSettled } from "solid-js";
onSettled(() => {
  // setup logic
  return () => { /* cleanup */ };
});
```

```typescript
// WRONG in 1.x — flush() does not exist
import { flush } from "solid-js"; // Only available in 2.x

// CORRECT in 1.x — use batch() for grouping updates
import { batch } from "solid-js";
batch(() => {
  setA(1);
  setB(2);
});
```

---

## 3. Ecosystem Confusion

### WRONG: Installing React ecosystem packages for SolidJS

```bash
# WRONG — these are React packages, NOT compatible with SolidJS
npm install react-router-dom    # Use @solidjs/router instead
npm install @tanstack/react-query  # Use query/createAsync from @solidjs/router
npm install react-hook-form     # No direct equivalent; use native form + action()
npm install styled-components   # Use solid-styled or vanilla CSS/Tailwind
npm install framer-motion       # Use solid-transition-group or Motion One
```

### WRONG: Using React Testing Library with SolidJS

```typescript
// WRONG — React testing library does not work with SolidJS
import { render } from "@testing-library/react";

// CORRECT — use Solid's testing library
import { render } from "@solidjs/testing-library";
```

### WRONG: Using React DevTools for SolidJS

React DevTools cannot inspect SolidJS components or signals. ALWAYS use `solid-devtools` instead:

```bash
npm install --save-dev solid-devtools
```

### WRONG: Using Radix UI directly (React component library)

```typescript
// WRONG — Radix UI is React-only
import * as Dialog from "@radix-ui/react-dialog";

// CORRECT — Kobalte is the SolidJS equivalent of Radix
import { Dialog } from "@kobalte/core";
```

### WRONG: Using Next.js patterns in SolidStart

```typescript
// WRONG — getServerSideProps is a Next.js concept
export async function getServerSideProps() {
  const data = await fetch("/api/data");
  return { props: { data: await data.json() } };
}

// CORRECT — SolidStart uses "use server" + query
import { query, createAsync } from "@solidjs/router";

const getData = query(async () => {
  "use server";
  return fetch("/api/data").then((r) => r.json());
}, "data");

export default function Page() {
  const data = createAsync(() => getData());
  return <div>{data()?.value}</div>;
}
```

### WRONG: Using `useRouter` (Next.js/React Router pattern)

```typescript
// WRONG — useRouter does not exist in SolidJS
import { useRouter } from "next/router";
const router = useRouter();
router.push("/dashboard");

// CORRECT — use useNavigate from @solidjs/router
import { useNavigate } from "@solidjs/router";
const navigate = useNavigate();
navigate("/dashboard");
```

---

## 4. Route Definition Confusion

### WRONG: Using `element` prop (React Router pattern)

```tsx
// WRONG — React Router uses element prop with JSX element
<Route path="/" element={<Home />} />

// CORRECT — SolidJS Router uses component prop with component reference
<Route path="/" component={Home} />
```

Using `element={<Home />}` in SolidJS creates the component immediately at route definition time instead of deferring creation to when the route matches.

### WRONG: Using `<Link>` instead of `<A>`

```tsx
// WRONG — Link is React Router's component
import { Link } from "@solidjs/router";  // Does not exist
<Link to="/about">About</Link>

// CORRECT — Solid Router uses <A> component
import { A } from "@solidjs/router";
<A href="/about">About</A>
```

### WRONG: Using loader instead of preload

```tsx
// WRONG — loader is React Router v7 pattern
const route = {
  loader: async ({ params }) => {
    return fetch(`/api/users/${params.id}`);
  },
};

// CORRECT — SolidJS uses preload
import type { RouteDefinition } from "@solidjs/router";

export const route = {
  preload({ params }: { params: { id: string } }) {
    getUser(params.id); // Fire-and-forget to warm cache
  },
} satisfies RouteDefinition;
```

---

## 5. Server Function Mistakes

### WRONG: Non-async server functions

```typescript
// WRONG — server functions MUST be async
const getData = () => {
  "use server";
  return db.getData(); // Missing async/await
};

// CORRECT — ALWAYS use async
const getData = async () => {
  "use server";
  return await db.getData();
};
```

### WRONG: Returning non-serializable values from server functions

```typescript
// WRONG — functions, symbols, and class instances are not serializable
const getData = async () => {
  "use server";
  return {
    data: "hello",
    process: () => console.log("hi"),  // Functions cannot be serialized
    created: new Date(),                // Date objects need manual handling
  };
};

// CORRECT — return only serializable data
const getData = async () => {
  "use server";
  return {
    data: "hello",
    created: new Date().toISOString(), // Serialize dates as strings
  };
};
```

### WRONG: Returning redirect instead of throwing it

```typescript
// WRONG — redirect must be thrown, not returned
const updateUser = action(async (formData: FormData) => {
  "use server";
  await db.updateUser(formData);
  return redirect("/users"); // WRONG: returns, does not throw

// CORRECT — ALWAYS throw redirect
const updateUser = action(async (formData: FormData) => {
  "use server";
  await db.updateUser(formData);
  throw redirect("/users"); // CORRECT: throw triggers server-side redirect
});
```
