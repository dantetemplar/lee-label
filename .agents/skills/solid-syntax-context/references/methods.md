# Context API — Method Reference

## createContext

### Signature

```typescript
function createContext<T>(): Context<T | undefined>;
function createContext<T>(defaultValue: T): Context<T>;
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `defaultValue` | `T` | No | Value returned by `useContext` when no Provider exists in the ancestor tree |

### Return Value

```typescript
interface Context<T> {
  id: symbol;
  Provider: (props: { value: T; children: any }) => any;
  defaultValue: T;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `id` | `symbol` | Unique symbol identifying this context |
| `Provider` | `Component` | Component that supplies `value` to all descendants |
| `defaultValue` | `T` | The default value passed to `createContext`, or `undefined` |

### Behavior

- When called WITHOUT a default value, `useContext` returns `undefined` if no Provider is found — the return type is `Context<T | undefined>`
- When called WITH a default value, `useContext` returns that default if no Provider is found — the return type is `Context<T>`
- The context object MUST be defined at module scope (not inside a component) to maintain stable identity across renders and HMR
- ALWAYS define context in a separate module file to avoid HMR identity loss

### Examples

```typescript
// Without default — useContext may return undefined
const ThemeContext = createContext<"light" | "dark">();

// With default — useContext always returns a value
const ThemeContext = createContext<"light" | "dark">("light");

// With complex type
interface AuthState {
  user: () => User | null;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
}
const AuthContext = createContext<AuthState>();
```

---

## useContext

### Signature

```typescript
function useContext<T>(context: Context<T>): T;
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `context` | `Context<T>` | Yes | Context object created by `createContext` |

### Return Value

Returns the `value` from the nearest ancestor `<Context.Provider value={...}>`. If no Provider is found, returns the `defaultValue` from `createContext` (or `undefined` if none was provided).

### Behavior

- Walks up the component tree to find the nearest Provider for the given context
- Returns the Provider's `value` prop directly — no cloning, no reactive wrapping
- If no Provider exists and no default was set, returns `undefined`
- The returned value retains its original reactivity (signals remain signals, stores remain stores)
- MUST be called during component initialization (synchronous, top-level in component body) — not inside event handlers or async callbacks

### Examples

```typescript
// Direct usage (not recommended — no error checking)
const theme = useContext(ThemeContext);

// Recommended: custom hook with guard
function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error("useTheme: must be used within <ThemeProvider>");
  }
  return ctx;
}
```

---

## Provider Component

### Signature

```typescript
<Context.Provider value={T}>
  {children}
</Context.Provider>
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `value` | `T` | Yes | The value to provide to all descendant consumers |
| `children` | `JSX.Element` | Yes | Child components that can consume this context |

### Behavior

- The `value` prop is passed directly to `useContext` consumers — it is NOT wrapped in any reactive primitive
- To maintain reactivity, pass signal accessors or store proxies as part of the value — NEVER call signals in the value object literal
- Multiple Providers for the same context can be nested — the innermost Provider wins for its subtree
- Provider does NOT re-render its children when the value changes — consumers track their own reactive dependencies

### Examples

```tsx
// Static value
<ThemeContext.Provider value="dark">
  {props.children}
</ThemeContext.Provider>

// Reactive value — signal accessor preserved
const [theme, setTheme] = createSignal<"light" | "dark">("light");
<ThemeContext.Provider value={{ theme, setTheme }}>
  {props.children}
</ThemeContext.Provider>

// Store value — proxy preserved
const [state, setState] = createStore({ user: null, preferences: {} });
<AppContext.Provider value={[state, setState]}>
  {props.children}
</AppContext.Provider>
```
