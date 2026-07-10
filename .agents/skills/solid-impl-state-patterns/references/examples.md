# State Pattern Examples

## 1. Counter Provider (Context + Signal)

Minimal global state example using context with signals.

```tsx
import { createContext, useContext, createSignal, ParentProps } from "solid-js";

type CounterContextValue = [
  count: () => number,
  actions: { increment: () => void; decrement: () => void; reset: () => void }
];

const CounterContext = createContext<CounterContextValue>();

export function CounterProvider(props: ParentProps) {
  const [count, setCount] = createSignal(0);

  const actions = {
    increment: () => setCount((prev) => prev + 1),
    decrement: () => setCount((prev) => prev - 1),
    reset: () => setCount(0),
  };

  return (
    <CounterContext.Provider value={[count, actions]}>
      {props.children}
    </CounterContext.Provider>
  );
}

export function useCounter() {
  const context = useContext(CounterContext);
  if (!context) throw new Error("useCounter must be used within CounterProvider");
  return context;
}

// Usage
function CounterDisplay() {
  const [count] = useCounter();
  return <span>Count: {count()}</span>;
}

function CounterControls() {
  const [, { increment, decrement, reset }] = useCounter();
  return (
    <div>
      <button onClick={decrement}>-</button>
      <button onClick={increment}>+</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
}

function App() {
  return (
    <CounterProvider>
      <CounterDisplay />
      <CounterControls />
    </CounterProvider>
  );
}
```

---

## 2. Theme Provider (Context + Signal)

```tsx
import { createContext, useContext, createSignal, createMemo, ParentProps } from "solid-js";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: () => Theme;
  resolvedTheme: () => "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>();

export function ThemeProvider(props: ParentProps) {
  const [theme, setTheme] = createSignal<Theme>("system");

  const resolvedTheme = createMemo((): "light" | "dark" => {
    const t = theme();
    if (t !== "system") return t;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}

// Usage
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button onClick={() => setTheme(resolvedTheme() === "light" ? "dark" : "light")}>
      Current: {resolvedTheme()}
    </button>
  );
}
```

---

## 3. Global State with Store (App-Wide State)

```tsx
import { createContext, useContext, ParentProps } from "solid-js";
import { createStore } from "solid-js/store";

interface Todo {
  id: string;
  title: string;
  done: boolean;
}

interface AppState {
  todos: Todo[];
  filter: "all" | "active" | "done";
}

interface AppActions {
  addTodo: (title: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
  setFilter: (filter: AppState["filter"]) => void;
}

type AppContextValue = [state: AppState, actions: AppActions];

const AppContext = createContext<AppContextValue>();

export function AppProvider(props: ParentProps) {
  const [state, setState] = createStore<AppState>({
    todos: [],
    filter: "all",
  });

  const actions: AppActions = {
    addTodo: (title: string) => {
      setState("todos", (prev) => [
        ...prev,
        { id: crypto.randomUUID(), title, done: false },
      ]);
    },
    toggleTodo: (id: string) => {
      setState("todos", (todo) => todo.id === id, "done", (done) => !done);
    },
    removeTodo: (id: string) => {
      setState("todos", (prev) => prev.filter((t) => t.id !== id));
    },
    setFilter: (filter: AppState["filter"]) => {
      setState("filter", filter);
    },
  };

  return (
    <AppContext.Provider value={[state, actions]}>
      {props.children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
```

---

## 4. Derived State Examples

### Filtered List with Memo Chain

```tsx
import { createSignal, createMemo, For } from "solid-js";
import { createStore } from "solid-js/store";

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  inStock: boolean;
}

function ProductList() {
  const [products] = createStore<Product[]>([
    { id: "1", name: "Laptop", price: 999, category: "electronics", inStock: true },
    { id: "2", name: "Desk", price: 299, category: "furniture", inStock: true },
    { id: "3", name: "Mouse", price: 49, category: "electronics", inStock: false },
  ]);

  const [search, setSearch] = createSignal("");
  const [category, setCategory] = createSignal<string>("all");
  const [showInStockOnly, setShowInStockOnly] = createSignal(false);

  // Memo chain: each depends only on what it needs
  const filteredByCategory = createMemo(() => {
    const cat = category();
    return cat === "all" ? products : products.filter((p) => p.category === cat);
  });

  const filteredByStock = createMemo(() => {
    const items = filteredByCategory();
    return showInStockOnly() ? items.filter((p) => p.inStock) : items;
  });

  const filteredBySearch = createMemo(() => {
    const query = search().toLowerCase();
    if (!query) return filteredByStock();
    return filteredByStock().filter((p) =>
      p.name.toLowerCase().includes(query)
    );
  });

  const totalValue = createMemo(() =>
    filteredBySearch().reduce((sum, p) => sum + p.price, 0)
  );

  return (
    <div>
      <input
        placeholder="Search..."
        value={search()}
        onInput={(e) => setSearch(e.currentTarget.value)}
      />
      <label>
        <input
          type="checkbox"
          checked={showInStockOnly()}
          onChange={(e) => setShowInStockOnly(e.currentTarget.checked)}
        />
        In stock only
      </label>
      <p>Showing {filteredBySearch().length} items (total: ${totalValue()})</p>
      <For each={filteredBySearch()}>
        {(product) => (
          <div>
            {product.name} - ${product.price}
            {!product.inStock && " (Out of stock)"}
          </div>
        )}
      </For>
    </div>
  );
}
```

### Derived Signals (No Memo Needed for Simple Cases)

```tsx
// For trivial derivations used only in JSX, inline expressions work fine.
// createMemo is ONLY needed when:
// 1. The computation is expensive
// 2. Multiple consumers read the same derived value
// 3. You need to prevent downstream re-computation

const [firstName, setFirstName] = createSignal("John");
const [lastName, setLastName] = createSignal("Doe");

// Simple: inline in JSX (fine for one-off display)
<span>{firstName()} {lastName()}</span>

// Better when used in multiple places: createMemo
const fullName = createMemo(() => `${firstName()} ${lastName()}`);
<h1>{fullName()}</h1>
<title>{fullName()}'s Profile</title>
```

---

## 5. Form Management with Validation

### Multi-Step Form with Store

```tsx
import { createStore } from "solid-js/store";
import { createSignal, Show, Switch, Match } from "solid-js";

interface RegistrationForm {
  step1: { name: string; email: string };
  step2: { company: string; role: string };
  step3: { agree: boolean };
}

function RegistrationWizard() {
  const [step, setStep] = createSignal(1);
  const [form, setForm] = createStore<RegistrationForm>({
    step1: { name: "", email: "" },
    step2: { company: "", role: "" },
    step3: { agree: false },
  });

  const canProceed = (): boolean => {
    switch (step()) {
      case 1: return form.step1.name.length > 0 && form.step1.email.includes("@");
      case 2: return form.step2.company.length > 0;
      case 3: return form.step3.agree;
      default: return false;
    }
  };

  return (
    <div>
      <Switch>
        <Match when={step() === 1}>
          <input
            placeholder="Name"
            value={form.step1.name}
            onInput={(e) => setForm("step1", "name", e.currentTarget.value)}
          />
          <input
            placeholder="Email"
            value={form.step1.email}
            onInput={(e) => setForm("step1", "email", e.currentTarget.value)}
          />
        </Match>
        <Match when={step() === 2}>
          <input
            placeholder="Company"
            value={form.step2.company}
            onInput={(e) => setForm("step2", "company", e.currentTarget.value)}
          />
          <input
            placeholder="Role"
            value={form.step2.role}
            onInput={(e) => setForm("step2", "role", e.currentTarget.value)}
          />
        </Match>
        <Match when={step() === 3}>
          <label>
            <input
              type="checkbox"
              checked={form.step3.agree}
              onChange={(e) => setForm("step3", "agree", e.currentTarget.checked)}
            />
            I agree to the terms
          </label>
        </Match>
      </Switch>

      <div>
        <Show when={step() > 1}>
          <button onClick={() => setStep((s) => s - 1)}>Back</button>
        </Show>
        <Show when={step() < 3}>
          <button disabled={!canProceed()} onClick={() => setStep((s) => s + 1)}>
            Next
          </button>
        </Show>
        <Show when={step() === 3}>
          <button disabled={!canProceed()} onClick={() => submitForm(form)}>
            Submit
          </button>
        </Show>
      </div>
    </div>
  );
}
```

---

## 6. External State Integration

### from() with RxJS Observable

```tsx
import { from, createEffect } from "solid-js";
import { interval, map } from "rxjs";

function Clock() {
  // Bridge RxJS into SolidJS reactivity
  const seconds = from(
    interval(1000).pipe(map(() => new Date().toLocaleTimeString()))
  );

  return <div>Time: {seconds() ?? "Loading..."}</div>;
}
```

### from() with Custom WebSocket

```tsx
import { from } from "solid-js";

function useWebSocket<T>(url: string) {
  return from<T>((set) => {
    const ws = new WebSocket(url);
    ws.onmessage = (event) => set(JSON.parse(event.data));
    return () => ws.close();
  });
}

function LiveDashboard() {
  const data = useWebSocket<{ users: number; sales: number }>("wss://api.example.com/live");

  return (
    <div>
      <p>Online users: {data()?.users ?? 0}</p>
      <p>Sales today: {data()?.sales ?? 0}</p>
    </div>
  );
}
```

### reconcile() for API Polling

```tsx
import { createStore, reconcile } from "solid-js/store";
import { onCleanup } from "solid-js";

function NotificationList() {
  const [state, setState] = createStore<{ notifications: Notification[] }>({
    notifications: [],
  });

  const poll = setInterval(async () => {
    const fresh = await fetch("/api/notifications").then((r) => r.json());
    // reconcile diffs by "id" — only changed items trigger DOM updates
    setState("notifications", reconcile(fresh, { key: "id" }));
  }, 5000);

  onCleanup(() => clearInterval(poll));

  return (
    <For each={state.notifications}>
      {(n) => <div class={n.read ? "read" : "unread"}>{n.message}</div>}
    </For>
  );
}
```
