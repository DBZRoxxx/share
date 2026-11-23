import { describe, expect, it } from 'vitest'
import {
  activeBundle,
  canHotUpdate,
  compareVersions,
  effectiveVersion,
  parseManifest,
  parseState,
  type HotManifest,
  type HotState,
} from './hot-logic'

const H1 = 'a'.repeat(64)
const H2 = 'b'.repeat(64)
const shell = { version: '0.2.0', shellHash: H1 }
const manifest = (version: string, shellHash = H1): HotManifest => ({
  version,
  shellHash,
  file: `renderer-${version}.asar`,
  sha512: 'x'.repeat(88),
  size: 1000,
})
const noState: HotState = { active: null, bad: [] }

describe('compareVersions', () => {
  it('orders semver versions', () => {
    expect(compareVersions('0.2.1', '0.2.0')).toBeGreaterThan(0)
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-beta.1', '1.0.0-beta.2')).toBeLessThan(0)
    expect(compareVersions('garbage', '0.0.1')).toBeLessThan(0)
  })
})

describe('canHotUpdate', () => {
  it('accepts newer bundles built for the same shell', () => {
    expect(canHotUpdate(manifest('0.2.1'), shell, noState)).toBe(true)
  })

  it('rejects other shells, old versions and known-bad versions', () => {
    expect(canHotUpdate(manifest('0.2.1', H2), shell, noState)).toBe(false)
    expect(canHotUpdate(manifest('0.2.0'), shell, noState)).toBe(false)
    expect(canHotUpdate(manifest('0.2.1'), shell, { active: null, bad: ['0.2.1'] })).toBe(false)
  })

  it('compares against an already applied bundle', () => {
    const state: HotState = {
      active: { version: '0.2.2', shellHash: H1, file: 'renderer-0.2.2.asar' },
      bad: [],
    }
    expect(canHotUpdate(manifest('0.2.1'), shell, state)).toBe(false)
    expect(canHotUpdate(manifest('0.2.3'), shell, state)).toBe(true)
  })
})

describe('activeBundle / effectiveVersion', () => {
  it('ignores bundles made obsolete by a full update', () => {
    const state: HotState = {
      active: { version: '0.2.1', shellHash: H1, file: 'renderer-0.2.1.asar' },
      bad: [],
    }
    expect(effectiveVersion(shell, state)).toBe('0.2.1')
    expect(activeBundle({ version: '0.2.1', shellHash: H1 }, state)).toBeNull()
    expect(activeBundle({ version: '0.2.0', shellHash: H2 }, state)).toBeNull()
    expect(effectiveVersion({ version: '0.3.0', shellHash: H2 }, state)).toBe('0.3.0')
  })
})

describe('parsing', () => {
  it('validates manifests strictly', () => {
    expect(parseManifest(manifest('0.2.1'))).not.toBeNull()
    expect(parseManifest({ ...manifest('0.2.1'), file: '../../evil.asar' })).toBeNull()
    expect(parseManifest({ ...manifest('0.2.1'), shellHash: 'short' })).toBeNull()
    expect(parseManifest(null)).toBeNull()
  })

  it('recovers from a corrupt state file', () => {
    expect(parseState('nope')).toEqual(noState)
    expect(parseState({ active: { version: '1.0.0', shellHash: H1, file: '../x' } })).toEqual(
      noState,
    )
  })
})
