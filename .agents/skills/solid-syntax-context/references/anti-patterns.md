# Context API — Anti-Patterns

## 1. Missing Provider Guard

### WRONG — Using useContext directly without error handling

```tsx
function UserProfile() {
  const auth = useContext(AuthContext); // Returns undefined if no Provider
  return <p>{auth.user().name}</p>;    // Runtime error: Cannot read property 'user' of undefined
}
```

### CORRECT — Custom hook with explicit guard

```tsx
function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth: must be used within <AuthProvider>");
  }
  return context;
}

function UserProfile() {
  const auth = useAuth(); // Throws clear error if Provider is missing
  return <p>{auth.user().name}</p>;
}
```

**Why**: Without the guard, a missing Provider causes cryptic "cannot read property of undefined" errors deep in the component tree. The custom hook provides an immediate, descriptive error message pointing to the exact problem.

---

## 2. Breaking Reactivity by Reading Signals in the Value Prop

### WRONG — Signal value read at Provider creation time

```tsx
function CounterProvider(props: ParentProps) {
  const [count, setCount] = createSignal(0);

  return (
    <CounterContext.Provider value={{ count: count(), increment: () => setCount((c) => c + 1) }}>
      {props.children}                    {/* ^^^^^^^^ READ HERE — value is frozen! */}
    </CounterContext.Provider>
  );
}
```

### CORRECT — Pass the signal accessor (function), not its value

```tsx
function CounterProvider(props: ParentProps) {
  const [count, setCount] = createSignal(0);

  return (
    <CounterContext.Provider value={{ count, increment: () => setCount((c) => c + 1) }}>
      {props.children}                    {/* ^^^^^ ACCESSOR — consumers call count() themselves */}
    </CounterContext.Provider>
  );
}
```

**Why**: SolidJS components render ONCE. The `value` prop object is created once when the Provider renders. If you call `count()` in the object literal, you capture the value at that moment (0) and it never updates. Passing the accessor function `count` lets consumers call it inside their own reactive tracking scopes.

---

## 3. Untyped Context (No TypeScript Generic)

### WRONG — No type parameter

```tsx
const MyContext = createContext();
// Type is Context<undefined> — useContext always returns undefined
```

### WRONG — Using `any`

```tsx
const MyContext = createContext<any>({});
// No type safety — consumers get `any`, defeating TypeScript's purpose
```

### CORRECT — Explicit interface type

```tsx
interface MyContextValue {
  theme: () => "light" | "dark";
  toggleTheme: () => void;
}
const MyContext = createContext<MyContextValue>();
```

**Why**: Without a generic type parameter, `createContext()` produces `Context<undefined>`, making the context useless. With `any`, you lose all type-checking benefits. ALWAYS define an interface and pass it as the generic parameter.

---

## 4. React-Style Context Pattern (Re-renders)

### WRONG — React pattern: context triggers re-renders

```tsx
// React mental model — DOES NOT APPLY to SolidJS
// In React: changing context value re-renders ALL consumers
// Developers try to "optimize" with useMemo, React.memo, etc.

function Provider(props: ParentProps) {
  const [count, setCount] = createSignal(0);

  // WRONG: Creating new object on every "render" to try React-style updates
  // SolidJS components render ONCE — this object is created exactly once
  const value = () => ({
    count: count(),
    increment: () => setCount((c) => c + 1),
  });

  return (
    <MyContext.Provider value={value()}>
      {props.children}
    </MyContext.Provider>
  );
}
```

### CORRECT — SolidJS pattern: pass stable object with reactive members

```tsx
function Provider(props: ParentProps) {
  const [count, setCount] = createSignal(0);

  // Stable object created once — signal accessors provide reactivity
  const value = {
    count,
    increment: () => setCount((c) => c + 1),
  };

  return (
    <MyContext.Provider value={value}>
      {props.children}
    </MyContext.Provider>
  );
}
```

**Why**: SolidJS components execute their function body exactly once. There is no "re-render" cycle. The Provider's value prop is set once. Reactivity comes from signal accessors and store proxies inside the value, not from recreating the value object.

---

## 5. Defining Context Inside a Component

### WRONG — Context created inside component body

```tsx
function App() {
  const MyContext = createContext<string>("default"); // NEW context every render
  return (
    <MyContext.Provider value="hello">
      <Child />
    </MyContext.Provider>
  );
}
```

### CORRECT — Context at module scope

```tsx
// my-context.tsx
const MyContext = createContext<string>("default"); // Stable identity

export function App() {
  return (
    <MyContext.Provider value="hello">
      <Child />
    </MyContext.Provider>
  );
}
```

**Why**: `createContext` creates a new context object with a unique `symbol` id. If called inside a component, each execution produces a different context identity. Consumers using `useContext` will never match the Provider's context. ALWAYS define context at module level.

---

## 6. Exporting Raw Context Instead of Custom Hook

### WRONG — Exporting the context object

```tsx
// my-context.tsx
export const UserContext = createContext<UserState>();

// consumer.tsx
import { UserContext } from "./my-context";
const user = useContext(UserContext); // No guard, type includes undefined
```

### CORRECT — Export only the custom hook and Provider

```tsx
// my-context.tsx
const UserContext = createContext<UserState>(); // NOT exported

export function useUser(): UserState {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser: must be used within <UserProvider>");
  return ctx;
}

export function UserProvider(props: ParentProps) { /* ... */ }

// consumer.tsx
import { useUser } from "./my-context";
const user = useUser(); // Type-safe, guarded, clean API
```

**Why**: Exporting the raw context encourages direct `useContext` calls without guards, leading to unclear error messages and `undefined` type pollution. The custom hook encapsulates the guard, narrows the type, and provides a clean public API.

---

## 7. Using Context for Frequently-Changing Primitive Values

### SUBOPTIMAL — Context for a single rapidly-changing value

```tsx
const MouseContext = createContext<{ x: () => number; y: () => number }>();

function MouseProvider(props: ParentProps) {
  const [pos, setPos] = createSignal({ x: 0, y: 0 });
  // Mouse moves fire hundreds of times per second
  window.addEventListener("mousemove", (e) => setPos({ x: e.clientX, y: e.clientY }));

  return (
    <MouseContext.Provider value={{ x: () => pos().x, y: () => pos().y }}>
      {props.children}
    </MouseContext.Provider>
  );
}
```

### BETTER — Module-level signal for high-frequency global state

```tsx
// mouse.ts — no context needed
import { createSignal } from "solid-js";

const [mousePos, setMousePos] = createSignal({ x: 0, y: 0 });
window.addEventListener("mousemove", (e) => setMousePos({ x: e.clientX, y: e.clientY }));

export { mousePos };
```

**Why**: Context adds indirection (Provider requirement, hook call, tree walking) with no benefit when the state is truly global and has a single source. Module-level signals are simpler and more performant for singleton reactive values. Reserve context for state that needs scoping, encapsulation, or dependency injection.
