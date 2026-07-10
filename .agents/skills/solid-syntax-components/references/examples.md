# solid-syntax-components — Examples

## 1. Complete Component with Props Handling

```typescript
import { splitProps, mergeProps } from "solid-js";
import type { ParentComponent } from "solid-js";

interface ButtonProps {
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
  class?: string;
  id?: string;
}

const Button: ParentComponent<ButtonProps> = (props) => {
  // Step 1: Apply defaults with mergeProps
  const merged = mergeProps(
    { variant: "primary" as const, size: "md" as const, disabled: false },
    props
  );

  // Step 2: Split into groups with splitProps
  const [local, rest] = splitProps(merged, [
    "variant", "size", "disabled", "onClick", "children"
  ]);

  return (
    <button
      class={`btn btn-${local.variant} btn-${local.size} ${props.class ?? ""}`}
      disabled={local.disabled}
      onClick={local.onClick}
      {...rest}
    >
      {local.children}
    </button>
  );
};
```

---

## 2. splitProps — Separating Concerns

### Two-way split (local + rest for spreading)

```typescript
import { splitProps } from "solid-js";
import type { Component, JSX } from "solid-js";

interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

const TextInput: Component<InputProps> = (props) => {
  const [local, inputProps] = splitProps(props, ["label", "error"]);

  return (
    <div class="form-field">
      <label>{local.label}</label>
      <input {...inputProps} />
      {local.error && <span class="error">{local.error}</span>}
    </div>
  );
};
```

### Three-way split

```typescript
import { splitProps } from "solid-js";
import type { ParentComponent } from "solid-js";

interface PanelProps {
  title: string;
  collapsible: boolean;
  onToggle: () => void;
  class?: string;
  style?: string;
  id?: string;
}

const Panel: ParentComponent<PanelProps> = (props) => {
  const [behavior, appearance, rest] = splitProps(
    props,
    ["title", "collapsible", "onToggle"],
    ["class", "style"]
  );

  return (
    <section class={`panel ${appearance.class ?? ""}`} style={appearance.style} {...rest}>
      <header onClick={behavior.collapsible ? behavior.onToggle : undefined}>
        <h3>{behavior.title}</h3>
      </header>
      <div class="panel-body">{props.children}</div>
    </section>
  );
};
```

---

## 3. mergeProps — Defaults and Composition

### Simple defaults

```typescript
import { mergeProps } from "solid-js";
import type { VoidComponent } from "solid-js";

interface AvatarProps {
  src?: string;
  alt?: string;
  size?: number;
}

const Avatar: VoidComponent<AvatarProps> = (props) => {
  const merged = mergeProps(
    { src: "/default-avatar.png", alt: "User avatar", size: 48 },
    props
  );

  return (
    <img
      src={merged.src}
      alt={merged.alt}
      width={merged.size}
      height={merged.size}
      class="avatar"
    />
  );
};
```

### Layered merging (theme + defaults + props)

```typescript
import { mergeProps } from "solid-js";
import type { ParentComponent } from "solid-js";

const themeDefaults = { variant: "outlined", rounded: true };
const sizeDefaults = { size: "md", padding: 16 };

const ThemedCard: ParentComponent<CardProps> = (props) => {
  // Priority: props > sizeDefaults > themeDefaults
  const merged = mergeProps(themeDefaults, sizeDefaults, props);

  return (
    <div
      class={`card card-${merged.variant} card-${merged.size}`}
      style={{ padding: `${merged.padding}px`, "border-radius": merged.rounded ? "8px" : "0" }}
    >
      {props.children}
    </div>
  );
};
```

---

## 4. Children Resolution

### Basic children resolution

```typescript
import { children, createEffect } from "solid-js";
import type { ParentComponent } from "solid-js";

const Wrapper: ParentComponent<{ onChildCount?: (count: number) => void }> = (props) => {
  const resolved = children(() => props.children);

  createEffect(() => {
    const items = resolved.toArray();
    props.onChildCount?.(items.length);
  });

  return <div class="wrapper">{resolved()}</div>;
};
```

### Iterating resolved children

```typescript
import { children, For } from "solid-js";
import type { ParentComponent } from "solid-js";

const Toolbar: ParentComponent = (props) => {
  const items = children(() => props.children);

  return (
    <div class="toolbar" role="toolbar">
      <For each={items.toArray()}>
        {(item) => <div class="toolbar-item">{item}</div>}
      </For>
    </div>
  );
};

// Usage:
<Toolbar>
  <button>Cut</button>
  <button>Copy</button>
  <button>Paste</button>
</Toolbar>
```

### Render props (function-as-children)

```typescript
import { children } from "solid-js";
import type { FlowComponent } from "solid-js";

interface SlotData {
  isOpen: boolean;
  toggle: () => void;
}

const Disclosure: FlowComponent<{}, (data: SlotData) => JSX.Element> = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);
  const toggle = () => setIsOpen((prev) => !prev);

  const resolved = children(() => props.children({ isOpen: isOpen(), toggle }));

  return <div class="disclosure">{resolved()}</div>;
};

// Usage:
<Disclosure>
  {(slot) => (
    <>
      <button onClick={slot.toggle}>{slot.isOpen ? "Close" : "Open"}</button>
      <Show when={slot.isOpen}>
        <p>Disclosed content</p>
      </Show>
    </>
  )}
</Disclosure>
```

---

## 5. Ref Forwarding

### Parent accessing child DOM element

```typescript
import { onMount } from "solid-js";
import type { Component } from "solid-js";

// Child component — accepts ref as a regular prop:
interface CanvasProps {
  ref: HTMLCanvasElement | ((el: HTMLCanvasElement) => void);
  width: number;
  height: number;
}

const Canvas: Component<CanvasProps> = (props) => {
  return <canvas ref={props.ref} width={props.width} height={props.height} />;
};

// Parent component — passes ref as a variable:
function DrawingApp() {
  let canvasRef!: HTMLCanvasElement;

  onMount(() => {
    const ctx = canvasRef.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "blue";
      ctx.fillRect(10, 10, 100, 100);
    }
  });

  return <Canvas ref={canvasRef} width={800} height={600} />;
}
```

### Callback ref with side effects

```typescript
import { onMount } from "solid-js";
import type { Component } from "solid-js";

const AutoFocusInput: Component<{ placeholder?: string }> = (props) => {
  let inputRef!: HTMLInputElement;

  onMount(() => {
    inputRef.focus();
  });

  return <input ref={inputRef} placeholder={props.placeholder} />;
};
```

### Signal ref for conditional elements

```typescript
import { createSignal, createEffect, Show } from "solid-js";
import type { Component } from "solid-js";

const ConditionalCanvas: Component = () => {
  const [show, setShow] = createSignal(false);
  const [canvasEl, setCanvasEl] = createSignal<HTMLCanvasElement>();

  createEffect(() => {
    const el = canvasEl();
    if (el) {
      const ctx = el.getContext("2d");
      ctx?.fillRect(0, 0, 50, 50);
    }
  });

  return (
    <div>
      <button onClick={() => setShow((s) => !s)}>Toggle Canvas</button>
      <Show when={show()}>
        <canvas ref={setCanvasEl} width={200} height={200} />
      </Show>
    </div>
  );
};
```

---

## 6. Custom Directives (use:)

### clickOutside directive

```typescript
import { onCleanup } from "solid-js";

function clickOutside(element: Element, accessor: () => () => void): void {
  const handler = (event: Event) => {
    if (!element.contains(event.target as Node)) {
      accessor()();
    }
  };
  document.addEventListener("click", handler);
  onCleanup(() => document.removeEventListener("click", handler));
}

// TypeScript declaration:
declare module "solid-js" {
  namespace JSX {
    interface Directives {
      clickOutside: () => void;
    }
  }
}

// Usage:
function Dropdown() {
  const [open, setOpen] = createSignal(false);

  return (
    <div use:clickOutside={() => setOpen(false)}>
      <button onClick={() => setOpen((o) => !o)}>Menu</button>
      <Show when={open()}>
        <ul class="dropdown-menu">
          <li>Option 1</li>
          <li>Option 2</li>
        </ul>
      </Show>
    </div>
  );
}
```

### longPress directive with reactive duration

```typescript
import { onCleanup } from "solid-js";

interface LongPressOptions {
  duration: number;
  onPress: () => void;
}

function longPress(element: Element, accessor: () => LongPressOptions): void {
  let timer: number;

  const onPointerDown = () => {
    const { duration, onPress } = accessor();
    timer = window.setTimeout(onPress, duration);
  };

  const onPointerUp = () => {
    clearTimeout(timer);
  };

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointerleave", onPointerUp);

  onCleanup(() => {
    clearTimeout(timer);
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("pointerup", onPointerUp);
    element.removeEventListener("pointerleave", onPointerUp);
  });
}

declare module "solid-js" {
  namespace JSX {
    interface Directives {
      longPress: LongPressOptions;
    }
  }
}

// Usage:
<button use:longPress={{ duration: 500, onPress: () => console.log("Long pressed!") }}>
  Hold me
</button>
```

### Multiple directives on one element

```typescript
// ALWAYS allowed — multiple use: directives can coexist:
<div
  use:clickOutside={() => close()}
  use:longPress={{ duration: 1000, onPress: handleLongPress }}
  use:tooltip="Click or hold"
>
  Interactive element
</div>
```

---

## 7. Event Binding Patterns

### Delegated events (standard)

```typescript
import type { Component } from "solid-js";

const Form: Component = () => {
  const handleSubmit = (event: Event) => {
    event.preventDefault();
    // Process form
  };

  const handleInput = (event: InputEvent) => {
    const target = event.target as HTMLInputElement;
    console.log(target.value);
  };

  return (
    <form on:submit={handleSubmit}>
      <input onInput={handleInput} />
      <button type="submit">Submit</button>
    </form>
  );
};
```

### Array binding (data passing without closure)

```typescript
import type { Component } from "solid-js";

interface Todo {
  id: number;
  text: string;
}

const TodoList: Component<{ todos: Todo[] }> = (props) => {
  const handleDelete = (id: number, event: MouseEvent) => {
    console.log(`Delete todo ${id}`, event.target);
  };

  return (
    <For each={props.todos}>
      {(todo) => (
        <div>
          <span>{todo.text}</span>
          <button onClick={[handleDelete, todo.id]}>Delete</button>
        </div>
      )}
    </For>
  );
};
```

### Native events with on: prefix

```typescript
import type { Component } from "solid-js";

const ScrollTracker: Component = () => {
  const handleScroll = (event: Event) => {
    const target = event.target as HTMLDivElement;
    console.log("Scroll position:", target.scrollTop);
  };

  // ALWAYS use on: for scroll — it is NOT in the delegated event list
  return (
    <div on:scroll={handleScroll} style={{ "overflow-y": "auto", height: "300px" }}>
      <div style={{ height: "1000px" }}>Tall content</div>
    </div>
  );
};
```

### Custom events

```typescript
// Dispatching a custom event:
function dispatchCustom(element: HTMLElement) {
  element.dispatchEvent(
    new CustomEvent("status-change", { detail: { status: "active" }, bubbles: true })
  );
}

// Listening with on: prefix:
<div on:status-change={(e: CustomEvent<{ status: string }>) => {
  console.log("Status:", e.detail.status);
}}>
  <ChildComponent />
</div>
```

### Propagation control

```typescript
// WRONG — stopPropagation does NOT work with delegated onClick:
<div onClick={() => console.log("parent")}>
  <button onClick={(e) => {
    e.stopPropagation(); // Does NOT prevent parent handler — both use document listener
    console.log("child");
  }}>Click</button>
</div>

// CORRECT — use on: prefix for propagation control:
<div on:click={() => console.log("parent")}>
  <button on:click={(e) => {
    e.stopPropagation(); // Works — native listener on element
    console.log("child");
  }}>Click</button>
</div>
```

---

## 8. Component Type Selection

### VoidComponent — leaf node

```typescript
import type { VoidComponent } from "solid-js";

interface BadgeProps {
  text: string;
  color?: "green" | "red" | "yellow";
}

const Badge: VoidComponent<BadgeProps> = (props) => {
  const merged = mergeProps({ color: "green" as const }, props);
  return <span class={`badge badge-${merged.color}`}>{props.text}</span>;
};
```

### ParentComponent — container

```typescript
import type { ParentComponent } from "solid-js";

const Sidebar: ParentComponent<{ width?: number }> = (props) => {
  const merged = mergeProps({ width: 250 }, props);
  return (
    <aside style={{ width: `${merged.width}px` }}>
      {props.children}
    </aside>
  );
};
```

### FlowComponent — typed children

```typescript
import type { FlowComponent } from "solid-js";

interface Column<T> {
  header: string;
  render: (item: T) => JSX.Element;
}

const DataTable: FlowComponent<
  { data: any[] },
  Column<any>[]
> = (props) => {
  return (
    <table>
      <thead>
        <tr>
          <For each={props.children}>
            {(col) => <th>{col.header}</th>}
          </For>
        </tr>
      </thead>
      <tbody>
        <For each={props.data}>
          {(row) => (
            <tr>
              <For each={props.children}>
                {(col) => <td>{col.render(row)}</td>}
              </For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
};
```
