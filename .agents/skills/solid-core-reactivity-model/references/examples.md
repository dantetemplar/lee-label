# solid-core-reactivity-model — Examples Reference

## 1. Reactive Dependency Graph in Action

This example demonstrates how the reactive graph connects signals, memos, and effects with automatic dependency tracking.

```tsx
import { createSignal, createMemo, createEffect } from "solid-js";

function ReactiveGraphDemo() {
  // SOURCE: Two independent signals
  const [firstName, setFirstName] = createSignal("John");
  const [lastName, setLastName] = createSignal("Doe");

  // DERIVED: Memo depends on both signals
  const fullName = createMemo(() => `${firstName()} ${lastName()}`);

  // DERIVED: Memo depends on fullName memo
  const greeting = createMemo(() => `Hello, ${fullName()}!`);

  // SINK: Effect depends on greeting memo
  createEffect(() => {
    document.title = greeting();
  });

  // Dependency graph:
  // firstName ──┐
  //             ├──► fullName ──► greeting ──► document.title effect
  // lastName ───┘

  // When setFirstName("Jane") is called:
  // 1. firstName signal updates
  // 2. fullName memo recalculates (because firstName is a dependency)
  // 3. greeting memo recalculates (because fullName is a dependency)
  // 4. document.title effect re-runs (because greeting is a dependency)
  // lastName, and anything depending ONLY on lastName, does NOT re-execute

  return (
    <div>
      <p>{greeting()}</p>
      <button onClick={() => setFirstName("Jane")}>Change First Name</button>
      <button onClick={() => setLastName("Smith")}>Change Last Name</button>
    </div>
  );
}
```

---

## 2. Tracking Scope Demonstration

Shows exactly which contexts track reactive dependencies and which do not.

```tsx
import { createSignal, createEffect, createMemo, onMount, untrack } from "solid-js";

function TrackingDemo() {
  const [count, setCount] = createSignal(0);

  // NOT TRACKED: Component body runs once
  console.log("Component setup:", count()); // Logs once: "Component setup: 0"

  // TRACKED: createEffect
  createEffect(() => {
    console.log("Effect:", count()); // Re-runs on every count change
  });

  // TRACKED: createMemo
  const double = createMemo(() => count() * 2); // Recalculates on count change

  // NOT TRACKED: onMount
  onMount(() => {
    console.log("Mounted with count:", count()); // Runs once, never re-runs
  });

  // NOT TRACKED: event handler
  const handleClick = () => {
    console.log("Clicked with count:", count()); // Runs on click, not tracked
    setCount((c) => c + 1);
  };

  // NOT TRACKED: untrack
  createEffect(() => {
    const tracked = count(); // This IS tracked
    const notTracked = untrack(() => double()); // This is NOT tracked
    console.log("Tracked:", tracked, "Untracked:", notTracked);
  });

  // TRACKED: JSX expressions
  return (
    <div>
      <p>Count: {count()}</p>         {/* Tracked — updates this text node */}
      <p>Double: {double()}</p>        {/* Tracked — updates this text node */}
      <button onClick={handleClick}>Increment</button>
    </div>
  );
}
```

---

## 3. Ownership Tree and Cleanup

Demonstrates how the ownership tree manages reactive computation lifecycle.

```tsx
import {
  createSignal, createEffect, createRoot, getOwner, runWithOwner, onCleanup
} from "solid-js";

// Example 1: Component ownership (automatic)
function ParentComponent() {
  const [visible, setVisible] = createSignal(true);

  return (
    <div>
      {visible() && <ChildComponent />}
      <button onClick={() => setVisible(false)}>Remove Child</button>
    </div>
  );
}

function ChildComponent() {
  const [count, setCount] = createSignal(0);

  // This effect is OWNED by ChildComponent's scope
  createEffect(() => {
    console.log("Child effect:", count());
  });

  // This cleanup runs when ChildComponent unmounts
  onCleanup(() => {
    console.log("ChildComponent disposed — all effects cleaned up");
  });

  // When parent sets visible(false), SolidJS:
  // 1. Disposes ChildComponent's ownership scope
  // 2. Runs all onCleanup callbacks (LIFO order)
  // 3. Removes all effects owned by this scope
  // 4. Removes DOM nodes

  return <p>Count: {count()}</p>;
}

// Example 2: createRoot for standalone reactive systems
function createCounterStore() {
  let cleanup: (() => void) | undefined;

  const store = createRoot((dispose) => {
    cleanup = dispose;
    const [count, setCount] = createSignal(0);
    const [history, setHistory] = createSignal<number[]>([]);

    createEffect(() => {
      setHistory((prev) => [...prev, count()]);
    });

    return { count, setCount, history };
  });

  return { ...store, dispose: cleanup! };
}

// Usage:
const { count, setCount, history, dispose } = createCounterStore();
setCount(1);
setCount(2);
// history() === [0, 1, 2]
dispose(); // Cleans up all effects

// Example 3: runWithOwner for async boundaries
function AsyncDataProcessor() {
  const owner = getOwner();
  const [filter, setFilter] = createSignal("all");

  onMount(async () => {
    const data = await fetch("/api/items").then((r) => r.json());

    // WRONG: This effect has no owner — will leak
    // createEffect(() => {
    //   const filtered = data.filter((item) => matchesFilter(item, filter()));
    //   updateUI(filtered);
    // });

    // CORRECT: Restore owner for proper cleanup
    runWithOwner(owner!, () => {
      createEffect(() => {
        const filtered = data.filter((item: any) =>
          matchesFilter(item, filter())
        );
        updateUI(filtered);
      });
    });
  });

  return <div>...</div>;
}

function matchesFilter(item: any, filter: string): boolean {
  return filter === "all" || item.type === filter;
}

function updateUI(items: any[]): void {
  console.log("Updating UI with", items.length, "items");
}
```

---

## 4. Synchronous Execution (1.x) vs Batched (2.x)

```tsx
import { createSignal, createEffect, batch } from "solid-js";

function ExecutionModelDemo() {
  const [a, setA] = createSignal(1);
  const [b, setB] = createSignal(2);
  const [log, setLog] = createSignal<string[]>([]);

  createEffect(() => {
    setLog((prev) => [...prev, `Effect: a=${a()}, b=${b()}`]);
  });

  // --- SolidJS 1.x behavior (synchronous) ---
  // setA(10); // Effect runs immediately: a=10, b=2
  // setB(20); // Effect runs immediately: a=10, b=20
  // Result: 2 effect executions

  // --- SolidJS 1.x with explicit batch ---
  const handleBatchedUpdate = () => {
    batch(() => {
      setA(10);
      setB(20);
    });
    // Effect runs ONCE: a=10, b=20
  };

  // --- SolidJS 2.x behavior (auto-batched) ---
  // setA(10);
  // setB(20);
  // Both updates batched automatically — effect runs ONCE after microtask flush
  // Use flush() if immediate propagation is needed

  return (
    <div>
      <p>a: {a()}, b: {b()}</p>
      <button onClick={handleBatchedUpdate}>Batched Update</button>
      <ul>
        {log().map((entry) => (
          <li>{entry}</li>
        ))}
      </ul>
    </div>
  );
}
```

---

## 5. Effect Cleanup and Re-execution Pattern

```tsx
import { createSignal, createEffect, onCleanup } from "solid-js";

function WebSocketComponent() {
  const [url, setUrl] = createSignal("wss://example.com/feed");

  createEffect(() => {
    const currentUrl = url(); // Tracked dependency
    const ws = new WebSocket(currentUrl);

    ws.onmessage = (event) => {
      console.log("Message:", event.data);
    };

    ws.onopen = () => {
      console.log("Connected to", currentUrl);
    };

    // Cleanup runs BEFORE next re-execution and on disposal
    onCleanup(() => {
      console.log("Closing connection to", currentUrl);
      ws.close();
    });
  });

  // When url changes:
  // 1. onCleanup fires — closes OLD WebSocket
  // 2. Effect re-executes — opens NEW WebSocket
  // When component unmounts:
  // 1. onCleanup fires — closes current WebSocket

  return (
    <div>
      <p>Connected to: {url()}</p>
      <button onClick={() => setUrl("wss://example.com/other")}>
        Switch Feed
      </button>
    </div>
  );
}
```

---

## 6. Nested Effects and Independent Tracking

```tsx
import { createSignal, createEffect } from "solid-js";

function NestedEffectsDemo() {
  const [page, setPage] = createSignal(1);
  const [filter, setFilter] = createSignal("all");

  createEffect(() => {
    console.log("Outer: page changed to", page());

    // Inner effect tracks INDEPENDENTLY
    createEffect(() => {
      console.log("Inner: filter changed to", filter());
      // Changing filter() does NOT re-run the outer effect
      // Changing page() re-runs outer, which re-creates inner
    });
  });

  // setFilter("active") → Only inner effect runs
  // setPage(2) → Outer effect runs, inner effect is disposed and re-created

  return (
    <div>
      <p>Page: {page()}, Filter: {filter()}</p>
      <button onClick={() => setPage((p) => p + 1)}>Next Page</button>
      <button onClick={() => setFilter("active")}>Active Filter</button>
    </div>
  );
}
```

---

## 7. JSX Compilation — What Actually Happens

```tsx
import { createSignal } from "solid-js";

function CompilationDemo() {
  const [name, setName] = createSignal("World");
  const [color, setColor] = createSignal("blue");

  // This JSX:
  return (
    <div>
      <h1 style={{ color: color() }}>Hello, {name()}!</h1>
      <input
        value={name()}
        onInput={(e) => setName(e.currentTarget.value)}
      />
    </div>
  );

  // Compiles to something like (simplified):
  //
  // const div = document.createElement("div");
  // const h1 = document.createElement("h1");
  // const text = document.createTextNode("");
  // const input = document.createElement("input");
  //
  // createRenderEffect(() => h1.style.color = color());
  // createRenderEffect(() => text.data = `Hello, ${name()}!`);
  // createRenderEffect(() => input.value = name());
  //
  // input.addEventListener("input", (e) => setName(e.currentTarget.value));
  //
  // h1.appendChild(text);
  // div.appendChild(h1);
  // div.appendChild(input);
  //
  // return div;
  //
  // Key insight: Each reactive expression becomes an independent binding.
  // Changing name() updates ONLY the text node and input value.
  // Changing color() updates ONLY the h1 style.
  // No component re-render. No virtual DOM diff. Direct DOM mutations.
}
```
