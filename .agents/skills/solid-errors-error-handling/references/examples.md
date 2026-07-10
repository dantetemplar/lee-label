# Error Handling Examples

## ErrorBoundary Patterns

### Basic ErrorBoundary with Static Fallback

```typescript
import { ErrorBoundary } from "solid-js";

function App() {
  return (
    <ErrorBoundary fallback={<p>An error occurred. Please refresh the page.</p>}>
      <MainContent />
    </ErrorBoundary>
  );
}
```

### ErrorBoundary with Error Details and Reset

```typescript
import { ErrorBoundary } from "solid-js";

function App() {
  return (
    <ErrorBoundary
      fallback={(err: Error, reset: () => void) => (
        <div class="error-container">
          <h2>Something went wrong</h2>
          <pre>{err.message}</pre>
          <button onClick={reset}>Try Again</button>
        </div>
      )}
    >
      <Dashboard />
    </ErrorBoundary>
  );
}
```

### ErrorBoundary Wrapping a Specific Section

```typescript
import { ErrorBoundary } from "solid-js";

function Page() {
  return (
    <div class="page">
      <Header />
      <ErrorBoundary
        fallback={(err, reset) => (
          <div class="widget-error">
            <p>Widget failed: {err.message}</p>
            <button onClick={reset}>Reload Widget</button>
          </div>
        )}
      >
        <UnstableWidget />
      </ErrorBoundary>
      <Footer />
    </div>
  );
}
```

If `<UnstableWidget />` throws, only that section shows the error. `<Header />` and `<Footer />` remain visible and functional.

---

## Suspense Patterns

### Basic Suspense with createResource

```typescript
import { Suspense, createResource } from "solid-js";

interface User {
  id: number;
  name: string;
  email: string;
}

async function fetchUser(id: number): Promise<User> {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error("Failed to fetch user");
  return res.json();
}

function UserProfile() {
  const [user] = createResource(() => fetchUser(1));

  return (
    <Suspense fallback={<div class="skeleton">Loading user...</div>}>
      <div class="profile">
        <h1>{user()?.name}</h1>
        <p>{user()?.email}</p>
      </div>
    </Suspense>
  );
}
```

### Nested Suspense for Independent Loading

```typescript
import { Suspense, createResource, createSignal } from "solid-js";

function Dashboard() {
  const [stats] = createResource(fetchStats);
  const [activity] = createResource(fetchActivity);
  const [notifications] = createResource(fetchNotifications);

  return (
    <div class="dashboard">
      <Suspense fallback={<StatsSkeleton />}>
        <StatsPanel data={stats()} />

        <Suspense fallback={<ActivitySkeleton />}>
          <ActivityFeed items={activity()} />
        </Suspense>

        <Suspense fallback={<NotificationsSkeleton />}>
          <NotificationList items={notifications()} />
        </Suspense>
      </Suspense>
    </div>
  );
}
```

Stats appear first. Activity and notifications load independently and appear as they resolve.

### Suspense with Reactive Source

```typescript
import { Suspense, createResource, createSignal } from "solid-js";

function UserSearch() {
  const [userId, setUserId] = createSignal<number>(1);
  const [user] = createResource(userId, async (id) => {
    const res = await fetch(`/api/users/${id}`);
    return res.json();
  });

  return (
    <div>
      <input
        type="number"
        value={userId()}
        onInput={(e) => setUserId(parseInt(e.currentTarget.value))}
      />
      <Suspense fallback={<p>Loading user...</p>}>
        <UserCard user={user()} />
      </Suspense>
    </div>
  );
}
```

Changing `userId` triggers a new fetch. Suspense shows the fallback during each fetch.

---

## Nested ErrorBoundary Patterns

### Inner Catches First, Outer Catches Fallback Errors

```typescript
import { ErrorBoundary } from "solid-js";

function App() {
  return (
    <ErrorBoundary
      fallback={(err) => (
        <div class="fatal-error">
          <h1>Fatal Error</h1>
          <p>{err.message}</p>
          <p>Please refresh the page.</p>
        </div>
      )}
    >
      <Layout>
        <ErrorBoundary
          fallback={(err, reset) => (
            <div class="section-error">
              <p>Section failed: {err.message}</p>
              <button onClick={reset}>Retry Section</button>
            </div>
          )}
        >
          <DataSection />
        </ErrorBoundary>

        <ErrorBoundary
          fallback={(err, reset) => (
            <div class="section-error">
              <p>Charts failed: {err.message}</p>
              <button onClick={reset}>Retry Charts</button>
            </div>
          )}
        >
          <ChartSection />
        </ErrorBoundary>
      </Layout>
    </ErrorBoundary>
  );
}
```

Each section has its own boundary. If a section's fallback itself throws, the outer app-level boundary catches it.

---

## Error Recovery Patterns

### Reset + Refetch for Resource Errors

```typescript
import { ErrorBoundary, Suspense, createResource } from "solid-js";

function DataPanel() {
  const [data, { refetch }] = createResource(async () => {
    const res = await fetch("/api/data");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });

  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div class="error-recovery">
          <p>Failed to load data: {err.message}</p>
          <button onClick={() => {
            reset();
            refetch();
          }}>
            Retry
          </button>
        </div>
      )}
    >
      <Suspense fallback={<p>Loading data...</p>}>
        <DataTable rows={data()} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

### Reset + State Reset for Form Errors

```typescript
import { ErrorBoundary, createSignal } from "solid-js";

function EditableForm() {
  const [formState, setFormState] = createSignal({
    name: "",
    email: "",
  });

  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div>
          <p>Form crashed: {err.message}</p>
          <button onClick={() => {
            setFormState({ name: "", email: "" });
            reset();
          }}>
            Reset Form
          </button>
        </div>
      )}
    >
      <FormFields state={formState()} onUpdate={setFormState} />
    </ErrorBoundary>
  );
}
```

### Programmatic Error Handling with catchError

```typescript
import { catchError, createEffect, createSignal } from "solid-js";

function MonitoredWidget() {
  const [errorLog, setErrorLog] = createSignal<string[]>([]);

  catchError(
    () => {
      createEffect(() => {
        const result = riskyComputation();
        updateDisplay(result);
      });
    },
    (err) => {
      setErrorLog((prev) => [...prev, `${new Date().toISOString()}: ${err.message}`]);
      reportToService(err);
    }
  );

  return (
    <div>
      <WidgetDisplay />
      <Show when={errorLog().length > 0}>
        <details>
          <summary>Error log ({errorLog().length})</summary>
          <ul>
            <For each={errorLog()}>
              {(entry) => <li>{entry}</li>}
            </For>
          </ul>
        </details>
      </Show>
    </div>
  );
}
```

---

## ErrorBoundary + Suspense Composition

### Standard Composition (ErrorBoundary Outside)

```typescript
import { ErrorBoundary, Suspense, createResource } from "solid-js";

function UserProfile() {
  const [user] = createResource(fetchCurrentUser);

  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div class="error">
          <p>Could not load profile: {err.message}</p>
          <button onClick={reset}>Retry</button>
        </div>
      )}
    >
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileCard user={user()} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

### Multiple Resources with Shared Error Boundary

```typescript
import { ErrorBoundary, Suspense, createResource } from "solid-js";

function DashboardPage() {
  const [user] = createResource(fetchUser);
  const [settings] = createResource(fetchSettings);
  const [activity, { refetch: refetchActivity }] = createResource(fetchActivity);

  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div class="page-error">
          <h2>Dashboard Error</h2>
          <p>{err.message}</p>
          <button onClick={() => { reset(); refetchActivity(); }}>
            Retry
          </button>
        </div>
      )}
    >
      <Suspense fallback={<DashboardSkeleton />}>
        <div class="dashboard-grid">
          <UserPanel user={user()} />
          <SettingsPanel settings={settings()} />
          <ActivityFeed items={activity()} />
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}
```

### Granular Boundaries per Section

```typescript
import { ErrorBoundary, Suspense, createResource } from "solid-js";

function GranularDashboard() {
  const [user] = createResource(fetchUser);
  const [posts, { refetch: refetchPosts }] = createResource(fetchPosts);
  const [analytics, { refetch: refetchAnalytics }] = createResource(fetchAnalytics);

  return (
    <div class="dashboard">
      <ErrorBoundary fallback={<p>User section error</p>}>
        <Suspense fallback={<UserSkeleton />}>
          <UserHeader user={user()} />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary
        fallback={(err, reset) => (
          <div>
            <p>Posts error: {err.message}</p>
            <button onClick={() => { reset(); refetchPosts(); }}>Retry</button>
          </div>
        )}
      >
        <Suspense fallback={<PostsSkeleton />}>
          <PostsList posts={posts()} />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary
        fallback={(err, reset) => (
          <div>
            <p>Analytics error: {err.message}</p>
            <button onClick={() => { reset(); refetchAnalytics(); }}>Retry</button>
          </div>
        )}
      >
        <Suspense fallback={<AnalyticsSkeleton />}>
          <AnalyticsPanel data={analytics()} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
```

Each section loads and fails independently. A failing analytics API does not affect the user header or posts list.

---

## Server-Side Error Handling

### SSR-Aware Error Boundary

```typescript
import { ErrorBoundary, Suspense, createResource } from "solid-js";
import { isServer } from "solid-js/web";

function SSRAwarePage() {
  const [data] = createResource(async () => {
    try {
      const res = await fetch("/api/data");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (err) {
      if (isServer) {
        console.error("[SSR] Data fetch failed:", err);
      }
      throw err;
    }
  });

  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div>
          <p>Failed to load: {err.message}</p>
          {!isServer && <button onClick={reset}>Retry</button>}
        </div>
      )}
    >
      <Suspense fallback={<p>Loading...</p>}>
        <DataView data={data()} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

The retry button only renders on the client because `reset()` is a client-side operation.
