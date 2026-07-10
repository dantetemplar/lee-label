# Anti-Pattern Detection Rules

Detection rules for identifying React contamination in SolidJS code. Each rule includes a pattern description, regex-style detection, and severity.

## CRITICAL Severity

### AP-001: Destructuring Props

**What to look for:** Function parameters with destructured object syntax, or `const { } = props` inside component.

```
Detection patterns:
- function ComponentName({ prop1, prop2 }            -- destructured in signature
- const ComponentName = ({ prop1 })                   -- arrow function destructured
- const { prop1, prop2 } = props                      -- destructured in body
- const name = props.name  (outside JSX/effect/memo)  -- extracted to variable
```

**Regex:**
```
function\s+\w+\s*\(\s*\{[^}]+\}           # function Foo({ x, y })
const\s+\w+\s*=\s*\(\s*\{[^}]+\}          # const Foo = ({ x, y })
const\s+\{[^}]+\}\s*=\s*props              # const { x } = props
```

**Fix:** Access `props.x` directly, or use `splitProps(props, ["x"])`.

### AP-002: Destructuring Signal Value

**What to look for:** Signal getter called and stored in a `const`/`let` variable in the component body (outside JSX, effect, or memo).

```
Detection patterns:
- const value = signalName()         -- in component body, not in effect/memo/JSX
- let current = count()              -- snapshot stored in variable
```

**Regex:**
```
(?:const|let)\s+\w+\s*=\s*\w+\(\)   # const x = signal() -- needs context check
```

**Context check:** ONLY flag when the assignment is in the component body (not inside `createEffect`, `createMemo`, `createComputed`, or a JSX expression `{}`).

**Fix:** Call the getter inline where the value is needed: `{count()}` in JSX, or wrap in `createMemo(() => count())`.

### AP-003: useState Import/Usage

**What to look for:** Any import or usage of React's `useState`.

```
Detection patterns:
- import { useState } from "react"
- const [x, setX] = useState(
```

**Regex:**
```
import\s+\{[^}]*useState[^}]*\}\s+from\s+["']react["']
useState\s*\(
```

**Fix:** Replace with `import { createSignal } from "solid-js"` and `const [x, setX] = createSignal(initialValue)`. Add `()` to every getter usage.

### AP-004: useEffect Import/Usage

**What to look for:** Import or usage of `useEffect`, OR any effect with a dependency array.

```
Detection patterns:
- import { useEffect } from "react"
- useEffect(() => { ... }, [deps])
- createEffect(() => { ... }, [deps])      -- accidental dependency array
```

**Regex:**
```
import\s+\{[^}]*useEffect[^}]*\}\s+from\s+["']react["']
useEffect\s*\(
createEffect\s*\([^,]+,\s*\[            # createEffect with array as 2nd arg
```

**Fix:** Replace with `createEffect(() => { ... })`. Remove ALL dependency arrays. Use `onCleanup()` instead of return for cleanup.

### AP-006: Re-Render Assumption

**What to look for:** Derived values computed as plain expressions in the component body.

```
Detection patterns:
- const doubled = count() * 2             -- in component body (runs once)
- const fullName = first() + " " + last() -- derived, not reactive
- console.log("render")                   -- in component body (debugging)
```

**Regex:**
```
# In component function body (not inside effect/memo):
(?:const|let)\s+\w+\s*=\s*\w+\(\)\s*[\*\+\-\/]   # arithmetic on signal
(?:const|let)\s+\w+\s*=\s*`[^`]*\$\{\w+\(\)       # template literal with signal
console\.log\(                                      # logging in component body
```

**Fix:** Wrap in `createMemo(() => expr)` for cached reactivity, or use `() => expr` as a derived accessor.

### AP-018: useEffect Cleanup Return

**What to look for:** A return statement inside `createEffect` that returns a function.

```
Detection patterns:
- createEffect(() => { ... return () => cleanup; })
- createEffect(() => { ... return cleanup; })
```

**Regex:**
```
createEffect\s*\([^)]*\{[^}]*return\s+\(?[^)]*\)?\s*=>\s*   # return () => in effect
```

**Fix:** Replace `return () => cleanup()` with `onCleanup(() => cleanup())` as a separate call inside the effect.

## HIGH Severity

### AP-005: useMemo Import/Usage

**What to look for:** Import or usage of React's `useMemo` with dependency array.

```
Detection patterns:
- import { useMemo } from "react"
- useMemo(() => expr, [deps])
```

**Regex:**
```
import\s+\{[^}]*useMemo[^}]*\}\s+from\s+["']react["']
useMemo\s*\(
```

**Fix:** Replace with `createMemo(() => expr)`. Remove dependency array.

### AP-007: Conditional Signal Access

**What to look for:** Signal getter called inside an `if` block within an effect.

```
Detection patterns:
- createEffect(() => { if (x) { signal() } })
- createEffect(() => { condition && signal() })
```

**Regex (approximate):**
```
createEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*if\s*\([^)]*\)\s*\{[^}]*\w+\(\)
```

**Fix:** Move all signal reads before the conditional: `const val = signal(); if (cond) { use(val); }`.

### AP-008: Early Return Before Signal Access

**What to look for:** A `return` statement in an effect before some signal reads.

```
Detection patterns:
- createEffect(() => { if (x()) return; y(); })
```

**Fix:** Read ALL signals at the top of the effect, then use conditionals on the captured values.

### AP-009: Storing Signal in Variable

**What to look for:** Signal getter called in component body and stored for later use.

```
Detection patterns:
- const x = signal(); // then used in setTimeout, event handler, etc.
```

**Fix:** Call `signal()` at the point of use, not at component setup time.

### AP-011: Array.map for Lists

**What to look for:** `.map()` call inside JSX return.

```
Detection patterns:
- {items.map((item) => <Element />)}
- {items().map((item) => <Element />)}
```

**Regex:**
```
\{\s*\w+(?:\(\))?\s*\.map\s*\(
```

**Fix:** Replace with `<For each={items()}>{(item) => <Element />}</For>`.

### AP-013: switch/case in Component Body

**What to look for:** `switch` statement used to determine component return value.

```
Detection patterns:
- switch (props.type) { case "a": return <A />; ... }
```

**Regex:**
```
switch\s*\([^)]*\)\s*\{[^}]*return\s*<
```

**Fix:** Replace with `<Switch fallback={...}><Match when={...}>...</Match></Switch>`.

### AP-017: Children as Static Value

**What to look for:** Direct access to `props.children` without the `children()` helper, especially when accessed multiple times.

```
Detection patterns:
- props.children used in effect/memo AND in JSX return
- props.children assigned to a variable
```

**Regex:**
```
props\.children                           # Flag for review
(?:const|let)\s+\w+\s*=\s*props\.children  # Definitely wrong
```

**Fix:** Use `const resolved = children(() => props.children)` then `resolved()`.

### AP-019: useRouter Import

**What to look for:** React Router or Next.js router imports.

```
Detection patterns:
- import { useRouter } from "next/router"
- import { useHistory } from "react-router-dom"
- router.push("/path")
```

**Regex:**
```
import\s+\{[^}]*useRouter[^}]*\}\s+from\s+["']next\/router["']
import\s+\{[^}]*useHistory[^}]*\}\s+from\s+["']react-router
router\.push\s*\(
```

**Fix:** Use `import { useNavigate } from "@solidjs/router"` and `const navigate = useNavigate(); navigate("/path")`.

### AP-020: Data Fetching in useEffect/createEffect

**What to look for:** `fetch()` or async operations inside effects for data loading.

```
Detection patterns:
- createEffect(async () => { ... fetch ... })
- createEffect(() => { fetch(...).then(...) })
```

**Regex:**
```
createEffect\s*\(\s*async
createEffect\s*\([^)]*fetch\s*\(
```

**Fix:** Use `createResource(source, fetcher)` or `createAsync(() => query(...))` from `@solidjs/router`.

### AP-021: element Prop on Route

**What to look for:** React Router's `element` prop pattern on Route components.

```
Detection patterns:
- <Route path="/" element={<Component />} />
```

**Regex:**
```
<Route[^>]*element\s*=\s*\{
```

**Fix:** Use `component={Component}` (pass the component reference, not a JSX element).

### AP-022: getServerSideProps Pattern

**What to look for:** Exported data-fetching functions following Next.js conventions.

```
Detection patterns:
- export async function getServerSideProps
- export async function getStaticProps
```

**Regex:**
```
export\s+(?:async\s+)?function\s+(?:getServerSideProps|getStaticProps|getStaticPaths)
```

**Fix:** Use `query()` with `"use server"` directive and `createAsync()`.

## MEDIUM Severity

### AP-010: Spreading Props Unsafely

**What to look for:** Raw `{...props}` spread without splitProps.

```
Detection patterns:
- <Element {...props} />  (without prior splitProps call)
```

**Regex:**
```
\{\s*\.\.\.props\s*\}
```

**Context check:** Only flag if `splitProps` is NOT used in the same component.

**Fix:** Use `const [local, rest] = splitProps(props, ["knownProps"]); <Element {...rest} />`.

### AP-012: Ternary Instead of Show

**What to look for:** Ternary expressions in JSX that render different components.

```
Detection patterns:
- {condition ? <ComponentA /> : <ComponentB />}
```

**Regex:**
```
\{\s*\w+(?:\(\))?\s*\?\s*<\w+[^}]*:\s*<\w+
```

**Fix:** Use `<Show when={condition} fallback={<ComponentB />}><ComponentA /></Show>`.

**Note:** Simple ternaries for text/attributes are acceptable. Flag only when switching between components.

### AP-015: useRef Pattern

**What to look for:** React's `useRef` hook or `.current` property access.

```
Detection patterns:
- import { useRef } from "react"
- useRef(null)
- ref.current
```

**Regex:**
```
useRef\s*\(
\w+\.current\b
```

**Fix:** Use `let ref!: HTMLElement;` with `ref={ref}` on the JSX element. Access `ref` directly (no `.current`).

### AP-023: Form onSubmit with preventDefault

**What to look for:** Form submission handled entirely in JavaScript with preventDefault.

```
Detection patterns:
- onSubmit={(e) => { e.preventDefault(); ... }}
- const handleSubmit = (e) => { e.preventDefault(); ... fetch(...) }
```

**Regex:**
```
(?:onSubmit|on:submit)\s*=\s*\{[^}]*preventDefault
```

**Fix:** Use `action()` with `<form action={myAction} method="post">` for progressive enhancement.

## LOW Severity

### AP-014: key Prop on List Items

**What to look for:** `key` prop usage inside `<For>` callbacks.

```
Detection patterns:
- <For each={...}>{(item) => <div key={item.id}>...</div>}</For>
```

**Regex:**
```
<For[^>]*>[^<]*key\s*=\s*\{
```

**Fix:** Remove the `key` prop. `<For>` tracks items by reference identity automatically.

### AP-016: React.createElement Assumption

**What to look for:** Manual `createElement` calls or assumptions about virtual DOM.

```
Detection patterns:
- React.createElement(
- createElement(
- h() function calls (hyperscript)
```

**Regex:**
```
(?:React\.)?createElement\s*\(
```

**Fix:** Use JSX directly. SolidJS compiles JSX to direct DOM creation, not virtual DOM descriptors.
