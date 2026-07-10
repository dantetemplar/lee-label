# Debugging Scenarios

## Scenario 1: Effect Not Firing

### Symptom
You create an effect that logs a signal value, but it only fires once and never again.

### Diagnosis

```typescript
// BROKEN — effect fires once, then never again
function Dashboard() {
  const [count, setCount] = createSignal(0);
  const currentCount = count(); // Snapshot taken here

  createEffect(() => {
    console.log("Count:", currentCount); // Uses snapshot, NOT the getter
  });

  return <button onClick={() => setCount((c) => c + 1)}>Increment</button>;
}
```

**Root cause**: `currentCount` captures the signal value (0) at component setup time. The effect reads a static number, not a signal getter, so it has NO reactive dependencies.

### Fix

```typescript
function Dashboard() {
  const [count, setCount] = createSignal(0);

  createEffect(() => {
    console.log("Count:", count()); // Calls getter — tracked dependency
  });

  return <button onClick={() => setCount((c) => c + 1)}>Increment</button>;
}
```

---

## Scenario 2: Store Update Not Propagating

### Symptom
You call `setStore` but the UI does not reflect the change.

### Diagnosis

```typescript
// BROKEN — destructured store value is a snapshot
function UserCard() {
  const [store, setStore] = createStore({ user: { name: "Alice", age: 30 } });
  const { name } = store.user; // Snapshot! name = "Alice" forever

  return (
    <div>
      <span>{name}</span> {/* Never updates */}
      <button onClick={() => setStore("user", "name", "Bob")}>Rename</button>
    </div>
  );
}
```

**Root cause**: Destructuring `store.user` reads the `name` property once and stores the string "Alice" in a local variable. The variable has no connection to the reactive store.

### Fix

```typescript
function UserCard() {
  const [store, setStore] = createStore({ user: { name: "Alice", age: 30 } });

  return (
    <div>
      <span>{store.user.name}</span> {/* Accessed reactively via proxy */}
      <button onClick={() => setStore("user", "name", "Bob")}>Rename</button>
    </div>
  );
}
```

---

## Scenario 3: Store Array Mutation Ignored

### Symptom
You push an item to a store array but the list component does not update.

### Diagnosis

```typescript
// BROKEN — direct array mutation bypasses reactive system
function TodoList() {
  const [store, setStore] = createStore({ items: ["Buy milk"] });

  const addItem = () => {
    store.items.push("New item"); // Direct mutation — store does not know about this
  };

  return (
    <div>
      <For each={store.items}>{(item) => <p>{item}</p>}</For>
      <button onClick={addItem}>Add</button>
    </div>
  );
}
```

**Root cause**: `store.items.push()` mutates the underlying array directly. The store proxy does not intercept array method mutations — it only tracks property reads.

### Fix (setStore path syntax)

```typescript
function TodoList() {
  const [store, setStore] = createStore({ items: ["Buy milk"] });

  const addItem = () => {
    setStore("items", store.items.length, "New item");
  };

  return (
    <div>
      <For each={store.items}>{(item) => <p>{item}</p>}</For>
      <button onClick={addItem}>Add</button>
    </div>
  );
}
```

### Fix (produce)

```typescript
import { produce } from "solid-js/store";

function TodoList() {
  const [store, setStore] = createStore({ items: ["Buy milk"] });

  const addItem = () => {
    setStore(produce((s) => {
      s.items.push("New item"); // produce intercepts mutations
    }));
  };

  return (
    <div>
      <For each={store.items}>{(item) => <p>{item}</p>}</For>
      <button onClick={addItem}>Add</button>
    </div>
  );
}
```

---

## Scenario 4: Lost Tracking from Conditional Access

### Symptom
An effect tracks a signal sometimes but not always, causing intermittent failures.

### Diagnosis

```typescript
// BROKEN — conditional access means name() is only tracked when loading() is false
createEffect(() => {
  if (loading()) {
    console.log("Still loading...");
    return; // Early return — name() never executes, never tracked
  }
  console.log("User:", name()); // Only tracked when loading is false
});
```

**Root cause**: SolidJS tracks dependencies based on which signal getters are **actually called** during execution. If `loading()` returns `true`, the `return` statement prevents `name()` from being called, so `name` is not registered as a dependency. When `name` changes while loading is true, the effect does not re-run.

### Fix

```typescript
createEffect(() => {
  const isLoading = loading(); // ALWAYS tracked
  const currentName = name();  // ALWAYS tracked
  if (isLoading) {
    console.log("Still loading...");
    return;
  }
  console.log("User:", currentName);
});
```

---

## Scenario 5: Async Tracking Loss

### Symptom
An effect fires on the initial signal value but never re-runs when the signal changes.

### Diagnosis

```typescript
// BROKEN — await breaks tracking scope
createEffect(async () => {
  const response = await fetch("/api/data"); // Tracking ends here
  const data = await response.json();
  console.log("Data for user:", userId()); // NOT tracked
  setResult(data);
});
```

**Root cause**: SolidJS tracks dependencies synchronously. When execution hits `await`, the function suspends and resumes in a new microtask. The tracking context from `createEffect` is no longer active when `userId()` is called after the `await`.

### Fix

```typescript
createEffect(() => {
  const id = userId(); // Tracked — read BEFORE any async

  // Fire-and-forget async work
  (async () => {
    const response = await fetch(`/api/data/${id}`);
    const data = await response.json();
    setResult(data);
  })();
});
```

### Alternative Fix (createResource)

```typescript
const [userId, setUserId] = createSignal(1);
const [data] = createResource(userId, async (id) => {
  const response = await fetch(`/api/data/${id}`);
  return response.json();
});
// data() auto-updates when userId changes
```

---

## Scenario 6: Stale Closure in Timeout

### Symptom
A value logged in `setTimeout` shows an old value instead of the current one.

### Diagnosis

```typescript
// BROKEN — captures signal value at click time
function AutoSave() {
  const [text, setText] = createSignal("");

  const scheduleAutoSave = () => {
    const currentText = text(); // Snapshot captured NOW
    setTimeout(() => {
      saveToDB(currentText); // Uses the old snapshot, not latest
    }, 2000);
  };

  return <input onInput={(e) => setText(e.target.value)} onBlur={scheduleAutoSave} />;
}
```

**Root cause**: `const currentText = text()` reads the signal and stores the value. When the timeout fires 2 seconds later, `currentText` still holds the value from when `scheduleAutoSave` was called.

### Fix

```typescript
function AutoSave() {
  const [text, setText] = createSignal("");

  const scheduleAutoSave = () => {
    setTimeout(() => {
      saveToDB(text()); // Call getter at execution time — gets current value
    }, 2000);
  };

  return <input onInput={(e) => setText(e.target.value)} onBlur={scheduleAutoSave} />;
}
```

---

## Scenario 7: Props Destructuring Kills Reactivity

### Symptom
A child component renders with the initial prop value but never updates when the parent changes the prop.

### Diagnosis

```typescript
// BROKEN — destructured props are static snapshots
function UserBadge({ name, role }: { name: string; role: string }) {
  return (
    <div>
      <span>{name}</span>  {/* Never updates */}
      <span>{role}</span>   {/* Never updates */}
    </div>
  );
}
```

**Root cause**: Destructuring `{ name, role }` in the function parameter reads the prop values at component creation time. Since SolidJS component functions run exactly once, these values are captured as static strings.

### Fix

```typescript
interface UserBadgeProps {
  name: string;
  role: string;
}

function UserBadge(props: UserBadgeProps) {
  return (
    <div>
      <span>{props.name}</span>  {/* Reactive — tracks name */}
      <span>{props.role}</span>   {/* Reactive — tracks role */}
    </div>
  );
}
```

### Fix with splitProps (when forwarding some props)

```typescript
import { splitProps } from "solid-js";
import type { JSX } from "solid-js";

interface UserBadgeProps extends JSX.HTMLAttributes<HTMLDivElement> {
  name: string;
  role: string;
}

function UserBadge(props: UserBadgeProps) {
  const [local, others] = splitProps(props, ["name", "role"]);
  return (
    <div {...others}>
      <span>{local.name}</span>
      <span>{local.role}</span>
    </div>
  );
}
```

---

## Scenario 8: Signal Equality Prevents Update

### Symptom
You call `setSignal` with a new object but the effect does not fire.

### Diagnosis

```typescript
// BROKEN — reference equality prevents update
const [config, setConfig] = createSignal({ theme: "dark" });

createEffect(() => {
  console.log("Config changed:", config().theme);
});

// This creates a NEW object, but if the signal was set to the same reference, no update
setConfig(config()); // Same reference — === returns true, no update
```

### Fix (new object reference)

```typescript
setConfig({ ...config(), theme: "light" }); // New reference — triggers update
```

### Fix (disable equality check)

```typescript
const [config, setConfig] = createSignal({ theme: "dark" }, { equals: false });
// Now EVERY setConfig call triggers updates, regardless of equality
```

### Fix (custom equality)

```typescript
const [config, setConfig] = createSignal({ theme: "dark" }, {
  equals: (prev, next) => prev.theme === next.theme,
});
```
