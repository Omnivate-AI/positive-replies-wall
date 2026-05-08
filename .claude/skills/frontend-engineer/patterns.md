# Reference patterns

Concrete code shapes for the disciplines defined in `SKILL.md`. Use these as starting points; adapt to the project's conventions.

## Contents

1. [`lazyWithRetry` — resilient lazy loading](#1-lazywithretry--resilient-lazy-loading)
2. [`ErrorBoundary` — production-grade fallback](#2-errorboundary--production-grade-fallback)
3. [Hybrid controlled / uncontrolled input](#3-hybrid-controlled--uncontrolled-input)
4. [`useFetchWithAbort` — leak-safe data hook](#4-usefetchwithabort--leak-safe-data-hook)
5. [`ApiService` — centralized HTTP client](#5-apiservice--centralized-http-client)
6. [Compound components — Tabs scaffold](#6-compound-components--tabs-scaffold)
7. [State machine — auth flow](#7-state-machine--auth-flow)
8. [Container-query responsive card](#8-container-query-responsive-card)
9. [Fluid typography baseline](#9-fluid-typography-baseline)
10. [Page layout — sticky footer with Grid](#10-page-layout--sticky-footer-with-grid)
11. [Dashboard layout — sidebar + content](#11-dashboard-layout--sidebar--content)
12. [Server Component fetching with explicit cache](#12-server-component-fetching-with-explicit-cache)

---

## 1. `lazyWithRetry` — resilient lazy loading

Lazy chunks fail when a user holds a stale tab through a deploy. Retry, then force-reload on persistent `ChunkLoadError`.

```ts
import { lazy, type ComponentType } from "react";

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 3,
  delay = 1000,
) {
  return lazy(() => {
    return new Promise<{ default: T }>((resolve, reject) => {
      let attempt = 0;
      const tryImport = () =>
        factory()
          .then(resolve)
          .catch((error: Error) => {
            if (error.message.includes("Loading chunk") && attempt === retries) {
              window.location.reload();
              return;
            }
            if (attempt < retries) {
              attempt++;
              setTimeout(tryImport, delay);
            } else {
              reject(error);
            }
          });
      tryImport();
    });
  });
}
```

Wrap usage with `<ErrorBoundary>` + `<Suspense>`.

---

## 2. `ErrorBoundary` — production-grade fallback

Class component (Error Boundaries can't be functional). Logs once and renders fallback UI. Catches render, lifecycle, and constructor errors — **not** event handlers, async, or SSR (handle those at the call site).

```tsx
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; fallback: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Send to your error reporter (Sentry, Datadog, etc.)
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
```

---

## 3. Hybrid controlled / uncontrolled input

A component that supports both modes — pass `value` to control, omit it to let the component manage its own state.

```tsx
import { useState, type ChangeEvent } from "react";

type Props = {
  value?: string;
  defaultValue?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
};

export function Input({ value, defaultValue = "", onChange }: Props) {
  const [internal, setInternal] = useState(defaultValue);
  const isControlled = value !== undefined;
  const current = isControlled ? value : internal;

  return (
    <input
      value={current}
      onChange={(e) => {
        if (!isControlled) setInternal(e.target.value);
        onChange?.(e);
      }}
    />
  );
}
```

---

## 4. `useFetchWithAbort` — leak-safe data hook

Cancels the in-flight request when the component unmounts or the URL changes. Prevents the "can't setState after unmount" warning.

```ts
import { useEffect, useState } from "react";

export function useFetchWithAbort<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    fetch(url, { signal: controller.signal })
      .then((res) => res.json() as Promise<T>)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") {
          setError(e);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [url]);

  return { data, error, loading };
}
```

For real apps, prefer React Query — this is for cases where a dedicated client isn't justified.

---

## 5. `ApiService` — centralized HTTP client

OOP fits when the client has shared state (auth header, base URL, retry policy). One instance, injected where needed.

```ts
type ApiOptions = { baseURL: string; getToken: () => string | null };

export class ApiService {
  constructor(private readonly options: ApiOptions) {}

  private headers(): HeadersInit {
    const token = this.options.getToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.options.baseURL}${path}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  async post<T, B>(path: string, body: B): Promise<T> {
    const res = await fetch(`${this.options.baseURL}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  }
}
```

---

## 6. Compound components — Tabs scaffold

Parent owns state via context; children read it implicitly. No prop drilling, expressive API.

```tsx
import { createContext, useContext, useState, type ReactNode } from "react";

type TabsCtx = { value: string; setValue: (v: string) => void };
const TabsContext = createContext<TabsCtx | null>(null);
const useTabs = () => {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs subcomponent used outside <Tabs>");
  return ctx;
};

export function Tabs({ defaultValue, children }: { defaultValue: string; children: ReactNode }) {
  const [value, setValue] = useState(defaultValue);
  return <TabsContext.Provider value={{ value, setValue }}>{children}</TabsContext.Provider>;
}

Tabs.List = function List({ children }: { children: ReactNode }) {
  return <div role="tablist">{children}</div>;
};

Tabs.Trigger = function Trigger({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useTabs();
  const active = ctx.value === value;
  return (
    <button role="tab" aria-selected={active} onClick={() => ctx.setValue(value)}>
      {children}
    </button>
  );
};

Tabs.Content = function Content({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useTabs();
  return ctx.value === value ? <div role="tabpanel">{children}</div> : null;
};
```

For production, prefer Radix UI / shadcn primitives — this scaffold is for understanding the pattern.

---

## 7. State machine — auth flow

Explicit states + transitions kill conditional spaghetti. Each transition is a method; the UI reads `state` and renders deterministically.

```ts
type AuthState = "idle" | "loading" | "authenticated" | "error";

export class AuthMachine {
  private state: AuthState = "idle";
  private listeners = new Set<(s: AuthState) => void>();

  subscribe(fn: (s: AuthState) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(next: AuthState) {
    this.state = next;
    this.listeners.forEach((fn) => fn(next));
  }

  start() {
    if (this.state === "idle" || this.state === "error") this.set("loading");
  }
  succeed() {
    if (this.state === "loading") this.set("authenticated");
  }
  fail() {
    if (this.state === "loading") this.set("error");
  }
  reset() {
    this.set("idle");
  }
  current() {
    return this.state;
  }
}
```

For complex flows, prefer XState — this is for ad-hoc cases where a library is overkill.

---

## 8. Container-query responsive card

Component responds to its parent's width, not the viewport — so the same card adapts in a sidebar vs. full-width context.

```tsx
export function CardShell({ children }: { children: ReactNode }) {
  return (
    <div className="card-container">
      <article className="card">{children}</article>
    </div>
  );
}
```

```css
.card-container {
  container-type: inline-size;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

@container (min-width: 480px) {
  .card {
    flex-direction: row;
    align-items: center;
  }
}
```

---

## 9. Fluid typography baseline

No breakpoints needed for type scale — it interpolates smoothly between min and max viewport widths.

```css
:root {
  --fs-body: clamp(1rem, 0.92rem + 0.4vw, 1.125rem);
  --fs-h1:   clamp(2rem, 1.4rem + 3vw, 3.5rem);
  --fs-h2:   clamp(1.5rem, 1.15rem + 1.75vw, 2.5rem);
  --fs-h3:   clamp(1.25rem, 1.05rem + 1vw, 1.75rem);
}

body { font-size: var(--fs-body); }
h1 { font-size: var(--fs-h1); }
h2 { font-size: var(--fs-h2); }
h3 { font-size: var(--fs-h3); }
```

---

## 10. Page layout — sticky footer with Grid

Three-row grid: header, content (takes remaining space), footer. No flexbox hacks needed.

```tsx
export function PageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <header>{/* nav */}</header>
      <main>{children}</main>
      <footer>{/* footer */}</footer>
    </div>
  );
}
```

```css
.page {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 100dvh;
}
```

`100dvh` (not `100vh`) — accounts for mobile browser chrome correctly.

---

## 11. Dashboard layout — sidebar + content

Two-column grid; nest another grid inside `main` for widgets.

```css
.dashboard {
  display: grid;
  grid-template-columns: 250px 1fr;
  min-height: 100dvh;
}

.dashboard-main {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  padding: 1rem;
}
```

`auto-fit` + `minmax` gives responsive widget tiling without media queries.

---

## 12. Server Component fetching with explicit cache

Default fetch is cached indefinitely in Next.js App Router. Be explicit about which strategy you want — never rely on the default silently.

```tsx
// SSG (build-time, cached forever)
export default async function Page() {
  const data = await fetch("https://api.example.com/posts", {
    cache: "force-cache",
  }).then((r) => r.json());
  return <PostList posts={data} />;
}

// ISR (cached, revalidates after 60s)
const data = await fetch("https://api.example.com/posts", {
  next: { revalidate: 60 },
}).then((r) => r.json());

// SSR (fresh every request)
const data = await fetch("https://api.example.com/posts", {
  cache: "no-store",
}).then((r) => r.json());

// Tagged ISR (revalidate on demand via revalidateTag("posts"))
const data = await fetch("https://api.example.com/posts", {
  next: { tags: ["posts"] },
}).then((r) => r.json());
```

For Cache Components / PPR / `use cache`, defer to `vercel:next-cache-components`.
