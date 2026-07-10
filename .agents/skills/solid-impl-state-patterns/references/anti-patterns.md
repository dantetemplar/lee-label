# State Pattern Anti-Patterns

## Anti-Pattern 1: Redux/useReducer Patterns

Redux-style state management is unnecessary in SolidJS. The fine-grained reactivity system with `createStore` already provides surgical updates without reducers, actions, or middleware.

### WRONG: Redux-Style Reducer

```tsx
// WRONG — Importing or mimicking Redux patterns
import { createSignal } from "solid-js";

type Action =
  | { type: "INCREMENT" }
  | { type: "DECREMENT" }
  | { type: "SET"; payload: number };

function reducer(state: number, action: Action): number {
  switch (action.type) {
    case "INCREMENT": return state + 1;
    case "DECREMENT": return state - 1;
    case "SET": return action.payload;
  }
}

function useReducer(reducer: Function, initial: number) {
  const [state, setState] = createSignal(initial);
  const dispatch = (action: Action) => setState(reducer(state(), action));
  return [state, dispatch] as const;
}
```

### CORRECT: Direct Store Actions

```tsx
// CORRECT — SolidJS idiomatic: createStore with action functions
import { createStore } from "solid-js/store";

function createCounter(initial: number = 0) {
  const [state, setState] = createStore({ count: initial });
  return {
    state,
    increment: () => setState("count", (c) => c + 1),
    decrement: () => setState("count", (c) => c - 1),
    set: (value: number) => setState("count", value),
  };
}
```

**WHY:** SolidJS stores provide fine-grained updates at the property level. Redux reducers replace the entire state object on every action, defeating SolidJS's surgical reactivity. There is no benefit to reducers when the store setter already supports path-based updates.

---

## Anti-Pattern 2: Prop Drilling

Passing state through many levels of components that do not use it.

### WRONG: Drilling Through Intermediate Components

```tsx
// WRONG — Header and Layout do not use user, but must pass it
function App() {
  const [user, setUser] = createSignal<User | null>(null);
  return <Layout user={user()} setUser={setUser} />;
}

function Layout(props: { user: User | null; setUser: (u: User | null) => void }) {
  return <Header user={props.user} setUser={props.setUser} />;
}

function Header(props: { user: User | null; setUser: (u: User | null) => void }) {
  return <UserMenu user={props.user} setUser={props.setUser} />;
}
```

### CORRECT: Context for Cross-Component State

```tsx
// CORRECT — Context eliminates prop drilling
import { createContext, useContext, createSignal, ParentProps } from "solid-js";

interface AuthContextValue {
  user: () => User | null;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue>();

function AuthProvider(props: ParentProps) {
  const [user, setUser] = createSignal<User | null>(null);
  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {props.children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Now UserMenu accesses state directly — no drilling
function UserMenu() {
  const { user, setUser } = useAuth();
  return <Show when={user()}>{(u) => <span>{u().name}</span>}</Show>;
}
```

**WHY:** Prop drilling creates tight coupling between components that do not need the data. It makes refactoring difficult and adds noise to component interfaces. Context provides direct access from any depth.

**WHEN prop passing IS correct:** For 1-2 levels of direct parent-child relationships where the intermediate components genuinely use the data. Do NOT create context for simple parent-child props.

---

## Anti-Pattern 3: Global Mutable Variables

Using module-level mutable variables for shared state.

### WRONG: Module-Level State

```tsx
// WRONG — Module-level variable is NOT reactive
let currentUser: User | null = null;
let theme = "light";

export function setCurrentUser(user: User | null) {
  currentUser = user; // Mutation, but nothing re-renders
}

export function getTheme() {
  return theme; // Returns snapshot, not reactive
}

function Header() {
  return <span>{currentUser?.name}</span>; // NEVER updates
}
```

### CORRECT: Reactive State via Context

```tsx
// CORRECT — Reactive and scoped via context
import { createContext, useContext, ParentProps } from "solid-js";
import { createStore } from "solid-js/store";

interface GlobalState {
  currentUser: User | null;
  theme: "light" | "dark";
}

const GlobalContext = createContext<[GlobalState, /* actions */]>();

function GlobalProvider(props: ParentProps) {
  const [state, setState] = createStore<GlobalState>({
    currentUser: null,
    theme: "light",
  });

  // ... actions using setState

  return (
    <GlobalContext.Provider value={[state, /* actions */]}>
      {props.children}
    </GlobalContext.Provider>
  );
}

function Header() {
  const [state] = useGlobal();
  return <span>{state.currentUser?.name}</span>; // Reactive, updates automatically
}
```

**WHY:** Module-level variables are invisible to SolidJS's reactivity system. Changes to them NEVER trigger re-computation of dependent effects, memos, or JSX expressions. Context + stores make state reactive, scoped, testable, and SSR-safe.

---

## Anti-Pattern 4: Unnecessary State (Derived Values Stored as State)

Creating signals or stores for values that can be computed from existing state.

### WRONG: Syncing Derived State with Effects

```tsx
// WRONG — Storing derived state + using effect to sync
const [items, setItems] = createSignal<Item[]>([]);
const [count, setCount] = createSignal(0);
const [total, setTotal] = createSignal(0);
const [hasItems, setHasItems] = createSignal(false);

createEffect(() => {
  setCount(items().length);           // Unnecessary signal
  setTotal(items().reduce((s, i) => s + i.price, 0)); // Unnecessary signal
  setHasItems(items().length > 0);    // Unnecessary signal
});
```

### CORRECT: Compute with createMemo

```tsx
// CORRECT — Derive values, do not duplicate them
const [items, setItems] = createSignal<Item[]>([]);

const count = createMemo(() => items().length);
const total = createMemo(() => items().reduce((s, i) => s + i.price, 0));
const hasItems = createMemo(() => items().length > 0);
```

**WHY:** Every extra signal creates state that must be kept in sync. Using effects to sync derived state introduces unnecessary complexity, potential timing bugs, and wastes reactive computations. `createMemo` derives the value directly from the source — it is ALWAYS in sync by definition.

### Rule of Thumb

If a value can be computed from existing state, it MUST be a `createMemo`, not a separate signal synchronized by an effect.

---

## Anti-Pattern 5: Destructuring State Objects

Destructuring breaks SolidJS's proxy-based tracking.

### WRONG: Destructuring Store Properties

```tsx
// WRONG — Destructuring captures snapshots, kills reactivity
function UserCard(props: { user: Store<User> }) {
  const { name, email } = props.user; // Static values, never update
  return (
    <div>
      <h2>{name}</h2>     {/* Never updates */}
      <p>{email}</p>       {/* Never updates */}
    </div>
  );
}
```

### CORRECT: Access Through Proxy

```tsx
// CORRECT — Access properties through the reactive proxy
function UserCard(props: { user: Store<User> }) {
  return (
    <div>
      <h2>{props.user.name}</h2>     {/* Reactive, fine-grained tracking */}
      <p>{props.user.email}</p>       {/* Reactive, fine-grained tracking */}
    </div>
  );
}
```

**WHY:** SolidJS stores use JavaScript Proxies to track which properties are accessed within reactive scopes. Destructuring reads the values at destruction time, bypassing the proxy. The resulting plain values are not tracked.

---

## Anti-Pattern 6: Overusing Context (One Giant Context)

Placing all application state in a single context causes every consumer to depend on the entire state object.

### WRONG: Monolithic Context

```tsx
// WRONG — Everything in one context
const AppContext = createContext<{
  user: User | null;
  theme: Theme;
  cart: CartItem[];
  notifications: Notification[];
  sidebar: boolean;
  locale: string;
}>();

// Every component that reads theme also depends on cart, notifications, etc.
```

### CORRECT: Separate Contexts by Domain

```tsx
// CORRECT — Split by concern
const AuthContext = createContext<AuthState>();      // user, login, logout
const ThemeContext = createContext<ThemeState>();     // theme, toggle
const CartContext = createContext<CartState>();       // items, add, remove
const UIContext = createContext<UIState>();           // sidebar, modals

// ThemeToggle only re-computes when theme changes
function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return <button onClick={toggle}>{theme()}</button>;
}
```

**WHY:** SolidJS stores track at the property level, so a single large store context is technically efficient. However, separating contexts by domain improves code organization, testability, and makes dependencies explicit. ALWAYS separate contexts when the state domains are logically independent.

---

## Anti-Pattern 7: Using createMutable for Application State

`createMutable` allows direct property mutation like MobX/Vue, but breaks unidirectional data flow.

### WRONG: createMutable for App State

```tsx
// WRONG — Direct mutations make state changes hard to trace
import { createMutable } from "solid-js/store";

const state = createMutable({
  user: null as User | null,
  items: [] as Item[],
});

// Mutations scattered everywhere, no clear action boundaries
function Header() {
  return <button onClick={() => { state.user = null; }}>Logout</button>;
}

function ItemList() {
  return <button onClick={() => { state.items.push(newItem); }}>Add</button>;
}
```

### CORRECT: createStore with Explicit Actions

```tsx
// CORRECT — createStore with named action functions
import { createStore } from "solid-js/store";

const [state, setState] = createStore({
  user: null as User | null,
  items: [] as Item[],
});

const actions = {
  logout: () => setState("user", null),
  addItem: (item: Item) => setState("items", (prev) => [...prev, item]),
};
```

**WHY:** The SolidJS documentation explicitly warns that `createMutable` "may complicate the code structure and increase the risk of breaking unidirectional flow." Use `createStore` with explicit setter calls for traceable, predictable state changes. Reserve `createMutable` ONLY for MobX/Vue migration or wrapping third-party mutable libraries.

---

## Summary: State Anti-Pattern Quick Reference

| Anti-Pattern | Problem | SolidJS Solution |
|-------------|---------|-----------------|
| Redux/useReducer | Unnecessary boilerplate, replaces entire state | `createStore` + action functions |
| Prop drilling | Coupling, noise in component interfaces | `createContext` + custom hook |
| Global mutable variables | Not reactive, breaks SSR | `createContext` + `createStore` |
| Effect-synced derived state | Complexity, timing bugs | `createMemo` |
| Destructuring stores/props | Kills proxy-based tracking | Access through proxy object |
| Monolithic context | Poor separation of concerns | Split contexts by domain |
| createMutable for app state | Breaks unidirectional flow | `createStore` with explicit setters |
