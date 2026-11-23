import { describe, expect, it } from 'vitest'
import { metaKey, planEvents } from './chat-plan'

const ana = { roomId: 'k7mq2xp9tn', identity: 'ana', name: 'Ana' }
const bia = { roomId: 'k7mq2xp9tn', identity: 'bia', name: 'Bia' }
const NOW = 1_800_000_000_000

function setup(initial: Record<string, string> = {}, uploads: Record<string, string> = {}) {
  const meta = new Map(Object.entries(initial))
  return {
    meta,
    getMeta: async (fields: string[]) =>
      new Map(fields.flatMap((f) => (meta.has(f) ? [[f, meta.get(f)!] as [string, string]] : []))),
    findUpload: async (fileId: string) => uploads[fileId] ?? null,
  }
}

const text = (id: string, ts = NOW) => ({ v: 1, id, ts, kind: 'text', text: 'oi' })
const file = (id: string, fileId: string) => ({
  v: 1,
  id,
  ts: NOW,
  kind: 'file',
  file: { id: fileId, name: 'a.pdf', size: 10, mime: 'application/pdf' },
})
const act = (id: string, kind: string, target: string, extra = {}) => ({
  v: 1,
  id,
  ts: NOW,
  kind,
  target,
  ...extra,
})

describe('planEvents', () => {
  it('stores messages with the caller as author and clamps bad clocks', async () => {
    const s = setup()
    const plan = await planEvents({
      caller: ana,
      raw: [text('m1', 5), { nope: 1 }],
      ...s,
      now: NOW,
    })
    expect(plan.rejected).toEqual([{ id: '?', reason: 'invalid' }])
    expect(plan.planned).toHaveLength(1)
    const stored = JSON.parse(plan.planned[0]!.member)
    expect(stored).toMatchObject({ from: 'ana', fromName: 'Ana', event: { id: 'm1', ts: NOW } })
    expect(plan.planned[0]!.meta).toEqual([[metaKey.author('m1'), 'ana']])
  })

  it('refuses ids taken by someone else', async () => {
    const s = setup({ [metaKey.author('m1')]: 'bia' })
    const plan = await planEvents({ caller: ana, raw: [text('m1')], ...s, now: NOW })
    expect(plan.rejected).toEqual([{ id: 'm1', reason: 'id in use' }])
  })

  it('only lets the author edit or delete, including within one batch', async () => {
    const s = setup({ [metaKey.author('old')]: 'bia' })
    const plan = await planEvents({
      caller: ana,
      raw: [
        text('m1'),
        act('e1', 'edit', 'm1', { text: 'novo' }),
        act('e2', 'edit', 'old', { text: 'hack' }),
        act('d1', 'delete', 'missing'),
        act('r1', 'react', 'old', { emoji: '👍' }),
        act('r2', 'react', 'not-yet-on-server', { emoji: '👍' }),
      ],
      ...s,
      now: NOW,
    })
    expect(plan.planned.map((p) => p.id)).toEqual(['m1', 'e1', 'r1', 'r2'])
    expect(plan.rejected).toEqual([
      { id: 'e2', reason: 'not the author' },
      { id: 'd1', reason: 'unknown message' },
    ])
  })

  it('confirms uploads only when the blob exists and deletes files with their message', async () => {
    const s = setup({}, { x1: 'rooms/k7mq2xp9tn/x1/a-123.pdf' })
    const plan = await planEvents({
      caller: ana,
      raw: [
        file('f1', 'x1'),
        file('f2', 'x2'),
        act('u1', 'file-ready', 'f1'),
        act('u2', 'file-ready', 'f2'),
        act('d1', 'delete', 'f1'),
      ],
      ...s,
      now: NOW,
    })
    expect(plan.rejected).toEqual([{ id: 'u2', reason: 'upload not found' }])
    const ready = plan.planned.find((p) => p.id === 'u1')!
    expect(ready.meta).toEqual([[metaKey.path('x1'), 'rooms/k7mq2xp9tn/x1/a-123.pdf']])
    expect(plan.planned.find((p) => p.id === 'd1')!.deleteFileId).toBe('x1')
  })

  it('refuses reusing an attachment id and file-ready from others', async () => {
    const s = setup({
      [metaKey.author('f1')]: 'ana',
      [metaKey.fileOf('f1')]: 'x1',
      [metaKey.owner('x1')]: 'f1',
    })
    const a = await planEvents({ caller: ana, raw: [file('f9', 'x1')], ...s, now: NOW })
    expect(a.rejected).toEqual([{ id: 'f9', reason: 'file in use' }])
    const b = await planEvents({ caller: bia, raw: [act('u', 'file-ready', 'f1')], ...s, now: NOW })
    expect(b.rejected).toEqual([{ id: 'u', reason: 'not the author' }])
  })
})
