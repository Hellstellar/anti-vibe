import { describe, it, expect } from 'vitest'
import { mermaidWalk } from './mermaidWalk'

describe('mermaidWalk / flowchart', () => {
  it('walks nodes in first-appearance order with shape text as labels', () => {
    const w = mermaidWalk(
      `graph TD
  A[Agent writes] --> B{Review?}
  B -->|yes| C[Anti-Vibe]
  B -->|no| D[Vibe merge]
  C --> E[Ship]`,
    )!
    expect(w.map((i) => (i.type === 'flow-node' ? i.id : ''))).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
    ])
    expect(w.map((i) => i.label)).toEqual([
      'Agent writes',
      'Review?',
      'Anti-Vibe',
      'Vibe merge',
      'Ship',
    ])
  })

  it('handles flowchart header, chains, ampersands and late text defs', () => {
    const w = mermaidWalk(
      `flowchart LR
  A --> B --> C
  A & B --> D
  B[Named later]`,
    )!
    expect(w.map((i) => (i.type === 'flow-node' ? i.id : ''))).toEqual([
      'A',
      'B',
      'C',
      'D',
    ])
    expect(w[1].label).toBe('Named later')
  })

  it('handles round/circle/hexagon shapes, quoted text and edge variants', () => {
    const w = mermaidWalk(
      `graph TD
  A("round") -.-> B((circle))
  B ==> C{{hexagon}}
  C --- D[(db)]
  D -- inline text --> E`,
    )!
    expect(w.map((i) => i.label)).toEqual(['round', 'circle', 'hexagon', 'db', 'E'])
  })

  it('skips subgraph scaffolding and style/class lines', () => {
    const w = mermaidWalk(
      `graph TD
  subgraph cluster [Group]
    A --> B
  end
  style A fill:#f00
  classDef hot fill:#f00
  class A hot
  click A href "https://x"`,
    )!
    expect(w.map((i) => (i.type === 'flow-node' ? i.id : ''))).toEqual(['A', 'B'])
  })

  it('flattens embedded HTML like <br/> in node labels', () => {
    const w = mermaidWalk(
      `graph TD\n  A[Procedure node<br/>(source_text property)] --> B`,
    )!
    expect(w[0].label).toBe('Procedure node (source_text property)')
  })

  it('ignores %% comments', () => {
    const w = mermaidWalk(`graph TD\n  %% a comment\n  A --> B %% trailing`)!
    expect(w).toHaveLength(2)
  })

  it('returns null for an empty flowchart', () => {
    expect(mermaidWalk('graph TD')).toBeNull()
  })
})

describe('mermaidWalk / sequence', () => {
  it('walks messages in order, resolving participant aliases', () => {
    const w = mermaidWalk(
      `sequenceDiagram
  participant U as User
  participant R as Reader
  U->>R: paste markdown
  R-->>U: rendered diagram`,
    )!
    expect(w).toEqual([
      { type: 'seq-message', index: 0, label: 'User → Reader' },
      { type: 'seq-message', index: 1, label: 'Reader → User' },
    ])
  })

  it('includes notes as walk stops and skips loops/activations', () => {
    const w = mermaidWalk(
      `sequenceDiagram
  A->>B: one
  Note over A,B: important
  loop retry
    B-->>A: two
  end
  activate B`,
    )!
    expect(w.map((i) => i.type)).toEqual(['seq-message', 'seq-note', 'seq-message'])
    expect((w[1] as { index: number }).index).toBe(0)
    expect((w[2] as { index: number }).index).toBe(1)
  })
})

describe('mermaidWalk / unsupported', () => {
  it('returns null for other diagram types and garbage', () => {
    expect(mermaidWalk('pie\n  "a": 1')).toBeNull()
    expect(mermaidWalk('gantt\n  title x')).toBeNull()
    expect(mermaidWalk('stateDiagram-v2\n  [*] --> S')).toBeNull()
    expect(mermaidWalk('')).toBeNull()
  })
})
