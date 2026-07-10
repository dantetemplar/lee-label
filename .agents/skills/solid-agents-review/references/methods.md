# solid-agents-review: Validation Methods

Complete validation checklist organized by area. Each check includes: what to look for, the expected correct state, and the common failure mode.

---

## Signal Access Validation

### CHECK-S01: Signal getter called as function [CRITICAL]

- **What to look for**: Signal accessors used in JSX or reactive scopes
- **Expected correct state**: `count()` -- parentheses present
- **Common failure**: `count` without parentheses -- renders the function reference, not the value

### CHECK-S02: No stored signal snapshots [CRITICAL]

- **What to look for**: Signal getter result assigned to `const`/`let` at component top level
- **Expected correct state**: Signal called inline or wrapped in `createMemo`
- **Common failure**: `const value = count();` at top level -- captured once, never updates

### CHECK-S03: Derived state uses createMemo [WARNING]

- **What to look for**: Computed values based on signals
- **Expected correct state**: `const derived = createMemo(() => count() * 2);`
- **Common failure**: `createEffect(() => setDerived(count() * 2))` -- unnecessary effect + signal pair

### CHECK-S04: No conditional signal access before other signals [CRITICAL]

- **What to look for**: Early returns or conditionals before signal reads in effects
- **Expected correct state**: All signals read unconditionally at the top of the effect body
- **Common failure**: `if (loading()) return; console.log(name());` -- name() not tracked when loading is true

### CHECK-S05: Inline functions for derived values in JSX [INFO]

- **What to look for**: Computed expressions in JSX that are not memoized
- **Expected correct state**: `{() => count() * 2}` or `{doubled()}` where `doubled = createMemo(...)`
- **Common failure**: `{count() * 2}` directly in JSX -- works but consider createMemo for expensive computations

---

## Props Validation

### CHECK-P01: No props destructuring in function signature [CRITICAL]

- **What to look for**: `function Component({ prop1, prop2 })` or `const { x } = props`
- **Expected correct state**: `function Component(props)` with `props.prop1` access
- **Common failure**: Destructuring reads props once at component creation, loses reactive tracking

### CHECK-P02: splitProps for prop separation [WARNING]

- **What to look for**: Components that need to forward some props and consume others
- **Expected correct state**: `const [local, others] = splitProps(props, ["onClick", "class"])`
- **Common failure**: Manual prop extraction via destructuring

### CHECK-P03: mergeProps for defaults [WARNING]

- **What to look for**: Components with optional props that need default values
- **Expected correct state**: `const merged = mergeProps({ size: "md" }, props)`
- **Common failure**: `const size = props.size || "md"` -- loses reactivity if prop changes later

### CHECK-P04: children() helper for child manipulation [WARNING]

- **What to look for**: Components that read `props.children` multiple times or iterate over children
- **Expected correct state**: `const resolved = children(() => props.children)`
- **Common failure**: Direct `props.children` access in multiple places -- may re-create children each time

### CHECK-P05: No props.propName assignment to const [CRITICAL]

- **What to look for**: `const name = props.name;` at component top level
- **Expected correct state**: `props.name` accessed directly where needed, or `const name = () => props.name;`
- **Common failure**: Captured once, never updates when parent passes new value

---

## Control Flow Validation

### CHECK-CF01: For component for list rendering [WARNING]

- **What to look for**: `Array.map()` used to render lists
- **Expected correct state**: `<For each={items()}>{(item) => ...}</For>`
- **Common failure**: `.map()` re-creates ALL DOM nodes on every array change

### CHECK-CF02: Show component for conditionals [WARNING]

- **What to look for**: Ternary operators `condition ? <A /> : <B />`
- **Expected correct state**: `<Show when={condition()} fallback={<B />}><A /></Show>`
- **Common failure**: Ternaries can cause unnecessary DOM destruction/recreation

### CHECK-CF03: Switch/Match for multi-branch logic [WARNING]

- **What to look for**: `switch` statements or chained ternaries in component body
- **Expected correct state**: `<Switch><Match when={...}>...</Match></Switch>`
- **Common failure**: `switch` in component body runs once, never re-evaluates

### CHECK-CF04: No key prop on rendered elements [INFO]

- **What to look for**: `key={item.id}` on elements inside `<For>` or `<Index>`
- **Expected correct state**: No `key` prop -- `<For>` tracks by reference automatically
- **Common failure**: React habit -- `key` is ignored in SolidJS, adds noise

### CHECK-CF05: Index for primitive arrays, For for object arrays [INFO]

- **What to look for**: `<For>` used with `string[]` or `number[]` arrays
- **Expected correct state**: `<Index each={primitiveArray()}>` for primitives, `<For each={objectArray()}>` for objects
- **Common failure**: Using `<For>` with primitives -- works but `<Index>` is more efficient

### CHECK-CF06: For callback signature correctness [WARNING]

- **What to look for**: Incorrect use of `item` and `index` in `<For>` and `<Index>` callbacks
- **Expected correct state**: `<For>`: `item` is value, `index` is signal `index()`. `<Index>`: `item` is signal `item()`, `index` is number.
- **Common failure**: Calling `item()` in `<For>` (it is already a value) or not calling `item()` in `<Index>`

---

## Store Validation

### CHECK-ST01: No store property destructuring [CRITICAL]

- **What to look for**: `const { prop } = store` or `const { prop } = store.nested`
- **Expected correct state**: `store.prop` accessed directly in tracking scope
- **Common failure**: Extracted value is a snapshot, never updates

### CHECK-ST02: Path syntax for store updates [CRITICAL]

- **What to look for**: `setStore({ ...store, key: newValue })` or `setStore(Object.assign(...))`
- **Expected correct state**: `setStore("key", newValue)` or `setStore("nested", "prop", value)`
- **Common failure**: Spread-replace destroys fine-grained tracking

### CHECK-ST03: produce for complex mutations [WARNING]

- **What to look for**: Multiple sequential `setStore` calls that could be batched
- **Expected correct state**: `setStore(produce((s) => { s.a = 1; s.b.push(item); }))`
- **Common failure**: Multiple setStore calls without batching

### CHECK-ST04: reconcile for external data sync [INFO]

- **What to look for**: Replacing entire store sections with API response data
- **Expected correct state**: `setStore("items", reconcile(apiResponse))`
- **Common failure**: Full replacement via spread -- updates every subscriber even for unchanged fields

---

## Component Validation

### CHECK-C01: No early returns in component body [CRITICAL]

- **What to look for**: `if (condition) return <X />;` before main JSX return
- **Expected correct state**: `<Show>` or `<Switch>` for conditional rendering
- **Common failure**: Component body runs once -- early return is permanent, never re-evaluates

### CHECK-C02: Event handlers as references or arrow functions [WARNING]

- **What to look for**: `onClick={handler()}` -- calling the handler with parens
- **Expected correct state**: `onClick={handler}` or `onClick={() => handler(arg)}`
- **Common failure**: Invokes handler immediately during render, assigns its return value as the handler

### CHECK-C03: Ref pattern uses let with definite assignment [INFO]

- **What to look for**: `useRef(null)` or `const ref = { current: null }`
- **Expected correct state**: `let ref!: HTMLElement;` with `ref` attr on element
- **Common failure**: React ref patterns -- useRef does not exist in SolidJS

### CHECK-C04: Directive declarations in module scope [INFO]

- **What to look for**: `use:directiveName` without corresponding type declaration
- **Expected correct state**: `declare module "solid-js" { namespace JSX { interface Directives { directiveName: T; } } }`
- **Common failure**: TypeScript errors about unknown directive properties

### CHECK-C05: onCleanup for cleanup, NOT effect return [CRITICAL]

- **What to look for**: `createEffect(() => { ... return () => cleanup(); })`
- **Expected correct state**: `createEffect(() => { ... onCleanup(() => cleanup()); })`
- **Common failure**: React useEffect cleanup pattern -- return value is ignored in SolidJS createEffect

### CHECK-C06: No dependency arrays on effects or memos [CRITICAL]

- **What to look for**: `createEffect(() => { ... }, [dep1, dep2])` or `createMemo(() => ..., [dep])`
- **Expected correct state**: `createEffect(() => { ... })` -- dependencies tracked automatically
- **Common failure**: React mental model -- second argument is treated as initial value, NOT dependency array

---

## React Contamination Validation

### CHECK-RC01: No React imports [CRITICAL]

- **What to look for**: `import ... from "react"`, `import ... from "react-dom"`, `import ... from "react-router-dom"`
- **Expected correct state**: Imports from `solid-js`, `solid-js/store`, `solid-js/web`, `@solidjs/router`
- **Common failure**: Muscle memory -- React imports used automatically

### CHECK-RC02: No React hooks [CRITICAL]

- **What to look for**: `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`, `useReducer`, `useLayoutEffect`, `useImperativeHandle`
- **Expected correct state**: SolidJS equivalents -- see mapping in SKILL.md
- **Common failure**: LLM generates React hooks from training data

### CHECK-RC03: No forwardRef pattern [CRITICAL]

- **What to look for**: `forwardRef()`, `React.forwardRef()`
- **Expected correct state**: Pass `ref` as a regular prop -- `function Child(props: { ref: HTMLElement | ((el: HTMLElement) => void) })`
- **Common failure**: React requires HOC wrapper for ref forwarding, SolidJS does not

### CHECK-RC04: No React.memo wrapper [INFO]

- **What to look for**: `memo()`, `React.memo()`
- **Expected correct state**: No wrapper needed -- SolidJS components run once, no re-rendering to optimize
- **Common failure**: Applying React optimization patterns that have no effect in SolidJS

### CHECK-RC05: Route uses component prop, NOT element [CRITICAL]

- **What to look for**: `<Route element={<Component />} />` or `<Route element={jsx} />`
- **Expected correct state**: `<Route component={Component} />`
- **Common failure**: React Router v6 pattern -- creates element immediately instead of deferring to router

### CHECK-RC06: No React.createElement calls [CRITICAL]

- **What to look for**: `React.createElement(...)`, `createElement(...)`
- **Expected correct state**: JSX compiled by SolidJS compiler directly to DOM calls
- **Common failure**: Manual createElement calls bypass SolidJS compilation

### CHECK-RC07: Link component uses correct name and prop [WARNING]

- **What to look for**: `<Link to="/path">` (React Router)
- **Expected correct state**: `<A href="/path">` (Solid Router)
- **Common failure**: React Router component name and prop name differ from Solid Router
