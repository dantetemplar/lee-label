# solid-impl-testing -- Anti-Patterns

## Anti-Pattern 1: Passing JSX Directly to render()

### WRONG -- React Testing Library Habit

```typescript
// WRONG: Passes JSX element, not a function
render(<Counter />);
```

This executes the component outside the test's reactive owner. Cleanup will NOT dispose the reactive scope, causing signal leaks and unpredictable test failures.

### CORRECT -- SolidJS Pattern

```typescript
// CORRECT: Pass a function returning JSX
render(() => <Counter />);
```

The function is executed inside a reactive owner that the test framework controls and can dispose.

---

## Anti-Pattern 2: Using rerender() to Update Props

### WRONG -- React Testing Library Habit

```typescript
// WRONG: rerender does NOT exist in solid-testing-library
const { rerender } = render(() => <UserCard name="Alice" />);
rerender(() => <UserCard name="Bob" />);  // ERROR: rerender is not a function
```

SolidJS does NOT re-render components. Components run once; only reactive state drives DOM updates.

### CORRECT -- SolidJS Pattern

```typescript
// CORRECT: Use signals to drive prop changes
const [name, setName] = createSignal("Alice");
render(() => <UserCard name={name()} />);

expect(screen.getByText("Alice")).toBeInTheDocument();
setName("Bob");
expect(screen.getByText("Bob")).toBeInTheDocument();
```

---

## Anti-Pattern 3: Skipping cleanup()

### WRONG -- Assuming Auto-Cleanup Works

```typescript
// WRONG: No cleanup -- reactive owners leak between tests
it("test 1", () => {
  render(() => <Counter />);
  // ...test assertions...
});

it("test 2", () => {
  render(() => <Counter />);
  // May fail due to leaked state from test 1
});
```

### CORRECT -- Explicit Cleanup

```typescript
import { cleanup } from "@solidjs/testing-library";
import { afterEach } from "vitest";

afterEach(() => cleanup());

it("test 1", () => {
  render(() => <Counter />);
  // ...
});

it("test 2", () => {
  render(() => <Counter />);
  // Clean state, no leaks
});
```

**ALWAYS** call `cleanup()` in `afterEach`. This is the single most common source of flaky SolidJS tests.

---

## Anti-Pattern 4: Using waitFor for Synchronous Updates

### WRONG -- React Testing Library Habit

```typescript
// WRONG: Unnecessary async -- signal updates are synchronous
fireEvent.click(button);
await waitFor(() => {
  expect(screen.getByText("Count: 1")).toBeInTheDocument();
});
```

In React, state updates are batched and asynchronous, so `waitFor` is common. In SolidJS, signal updates propagate synchronously and immediately update the DOM.

### CORRECT -- SolidJS Pattern

```typescript
// CORRECT: Assert immediately after the event
fireEvent.click(button);
expect(screen.getByText("Count: 1")).toBeInTheDocument();
```

**ONLY** use `waitFor` for genuinely async operations: `createResource`, `createAsync`, Suspense boundaries, transitions, or timers.

---

## Anti-Pattern 5: Destructuring Props in Test Components

### WRONG -- React Destructuring Habit

```typescript
// WRONG: Destructuring breaks reactivity tracking
render(() => {
  const TestComponent = ({ count }: { count: number }) => {
    return <p>Count: {count}</p>;  // count is a static value, not reactive
  };
  return <TestComponent count={someSignal()} />;
});
```

### CORRECT -- SolidJS Props Access

```typescript
// CORRECT: Access props directly
render(() => {
  const TestComponent = (props: { count: number }) => {
    return <p>Count: {props.count}</p>;  // props.count is reactive
  };
  return <TestComponent count={someSignal()} />;
});
```

---

## Anti-Pattern 6: Using act() from React Testing Library

### WRONG -- React Testing Library Import

```typescript
// WRONG: act() is a React concept
import { act } from "@testing-library/react";

act(() => {
  fireEvent.click(button);
});
```

SolidJS has no `act()` wrapper because updates are synchronous. The React `act()` utility batches React state updates -- it has no purpose in SolidJS.

### CORRECT -- SolidJS Pattern

```typescript
// CORRECT: Just fire the event, updates are instant
fireEvent.click(button);
expect(screen.getByText("Updated")).toBeInTheDocument();
```

---

## Anti-Pattern 7: Importing from @testing-library/react

### WRONG -- Wrong Package

```typescript
// WRONG: React testing library
import { render, screen } from "@testing-library/react";
```

This imports React's render which wraps components in React's reconciler. It will fail or produce incorrect behavior with SolidJS components.

### CORRECT -- SolidJS Package

```typescript
// CORRECT: SolidJS testing library
import { render, screen, cleanup } from "@solidjs/testing-library";
import { fireEvent, waitFor, within } from "@testing-library/dom";
```

Note: `render`, `screen`, and `cleanup` come from `@solidjs/testing-library`. DOM utilities like `fireEvent`, `waitFor`, and `within` come from `@testing-library/dom` (re-exported by solid-testing-library).

---

## Anti-Pattern 8: Testing Implementation Details

### WRONG -- Testing Internal Signals

```typescript
// WRONG: Reaching into component internals
it("updates internal signal", () => {
  const { container } = render(() => <Counter />);
  // Trying to access internal signals or state -- impossible and wrong
});
```

### CORRECT -- Testing Behavior Through the DOM

```typescript
// CORRECT: Test what the user sees
it("shows updated count after click", () => {
  render(() => <Counter />);
  fireEvent.click(screen.getByRole("button", { name: "Increment" }));
  expect(screen.getByText("Count: 1")).toBeInTheDocument();
});
```

**ALWAYS** test observable behavior (DOM output, callback calls), NEVER internal state.

---

## Anti-Pattern 9: Missing resolve.conditions in Vitest Config

### WRONG -- Default Vitest Config

```typescript
// vite.config.ts -- WRONG: missing conditions
export default defineConfig({
  plugins: [solidPlugin()],
  test: {
    environment: "jsdom",
  },
});
```

Without `resolve.conditions`, Solid loads its server/production bundle in tests. This causes:
- Missing DOM APIs
- Hydration mismatch errors
- Signals not triggering updates
- Cryptic "dispose" errors

### CORRECT -- Proper Config

```typescript
// vite.config.ts -- CORRECT
export default defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    conditions: ["development", "browser"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    deps: {
      optimizer: {
        web: {
          include: ["solid-js", "@solidjs/router"],
        },
      },
    },
  },
});
```

---

## Anti-Pattern 10: Using useNavigate in Tests

### WRONG -- Calling navigate() in Tests

```typescript
// WRONG: useNavigate does not work in test environment
it("navigates to dashboard", () => {
  render(() => <App />, { location: "/" });
  const navigate = useNavigate();
  navigate("/dashboard");
});
```

The `useNavigate` hook requires a live router context that the test `MemoryRouter` does not fully support for programmatic navigation.

### CORRECT -- Use Link Clicks for Navigation Testing

```typescript
// CORRECT: Simulate user clicking a link
it("navigates to dashboard", async () => {
  render(() => <App />, { location: "/" });

  fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));
  expect(await screen.findByText("Dashboard Page")).toBeInTheDocument();
});
```

---

## Anti-Pattern 11: Not Wrapping renderHook Wrapper Children

### WRONG -- Wrapper That Conditionally Renders Children

```typescript
// WRONG: Wrapper may not render children
const { result } = renderHook(() => useMyHook(), {
  wrapper: (props) => (
    <Show when={someCondition}>
      {props.children}
    </Show>
  ),
});
// result may be undefined because children were not rendered
```

### CORRECT -- Wrapper ALWAYS Renders Children

```typescript
// CORRECT: Wrapper always returns props.children
const { result } = renderHook(() => useMyHook(), {
  wrapper: (props) => (
    <MyProvider>
      {props.children}
    </MyProvider>
  ),
});
```

The `renderHook` wrapper **MUST** always render `props.children`. If children are not rendered synchronously, the `result` value cannot be captured.
