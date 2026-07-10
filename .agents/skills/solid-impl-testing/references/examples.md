# solid-impl-testing -- Complete Test Examples

## 1. Component Tests

### 1.1 Simple Component with Signal State

```typescript
// Counter.tsx
import { createSignal } from "solid-js";

export function Counter() {
  const [count, setCount] = createSignal(0);
  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <button onClick={() => setCount(0)}>Reset</button>
    </div>
  );
}
```

```typescript
// Counter.test.tsx
import { render, screen, cleanup } from "@solidjs/testing-library";
import { fireEvent } from "@testing-library/dom";
import { afterEach, describe, expect, it } from "vitest";
import { Counter } from "./Counter";

afterEach(() => cleanup());

describe("Counter", () => {
  it("renders initial count of 0", () => {
    render(() => <Counter />);
    expect(screen.getByText("Count: 0")).toBeInTheDocument();
  });

  it("increments count on button click", () => {
    render(() => <Counter />);
    fireEvent.click(screen.getByRole("button", { name: "Increment" }));
    expect(screen.getByText("Count: 1")).toBeInTheDocument();
  });

  it("resets count to 0", () => {
    render(() => <Counter />);
    fireEvent.click(screen.getByRole("button", { name: "Increment" }));
    fireEvent.click(screen.getByRole("button", { name: "Increment" }));
    expect(screen.getByText("Count: 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("Count: 0")).toBeInTheDocument();
  });
});
```

### 1.2 Component with Props (Driven by Signals)

```typescript
// UserCard.tsx
import type { Component } from "solid-js";

interface UserCardProps {
  name: string;
  email: string;
  isActive: boolean;
}

export const UserCard: Component<UserCardProps> = (props) => {
  return (
    <div class={props.isActive ? "active" : "inactive"}>
      <h2>{props.name}</h2>
      <p>{props.email}</p>
    </div>
  );
};
```

```typescript
// UserCard.test.tsx
import { createSignal } from "solid-js";
import { render, screen, cleanup } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";
import { UserCard } from "./UserCard";

afterEach(() => cleanup());

it("renders user information", () => {
  render(() => (
    <UserCard name="Alice" email="alice@example.com" isActive={true} />
  ));

  expect(screen.getByText("Alice")).toBeInTheDocument();
  expect(screen.getByText("alice@example.com")).toBeInTheDocument();
});

it("reacts to prop changes via signals", () => {
  const [name, setName] = createSignal("Alice");
  const [isActive, setIsActive] = createSignal(true);

  render(() => (
    <UserCard name={name()} email="alice@example.com" isActive={isActive()} />
  ));

  expect(screen.getByText("Alice")).toBeInTheDocument();
  expect(screen.getByText("Alice").closest("div")).toHaveClass("active");

  setName("Bob");
  expect(screen.getByText("Bob")).toBeInTheDocument();

  setIsActive(false);
  expect(screen.getByText("Bob").closest("div")).toHaveClass("inactive");
});
```

### 1.3 Conditional Rendering with Show

```typescript
// LoginStatus.tsx
import { Show } from "solid-js";
import type { Component } from "solid-js";

interface LoginStatusProps {
  isLoggedIn: boolean;
  username?: string;
}

export const LoginStatus: Component<LoginStatusProps> = (props) => {
  return (
    <Show
      when={props.isLoggedIn}
      fallback={<p>Please log in</p>}
    >
      <p>Welcome, {props.username}</p>
    </Show>
  );
};
```

```typescript
// LoginStatus.test.tsx
import { createSignal } from "solid-js";
import { render, screen, cleanup } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";
import { LoginStatus } from "./LoginStatus";

afterEach(() => cleanup());

it("shows login prompt when not logged in", () => {
  render(() => <LoginStatus isLoggedIn={false} />);
  expect(screen.getByText("Please log in")).toBeInTheDocument();
  expect(screen.queryByText(/Welcome/)).not.toBeInTheDocument();
});

it("shows welcome message when logged in", () => {
  render(() => <LoginStatus isLoggedIn={true} username="Alice" />);
  expect(screen.getByText("Welcome, Alice")).toBeInTheDocument();
  expect(screen.queryByText("Please log in")).not.toBeInTheDocument();
});

it("reacts to login state changes", () => {
  const [loggedIn, setLoggedIn] = createSignal(false);

  render(() => <LoginStatus isLoggedIn={loggedIn()} username="Alice" />);

  expect(screen.getByText("Please log in")).toBeInTheDocument();

  setLoggedIn(true);
  expect(screen.getByText("Welcome, Alice")).toBeInTheDocument();
});
```

---

## 2. Signal Tests

### 2.1 Testing a Custom Signal Hook

```typescript
// useToggle.ts
import { createSignal } from "solid-js";

export function useToggle(initial = false) {
  const [value, setValue] = createSignal(initial);
  const toggle = () => setValue((v) => !v);
  return { value, toggle } as const;
}
```

```typescript
// useToggle.test.ts
import { renderHook, cleanup } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";
import { useToggle } from "./useToggle";

afterEach(() => cleanup());

it("starts with initial value", () => {
  const { result } = renderHook(() => useToggle(false));
  expect(result.value()).toBe(false);
});

it("toggles the value", () => {
  const { result } = renderHook(() => useToggle(false));
  result.toggle();
  expect(result.value()).toBe(true);
  result.toggle();
  expect(result.value()).toBe(false);
});

it("accepts custom initial value", () => {
  const { result } = renderHook(() => useToggle(true));
  expect(result.value()).toBe(true);
});
```

### 2.2 Testing Derived Signals (Memos)

```typescript
// useFilteredList.ts
import { createSignal, createMemo, type Accessor } from "solid-js";

export function useFilteredList(items: Accessor<string[]>) {
  const [query, setQuery] = createSignal("");
  const filtered = createMemo(() =>
    items().filter((item) =>
      item.toLowerCase().includes(query().toLowerCase())
    )
  );
  return { query, setQuery, filtered } as const;
}
```

```typescript
// useFilteredList.test.ts
import { createSignal } from "solid-js";
import { renderHook, cleanup } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";
import { useFilteredList } from "./useFilteredList";

afterEach(() => cleanup());

it("filters items by query", () => {
  const [items] = createSignal(["Apple", "Banana", "Cherry"]);
  const { result } = renderHook(() => useFilteredList(items));

  expect(result.filtered()).toEqual(["Apple", "Banana", "Cherry"]);

  result.setQuery("an");
  expect(result.filtered()).toEqual(["Banana"]);
});

it("reacts to items changing", () => {
  const [items, setItems] = createSignal(["Apple", "Banana"]);
  const { result } = renderHook(() => useFilteredList(items));

  result.setQuery("a");
  expect(result.filtered()).toEqual(["Apple", "Banana"]);

  setItems(["Apple", "Banana", "Avocado"]);
  expect(result.filtered()).toEqual(["Apple", "Banana", "Avocado"]);
});
```

---

## 3. Store Tests

### 3.1 Testing Components with Stores

```typescript
// TodoList.tsx
import { createStore, produce } from "solid-js/store";
import { For } from "solid-js";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

export function TodoList() {
  const [store, setStore] = createStore<{ todos: Todo[] }>({ todos: [] });

  const addTodo = (text: string) => {
    setStore("todos", (todos) => [
      ...todos,
      { id: Date.now(), text, done: false },
    ]);
  };

  const toggleTodo = (id: number) => {
    setStore(
      "todos",
      (todo) => todo.id === id,
      "done",
      (done) => !done
    );
  };

  return (
    <div>
      <button onClick={() => addTodo("New Task")}>Add Todo</button>
      <ul>
        <For each={store.todos}>
          {(todo) => (
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => toggleTodo(todo.id)}
                />
                <span class={todo.done ? "done" : ""}>{todo.text}</span>
              </label>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
```

```typescript
// TodoList.test.tsx
import { render, screen, cleanup } from "@solidjs/testing-library";
import { fireEvent } from "@testing-library/dom";
import { afterEach, expect, it } from "vitest";
import { TodoList } from "./TodoList";

afterEach(() => cleanup());

it("adds a todo item", () => {
  render(() => <TodoList />);

  expect(screen.queryByText("New Task")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Add Todo" }));
  expect(screen.getByText("New Task")).toBeInTheDocument();
});

it("toggles a todo item", () => {
  render(() => <TodoList />);

  fireEvent.click(screen.getByRole("button", { name: "Add Todo" }));
  const checkbox = screen.getByRole("checkbox");

  expect(checkbox).not.toBeChecked();
  fireEvent.click(checkbox);
  expect(checkbox).toBeChecked();
});
```

### 3.2 Testing a Store Hook with renderHook

```typescript
// useTodoStore.ts
import { createStore } from "solid-js/store";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

export function useTodoStore() {
  const [store, setStore] = createStore<{ todos: Todo[] }>({ todos: [] });

  return {
    todos: () => store.todos,
    add: (text: string) =>
      setStore("todos", (t) => [...t, { id: t.length + 1, text, done: false }]),
    toggle: (id: number) =>
      setStore("todos", (t) => t.id === id, "done", (d) => !d),
    count: () => store.todos.length,
    doneCount: () => store.todos.filter((t) => t.done).length,
  };
}
```

```typescript
// useTodoStore.test.ts
import { renderHook, cleanup } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";
import { useTodoStore } from "./useTodoStore";

afterEach(() => cleanup());

it("starts empty", () => {
  const { result } = renderHook(() => useTodoStore());
  expect(result.count()).toBe(0);
  expect(result.todos()).toEqual([]);
});

it("adds todos", () => {
  const { result } = renderHook(() => useTodoStore());
  result.add("Write tests");
  result.add("Ship feature");

  expect(result.count()).toBe(2);
  expect(result.todos()[0].text).toBe("Write tests");
});

it("toggles todo done state", () => {
  const { result } = renderHook(() => useTodoStore());
  result.add("Test stores");

  expect(result.doneCount()).toBe(0);
  result.toggle(1);
  expect(result.doneCount()).toBe(1);
});
```

---

## 4. Async Tests

### 4.1 Testing createResource with Suspense

```typescript
// UserProfile.tsx
import { createResource, Suspense } from "solid-js";
import type { Component } from "solid-js";

async function fetchUser(id: string): Promise<{ name: string; email: string }> {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}

export const UserProfile: Component<{ userId: string }> = (props) => {
  const [user] = createResource(() => props.userId, fetchUser);

  return (
    <Suspense fallback={<p>Loading user...</p>}>
      <div>
        <h2>{user()?.name}</h2>
        <p>{user()?.email}</p>
      </div>
    </Suspense>
  );
};
```

```typescript
// UserProfile.test.tsx
import { render, screen, cleanup } from "@solidjs/testing-library";
import { waitFor } from "@testing-library/dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UserProfile } from "./UserProfile";

afterEach(() => cleanup());

beforeEach(() => {
  // Mock the fetch API
  vi.stubGlobal("fetch", vi.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve({ name: "Alice", email: "alice@test.com" }),
    })
  ));
});

it("shows loading state then user data", async () => {
  render(() => <UserProfile userId="1" />);

  // Suspense fallback renders first
  expect(screen.getByText("Loading user...")).toBeInTheDocument();

  // Wait for data to load
  await waitFor(() => {
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  expect(screen.getByText("alice@test.com")).toBeInTheDocument();
  expect(screen.queryByText("Loading user...")).not.toBeInTheDocument();
});
```

### 4.2 Testing with testEffect for Async Signals

```typescript
// useDebounce.ts
import { createSignal, createEffect, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";

export function useDebounce<T>(source: Accessor<T>, delay: number) {
  const [debounced, setDebounced] = createSignal(source());

  createEffect(() => {
    const value = source();
    const timer = setTimeout(() => setDebounced(() => value), delay);
    onCleanup(() => clearTimeout(timer));
  });

  return debounced;
}
```

```typescript
// useDebounce.test.ts
import { createSignal } from "solid-js";
import { renderHook, cleanup } from "@solidjs/testing-library";
import { waitFor } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vitest";
import { useDebounce } from "./useDebounce";

afterEach(() => cleanup());

it("debounces signal updates", async () => {
  vi.useFakeTimers();

  const [value, setValue] = createSignal("initial");
  const { result } = renderHook(() => useDebounce(value, 300));

  expect(result()).toBe("initial");

  setValue("updated");
  // Not yet debounced
  expect(result()).toBe("initial");

  vi.advanceTimersByTime(300);
  expect(result()).toBe("updated");

  vi.useRealTimers();
});
```

---

## 5. Event Tests

### 5.1 Form Input and Submission

```typescript
// SearchForm.tsx
import { createSignal } from "solid-js";
import type { Component } from "solid-js";

interface SearchFormProps {
  onSearch: (query: string) => void;
}

export const SearchForm: Component<SearchFormProps> = (props) => {
  const [query, setQuery] = createSignal("");

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    props.onSearch(query());
  };

  return (
    <form onSubmit={handleSubmit}>
      <label for="search-input">Search</label>
      <input
        id="search-input"
        type="text"
        value={query()}
        onInput={(e) => setQuery(e.currentTarget.value)}
      />
      <button type="submit">Search</button>
    </form>
  );
};
```

```typescript
// SearchForm.test.tsx
import { render, screen, cleanup } from "@solidjs/testing-library";
import { fireEvent } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vitest";
import { SearchForm } from "./SearchForm";

afterEach(() => cleanup());

it("calls onSearch with the query on submit", () => {
  const handleSearch = vi.fn();
  render(() => <SearchForm onSearch={handleSearch} />);

  const input = screen.getByLabelText("Search");
  fireEvent.input(input, { target: { value: "SolidJS" } });
  fireEvent.submit(screen.getByRole("button", { name: "Search" }));

  expect(handleSearch).toHaveBeenCalledWith("SolidJS");
});

it("does not submit with empty query by default", () => {
  const handleSearch = vi.fn();
  render(() => <SearchForm onSearch={handleSearch} />);

  fireEvent.submit(screen.getByRole("button", { name: "Search" }));
  expect(handleSearch).toHaveBeenCalledWith("");
});
```

### 5.2 Keyboard Events

```typescript
// KeyHandler.test.tsx
import { createSignal } from "solid-js";
import { render, screen, cleanup } from "@solidjs/testing-library";
import { fireEvent } from "@testing-library/dom";
import { afterEach, expect, it } from "vitest";

afterEach(() => cleanup());

it("responds to Enter key", () => {
  const [submitted, setSubmitted] = createSignal(false);

  render(() => (
    <input
      data-testid="key-input"
      onKeyDown={(e) => {
        if (e.key === "Enter") setSubmitted(true);
      }}
    />
  ));

  fireEvent.keyDown(screen.getByTestId("key-input"), {
    key: "Enter",
    code: "Enter",
  });

  expect(submitted()).toBe(true);
});
```

### 5.3 Click Events with Multiple Handlers

```typescript
// Accordion.test.tsx
import { render, screen, cleanup } from "@solidjs/testing-library";
import { fireEvent } from "@testing-library/dom";
import { afterEach, expect, it } from "vitest";
import { Accordion } from "./Accordion";

afterEach(() => cleanup());

it("toggles panel visibility on header click", () => {
  render(() => (
    <Accordion
      items={[
        { title: "Section 1", content: "Content 1" },
        { title: "Section 2", content: "Content 2" },
      ]}
    />
  ));

  // Content hidden by default
  expect(screen.queryByText("Content 1")).not.toBeInTheDocument();

  // Click to expand
  fireEvent.click(screen.getByText("Section 1"));
  expect(screen.getByText("Content 1")).toBeInTheDocument();

  // Click again to collapse
  fireEvent.click(screen.getByText("Section 1"));
  expect(screen.queryByText("Content 1")).not.toBeInTheDocument();
});
```

---

## 6. Testing with Router

```typescript
// App.test.tsx
import { render, screen, cleanup } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";
import { App } from "./App";

afterEach(() => cleanup());

it("renders home page at root", async () => {
  render(() => <App />, { location: "/" });
  expect(await screen.findByText("Home")).toBeInTheDocument();
});

it("renders user page with params", async () => {
  render(() => <App />, { location: "/users/42" });
  expect(await screen.findByText("User 42")).toBeInTheDocument();
});

it("renders 404 for unknown routes", async () => {
  render(() => <App />, { location: "/nonexistent" });
  expect(await screen.findByText("Not Found")).toBeInTheDocument();
});
```

---

## 7. Testing with Context Wrapper

```typescript
// ThemeToggle.test.tsx
import { render, screen, cleanup } from "@solidjs/testing-library";
import { fireEvent } from "@testing-library/dom";
import { afterEach, expect, it } from "vitest";
import { ThemeToggle } from "./ThemeToggle";
import { ThemeProvider } from "./ThemeContext";
import type { ParentProps } from "solid-js";

afterEach(() => cleanup());

const TestWrapper = (props: ParentProps) => (
  <ThemeProvider initialTheme="light">{props.children}</ThemeProvider>
);

it("toggles theme via context", () => {
  render(() => <ThemeToggle />, { wrapper: TestWrapper });

  expect(screen.getByText("Current: light")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Toggle Theme" }));
  expect(screen.getByText("Current: dark")).toBeInTheDocument();
});
```
