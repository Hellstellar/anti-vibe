# React Best Practices — Migration Factory Dashboard

**Version 1.0.0**

> **Note:** This document guides agents and LLMs (and humans) when generating, reviewing, or
> refactoring code in this repository. It is React-only: this project is a client-side
> Vite SPA (React 19, react-router-dom 7). There is **no SSR, no Next.js, no React Server
> Components** — guidance involving those is intentionally out of scope.
>
> Sources: [react.dev](https://react.dev) (Rules of React, *You Might Not Need an Effect*,
> Escape Hatches), [Testing Library docs](https://testing-library.com), Kent C. Dodds'
> *Common Mistakes with React Testing Library*, and Vercel's React performance guidance,
> adapted to this codebase (see `CLAUDE.md` for architecture).

---

## Table of Contents

1. [Rules of React](#1-rules-of-react) — **NON-NEGOTIABLE**
2. [Component Design](#2-component-design) — **HIGH**
3. [State Management](#3-state-management) — **HIGH**
4. [Effects Discipline](#4-effects-discipline) — **HIGH**
5. [Data Fetching & Async](#5-data-fetching--async) — **HIGH**
6. [Re-render & Rendering Performance](#6-re-render--rendering-performance) — **MEDIUM**
7. [Bundle Size & Code Splitting](#7-bundle-size--code-splitting) — **MEDIUM**
8. [TypeScript Conventions](#8-typescript-conventions) — **HIGH**
9. [Routing](#9-routing) — **MEDIUM**
10. [Architecture & Module Boundaries](#10-architecture--module-boundaries) — **HIGH**
11. [Accessibility](#11-accessibility) — **MEDIUM**
12. [Testing Practices](#12-testing-practices) — **HIGH**
13. [JavaScript Performance](#13-javascript-performance) — **LOW-MEDIUM**
14. [Styling & Tailwind CSS](#14-styling--tailwind-css) — **MEDIUM**
15. [Configuration & Hardcoded Values](#15-configuration--hardcoded-values) — **MEDIUM**

---

## 1. Rules of React

**Impact: NON-NEGOTIABLE.** Breaking these produces bugs that are hard to trace.
Reference: [react.dev/reference/rules](https://react.dev/reference/rules)

### 1.1 Components and hooks must be pure

- **Idempotent rendering** — a component must return the same JSX for the same props, state,
  and context. No `Math.random()`, `Date.now()`, or mutation of external variables during render.
- **Side effects never run during render** — they belong in event handlers or, if there is no
  triggering event, in `useEffect`.
- **Props and state are immutable** — never mutate them. Use immutable operations
  (`toSorted()`, `toReversed()`, spread) instead of `sort()`/`reverse()`/`push()` on props,
  state, or anything returned from a hook.

```tsx
// ❌ Mutates the prop array
const sorted = useMemo(() => stacks.sort(byName), [stacks])

// ✅ New array, original untouched
const sorted = useMemo(() => stacks.toSorted(byName), [stacks])
```

### 1.2 Rules of hooks

- Call hooks only at the top level of a component or custom hook — never in loops,
  conditions, nested functions, or after an early return.
- Never call component functions directly (`StageDetailView()`); render them via JSX so React
  manages the lifecycle.
- `eslint-plugin-react-hooks` is enabled in `eslint.config.js`; its errors are never to be
  suppressed with `eslint-disable` without a comment explaining why and a reviewer's agreement.

---

## 2. Component Design

### 2.1 Never define components inside components

A nested component definition is a new type every render: React unmounts and remounts it,
destroying state, DOM, and focus. Hoist it to module scope and pass props.

```tsx
// ❌ Remounts on every ParentView render; inputs lose focus
function ParentView({ project }) {
  const Row = () => <div>{project.name}</div>
  return <Row />
}

// ✅ Module scope, props in
function Row({ name }: { name: string }) {
  return <div>{name}</div>
}
```

### 2.2 Prefer composition over configuration

Pass `children` / slots instead of growing boolean/config props. Extract a smaller component
before adding a fourth conditional branch to JSX.

### 2.3 Explicit conditional rendering

Use ternaries (`cond ? <X /> : null`) instead of `&&` whenever the condition can be `0`,
`NaN`, or `''` — otherwise the falsy value itself renders.

```tsx
// ❌ Renders "0" when count is 0
{ewiCount && <Badge count={ewiCount} />}

// ✅
{ewiCount > 0 ? <Badge count={ewiCount} /> : null}
```

### 2.4 Reset state with `key`, not effects

When a component should reset its internal state because an identity changed (project id,
stage id), pass that identity as `key` instead of syncing state in an effect.

```tsx
<StageWorkspace key={stageId} stageId={stageId} />
```

### 2.5 Stable, meaningful list keys

Keys come from domain identity (`project.id`, `stage.id`), never array index when items can
reorder, insert, or delete.

### 2.6 When to split a component

Split a component into children when **any** of these holds:

| Split when… | Why |
|---|---|
| It has more than one responsibility | Single responsibility — *Thinking in React* |
| Its JSX/logic is too long to scan in one screen (~150 lines is a smell, not a hard limit) | Readability and reviewability |
| The same markup appears more than once | Reuse |
| A subtree re-renders often while its props are stable | Isolate it and wrap in `memo` (§6.1) |
| An expensive subtree blocks an early return | Extract it so the parent can `return` before computing it |
| A part owns state nothing else reads | Keep state local to where it's used |
| A part needs its own focused test | Testability |

**Counter-rule — don't over-split.** Do not extract a component that is used exactly once,
gives no re-render or early-return benefit, and only forwards props. A wrapper that exists
solely to "look tidy" adds an indirection layer and a prop-passing surface that costs more
to read and maintain than the inline JSX it replaced. Extract for a reason from the table
above, not by reflex.

```tsx
// ❌ Over-split: used once, no perf/early-return benefit, pure pass-through
function StageTitle({ title }: { title: string }) {
  return <h2 className="text-lg font-semibold">{title}</h2>
}
// caller: <StageTitle title={stage.name} />  — just inline the <h2>

// ✅ Worth splitting: reused per row AND re-renders often with stable props
const StageRow = memo(function StageRow({ stage }: { stage: Stage }) {
  return <li>{/* … */}</li>
})
```

### 2.7 Designing for reuse

Reuse is a payoff, not a starting goal. Apply the **rule of three**: inline the first
occurrence, tolerate the second, abstract on the third — real duplication, not guessed-at
future duplication. Premature generalization produces props nobody uses and indirection
everybody pays for (this is the §2.6 counter-rule applied to abstraction).

When you do extract for reuse, follow these rules:

- **Reuse logic with custom hooks, not copy-paste.** Duplicated state/effect/data logic
  (e.g. the fetch-with-race pattern of §5.3, subscriptions, derived selection) belongs in a
  `useXxx` hook in the owning feature's `hooks/`. Components stay about markup; hooks carry
  reusable behavior.
- **Separate presentational from container.** A reusable visual component takes data and
  callbacks via props and holds no fetching or app state; a container/hook supplies them.
  This is what makes the visual piece reusable and testable in isolation.
- **Keep the prop API minimal and composable.** Prefer `children`/slots and a few orthogonal
  props over a wide config object or a pile of booleans. Provide sensible defaults (hoisted
  to module constants per §6.1). For reusable inputs, decide controlled vs uncontrolled and
  document it; don't half-support both.
- **Place by reach:**
  - Truly generic, app-wide primitives → `src/components/ui/` (shadcn/Base UI layer) — never
    fork these per feature (§10).
  - Reused within one feature → that feature's `components/`, exported through its barrel.
  - Shared across features but domain-specific → promote to a shared location only when a
    second feature actually needs it, and import it through a barrel — not a deep path.
- **Don't reach across feature internals to reuse.** If feature B wants feature A's piece,
  that piece is no longer feature-private: lift it to a shared/ui location rather than
  importing `features/a/components/...` from B (§10).

```tsx
// ❌ Same fetch+race logic copied into three workspaces
// ✅ One reusable hook, three thin consumers
function useStageReport(projectId: string, stageId: string) {
  const [report, setReport] = useState<StageReport | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    fetchStageReport(projectId, stageId, { signal: controller.signal })
      .then((r) => { if (active) setReport(r) })
      .catch((err) => { if (active && !isAbortError(err)) setReport(null) })
    return () => { active = false; controller.abort() }
  }, [projectId, stageId])
  return report
}
```

---

## 3. State Management

### 3.1 Derive, don't store

If a value can be computed from existing props/state, compute it during render. Do not mirror
it into `useState` + `useEffect` — that causes extra renders and state drift.

```tsx
// ❌ const [selected, setSelected] = useState(...); useEffect(() => setSelected(find(...)), [...])
// ✅
const selected = items.find((i) => i.id === selectedId) ?? null
```

### 3.2 Functional `setState` updates

Any update that depends on the previous value uses the functional form. This removes the
state from `useCallback`/`useEffect` dependency arrays and eliminates stale-closure bugs.

```tsx
setItems((curr) => [...curr, ...newItems])
```

### 3.3 Lazy state initialization

Pass an initializer function to `useState` when the initial value is expensive
(parsing `localStorage`, building an index): `useState(() => readStoredConnections())`.

### 3.4 `useRef` for transient, non-rendered values

Values that change frequently but don't affect output (in-flight request ids, timers, last
pointer position) live in refs, not state.

### 3.5 Context provider hygiene

This app composes many providers (`ConnectionProvider` → `ProjectProvider` →
`ProjectStateProvider` → …). For every provider:

- **Memoize the context value** (`useMemo`) so consumers don't re-render on every provider
  render.
- **Split contexts by change frequency** — fast-changing values (selection) must not share a
  context with slow-changing values (project list), or every consumer pays for every change.
- Expose a typed hook (`useProjectState()`) that throws when used outside its provider;
  never export the raw context.

### 3.6 `localStorage` access is versioned and guarded

Wrap `getItem`/`setItem` in `try/catch` (throws in private browsing / quota exceeded),
version keys (`prefs:v1`), and store only the fields the UI needs — never whole API objects.

The next rules (§3.7–§3.12) are about **state structure** — keeping state as simple as it can be
so it's hard to put into an invalid or out-of-sync shape. Reference:
[Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure),
[Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer),
[Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context),
[Scaling Up with Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context).

### 3.7 Group related state; avoid contradictory state

State values that always change together belong in one variable, and mutually-exclusive flags
collapse into one `status` union — never a set of booleans that can contradict each other.

```tsx
// ❌ isSending + isSent can both be true — an impossible state
const [isSending, setIsSending] = useState(false)
const [isSent, setIsSent] = useState(false)

// ✅ One status; impossible states are unrepresentable
type Status = 'editing' | 'sending' | 'sent'
const [status, setStatus] = useState<Status>('editing')
```

Pair `x`/`y`, `start`/`end`, etc. into one object so they can't drift apart.

### 3.8 Avoid redundant and duplicated state

Anything derivable from props or other state is computed during render, not stored (this is §3.1
seen from the structure angle). Data that lives in a list is referenced by **id**, not copied into
a second state variable that then has to be kept in sync.

```tsx
// ❌ selectedItem duplicates an entry already in items — they desync on edit
const [selectedItem, setSelectedItem] = useState(items[0])

// ✅ Store the id; derive the object during render
const [selectedId, setSelectedId] = useState(items[0].id)
const selectedItem = items.find((i) => i.id === selectedId) ?? null
```

### 3.9 Avoid deeply nested state

Deeply nested/tree-shaped state is painful to update immutably. Normalize it into flat,
id-keyed maps where parents hold arrays of child ids — update by id instead of walking the tree.

### 3.10 Use a reducer for complex, multi-action state

When several event handlers update the same state in different ways, or updates are non-trivial,
consolidate the logic into a `useReducer`. The reducer is **pure** (same inputs → same output, no
side effects, immutable updates) and each action names **one user interaction** (`'added'`,
`'reset_form'`) — not one low-level setter. This separates "what happened" (handlers) from "how
state changes" (reducer), and makes transitions testable and loggable.

```tsx
const [tasks, dispatch] = useReducer(tasksReducer, initialTasks)
function handleAddTask(text: string) {
  dispatch({ type: 'added', text }) // intent, not mechanics
}
```

### 3.11 Reach for context only when props/composition won't do

Prop drilling depth alone does not justify context. Try first: pass props explicitly, or extract
components and pass JSX via `children` so intermediate layers don't thread props. Use context only
for data **many distant components** genuinely need (theme, current user/project, app-wide state).
When you do, follow the provider hygiene in §3.5.

### 3.12 Scale shared state with reducer + context

For app- or feature-wide state that many nested components read and update, combine a reducer with
context: expose **two** contexts — state and `dispatch` — from a provider that owns the
`useReducer`, and consume them through typed hooks (`useTasks()` / `useTasksDispatch()`). Splitting
state and dispatch keeps dispatch-only consumers from re-rendering on state changes, and keeps
components free of data plumbing.

```tsx
const TasksContext = createContext<Task[] | null>(null)
const TasksDispatchContext = createContext<Dispatch<TaskAction> | null>(null)

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, dispatch] = useReducer(tasksReducer, initialTasks)
  return (
    <TasksContext value={tasks}>
      <TasksDispatchContext value={dispatch}>{children}</TasksDispatchContext>
    </TasksContext>
  )
}
```

---

## 4. Effects Discipline

Reference: [react.dev/learn/you-might-not-need-an-effect](https://react.dev/learn/you-might-not-need-an-effect)

Effects exist for one purpose: **synchronizing with an external system** (network, browser
APIs, third-party widgets like mermaid/neovis). Before writing `useEffect`, check:

| Situation | Use instead of an effect |
|---|---|
| Transforming data for rendering | Compute during render (or `useMemo`) |
| Responding to a user action | The event handler itself |
| Resetting state when a prop changes | `key` prop |
| Chained state updates | Compute everything in one handler |
| Notifying the parent | Call the callback in the same handler |
| Subscribing to an external store | `useSyncExternalStore` |
| App-wide one-time init | Module-level code in `main.tsx`, or a module-level guard |

### 4.1 Effects need cleanup

Every subscription, timer, observer, and fetch inside an effect returns a cleanup function.
Data-fetching effects must guard against races (see §5.3).

### 4.2 Narrow dependencies

Depend on the primitives you read (`project.id`), not whole objects (`project`). Derive
booleans outside the effect so it runs on transitions, not every pixel/value change.

### 4.3 Don't suppress the exhaustive-deps lint

Restructure the code (move object creation inside the effect, use functional setState,
extract an event handler) instead of disabling the rule.

---

## 5. Data Fetching, Async & Errors

This repo has a strict layered flow: `apiClient` → `services/*` → contexts/hooks →
components. Best practices attach to each layer.

### 5.1 All HTTP goes through the service layer

Components and hooks never call `fetch` or `apiGetJson` directly. Each resource has a
service in `src/services/` that fetches **and maps raw API JSON into typed domain models**
from `src/types/*`. Follow the established **`404 → null`** convention for "not generated
yet" artifacts — the UI renders empty states, not errors.

### 5.2 Parallelize independent requests

Sequential `await`s of independent calls are waterfalls — the #1 avoidable latency cost.

```ts
// ❌ 3 round trips
const state = await fetchProjectState(id)
const metadata = await fetchDiscoveryMetadata(id)
const report = await fetchDiscoveryReport(id)

// ✅ 1 round trip
const [state, metadata, report] = await Promise.all([
  fetchProjectState(id),
  fetchDiscoveryMetadata(id),
  fetchDiscoveryReport(id),
])
```

When one call depends on another, chain only the dependent part
(`fetchState(id).then(s => fetchStage(s.activeStage))`) and keep the rest parallel.
Defer an `await` into the branch that actually uses its result.

### 5.3 Fetch-in-effect must handle races and unmounts

When a hook fetches on param change, stale responses must not overwrite fresh ones:

```tsx
useEffect(() => {
  const controller = new AbortController()
  let active = true
  fetchProjectState(projectId, { signal: controller.signal })
    .then((state) => { if (active) setState(state) })
    .catch((err) => { if (active && !isAbortError(err)) setError(err) })
  return () => { active = false; controller.abort() }
}, [projectId])
```

### 5.4 Error handling is typed and layered

Services throw `ApiHttpError`; hooks/contexts catch it and translate to UI state
(loading / empty / error). Components never parse raw error bodies.

### 5.5 Loading and pending UX

Prefer `useTransition` / `useDeferredValue` for non-urgent updates (filtering large stack
lists, graph re-layout) over hand-rolled `isLoading` flags, and keep urgent input updates
synchronous.

### 5.6 Error boundaries contain render-time crashes

Try/catch does **not** catch errors thrown during render — only an error boundary does. This
SPA must never white-screen because one component threw.

- **App-level boundary** wraps the whole tree (in/around `main.tsx`) and renders a recoverable
  fallback ("Something went wrong — reload"), never a blank page.
- **Per-route / per-workspace boundaries** wrap each stage workspace rendered by
  `StageDetailView`, so a crash in one stage view (graphs, markdown, or registry data of an
  unexpected shape) degrades to a local error panel while the shell, sidebar, and other routes
  keep working.
- **Reset on navigation** — key the route-level boundary by route/project/stage id so moving
  away clears the error instead of stickiness.
- Boundaries are the render-time safety net for the untrusted-shape data this app renders
  (markdown, mermaid/neovis sources, generated artifacts). Validate/guard shape in the service
  layer where you can; the boundary is the backstop for what slips through.

```tsx
<RouteErrorBoundary key={stageId} fallback={<StageErrorPanel stageId={stageId} />}>
  <StageWorkspace stageId={stageId} />
</RouteErrorBoundary>
```

### 5.7 Errors in event handlers & no silent swallow

- **Event handlers and non-effect async** (click handlers, `userEvent`-driven submits,
  `import()` for lazy chunks) are outside both effects and error boundaries — wrap them in
  `try/catch`, surface a user-visible error (toast / inline message), and reset any pending
  state in `finally`.
- **Never show raw errors to users.** No stack traces or raw `ApiHttpError` bodies in the UI;
  map to a human message. Log the detail to the console / reporting channel, not the screen.
- **Never swallow errors silently.** An empty `catch {}` is allowed only when the failure is
  genuinely ignorable (e.g. the §3.6 `localStorage` guard) and **must carry a comment saying
  why**. Otherwise translate the error to UI state or rethrow — don't drop it.

```tsx
async function handleExport() {
  try {
    setExporting(true)
    await exportReport(projectId)
  } catch (err) {
    showToast(toUserMessage(err)) // mapped message, not err.message
  } finally {
    setExporting(false)
  }
}
```

---

## 6. Re-render & Rendering Performance

### 6.1 Memoize where it pays, not by reflex

- `memo()` for components that render often with the same props (list rows, graph nodes).
- `useMemo` for expensive computation (graph layout via dagre, building lookup maps,
  filtering large arrays).
- **Do not** wrap trivial primitive expressions (`a || b`, `x > 0`) in `useMemo` — the hook
  costs more than the expression.
- Memoized components need stable props: hoist non-primitive default parameter values to
  module constants; keep callbacks stable via functional setState (§3.2).

### 6.2 Hoist static JSX and RegExp

Static skeletons, big SVGs, and `RegExp` literals move to module scope; dynamic RegExp gets
`useMemo`.

### 6.3 Long lists

For long scrollable lists (stacks, categories, EWI tables), use CSS
`content-visibility: auto; contain-intrinsic-size: …` or virtualize. Don't render 1,000+
rows with full layout cost.

### 6.4 Interaction-driven side effects live in handlers

Never model "the user clicked" as state + effect; call the logic in the handler. This avoids
duplicate side effects and dependency churn.

### 6.5 Transient high-frequency values

Scroll positions, drag coordinates, hover trackers: ref + direct DOM style updates or
`startTransition`, not `setState`-per-event.

---

## 7. Bundle Size & Code Splitting

This app ships heavy visualization dependencies (`mermaid` ~2MB+, `neovis.js`,
`@xyflow/react`, `react-syntax-highlighter`). Keep them out of the initial chunk.

### 7.1 `React.lazy` + `Suspense` for heavy, route- or feature-scoped components

```tsx
const MermaidDiagram = lazy(() => import('./MermaidDiagram'))

<Suspense fallback={<DiagramSkeleton />}>
  {showDiagram ? <MermaidDiagram source={source} /> : null}
</Suspense>
```

Route-level workspaces that pull a heavy lib should be the split point so `vite build`
emits them as separate chunks.

### 7.2 Preload on intent

Kick off `void import('./MermaidDiagram')` on hover/focus of the control that reveals it.

### 7.3 Import third-party libraries by leaf path where supported

For libraries with massive barrel entry points, prefer per-module imports when the package
ships types for them (e.g. `lucide-react` icons are fine as named imports under Vite
tree-shaking for production, but watch dev-server cost if it degrades). **Internal feature
barrels (`src/features/*/index.ts`) are an intentional API boundary — keep using them**;
this rule targets third-party mega-barrels only.

### 7.4 Statically analyzable dynamic imports

`import()` paths must be literal or an explicit literal map — never computed strings —
so Rollup can split chunks correctly.

---

## 8. TypeScript Conventions

Enforced by `tsconfig.app.json` (`strict`, `noUnusedLocals`, `noUnusedParameters`,
`verbatimModuleSyntax`, `erasableSyntaxOnly`):

- **`import type { X }`** for type-only imports — mixing fails typecheck.
- **No `enum`, no parameter properties, no namespaces** — use `const` objects with
  `as const` + union types (see `STAGE_IDS` in `src/types/stage.ts` as the pattern).
- Props are explicit named types/interfaces; exported functions have explicit return types
  when inference is non-obvious.
- Domain models live in `src/types/*`; services own the raw-JSON → domain mapping. Raw API
  shapes never leak past the service layer.
- Discriminated unions over optional-field bags for variant data
  (`{ status: 'ready'; data } | { status: 'pending' }`).
- No `any`; use `unknown` + narrowing at boundaries (API responses, `JSON.parse`).

---

## 9. Routing

- All routes are declared in `src/routes.tsx`; deep stage routes must stay **before** the
  `stages/:stageId` catch-all.
- URL is the source of truth for navigational state (project, stage, sub-view). Don't mirror
  route params into component state — read `useParams`/`useSearchParams` and derive.
- `ProjectStateProvider` sits outside the route tree and cannot use `useParams`; it parses
  the pathname via `projectIdFromPathname` (`src/lib/routeProjectId.ts`). **Any route shape
  change that moves `:projectId` must update that parser.**
- Use `<Link>`/`useNavigate` — never `window.location` for internal navigation.
- Read search params at the point of use; if only an event handler needs a param, read it
  inside the handler rather than subscribing the component to all param changes.

---

## 10. Architecture & Module Boundaries

### 10.1 Directory structure & module boundaries

- **Feature folders** under `src/features/*` with `components/`, `context/`, `hooks/`, and
  `utils/`, plus a barrel `index.ts` defining the public surface. **Every feature exposes an
  `index.ts`; cross-feature imports go through it — never deep paths.** A feature with no
  barrel yet is a gap to close, not a pattern to copy.
- Keep a feature's subfolders to the canonical set (`components/`, `context/`, `hooks/`,
  `utils/`). Feature-local data fixtures may live in `data/`. Don't invent new top-level
  subfolders per feature; a handful of small feature-root files is fine, but anything reused
  inside the feature goes in the matching subfolder.
- **Cross-cutting code by layer:** shared UI primitives in `src/components/ui/` (shadcn on
  `@base-ui/react`); app-wide hooks in `src/hooks/`; HTTP in `src/lib/`; per-resource services
  in `src/services/`; domain models in `src/types/`. Don't fork per-feature copies of UI
  primitives.
- **Dependency direction:** `lib` → `services` → `types`/contexts/hooks → features → routes.
  Features don't import from each other's internals; `lib`/`services` never import from
  features.
- Tests are colocated next to the unit as `<name>.test.ts(x)` (§12). Prefer colocation over a
  separate `__tests__/` folder; don't mix both styles within one feature.
- `registry-seeds/` is the ground truth for API response shapes — when an API shape changes,
  update the seed, the type, and the service mapping together.

### 10.2 Naming conventions

Match the conventions already in the tree; don't introduce a competing style.

| Kind | Convention | Example |
|---|---|---|
| Component file + export | `PascalCase.tsx`, export name = file name | `DiscoveryExplorer.tsx` → `DiscoveryExplorer` |
| shadcn/Base UI primitive | kebab-case file (shadcn convention) in `components/ui/` | `scroll-area.tsx`, `button.tsx` |
| Hook file + export | `useXxx.ts(x)`, camelCase, export = file name | `useStageDetail.ts` → `useStageDetail` |
| Service file + export | `xxxService.ts`, fetchers named `fetchXxx` | `assessmentMetadataService.ts` → `fetchAssessmentMetadata` |
| Context / provider | `XxxContext.tsx` / `XxxProvider.tsx`; consumer hook `useXxx` | `DiscoveryEwiContext.tsx`, `DiscoveryEwiProvider.tsx` |
| Domain type file | camelCase `.ts` in `src/types/` | `comprehendSource.ts` |
| Util / route-config file | camelCase, descriptive suffix | `filterEwiRecords.ts`, `planRoutes.ts` |
| `as const` object + its type | object `UPPER_SNAKE` or camelCase, type `PascalCase` | `STAGE_IDS` + `StageId` |
| Type / interface | `PascalCase`; props type `XxxProps` | `StageReport`, `StageRowProps` |
| Boolean prop / var | `is`/`has`/`should` prefix | `isLoading`, `hasError` |
| Event handler / callback prop | handler `handleXxx`, prop `onXxx` | `handleSubmit`, `onSelect` |
| Constants | `UPPER_SNAKE_CASE` | `DEFAULT_PAGE_SIZE` |

One default export per component file (the component); everything else is a named export.
Names describe domain meaning, not implementation (`StageReportPanel`, not `DataDiv`).

---

## 11. Accessibility

- Semantic HTML first: `button` for actions, `a`/`Link` for navigation, `label` for inputs,
  headings in order. Add `role`/`aria-*` only when semantics can't express it —
  incorrect ARIA is worse than none.
- Every interactive element is keyboard-reachable and operable (the Base UI primitives
  handle most of this — don't bypass them with bare `div onClick`).
- Icon-only buttons (`lucide-react`) get an accessible name (`aria-label`).
- Tested behavior should be queryable by role/name — if a test can't find an element with
  `getByRole`, that's usually an accessibility bug, not a test problem (§12.2).

---

## 12. Testing Practices

Stack: **Vitest 4 + jsdom + React Testing Library 16**, setup in `src/test/vitestSetup.ts`,
shared API mock in `src/test/mockMigrationApi.ts`. Tests are colocated as `*.test.ts(x)`.

### 12.1 Test user-visible behavior, not implementation

The more tests resemble how the dashboard is used, the more confidence they give. Assert on
rendered output and user-observable state changes — never on internal state, hook internals,
or "was this function called" when an observable effect exists.

### 12.2 Query priority (Testing Library)

In order of preference:

1. `getByRole` (with `name`) — also validates accessibility
2. `getByLabelText` — form fields
3. `getByPlaceholderText`
4. `getByText` — non-interactive content
5. `getByTestId` — last resort, for dynamic/non-semantic content only

Use `screen` for all queries (don't destructure from `render`). Use `query*` variants
**only** to assert absence: `expect(screen.queryByRole('alert')).not.toBeInTheDocument()`.

### 12.3 Async patterns

- `await screen.findByRole(...)` instead of `waitFor(() => getByRole(...))`.
- `waitFor`: one assertion per callback, no side effects inside the callback, never empty.
- Never use arbitrary `setTimeout`/sleeps to "wait for React".

### 12.4 Simulate users, not events

Prefer `@testing-library/user-event` (`userEvent.click`, `userEvent.type`) over `fireEvent`
— it dispatches the full event sequence a real user produces. (If `user-event` isn't yet a
dependency, adding it is a standards action item.)

### 12.5 Mock at the network boundary

Mock HTTP via `src/test/mockMigrationApi.ts` — not services, not hooks, not components.
Vitest pins `VITE_API_BASE_URL=''` so all requests hit relative `/api/v1` paths and mocks
match. Use `registry-seeds/` fixtures (via `@registrySeeds/...`) as response payloads so
tests exercise the real service mapping code.

### 12.6 Test placement & scope

- Colocate `*.test.ts(x)` next to the unit under test.
- Service tests: mapping logic, `404 → null` convention, error translation.
- Hook/context tests: state transitions via a consuming component, not `renderHook`
  internals poking.
- Workflow tests: end-to-end user flows live in `src/migrationDashboardApiWorkflows.test.tsx`.
- Every bug fix lands with a regression test that fails on the previous behavior.

### 12.7 Keep tests deterministic

No real timers without `vi.useFakeTimers()` (and restore after); no real network; no
ordering dependence between tests; clean module-level caches in `beforeEach` if a module
under test holds state.

---

## 13. JavaScript Performance

Hot-path guidance (graph transforms, large table mapping):

- Build a `Map`/`Set` once for repeated lookups instead of `Array.find`/`includes` in loops
  (O(n²) → O(n)).
- Use `flatMap` to map+filter in one pass; combine multiple `.filter()` passes into one loop
  when the array is large.
- Single-pass loop for min/max — don't sort to find an extreme.
- Early-return guards before expensive work (length checks before deep comparisons).
- `toSorted()`/`toReversed()`/`with()` for immutability (Node 20+/modern browsers — fine
  for this Node 22 + evergreen-browser project).

---

## 14. Styling & Tailwind CSS

Stack: **Tailwind CSS 4** (CSS-first config), **shadcn/ui** on `@base-ui/react`,
`class-variance-authority` (cva), and `clsx` + `tailwind-merge` via the `cn()` helper in
`src/lib/utils.ts`.

### 14.1 Compose classes with `cn()`

Build conditional/merged class strings with `cn(...)` — never string concatenation or template
literals. `cn` runs `clsx` (conditionals) then `twMerge` (dedupes conflicting Tailwind
utilities so the last wins), which raw concatenation does not.

```tsx
// ❌ Conflicts don't resolve; "p-2 p-4" both ship
className={`p-2 ${active ? 'p-4 bg-primary' : ''}`}

// ✅ twMerge keeps p-4, drops p-2
className={cn('p-2', active && 'p-4 bg-primary')}
```

### 14.2 Variants via cva, extracted to `*-variants.ts`

Multi-variant components use cva, and the cva config lives in a sibling `*-variants.ts` file
(see `button-variants.ts`, `badge-variants.ts`, `tabs-variants.ts`), not in the component file.
This matches the existing pattern and keeps the React Fast Refresh boundary clean — a `.tsx`
component file should export components only (the `react-refresh/only-export-components` lint
rule). Don't hand-roll ad-hoc boolean→class maps when a variant axis fits cva.

### 14.3 Use semantic design tokens, not raw palette values

Style against the semantic tokens defined in `@theme` in `src/index.css`
(`bg-primary`, `text-primary-foreground`, `bg-muted`, `text-muted-foreground`,
`border-border`, `ring-ring`, `bg-destructive/10`, …) — never hard-coded palette utilities
(`bg-blue-500`) or hex values in markup. Tokens are what make theming and dark mode work; raw
values bypass them and break under theme changes.

### 14.4 Dark mode through token variants

Express dark mode with `dark:` utilities on tokens (`dark:bg-input/30`), not parallel
component logic or a separate stylesheet. Because semantic tokens already remap per theme,
most components need few or no explicit `dark:` classes.

### 14.5 Tailwind 4 is CSS-first — extend the theme, don't add config files

There is **no `tailwind.config.js`**. Theme tokens, custom colors, and radii live in the
`@theme { … }` block of `src/index.css`. Add a new design token there (as a CSS variable) and
reference it via a utility — don't sprinkle one-off arbitrary values (`w-[437px]`) or reintroduce
a JS config. Reserve `@apply` for rare cases; prefer utilities in markup or a cva variant.

### 14.6 Keep class names statically extractable

Tailwind 4 scans source for **complete** class strings. Never assemble class names from
fragments (`` `text-${color}-500` ``, `` `gap-${n}` ``) — those utilities won't be generated.
Use full literal classes, a cva variant, or a lookup map whose values are complete class
strings.

```tsx
// ❌ Not generated by the scanner
className={`text-${tone}-600`}

// ✅ Complete strings, statically visible
const TONE = { ok: 'text-emerald-600', warn: 'text-amber-600' } as const
className={TONE[tone]}
```

### 14.7 Inline `style` only for genuinely dynamic values

Use Tailwind utilities for everything static. Reserve the `style` prop for values that can't be
a class — computed positions/sizes from graph layout (dagre/xyflow coordinates), measured
dimensions, animation values. Static styling via `style={{}}` is a smell (also slower per §7.1
of the rendering notes: classes are cached, inline styles re-create objects each render).

---

## 15. Configuration & Hardcoded Values

Hardcoded values scattered through the code are duplicated, drift apart, and hide what is
actually configurable. Name them, centralize them, or drive them from config.

### 15.1 No magic numbers or strings

Replace unexplained literals (timeouts, page sizes, thresholds, retry counts, repeated string
keys) with named `UPPER_SNAKE_CASE` constants at module or feature scope. A literal is fine when
it is self-evident and used once (`flex gap-2`, `index 0`); name it the moment it carries meaning
or repeats.

```tsx
// ❌ What is 30000? Why 50?
setTimeout(poll, 30000)
const page = items.slice(0, 50)

// ✅ Intent is named and reusable
const POLL_INTERVAL_MS = 30_000
const STACKS_PAGE_SIZE = 50
```

### 15.2 No hardcoded URLs, endpoints, or origins

Never inline an API host, path, or third-party origin in a component or hook. API access goes
through `src/lib/apiClient.ts` (which resolves the base via `resolveApiV1Base`) and per-resource
services; endpoint paths live in the owning service, not the call site. External origins
(OpenMetadata, Neo4j, etc.) come from config, not literals.

```ts
// ❌ Hardcoded host + path in a component
fetch('http://localhost:8000/api/v1/projects/PRJ-1/state')

// ✅ Service owns the path; apiClient owns the base
fetchProjectState(projectId)
```

### 15.3 Config and secrets via environment, never inline

Environment-specific values come from `import.meta.env.VITE_*` (documented in `.env.example`),
read once and surfaced through a typed config accessor — not sprinkled as literals. Secrets are
never committed to the repo or embedded in client code; treat every `VITE_*` value as
publicly visible in the shipped bundle, so no real secret belongs there at all.

### 15.4 Shared constants for repeated keys

Route paths, `localStorage`/`sessionStorage` keys, query-param names, and event names that appear
in more than one place are defined once as exported constants and imported — never re-typed as
literals. This is what keeps RS-10 (routing), §3.6 (storage), and §9 (URL state) consistent.

```ts
// ✅ One source of truth
export const STORAGE_KEYS = { connections: 'connections:v1' } as const
export const QUERY_PARAMS = { ref: 'ref' } as const
```

### 15.5 Enumerable domain values as `as const` unions

A fixed set of domain values (stage ids, statuses, modes) is defined once as an `as const` object
or union type and referenced everywhere — never re-spelled as bare string literals across the
codebase. Follow the `STAGE_IDS` / `StageId` pattern in `src/types/stage.ts` (this is the
hardcoding-specific application of §8 / RS-09.2).

```ts
export const STAGE_IDS = ['discover', 'assess-source', /* … */] as const
export type StageId = (typeof STAGE_IDS)[number]
// Use StageId / STAGE_IDS, never a loose 'discover' string in component logic.
```

---

## References

1. Rules of React — https://react.dev/reference/rules
2. You Might Not Need an Effect — https://react.dev/learn/you-might-not-need-an-effect
3. Escape Hatches — https://react.dev/learn/escape-hatches
4. Thinking in React — https://react.dev/learn/thinking-in-react
4a. Choosing the State Structure — https://react.dev/learn/choosing-the-state-structure
4b. Extracting State Logic into a Reducer — https://react.dev/learn/extracting-state-logic-into-a-reducer
4c. Passing Data Deeply with Context — https://react.dev/learn/passing-data-deeply-with-context
4d. Scaling Up with Reducer and Context — https://react.dev/learn/scaling-up-with-reducer-and-context
5. useTransition / useDeferredValue — https://react.dev/reference/react/useTransition
6. Testing Library guiding principles — https://testing-library.com/docs/guiding-principles/
7. Common Mistakes with React Testing Library — https://kentcdodds.com/blog/common-mistakes-with-react-testing-library
8. Vitest — https://vitest.dev
9. React lazy/Suspense — https://react.dev/reference/react/lazy
10. Tailwind CSS v4 (CSS-first config / `@theme`) — https://tailwindcss.com/docs
11. class-variance-authority — https://cva.style/docs
12. tailwind-merge — https://github.com/dcastil/tailwind-merge
