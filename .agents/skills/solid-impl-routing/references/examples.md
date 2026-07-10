# solid-impl-routing — Code Examples

## 1. Basic Router Setup

```tsx
import { render } from "solid-js/web";
import { Router, Route, A } from "@solidjs/router";

function Home() {
  return <h1>Home</h1>;
}

function About() {
  return <h1>About</h1>;
}

function App() {
  return (
    <Router>
      <Route path="/" component={Home} />
      <Route path="/about" component={About} />
    </Router>
  );
}

render(() => <App />, document.getElementById("root")!);
```

---

## 2. Router with Root Layout and Navigation

```tsx
import { Router, Route, A } from "@solidjs/router";
import type { RouteSectionProps } from "@solidjs/router";

function RootLayout(props: RouteSectionProps) {
  return (
    <div class="app">
      <nav>
        <A href="/" end activeClass="active">Home</A>
        <A href="/products" activeClass="active">Products</A>
        <A href="/contact" activeClass="active">Contact</A>
      </nav>
      <main>{props.children}</main>
    </div>
  );
}

function App() {
  return (
    <Router root={RootLayout}>
      <Route path="/" component={Home} />
      <Route path="/products" component={Products} />
      <Route path="/contact" component={Contact} />
    </Router>
  );
}
```

---

## 3. Nested Routes with Layout

```tsx
import { Router, Route } from "@solidjs/router";
import type { RouteSectionProps } from "@solidjs/router";

function UsersLayout(props: RouteSectionProps) {
  return (
    <div>
      <h1>Users Section</h1>
      <nav>
        <A href="/users">All Users</A>
      </nav>
      {props.children}
    </div>
  );
}

function UsersList() {
  return <ul><li>User 1</li><li>User 2</li></ul>;
}

function UserDetail() {
  const params = useParams<{ id: string }>();
  return <p>Viewing user: {params.id}</p>;
}

function App() {
  return (
    <Router>
      <Route path="/users" component={UsersLayout}>
        <Route path="/" component={UsersList} />
        <Route path="/:id" component={UserDetail} />
      </Route>
    </Router>
  );
}
```

---

## 4. Programmatic Navigation

```tsx
import { useNavigate } from "@solidjs/router";
import { createSignal } from "solid-js";

function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = createSignal("");

  const handleSearch = () => {
    navigate(`/results?q=${encodeURIComponent(query())}`);
  };

  return (
    <div>
      <input
        value={query()}
        onInput={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
      />
      <button onClick={handleSearch}>Search</button>
      <button onClick={() => navigate(-1)}>Go Back</button>
    </div>
  );
}
```

---

## 5. Dynamic Parameters with useParams

```tsx
import { useParams } from "@solidjs/router";
import { createAsync, query } from "@solidjs/router";
import { Suspense, Show } from "solid-js";

const getUser = query(async (id: string) => {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error("User not found");
  return res.json() as Promise<{ name: string; email: string }>;
}, "user");

function UserProfile() {
  const params = useParams<{ id: string }>();
  const user = createAsync(() => getUser(params.id));

  return (
    <Suspense fallback={<p>Loading user...</p>}>
      <Show when={user()}>
        {(u) => (
          <div>
            <h1>{u().name}</h1>
            <p>{u().email}</p>
          </div>
        )}
      </Show>
    </Suspense>
  );
}
```

---

## 6. Search Parameters

```tsx
import { useSearchParams } from "@solidjs/router";
import { For } from "solid-js";

function ProductList() {
  const [search, setSearch] = useSearchParams<{
    page: string;
    sort: string;
    category: string;
  }>();

  const currentPage = () => Number(search.page ?? "1");

  return (
    <div>
      <div class="filters">
        <select
          value={search.sort ?? "name"}
          onChange={(e) => setSearch({ sort: e.currentTarget.value, page: "1" })}
        >
          <option value="name">Name</option>
          <option value="price">Price</option>
        </select>

        <button onClick={() => setSearch({ category: undefined })}>
          Clear Category
        </button>
      </div>

      <div class="pagination">
        <button
          disabled={currentPage() <= 1}
          onClick={() => setSearch({ page: String(currentPage() - 1) })}
        >
          Previous
        </button>
        <span>Page {currentPage()}</span>
        <button onClick={() => setSearch({ page: String(currentPage() + 1) })}>
          Next
        </button>
      </div>
    </div>
  );
}
```

---

## 7. Route Guards with useBeforeLeave

```tsx
import { useBeforeLeave } from "@solidjs/router";
import { createSignal } from "solid-js";

function DocumentEditor() {
  const [hasChanges, setHasChanges] = createSignal(false);

  useBeforeLeave((e) => {
    if (hasChanges() && !e.defaultPrevented) {
      e.preventDefault();
      if (window.confirm("You have unsaved changes. Leave anyway?")) {
        e.retry(true);
      }
    }
  });

  const save = async () => {
    await saveDocument();
    setHasChanges(false);
  };

  return (
    <div>
      <textarea onInput={() => setHasChanges(true)} />
      <button onClick={save} disabled={!hasChanges()}>Save</button>
    </div>
  );
}
```

---

## 8. Lazy Loading Route Components

```tsx
import { lazy } from "solid-js";
import { Router, Route } from "@solidjs/router";

// ALWAYS use lazy() from "solid-js", not from the router
const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Settings = lazy(() => import("./pages/Settings"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));

function App() {
  return (
    <Router>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/settings" component={Settings} />
      <Route path="/admin" component={AdminPanel} />
    </Router>
  );
}
```

---

## 9. Route Preloading with Data

```tsx
import { Router, Route, query, createAsync } from "@solidjs/router";
import type { RoutePreloadFuncArgs } from "@solidjs/router";
import { lazy, Suspense } from "solid-js";

const getProduct = query(async (id: string) => {
  const res = await fetch(`/api/products/${id}`);
  return res.json() as Promise<{ name: string; price: number }>;
}, "product");

function preloadProduct({ params }: RoutePreloadFuncArgs) {
  getProduct(params.id); // Fire-and-forget — warms the query cache
}

const ProductPage = lazy(() => import("./pages/ProductPage"));

function App() {
  return (
    <Router>
      <Route
        path="/products/:id"
        component={ProductPage}
        preload={preloadProduct}
      />
    </Router>
  );
}

// In ProductPage.tsx:
export default function ProductPage() {
  const params = useParams<{ id: string }>();
  const product = createAsync(() => getProduct(params.id));

  return (
    <Suspense fallback={<p>Loading product...</p>}>
      <h1>{product()?.name}</h1>
      <p>Price: ${product()?.price}</p>
    </Suspense>
  );
}
```

---

## 10. Hover Preloading

```tsx
import { usePreloadRoute, A } from "@solidjs/router";

function Navigation() {
  const preload = usePreloadRoute();

  return (
    <nav>
      <A
        href="/dashboard"
        onMouseEnter={() => preload("/dashboard")}
        onFocus={() => preload("/dashboard")}
      >
        Dashboard
      </A>
      <A
        href="/analytics"
        onMouseEnter={() => preload("/analytics")}
        onFocus={() => preload("/analytics")}
      >
        Analytics
      </A>
    </nav>
  );
}
```

---

## 11. Config-Based Routing

```tsx
import { Router } from "@solidjs/router";
import type { RouteDefinition } from "@solidjs/router";
import { lazy } from "solid-js";

const routes: RouteDefinition[] = [
  {
    path: "/",
    component: lazy(() => import("./pages/Home")),
  },
  {
    path: "/admin",
    component: lazy(() => import("./layouts/AdminLayout")),
    children: [
      {
        path: "/",
        component: lazy(() => import("./pages/admin/Dashboard")),
      },
      {
        path: "/users",
        component: lazy(() => import("./pages/admin/Users")),
        preload: ({ params }) => {
          getUserList(); // Warm cache
        },
      },
      {
        path: "/users/:id",
        component: lazy(() => import("./pages/admin/UserDetail")),
        matchFilters: { id: /^\d+$/ },
        preload: ({ params }) => {
          getUser(params.id);
        },
      },
    ],
  },
  {
    path: "/*404",
    component: lazy(() => import("./pages/NotFound")),
  },
];

function App() {
  return <Router>{routes}</Router>;
}
```

---

## 12. Protected Routes with Redirect

```tsx
import { Router, Route, Navigate } from "@solidjs/router";
import type { RouteSectionProps } from "@solidjs/router";
import { Show } from "solid-js";

function useAuth() {
  // Return reactive accessor for auth state
  return { isAuthenticated: () => Boolean(getAuthToken()) };
}

function ProtectedLayout(props: RouteSectionProps) {
  const auth = useAuth();

  return (
    <Show
      when={auth.isAuthenticated()}
      fallback={<Navigate href="/login" />}
    >
      {props.children}
    </Show>
  );
}

function App() {
  return (
    <Router>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={ProtectedLayout}>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/settings" component={Settings} />
      </Route>
    </Router>
  );
}
```

---

## 13. Using useLocation for Conditional Rendering

```tsx
import { useLocation } from "@solidjs/router";
import { Show } from "solid-js";

function AppShell(props: RouteSectionProps) {
  const location = useLocation();

  return (
    <div>
      <Show when={!location.pathname.startsWith("/auth")}>
        <Header />
        <Sidebar />
      </Show>
      <main>{props.children}</main>
    </div>
  );
}
```

---

## 14. Route Matching with useMatch

```tsx
import { useMatch, A } from "@solidjs/router";
import { Show } from "solid-js";

function Breadcrumbs() {
  const isUsers = useMatch(() => "/users/*");
  const isProducts = useMatch(() => "/products/*");

  return (
    <nav>
      <A href="/">Home</A>
      <Show when={isUsers()}>
        <span> / </span>
        <A href="/users">Users</A>
      </Show>
      <Show when={isProducts()}>
        <span> / </span>
        <A href="/products">Products</A>
      </Show>
    </nav>
  );
}
```

---

## 15. Multiple Paths for One Component

```tsx
<Route path={["/login", "/register", "/signup"]} component={AuthPage} />
```

The `AuthPage` component stays mounted when navigating between these paths. Use `useLocation()` inside to determine which path is active.

---

## 16. Catch-All / 404 Route

```tsx
function App() {
  return (
    <Router>
      <Route path="/" component={Home} />
      <Route path="/about" component={About} />
      <Route path="/*404" component={NotFound} />
    </Router>
  );
}

function NotFound() {
  return (
    <div>
      <h1>404 — Page Not Found</h1>
      <A href="/">Go Home</A>
    </div>
  );
}
```

ALWAYS place catch-all routes last. The `*` wildcard matches any remaining path segments.

---

## 17. HashRouter for Static Hosting

```tsx
import { HashRouter, Route } from "@solidjs/router";

function App() {
  return (
    <HashRouter>
      <Route path="/" component={Home} />
      <Route path="/about" component={About} />
    </HashRouter>
  );
}

// URLs: /#/, /#/about
```

ALWAYS use `HashRouter` when deploying to GitHub Pages, S3, or other static hosts that do not support URL rewriting.
