# Context API — Extended Examples

## 1. Basic Typed Context with Custom Hook

The standard pattern for all context usage in SolidJS:

```tsx
// locale-context.tsx
import { createContext, useContext, createSignal, type ParentProps } from "solid-js";

type Locale = "en" | "nl" | "de" | "fr";

interface LocaleContextValue {
  locale: () => Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextValue>();

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale: must be used within <LocaleProvider>");
  }
  return context;
}

const translations: Record<Locale, Record<string, string>> = {
  en: { greeting: "Hello", farewell: "Goodbye" },
  nl: { greeting: "Hallo", farewell: "Tot ziens" },
  de: { greeting: "Hallo", farewell: "Auf Wiedersehen" },
  fr: { greeting: "Bonjour", farewell: "Au revoir" },
};

export function LocaleProvider(props: ParentProps) {
  const [locale, setLocale] = createSignal<Locale>("en");

  const value: LocaleContextValue = {
    locale,
    setLocale,
    t: (key: string) => translations[locale()]?.[key] ?? key,
  };

  return (
    <LocaleContext.Provider value={value}>
      {props.children}
    </LocaleContext.Provider>
  );
}
```

```tsx
// consumer.tsx
import { useLocale } from "./locale-context";

function Greeting() {
  const { t, locale } = useLocale();
  // t() calls locale() internally — fully reactive
  return <h1>{t("greeting")} ({locale()})</h1>;
}
```

---

## 2. Reactive Context with Signals

Signals passed through context remain fully reactive:

```tsx
// auth-context.tsx
import { createContext, useContext, createSignal, type ParentProps } from "solid-js";

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextValue {
  user: () => User | null;
  isAuthenticated: () => boolean;
  login: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>();

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth: must be used within <AuthProvider>");
  }
  return context;
}

export function AuthProvider(props: ParentProps) {
  const [user, setUser] = createSignal<User | null>(null);

  const value: AuthContextValue = {
    user,
    isAuthenticated: () => user() !== null,
    login: (u: User) => setUser(u),
    logout: () => setUser(null),
  };

  return (
    <AuthContext.Provider value={value}>
      {props.children}
    </AuthContext.Provider>
  );
}
```

```tsx
// nav.tsx
import { Show } from "solid-js";
import { useAuth } from "./auth-context";

function Nav() {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <nav>
      <Show when={isAuthenticated()} fallback={<a href="/login">Login</a>}>
        <span>Welcome, {user()!.name}</span>
        <button onClick={logout}>Logout</button>
      </Show>
    </nav>
  );
}
```

---

## 3. Context with createStore (Complex Reactive State)

For state with nested objects, combine `createStore` with context:

```tsx
// cart-context.tsx
import { createContext, useContext, type ParentProps } from "solid-js";
import { createStore, produce } from "solid-js/store";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  discount: number;
}

interface CartActions {
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  total: () => number;
}

type CartContextValue = [state: CartState, actions: CartActions];

const CartContext = createContext<CartContextValue>();

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart: must be used within <CartProvider>");
  }
  return context;
}

export function CartProvider(props: ParentProps) {
  const [state, setState] = createStore<CartState>({
    items: [],
    discount: 0,
  });

  const actions: CartActions = {
    addItem(item) {
      setState(
        produce((s) => {
          const existing = s.items.find((i) => i.id === item.id);
          if (existing) {
            existing.quantity += 1;
          } else {
            s.items.push({ ...item, quantity: 1 });
          }
        })
      );
    },
    removeItem(id) {
      setState("items", (items) => items.filter((i) => i.id !== id));
    },
    updateQuantity(id, quantity) {
      setState("items", (i) => i.id === id, "quantity", quantity);
    },
    total() {
      return state.items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );
    },
  };

  return (
    <CartContext.Provider value={[state, actions]}>
      {props.children}
    </CartContext.Provider>
  );
}
```

```tsx
// cart-display.tsx
import { For } from "solid-js";
import { useCart } from "./cart-context";

function CartDisplay() {
  const [cart, { removeItem, total }] = useCart();

  return (
    <div>
      <For each={cart.items}>
        {(item) => (
          <div>
            <span>{item.name} x{item.quantity}</span>
            <button onClick={() => removeItem(item.id)}>Remove</button>
          </div>
        )}
      </For>
      <p>Total: ${total().toFixed(2)}</p>
    </div>
  );
}
```

---

## 4. Nested Context Override

Inner Providers override outer Providers for the same context:

```tsx
// theme-context.tsx
import { createContext, useContext, type ParentProps } from "solid-js";

interface ThemeContextValue {
  bg: string;
  fg: string;
  name: string;
}

const themes: Record<string, ThemeContextValue> = {
  light: { bg: "#ffffff", fg: "#000000", name: "Light" },
  dark: { bg: "#1a1a2e", fg: "#e0e0e0", name: "Dark" },
  ocean: { bg: "#0a3d62", fg: "#82ccdd", name: "Ocean" },
};

const ThemeContext = createContext<ThemeContextValue>(themes.light);

export function useTheme(): ThemeContextValue {
  // Default value provided — no undefined check needed
  return useContext(ThemeContext);
}

export function ThemeProvider(
  props: ParentProps<{ theme: keyof typeof themes }>
) {
  return (
    <ThemeContext.Provider value={themes[props.theme]}>
      {props.children}
    </ThemeContext.Provider>
  );
}
```

```tsx
// app.tsx — nested override demonstration
import { ThemeProvider, useTheme } from "./theme-context";

function ThemedCard() {
  const theme = useTheme();
  return (
    <div style={{ background: theme.bg, color: theme.fg, padding: "16px" }}>
      Current theme: {theme.name}
    </div>
  );
}

function App() {
  return (
    <ThemeProvider theme="light">
      <ThemedCard />                       {/* renders Light theme */}
      <ThemeProvider theme="dark">
        <ThemedCard />                     {/* renders Dark theme */}
        <ThemeProvider theme="ocean">
          <ThemedCard />                   {/* renders Ocean theme */}
        </ThemeProvider>
      </ThemeProvider>
    </ThemeProvider>
  );
}
```

---

## 5. Multiple Contexts Composed

Compose multiple context Providers without deep nesting:

```tsx
// providers.tsx
import { type ParentProps, type Component } from "solid-js";
import { AuthProvider } from "./auth-context";
import { CartProvider } from "./cart-context";
import { LocaleProvider } from "./locale-context";

// Helper to compose multiple Providers
function ComposeProviders(props: ParentProps<{ providers: Component<ParentProps>[] }>) {
  return props.providers.reduceRight(
    (children, Provider) => <Provider>{children}</Provider>,
    () => props.children
  )() as unknown as JSX.Element;
}

// Usage in app root
export function AppProviders(props: ParentProps) {
  return (
    <ComposeProviders providers={[AuthProvider, CartProvider, LocaleProvider]}>
      {props.children}
    </ComposeProviders>
  );
}
```

---

## 6. Context with Default Value (Type-Safe without Guard)

When a meaningful default exists, the custom hook does not need an undefined guard:

```tsx
// config-context.tsx
import { createContext, useContext } from "solid-js";

interface AppConfig {
  apiUrl: string;
  maxRetries: number;
  debug: boolean;
}

const defaultConfig: AppConfig = {
  apiUrl: "/api",
  maxRetries: 3,
  debug: false,
};

// Default value provided — useContext NEVER returns undefined
const ConfigContext = createContext<AppConfig>(defaultConfig);

// No guard needed — default always available
export function useConfig(): AppConfig {
  return useContext(ConfigContext);
}
```
