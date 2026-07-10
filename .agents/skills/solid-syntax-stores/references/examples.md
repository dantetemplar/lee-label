# Store Patterns and Examples

## Pattern 1: Todo List with Nested Updates

A complete todo list demonstrating createStore, path syntax, produce, and reconcile.

```typescript
import { createStore, produce, reconcile } from "solid-js/store";
import { createSignal, createMemo, For } from "solid-js";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

function TodoApp() {
  const [store, setStore] = createStore({
    todos: [] as Todo[],
    filter: "all" as "all" | "active" | "done",
    nextId: 1,
  });

  // Add a todo — append via index
  const addTodo = (text: string) => {
    setStore("todos", store.todos.length, {
      id: store.nextId,
      text,
      done: false,
    });
    setStore("nextId", (prev) => prev + 1);
  };

  // Toggle single todo — path syntax with index
  const toggleTodo = (id: number) => {
    setStore("todos", (todo) => todo.id === id, "done", (prev) => !prev);
  };

  // Toggle all todos — filter predicate
  const toggleAll = (done: boolean) => {
    setStore("todos", () => true, "done", done);
  };

  // Remove todo — produce with splice
  const removeTodo = (id: number) => {
    setStore(
      produce((s) => {
        const index = s.todos.findIndex((t) => t.id === id);
        if (index !== -1) s.todos.splice(index, 1);
      })
    );
  };

  // Update todo text — path syntax with filter
  const updateText = (id: number, text: string) => {
    setStore("todos", (todo) => todo.id === id, "text", text);
  };

  // Filtered view — createMemo for derived data
  const filteredTodos = createMemo(() => {
    switch (store.filter) {
      case "active": return store.todos.filter((t) => !t.done);
      case "done": return store.todos.filter((t) => t.done);
      default: return store.todos;
    }
  });

  return (
    <div>
      <For each={filteredTodos()}>
        {(todo) => (
          <div>
            {/* Access store properties in JSX — fine-grained tracking */}
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => toggleTodo(todo.id)}
            />
            <span>{todo.text}</span>
            <button onClick={() => removeTodo(todo.id)}>Delete</button>
          </div>
        )}
      </For>
    </div>
  );
}
```

---

## Pattern 2: Form State Management

Multi-field form using store with path syntax updates.

```typescript
import { createStore } from "solid-js/store";

interface FormData {
  personal: {
    firstName: string;
    lastName: string;
    email: string;
  };
  address: {
    street: string;
    city: string;
    country: string;
  };
  preferences: {
    newsletter: boolean;
    theme: "light" | "dark";
  };
}

function RegistrationForm() {
  const [form, setForm] = createStore<FormData>({
    personal: { firstName: "", lastName: "", email: "" },
    address: { street: "", city: "", country: "" },
    preferences: { newsletter: false, theme: "light" },
  });

  // Generic field updater using path syntax
  const updateField = <K extends keyof FormData>(
    section: K,
    field: keyof FormData[K],
    value: FormData[K][typeof field]
  ) => {
    setForm(section, field as string, value);
  };

  // Reset a section — object merge replaces all properties
  const resetSection = (section: keyof FormData) => {
    const defaults: FormData = {
      personal: { firstName: "", lastName: "", email: "" },
      address: { street: "", city: "", country: "" },
      preferences: { newsletter: false, theme: "light" },
    };
    setForm(section, defaults[section]);
  };

  return (
    <form>
      <input
        value={form.personal.firstName}
        onInput={(e) => updateField("personal", "firstName", e.currentTarget.value)}
      />
      <input
        value={form.personal.lastName}
        onInput={(e) => updateField("personal", "lastName", e.currentTarget.value)}
      />
      <input
        value={form.address.city}
        onInput={(e) => updateField("address", "city", e.currentTarget.value)}
      />
      <label>
        <input
          type="checkbox"
          checked={form.preferences.newsletter}
          onChange={(e) => updateField("preferences", "newsletter", e.currentTarget.checked)}
        />
        Subscribe to newsletter
      </label>
    </form>
  );
}
```

---

## Pattern 3: API Data Synchronization with reconcile

```typescript
import { createStore, reconcile } from "solid-js/store";
import { createEffect, onCleanup } from "solid-js";

interface User {
  id: number;
  name: string;
  status: "online" | "offline";
  lastSeen: string;
}

function UserDashboard() {
  const [store, setStore] = createStore({
    users: [] as User[],
    lastSync: "",
  });

  // Initial fetch — reconcile diffs against empty store
  const fetchUsers = async () => {
    const response = await fetch("/api/users");
    const users: User[] = await response.json();
    setStore("users", reconcile(users)); // key defaults to "id"
    setStore("lastSync", new Date().toISOString());
  };

  // Polling with reconcile — only changed users trigger updates
  createEffect(() => {
    const interval = setInterval(async () => {
      const response = await fetch("/api/users");
      const users: User[] = await response.json();
      // reconcile matches by "id", only updates changed properties
      setStore("users", reconcile(users));
    }, 5000);
    onCleanup(() => clearInterval(interval));
  });

  // WebSocket real-time updates
  createEffect(() => {
    const ws = new WebSocket("wss://api.example.com/users");
    ws.onmessage = (event) => {
      const updatedUsers: User[] = JSON.parse(event.data);
      setStore("users", reconcile(updatedUsers));
    };
    onCleanup(() => ws.close());
  });

  // Custom key matching
  const syncByEmail = (users: User[]) => {
    setStore("users", reconcile(users, { key: "email" }));
  };

  // Deep merge — push diffing to leaf properties
  const deepSync = (users: User[]) => {
    setStore("users", reconcile(users, { merge: true }));
  };
}
```

---

## Pattern 4: Computed Getters in Stores

```typescript
import { createStore } from "solid-js/store";

interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

function ShoppingCart() {
  const [cart, setCart] = createStore({
    items: [] as CartItem[],
    taxRate: 0.21,
    get subtotal() {
      return this.items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );
    },
    get tax() {
      return this.subtotal * this.taxRate;
    },
    get total() {
      return this.subtotal + this.tax;
    },
  });

  const addItem = (item: Omit<CartItem, "quantity">) => {
    const existing = cart.items.findIndex((i) => i.id === item.id);
    if (existing !== -1) {
      setCart("items", existing, "quantity", (q) => q + 1);
    } else {
      setCart("items", cart.items.length, { ...item, quantity: 1 });
    }
  };

  const updateQuantity = (id: number, quantity: number) => {
    setCart("items", (item) => item.id === id, "quantity", quantity);
  };

  return (
    <div>
      <For each={cart.items}>
        {(item) => (
          <div>
            <span>{item.name} x {item.quantity}</span>
            <span>${(item.price * item.quantity).toFixed(2)}</span>
          </div>
        )}
      </For>
      {/* Computed getters update reactively */}
      <div>Subtotal: ${cart.subtotal.toFixed(2)}</div>
      <div>Tax: ${cart.tax.toFixed(2)}</div>
      <div>Total: ${cart.total.toFixed(2)}</div>
    </div>
  );
}
```

---

## Pattern 5: Batch Updates with produce

Multiple mutations in a single reactive transaction.

```typescript
import { createStore, produce } from "solid-js/store";

interface AppState {
  user: { name: string; score: number; level: number };
  achievements: string[];
  stats: { gamesPlayed: number; wins: number };
}

function GameApp() {
  const [state, setState] = createStore<AppState>({
    user: { name: "Player1", score: 0, level: 1 },
    achievements: [],
    stats: { gamesPlayed: 0, wins: 0 },
  });

  // Multiple related updates in a single produce call
  const completeLevel = () => {
    setState(
      produce((s) => {
        s.user.score += 100;
        s.user.level += 1;
        s.stats.gamesPlayed += 1;
        s.stats.wins += 1;
        if (s.user.level === 10) {
          s.achievements.push("Level 10 reached!");
        }
      })
    );
  };

  // Scoped produce — only affects the user branch
  const resetScore = () => {
    setState("user", produce((u) => {
      u.score = 0;
      u.level = 1;
    }));
  };
}
```

---

## Pattern 6: Array Operations Reference

Common array operations using setStore path syntax and produce.

```typescript
import { createStore, produce } from "solid-js/store";

const [store, setStore] = createStore({
  items: [
    { id: 1, name: "Alpha", active: true },
    { id: 2, name: "Beta", active: false },
    { id: 3, name: "Gamma", active: true },
  ],
});

// Append item
setStore("items", store.items.length, { id: 4, name: "Delta", active: true });

// Update item at index
setStore("items", 0, "name", "Alpha Updated");

// Update item by filter
setStore("items", (item) => item.id === 2, "active", true);

// Update multiple items by indices
setStore("items", [0, 2], "active", false);

// Update range of items
setStore("items", { from: 0, to: 2 }, "active", false);

// Remove item (use produce for splice)
setStore(produce((s) => {
  s.items.splice(1, 1); // Remove index 1
}));

// Insert at position (use produce)
setStore(produce((s) => {
  s.items.splice(1, 0, { id: 5, name: "Epsilon", active: true });
}));

// Reorder / sort (use produce)
setStore(produce((s) => {
  s.items.sort((a, b) => a.name.localeCompare(b.name));
}));

// Clear array
setStore("items", []);
```

---

## Pattern 7: unwrap for Serialization and Interop

```typescript
import { createStore, unwrap } from "solid-js/store";

const [store, setStore] = createStore({
  settings: { theme: "dark", fontSize: 14 },
  data: [1, 2, 3],
});

// Serialize to JSON — ALWAYS unwrap first
const saveToStorage = () => {
  const plain = unwrap(store);
  localStorage.setItem("appState", JSON.stringify(plain));
};

// Pass to third-party library — ALWAYS unwrap first
const exportToLibrary = () => {
  const plain = unwrap(store);
  externalChartLib.setData(plain.data); // No proxy interference
};

// Restore from storage
const loadFromStorage = () => {
  const saved = localStorage.getItem("appState");
  if (saved) {
    const parsed = JSON.parse(saved);
    setStore("settings", parsed.settings);
    setStore("data", parsed.data);
  }
};

// Snapshot for comparison (non-reactive copy)
const takeSnapshot = () => {
  return structuredClone(unwrap(store));
};
```

---

## Pattern 8: createMutable with Computed Properties

```typescript
import { createMutable } from "solid-js/store";

const formState = createMutable({
  firstName: "",
  lastName: "",
  email: "",

  get fullName() {
    return `${this.firstName} ${this.lastName}`.trim();
  },

  set fullName(value: string) {
    const [first, ...rest] = value.split(" ");
    this.firstName = first;
    this.lastName = rest.join(" ");
  },

  get isValid() {
    return (
      this.firstName.length > 0 &&
      this.lastName.length > 0 &&
      this.email.includes("@")
    );
  },
});

// Direct mutation — all reactive
formState.firstName = "John";
formState.fullName = "Jane Doe"; // Triggers setter, updates both names
console.log(formState.isValid);  // Computed getter, tracked reactively
```
