# Control Flow Examples (SolidJS JSX)

## 1. Conditional Rendering with Show

### Basic Show with Fallback

```typescript
import { createSignal, Show } from "solid-js";

function AuthGate() {
  const [isLoggedIn, setIsLoggedIn] = createSignal(false);

  return (
    <Show when={isLoggedIn()} fallback={<LoginForm onLogin={() => setIsLoggedIn(true)} />}>
      <Dashboard />
    </Show>
  );
}
```

### Show with Render Function (Type Narrowing)

```typescript
import { createSignal, Show } from "solid-js";

interface User {
  id: number;
  name: string;
  email: string;
}

function UserProfile() {
  const [user, setUser] = createSignal<User | null>(null);

  return (
    <Show when={user()} fallback={<p>Loading user...</p>}>
      {(u) => (
        <div class="profile">
          <h2>{u().name}</h2>
          <p>{u().email}</p>
        </div>
      )}
    </Show>
  );
}
```

The render function `(u)` receives an `Accessor<User>` -- guaranteed non-null. ALWAYS call `u()` to read the value.

### Show with Keyed Prop

```typescript
import { createSignal, Show } from "solid-js";

function SelectedItem() {
  const [selected, setSelected] = createSignal<Item | null>(null);

  return (
    // keyed: re-renders children when the OBJECT REFERENCE changes
    // Without keyed: only re-renders when truthiness changes (null → object or object → null)
    <Show when={selected()} keyed>
      <ItemEditor item={selected()!} />
    </Show>
  );
}
```

### Nested Show for Multiple Conditions

```typescript
import { createSignal, Show } from "solid-js";

function DataView() {
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [data, setData] = createSignal<Data | null>(null);

  return (
    <Show when={!loading()} fallback={<Spinner />}>
      <Show when={!error()} fallback={<ErrorMessage message={error()!} />}>
        <Show when={data()}>
          {(d) => <DataDisplay data={d()} />}
        </Show>
      </Show>
    </Show>
  );
}
```

**Note**: For 3+ branches, prefer `<Switch>/<Match>` over nested `<Show>`.

---

## 2. List Rendering with For

### Basic List

```typescript
import { createSignal, For } from "solid-js";

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

function TodoList() {
  const [todos, setTodos] = createSignal<Todo[]>([]);

  return (
    <ul>
      <For each={todos()} fallback={<li>No todos yet. Add one!</li>}>
        {(todo, index) => (
          <li>
            <span>#{index() + 1}</span>
            <span>{todo.text}</span>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => {
                setTodos(prev => prev.map((t, i) =>
                  i === index() ? { ...t, completed: !t.completed } : t
                ));
              }}
            />
          </li>
        )}
      </For>
    </ul>
  );
}
```

### For with Store (Fine-Grained Updates)

```typescript
import { For } from "solid-js";
import { createStore } from "solid-js/store";

interface Task {
  id: number;
  title: string;
  done: boolean;
}

function TaskBoard() {
  const [state, setState] = createStore<{ tasks: Task[] }>({
    tasks: [
      { id: 1, title: "Design", done: false },
      { id: 2, title: "Implement", done: false },
    ],
  });

  return (
    <For each={state.tasks}>
      {(task, index) => (
        <div>
          <span>{task.title}</span>
          <button onClick={() => setState("tasks", index(), "done", true)}>
            Complete
          </button>
        </div>
      )}
    </For>
  );
}
```

---

## 3. List Rendering with Index (Primitives)

### Editable String List

```typescript
import { createSignal, Index } from "solid-js";

function TagEditor() {
  const [tags, setTags] = createSignal(["typescript", "solidjs", "reactive"]);

  return (
    <div>
      <Index each={tags()}>
        {(tag, i) => (
          <input
            value={tag()}
            onInput={(e) => {
              setTags(prev => {
                const next = [...prev];
                next[i] = (e.target as HTMLInputElement).value;
                return next;
              });
            }}
          />
        )}
      </Index>
      <button onClick={() => setTags(prev => [...prev, ""])}>
        Add Tag
      </button>
    </div>
  );
}
```

### Index for Number Grid

```typescript
import { createSignal, Index } from "solid-js";

function ScoreBoard() {
  const [scores, setScores] = createSignal([0, 0, 0, 0]);

  return (
    <div class="scoreboard">
      <Index each={scores()}>
        {(score, i) => (
          <div class="player">
            <span>Player {i + 1}: {score()}</span>
            <button onClick={() => {
              setScores(prev => {
                const next = [...prev];
                next[i] = next[i] + 1;
                return next;
              });
            }}>
              +1
            </button>
          </div>
        )}
      </Index>
    </div>
  );
}
```

---

## 4. Multi-Branch Conditionals with Switch/Match

### View Router

```typescript
import { createSignal, Switch, Match } from "solid-js";

type Route = "home" | "about" | "settings" | "profile";

function App() {
  const [route, setRoute] = createSignal<Route>("home");

  return (
    <div>
      <nav>
        <button onClick={() => setRoute("home")}>Home</button>
        <button onClick={() => setRoute("about")}>About</button>
        <button onClick={() => setRoute("settings")}>Settings</button>
        <button onClick={() => setRoute("profile")}>Profile</button>
      </nav>

      <Switch fallback={<p>Page not found</p>}>
        <Match when={route() === "home"}><HomePage /></Match>
        <Match when={route() === "about"}><AboutPage /></Match>
        <Match when={route() === "settings"}><SettingsPage /></Match>
        <Match when={route() === "profile"}><ProfilePage /></Match>
      </Switch>
    </div>
  );
}
```

### Match with Render Functions (Type Narrowing)

```typescript
import { createSignal, Switch, Match } from "solid-js";

type ApiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: string[] }
  | { status: "error"; message: string };

function DataFetcher() {
  const [state, setState] = createSignal<ApiState>({ status: "idle" });

  return (
    <Switch>
      <Match when={state().status === "idle"}>
        <button onClick={() => fetchData(setState)}>Load Data</button>
      </Match>
      <Match when={state().status === "loading"}>
        <Spinner />
      </Match>
      <Match when={state().status === "success" && (state() as any).data}>
        {(data) => (
          <ul>
            <For each={data() as unknown as string[]}>
              {(item) => <li>{item}</li>}
            </For>
          </ul>
        )}
      </Match>
      <Match when={state().status === "error"}>
        <p class="error">Error occurred</p>
      </Match>
    </Switch>
  );
}
```

---

## 5. Dynamic Component/Element

### Tab Panel with Dynamic

```typescript
import { createSignal, Component } from "solid-js";
import { Dynamic } from "solid-js/web";

const GeneralSettings: Component = () => <div>General settings form</div>;
const SecuritySettings: Component = () => <div>Security settings form</div>;
const NotificationSettings: Component = () => <div>Notification preferences</div>;

const tabs: Record<string, Component> = {
  general: GeneralSettings,
  security: SecuritySettings,
  notifications: NotificationSettings,
};

function SettingsPanel() {
  const [activeTab, setActiveTab] = createSignal("general");

  return (
    <div>
      <nav>
        {Object.keys(tabs).map(key => (
          <button
            class={activeTab() === key ? "active" : ""}
            onClick={() => setActiveTab(key)}
          >
            {key}
          </button>
        ))}
      </nav>
      <Dynamic component={tabs[activeTab()]} />
    </div>
  );
}
```

### Polymorphic "as" Pattern

```typescript
import { Component, mergeProps } from "solid-js";
import { Dynamic } from "solid-js/web";

interface BoxProps {
  as?: string | Component;
  class?: string;
  children: JSX.Element;
}

function Box(props: BoxProps) {
  const merged = mergeProps({ as: "div" as string | Component }, props);
  return (
    <Dynamic component={merged.as} class={merged.class}>
      {props.children}
    </Dynamic>
  );
}

// Usage:
function App() {
  return (
    <div>
      <Box>Default div</Box>
      <Box as="section">A section element</Box>
      <Box as="article" class="prose">An article element</Box>
      <Box as={CustomCard}>A custom component</Box>
    </div>
  );
}
```

---

## 6. Portal Patterns

### Modal Dialog

```typescript
import { createSignal, Show } from "solid-js";
import { Portal } from "solid-js/web";

function ModalExample() {
  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <div>
      <button onClick={() => setIsOpen(true)}>Open Modal</button>

      <Show when={isOpen()}>
        <Portal mount={document.getElementById("modal-root")!}>
          <div class="modal-overlay" onClick={() => setIsOpen(false)}>
            <div class="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>Modal Title</h2>
              <p>Modal body content</p>
              <button onClick={() => setIsOpen(false)}>Close</button>
            </div>
          </div>
        </Portal>
      </Show>
    </div>
  );
}
```

### Tooltip with Shadow DOM

```typescript
import { createSignal, Show } from "solid-js";
import { Portal } from "solid-js/web";

function TooltipExample() {
  const [showTip, setShowTip] = createSignal(false);

  return (
    <span
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      Hover me
      <Show when={showTip()}>
        <Portal useShadow>
          <style>{`.tooltip { background: #333; color: white; padding: 4px 8px; border-radius: 4px; }`}</style>
          <div class="tooltip">Tooltip content</div>
        </Portal>
      </Show>
    </span>
  );
}
```

---

## 7. Suspense with Resources

### Basic Suspense

```typescript
import { createResource, Suspense } from "solid-js";

async function fetchUser(id: number): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}

function UserPage() {
  const [user] = createResource(() => 1, fetchUser);

  return (
    <Suspense fallback={<div class="skeleton">Loading user...</div>}>
      <UserProfile user={user()!} />
    </Suspense>
  );
}
```

### Nested Suspense (Independent Loading)

```typescript
import { createResource, Suspense } from "solid-js";

function DashboardPage() {
  const [user] = createResource(fetchCurrentUser);
  const [stats] = createResource(fetchDashboardStats);
  const [feed] = createResource(fetchActivityFeed);

  return (
    <Suspense fallback={<HeaderSkeleton />}>
      <Header user={user()!} />

      <div class="dashboard-grid">
        <Suspense fallback={<StatsSkeleton />}>
          <StatsPanel stats={stats()!} />
        </Suspense>

        <Suspense fallback={<FeedSkeleton />}>
          <ActivityFeed items={feed()!} />
        </Suspense>
      </div>
    </Suspense>
  );
}
```

Each Suspense boundary resolves independently -- the header can show before stats, stats before feed.

---

## 8. Namespaced Attributes

### Class Toggle

```typescript
function NavItem(props: { href: string; active: boolean; children: JSX.Element }) {
  return (
    <a
      href={props.href}
      class="nav-item"
      class:active={props.active}
      class:highlighted={props.active}
    >
      {props.children}
    </a>
  );
}
```

### Native Event Listeners

```typescript
function ScrollTracker() {
  const [scrollY, setScrollY] = createSignal(0);

  return (
    <div
      on:scroll={(e) => setScrollY((e.target as HTMLElement).scrollTop)}
      style={{ height: "300px", overflow: "auto" }}
    >
      <p>Scroll position: {scrollY()}</p>
      <div style={{ height: "1000px" }}>Scrollable content</div>
    </div>
  );
}
```

### Custom Directive

```typescript
import { onCleanup } from "solid-js";

// Directive definition:
function clickOutside(element: Element, accessor: () => () => void): void {
  const onClick = (e: Event) => {
    if (!element.contains(e.target as Node)) {
      accessor()();
    }
  };
  document.addEventListener("click", onClick);
  onCleanup(() => document.removeEventListener("click", onClick));
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
      <button onClick={() => setOpen(true)}>Toggle</button>
      <Show when={open()}>
        <div class="dropdown-menu">Menu content</div>
      </Show>
    </div>
  );
}
```

---

## 9. Style Object Syntax

```typescript
function StyledComponent() {
  const [isActive, setIsActive] = createSignal(false);

  return (
    <div
      style={{
        color: isActive() ? "green" : "gray",
        "font-weight": isActive() ? "bold" : "normal",
        "font-size": "1.2rem",
        padding: "8px 16px",
        "border-radius": "4px",
      }}
    >
      Status: {isActive() ? "Active" : "Inactive"}
    </div>
  );
}
```

ALWAYS use kebab-case for CSS property names in style objects (e.g., `"font-size"` not `fontSize`). SolidJS style objects do NOT use camelCase like React.
