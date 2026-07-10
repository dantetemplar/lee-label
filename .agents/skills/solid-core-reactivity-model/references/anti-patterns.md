# solid-core-reactivity-model — Anti-Patterns Reference

Every anti-pattern below comes from applying **React mental models** to SolidJS. These patterns silently break reactivity without compile errors or runtime exceptions — the code simply stops updating.

---

## Anti-Pattern 1: Assuming Components Re-Render

The most fundamental React contamination. In React, the component function re-runs on every state change. In SolidJS, it runs **exactly once**.

```tsx
// WRONG — React mental model: component re-renders
function Counter() {
  const [count, setCount] = createSignal(0);
  console.log("render count:", count()); // Expects to log on every change

  // Derived value computed "on render"
  const isEven = count() % 2 === 0; // Static snapshot — NEVER updates

  return (
    <div>
      <p>Count: {count()}</p>
      <p>Even: {isEven ? "Yes" : "No"}</p> {/* Always shows initial value */}
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </div>
  );
}

// CORRECT — SolidJS: component runs once, derive reactively
function Counter() {
  const [count, setCount] = createSignal(0);
  console.log("setup"); // Logs ONCE

  // Derived value computed reactively
  const isEven = createMemo(() => count() % 2 === 0); // Updates when count changes

  return (
    <div>
      <p>Count: {count()}</p>
      <p>Even: {isEven() ? "Yes" : "No"}</p> {/* Updates reactively */}
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </div>
  );
}
```

**Rule:** NEVER place logic in the component body that depends on reactive values and expects to re-execute. ALWAYS use `createMemo` for derived values and `createEffect` for side effects.

---

## Anti-Pattern 2: Virtual DOM Thinking (Diffing Assumptions)

React developers assume a diff-and-patch cycle. SolidJS has no virtual DOM — JSX compiles to direct DOM creation with reactive bindings.

```tsx
// WRONG — React mental model: entire return block re-evaluates
function UserCard(props: { user: { name: string; role: string } }) {
  // Assuming this whole block re-runs when props change:
  const style = { color: props.user.role === "admin" ? "red" : "black" };

  return (
    <div style={style}>
      <h2>{props.user.name}</h2>
      <span>{props.user.role}</span>
    </div>
  );
}
// Problem: `style` is computed ONCE. If props.user.role changes, the color stays the same.

// CORRECT — SolidJS: make style computation reactive
function UserCard(props: { user: { name: string; role: string } }) {
  return (
    <div style={{ color: props.user.role === "admin" ? "red" : "black" }}>
      <h2>{props.user.name}</h2>
      <span>{props.user.role}</span>
    </div>
  );
}
// Now the style expression is inside JSX — it becomes a reactive binding.
```

**Rule:** NEVER compute values in the component body expecting them to update. ALWAYS place reactive computations inside JSX expressions, `createMemo`, or `createEffect`.

---

## Anti-Pattern 3: Dependency Arrays

React's `useEffect` and `useMemo` require manual dependency arrays. SolidJS tracks dependencies automatically — there is no dependency array parameter.

```tsx
// WRONG — React pattern: manual dependency specification
// useEffect(() => {
//   document.title = `Count: ${count}`;
// }, [count]);

// WRONG — Attempting React-style deps in SolidJS (no such API)
createEffect(() => {
  document.title = `Count: ${count()}`;
}, [count]); // Second argument is NOT a dependency array — it's the initial value!

// CORRECT — SolidJS: automatic tracking
createEffect(() => {
  document.title = `Count: ${count()}`; // count() automatically tracked
});
```

```tsx
// WRONG — React useMemo with deps
// const expensive = useMemo(() => computeExpensive(a, b), [a, b]);

// CORRECT — SolidJS createMemo: no deps needed
const expensive = createMemo(() => computeExpensive(a(), b()));
```

**Rule:** NEVER pass dependency arrays to `createEffect` or `createMemo`. The second argument to `createEffect` is an initial value for the previous-value pattern, NOT a dependency array.

---

## Anti-Pattern 4: Destructuring Props

Destructuring props at the function parameter level reads all values once and permanently breaks reactivity.

```tsx
// WRONG — Destructuring reads values at call time
function Greeting({ name, age }: { name: string; age: number }) {
  return (
    <p>
      {name} is {age} years old
    </p>
  ); // NEVER updates
}

// WRONG — Destructuring inside the body
function Greeting(props: { name: string; age: number }) {
  const { name, age } = props; // Snapshot — breaks tracking
  return (
    <p>
      {name} is {age} years old
    </p>
  );
}

// CORRECT — Access props directly
function Greeting(props: { name: string; age: number }) {
  return (
    <p>
      {props.name} is {props.age} years old
    </p>
  ); // Tracked, updates reactively
}

// CORRECT — Use splitProps for selective extraction
import { splitProps } from "solid-js";
function Greeting(props: { name: string; age: number; class?: string }) {
  const [local, others] = splitProps(props, ["name", "age"]);
  return (
    <p {...others}>
      {local.name} is {local.age} years old
    </p>
  );
}
```

**Rule:** NEVER destructure props. ALWAYS access `props.x` directly or use `splitProps`/`mergeProps`.

---

## Anti-Pattern 5: Destructuring Store Values

Same problem as props — destructuring a store property captures a static snapshot.

```tsx
import { createStore } from "solid-js/store";

const [store, setStore] = createStore({
  user: { name: "Alice", score: 100 },
});

// WRONG — Destructuring breaks store tracking
const { name, score } = store.user; // Static values
return <p>{name}: {score}</p>; // Never updates

// WRONG — Storing store value in a variable
const userName = store.user.name; // Static snapshot
return <p>{userName}</p>; // Never updates

// CORRECT — Access store properties in JSX
return <p>{store.user.name}: {store.user.score}</p>; // Tracked per-property
```

**Rule:** NEVER destructure store values outside a tracking scope. ALWAYS access store properties directly where they are consumed.

---

## Anti-Pattern 6: Returning Cleanup Functions from Effects

React's `useEffect` returns a cleanup function. SolidJS uses `onCleanup` as a separate call.

```tsx
// WRONG — React cleanup pattern
createEffect(() => {
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer); // This return value is IGNORED
});

// CORRECT — SolidJS: explicit onCleanup
import { onCleanup } from "solid-js";
createEffect(() => {
  const timer = setInterval(tick, 1000);
  onCleanup(() => clearInterval(timer)); // Properly registered
});
```

**Rule:** NEVER return a function from `createEffect` expecting it to act as cleanup. ALWAYS use `onCleanup()`.

---

## Anti-Pattern 7: Conditional Signal Access in Effects

Signals are only tracked when their getter is actually called during the effect execution. Conditional access means the dependency is intermittent.

```tsx
// WRONG — Conditional access creates intermittent tracking
createEffect(() => {
  if (showDetails()) {
    console.log(userName()); // Only tracked when showDetails() is true
  }
  // When showDetails() is false, userName changes are MISSED
});

// CORRECT — Access all signals unconditionally
createEffect(() => {
  const details = showDetails();
  const name = userName(); // Always tracked
  if (details) {
    console.log(name);
  }
});
```

```tsx
// WRONG — Early return prevents tracking of subsequent signals
createEffect(() => {
  if (loading()) return; // When true, data() is never tracked
  processData(data());
});

// CORRECT — Read all signals before conditional logic
createEffect(() => {
  const isLoading = loading();
  const currentData = data(); // Always tracked
  if (isLoading) return;
  processData(currentData);
});
```

**Rule:** ALWAYS access all signals you depend on BEFORE any conditional logic or early returns in effects.

---

## Anti-Pattern 8: Storing Signal Results in Variables

Calling a signal getter outside a tracking scope captures a one-time snapshot.

```tsx
// WRONG — Snapshot in component body
function Display() {
  const [count, setCount] = createSignal(0);
  const value = count(); // Snapshot: 0, forever

  return <p>{value}</p>; // Always shows 0
}

// CORRECT — Call getter where the value is consumed
function Display() {
  const [count, setCount] = createSignal(0);

  return <p>{count()}</p>; // Tracked in JSX, updates reactively
}
```

```tsx
// WRONG — Snapshot in setTimeout
const current = count(); // Captured NOW
setTimeout(() => {
  console.log(current); // Stale value
}, 5000);

// CORRECT — Call getter at execution time
setTimeout(() => {
  console.log(count()); // Fresh value at time of execution
}, 5000);
```

**Rule:** NEVER store signal getter results in variables expecting them to stay current. ALWAYS call the getter at the point of consumption.

---

## Anti-Pattern 9: Spreading Props Directly

Spreading props with `{...props}` can break reactivity for dynamically added properties.

```tsx
// WRONG — Direct spread may lose reactivity
function Wrapper(props: any) {
  return <div {...props} />; // Some dynamic props may not track
}

// CORRECT — Use splitProps to separate known from rest
import { splitProps } from "solid-js";
function Wrapper(props: { class?: string; children?: any }) {
  const [local, others] = splitProps(props, ["class"]);
  return <div class={local.class} {...others} />;
}

// CORRECT — Use mergeProps for defaults
import { mergeProps } from "solid-js";
function Button(props: { variant?: string; children?: any }) {
  const merged = mergeProps({ variant: "primary" }, props);
  return <button class={merged.variant}>{merged.children}</button>;
}
```

**Rule:** ALWAYS use `splitProps` or `mergeProps` when forwarding or defaulting props. NEVER rely on raw `{...props}` spread for reactive props.

---

## Anti-Pattern 10: Using createEffect for Derived Values

In React, computing derived state often involves `useEffect` + `setState`. In SolidJS, this creates unnecessary intermediate state and effect cycles.

```tsx
// WRONG — React pattern: effect + state for derived values
const [count, setCount] = createSignal(0);
const [double, setDouble] = createSignal(0);
createEffect(() => {
  setDouble(count() * 2); // Unnecessary: extra signal + effect cycle
});

// CORRECT — Use createMemo for derived values
const [count, setCount] = createSignal(0);
const double = createMemo(() => count() * 2); // Cached, no extra state
```

**Rule:** NEVER use `createEffect` + `setSignal` to compute derived values. ALWAYS use `createMemo` — it is cached, lazy, and acts as a reactive source.

---

## Summary Table

| Anti-Pattern | React Origin | SolidJS Fix |
|-------------|-------------|-------------|
| Component re-render assumption | Component function re-runs on state change | Component runs ONCE — use `createMemo`/`createEffect` |
| Virtual DOM diffing | Assumes diff-and-patch cycle | Direct DOM bindings — place reactive reads in JSX |
| Dependency arrays | `useEffect([deps])`, `useMemo([deps])` | Automatic tracking — no deps needed |
| Destructuring props | `function Comp({ a, b })` | `function Comp(props)` + `props.a` |
| Destructuring stores | `const { x } = state` | Access `store.x` directly in tracking scope |
| Return cleanup from effect | `useEffect(() => { return cleanup })` | `onCleanup(cleanup)` as separate call |
| Conditional signal access | N/A (React re-runs entire component) | Access all signals before conditionals |
| Storing signal results | `const val = state.x` (value, not getter) | Call `signal()` at point of consumption |
| Spreading props | `{...props}` works in React | Use `splitProps`/`mergeProps` |
| Effect for derived state | `useEffect` + `setState` | `createMemo` |
