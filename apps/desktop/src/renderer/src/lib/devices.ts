import { useEffect, useState } from 'react'
import type { SelectOption } from '@/components/ui/primitives'

const FALLBACK_LABEL: Record<MediaDeviceKind, string> = {
  videoinput: 'Câmera',
  audioinput: 'Microfone',
  audiooutput: 'Alto-falante',
}

/** Live list of media devices of one kind, refreshed on plug/unplug. */
export function useDevices(kind: MediaDeviceKind, refreshKey: unknown = null): SelectOption[] {
  const [devices, setDevices] = useState<SelectOption[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const all = await navigator.mediaDevices.enumerateDevices()
      if (cancelled) return
      let n = 0
      setDevices(
        all
          .filter((d) => d.kind === kind && d.deviceId)
          .map((d) => ({
            value: d.deviceId,
            label:
              d.deviceId === 'default'
                ? `Padrão do sistema${d.label ? ` (${d.label.replace(/^Default - |^Padrão - /, '')})` : ''}`
                : d.deviceId === 'communications'
                  ? `Comunicações${d.label ? ` (${d.label.replace(/^Communications - |^Comunicação - /, '')})` : ''}`
                  : d.label || `${FALLBACK_LABEL[kind]} ${++n}`,
          })),
      )
    }
    void load()
    navigator.mediaDevices.addEventListener('devicechange', load)
    return () => {
      cancelled = true
      navigator.mediaDevices.removeEventListener('devicechange', load)
    }
  }, [kind, refreshKey])

  return devices
}

export function describeMediaError(error: unknown, what: 'câmera' | 'microfone'): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError')
    return `Acesso à ${what} bloqueado. Libere nas configurações de privacidade do Windows.`
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return `Nenhuma ${what} encontrada.`
  if (name === 'NotReadableError') return `A ${what} está em uso por outro app.`
  return error instanceof Error ? error.message : `Erro ao abrir a ${what}.`
}
