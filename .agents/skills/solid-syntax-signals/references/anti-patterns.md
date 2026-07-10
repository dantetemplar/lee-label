# React Anti-Patterns That Break SolidJS Reactivity

Every pattern below is a React mental model that Claude commonly generates when writing SolidJS code. Each entry shows the WRONG React-inspired code and the CORRECT SolidJS equivalent.

---

## AP-01: Destructuring Props

**React pattern:** Destructure props in the function signature.
**Why it breaks SolidJS:** Destructuring reads property values ONCE at call time. The reactive proxy is bypassed, and changes to the parent's props NEVER propagate to the child.

```typescript
// WRONG -- Destructuring kills reactive tracking
function Greeting({ name, age }: { name: string; age: number }) {
  return <h1>Hello {name}, age {age}</h1>; // NEVER updates
}

// CORRECT -- Access props object directly
function Greeting(props: { name: string; age: number }) {
  return <h1>Hello {props.name}, age {props.age}</h1>; // Updates reactively
}

// CORRECT -- Use splitProps for selective destructuring
import { splitProps } from "solid-js";
function Greeting(props: { name: string; age: number; class?: string }) {
  const [local, others] = splitProps(props, ["name", "age"]);
  return <h1 {...others}>Hello {local.name}, age {local.age}</h1>;
}
```

---

## AP-02: Forgetting Signal Getter Parentheses

**React pattern:** `useState` returns a value, accessed without calling.
**Why it breaks SolidJS:** Without `()`, you pass the getter function itself to JSX, not the value. The expression evaluates to a function reference, which renders as empty or `[Function]`.

```typescript
// WRONG -- Missing parentheses: passes function, not value
const [count, setCount] = createSignal(0);
return <div>{count}</div>; // Renders nothing or [Function]

// CORRECT -- Call the getter
return <div>{count()}</div>; // Renders "0" and updates reactively
```

---

## AP-03: Dependency Arrays in Effects

**React pattern:** `useEffect(() => {}, [dep1, dep2])` with manual dependency list.
**Why it breaks SolidJS:** `createEffect` does NOT accept a dependency array. SolidJS tracks dependencies automatically by detecting which signals are read during execution.

```typescript
// WRONG -- Dependency array does nothing (second arg is initial prev value)
createEffect(() => {
  console.log(count());
}, [count]); // [count] becomes the "previous value" parameter, not deps!

// CORRECT -- No dependency array needed
createEffect(() => {
  console.log(count()); // Auto-tracked
});

// If you need explicit deps, use on()
createEffect(on(count, (value) => {
  console.log(value);
}));
```

---

## AP-04: Returning Cleanup from Effects

**React pattern:** `useEffect(() => { return () => cleanup(); })`.
**Why it breaks SolidJS:** SolidJS effects ignore return values for cleanup. The cleanup function is never called. Resources leak.

```typescript
// WRONG -- Return value is ignored, cleanup never runs
createEffect(() => {
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer); // NEVER CALLED
});

// CORRECT -- Use onCleanup as a separate call
createEffect(() => {
  const timer = setInterval(tick, 1000);
  onCleanup(() => clearInterval(timer)); // Called on re-run or disposal
});
```

---

## AP-05: useEffect with Empty Deps for Mount

**React pattern:** `useEffect(() => { /* mount */ }, [])`.
**Why it breaks SolidJS:** There is no empty dependency array concept. Use `onMount` for one-time initialization after DOM mount.

```typescript
// WRONG -- Empty array is treated as initial prev value, not "run once"
createEffect(() => {
  initializeChart(ref);
}, []); // [] is the prev value, NOT a dep array!

// CORRECT -- Use onMount for one-time setup
onMount(() => {
  initializeChart(ref); // Runs once, DOM is available
});
```

---

## AP-06: Using Effect for Derived State

**React pattern:** `useEffect(() => { setDerived(source * 2); }, [source])`.
**Why it breaks SolidJS:** This creates an unnecessary intermediate signal and effect. It also causes an extra update cycle. Derived values should use `createMemo`.

```typescript
// WRONG -- Unnecessary effect + extra signal
const [count, setCount] = createSignal(0);
const [double, setDouble] = createSignal(0);
createEffect(() => {
  setDouble(count() * 2); // Extra update cycle
});

// CORRECT -- createMemo for derived values
const [count, setCount] = createSignal(0);
const double = createMemo(() => count() * 2); // Cached, no extra signal
```

---

## AP-07: Snapshot Signal Values in Variables

**React pattern:** In React, `count` is already a value from the last render.
**Why it breaks SolidJS:** Storing a signal's return value in a variable creates a static snapshot. The variable NEVER updates.

```typescript
// WRONG -- Snapshot at assignment time
const [count, setCount] = createSignal(0);
const currentCount = count(); // 0, forever

createEffect(() => {
  console.log(currentCount); // Always 0, no tracking
});

// CORRECT -- Call getter where the value is needed
createEffect(() => {
  console.log(count()); // Tracked, updates on change
});

// WRONG -- Snapshot in event handler closure
const value = count();
return <button onClick={() => sendValue(value)}>Send</button>; // Stale

// CORRECT -- Call getter in event handler
return <button onClick={() => sendValue(count())}>Send</button>; // Current
```

---

## AP-08: Conditional Signal Access

**React pattern:** React hooks run unconditionally; deps are in the array.
**Why it breaks SolidJS:** If a signal is only read inside a conditional branch, it is only tracked when that branch executes. When the condition is false, the dependency is lost.

```typescript
// WRONG -- count() only tracked when show() is true
createEffect(() => {
  if (show()) {
    console.log(count()); // NOT tracked when show() is false
  }
});

// CORRECT -- Read all signals first, branch after
createEffect(() => {
  const isVisible = show();
  const currentCount = count(); // ALWAYS tracked
  if (isVisible) {
    console.log(currentCount);
  }
});
```

---

## AP-09: Early Return Before Signal Access

**React pattern:** Early return is fine in React since deps are in the array.
**Why it breaks SolidJS:** Signals read AFTER an early return are never reached and never tracked. When those signals change, the effect does not re-run.

```typescript
// WRONG -- name() is never tracked when loading() is true
createEffect(() => {
  if (loading()) return;
  console.log(name()); // Unreachable when loading, loses tracking
});

// CORRECT -- Access all signals unconditionally
createEffect(() => {
  const isLoading = loading();
  const currentName = name(); // Always tracked
  if (isLoading) return;
  console.log(currentName);
});
```

---

## AP-10: Component Re-Render Mental Model

**React pattern:** Component function re-runs on every state change.
**Why it breaks SolidJS:** SolidJS component functions run ONCE. Code at the top level is setup code, not render code. Placing logic there expecting it to re-run causes stale behavior.

```typescript
// WRONG -- Expecting top-level code to re-run
function UserBadge(props: { userId: string }) {
  const user = fetchUserSync(props.userId); // Runs ONCE with initial userId
  return <div>{user.name}</div>; // Never updates when userId changes
}

// CORRECT -- Use reactive primitives for derived data
function UserBadge(props: { userId: string }) {
  const [user] = createResource(() => props.userId, fetchUser);
  return (
    <Suspense fallback={<span>Loading...</span>}>
      <div>{user()?.name}</div>
    </Suspense>
  );
}
```

---

## AP-11: Spreading Props Without splitProps

**React pattern:** `<Child {...props} />` is fine in React (new object each render).
**Why it breaks SolidJS:** Spreading a reactive props object can break tracking for dynamic properties. Use `splitProps` or `mergeProps` to preserve reactivity.

```typescript
// WRONG -- May lose reactivity for dynamic props
function Wrapper(props: ParentProps<{ class?: string }>) {
  return <div {...props} />; // Spread may break tracking
}

// CORRECT -- Use splitProps to separate known from rest
import { splitProps } from "solid-js";
function Wrapper(props: ParentProps<{ class?: string }>) {
  const [local, others] = splitProps(props, ["class", "children"]);
  return <div class={local.class} {...others}>{local.children}</div>;
}
```

---

## AP-12: useState Spread/Replace Pattern for Objects

**React pattern:** `setState({ ...state, key: newValue })` to update objects.
**Why it breaks SolidJS:** Signals hold single values. For objects, use `createStore` with path-based setters for fine-grained updates. Replacing the entire object triggers updates for ALL dependents, not just the changed property.

```typescript
// WRONG -- Full object replacement (signal)
const [user, setUser] = createSignal({ name: "Alice", age: 30 });
setUser({ ...user(), name: "Bob" }); // Replaces entire object

// CORRECT for simple objects -- Use createStore
import { createStore } from "solid-js/store";
const [user, setUser] = createStore({ name: "Alice", age: 30 });
setUser("name", "Bob"); // Only name subscribers update
```

---

## AP-13: useRef vs SolidJS Refs

**React pattern:** `const ref = useRef(null)` accessed via `ref.current`.
**Why it breaks SolidJS:** SolidJS uses `let ref: HTMLElement` with the `ref` JSX attribute. There is no `.current` wrapper.

```typescript
// WRONG -- React useRef pattern
const ref = useRef<HTMLDivElement>(null);
return <div ref={ref}>{ref.current?.textContent}</div>;

// CORRECT -- SolidJS ref pattern
let ref: HTMLDivElement;
onMount(() => {
  console.log(ref.textContent); // Direct access, no .current
});
return <div ref={ref}>Content</div>;
```

---

## AP-14: Async in Effects Without Cleanup

**React pattern:** Async operations in useEffect with cleanup.
**Why it breaks SolidJS:** Async functions in `createEffect` must handle cleanup via `onCleanup`, not return values. Also, `await` breaks batching.

```typescript
// WRONG -- Async without abort handling
createEffect(async () => {
  const data = await fetch(`/api/${id()}`); // No abort on re-run
  setResult(await data.json());
});

// CORRECT -- Use createResource for async data
const [result] = createResource(id, async (currentId) => {
  const res = await fetch(`/api/${currentId}`);
  return res.json();
});

// CORRECT -- If you must use effect, handle abort
createEffect(() => {
  const currentId = id();
  const controller = new AbortController();

  fetch(`/api/${currentId}`, { signal: controller.signal })
    .then((res) => res.json())
    .then(setResult)
    .catch((e) => {
      if (e.name !== "AbortError") throw e;
    });

  onCleanup(() => controller.abort());
});
```

---

## Summary: React to SolidJS Translation Table

| React Pattern | SolidJS Equivalent | Key Difference |
|--------------|-------------------|----------------|
| `useState(val)` | `createSignal(val)` | Returns getter function, not value |
| `useMemo(() => x, [deps])` | `createMemo(() => x)` | Auto-tracked, IS a reactive source |
| `useEffect(() => {}, [deps])` | `createEffect(() => {})` | No dependency array, auto-tracked |
| `useEffect(() => {}, [])` | `onMount(() => {})` | Dedicated mount hook |
| `useEffect(() => () => cleanup())` | `onCleanup(() => cleanup())` | Separate call, not return value |
| `useRef(null)` | `let ref: HTMLElement` | No `.current`, direct variable |
| `useCallback(fn, [deps])` | `const fn = () => {}` | Not needed; functions are stable |
| `React.memo(Component)` | Not needed | Components run once, no re-render |
| `useContext(Ctx)` | `useContext(Ctx)` | Similar API, but value can be reactive |
| `setState({...s, k: v})` | `setStore("k", v)` | Path-based surgical updates |
| `const {x} = props` | `props.x` | NEVER destructure props |
