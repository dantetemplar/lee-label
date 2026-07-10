# solid-syntax-components — Anti-Patterns

## 1. Destructuring Props

Props in SolidJS are reactive getters on a proxy object. Destructuring extracts the value ONCE and severs the reactive connection permanently.

### Parameter Destructuring

```typescript
// WRONG — React pattern, kills reactivity:
function Greeting({ name, age }: { name: string; age: number }) {
  return <p>{name} is {age}</p>;  // Frozen at initial values
}

// CORRECT — access props directly:
import type { Component } from "solid-js";

const Greeting: Component<{ name: string; age: number }> = (props) => {
  return <p>{props.name} is {props.age}</p>;  // Reactive
};
```

### Body Destructuring

```typescript
// WRONG — same problem, different location:
function UserCard(props: { name: string; email: string }) {
  const { name, email } = props;  // Extracted once, never updates
  return (
    <div>
      <h2>{name}</h2>
      <p>{email}</p>
    </div>
  );
}

// CORRECT — use splitProps when you need separation:
import { splitProps } from "solid-js";
import type { Component } from "solid-js";

const UserCard: Component<{ name: string; email: string; id: string }> = (props) => {
  const [local, rest] = splitProps(props, ["name", "email"]);
  return (
    <div {...rest}>
      <h2>{local.name}</h2>
      <p>{local.email}</p>
    </div>
  );
};
```

### Variable Extraction

```typescript
// WRONG — captures value once:
function Price(props: { amount: number }) {
  const amount = props.amount;  // Frozen
  const formatted = `$${amount.toFixed(2)}`;  // Also frozen
  return <span>{formatted}</span>;
}

// CORRECT — wrap in accessor functions:
import type { Component } from "solid-js";

const Price: Component<{ amount: number }> = (props) => {
  const formatted = () => `$${props.amount.toFixed(2)}`;  // Re-evaluates reactively
  return <span>{formatted()}</span>;
};
```

---

## 2. React useRef

SolidJS has NO `useRef` hook. Refs are plain variables with definite assignment.

```typescript
// WRONG — React pattern:
import { useRef, useEffect } from "react";

function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    ctx?.fillRect(0, 0, 100, 100);
  }, []);

  return <canvas ref={canvasRef} />;
}

// CORRECT — SolidJS pattern:
import { onMount } from "solid-js";
import type { Component } from "solid-js";

const Canvas: Component = () => {
  let canvasRef!: HTMLCanvasElement;  // Definite assignment assertion

  onMount(() => {
    const ctx = canvasRef.getContext("2d");  // Direct access, no .current
    ctx?.fillRect(0, 0, 100, 100);
  });

  return <canvas ref={canvasRef} />;
};
```

### Key Differences

| Aspect | WRONG (React) | CORRECT (SolidJS) |
|--------|---------------|-------------------|
| Declaration | `useRef<T>(null)` | `let ref!: T` |
| Access | `ref.current` | `ref` directly |
| Null check | ALWAYS needed (`?.`) | NEVER needed (definite assignment) |
| Hook import | Required | Not applicable |

---

## 3. React forwardRef

SolidJS does NOT have `forwardRef`. Refs are forwarded as regular props.

```typescript
// WRONG — React pattern:
import { forwardRef, useImperativeHandle, useRef } from "react";

const FancyInput = forwardRef<HTMLInputElement, { label: string }>((props, ref) => {
  return (
    <div>
      <label>{props.label}</label>
      <input ref={ref} />
    </div>
  );
});

function Parent() {
  const inputRef = useRef<HTMLInputElement>(null);
  return <FancyInput ref={inputRef} label="Name" />;
}

// CORRECT — SolidJS pattern:
import { onMount } from "solid-js";
import type { Component } from "solid-js";

interface FancyInputProps {
  label: string;
  ref: HTMLInputElement | ((el: HTMLInputElement) => void);
}

const FancyInput: Component<FancyInputProps> = (props) => {
  return (
    <div>
      <label>{props.label}</label>
      <input ref={props.ref} />
    </div>
  );
};

function Parent() {
  let inputRef!: HTMLInputElement;

  onMount(() => {
    inputRef.focus();  // Direct access
  });

  return <FancyInput ref={inputRef} label="Name" />;
}
```

---

## 4. React Children Patterns

### React.Children.map / React.Children.count

```typescript
// WRONG — React pattern:
import React from "react";

function Toolbar(props: { children: React.ReactNode }) {
  const count = React.Children.count(props.children);
  return (
    <div>
      <span>{count} items</span>
      {React.Children.map(props.children, (child, i) => (
        <div class="toolbar-item" key={i}>{child}</div>
      ))}
    </div>
  );
}

// CORRECT — SolidJS pattern:
import { children, For } from "solid-js";
import type { ParentComponent } from "solid-js";

const Toolbar: ParentComponent = (props) => {
  const resolved = children(() => props.children);

  return (
    <div>
      <span>{resolved.toArray().length} items</span>
      <For each={resolved.toArray()}>
        {(child) => <div class="toolbar-item">{child}</div>}
      </For>
    </div>
  );
};
```

### Accessing children multiple times without resolution

```typescript
// WRONG — each access to props.children may re-create elements:
function Bad(props: { children: JSX.Element }) {
  console.log(props.children);       // Creates children
  return <div>{props.children}</div>; // Creates again!
}

// CORRECT — resolve once, use many times:
import { children, createEffect } from "solid-js";
import type { ParentComponent } from "solid-js";

const Good: ParentComponent = (props) => {
  const resolved = children(() => props.children);

  createEffect(() => {
    console.log(resolved());  // Stable cached reference
  });

  return <div>{resolved()}</div>;  // Same cached reference
};
```

### React.cloneElement

```typescript
// WRONG — React pattern (cloneElement does not exist in SolidJS):
import React from "react";

function EnhanceChildren(props: { children: React.ReactNode; extraClass: string }) {
  return (
    <>
      {React.Children.map(props.children, (child) =>
        React.cloneElement(child as React.ReactElement, { className: props.extraClass })
      )}
    </>
  );
}

// CORRECT — SolidJS uses composition, not cloning:
import type { ParentComponent } from "solid-js";
import { children, For } from "solid-js";

const EnhanceChildren: ParentComponent<{ extraClass: string }> = (props) => {
  const resolved = children(() => props.children);

  return (
    <div class={props.extraClass}>
      {resolved()}
    </div>
  );
};
```

---

## 5. React Event Handler Mistakes

### Calling handler instead of passing reference

```typescript
// WRONG — calls handler immediately, assigns return value as listener:
<button onClick={handleClick()}>Click</button>

// CORRECT — pass function reference:
<button onClick={handleClick}>Click</button>

// CORRECT — wrap in arrow when passing arguments:
<button onClick={() => handleClick(itemId)}>Click</button>

// CORRECT — use array syntax for data binding:
<button onClick={[handleClick, itemId]}>Click</button>
```

### Using stopPropagation with delegated events

```typescript
// WRONG — stopPropagation has no effect on delegated onClick:
<div onClick={() => console.log("parent clicked")}>
  <button onClick={(e) => {
    e.stopPropagation();  // DOES NOT WORK — both handlers are on document
    console.log("button clicked");
  }}>
    Click
  </button>
</div>
// Result: BOTH "button clicked" AND "parent clicked" fire

// CORRECT — use on: prefix for native event binding:
<div on:click={() => console.log("parent clicked")}>
  <button on:click={(e) => {
    e.stopPropagation();  // Works — native listener on element
    console.log("button clicked");
  }}>
    Click
  </button>
</div>
// Result: ONLY "button clicked" fires
```

### React synthetic event patterns

```typescript
// WRONG — React SyntheticEvent methods do not exist:
function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.persist();  // Does not exist in SolidJS
  e.nativeEvent; // Not needed — events are already native
}

// CORRECT — SolidJS uses native DOM events:
function handleSubmit(e: Event) {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const data = new FormData(form);
}
```

### onChange vs onInput

```typescript
// WRONG — React mental model (onChange fires on every keystroke in React):
<input onChange={(e) => setValue((e.target as HTMLInputElement).value)} />
// In SolidJS, onChange fires on BLUR, not on every keystroke

// CORRECT — use onInput for real-time updates:
<input onInput={(e) => setValue((e.target as HTMLInputElement).value)} />
// onInput fires on every keystroke in SolidJS (and React)
```

---

## 6. React.FC / React.FunctionComponent

```typescript
// WRONG — React typing pattern:
import React from "react";

const MyComponent: React.FC<{ title: string }> = ({ title, children }) => {
  return <div><h1>{title}</h1>{children}</div>;
};

// CORRECT — SolidJS component types:
import type { ParentComponent } from "solid-js";

const MyComponent: ParentComponent<{ title: string }> = (props) => {
  return <div><h1>{props.title}</h1>{props.children}</div>;
};
```

### Mapping React types to SolidJS

| React Type | SolidJS Equivalent | Key Difference |
|------------|-------------------|----------------|
| `React.FC<P>` | `Component<P>` | NEVER destructure props |
| `React.FC<PropsWithChildren<P>>` | `ParentComponent<P>` | Children typed automatically |
| `React.FC<P>` (no children) | `VoidComponent<P>` | Children explicitly forbidden |
| No direct equivalent | `FlowComponent<P, C>` | Typed children (render props) |

---

## 7. Early Returns in Component Body

Components in SolidJS execute ONCE. An early return freezes the output permanently.

```typescript
// WRONG — early return executes once, never updates:
function Profile(props: { user: User | null }) {
  if (!props.user) return <p>Loading...</p>;  // If null initially, stuck forever
  return <div>{props.user.name}</div>;
}

// CORRECT — use Show for conditional rendering:
import { Show } from "solid-js";
import type { Component } from "solid-js";

const Profile: Component<{ user: User | null }> = (props) => {
  return (
    <Show when={props.user} fallback={<p>Loading...</p>}>
      {(user) => <div>{user().name}</div>}
    </Show>
  );
};
```

---

## 8. Default Props via Destructuring Defaults

```typescript
// WRONG — destructuring defaults break reactivity:
function Button({ variant = "primary", size = "md" }: ButtonProps) {
  return <button class={`btn-${variant} btn-${size}`}>Click</button>;
  // variant and size are frozen at initial values (or defaults)
}

// CORRECT — use mergeProps for reactive defaults:
import { mergeProps } from "solid-js";
import type { Component } from "solid-js";

const Button: Component<{ variant?: string; size?: string }> = (props) => {
  const merged = mergeProps({ variant: "primary", size: "md" }, props);
  return <button class={`btn-${merged.variant} btn-${merged.size}`}>Click</button>;
};
```

---

## 9. Spreading Props Without splitProps

```typescript
// WRONG — destructure and spread loses reactivity:
function Input({ label, ...rest }: InputProps) {
  return (
    <div>
      <label>{label}</label>
      <input {...rest} />  // rest is a static snapshot
    </div>
  );
}

// CORRECT — splitProps preserves reactivity in both groups:
import { splitProps } from "solid-js";
import type { Component } from "solid-js";

const Input: Component<InputProps> = (props) => {
  const [local, rest] = splitProps(props, ["label"]);
  return (
    <div>
      <label>{local.label}</label>
      <input {...rest} />  // rest is a reactive proxy
    </div>
  );
};
```
