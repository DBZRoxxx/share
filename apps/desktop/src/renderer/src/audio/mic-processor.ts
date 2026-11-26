import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client'
import { createMicChain, type MicChain } from './mic-chain'

/**
 * Puts the mic chain (noise suppression, volume, gate) on the published
 * microphone. LiveKit allows one processor per track, so everything lives in
 * this one. One instance per track: stopping the track destroys it.
 *
 * The chain runs on its own 48 kHz context (DeepFilterNet's rate) rather than
 * the room's, whose rate follows the output device.
 */
export class MicTrackProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  readonly name = 'share-mic'
  processedTrack?: MediaStreamTrack
  private chain: MicChain | null = null

  async init({ track }: AudioProcessorOptions): Promise<void> {
    this.chain?.dispose()
    this.chain = await createMicChain(track)
    this.processedTrack = this.chain.output
  }

  async restart({ track }: AudioProcessorOptions): Promise<void> {
    // New capture (device switch, other constraints): same chain, same output.
    if (this.chain) this.chain.setInput(track)
    else await this.init({ track } as AudioProcessorOptions)
  }

  async destroy(): Promise<void> {
    this.chain?.dispose()
    this.chain = null
    this.processedTrack = undefined
  }
}
