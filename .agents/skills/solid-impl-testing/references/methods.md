# solid-impl-testing -- API Methods Reference

## render()

Renders a SolidJS component into a test container within a reactive owner scope.

```typescript
function render(
  ui: () => JSX.Element,
  options?: RenderOptions
): RenderResult;

interface RenderOptions {
  container?: HTMLElement;
  baseElement?: HTMLElement;
  queries?: Queries;
  hydrate?: boolean;
  wrapper?: Component<{ children: JSX.Element }>;
  location?: string;  // Sets up in-memory router at this path
}

interface RenderResult {
  container: HTMLElement;
  baseElement: HTMLElement;
  unmount: () => void;
  // All Testing Library queries bound to container:
  getByText: BoundFunction<GetByText>;
  getByRole: BoundFunction<GetByRole>;
  getByLabelText: BoundFunction<GetByLabelText>;
  getByPlaceholderText: BoundFunction<GetByPlaceholderText>;
  getByDisplayValue: BoundFunction<GetByDisplayValue>;
  getByAltText: BoundFunction<GetByAltText>;
  getByTitle: BoundFunction<GetByTitle>;
  getByTestId: BoundFunction<GetByTestId>;
  queryByText: BoundFunction<QueryByText>;
  queryByRole: BoundFunction<QueryByRole>;
  // ... queryBy*, findBy*, getAllBy*, queryAllBy*, findAllBy* variants
  findByText: BoundFunction<FindByText>;
  findByRole: BoundFunction<FindByRole>;
  // ... etc.
}
```

### Usage Rules

- **ALWAYS** pass `() => <Component />` -- a function returning JSX
- **NEVER** pass `<Component />` directly -- this executes outside the reactive owner
- The `location` option creates a `MemoryRouter` -- requires `@solidjs/router` installed
- When using `location`, queries for routed content MUST use `findBy*` (async)
- The `wrapper` option wraps the component -- use for context providers
- `unmount()` disposes the reactive owner and removes the container

---

## cleanup()

Disposes all reactive owners and removes all rendered containers.

```typescript
function cleanup(): void;
```

### Usage Rules

- **ALWAYS** call in `afterEach` block:
  ```typescript
  afterEach(() => cleanup());
  ```
- Disposes reactive owners created by `render()`, `renderHook()`, and `renderDirective()`
- Removes rendered containers from `document.body`
- Prevents reactive owner leaks between tests
- Some frameworks auto-call cleanup, but **ALWAYS** call it explicitly for SolidJS to avoid disposal errors

---

## screen

Global query object bound to `document.body`. Re-exported from `@testing-library/dom`.

```typescript
import { screen } from "@solidjs/testing-library";
```

### Available Queries

| Query | Returns | Throws on missing? | Async? |
|-------|---------|-------------------|--------|
| `screen.getByRole(role, options?)` | `HTMLElement` | Yes | No |
| `screen.getByText(text, options?)` | `HTMLElement` | Yes | No |
| `screen.getByLabelText(text, options?)` | `HTMLElement` | Yes | No |
| `screen.getByPlaceholderText(text)` | `HTMLElement` | Yes | No |
| `screen.getByDisplayValue(value)` | `HTMLElement` | Yes | No |
| `screen.getByAltText(text)` | `HTMLElement` | Yes | No |
| `screen.getByTitle(title)` | `HTMLElement` | Yes | No |
| `screen.getByTestId(id)` | `HTMLElement` | Yes | No |
| `screen.queryByRole(role, options?)` | `HTMLElement \| null` | No | No |
| `screen.queryByText(text, options?)` | `HTMLElement \| null` | No | No |
| `screen.findByRole(role, options?)` | `Promise<HTMLElement>` | Yes (rejects) | Yes |
| `screen.findByText(text, options?)` | `Promise<HTMLElement>` | Yes (rejects) | Yes |

**Plural variants** (`getAllBy*`, `queryAllBy*`, `findAllBy*`) return arrays.

### Query Priority (most to least preferred)

1. `getByRole` -- accessible role + name (best for all interactive elements)
2. `getByLabelText` -- form fields with labels
3. `getByPlaceholderText` -- form fields without labels
4. `getByText` -- non-interactive elements with text content
5. `getByDisplayValue` -- filled form elements
6. `getByAltText` -- images
7. `getByTitle` -- title attribute
8. `getByTestId` -- **LAST RESORT** only

---

## fireEvent

Dispatches DOM events on elements. Re-exported from `@testing-library/dom`.

```typescript
import { fireEvent } from "@testing-library/dom";

// Generic
fireEvent(element: HTMLElement, event: Event): boolean;

// Convenience methods
fireEvent.click(element: HTMLElement, options?: EventInit): boolean;
fireEvent.change(element: HTMLElement, options?: EventInit): boolean;
fireEvent.input(element: HTMLElement, options?: EventInit): boolean;
fireEvent.submit(element: HTMLElement, options?: EventInit): boolean;
fireEvent.focus(element: HTMLElement, options?: EventInit): boolean;
fireEvent.blur(element: HTMLElement, options?: EventInit): boolean;
fireEvent.keyDown(element: HTMLElement, options?: KeyboardEventInit): boolean;
fireEvent.keyUp(element: HTMLElement, options?: KeyboardEventInit): boolean;
fireEvent.mouseEnter(element: HTMLElement, options?: MouseEventInit): boolean;
fireEvent.mouseLeave(element: HTMLElement, options?: MouseEventInit): boolean;
```

### Common Patterns

```typescript
// Click a button
fireEvent.click(screen.getByRole("button", { name: "Save" }));

// Type into an input
const input = screen.getByRole("textbox");
fireEvent.input(input, { target: { value: "Hello" } });

// Submit a form
fireEvent.submit(screen.getByRole("form"));

// Keyboard event
fireEvent.keyDown(element, { key: "Enter", code: "Enter" });
```

### SolidJS-Specific Note

SolidJS uses event delegation for common events (click, input, etc.). `fireEvent` works correctly with delegated events because it dispatches real DOM events that bubble through the document.

---

## waitFor

Retries an assertion until it passes or times out. Re-exported from `@testing-library/dom`.

```typescript
function waitFor<T>(
  callback: () => T | Promise<T>,
  options?: WaitForOptions
): Promise<T>;

interface WaitForOptions {
  container?: HTMLElement;
  timeout?: number;       // Default: 1000ms
  interval?: number;      // Default: 50ms
  onTimeout?: (error: Error) => Error;
  mutationObserverOptions?: MutationObserverInit;
}
```

### When to Use waitFor in SolidJS

SolidJS reactive updates are **synchronous** -- signal changes immediately update the DOM. Therefore `waitFor` is ONLY needed for:

1. **Async data** -- `createResource`, `createAsync` resolving Promises
2. **Suspense boundaries** -- waiting for fallback to be replaced
3. **Transitions** -- `useTransition` or `startTransition` deferred updates
4. **Timers** -- `setTimeout`/`setInterval` in components

**NEVER** use `waitFor` for synchronous signal updates -- they are instant.

```typescript
// WRONG -- unnecessary waitFor for sync update
fireEvent.click(button);
await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());

// CORRECT -- sync update, assert immediately
fireEvent.click(button);
expect(screen.getByText("1")).toBeInTheDocument();
```

---

## within

Scopes queries to a specific container element. Re-exported from `@testing-library/dom`.

```typescript
import { within } from "@testing-library/dom";

const section = screen.getByRole("region", { name: "User Info" });
const name = within(section).getByText("John Doe");
```

---

## renderHook()

Executes a hook function inside an isolated reactive owner.

```typescript
function renderHook<Args extends any[], Result>(
  hook: (...args: Args) => Result,
  options?: RenderHookOptions<Args>
): RenderHookResult<Result>;

interface RenderHookOptions<Args> {
  initialProps?: Args;
  wrapper?: Component<{ children: JSX.Element }>;
}

interface RenderHookResult<Result> {
  result: Result;
  owner: Owner | null;
  cleanup: () => void;
}
```

### Usage Rules

- The `result` is the direct return value of the hook
- If the hook returns an accessor, call it: `result.count()` not `result.count`
- The `wrapper` component **MUST** always render `props.children` -- skipping it breaks synchronous value retrieval
- Call `cleanup()` or use `afterEach(() => cleanup())` to dispose the owner

---

## testEffect()

Runs reactive code in a test and resolves when `done` is called.

```typescript
function testEffect<T = void>(
  fn: (done: (result: T) => void) => void,
  owner?: Owner
): Promise<T>;
```

### Usage Rules

- **ALWAYS** call `done()` to resolve the Promise -- without it the test hangs until timeout
- Effects run synchronously within Solid's reactive system
- Use for testing `createEffect`, `createMemo`, `createComputed` behavior
- Pass a custom `owner` to test within a specific reactive scope
- Returns a Promise -- use `return testEffect(...)` in the test body

---

## renderDirective()

Tests custom `use:` directives with reactive argument management.

```typescript
function renderDirective<Arg, Elem extends HTMLElement>(
  directive: (ref: Elem, arg: Accessor<Arg>) => void,
  options?: RenderDirectiveOptions<Arg, Elem>
): RenderDirectiveResult<Arg>;

interface RenderDirectiveOptions<Arg, Elem> {
  initialValue: Arg;
  targetElement?: string | Elem | (() => Elem);  // Default: "div"
}

interface RenderDirectiveResult<Arg> {
  arg: Accessor<Arg>;
  setArg: Setter<Arg>;
  // Plus all standard RenderResult queries
  container: HTMLElement;
  unmount: () => void;
  asFragment: () => string;
}
```

### Usage

```typescript
import { renderDirective, cleanup } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";
import { clickOutside } from "./clickOutside";

afterEach(() => cleanup());

it("calls handler on outside click", () => {
  const handler = vi.fn();
  const { container } = renderDirective(clickOutside, {
    initialValue: handler,
  });

  fireEvent.click(document.body);
  expect(handler).toHaveBeenCalled();
});
```
