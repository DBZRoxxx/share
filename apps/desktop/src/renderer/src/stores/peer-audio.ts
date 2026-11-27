/**
 * How loud each person sounds on this computer only, like Discord's user
 * volume. Keyed by LiveKit identity, which is stable per install.
 */
export interface PeerAudio {
  /** 0–2 (200%). */
  volume: number
  /** Silenced for me; the volume is kept for when it's undone. */
  muted: boolean
}

export type PeerAudioMap = Record<string, PeerAudio>

export const PEER_VOLUME_MAX = 2

const DEFAULT_PEER: PeerAudio = { volume: 1, muted: false }

export function peerAudioOf(map: PeerAudioMap, identity: string): PeerAudio {
  return map[identity] ?? DEFAULT_PEER
}

/** The gain to play someone at (before the output volume). */
export function peerGain(peer: PeerAudio | undefined): number {
  return peer?.muted ? 0 : (peer?.volume ?? 1)
}

/** Applies `patch`; people back at 100% and not silenced are dropped from the map. */
export function updatePeerAudio(
  map: PeerAudioMap,
  identity: string,
  patch: Partial<PeerAudio>,
): PeerAudioMap {
  const current = peerAudioOf(map, identity)
  const next: PeerAudio = {
    volume: Math.min(PEER_VOLUME_MAX, Math.max(0, patch.volume ?? current.volume)),
    muted: patch.muted ?? current.muted,
  }
  const rest = { ...map }
  delete rest[identity]
  return next.volume === 1 && !next.muted ? rest : { ...rest, [identity]: next }
}
