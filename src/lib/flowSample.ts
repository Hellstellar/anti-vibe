import type { FlowReviewDoc } from './types'

/**
 * Hand-written sample review for demoing Flow Review without an agent or the MCP
 * bridge. Loaded when the app is opened with `?flowdemo` (see main.tsx). Models a
 * typical backend request path (flow lane, top→bottom) resting on a foundation
 * file (foundation lane, bottom→up). Each stop maps to a file; the "Login route"
 * stop carries two hunks to demo hunk-stepping.
 */
export const flowSample: FlowReviewDoc = {
  kind: 'flow-review',
  documentId: 'sample-flow-review',
  title: 'Add rate limiting to the login endpoint',
  createdAt: 0,
  stops: [
    {
      id: 'route',
      file: 'src/routes/auth.ts',
      layer: 'flow',
      title: 'Login route',
      oneLineSummary: 'Wires the new rateLimit middleware in front of the login handler.',
      explanation:
        'This is the **entry point** for the change. The request first hits `rateLimit` before reaching `loginHandler`, so abusive clients are turned away before any password work happens. This file has two hunks — step through them with ← / →.',
      callsTo: ['middleware', 'audit'],
      matchStatus: 'exact',
      absPath: '/Users/you/proj/src/routes/auth.ts',
      hunks: [
        {
          header: "@@ -3,6 +3,7 @@ import { loginHandler } from '../handlers/login'",
          line: 3,
          diffText: `@@ -3,6 +3,7 @@ import { loginHandler } from '../handlers/login'
 import { Router } from 'express'
+import { rateLimit } from '../middleware/rateLimit'

 const router = Router()
-router.post('/login', loginHandler)
+router.post('/login', rateLimit({ windowMs: 60000, max: 5 }), loginHandler)`,
        },
        {
          header: '@@ -22,3 +23,4 @@ router.post(',
          line: 23,
          diffText: `@@ -22,3 +23,4 @@ router.post(
 router.post('/logout', logoutHandler)
+router.post('/refresh', rateLimit({ windowMs: 60000, max: 30 }), refreshHandler)
 export default router`,
        },
      ],
    },
    {
      id: 'middleware',
      file: 'src/middleware/rateLimit.ts',
      layer: 'flow',
      title: 'Rate limit middleware',
      oneLineSummary: 'New middleware that counts hits per IP in a sliding window.',
      explanation:
        'The middleware reads the client IP, increments its counter in the `RateStore`, and rejects with `429` once the window `max` is exceeded. Note it *calls into* the store rather than holding state itself.',
      callsTo: ['store'],
      matchStatus: 'exact',
      absPath: '/Users/you/proj/src/middleware/rateLimit.ts',
      hunks: [
        {
          header: '@@ -0,0 +1,14 @@',
          line: 1,
          diffText: `@@ -0,0 +1,14 @@
+import type { RequestHandler } from 'express'
+import { hit } from '../lib/rateStore'
+import type { RateConfig } from '../lib/contracts'
+
+export function rateLimit(cfg: RateConfig): RequestHandler {
+  return (req, res, next) => {
+    const count = hit(req.ip, cfg.windowMs)
+    if (count > cfg.max) {
+      res.status(429).json({ error: 'Too many requests' })
+      return
+    }
+    next()
+  }
+}`,
        },
      ],
    },
    {
      id: 'store',
      file: 'src/lib/rateStore.ts',
      layer: 'flow',
      title: 'Rate store',
      oneLineSummary: 'In-memory sliding-window counter keyed by IP.',
      explanation:
        'The last flow stop: `hit()` prunes timestamps older than the window and returns the current count. Backed by a plain `Map` for the prototype — swap for Redis in production.',
      matchStatus: 'fuzzy',
      absPath: '/Users/you/proj/src/lib/rateStore.ts',
      hunks: [
        {
          header: '@@ -0,0 +1,9 @@',
          line: 1,
          diffText: `@@ -0,0 +1,9 @@
+const buckets = new Map<string, number[]>()
+
+export function hit(ip: string, windowMs: number): number {
+  const now = Date.now()
+  const fresh = (buckets.get(ip) ?? []).filter((t) => now - t < windowMs)
+  fresh.push(now)
+  buckets.set(ip, fresh)
+  return fresh.length
+}`,
        },
      ],
    },
    {
      id: 'audit',
      file: 'src/lib/audit.ts',
      layer: 'flow',
      title: 'Audit log',
      oneLineSummary: 'Second branch: records the throttled attempt for security review.',
      explanation:
        'The **other branch** from the route — the login path also fans out to an audit sink. Reachable by picking it at the branch prompt or clicking it in the call flow.',
      matchStatus: 'exact',
      absPath: '/Users/you/proj/src/lib/audit.ts',
      hunks: [
        {
          header: '@@ -0,0 +1,5 @@',
          line: 1,
          diffText: `@@ -0,0 +1,5 @@
+export function audit(event: string, ip: string): void {
+  // eslint-disable-next-line no-console
+  console.info('[audit]', event, ip, Date.now())
+}`,
        },
      ],
    },
    {
      id: 'contracts',
      file: 'src/lib/contracts.ts',
      layer: 'foundation',
      title: 'RateConfig contract',
      oneLineSummary: 'The shape every layer above agrees on.',
      explanation:
        'A **foundation** type. Read this *after* you have seen how it is used above — it is the contract the route, middleware, and store all share.',
      matchStatus: 'exact',
      absPath: '/Users/you/proj/src/lib/contracts.ts',
      hunks: [
        {
          header: '@@ -10,3 +10,8 @@ export interface AuthToken {',
          line: 10,
          diffText: `@@ -10,3 +10,8 @@ export interface AuthToken {
   expiresAt: number
 }
+
+export interface RateConfig {
+  windowMs: number
+  max: number
+}`,
        },
      ],
    },
  ],
}
