import { describe, it, expect } from 'vitest'
import {
  parseUnifiedDiff,
  matchStop,
  resolveFlowReview,
  type FlowStopInput,
  type FlowReviewInput,
} from './flow-resolve'

const stop = (file: string, locator: FlowStopInput['locator']): FlowStopInput => ({
  id: 'x',
  file,
  locator,
  layer: 'flow',
  title: 't',
  explanation: 'e',
  oneLineSummary: 's',
})

const DIFF = `diff --git a/src/routes/auth.ts b/src/routes/auth.ts
index 1111111..2222222 100644
--- a/src/routes/auth.ts
+++ b/src/routes/auth.ts
@@ -3,6 +3,7 @@ import { loginHandler } from '../handlers/login'
 import { Router } from 'express'
+import { rateLimit } from '../middleware/rateLimit'

 const router = Router()
-router.post('/login', loginHandler)
+router.post('/login', rateLimit(), loginHandler)
diff --git a/src/lib/contracts.ts b/src/lib/contracts.ts
index 3333333..4444444 100644
--- a/src/lib/contracts.ts
+++ b/src/lib/contracts.ts
@@ -10,3 +10,8 @@ export interface AuthToken {
   expiresAt: number
 }
+
+export interface RateConfig {
+  windowMs: number
+  max: number
+}
`

describe('parseUnifiedDiff', () => {
  it('splits per file and per hunk, keyed by new-side path', () => {
    const byFile = parseUnifiedDiff(DIFF)
    expect([...byFile.keys()].sort()).toEqual(['src/lib/contracts.ts', 'src/routes/auth.ts'])
    const auth = byFile.get('src/routes/auth.ts')!
    expect(auth).toHaveLength(1)
    expect(auth[0].header).toBe("@@ -3,6 +3,7 @@ import { loginHandler } from '../handlers/login'")
    expect(auth[0].newStart).toBe(3)
    expect(auth[0].text).toContain('+import { rateLimit }')
  })
})

describe('parseUnifiedDiff edge cases', () => {
  it('keys a deleted file by its old path', () => {
    const del = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
--- a/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-gone
-away`
    const byFile = parseUnifiedDiff(del)
    expect(byFile.has('src/old.ts')).toBe(true)
    expect(byFile.get('src/old.ts')![0].text).toContain('-gone')
  })

  it('surfaces a binary file as one informational hunk', () => {
    const bin = `diff --git a/logo.png b/logo.png
index a1..b2 100644
Binary files a/logo.png and b/logo.png differ`
    const byFile = parseUnifiedDiff(bin)
    expect(byFile.has('logo.png')).toBe(true)
    expect(byFile.get('logo.png')![0].text).toContain('binary file changed')
  })
})

describe('matchStop', () => {
  const byFile = parseUnifiedDiff(DIFF)

  it('resolves all of a file\'s hunks; exact hunkHeader → exact', () => {
    const r = matchStop(
      stop('src/routes/auth.ts', {
        hunkHeader: "@@ -3,6 +3,7 @@ import { loginHandler } from '../handlers/login'",
      }),
      byFile,
    )
    expect(r.matchStatus).toBe('exact')
    expect(r.hunks).toHaveLength(1)
    expect(r.hunks[0].diffText).toContain('+import { rateLimit }')
    expect(r.hunks[0].line).toBe(3)
  })

  it('no locator → whole-file grab, status exact', () => {
    const r = matchStop(stop('src/lib/contracts.ts', undefined), byFile)
    expect(r.matchStatus).toBe('exact')
    expect(r.hunks).toHaveLength(1)
    expect(r.hunks[0].diffText).toContain('RateConfig')
  })

  it('suffix path match works (bare filename)', () => {
    const r = matchStop(stop('contracts.ts', { lineRange: { start: 10, end: 14 } }), byFile)
    expect(r.matchStatus).toBe('exact') // line range overlaps the hunk
    expect(r.hunks[0].diffText).toContain('RateConfig')
  })

  it('no candidate file → missing, no hunks', () => {
    const r = matchStop(stop('src/nope.ts', { hunkHeader: '@@ -1 +1 @@' }), byFile)
    expect(r.matchStatus).toBe('missing')
    expect(r.hunks).toHaveLength(0)
  })

  it('wrong header but right file → fuzzy, still returns the hunks', () => {
    const r = matchStop(stop('src/routes/auth.ts', { hunkHeader: '@@ -999 +999 @@ nope' }), byFile)
    expect(r.matchStatus).toBe('fuzzy')
    expect(r.hunks[0].diffText).toContain('rateLimit')
  })

  it('multiple hunks in one file are all returned, source-ordered', () => {
    const multi = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -50,2 +50,3 @@ later
 keep
+second
@@ -1,2 +1,3 @@ top
 head
+first`
    const r = matchStop(stop('src/x.ts', undefined), parseUnifiedDiff(multi))
    expect(r.hunks).toHaveLength(2)
    expect(r.hunks[0].line).toBe(1) // sorted by newStart
    expect(r.hunks[1].line).toBe(50)
  })
})

describe('resolveFlowReview against this repo', () => {
  it('never throws and returns one resolved stop per input stop', async () => {
    const input: FlowReviewInput = {
      title: 'self-test',
      stops: [
        {
          id: 'a',
          file: 'src/lib/types.ts',
          locator: { lineRange: { start: 1, end: 5 } },
          layer: 'foundation',
          title: 'types',
          explanation: 'x',
          oneLineSummary: 'y',
        },
      ],
    }
    const result = await resolveFlowReview(input)
    expect(result.stops).toHaveLength(1)
    expect(['exact', 'fuzzy', 'missing']).toContain(result.stops[0].matchStatus)
  })
})
