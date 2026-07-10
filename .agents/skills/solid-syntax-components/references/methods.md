# solid-syntax-components — Methods Reference

## Component Type Definitions

All types are imported from `solid-js`:

```typescript
import type { Component, ParentComponent, VoidComponent, FlowComponent } from "solid-js";
```

### Component\<P\>

```typescript
type Component<P = {}> = (props: P) => JSX.Element;
```

General-purpose component. Children are NOT typed — use when children are optional or irrelevant.

```typescript
const Greeting: Component<{ name: string }> = (props) => {
  return <h1>Hello {props.name}</h1>;
};
```

### ParentComponent\<P\>

```typescript
type ParentComponent<P = {}> = Component<P & { children?: JSX.Element }>;
```

Adds `children?: JSX.Element` to props. ALWAYS use for layout wrappers, containers, and any component that renders children.

```typescript
const Card: ParentComponent<{ title: string }> = (props) => {
  return (
    <div class="card">
      <h2>{props.title}</h2>
      <div class="card-body">{props.children}</div>
    </div>
  );
};
```

### VoidComponent\<P\>

```typescript
type VoidComponent<P = {}> = Component<P>;
```

Signals that children are NEVER accepted. ALWAYS use for leaf nodes: icons, inputs, images, badges.

```typescript
const Icon: VoidComponent<{ name: string; size?: number }> = (props) => {
  const merged = mergeProps({ size: 24 }, props);
  return <svg width={merged.size} height={merged.size}><use href={`#icon-${props.name}`} /></svg>;
};
```

### FlowComponent\<P, C\>

```typescript
type FlowComponent<P = {}, C = JSX.Element> = Component<P & { children: C }>;
```

Children are typed as `C`. ALWAYS use for control flow wrappers, render-prop patterns, and typed slot components.

```typescript
const Repeat: FlowComponent<{ times: number }, (index: number) => JSX.Element> = (props) => {
  return <>{Array.from({ length: props.times }, (_, i) => props.children(i))}</>;
};

// Usage:
<Repeat times={3}>
  {(i) => <p>Item {i}</p>}
</Repeat>
```

---

## splitProps

**Import**: `import { splitProps } from "solid-js";`

```typescript
function splitProps<T extends object, K extends (keyof T)[]>(
  props: T,
  ...keys: K[]
): [...SplitProps<T, K>, Omit<T, K[number]>];
```

Splits a props object into multiple groups while PRESERVING reactivity. This is the SolidJS replacement for destructuring.

### Signature Details

- **props**: The reactive props object (NEVER a destructured copy)
- **...keys**: One or more arrays of property name strings to extract
- **Returns**: Tuple of split groups + a rest object containing all unmatched props

### Single Split (2 groups)

```typescript
const [local, rest] = splitProps(props, ["onClick", "disabled"]);
// local.onClick, local.disabled — reactive
// rest contains everything else — reactive
```

### Multi Split (3+ groups)

```typescript
const [behavior, style, rest] = splitProps(
  props,
  ["onClick", "onFocus"],  // Group 1
  ["class", "variant"]     // Group 2
);
// rest contains remaining props
```

### Key Behavior

- Each split group is a NEW reactive proxy — property access stays reactive
- A property appears in the FIRST group that claims it
- The rest object contains all unclaimed properties
- ALWAYS use instead of destructuring to preserve reactivity

---

## mergeProps

**Import**: `import { mergeProps } from "solid-js";`

```typescript
function mergeProps<T extends object[]>(...sources: T): MergedProps<T>;
```

Merges multiple props objects into one while PRESERVING reactivity. Later sources override earlier ones.

### Signature Details

- **...sources**: Two or more objects to merge (typically defaults + props)
- **Returns**: A single merged reactive proxy

### Default Values Pattern

```typescript
const merged = mergeProps(
  { variant: "primary", size: "md", disabled: false },  // defaults
  props                                                   // incoming props override
);
// merged.variant — uses props.variant if provided, else "primary"
```

### Merging Multiple Sources

```typescript
const merged = mergeProps(baseDefaults, themeDefaults, props);
// Priority: props > themeDefaults > baseDefaults
```

### Key Behavior

- Returns a reactive proxy — ALL property access remains reactive
- Later sources override earlier sources (left-to-right priority)
- `undefined` values in later sources do NOT override earlier defined values
- This is the SolidJS replacement for React's `defaultProps`

---

## children() Helper

**Import**: `import { children } from "solid-js";`

```typescript
function children(fn: Accessor<JSX.Element>): ChildrenReturn;

type ChildrenReturn = Accessor<ResolvedChildren> & {
  toArray: () => ResolvedChildren[];
};
```

Resolves and caches `props.children` to prevent re-creation on multiple access.

### Signature Details

- **fn**: An accessor that returns `props.children` (ALWAYS wrap as `() => props.children`)
- **Returns**: A memo-like accessor with a `.toArray()` method

### Methods on ChildrenReturn

| Method | Return Type | Purpose |
|--------|-------------|---------|
| `resolved()` | `ResolvedChildren` | Get resolved children (single element, array, or null) |
| `resolved.toArray()` | `ResolvedChildren[]` | Flatten into array for iteration |

### When to Use

- ALWAYS use when you need to access `props.children` more than once
- ALWAYS use when iterating over children
- ALWAYS use when passing children to effects or computations
- Safe to skip ONLY when children are passed directly to JSX once: `<div>{props.children}</div>`

---

## Ref Patterns

### Variable Assignment Ref

```typescript
let ref!: HTMLDivElement;
```

- The `!:` is a TypeScript definite assignment assertion — tells the compiler the variable WILL be assigned before use
- SolidJS assigns the ref during render (before `onMount` fires)
- ALWAYS access inside `onMount` or `createEffect` for DOM operations

### Callback Ref

```typescript
ref={(el: HTMLDivElement) => { /* el is created but NOT yet in DOM */ }}
```

- Receives the element immediately after creation
- Element is NOT yet attached to the document
- ALWAYS use `onMount` inside the callback for DOM-dependent operations

### Signal Ref (Conditional Elements)

```typescript
const [ref, setRef] = createSignal<HTMLElement>();
// Usage: ref={setRef}
// Access: ref() — may be undefined
```

- ALWAYS use for elements inside `<Show>` or other conditional control flow
- The signal updates when the element is created/destroyed

### Ref Forwarding

SolidJS transforms `ref={variable}` on a component into a callback. The child component ALWAYS receives ref as a callback function:

```typescript
// Child component prop type:
interface ChildProps {
  ref: HTMLElement | ((el: HTMLElement) => void);
}
```

Pass `props.ref` directly to a native element's `ref` attribute. No `forwardRef` wrapper needed.

---

## Directive API (use:)

### Directive Function Signature

```typescript
function directiveName(element: Element, accessor: () => T): void;
```

- **element**: The DOM element the directive is attached to
- **accessor**: A function returning the directive's value (reactive)

### Capabilities

- Create signals and effects inside the directive
- Attach/remove event listeners
- Manipulate DOM attributes, styles, classes
- Run cleanup via `onCleanup` (imported from `solid-js`)

### TypeScript Declaration (Required)

ALWAYS declare custom directives to avoid TypeScript errors:

```typescript
declare module "solid-js" {
  namespace JSX {
    interface Directives {
      directiveName: DirectiveValueType;
    }
  }
}
```

### Registration

Directives do NOT need global registration. Import the function in the file that uses it. The compiler resolves `use:directiveName` to the in-scope function named `directiveName`.

**IMPORTANT**: The directive function MUST be in scope where the JSX is used. If it is imported but unused in code (only used in JSX), add a no-op reference to prevent tree-shaking:

```typescript
import { clickOutside } from "./directives";
// Ensure it's not tree-shaken:
void clickOutside;
```

---

## Event Handler TypeScript Types

### Delegated Event Handler Types

```typescript
// Mouse events:
onClick: (event: MouseEvent) => void
onDblClick: (event: MouseEvent) => void
onContextMenu: (event: MouseEvent) => void
onMouseDown: (event: MouseEvent) => void
onMouseUp: (event: MouseEvent) => void
onMouseMove: (event: MouseEvent) => void
onMouseOver: (event: MouseEvent) => void
onMouseOut: (event: MouseEvent) => void

// Pointer events:
onPointerDown: (event: PointerEvent) => void
onPointerUp: (event: PointerEvent) => void
onPointerMove: (event: PointerEvent) => void
onPointerOver: (event: PointerEvent) => void
onPointerOut: (event: PointerEvent) => void

// Keyboard events:
onKeyDown: (event: KeyboardEvent) => void
onKeyUp: (event: KeyboardEvent) => void

// Input events:
onInput: (event: InputEvent) => void
onBeforeInput: (event: InputEvent) => void

// Focus events:
onFocusIn: (event: FocusEvent) => void
onFocusOut: (event: FocusEvent) => void

// Touch events:
onTouchStart: (event: TouchEvent) => void
onTouchMove: (event: TouchEvent) => void
onTouchEnd: (event: TouchEvent) => void
```

### Native Event Handler Types (on: prefix)

```typescript
// Scroll:
"on:scroll": (event: Event) => void

// Resize (on window):
"on:resize": (event: UIEvent) => void

// Custom events:
"on:myCustomEvent": (event: CustomEvent<DetailType>) => void
```

### Array Binding Syntax Type

```typescript
// [handler, data] — handler receives data as first arg, event as second:
onClick: [handler: (data: T, event: MouseEvent) => void, data: T]
```

### Extracting Target Type

ALWAYS cast `event.target` to the specific element type:

```typescript
const handleInput = (event: InputEvent): void => {
  const target = event.target as HTMLInputElement;
  console.log(target.value);
};

const handleSelect = (event: Event): void => {
  const target = event.target as HTMLSelectElement;
  console.log(target.value);
};
```
