# API Signatures Reference (SolidJS JSX & Control Flow)

## Show

**Import**: `import { Show } from "solid-js";`

```typescript
interface ShowProps<T> {
  when: T | undefined | null | false;
  keyed?: boolean;
  fallback?: JSX.Element;
  children: JSX.Element | ((accessor: Accessor<T>) => JSX.Element);
}

function Show<T>(props: ShowProps<T>): JSX.Element;
```

### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `when` | `T \| undefined \| null \| false` | Yes | -- | Condition -- renders children when truthy |
| `keyed` | `boolean` | No | `false` | When true, re-renders on reference change (not just truthiness) |
| `fallback` | `JSX.Element` | No | `undefined` | Rendered when `when` is falsy |
| `children` | `JSX.Element \| (accessor: Accessor<T>) => JSX.Element` | Yes | -- | Content or render function with narrowed accessor |

### Behavior

- Without `keyed`: only truthiness changes trigger show/hide
- With `keyed`: reference changes trigger full re-render of children
- Render function children receive a narrowed `Accessor<T>` (guaranteed non-null)
- Render function children are wrapped with `untrack` -- signals accessed directly inside the callback do not create reactive dependencies

**Version**: Available since Solid 1.0. Stable across 1.x and 2.x.

---

## For

**Import**: `import { For } from "solid-js";`

```typescript
function For<T, U extends JSX.Element>(props: {
  each: readonly T[];
  fallback?: JSX.Element;
  children: (item: T, index: () => number) => U;
}): () => U[];
```

### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `each` | `readonly T[]` | Yes | -- | Array to iterate |
| `fallback` | `JSX.Element` | No | `undefined` | Shown when array is empty |
| `children` | `(item: T, index: () => number) => U` | Yes | -- | Render callback per item |

### Callback Signature

```typescript
(item: T, index: () => number) => JSX.Element
```

- `item` -- Direct value (T). NOT a signal. Stable reference for objects.
- `index` -- Signal (function). MUST call as `index()` to read current position.

### Keying Strategy

Keyed by **object reference**. When an item moves in the array, the DOM node moves with it (no re-creation). Adding/removing items only affects those specific DOM nodes.

**Version**: Available since Solid 1.0. Stable across 1.x and 2.x.

---

## Index

**Import**: `import { Index } from "solid-js";`

```typescript
function Index<T, U extends JSX.Element>(props: {
  each: readonly T[];
  fallback?: JSX.Element;
  children: (item: () => T, index: number) => U;
}): () => U[];
```

### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `each` | `readonly T[]` | Yes | -- | Array to iterate |
| `fallback` | `JSX.Element` | No | `undefined` | Shown when array is empty |
| `children` | `(item: () => T, index: number) => U` | Yes | -- | Render callback per index position |

### Callback Signature

```typescript
(item: () => T, index: number) => JSX.Element
```

- `item` -- Signal (function). MUST call as `item()` to read current value.
- `index` -- Direct number. NOT a signal. Stable position identifier.

### Keying Strategy

Keyed by **array index position**. When a value at an index changes, the item signal updates but the DOM node stays in place. Best for primitives where values change but positions are stable.

### For vs Index Callback Comparison

| Aspect | `<For>` | `<Index>` |
|--------|---------|-----------|
| `item` parameter | Direct value (T) | Signal (() => T) |
| `index` parameter | Signal (() => number) | Plain number |
| Keyed by | Object reference | Array index position |
| Best for | Objects, reorderable lists | Primitives, form inputs |

**Version**: Available since Solid 1.0. Stable across 1.x and 2.x.

---

## Switch

**Import**: `import { Switch } from "solid-js";`

```typescript
function Switch(props: {
  fallback?: JSX.Element;
  children: JSX.Element;
}): () => JSX.Element;
```

### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `fallback` | `JSX.Element` | No | `undefined` | Rendered when no `<Match>` condition is truthy |
| `children` | `JSX.Element` | Yes | -- | One or more `<Match>` components |

### Behavior

- Evaluates `<Match>` children **sequentially** -- first truthy `when` wins
- Only ONE `<Match>` renders at a time (mutual exclusivity)
- When no conditions match and no fallback is provided, renders nothing

---

## Match

**Import**: `import { Match } from "solid-js";`

```typescript
type MatchProps<T> = {
  when: T | undefined | null | false;
  children: JSX.Element | ((item: T) => JSX.Element);
};

function Match<T>(props: MatchProps<T>): JSX.Element;
```

### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `when` | `T \| undefined \| null \| false` | Yes | -- | Condition for this branch |
| `children` | `JSX.Element \| ((item: T) => JSX.Element)` | Yes | -- | Content or render function with narrowed value |

### Behavior

- MUST be a direct child of `<Switch>`
- Render function children receive the narrowed truthy value
- Only evaluated when preceding `<Match>` conditions are falsy

**Version**: Switch and Match available since Solid 1.0. Stable across 1.x and 2.x.

---

## Dynamic

**Import**: `import { Dynamic } from "solid-js/web";`

```typescript
function Dynamic<T>(props: T & {
  children?: any;
  component?: Component<T> | string | keyof JSX.IntrinsicElements;
}): () => JSX.Element;
```

### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `component` | `Component<T> \| string \| keyof JSX.IntrinsicElements` | Yes | -- | Component or HTML tag to render |
| `...rest` | `T` | No | -- | All additional props forwarded to rendered component |

### The `component` Prop Accepts

- Custom SolidJS components: `component={MyComponent}`
- HTML tag strings: `component={"div"}`, `component={"button"}`
- JSX intrinsic element keys: any valid HTML/SVG element name

### Behavior

- All additional props (beyond `component`) are forwarded to the rendered component or element
- When `component` changes, the previous component is torn down and a new one is created
- When `component` is `undefined` or `null`, nothing renders

**Version**: Available since Solid 1.0. Stable across 1.x and 2.x.

---

## Portal

**Import**: `import { Portal } from "solid-js/web";`

```typescript
function Portal(props: {
  mount?: Node;
  useShadow?: boolean;
  isSVG?: boolean;
  children: JSX.Element;
}): Text;
```

### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `mount` | `Node` | No | `document.body` | Target DOM node for portal content |
| `useShadow` | `boolean` | No | `false` | Enable Shadow DOM for style isolation |
| `isSVG` | `boolean` | No | `false` | Required when mounting into SVG elements |
| `children` | `JSX.Element` | Yes | -- | Content to render in portal |

### Behavior

- Inserts content into a `<div>` within the mount target (unless `isSVG` is true)
- Events propagate through the **component tree**, not the DOM tree
- Client-side only -- hydration is disabled for portals
- Shadow DOM (`useShadow`) encapsulates styles within the portal

**Version**: Available since Solid 1.0. Stable across 1.x and 2.x.

---

## Suspense

**Import**: `import { Suspense } from "solid-js";`

```typescript
function Suspense(props: {
  fallback?: JSX.Element;
  children: JSX.Element;
}): JSX.Element;
```

### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `fallback` | `JSX.Element` | No | `undefined` | Loading UI shown while resources resolve |
| `children` | `JSX.Element` | Yes | -- | Content shown after all resources resolve |

### Behavior

- Tracks ALL `createResource` calls within its boundary
- DOM nodes are created immediately but NOT attached to the document -- fallback shows instead
- When all resources resolve, children are attached and fallback is removed
- `onMount` and `createEffect` inside Suspense only run AFTER resources resolve
- Both branches (fallback + children) exist simultaneously in memory
- Nested Suspense boundaries resolve independently

### Related APIs

- `createResource` -- primary trigger for Suspense
- `SuspenseList` -- coordinates multiple Suspense boundaries (ordering)
- `ErrorBoundary` -- catches errors thrown by resources

**Version**: Available since Solid 1.0. Stable across 1.x and 2.x.
