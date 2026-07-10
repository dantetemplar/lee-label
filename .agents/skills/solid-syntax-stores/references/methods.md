# Store API Signatures

## createStore

```typescript
import { createStore } from "solid-js/store";

function createStore<T extends StoreNode>(
  state: T | Store<T>
): [get: Store<T>, set: SetStoreFunction<T>];

type Store<T> = T; // Reactive proxy — conceptually readonly at the type level
```

**Parameters:**
- `state: T` — Initial state object. MUST be a plain object or array. Primitives are NOT valid store roots.

**Returns:**
- `[Store<T>, SetStoreFunction<T>]` — A reactive proxy (read) and a path-syntax setter (write).

**Behavior:**
- Wraps the state object in a JavaScript Proxy
- Creates reactive signals **lazily** — only when a property is first accessed in a tracking scope
- Nested objects and arrays are automatically wrapped in proxies on access
- Top-level arrays are supported (since SolidJS 1.5+)

---

## SetStoreFunction (setStore)

The setter returned by `createStore` accepts a variable number of path segments followed by a value or updater function.

```typescript
type SetStoreFunction<T> = (...args: StoreSetter<T>) => void;
```

### Path Segment Types

| Segment Type | Syntax | Matches |
|-------------|--------|---------|
| String key | `"propertyName"` | Named property on current object |
| Number index | `0`, `1`, `store.items.length` | Array index |
| Array of indices | `[0, 2, 4]` | Multiple specific indices |
| Range object | `{ from: number, to: number, by?: number }` | Index range (inclusive from, exclusive to) |
| Filter function | `(item, index) => boolean` | All items matching predicate |
| Updater function (final) | `(prev) => next` | Functional update on the resolved value |
| Object (final) | `{ key: value }` | Shallow merge with existing object |

### Signature Patterns

```typescript
// Direct value assignment
setStore("key", newValue): void;

// Nested path
setStore("a", "b", "c", newValue): void;

// Array index
setStore("items", 0, "done", true): void;

// Functional update
setStore("count", (prev: number) => prev + 1): void;

// Multiple indices
setStore("items", [0, 2, 4], "done", true): void;

// Range
setStore("items", { from: 0, to: 5 }, "done", true): void;
setStore("items", { from: 0, to: 10, by: 2 }, "done", true): void;

// Filter predicate
setStore("items", (item) => item.active, "visible", true): void;

// Object merge (final segment is an object)
setStore("user", { lastName: "Doe" }): void; // Shallow merge

// Root-level functional update
setStore((state) => ({ ...state, newProp: "value" })): void;

// Append to array
setStore("items", store.items.length, newItem): void;
```

### Object Merge Rules

When the final value in a path is a **plain object**, `setStore` performs a **shallow merge**:
- Existing properties NOT in the new object are preserved
- Properties in the new object overwrite existing ones
- New properties are added

```typescript
// Before: { user: { firstName: "John", lastName: "Smith", age: 30 } }
setStore("user", { lastName: "Doe" });
// After:  { user: { firstName: "John", lastName: "Doe", age: 30 } }
```

### Property Deletion

Set a property to `undefined` to remove it. In TypeScript, use the non-null assertion operator:

```typescript
setStore("optionalProp", undefined!);
```

---

## produce

```typescript
import { produce } from "solid-js/store";

function produce<T>(
  fn: (state: T) => void
): (
  state: T extends NotWrappable ? T : Store<T>
) => T extends NotWrappable ? T : Store<T>;
```

**Parameters:**
- `fn: (state: T) => void` — A mutation function that receives a draft proxy. Mutate the draft directly using standard JavaScript operations (property assignment, array push/splice/etc.).

**Returns:**
- A function compatible with `setStore` that applies the mutations reactively.

**Behavior:**
- Wraps mutations in a proxy that tracks changes
- Changes are applied as reactive store updates
- Compatible with path syntax — can be used as the final argument
- Works with objects and arrays ONLY — NEVER with Sets or Maps

```typescript
// Standalone usage
setState(produce((s) => {
  s.count++;
  s.items.push(newItem);
  s.items.splice(2, 1);
}));

// Combined with path syntax
setStore("users", 0, produce((user) => {
  user.name = "Updated";
  user.loginCount++;
}));
```

---

## reconcile

```typescript
import { reconcile } from "solid-js/store";

function reconcile<T>(
  value: T | Store<T>,
  options?: {
    key?: string | null;  // Default: "id"
    merge?: boolean;       // Default: false
  }
): (
  state: T extends NotWrappable ? T : Store<T>
) => T extends NotWrappable ? T : Store<T>;
```

**Parameters:**
- `value: T` — The new data to reconcile against the existing store.
- `options.key` (default: `"id"`) — Property name used to match array items between old and new data. Set to `null` to match by index.
- `options.merge`:
  - `false` (default) — Uses referential equality checks. Non-equal items are replaced entirely.
  - `true` — Morphs previous data to match new data, pushing diffing down to leaf-level properties. Preserves more fine-grained reactivity.

**Returns:**
- A function compatible with `setStore` that diffs and applies minimal updates.

**Use cases:**
- Syncing API response data into existing stores
- External subscription updates (WebSocket, SSE)
- Replacing store branches while preserving unchanged reactive subscriptions

```typescript
// API sync with default "id" key matching
setStore("todos", reconcile(apiResponse.todos));

// Custom key
setStore("users", reconcile(newUsers, { key: "email" }));

// Index-based matching (no key)
setStore("items", reconcile(newItems, { key: null }));

// Deep merge to leaf level
setStore("data", reconcile(newData, { merge: true }));
```

---

## unwrap

```typescript
import { unwrap } from "solid-js/store";

function unwrap<T>(store: Store<T>): T;
```

**Parameters:**
- `store: Store<T>` — A reactive store proxy.

**Returns:**
- `T` — The underlying plain JavaScript object, stripped of all reactive proxies.

**Behavior:**
- Recursively removes proxy wrappers from the store and all nested objects
- The returned object is NOT reactive — changes to it do NOT trigger updates
- Useful for serialization, passing to non-SolidJS libraries, debugging

```typescript
const [store, setStore] = createStore({ items: [1, 2, 3] });
const plain = unwrap(store);

JSON.stringify(plain);              // Safe — no proxy interference
structuredClone(plain);             // Safe — plain object
externalLibrary.process(plain);     // Safe — no reactive behavior
```

---

## createMutable

```typescript
import { createMutable } from "solid-js/store";

function createMutable<T extends StoreNode>(
  state: T | Store<T>
): Store<T>;
```

**Parameters:**
- `state: T` — Initial state object.

**Returns:**
- `Store<T>` — A reactive proxy that supports direct mutation.

**Behavior:**
- Unlike `createStore`, returns a SINGLE object (no separate setter)
- Supports direct property assignment, array methods (push, splice, etc.)
- Supports computed getters and setters via `get`/`set` syntax
- Changes propagate reactively, same fine-grained tracking as `createStore`
- Breaks unidirectional data flow — use sparingly

```typescript
const state = createMutable({
  count: 0,
  items: [] as string[],
  get double() { return this.count * 2; },
});

// Direct mutation — all reactive
state.count = 5;
state.items.push("new item");
state.items.splice(0, 1);
```

**When to use createMutable:**
- Migrating from MobX or Vue reactive state
- Wrapping mutable third-party library state
- Prototyping (switch to createStore for production)

**NEVER use createMutable as default.** ALWAYS prefer `createStore` + `setStore` for predictable unidirectional data flow.
