# Working Code Examples (SolidStart 1.x)

## Example 1: File Routing Patterns

### Basic Routes

```
src/routes/
├── index.tsx           # /
├── about.tsx           # /about
├── blog.tsx            # Layout for /blog/*
├── blog/
│   ├── index.tsx       # /blog
│   ├── [slug].tsx      # /blog/:slug
│   └── [...path].tsx   # /blog/* (catch-all)
├── users/
│   ├── [id].tsx        # /users/:id
│   └── [[id]].tsx      # /users or /users/:id (optional param)
├── (marketing)/
│   ├── pricing.tsx     # /pricing (group, no URL segment)
│   └── features.tsx    # /features
└── api/
    └── users/
        └── [id].ts     # /api/users/:id (API route)
```

### Route with Layout

```tsx
// routes/blog.tsx -- layout component
import type { RouteSectionProps } from "@solidjs/router";

export default function BlogLayout(props: RouteSectionProps) {
  return (
    <div class="blog-layout">
      <aside>
        <nav>
          <A href="/blog">All Posts</A>
          <A href="/blog/recent">Recent</A>
        </nav>
      </aside>
      <main>{props.children}</main>
    </div>
  );
}
```

```tsx
// routes/blog/[slug].tsx -- child route (rendered inside layout)
import { useParams } from "@solidjs/router";
import { createAsync } from "@solidjs/router";

const getPost = query(async (slug: string) => {
  "use server";
  return db.getPost(slug);
}, "post");

export const route = {
  preload({ params }) {
    getPost(params.slug);
  },
} satisfies RouteDefinition;

export default function BlogPost() {
  const params = useParams();
  const post = createAsync(() => getPost(params.slug));

  return (
    <Suspense fallback={<p>Loading post...</p>}>
      <article>
        <h1>{post()?.title}</h1>
        <div innerHTML={post()?.html} />
      </article>
    </Suspense>
  );
}
```

### Route Groups (No URL Segment)

```tsx
// routes/(admin)/dashboard.tsx -- URL is /dashboard, NOT /admin/dashboard
export default function Dashboard() {
  return <h1>Admin Dashboard</h1>;
}
```

---

## Example 2: Data Loading Patterns

### Basic Query + createAsync

```tsx
import { query, createAsync, useParams } from "@solidjs/router";
import { Suspense, ErrorBoundary } from "solid-js";

const getUser = query(async (id: string) => {
  "use server";
  const user = await db.getUser(id);
  if (!user) throw new Error("User not found");
  return user;
}, "user");

export default function UserPage() {
  const params = useParams();
  const user = createAsync(() => getUser(params.id));

  return (
    <ErrorBoundary fallback={(err) => <p>Error: {err.message}</p>}>
      <Suspense fallback={<p>Loading user...</p>}>
        <div>
          <h1>{user()?.name}</h1>
          <p>{user()?.email}</p>
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}
```

### createAsyncStore for Lists with Fine-Grained Updates

```tsx
import { query, createAsyncStore } from "@solidjs/router";
import { For, Suspense } from "solid-js";

const getNotifications = query(async () => {
  "use server";
  return db.getNotifications();
}, "notifications");

export default function NotificationsPage() {
  const notifications = createAsyncStore(() => getNotifications());

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ul>
        <For each={notifications()}>
          {(item) => (
            <li class={item.read ? "read" : "unread"}>
              {item.message}
            </li>
          )}
        </For>
      </ul>
    </Suspense>
  );
}
```

### Route Preloading (Eliminate Data Waterfalls)

```tsx
import { query, createAsync, type RouteDefinition } from "@solidjs/router";

const getProduct = query(async (id: string) => {
  "use server";
  return db.getProduct(id);
}, "product");

const getReviews = query(async (productId: string) => {
  "use server";
  return db.getReviews(productId);
}, "reviews");

// Preload fires on hover/navigation -- warms cache
export const route = {
  preload({ params }) {
    getProduct(params.id);
    getReviews(params.id);
  },
} satisfies RouteDefinition;

export default function ProductPage() {
  const params = useParams();
  const product = createAsync(() => getProduct(params.id));
  const reviews = createAsync(() => getReviews(params.id));

  return (
    <Suspense fallback={<p>Loading product...</p>}>
      <h1>{product()?.name}</h1>
      <p>{product()?.description}</p>
      <Suspense fallback={<p>Loading reviews...</p>}>
        <For each={reviews()}>
          {(review) => <div>{review.text} — {review.rating}/5</div>}
        </For>
      </Suspense>
    </Suspense>
  );
}
```

---

## Example 3: Server Function Patterns

### Function-Level "use server"

```tsx
import { query } from "@solidjs/router";

const getUser = query(async (id: string) => {
  "use server";
  // This code runs ONLY on the server
  // Safe to access database, env vars, secrets
  const user = await db.getUser(id);
  return user;
}, "user");
```

### File-Level "use server"

```tsx
// src/lib/server/queries.ts
"use server";

// ALL exports in this file run server-only
export async function getUsers() {
  return db.getUsers();
}

export async function getUserById(id: string) {
  return db.getUser(id);
}

export async function getProducts(category?: string) {
  return category ? db.getProductsByCategory(category) : db.getAllProducts();
}
```

### Server Function with Cookie Access

```tsx
import { getCookie } from "vinxi/http";

const getCurrentUser = query(async () => {
  "use server";
  const sessionId = getCookie("session");
  if (!sessionId) throw new Error("Not authenticated");
  return db.getUserBySession(sessionId);
}, "currentUser");
```

---

## Example 4: Action and Form Patterns

### Basic Form Action

```tsx
import { action, redirect } from "@solidjs/router";

const createPost = action(async (formData: FormData) => {
  "use server";
  const title = formData.get("title") as string;
  const body = formData.get("body") as string;
  const post = await db.createPost({ title, body });
  throw redirect(`/blog/${post.slug}`);
}, "createPost");

export default function NewPostPage() {
  return (
    <form action={createPost} method="post">
      <input name="title" placeholder="Title" required />
      <textarea name="body" placeholder="Content" required />
      <button type="submit">Publish</button>
    </form>
  );
}
```

### Action with Extra Arguments (.with)

```tsx
import { action, redirect } from "@solidjs/router";

const updateTodo = action(async (todoId: string, formData: FormData) => {
  "use server";
  const title = formData.get("title") as string;
  await db.updateTodo(todoId, { title });
  throw redirect("/todos");
}, "updateTodo");

function EditTodoForm(props: { todo: { id: string; title: string } }) {
  return (
    <form action={updateTodo.with(props.todo.id)} method="post">
      <input name="title" value={props.todo.title} />
      <button type="submit">Save</button>
    </form>
  );
}
```

### Programmatic Action + Submission Tracking

```tsx
import { action, useAction, useSubmission } from "@solidjs/router";

const deleteTodo = action(async (id: string) => {
  "use server";
  await db.deleteTodo(id);
}, "deleteTodo");

function TodoItem(props: { id: string; title: string }) {
  const doDelete = useAction(deleteTodo);
  const deleting = useSubmission(deleteTodo);

  return (
    <li>
      <span>{props.title}</span>
      <button
        onClick={() => doDelete(props.id)}
        disabled={deleting.pending}
      >
        {deleting.pending ? "Deleting..." : "Delete"}
      </button>
    </li>
  );
}
```

### Action with Targeted Revalidation

```tsx
import { action, redirect, revalidate } from "@solidjs/router";

const updateProfile = action(async (formData: FormData) => {
  "use server";
  const name = formData.get("name") as string;
  const userId = formData.get("userId") as string;
  await db.updateUser(userId, { name });

  // Revalidate specific query, then redirect
  throw redirect("/profile", {
    revalidate: getUser.keyFor(userId),
  });
}, "updateProfile");
```

---

## Example 5: SSR Patterns

### Streaming SSR (Default SolidStart Mode)

```tsx
// src/entry-server.tsx (rarely needs modification)
import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
```

### Custom renderToStream Usage

```tsx
import { renderToStream } from "solid-js/web";

const stream = renderToStream(() => <App />, {
  onCompleteShell() {
    // Set status code based on rendered content
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
  },
  onCompleteAll() {
    // All Suspense boundaries resolved
    console.log("Full page rendered");
  },
});

stream.pipe(res);
```

### Client Hydration Entry

```tsx
// src/entry-client.tsx (rarely needs modification)
import { mount, StartClient } from "@solidjs/start/client";

mount(() => <StartClient />, document.getElementById("app")!);
```

### isServer for Environment-Specific Code

```tsx
import { isServer } from "solid-js/web";

function AnalyticsTracker() {
  if (!isServer) {
    // Client-only: tree-shaken from server bundle
    window.analytics?.track("page_view");
  }

  return null;
}
```

---

## Example 6: API Route Patterns

### REST API with Multiple Methods

```tsx
// routes/api/users/[id].ts
import type { APIEvent } from "@solidjs/start/server";

export async function GET({ params }: APIEvent) {
  const user = await db.getUser(params.id);
  if (!user) {
    return new Response("Not found", { status: 404 });
  }
  return user; // Auto-serialized to JSON
}

export async function PATCH({ params, request }: APIEvent) {
  const body = await request.json();
  const updated = await db.updateUser(params.id, body);
  return updated;
}

export async function DELETE({ params }: APIEvent) {
  await db.deleteUser(params.id);
  return new Response(null, { status: 204 });
}
```

### API Route with Authentication

```tsx
// routes/api/protected/data.ts
import type { APIEvent } from "@solidjs/start/server";
import { getCookie } from "vinxi/http";

export async function GET(event: APIEvent) {
  const token = getCookie("auth_token");
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await validateToken(token);
  if (!user) {
    return new Response("Forbidden", { status: 403 });
  }

  const data = await db.getProtectedData(user.id);
  return data;
}
```

### Shared Handler for Multiple Methods

```tsx
// routes/api/webhook.ts
import type { APIEvent } from "@solidjs/start/server";

async function handler(event: APIEvent) {
  const body = await event.request.json();
  await processWebhook(body);
  return { success: true };
}

export const GET = handler;
export const POST = handler;
```
