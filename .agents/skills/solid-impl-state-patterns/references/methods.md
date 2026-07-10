# State Pattern Method Signatures

## Context + Store Pattern

### createContext

```typescript
import { createContext } from "solid-js";

function createContext<T>(defaultValue?: T): Context<T>;

interface Context<T> {
  id: symbol;
  Provider: (props: { value: T; children: JSX.Element }) => JSX.Element;
  defaultValue: T | undefined;
}
```

**Parameters:**
- `defaultValue` — Optional fallback when no Provider is found in the tree. ALWAYS omit this and enforce Provider usage with a custom hook that throws on missing context.

### useContext

```typescript
import { useContext } from "solid-js";

function useContext<T>(context: Context<T>): T;
```

**Returns:** The value from the nearest Provider ancestor, or the defaultValue.

### createStore

```typescript
import { createStore } from "solid-js/store";

function createStore<T extends StoreNode>(
  state: T | Store<T>
): [get: Store<T>, set: SetStoreFunction<T>];
```

**Store getter:** Proxy-based, tracks at property level. Access `store.prop` directly (no function call).

**Store setter — Path syntax:**

```typescript
// Direct property
setStore("key", value);

// Nested property
setStore("user", "name", "John");

// Array index
setStore("items", 0, "done", true);

// Functional update
setStore("count", (prev) => prev + 1);

// Filter-based array update
setStore("items", (item) => item.done, "archived", true);

// Range update
setStore("items", { from: 0, to: 5 }, "visible", true);
```

---

## Derived State Pattern

### createMemo

```typescript
import { createMemo } from "solid-js";

function createMemo<T>(
  fn: (v: T) => T,
  value?: T,
  options?: {
    equals?: false | ((prev: T, next: T) => boolean);
    name?: string;
  }
): () => T;
```

**Parameters:**
- `fn` — Pure computation function. Receives previous return value. MUST NOT contain side effects.
- `value` — Optional initial value passed to `fn` on first execution.
- `options.equals` — Custom equality. Default: `===`. Set `false` to always propagate.

**Returns:** Read-only accessor function `() => T`. IS a reactive source — can be tracked by effects and other memos.

**Caching behavior:**
- Recalculates ONLY when tracked dependencies change
- If result equals previous (per `equals`), downstream dependents are NOT notified
- Multiple reads without dependency changes return cached value

### Memo Chaining Pattern

```typescript
// Dependencies form a DAG (directed acyclic graph)
const base = createMemo(() => expensiveComputation(source()));
const derived = createMemo(() => transform(base()));
const final = createMemo(() => format(derived(), locale()));

// base recalculates only when source changes
// derived recalculates only when base changes
// final recalculates when derived OR locale changes
```

---

## Form State Pattern

### Store-Based Form Signature

```typescript
interface FormPattern<T> {
  state: Store<T>;
  setState: SetStoreFunction<T>;
  errors: Store<Partial<Record<keyof T, string>>>;
  setErrors: SetStoreFunction<Partial<Record<keyof T, string>>>;
}
```

### Input Binding Pattern

```typescript
// Text input — use onInput for immediate updates
<input
  value={form.fieldName}
  onInput={(e) => setForm("fieldName", e.currentTarget.value)}
/>

// Checkbox — use onChange
<input
  type="checkbox"
  checked={form.active}
  onChange={(e) => setForm("active", e.currentTarget.checked)}
/>

// Select — use onChange
<select
  value={form.role}
  onChange={(e) => setForm("role", e.currentTarget.value)}
>
  <option value="admin">Admin</option>
  <option value="user">User</option>
</select>

// Number input — parse value
<input
  type="number"
  value={form.quantity}
  onInput={(e) => setForm("quantity", parseInt(e.currentTarget.value, 10) || 0)}
/>
```

**ALWAYS use `onInput` for text fields** — fires on every keystroke. `onChange` fires on blur in some browsers.

**ALWAYS use `e.currentTarget.value`** — `e.target` may reference a child element.

---

## splitProps

```typescript
import { splitProps } from "solid-js";

function splitProps<T extends object, K extends (keyof T)[]>(
  props: T,
  ...keys: K
): [Pick<T, K[number]>, Omit<T, K[number]>];
```

Splits a props object into multiple groups while preserving reactivity. ALWAYS use instead of destructuring.

**Multiple splits:**

```typescript
const [local, style, others] = splitProps(props, ["onClick", "children"], ["class", "style"]);
```

---

## mergeProps

```typescript
import { mergeProps } from "solid-js";

function mergeProps<T extends object[]>(...sources: T): MergeProps<T>;
```

Merges multiple props objects reactively. Later sources override earlier ones. ALWAYS use for default props.

```typescript
const merged = mergeProps({ variant: "primary", size: "md" }, props);
// merged.variant is props.variant if provided, otherwise "primary"
```

---

## from() — External State Bridge

```typescript
import { from } from "solid-js";

// Observable form (RxJS, etc.)
function from<T>(observable: {
  subscribe: (fn: (v: T) => void) => (() => void) | { unsubscribe: () => void };
}): () => T | undefined;

// Producer form (custom subscriptions)
function from<T>(
  producer: (setter: (v: T) => T) => () => void
): () => T | undefined;
```

**Returns:** A read-only signal accessor. Cleanup runs automatically when the owning scope disposes.

---

## reconcile() — External Data Sync

```typescript
import { reconcile } from "solid-js/store";

function reconcile<T>(
  value: T | Store<T>,
  options?: {
    key?: string | null;  // Default: "id"
    merge?: boolean;       // Default: false
  }
): (state: Store<T>) => Store<T>;
```

**Parameters:**
- `key` — Property to match array items. Default `"id"`. Set `null` for index-based matching.
- `merge` — When `true`, diffs at leaf level. When `false`, replaces non-equal references.

**ALWAYS use reconcile** when syncing external data (API responses, WebSocket messages) into stores to minimize DOM updates.
