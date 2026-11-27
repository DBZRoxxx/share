import { describe, expect, it } from 'vitest'
import { peerAudioOf, peerGain, updatePeerAudio } from './peer-audio'

describe('peerGain', () => {
  it('plays unknown people at 100%', () => {
    expect(peerGain(undefined)).toBe(1)
  })

  it('uses the volume, up to 200%', () => {
    expect(peerGain({ volume: 1.5, muted: false })).toBe(1.5)
  })

  it('is silent when muted, whatever the volume', () => {
    expect(peerGain({ volume: 2, muted: true })).toBe(0)
  })
})

describe('updatePeerAudio', () => {
  it('stores a new volume', () => {
    expect(updatePeerAudio({}, 'a', { volume: 1.8 })).toEqual({ a: { volume: 1.8, muted: false } })
  })

  it('clamps to 0–200%', () => {
    expect(updatePeerAudio({}, 'a', { volume: 3 }).a?.volume).toBe(2)
    expect(updatePeerAudio({}, 'a', { volume: -1 }).a?.volume).toBe(0)
  })

  it('keeps the volume while muted and restores it on unmute', () => {
    const muted = updatePeerAudio({ a: { volume: 0.4, muted: false } }, 'a', { muted: true })
    expect(muted.a).toEqual({ volume: 0.4, muted: true })
    expect(peerAudioOf(updatePeerAudio(muted, 'a', { muted: false }), 'a')).toEqual({
      volume: 0.4,
      muted: false,
    })
  })

  it('drops people back at the default', () => {
    const map = { a: { volume: 1.2, muted: false }, b: { volume: 0.5, muted: false } }
    expect(updatePeerAudio(map, 'a', { volume: 1 })).toEqual({ b: { volume: 0.5, muted: false } })
  })

  it('leaves the original map untouched', () => {
    const map = { a: { volume: 0.5, muted: false } }
    updatePeerAudio(map, 'a', { muted: true })
    expect(map.a.muted).toBe(false)
  })
})
