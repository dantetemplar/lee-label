# Anti-Patterns (SolidStart)

## 1. Next.js getServerSideProps Pattern

```tsx
// WRONG: Next.js pattern -- does NOT exist in SolidStart
export async function getServerSideProps(context) {
  const user = await db.getUser(context.params.id);
  return { props: { user } };
}

export default function UserPage({ user }) {
  return <h1>{user.name}</h1>;
}

// CORRECT: SolidStart uses query() + createAsync()
import { query, createAsync, useParams } from "@solidjs/router";
import { Suspense } from "solid-js";

const getUser = query(async (id: string) => {
  "use server";
  return db.getUser(id);
}, "user");

export default function UserPage() {
  const params = useParams();
  const user = createAsync(() => getUser(params.id));

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <h1>{user()?.name}</h1>
    </Suspense>
  );
}
```

**WHY**: SolidStart has NO equivalent of `getServerSideProps`. Server-side data loading is done through `"use server"` functions wrapped in `query()`, consumed with `createAsync()`. This integrates with Solid's fine-grained reactivity and Suspense.

---

## 2. useEffect Data Fetching

```tsx
// WRONG: React pattern -- useEffect does not exist in SolidJS
import { useEffect, useState } from "react";

function UserPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setUser(data);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <p>Loading...</p>;
  return <h1>{user?.name}</h1>;
}

// CORRECT: SolidStart data loading
import { query, createAsync, useParams } from "@solidjs/router";
import { Suspense } from "solid-js";

const getUser = query(async (id: string) => {
  "use server";
  return db.getUser(id);
}, "user");

export default function UserPage() {
  const params = useParams();
  const user = createAsync(() => getUser(params.id));

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <h1>{user()?.name}</h1>
    </Suspense>
  );
}
```

**WHY**: SolidJS has NO `useEffect`. Data fetching is handled by `query()` + `createAsync()` which integrates with SSR, caching, and Suspense automatically. Manual fetch-in-effect bypasses all of these benefits.

---

## 3. Returning redirect Instead of Throwing

```tsx
// WRONG: Returning redirect -- does nothing
const createPost = action(async (formData: FormData) => {
  "use server";
  await db.createPost(formData);
  return redirect("/posts");  // SILENTLY IGNORED
});

// CORRECT: ALWAYS throw redirect
const createPost = action(async (formData: FormData) => {
  "use server";
  await db.createPost(formData);
  throw redirect("/posts");  // Works correctly
});
```

**WHY**: `redirect()` creates a Response object that SolidStart intercepts via exception handling. Returning it treats it as a normal return value and the redirect never executes. This is a common source of bugs where forms submit successfully but the page never navigates.

---

## 4. React Router element Prop

```tsx
// WRONG: React Router uses element={<JSX>}
<Route path="/about" element={<About />} />

// CORRECT: Solid Router uses component={Component}
<Route path="/about" component={About} />
```

**WHY**: In SolidJS, `element={<About />}` immediately executes the component function (components are just functions). The `component` prop defers creation to the router, enabling code splitting and proper lifecycle management.

---

## 5. React Router Link Component

```tsx
// WRONG: React Router <Link>
import { Link } from "react-router-dom";
<Link to="/about">About</Link>

// CORRECT: Solid Router <A>
import { A } from "@solidjs/router";
<A href="/about">About</A>
```

**WHY**: Solid Router uses `<A>` (not `<Link>`) and uses `href` (not `to`). Using `<Link>` causes a compile error. Using `to` instead of `href` silently fails.

---

## 6. useRouter / router.push (Next.js Pattern)

```tsx
// WRONG: Next.js navigation pattern
import { useRouter } from "next/router";
const router = useRouter();
router.push("/dashboard");

// CORRECT: Solid Router navigation
import { useNavigate } from "@solidjs/router";
const navigate = useNavigate();
navigate("/dashboard");
```

**WHY**: SolidJS has NO `useRouter()`. Navigation is done through `useNavigate()` from `@solidjs/router`. The hook returns a function, not an object.

---

## 7. Non-Async Server Functions

```tsx
// WRONG: "use server" requires async
const getUser = (id: string) => {
  "use server";
  return db.getUser(id);  // Runtime error: not async
};

// CORRECT: ALWAYS make server functions async
const getUser = async (id: string) => {
  "use server";
  return db.getUser(id);
};
```

**WHY**: The `"use server"` directive compiles functions into RPC calls that inherently return Promises. Non-async functions cause serialization failures at runtime.

---

## 8. Passing Non-Serializable Data Through Server Functions

```tsx
// WRONG: DOM nodes, functions, class instances are not serializable
const processElement = async (element: HTMLElement) => {
  "use server";
  // element cannot be serialized for RPC transport
};

const processCallback = async (callback: () => void) => {
  "use server";
  // functions cannot be serialized
};

// CORRECT: Pass only serializable data (strings, numbers, objects, arrays)
const processData = async (elementId: string, config: { width: number }) => {
  "use server";
  // Plain data serializes correctly via Seroval
};
```

**WHY**: Server functions are compiled into RPC calls. Arguments and return values are serialized with Seroval. Non-serializable types (DOM nodes, functions, class instances, symbols) cause runtime errors.

---

## 9. Using Deprecated 0.x APIs

```tsx
// WRONG: SolidStart 0.x APIs (deprecated)
import { createServerData$ } from "solid-start/server";
const user = createServerData$((_, { params }) => db.getUser(params.id));

import { createServerAction$ } from "solid-start/server";
const [enrolling, enroll] = createServerAction$(async (id: string) => {
  await db.enroll(id);
});

// CORRECT: SolidStart 1.0 APIs
import { query, createAsync, action } from "@solidjs/router";

const getUser = query(async (id: string) => {
  "use server";
  return db.getUser(id);
}, "user");

const user = createAsync(() => getUser(params.id));

const enroll = action(async (id: string) => {
  "use server";
  await db.enroll(id);
}, "enroll");
```

**WHY**: SolidStart 0.x used dollar-sign suffixed helpers that were completely replaced in 1.0. The old APIs are removed from the package -- importing them causes build errors.

---

## 10. Manual Fetch in Components Instead of query()

```tsx
// WRONG: Bypasses SolidStart's caching and SSR integration
import { createResource } from "solid-js";

export default function ProductPage() {
  const params = useParams();
  const [product] = createResource(
    () => params.id,
    async (id) => {
      const res = await fetch(`/api/products/${id}`);
      return res.json();
    }
  );
  return <h1>{product()?.name}</h1>;
}

// CORRECT: Use query() for caching, deduplication, and SSR
const getProduct = query(async (id: string) => {
  "use server";
  return db.getProduct(id);
}, "product");

export default function ProductPage() {
  const params = useParams();
  const product = createAsync(() => getProduct(params.id));
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <h1>{product()?.name}</h1>
    </Suspense>
  );
}
```

**WHY**: Using `createResource` with manual `fetch` bypasses query caching, deduplication, preloading, and automatic revalidation after actions. It also prevents single-flight mutations. ALWAYS use `query()` + `createAsync()` in SolidStart applications.

---

## 11. Next.js App Router Layout Pattern

```tsx
// WRONG: Next.js uses layout.tsx in folders
// app/blog/layout.tsx
export default function Layout({ children }) {
  return <div>{children}</div>;
}

// CORRECT: SolidStart uses a file matching the folder name
// routes/blog.tsx (layout for routes/blog/*)
import type { RouteSectionProps } from "@solidjs/router";

export default function BlogLayout(props: RouteSectionProps) {
  return <div>{props.children}</div>;
}
```

**WHY**: SolidStart does NOT use `layout.tsx` files. Layouts are defined by creating a file with the same name as a route folder. The layout component receives `props.children` via `RouteSectionProps`, not via destructured `{ children }`.

---

## 12. React Props Destructuring in Components

```tsx
// WRONG: Destructuring breaks reactivity
export default function UserCard({ name, email }: UserProps) {
  return <div>{name} — {email}</div>;
}

// CORRECT: Access props through the props object
export default function UserCard(props: UserProps) {
  return <div>{props.name} — {props.email}</div>;
}
```

**WHY**: SolidJS components run once (not on every render like React). Destructuring props extracts static values at component creation time, losing reactive updates. ALWAYS access props via `props.propertyName` to maintain reactivity.
