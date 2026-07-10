# Error Handling Anti-Patterns

## Anti-Pattern 1: try/catch in Component Body for Rendering Errors

```typescript
// WRONG -- try/catch runs once during setup, cannot catch reactive errors
function DataView() {
  try {
    const [data] = createResource(fetchData);
    return <div>{data()?.name}</div>;
  } catch (err) {
    return <p>Error: {err.message}</p>; // NEVER reached for async/reactive errors
  }
}

// CORRECT -- use ErrorBoundary for reactive error catching
function DataView() {
  const [data] = createResource(fetchData);

  return (
    <ErrorBoundary fallback={(err) => <p>Error: {err.message}</p>}>
      <div>{data()?.name}</div>
    </ErrorBoundary>
  );
}
```

**Why**: SolidJS components execute once. The `try/catch` runs during initial setup and completes before any async operation or reactive update can throw. Errors in `createEffect`, `createMemo`, or `createResource` occur LATER, outside the `try/catch` scope.

---

## Anti-Pattern 2: Missing ErrorBoundary Around Resources

```typescript
// WRONG -- no error boundary means uncaught promise rejection crashes the app
function UserPage() {
  const [user] = createResource(async () => {
    const res = await fetch("/api/user");
    if (!res.ok) throw new Error("Fetch failed");
    return res.json();
  });

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <UserCard user={user()} />
    </Suspense>
  );
}

// CORRECT -- ErrorBoundary catches resource errors
function UserPage() {
  const [user] = createResource(async () => {
    const res = await fetch("/api/user");
    if (!res.ok) throw new Error("Fetch failed");
    return res.json();
  });

  return (
    <ErrorBoundary fallback={(err, reset) => (
      <div>
        <p>Failed: {err.message}</p>
        <button onClick={reset}>Retry</button>
      </div>
    )}>
      <Suspense fallback={<p>Loading...</p>}>
        <UserCard user={user()} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

**Why**: `<Suspense>` handles loading states but has NO mechanism for error states. When a resource rejects, the error propagates up the component tree. Without `<ErrorBoundary>`, it becomes an uncaught error.

---

## Anti-Pattern 3: ErrorBoundary Inside Suspense

```typescript
// WRONG -- ErrorBoundary inside Suspense may not display correctly
function DataView() {
  const [data] = createResource(fetchData);

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ErrorBoundary fallback={<p>Error occurred</p>}>
        <DataDisplay data={data()} />
      </ErrorBoundary>
    </Suspense>
  );
}

// CORRECT -- ErrorBoundary wraps Suspense
function DataView() {
  const [data] = createResource(fetchData);

  return (
    <ErrorBoundary fallback={<p>Error occurred</p>}>
      <Suspense fallback={<p>Loading...</p>}>
        <DataDisplay data={data()} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

**Why**: When a resource throws during the initial load, Suspense is still showing its fallback. An ErrorBoundary inside Suspense is part of the "children" branch that is not yet attached to the DOM. Placing ErrorBoundary outside ensures it can properly intercept and display the error.

---

## Anti-Pattern 4: Throwing in ErrorBoundary Fallback

```typescript
// WRONG -- error in fallback propagates to parent, potentially crashes app
<ErrorBoundary
  fallback={(err) => {
    // This might throw if err is not an Error instance
    const details = JSON.parse(err.message); // Could throw!
    return <p>{details.userMessage}</p>;
  }}
>
  <App />
</ErrorBoundary>

// CORRECT -- defensive fallback that cannot throw
<ErrorBoundary
  fallback={(err) => {
    let message = "Unknown error";
    try {
      message = err instanceof Error ? err.message : String(err);
    } catch {
      message = "An error occurred";
    }
    return <p>{message}</p>;
  }}
>
  <App />
</ErrorBoundary>
```

**Why**: Errors thrown inside a fallback function are NOT caught by the same ErrorBoundary. They propagate to the nearest PARENT boundary. If there is no parent boundary, the error is completely uncaught. ALWAYS write defensive fallback functions that cannot throw.

---

## Anti-Pattern 5: Calling reset() Without Fixing the Cause

```typescript
// WRONG -- reset without refetch just re-triggers the same error
function DataPanel() {
  const [data, { refetch }] = createResource(fetchData);

  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <button onClick={reset}>Retry</button> // Just resets, data still errored
      )}
    >
      <Suspense fallback={<p>Loading...</p>}>
        <DataDisplay data={data()} />
      </Suspense>
    </ErrorBoundary>
  );
}

// CORRECT -- reset AND refetch to actually retry the operation
function DataPanel() {
  const [data, { refetch }] = createResource(fetchData);

  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <button onClick={() => { reset(); refetch(); }}>Retry</button>
      )}
    >
      <Suspense fallback={<p>Loading...</p>}>
        <DataDisplay data={data()} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

**Why**: `reset()` clears the ErrorBoundary's error state and re-renders children. But if the error came from a resource, the resource is still in an errored state. Without `refetch()`, the component re-renders and immediately encounters the same error, creating a loop or showing nothing.

---

## Anti-Pattern 6: Using Show Instead of Suspense for Resources

```typescript
// WRONG -- Show destroys and recreates DOM, losing internal state
function DataView() {
  const [data] = createResource(fetchData);

  return (
    <Show when={!data.loading} fallback={<p>Loading...</p>}>
      <DataDisplay data={data()} />
    </Show>
  );
}

// CORRECT -- Suspense preserves DOM and state across loading cycles
function DataView() {
  const [data] = createResource(fetchData);

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <DataDisplay data={data()} />
    </Suspense>
  );
}
```

**Why**: `<Show>` destroys its children when the condition becomes falsy and recreates them when it becomes truthy again. All internal state (signals, form inputs, scroll position) is lost. `<Suspense>` creates children immediately and holds them in memory, preserving state across loading transitions.

---

## Anti-Pattern 7: Catching Event Handler Errors with ErrorBoundary

```typescript
// WRONG -- ErrorBoundary does NOT catch event handler errors
<ErrorBoundary fallback={<p>Error</p>}>
  <button onClick={() => {
    throw new Error("Click error"); // NOT caught by ErrorBoundary
  }}>
    Click Me
  </button>
</ErrorBoundary>

// CORRECT -- use try/catch in event handlers directly
<button onClick={() => {
  try {
    riskyOperation();
  } catch (err) {
    setErrorMessage(err.message);
    reportError(err);
  }
}}>
  Click Me
</button>
```

**Why**: Event handlers execute outside the reactive tracking scope. ErrorBoundary only catches errors that occur during rendering or within reactive computations (`createEffect`, `createMemo`, `createResource`). For event handler errors, use standard `try/catch`.

---

## Anti-Pattern 8: No Top-Level ErrorBoundary

```typescript
// WRONG -- no safety net for unexpected errors
import { render } from "solid-js/web";

render(() => <App />, document.getElementById("root")!);

// CORRECT -- always wrap the app root in an ErrorBoundary
import { render } from "solid-js/web";
import { ErrorBoundary } from "solid-js";

render(
  () => (
    <ErrorBoundary
      fallback={(err) => (
        <div>
          <h1>Application Error</h1>
          <p>{err.message}</p>
          <p>Please refresh the page.</p>
        </div>
      )}
    >
      <App />
    </ErrorBoundary>
  ),
  document.getElementById("root")!
);
```

**Why**: Without a top-level ErrorBoundary, any uncaught rendering error crashes the entire application with no user-facing feedback. ALWAYS provide a root-level boundary as a safety net, even when using granular boundaries for specific sections.

---

## Anti-Pattern 9: Assuming createEffect Runs During SSR

```typescript
// WRONG -- createEffect never runs during SSR
function ServerComponent() {
  createEffect(() => {
    // This code NEVER executes on the server
    logAnalytics("page-view");
  });

  return <div>Content</div>;
}

// CORRECT -- use isServer for SSR-aware logic
import { isServer } from "solid-js/web";
import { createEffect } from "solid-js";

function ServerComponent() {
  if (isServer) {
    // Server-side logic here
    logServerAnalytics("page-view");
  }

  createEffect(() => {
    // Client-only logic
    logClientAnalytics("page-view");
  });

  return <div>Content</div>;
}
```

**Why**: `createEffect` is intentionally skipped during SSR because effects are designed for side effects that interact with the DOM or browser APIs. Error handling that relies on effects to report errors will silently fail on the server.
