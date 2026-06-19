# React Development Standards

**Version 2.0.0** — applies to all React development in this repository.

Standards are organized into **groups** (RS-01 … RS-20); each group is broken into atomic
**sub-standards** (RS-01.1, RS-01.2, …). Every sub-standard is normative ("must"/"never"),
is tracked as its own Jira Story under epic **LEAPDATAOS-1140 — Team Productivity - Standards -
React**, and maps to a section of [`AGENTS.md`](../best-practices/AGENTS.md), which carries the
rationale, examples, and references (react.dev, Testing Library).

Each sub-standard lists: **Standard** (the rule), **Why it matters** (the risk if it is not
followed), and **Reference** (the AGENTS.md section).

---

## RS-01 — Rules of React

### RS-01.1 — Pure, idempotent rendering
**Standard:** A component/hook returns the same output for the same props, state, and context;
no side effects, `Math.random()`, `Date.now()`, or external mutation during render.
**Why it matters:** Impure render produces flickering/stale UI and double-render bugs, and
defeats React 19 / React Compiler optimizations that assume purity.
**Reference:** AGENTS.md §1.1.

### RS-01.2 — Never mutate props, state, or hook returns
**Standard:** Treat props, state, context, and hook return values as immutable; use
`toSorted`/`toReversed`/spread, never `sort`/`reverse`/`push` on shared arrays.
**Why it matters:** Mutation corrupts shared data and skips re-renders — the classic "value
changed but the UI didn't update" bug.
**Reference:** AGENTS.md §1.1.

### RS-01.3 — Rules of Hooks
**Standard:** Call hooks only at the top level (never in loops, conditions, nested functions, or
after an early return); never call component functions directly — render them via JSX.
**Why it matters:** Conditional hooks crash with "rendered fewer hooks than expected"; calling
components as functions breaks their lifecycle and state.
**Reference:** AGENTS.md §1.2.

### RS-01.4 — No unjustified react-hooks lint suppression
**Standard:** `eslint-plugin-react-hooks` errors are not disabled without a justifying comment
agreed in review.
**Why it matters:** Suppressed warnings hide real dependency/ordering bugs that surface later as
stale data or missed updates.
**Reference:** AGENTS.md §1.2.

---

## RS-02 — Effects discipline

### RS-02.1 — Derive, don't store in an effect
**Standard:** Values computable from props/state are computed during render (or `useMemo`), not
mirrored into state via an effect.
**Why it matters:** Effect-derived state causes extra render passes and state that drifts out of
sync with its source.
**Reference:** AGENTS.md §4, §3.1.

### RS-02.2 — Event logic in handlers, not effects
**Standard:** Side effects caused by a user action run in that action's event handler, not in an
effect keyed off state.
**Why it matters:** Modeling actions as state+effect makes effects re-run on unrelated changes
and duplicates side effects.
**Reference:** AGENTS.md §4.

### RS-02.3 — Reset state with `key`, not an effect
**Standard:** Reset a component's state on identity change by passing that identity as `key`,
not by syncing state in an effect.
**Why it matters:** Effect-based resets lag a render and produce visible stale state.
**Reference:** AGENTS.md §4, §2.4.

### RS-02.4 — External stores & one-time init
**Standard:** Subscribe to external stores with `useSyncExternalStore`; run one-time app init at
module level, not in `useEffect([])`.
**Why it matters:** Ad-hoc subscriptions tear/read stale values; init in an effect double-runs on
remount (and in StrictMode).
**Reference:** AGENTS.md §4.

### RS-02.5 — Effects must clean up
**Standard:** Every subscription, timer, observer, and fetch started in an effect returns a
cleanup function.
**Why it matters:** Missing cleanup leaks memory, stacks duplicate listeners, and leaves races
between overlapping runs.
**Reference:** AGENTS.md §4.1.

### RS-02.6 — Honest, narrow dependencies
**Standard:** Don't disable exhaustive-deps; depend on the primitives actually read (not whole
objects), and restructure rather than suppress.
**Why it matters:** Wrong deps give stale closures or over-firing effects and infinite loops.
**Reference:** AGENTS.md §4.2, §4.3.

---

## RS-03 — Typed service layer

### RS-03.1 — No direct HTTP in components/hooks
**Standard:** Components, hooks, and contexts never call `fetch`/`apiGetJson` directly — all HTTP
goes through a service in `src/services/`.
**Why it matters:** Inline fetches duplicate logic and leave no single place to change an
endpoint, header, or error policy.
**Reference:** AGENTS.md §5.1.

### RS-03.2 — Map raw JSON to domain types
**Standard:** Services map raw API JSON into domain models from `src/types/*`; raw API shapes
never leak past the service layer.
**Why it matters:** Leaked raw shapes spread API coupling across the UI, so every backend change
breaks many components.
**Reference:** AGENTS.md §5.1, §10.

### RS-03.3 — `404 → null` for "not generated yet"
**Standard:** Services return `null` for not-yet-generated artifacts; the UI renders an empty
state rather than an error.
**Why it matters:** Without the convention, normal "not ready" states show as errors and each
caller handles 404 differently.
**Reference:** AGENTS.md §5.1.

### RS-03.4 — Typed errors, translated by UI layers
**Standard:** Services throw `ApiHttpError`; hooks/contexts catch and translate it into
loading/empty/error UI state. Components never parse raw error bodies.
**Why it matters:** Components parsing raw errors produce inconsistent, fragile error UX.
**Reference:** AGENTS.md §5.4.

---

## RS-04 — Async & data-fetching performance

### RS-04.1 — Parallelize independent requests
**Standard:** Independent requests run concurrently via `Promise.all`; only genuinely dependent
calls chain.
**Why it matters:** Sequential `await`s stack network latency and make pages feel slow.
**Reference:** AGENTS.md §5.2.

### RS-04.2 — Defer `await` to the point of use
**Standard:** Move `await` into the branch that actually uses its result.
**Why it matters:** Awaiting up front blocks code paths (early returns) that never needed the
data.
**Reference:** AGENTS.md §5.2.

### RS-04.3 — Guard fetch races and unmounts
**Standard:** Fetch-on-param-change effects guard against stale responses and unmounts with an
AbortController and/or an `active` flag.
**Why it matters:** Unguarded fetches let a stale response overwrite fresh data and trigger
setState-after-unmount warnings.
**Reference:** AGENTS.md §5.3.

---

## RS-05 — Component design

### RS-05.1 — No components defined inside components
**Standard:** Never define a component inside another component's body; hoist it to module scope
and pass props.
**Why it matters:** A nested definition is a new type each render, so React remounts it — losing
state, focus, and restarting animations.
**Reference:** AGENTS.md §2.1.

### RS-05.2 — Explicit conditional rendering
**Standard:** Use a ternary (`cond ? <X/> : null`) instead of `&&` when the condition can be
`0`, `NaN`, or `''`.
**Why it matters:** `&&` on a falsy number/string renders the value itself (a stray "0").
**Reference:** AGENTS.md §2.3.

### RS-05.3 — Stable, domain-identity list keys
**Standard:** List keys come from stable domain identity, never the array index when items can
reorder, insert, or delete.
**Why it matters:** Index keys mis-associate state/DOM with rows on reorder or insert.
**Reference:** AGENTS.md §2.5.

### RS-05.4 — Composition over configuration
**Standard:** Prefer `children`/slots over growing boolean/config props; extract a smaller
component before adding another conditional branch.
**Why it matters:** Boolean-prop accretion yields rigid, hard-to-read components.
**Reference:** AGENTS.md §2.2.

---

## RS-06 — State management

### RS-06.1 — Functional `setState` for prev-dependent updates
**Standard:** Updates based on the current value use the functional form `setX(curr => …)`.
**Why it matters:** Direct references cause stale-closure bugs and force state into callback
dependency arrays, recreating callbacks.
**Reference:** AGENTS.md §3.2.

### RS-06.2 — Lazy state initialization
**Standard:** Expensive initial values are passed as an initializer function: `useState(() => …)`.
**Why it matters:** The non-function form re-runs the initializer on every render.
**Reference:** AGENTS.md §3.3.

### RS-06.3 — `useRef` for transient values
**Standard:** Frequently-changing values that don't affect output (timers, last pointer position,
in-flight ids) live in refs, not state.
**Why it matters:** Storing them in state triggers a re-render on every change.
**Reference:** AGENTS.md §3.4.

### RS-06.4 — Memoized, frequency-split context with a typed hook
**Standard:** Provider values are memoized, contexts are split by change frequency, and consumers
use a typed hook that throws outside its provider (never the raw context).
**Why it matters:** Unmemoized/over-broad context re-renders every consumer on any change;
raw-context use loses the provider guard.
**Reference:** AGENTS.md §3.5.

### RS-06.5 — Guarded, versioned, minimal `localStorage`
**Standard:** `localStorage` access is wrapped in `try/catch`, keys are versioned (`prefs:v1`),
and only needed fields are stored.
**Why it matters:** Unguarded access throws in private browsing / quota-exceeded; unversioned,
bloated blobs cause schema conflicts and store PII.
**Reference:** AGENTS.md §3.6.

### RS-06.6 — Group related state; avoid contradictory state
**Standard:** State values that always change together live in one variable, and mutually-exclusive
flags collapse into a single `status` union rather than multiple booleans that can contradict.
**Why it matters:** Separate-but-related values drift out of sync, and boolean soup allows
impossible states (e.g. `isSending` and `isSent` both true) that become bugs.
**Reference:** AGENTS.md §3.7.

### RS-06.7 — Avoid redundant and duplicated state
**Standard:** Anything derivable from props/state is computed during render, not stored; data held
in a list is referenced by id, not copied into a second state variable.
**Why it matters:** Redundant/duplicated state has to be kept in sync by hand and desyncs the
moment one copy is updated and another isn't.
**Reference:** AGENTS.md §3.8, §3.1.

### RS-06.8 — Avoid deeply nested state
**Standard:** Normalize deeply nested/tree-shaped state into flat, id-keyed maps where parents hold
arrays of child ids; update by id rather than walking the tree.
**Why it matters:** Deeply nested state is tedious and error-prone to update immutably, breeding
subtle update bugs.
**Reference:** AGENTS.md §3.9.

### RS-06.9 — Use a reducer for complex, multi-action state
**Standard:** When several handlers update the same state in different ways (or updates are
non-trivial), consolidate into a `useReducer`; the reducer is pure (immutable, no side effects) and
each action names one user interaction, not one low-level setter.
**Why it matters:** Scattered `setState` logic is hard to follow, debug, and test; a pure reducer
centralizes transitions and separates intent from mechanics.
**Reference:** AGENTS.md §3.10.

### RS-06.10 — Reach for context only when props/composition won't do
**Standard:** Prop-drilling depth alone doesn't justify context — first pass props explicitly or
extract components and pass JSX via `children`; use context only for data many distant components
genuinely need.
**Why it matters:** Overused context hides data flow, couples components to a provider, and makes
the app harder to reason about and refactor.
**Reference:** AGENTS.md §3.11.

### RS-06.11 — Scale shared state with reducer + context
**Standard:** For state many nested components read and update, combine a reducer with context:
expose separate state and `dispatch` contexts from a provider that owns the `useReducer`, consumed
through typed hooks.
**Why it matters:** It removes prop drilling for shared state, and splitting state from dispatch
keeps dispatch-only consumers from re-rendering on every state change.
**Reference:** AGENTS.md §3.12.

---

## RS-07 — Re-render & rendering performance

### RS-07.1 — Memoize where it pays, not by reflex
**Standard:** `memo`/`useMemo`/`useCallback` go on expensive computation and hot list/graph
components — not on trivial primitive expressions.
**Why it matters:** Missing memoization causes jank on large views; needless memoization adds
overhead that costs more than it saves.
**Reference:** AGENTS.md §6.1.

### RS-07.2 — Stable props for memoized components
**Standard:** Memoized components get stable props — module-constant non-primitive defaults and
functional-setState callbacks.
**Why it matters:** New default/callback references each render silently break the memo.
**Reference:** AGENTS.md §6.1.

### RS-07.3 — Hoist static JSX and RegExp
**Standard:** Static JSX elements and `RegExp` literals are hoisted to module scope (dynamic
RegExp via `useMemo`).
**Why it matters:** Re-creating them every render wastes work, especially large static SVGs.
**Reference:** AGENTS.md §6.2.

### RS-07.4 — Long lists use content-visibility or virtualization
**Standard:** Lists of ~1,000+ rows use `content-visibility: auto` or virtualization.
**Why it matters:** Rendering thousands of rows with full layout cost stalls initial render and
scrolling.
**Reference:** AGENTS.md §6.3.

### RS-07.5 — Transitions for non-urgent updates
**Standard:** Non-urgent expensive updates (filtering large lists, graph re-layout) use
`useTransition`/`useDeferredValue`; urgent input stays synchronous.
**Why it matters:** Without them, heavy renders make typing and interaction feel laggy.
**Reference:** AGENTS.md §5.5, §6.

---

## RS-08 — Code splitting

### RS-08.1 — Lazy-load heavy deps at the boundary
**Standard:** Heavy libs (`mermaid`, `neovis.js`, `@xyflow/react`, `react-syntax-highlighter`)
load via `React.lazy` + `Suspense` at the route/feature boundary.
**Why it matters:** Bundling them into the initial chunk slows first load and TTI for users who
may never open those views.
**Reference:** AGENTS.md §7.1.

### RS-08.2 — Preload on user intent
**Standard:** Kick off the dynamic `import()` on hover/focus of the control that reveals the
heavy component.
**Why it matters:** Without preloading, opening the feature shows an avoidable loading delay.
**Reference:** AGENTS.md §7.2.

### RS-08.3 — Statically analyzable import paths
**Standard:** `import()` paths are literal or an explicit literal map — never computed strings.
**Why it matters:** Computed paths defeat code-splitting, producing over-broad bundles or build
warnings.
**Reference:** AGENTS.md §7.4.

---

## RS-09 — TypeScript conventions

### RS-09.1 — Type-only imports use `import type`
**Standard:** Type-only imports use `import type { X }`.
**Why it matters:** `verbatimModuleSyntax` fails typecheck/CI when value and type imports are
mixed.
**Reference:** AGENTS.md §8.

### RS-09.2 — No enum / parameter properties / namespaces
**Standard:** Use `as const` objects + union types (pattern: `STAGE_IDS`) instead of `enum`,
parameter properties, or namespaces.
**Why it matters:** `erasableSyntaxOnly` rejects runtime-emitting TS syntax — CI fails.
**Reference:** AGENTS.md §8.

### RS-09.3 — No `any`; narrow at boundaries
**Standard:** No `any`; use `unknown` plus narrowing at boundaries (API responses, `JSON.parse`).
**Why it matters:** `any` reopens the runtime type holes the strict config exists to close.
**Reference:** AGENTS.md §8.

### RS-09.4 — Discriminated unions for variant data
**Standard:** Model variant data as discriminated unions, not optional-field bags.
**Why it matters:** Optional-field bags allow impossible states and unsafe variant access.
**Reference:** AGENTS.md §8.

### RS-09.5 — Domain models live in `src/types/*`
**Standard:** Domain models are defined in `src/types/*`; services own the raw-JSON → domain
mapping.
**Why it matters:** Scattered/duplicated type definitions drift apart and are hard to evolve.
**Reference:** AGENTS.md §8.

---

## RS-10 — Routing & URL state

### RS-10.1 — URL is the source of truth
**Standard:** Read navigational state via `useParams`/`useSearchParams` and derive; don't mirror
route params into component state.
**Why it matters:** Mirrored params desync UI from the URL and break deep links and the back
button.
**Reference:** AGENTS.md §9.

### RS-10.2 — Use `<Link>`/`useNavigate` for internal nav
**Standard:** Internal navigation uses `<Link>`/`useNavigate`, never `window.location`.
**Why it matters:** `window.location` forces a full reload and discards SPA state.
**Reference:** AGENTS.md §9.

### RS-10.3 — Deep routes before the catch-all
**Standard:** Deep stage routes stay declared before the `stages/:stageId` catch-all in
`routes.tsx`.
**Why it matters:** A catch-all declared first shadows the deep routes, breaking those pages.
**Reference:** AGENTS.md §9.

### RS-10.4 — Keep `projectIdFromPathname` in sync
**Standard:** Any route change that moves `:projectId` updates `projectIdFromPathname`
(`src/lib/routeProjectId.ts`) in the same PR.
**Why it matters:** `ProjectStateProvider` sits outside the route tree and relies on that parser;
a mismatch leaves it unable to resolve the project.
**Reference:** AGENTS.md §9.

---

## RS-11 — Module boundaries

### RS-11.1 — Cross-feature imports go through barrels
**Standard:** Import other features only through their `index.ts` barrel, never deep paths.
**Why it matters:** Deep imports couple features to each other's internals and make refactors
fragile.
**Reference:** AGENTS.md §10.1.

### RS-11.2 — One-way dependency direction
**Standard:** Dependencies flow `lib` → `services` → contexts/hooks → features → routes; features
don't import each other's internals; `lib`/`services` never import from features.
**Why it matters:** Violations create circular dependencies and tangled, untestable layering.
**Reference:** AGENTS.md §10.1.

### RS-11.3 — Shared UI primitives, no per-feature forks
**Standard:** Shared primitives come from `src/components/ui/`; features don't fork their own
copies.
**Why it matters:** Forked primitives drift apart visually and behaviorally over time.
**Reference:** AGENTS.md §10.1.

### RS-11.4 — Evolve API shape, seed, type, and mapping together
**Standard:** When an API shape changes, update `registry-seeds/`, the `src/types` model, and the
service mapping in the same change.
**Why it matters:** Out-of-sync fixtures/types make tests pass against shapes the API no longer
returns.
**Reference:** AGENTS.md §10.1.

---

## RS-12 — Accessibility

### RS-12.1 — Semantic HTML first
**Standard:** Use semantic elements (`button`, `a`/`Link`, `label`, ordered headings); add
`role`/`aria-*` only when semantics can't express the intent.
**Why it matters:** Non-semantic markup excludes assistive-tech users, and incorrect ARIA is
worse than none.
**Reference:** AGENTS.md §11.

### RS-12.2 — Keyboard operability
**Standard:** Every interactive element is keyboard-reachable and operable; use the Base UI
primitives rather than a bare `div onClick`.
**Why it matters:** Non-focusable click handlers lock out keyboard-only users.
**Reference:** AGENTS.md §11.

### RS-12.3 — Accessible names for icon-only controls
**Standard:** Icon-only buttons (`lucide-react`) get an accessible name via `aria-label`.
**Why it matters:** Without a name they are announced as "button" and are unusable by screen
readers.
**Reference:** AGENTS.md §11.

### RS-12.4 — Role-queryable markup
**Standard:** If a test can't find an element with `getByRole`, fix the markup, not the test.
**Why it matters:** A missing role/name is usually a real accessibility defect, not a test
limitation.
**Reference:** AGENTS.md §11, §12.2.

---

## RS-13 — Testing practices

### RS-13.1 — Test behavior, not implementation
**Standard:** Assert on rendered output and user-observable state, never internal state or
"was this function called" when an observable effect exists.
**Why it matters:** Implementation-coupled tests break on every refactor and give false
confidence.
**Reference:** AGENTS.md §12.1.

### RS-13.2 — Query priority, `screen`, and `query*` for absence
**Standard:** Prefer `getByRole` (with name) → `getByLabelText` → … → `getByTestId` last; query
via `screen`; use `query*` only to assert absence.
**Why it matters:** Low-priority/`testId` selectors are brittle and skip the accessibility check
that role queries provide.
**Reference:** AGENTS.md §12.2.

### RS-13.3 — Async queries and `waitFor` discipline
**Standard:** Use `await screen.findBy*`; never wrap `getBy*` in `waitFor`; one assertion per
`waitFor`, no side effects inside; no arbitrary sleeps.
**Why it matters:** Misused async patterns produce flaky tests and confusing failures.
**Reference:** AGENTS.md §12.3.

### RS-13.4 — Mock at the network boundary
**Standard:** Mock HTTP via `src/test/mockMigrationApi.ts` using `registry-seeds/` fixtures —
not services, hooks, or components.
**Why it matters:** Mocking deeper bypasses the real service-mapping code and hides integration
bugs.
**Reference:** AGENTS.md §12.5.

### RS-13.5 — Colocated, deterministic, regression-backed
**Standard:** Tests are colocated as `*.test.ts(x)`, deterministic (fake timers, no real network,
no inter-test ordering), and every bug fix ships a regression test.
**Why it matters:** Non-deterministic tests flake in CI and unguarded bugs recur.
**Reference:** AGENTS.md §12.6, §12.7.

---

## RS-14 — Testing toolchain

### RS-14.1 — Adopt `user-event` and `jest-dom`
**Standard:** Add `@testing-library/user-event` (replace `fireEvent` in interaction tests) and
`@testing-library/jest-dom` (register in `src/test/vitestSetup.ts`).
**Why it matters:** `fireEvent` is lower fidelity than real user interaction, and without
`jest-dom` assertions give poor failure messages.
**Reference:** AGENTS.md §12.4.

### RS-14.2 — Enforce testing rules with ESLint plugins
**Standard:** Add `eslint-plugin-testing-library` and `eslint-plugin-jest-dom` to
`eslint.config.js`.
**Why it matters:** Without lint enforcement, RS-13 relies entirely on manual review.
**Reference:** AGENTS.md §12.

---

## RS-15 — Component splitting

### RS-15.1 — Split by responsibility (the triggers)
**Standard:** Split a component when it has >1 responsibility, is too long to scan, repeats
markup, has a hot subtree with stable props, blocks an early return with an expensive subtree,
owns local-only state, or needs its own test.
**Why it matters:** Unsplit god-components are hard to read, review, and test.
**Reference:** AGENTS.md §2.6.

### RS-15.2 — Don't over-split (the counter-rule)
**Standard:** Don't extract a single-use component that gives no re-render/early-return benefit
and only forwards props.
**Why it matters:** "Tidiness" wrappers add indirection and prop-passing surface that cost more
than the inline JSX they replace.
**Reference:** AGENTS.md §2.6.

---

## RS-16 — Designing for reuse

### RS-16.1 — Rule of three
**Standard:** Abstract for reuse on real, third-occurrence duplication — not anticipated reuse.
**Why it matters:** Premature generalization produces unused props and indirection everyone pays
for.
**Reference:** AGENTS.md §2.7.

### RS-16.2 — Reuse logic via custom hooks
**Standard:** Extract duplicated state/effect/data logic into a `useXxx` hook in the owning
feature's `hooks/`, not copy-paste.
**Why it matters:** Copy-pasted logic drifts out of sync and multiplies every fix.
**Reference:** AGENTS.md §2.7, §5.3.

### RS-16.3 — Presentational components with a minimal prop API
**Standard:** Reusable visual components are presentational (data + callbacks via props, no
fetching/app state) with a minimal, composable prop API and explicit controlled-vs-uncontrolled
inputs.
**Why it matters:** Components that fetch or carry app state can't be reused or tested in
isolation.
**Reference:** AGENTS.md §2.7.

### RS-16.4 — Place by reach; no cross-feature deep imports
**Standard:** Place components by reach (app-wide → `components/ui`, single-feature → its
`components/`, cross-feature → a shared location only when a second feature needs it); never
deep-import another feature's internals to reuse a piece.
**Why it matters:** Misplacement and reach-ins couple features and block clean refactors.
**Reference:** AGENTS.md §2.7, §10.

---

## RS-17 — Error handling

### RS-17.1 — Layered error handling
**Standard:** Services throw `ApiHttpError`; hooks/contexts translate to loading/empty/error
state; "not generated yet" follows `404 → null`.
**Why it matters:** Without ownership per layer, error handling is inconsistent and duplicated.
**Reference:** AGENTS.md §5.4.

### RS-17.2 — Error boundaries contain render crashes
**Standard:** An app-level error boundary never white-screens; per-route/per-workspace boundaries
(keyed to reset on navigation) keep one crashing view from killing the shell.
**Why it matters:** Without boundaries, a single component throw blanks the entire SPA.
**Reference:** AGENTS.md §5.6.

### RS-17.3 — Handle event-handler & async errors
**Standard:** Event handlers and non-effect async (clicks, submits, lazy `import()`) use
`try/catch`, surface a mapped user message, and reset pending state in `finally`.
**Why it matters:** These run outside effects and boundaries, so unhandled errors become silent
rejections and stuck pending UI.
**Reference:** AGENTS.md §5.7.

### RS-17.4 — Never show raw errors to users
**Standard:** The UI never renders raw error messages, bodies, or stack traces — map to a human
message; log detail to the console/reporting channel.
**Why it matters:** Raw errors leak internal detail and confuse users.
**Reference:** AGENTS.md §5.7.

### RS-17.5 — Never swallow errors silently
**Standard:** An empty `catch {}` is allowed only for a genuinely ignorable failure and must
carry a comment explaining why; otherwise translate to UI state or rethrow.
**Why it matters:** Silently swallowed errors hide real failures until much later.
**Reference:** AGENTS.md §5.7, §3.6.

---

## RS-18 — Naming & directory structure

### RS-18.1 — Naming conventions
**Standard:** Follow tree conventions: components `PascalCase.tsx` (one default export = the
component), shadcn/Base UI primitives kebab-case under `components/ui/`, hooks `useXxx`, services
`xxxService.ts` with `fetchXxx`, contexts/providers `XxxContext`/`XxxProvider`, camelCase type
files, booleans `is`/`has`/`should`, handlers `handleXxx` / props `onXxx`, constants
`UPPER_SNAKE_CASE`.
**Why it matters:** Competing naming styles make the codebase harder to navigate and slow
onboarding.
**Reference:** AGENTS.md §10.2.

### RS-18.2 — Directory structure & barrels
**Standard:** Feature folders under `src/features/*` keep to the canonical subfolders
(`components/`, `context/`, `hooks/`, `utils/`, optional `data/`) and each exposes an `index.ts`
barrel; cross-cutting code lives by layer (`components/ui`, `hooks`, `lib`, `services`, `types`).
**Why it matters:** Ad-hoc subfolders and missing barrels erode the boundaries RS-11 depends on.
**Reference:** AGENTS.md §10.1.

### RS-18.3 — Colocated tests
**Standard:** Tests are colocated as `<name>.test.ts(x)` next to the unit, not in a separate
`__tests__/` folder; don't mix both styles in one feature.
**Why it matters:** Mixed test layouts make tests hard to find and review.
**Reference:** AGENTS.md §10.1, §12.6.

---

## RS-19 — Tailwind CSS & styling

### RS-19.1 — Compose classes with `cn()`
**Standard:** Build conditional/merged class strings with the `cn()` helper, never string
concatenation or template literals.
**Why it matters:** Raw concatenation leaves conflicting Tailwind utilities unresolved (`p-2 p-4`
both ship); `cn` runs `tailwind-merge` to dedupe.
**Reference:** AGENTS.md §14.1.

### RS-19.2 — Variants via cva in `*-variants.ts`
**Standard:** Multi-variant components use `class-variance-authority`, with the cva config in a
sibling `*-variants.ts` file, not the `.tsx`.
**Why it matters:** cva config in a component file breaks React Fast Refresh
(`react-refresh/only-export-components`).
**Reference:** AGENTS.md §14.2.

### RS-19.3 — Semantic tokens and `dark:` variants, not raw palette
**Standard:** Style against `@theme` semantic tokens (`bg-primary`, `text-muted-foreground`,
`border-border`) and express dark mode via `dark:` token variants — never raw palette utilities
(`bg-blue-500`) or hex.
**Why it matters:** Raw values bypass theming and break under theme/dark-mode changes.
**Reference:** AGENTS.md §14.3, §14.4.

### RS-19.4 — CSS-first theme, no config file
**Standard:** Tailwind 4 is CSS-first; theme tokens live in `@theme` in `src/index.css`. Add new
tokens there, not as arbitrary one-off values or a reintroduced `tailwind.config.js`.
**Why it matters:** Off-token arbitrary values and a stray JS config fragment the design system.
**Reference:** AGENTS.md §14.5.

### RS-19.5 — Statically extractable class names
**Standard:** Never assemble class names from fragments (`` `text-${x}-500` ``); use full literal
classes, a cva variant, or a complete-string lookup map.
**Why it matters:** Tailwind's scanner only generates utilities it can see literally — fragments
get purged, so styles are missing in production.
**Reference:** AGENTS.md §14.6.

### RS-19.6 — Inline `style` only for dynamic values
**Standard:** Use utilities for everything static; reserve the `style` prop for genuinely dynamic
values (graph coordinates, measured sizes, animation values).
**Why it matters:** Static inline styles aren't cached like classes and recreate objects each
render (per §7.1 layout/perf guidance).
**Reference:** AGENTS.md §14.7.

---

## RS-20 — Configuration & hardcoded values

### RS-20.1 — No magic numbers or strings
**Standard:** Replace unexplained literals (timeouts, page sizes, thresholds, retry counts) with
named `UPPER_SNAKE_CASE` constants at module/feature scope; a self-evident, single-use literal is
fine, but name it the moment it carries meaning or repeats.
**Why it matters:** Bare literals hide intent and drift apart when the same value is duplicated
and only some copies are updated.
**Reference:** AGENTS.md §15.1.

### RS-20.2 — No hardcoded URLs, endpoints, or origins
**Standard:** Never inline an API host, path, or third-party origin in a component/hook; API
access goes through `apiClient` (`resolveApiV1Base`) and per-resource services that own their
endpoint paths, and external origins come from config.
**Why it matters:** Hardcoded URLs break across environments and scatter API coupling that should
live in one layer (RS-03).
**Reference:** AGENTS.md §15.2.

### RS-20.3 — Config and secrets via environment, never inline
**Standard:** Environment-specific values come from `import.meta.env.VITE_*` (documented in
`.env.example`) via a typed accessor; secrets are never committed or embedded in client code, and
no real secret is placed in a `VITE_*` var (they ship in the bundle).
**Why it matters:** Inlined config can't change per environment, and a committed/bundled secret is
a security exposure.
**Reference:** AGENTS.md §15.3.

### RS-20.4 — Shared constants for repeated keys
**Standard:** Route paths, storage keys, query-param names, and event names used in more than one
place are defined once as exported constants and imported, never re-typed as literals.
**Why it matters:** Duplicated key literals silently desync (one place updated, another missed),
breaking routing, storage, and URL state.
**Reference:** AGENTS.md §15.4.

### RS-20.5 — Enumerable domain values as `as const` unions
**Standard:** A fixed set of domain values (stage ids, statuses, modes) is defined once as an
`as const` object/union (the `STAGE_IDS`/`StageId` pattern) and referenced everywhere, never
re-spelled as bare string literals.
**Why it matters:** Loose string literals allow typos and invalid values the type system can't
catch, and make the value set impossible to evolve safely.
**Reference:** AGENTS.md §15.5, §8.
