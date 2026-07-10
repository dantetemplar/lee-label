# Store Anti-Patterns

## Anti-Pattern 1: Destructuring Store Properties

Destructuring a store reads property values at that moment and creates static snapshots. The resulting variables are NOT reactive — they NEVER update.

```typescript
// WRONG — Destructuring kills reactivity
const { name, email } = store.user;
return (
  <div>
    <span>{name}</span>   {/* Static snapshot — NEVER updates */}
    <span>{email}</span>  {/* Static snapshot — NEVER updates */}
  </div>
);

// CORRECT — Access store properties directly in JSX
return (
  <div>
    <span>{store.user.name}</span>   {/* Tracked via proxy — updates reactively */}
    <span>{store.user.email}</span>  {/* Tracked via proxy — updates reactively */}
  </div>
);
```

**Why:** Store reactivity works through the Proxy `get` trap. When you destructure, you invoke the `get` trap once (outside any JSX tracking scope) and store the plain value in a local variable. The proxy is no longer involved.

**Also applies to:**
- Array destructuring: `const [first, second] = store.items;` — static snapshots
- Nested destructuring: `const { user: { name } } = store;` — static snapshot
- Extracting in event handlers for later use: `const val = store.x;` — snapshot at handler creation time

---

## Anti-Pattern 2: Spread/Replace Entire State (React Pattern)

React's immutable update pattern (spread + replace) defeats SolidJS fine-grained reactivity. Every subscriber re-runs even if their specific property did not change.

```typescript
// WRONG — React immutable spread pattern
setStore({ ...store, name: "Jane" });
// Every component reading ANY store property re-renders

// WRONG — Nested spread
setStore({
  ...store,
  user: { ...store.user, name: "Jane" },
});
// Replaces user object — all user.* subscribers re-run

// CORRECT — Path syntax for surgical update
setStore("user", "name", "Jane");
// Only subscribers of user.name update

// CORRECT — Object merge for multiple properties
setStore("user", { name: "Jane", age: 31 });
// Only name and age subscribers update — other user.* properties untouched
```

**Why:** Spreading creates a new object reference. SolidJS sees the entire branch as replaced and notifies all subscribers of every property within that branch. Path syntax targets only the specific property, preserving references to unchanged branches.

---

## Anti-Pattern 3: Direct Mutation Without createMutable

Directly assigning properties on a `createStore` proxy does NOT trigger reactive updates. The proxy returned by `createStore` is conceptually **readonly** — mutations must go through `setStore`.

```typescript
// WRONG — Direct mutation on createStore proxy
const [store, setStore] = createStore({ count: 0, items: [] });

store.count = 5;             // Silently fails — no update
store.items.push("item");    // Silently fails — no update
store.items[0] = "new";      // Silently fails — no update

// CORRECT — Use setStore
setStore("count", 5);
setStore("items", store.items.length, "item");
setStore("items", 0, "new");

// CORRECT — Use produce for complex mutations
setStore(produce((s) => {
  s.count = 5;
  s.items.push("item");
}));
```

**Exception:** `createMutable` DOES support direct mutation. If you need direct mutation syntax, use `createMutable` instead — but prefer `createStore` for most cases.

---

## Anti-Pattern 4: Using store.x() Instead of store.x

Store properties are accessed via property access (like regular objects), NOT via function calls (like signals). Confusing the two causes runtime errors.

```typescript
// WRONG — Treating store like signals
const [store, setStore] = createStore({ count: 0 });
return <span>{store.count()}</span>;
// TypeError: store.count is not a function

// CORRECT — Direct property access
return <span>{store.count}</span>;

// For comparison — signals DO use function calls
const [count, setCount] = createSignal(0);
return <span>{count()}</span>; // Signal getter IS a function
```

**Rule:** Signals use `signal()` (function call). Stores use `store.property` (property access). NEVER mix them.

---

## Anti-Pattern 5: Array Replace Instead of Surgical Update

Replacing entire arrays forces every list item to re-render, even unchanged ones.

```typescript
// WRONG — Map + replace pattern (from React)
setStore("items", store.items.map((item) =>
  item.id === targetId ? { ...item, done: true } : item
));
// Creates new array, replaces all items — everything re-renders

// CORRECT — Filter predicate targets only matching items
setStore("items", (item) => item.id === targetId, "done", true);
// Only the matching item's "done" subscription fires

// WRONG — Filter + spread for removal (from React)
setStore("items", store.items.filter((item) => item.id !== targetId));
// Creates new array — everything re-renders

// CORRECT — produce with splice
setStore(produce((s) => {
  const index = s.items.findIndex((item) => item.id === targetId);
  if (index !== -1) s.items.splice(index, 1);
}));
```

---

## Anti-Pattern 6: Extracting Store Values into Variables Outside Tracking Scopes

Reading store properties outside of JSX, effects, or memos creates static snapshots that NEVER update.

```typescript
// WRONG — Extracted outside tracking scope
function UserCard() {
  const name = store.user.name;      // Read once during component setup
  const items = store.items;          // Read once — reference to array at this moment

  return (
    <div>
      <h1>{name}</h1>                {/* Static — NEVER updates */}
      <span>{items.length}</span>    {/* Static — NEVER updates */}
    </div>
  );
}

// CORRECT — Access in tracking scope (JSX expressions)
function UserCard() {
  return (
    <div>
      <h1>{store.user.name}</h1>          {/* Tracked — updates reactively */}
      <span>{store.items.length}</span>   {/* Tracked — updates reactively */}
    </div>
  );
}

// ALSO CORRECT — Use createMemo for derived values
function UserCard() {
  const itemCount = createMemo(() => store.items.length);

  return (
    <div>
      <h1>{store.user.name}</h1>
      <span>{itemCount()}</span>    {/* Tracked via memo */}
    </div>
  );
}
```

---

## Anti-Pattern 7: Using produce with Sets and Maps

`produce` only works with plain objects and arrays. It does NOT support ES6 Sets and Maps.

```typescript
// WRONG — produce with Set
const [store, setStore] = createStore({ tags: new Set(["a", "b"]) });
setStore(produce((s) => {
  s.tags.add("c"); // Does NOT trigger reactive update
}));

// CORRECT — Use arrays instead of Sets in stores
const [store, setStore] = createStore({ tags: ["a", "b"] });
setStore(produce((s) => {
  if (!s.tags.includes("c")) s.tags.push("c"); // Works correctly
}));

// WRONG — produce with Map
const [store, setStore] = createStore({ lookup: new Map() });
setStore(produce((s) => {
  s.lookup.set("key", "value"); // Does NOT trigger reactive update
}));

// CORRECT — Use plain objects instead of Maps in stores
const [store, setStore] = createStore({ lookup: {} as Record<string, string> });
setStore("lookup", "key", "value"); // Path syntax works correctly
```

---

## Anti-Pattern 8: Forgetting to unwrap Before Serialization

Store proxies can cause unexpected behavior when passed to APIs that expect plain objects.

```typescript
// WRONG — Passing store proxy directly
const [store, setStore] = createStore({ data: [1, 2, 3] });
JSON.stringify(store);           // May work but proxy behavior is unpredictable
structuredClone(store);          // May throw — proxies are not cloneable
postMessage(store);              // Fails — cannot transfer proxy
fetch("/api", { body: store });  // Fails or sends unexpected data

// CORRECT — unwrap before passing to non-SolidJS code
import { unwrap } from "solid-js/store";
const plain = unwrap(store);
JSON.stringify(plain);           // Safe
structuredClone(plain);          // Safe
postMessage(plain);              // Safe
fetch("/api", { body: JSON.stringify(plain) }); // Safe
```

---

## Anti-Pattern 9: createMutable as Default Choice

Using `createMutable` everywhere breaks unidirectional data flow and makes state changes harder to trace.

```typescript
// WRONG — Using createMutable for everything
const state = createMutable({ count: 0, items: [] });

// Mutations can happen anywhere — hard to trace
function incrementCount() { state.count++; }
function addItem(item) { state.items.push(item); }
// Any function can mutate state directly — no clear data flow

// CORRECT — Use createStore with explicit setters
const [state, setState] = createStore({ count: 0, items: [] });

// All state changes go through setState — clear, traceable, predictable
function incrementCount() { setState("count", (c) => c + 1); }
function addItem(item) { setState("items", state.items.length, item); }
```

**When createMutable IS appropriate:**
- Migrating existing MobX or Vue reactive state code
- Wrapping a third-party library that expects mutable objects
- Quick prototyping (convert to createStore before production)

---

## Summary: Quick Dos and Don'ts

| DO | DON'T |
|----|-------|
| Access store properties in JSX: `{store.user.name}` | Destructure stores: `const { name } = store.user` |
| Use path syntax: `setStore("user", "name", "Jane")` | Spread/replace: `setStore({...store, name: "Jane"})` |
| Use `produce` for complex mutations | Mutate createStore directly: `store.x = 5` |
| Use `reconcile` for API data sync | Replace entire arrays from API responses |
| Use `unwrap` before serialization | Pass store proxies to non-SolidJS code |
| Use `createStore` as default | Use `createMutable` as default |
| Use property access for stores: `store.x` | Use function calls for stores: `store.x()` |
| Use arrays and objects in stores | Use Sets and Maps with `produce` |
