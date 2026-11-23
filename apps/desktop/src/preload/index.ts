import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { AUDIO_PORT_MESSAGE, IPC, type ShareApi, type UpdateStatus } from '../shared/ipc'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// MessagePorts can't cross the context bridge as arguments, so the port that
// carries app-audio PCM is forwarded to the page with window.postMessage.
ipcRenderer.on(IPC.appAudioPort, (event) => {
  window.postMessage({ type: AUDIO_PORT_MESSAGE }, '*', event.ports)
})

const api: ShareApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
    show: () => ipcRenderer.invoke(IPC.showWindow),
    setRoom: (roomId, name) => ipcRenderer.invoke(IPC.setRoom, roomId, name ?? null),
    rendererReady: () => ipcRenderer.invoke(IPC.rendererReady),
    consumeResume: () => ipcRenderer.invoke(IPC.consumeResume),
    onLeaveRoomRequest: (callback) => subscribe<void>(IPC.trayLeaveRoom, callback),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.getSettings),
    set: (partial) => ipcRenderer.invoke(IPC.setSettings, partial),
  },
  capture: {
    getSources: () => ipcRenderer.invoke(IPC.getSources),
    select: (sourceId, systemAudio) => ipcRenderer.invoke(IPC.selectSource, sourceId, systemAudio),
    audioSupport: () => ipcRenderer.invoke(IPC.audioSupport),
    startAppAudio: (sourceId) => ipcRenderer.invoke(IPC.startAppAudio, sourceId),
    stopAppAudio: () => ipcRenderer.invoke(IPC.stopAppAudio),
  },
  deepLink: {
    consumePending: () => ipcRenderer.invoke(IPC.consumeDeepLink),
    onOpen: (callback) => subscribe<string>(IPC.deepLinkOpen, callback),
  },
  updater: {
    getStatus: () => ipcRenderer.invoke(IPC.updateGetStatus),
    onStatus: (callback) => subscribe<UpdateStatus>(IPC.updateStatus, callback),
    apply: (resume) => ipcRenderer.invoke(IPC.updateApply, resume),
    check: () => ipcRenderer.invoke(IPC.updateCheck),
  },
}

contextBridge.exposeInMainWorld('share', api)
