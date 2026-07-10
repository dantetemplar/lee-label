# solid-agents-review: Anti-Pattern Catalog

All React contamination patterns consolidated for systematic scanning. Organized by detection category with grep-friendly identifiers.

---

## Category A: React Imports

Scan for ANY of these import sources. Their presence means React code has contaminated SolidJS output.

| Pattern | Detection String | Severity |
|---------|-----------------|----------|
| React core | `from "react"` | CRITICAL |
| React DOM | `from "react-dom"` | CRITICAL |
| React Router | `from "react-router"` | CRITICAL |
| React Router DOM | `from "react-router-dom"` | CRITICAL |
| Next.js router | `from "next/router"` | CRITICAL |
| Next.js navigation | `from "next/navigation"` | CRITICAL |
| React query | `from "@tanstack/react-query"` | CRITICAL |

### Correct SolidJS import sources:

```typescript
import { ... } from "solid-js";
import { ... } from "solid-js/store";
import { ... } from "solid-js/web";
import { ... } from "@solidjs/router";
import { ... } from "@solidjs/start/router";
import { ... } from "@solidjs/start/server";
```

---

## Category B: React Hooks

Scan for these function names. NONE of them exist in SolidJS.

| React Hook | Detection String | SolidJS Replacement | Severity |
|-----------|-----------------|-------------------|----------|
| useState | `useState(` | `createSignal(` | CRITICAL |
| useEffect | `useEffect(` | `createEffect(` | CRITICAL |
| useMemo | `useMemo(` | `createMemo(` | CRITICAL |
| useCallback | `useCallback(` | Not needed -- no re-renders | CRITICAL |
| useRef | `useRef(` | `let ref!: T` | CRITICAL |
| useReducer | `useReducer(` | `createStore(` | CRITICAL |
| useContext | `import { useContext } from "react"` | `import { useContext } from "solid-js"` | CRITICAL |
| useLayoutEffect | `useLayoutEffect(` | `createRenderEffect(` | CRITICAL |
| useImperativeHandle | `useImperativeHandle(` | Not needed -- pass ref as prop | CRITICAL |
| useDeferredValue | `useDeferredValue(` | Not applicable | CRITICAL |
| useTransition | `useTransition(` | `useIsRouting()` for route transitions | CRITICAL |
| useId | `useId(` | Not applicable | CRITICAL |
| useSyncExternalStore | `useSyncExternalStore(` | `from()` utility | CRITICAL |

---

## Category C: React Component Patterns

| Pattern | Detection String | SolidJS Replacement | Severity |
|---------|-----------------|-------------------|----------|
| forwardRef | `forwardRef(` | Pass `ref` as regular prop | CRITICAL |
| React.memo | `memo(` or `React.memo(` | Not needed -- components run once | INFO |
| React.createElement | `React.createElement(` or `createElement(` | JSX compiled to DOM calls | CRITICAL |
| React.Fragment | `React.Fragment` or `<Fragment>` | `<>...</>` (works in both) | INFO |
| React.lazy | `React.lazy(` | `lazy(` from `solid-js` | WARNING |
| React.Suspense | `React.Suspense` | `Suspense` from `solid-js` | WARNING |
| React.StrictMode | `StrictMode` | Not applicable | INFO |
| React.Profiler | `Profiler` | Not applicable | INFO |

---

## Category D: Props Destructuring

These patterns break reactivity in SolidJS because they extract values once at component creation.

### D1: Function signature destructuring

```tsx
// ANTI-PATTERN -- detect curly braces in component parameter
function Component({ prop1, prop2 }: Props) { ... }
const Component = ({ prop1, prop2 }: Props) => { ... }
```

### D2: Body-level destructuring

```tsx
// ANTI-PATTERN -- detect const/let destructuring of props
const { prop1, prop2 } = props;
let { prop1 } = props;
```

### D3: Individual prop extraction

```tsx
// ANTI-PATTERN -- detect assignment from props.xxx
const name = props.name;
let value = props.value;
```

### D4: Store property destructuring

```tsx
// ANTI-PATTERN -- detect destructuring of store values
const { username } = store.users[0];
const { theme } = store.settings;
```

---

## Category E: Dependency Arrays

SolidJS tracks dependencies automatically. Any second argument that looks like a dependency array is a React contamination pattern.

### E1: createEffect with deps

```tsx
// ANTI-PATTERN
createEffect(() => { ... }, [dep1, dep2]);
// The array is treated as the initial value, NOT as dependencies
```

### E2: createMemo with deps

```tsx
// ANTI-PATTERN
createMemo(() => value, [dep1]);
// The second arg is the initial value for the memo, NOT dependencies
```

### E3: onMount with deps

```tsx
// ANTI-PATTERN
onMount(() => { ... }, []);
// onMount takes no second argument
```

---

## Category F: Cleanup Patterns

### F1: Effect return cleanup

```tsx
// ANTI-PATTERN -- React pattern
createEffect(() => {
  const subscription = subscribe();
  return () => subscription.unsubscribe();
  //     ^^^^ This return value is IGNORED
});

// CORRECT -- SolidJS pattern
createEffect(() => {
  const subscription = subscribe();
  onCleanup(() => subscription.unsubscribe());
});
```

### F2: useEffect empty deps for mount

```tsx
// ANTI-PATTERN -- React pattern
useEffect(() => {
  doSomething();
}, []);

// CORRECT -- SolidJS pattern
onMount(() => {
  doSomething();
});
```

---

## Category G: Rendering Assumptions

### G1: Re-render mental model

```tsx
// ANTI-PATTERN -- assumes component re-runs
function Component() {
  const [count, setCount] = createSignal(0);
  const doubled = count() * 2;  // Computed ONCE
  const label = `Count: ${count()}`; // Computed ONCE
  console.log("render"); // Logs ONCE
  return <div>{doubled} {label}</div>; // Never updates
}

// CORRECT -- reactive derivations
function Component() {
  const [count, setCount] = createSignal(0);
  const doubled = createMemo(() => count() * 2);
  return <div>{doubled()} Count: {count()}</div>;
}
```

### G2: Conditional rendering via early return

```tsx
// ANTI-PATTERN -- early return is permanent
function Component(props: { loading: boolean }) {
  if (props.loading) return <Spinner />;
  return <Content />;
}

// CORRECT -- reactive conditional
function Component(props: { loading: boolean }) {
  return (
    <Show when={!props.loading} fallback={<Spinner />}>
      <Content />
    </Show>
  );
}
```

### G3: List rendering via Array.map

```tsx
// ANTI-PATTERN -- re-creates ALL DOM nodes on change
<ul>
  {items().map((item) => <li key={item.id}>{item.name}</li>)}
</ul>

// CORRECT -- fine-grained per-item updates
<ul>
  <For each={items()}>
    {(item) => <li>{item.name}</li>}
  </For>
</ul>
```

---

## Category H: Store Anti-Patterns

### H1: Spread-replace state update

```tsx
// ANTI-PATTERN -- destroys fine-grained tracking
setStore({ ...store, key: newValue });
setStore({ ...store, nested: { ...store.nested, prop: value } });

// CORRECT -- path syntax
setStore("key", newValue);
setStore("nested", "prop", value);
```

### H2: Array replacement instead of mutation

```tsx
// ANTI-PATTERN -- replaces entire array
setStore("items", [...store.items, newItem]);

// CORRECT -- append via index
setStore("items", store.items.length, newItem);
// OR use produce
setStore(produce((s) => { s.items.push(newItem); }));
```

---

## Category I: Router Anti-Patterns

### I1: React Router component names

```tsx
// ANTI-PATTERN
<Link to="/path">Text</Link>
<BrowserRouter>...</BrowserRouter>
<Routes>...</Routes>

// CORRECT
<A href="/path">Text</A>
<Router>...</Router>
```

### I2: Route element prop

```tsx
// ANTI-PATTERN
<Route path="/" element={<Home />} />

// CORRECT
<Route path="/" component={Home} />
```

### I3: useRouter (Next.js)

```tsx
// ANTI-PATTERN
import { useRouter } from "next/router";
const router = useRouter();
router.push("/dashboard");

// CORRECT
import { useNavigate } from "@solidjs/router";
const navigate = useNavigate();
navigate("/dashboard");
```

### I4: getServerSideProps pattern

```tsx
// ANTI-PATTERN
export async function getServerSideProps(context) {
  return { props: { data: await fetchData() } };
}

// CORRECT
const getData = query(async () => {
  "use server";
  return fetchData();
}, "data");
```

---

## Quick Scan Checklist

For rapid contamination detection, scan the codebase for these strings:

```
useState
useEffect
useMemo
useCallback
useRef
useReducer
forwardRef
React.memo
React.createElement
from "react"
from "react-dom"
from "react-router
key={
element={<
return () =>    (inside createEffect)
, [            (second arg to createEffect/createMemo that looks like array)
```

If ANY of these are found in SolidJS code, flag for review using the corresponding CHECK codes from methods.md.
