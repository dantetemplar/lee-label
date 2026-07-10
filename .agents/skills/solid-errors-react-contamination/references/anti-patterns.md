# Anti-Pattern Quick Reference

Consolidated table of every React contamination pattern with detection rule, severity, and fix.

## Master Table

| ID | Name | Severity | React Pattern | SolidJS Fix | Detection Rule |
|----|------|----------|---------------|-------------|----------------|
| AP-001 | Destructuring props | CRITICAL | `function X({ a, b })` | `function X(props)` + `props.a` | Destructured params or `const { } = props` |
| AP-002 | Destructuring signal value | CRITICAL | `const val = signal()` in body | Call `signal()` inline in JSX/effect | `const x = getter()` in component body |
| AP-003 | useState | CRITICAL | `useState(0)` | `createSignal(0)` + call getter `()` | `useState` import or call |
| AP-004 | useEffect with deps | CRITICAL | `useEffect(fn, [deps])` | `createEffect(fn)` -- auto-tracked | `useEffect` import or `[deps]` array |
| AP-005 | useMemo with deps | HIGH | `useMemo(fn, [deps])` | `createMemo(fn)` -- auto-tracked | `useMemo` import or call |
| AP-006 | Re-render assumption | CRITICAL | `const x = a() * 2` in body | `createMemo(() => a() * 2)` | Derived value as plain const |
| AP-007 | Conditional signal access | HIGH | `if (x) { signal() }` in effect | Read all signals before conditions | Signal read inside if-block |
| AP-008 | Early return before signal | HIGH | `if (x()) return` before `y()` | Read all signals first, then return | `return` before signal read |
| AP-009 | Signal stored in variable | HIGH | `const x = signal()` for later use | Call `signal()` at point of use | Variable holds getter result |
| AP-010 | Raw props spread | MEDIUM | `<El {...props} />` | `splitProps` + spread rest | `{...props}` without splitProps |
| AP-011 | Array.map in JSX | HIGH | `{items.map(x => <li/>)}` | `<For each={items()}>{x => <li/>}</For>` | `.map(` in JSX expression |
| AP-012 | Ternary for components | MEDIUM | `{cond ? <A/> : <B/>}` | `<Show when={cond} fallback={<B/>}>` | Ternary with JSX elements |
| AP-013 | switch/case in body | HIGH | `switch(x) { case: return <A/> }` | `<Switch><Match when={...}/>` | switch with JSX returns |
| AP-014 | key prop | LOW | `<div key={id}>` | Remove key -- For tracks by reference | `key={` in For callback |
| AP-015 | useRef | MEDIUM | `useRef(null)` + `.current` | `let ref!: HTMLElement` + direct access | `useRef` or `.current` |
| AP-016 | createElement | LOW | `React.createElement(...)` | Use JSX directly | `createElement(` call |
| AP-017 | Children as value | HIGH | `props.children` directly | `children(() => props.children)` | Multiple `props.children` reads |
| AP-018 | Effect cleanup return | CRITICAL | `return () => cleanup` in effect | `onCleanup(() => cleanup)` | `return` in createEffect |
| AP-019 | useRouter | HIGH | `useRouter()` from next/react-router | `useNavigate()` from @solidjs/router | `useRouter` or `useHistory` import |
| AP-020 | Fetch in effect | HIGH | `useEffect(() => fetch(...))` | `createResource` or `createAsync` | `fetch` inside effect |
| AP-021 | element prop on Route | HIGH | `element={<Component/>}` | `component={Component}` | `element={` on Route |
| AP-022 | getServerSideProps | HIGH | `export async function getServerSideProps` | `query()` + `"use server"` + `createAsync()` | `getServerSideProps` export |
| AP-023 | Form preventDefault | MEDIUM | `e.preventDefault()` + fetch | `action()` + `<form action={...}>` | `preventDefault` in form handler |

## By Severity

### CRITICAL -- Code is broken, reactivity completely lost

| ID | Pattern | Most Common Symptom |
|----|---------|-------------------|
| AP-001 | Destructuring props | UI never updates when parent changes props |
| AP-002 | Destructuring signal value | Displayed value is frozen at initial state |
| AP-003 | useState usage | Import error or missing getter call |
| AP-004 | useEffect with deps | Import error or deps treated as initial value |
| AP-006 | Re-render assumption | Derived values never change |
| AP-018 | Effect cleanup return | Memory leaks, cleanup never runs |

### HIGH -- Code produces incorrect behavior

| ID | Pattern | Most Common Symptom |
|----|---------|-------------------|
| AP-005 | useMemo with deps | Import error or missing reactivity |
| AP-007 | Conditional signal access | Effect misses updates to conditionally-read signals |
| AP-008 | Early return before signal | Effect stops tracking signals after the return |
| AP-009 | Signal stored in variable | Stale values used in event handlers/timers |
| AP-011 | Array.map in JSX | Poor performance, DOM nodes recreated on every change |
| AP-013 | switch/case in body | Routing/conditional content never changes |
| AP-017 | Children as value | Children re-created on every access |
| AP-019 | useRouter import | Import error, wrong router API |
| AP-020 | Fetch in effect | Race conditions, no loading/error states |
| AP-021 | element prop on Route | Component created eagerly, not lazily |
| AP-022 | getServerSideProps | No equivalent exists, data loading fails |

### MEDIUM -- Code works but is non-idiomatic or fragile

| ID | Pattern | Risk |
|----|---------|------|
| AP-010 | Raw props spread | May pass unexpected attributes, subtle reactivity issues |
| AP-012 | Ternary for components | Unnecessary DOM recreation in some cases |
| AP-015 | useRef pattern | Wrong API, `.current` does not exist |
| AP-023 | Form preventDefault | No progressive enhancement, JS-only |

### LOW -- Code works but has unnecessary patterns

| ID | Pattern | Impact |
|----|---------|--------|
| AP-014 | key prop | Ignored by SolidJS, no harm but confusing |
| AP-016 | createElement | Wrong mental model, but JSX compiles correctly |

## Import Mapping: React to SolidJS

| React Import | SolidJS Replacement | Package |
|-------------|--------------------:|---------|
| `useState` | `createSignal` | `solid-js` |
| `useEffect` | `createEffect` / `onMount` | `solid-js` |
| `useMemo` | `createMemo` | `solid-js` |
| `useRef` | `let ref!: T` (plain variable) | N/A |
| `useCallback` | Not needed (no re-renders) | N/A |
| `useContext` | `useContext` | `solid-js` |
| `useReducer` | `createStore` + `produce` | `solid-js/store` |
| `forwardRef` | Pass `ref` as regular prop | N/A |
| `React.memo` | Not needed (components run once) | N/A |
| `useRouter` (Next) | `useNavigate` | `@solidjs/router` |
| `useHistory` (RR) | `useNavigate` | `@solidjs/router` |
| `Link` (RR) | `A` | `@solidjs/router` |
| `useLoaderData` (RR) | `createAsync` | `@solidjs/router` |

## SolidJS Equivalents for React Concepts

| React Concept | SolidJS Equivalent | Key Difference |
|--------------|-------------------|----------------|
| Component re-render | No equivalent | Components run ONCE |
| Virtual DOM diffing | No equivalent | Direct DOM updates |
| `React.memo()` | Not needed | No re-renders to optimize |
| `useCallback()` | Not needed | Functions created once |
| Dependency arrays | Automatic tracking | No manual dependency management |
| `key` prop for lists | Reference tracking in `<For>` | Automatic, no key needed |
| `children` as value | `children()` helper | Must resolve before use |
| Cleanup via return | `onCleanup()` | Separate function call |
| `defaultProps` | `mergeProps()` | Maintains reactivity |
| Props destructuring | `splitProps()` | Maintains reactivity |
| Conditional rendering | `<Show>` component | Reactive, not re-render based |
| List rendering | `<For>` / `<Index>` | Reference tracking, not key-based |
| Switch rendering | `<Switch>` / `<Match>` | Reactive evaluation |
| Error boundary class | `<ErrorBoundary>` component | Function component, not class |
| Suspense | `<Suspense>` | Same concept, similar API |
| Context | `createContext` / `useContext` | Same concept, similar API |
| Portal | `<Portal>` from `solid-js/web` | Similar concept |
| Lazy loading | `lazy()` from `solid-js` | Similar API |
