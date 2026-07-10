# Anti-Patterns (SolidJS JSX & Control Flow)

## 1. Array.map for List Rendering

```typescript
// WRONG -- Array.map recreates ALL DOM nodes on every array change:
function TodoList(props: { todos: Todo[] }) {
  return (
    <ul>
      {props.todos.map((todo, i) => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  );
}

// CORRECT -- <For> tracks items by reference, only updates changed items:
function TodoList(props: { todos: Todo[] }) {
  return (
    <ul>
      <For each={props.todos}>
        {(todo, index) => <li>{todo.text}</li>}
      </For>
    </ul>
  );
}
```

**WHY**: `Array.map()` creates a new array of JSX elements every time the source array changes. SolidJS has no virtual DOM to diff -- it takes the new array literally and replaces all DOM nodes. `<For>` tracks items by object reference and only updates, adds, or removes the affected DOM nodes.

---

## 2. key Prop on List Items

```typescript
// WRONG -- key prop is meaningless in SolidJS, it is silently ignored:
<For each={items()}>
  {(item) => <div key={item.id}>{item.name}</div>}
</For>

// CORRECT -- <For> keys by object reference automatically, no key needed:
<For each={items()}>
  {(item) => <div>{item.name}</div>}
</For>
```

**WHY**: React uses the `key` prop to track list item identity during virtual DOM reconciliation. SolidJS `<For>` tracks items by object reference identity -- there is no reconciliation step. The `key` prop is passed as a regular HTML attribute to the DOM element, which is meaningless.

---

## 3. Ternary Operator for Conditional Rendering

```typescript
// WRONG -- ternary can cause unnecessary DOM destruction and recreation:
function Auth() {
  const [loggedIn, setLoggedIn] = createSignal(false);
  return (
    <div>
      {loggedIn() ? <Dashboard /> : <LoginForm />}
    </div>
  );
}

// CORRECT -- <Show> optimizes DOM lifecycle with fine-grained reactivity:
function Auth() {
  const [loggedIn, setLoggedIn] = createSignal(false);
  return (
    <div>
      <Show when={loggedIn()} fallback={<LoginForm />}>
        <Dashboard />
      </Show>
    </div>
  );
}
```

**WHY**: Ternaries create a reactive expression that returns different JSX elements. SolidJS replaces the entire subtree when the expression result changes. `<Show>` is a dedicated control flow component that manages DOM creation/disposal efficiently and provides type narrowing through render functions.

**Exception**: Simple inline ternaries for text or attributes are acceptable: `<span>{isActive() ? "Yes" : "No"}</span>`.

---

## 4. JavaScript switch/case in Component Body

```typescript
// WRONG -- component body runs ONCE, switch evaluates once and never updates:
function Router(props: { route: string }) {
  switch (props.route) {
    case "home": return <Home />;
    case "about": return <About />;
    default: return <NotFound />;
  }
}

// CORRECT -- <Switch>/<Match> are reactive and update when conditions change:
function Router(props: { route: string }) {
  return (
    <Switch fallback={<NotFound />}>
      <Match when={props.route === "home"}><Home /></Match>
      <Match when={props.route === "about"}><About /></Match>
    </Switch>
  );
}
```

**WHY**: SolidJS components execute their body exactly once. A JavaScript `switch` statement in the component body evaluates once during initialization and returns a fixed JSX element that never changes, even when `props.route` changes. `<Switch>/<Match>` components are reactive -- they re-evaluate conditions when their `when` props change.

---

## 5. Early Return for Conditional Rendering

```typescript
// WRONG -- component body runs ONCE, early return is permanent:
function Profile(props: { user: User | null }) {
  if (!props.user) return <p>Loading...</p>;
  return <div>{props.user.name}</div>;
}

// CORRECT -- <Show> reactively switches between states:
function Profile(props: { user: User | null }) {
  return (
    <Show when={props.user} fallback={<p>Loading...</p>}>
      {(user) => <div>{user().name}</div>}
    </Show>
  );
}
```

**WHY**: When the component runs once and `props.user` is initially null, the early return permanently renders `<p>Loading...</p>`. Even when `props.user` later becomes a User object, the component does not re-execute. `<Show>` creates a reactive boundary that switches its output when the condition changes.

---

## 6. if/else Chains in Component Body

```typescript
// WRONG -- evaluates once, never updates:
function StatusBadge(props: { status: string }) {
  if (props.status === "active") return <span class="green">Active</span>;
  if (props.status === "pending") return <span class="yellow">Pending</span>;
  return <span class="gray">Inactive</span>;
}

// CORRECT -- reactive control flow:
function StatusBadge(props: { status: string }) {
  return (
    <Switch fallback={<span class="gray">Inactive</span>}>
      <Match when={props.status === "active"}>
        <span class="green">Active</span>
      </Match>
      <Match when={props.status === "pending"}>
        <span class="yellow">Pending</span>
      </Match>
    </Switch>
  );
}
```

**WHY**: Same as early returns -- the component body runs once. `if/else` chains evaluate once and produce a fixed result. `<Switch>/<Match>` reactively monitors conditions.

---

## 7. Using For with Primitives (Instead of Index)

```typescript
// WRONG -- For with primitives causes full row re-creation on value changes:
const [names, setNames] = createSignal(["Alice", "Bob"]);

<For each={names()}>
  {(name) => <input value={name} />}
</For>

// CORRECT -- Index is designed for primitive arrays:
<Index each={names()}>
  {(name, i) => <input value={name()} />}
</Index>
```

**WHY**: `<For>` keys by object reference. Primitive values (strings, numbers) have no stable reference -- changing `"Alice"` to `"Alicia"` creates a new string, so `<For>` treats it as removing one item and adding another (full DOM recreation). `<Index>` keys by array position, so changing the value at index 0 just updates the signal -- the DOM input element stays in place.

---

## 8. Using Index with Objects that Reorder (Instead of For)

```typescript
// WRONG -- Index re-renders all shifted items when objects reorder:
const [items, setItems] = createSignal([
  { id: 1, name: "First" },
  { id: 2, name: "Second" },
]);

<Index each={items()}>
  {(item, i) => <ExpensiveCard data={item()} />}
</Index>

// CORRECT -- For moves DOM nodes with their items:
<For each={items()}>
  {(item) => <ExpensiveCard data={item} />}
</For>
```

**WHY**: When objects reorder, `<Index>` sees different values at each index position and updates every row's signal. `<For>` tracks by reference -- it detects the move and repositions the existing DOM nodes without re-rendering them.

---

## 9. Suspense vs Show for Async Data

```typescript
// WRONG -- Show destroys and recreates DOM on every loading cycle:
function DataView() {
  const [data] = createResource(fetchData);

  return (
    <Show when={data()} fallback={<Loading />}>
      {(d) => <DataDisplay data={d()} />}
    </Show>
  );
}

// CORRECT -- Suspense preserves DOM and delays attachment:
function DataView() {
  const [data] = createResource(fetchData);

  return (
    <Suspense fallback={<Loading />}>
      <DataDisplay data={data()!} />
    </Suspense>
  );
}
```

**WHY**: `<Show>` tears down its children when the condition becomes falsy and recreates them when truthy again. `<Suspense>` creates the DOM nodes immediately but delays their attachment until resources resolve -- this preserves component state and avoids flicker during loading transitions.

---

## 10. camelCase CSS Properties in Style Objects

```typescript
// WRONG -- React-style camelCase is NOT supported in SolidJS style objects:
<div style={{ fontSize: "1.2rem", backgroundColor: "red" }}>Text</div>

// CORRECT -- ALWAYS use kebab-case in SolidJS style objects:
<div style={{ "font-size": "1.2rem", "background-color": "red" }}>Text</div>
```

**WHY**: SolidJS sets CSS properties directly using `element.style.setProperty(name, value)`, which requires the standard CSS kebab-case property names. React transforms camelCase to kebab-case internally -- SolidJS does not.

---

## 11. Destructuring Props (Breaking Reactivity)

```typescript
// WRONG -- destructuring severs reactive connection:
function Greeting({ name }: { name: string }) {
  return <h1>Hello {name}</h1>;
}

// WRONG -- same problem, extracted once:
function Greeting(props: { name: string }) {
  const { name } = props;
  return <h1>Hello {name}</h1>;
}

// CORRECT -- access props directly:
function Greeting(props: { name: string }) {
  return <h1>Hello {props.name}</h1>;
}
```

**WHY**: SolidJS props are reactive getters on a proxy object. Destructuring extracts the current value at that moment and severs the reactive connection. The extracted value never updates. ALWAYS access props via `props.propName` to maintain reactivity.

---

## Decision Quick Reference

| What You Want | NEVER Use | ALWAYS Use |
|---------------|-----------|------------|
| Render a list of objects | `Array.map()` | `<For each={...}>` |
| Render a list of primitives | `<For>` with primitives | `<Index each={...}>` |
| Conditional show/hide | Ternary `? :` for complex cases | `<Show when={...}>` |
| Multi-branch conditions | `switch/case`, `if/else` chains | `<Switch>/<Match>` |
| Dynamic component selection | Manual `if` checks | `<Dynamic component={...}>` |
| Async data loading UI | `<Show when={resource()}>` | `<Suspense fallback={...}>` |
| List item identity | `key={id}` prop | Nothing -- `<For>` keys by reference |
| CSS in style objects | camelCase (`fontSize`) | kebab-case (`"font-size"`) |
| Access prop values | Destructuring `{ name }` | Direct access `props.name` |
