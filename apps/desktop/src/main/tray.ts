import { formatRoomId } from '@share/shared'
import { app, Menu, nativeImage, screen, Tray, type BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc'

/**
 * Notification-area icon. Closing the window hides it here instead of quitting,
 * so a call (and any screen/camera being shared) keeps going.
 */
export class AppTray {
  private tray: Tray | null = null
  private roomId: string | null = null

  constructor(
    private readonly iconPath: string,
    private readonly getWindow: () => BrowserWindow | null,
    private readonly showWindow: () => void,
  ) {}

  create(): void {
    if (this.tray) return
    this.tray = new Tray(this.image())
    this.tray.on('click', this.showWindow)
    this.tray.on('double-click', this.showWindow)
    this.refresh()
  }

  /** Re-renders the icon at the current DPI (tray icons are 16px logical). */
  refreshIcon(): void {
    this.tray?.setImage(this.image())
  }

  private image() {
    const size = Math.round(16 * screen.getPrimaryDisplay().scaleFactor)
    return nativeImage
      .createFromPath(this.iconPath)
      .resize({ width: size, height: size, quality: 'best' })
  }

  setRoom(roomId: string | null): void {
    this.roomId = roomId
    this.refresh()
  }

  /** One-time balloon explaining that the app is still running. */
  showHint(): void {
    this.tray?.displayBalloon({
      iconType: 'info',
      title: 'O Share continua aberto',
      content: this.roomId
        ? 'Você continua na sala. Clique no ícone para voltar, ou com o botão direito para sair.'
        : 'Clique no ícone para abrir, ou com o botão direito para sair.',
    })
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }

  private refresh(): void {
    if (!this.tray) return
    const inRoom = this.roomId !== null
    this.tray.setToolTip(inRoom ? `Share — na sala ${formatRoomId(this.roomId!)}` : 'Share')
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir Share', click: this.showWindow },
        ...(inRoom
          ? [
              {
                label: 'Sair da sala',
                click: () => this.getWindow()?.webContents.send(IPC.trayLeaveRoom),
              },
            ]
          : []),
        { type: 'separator' },
        { label: 'Sair do Share', click: () => app.quit() },
      ]),
    )
  }
}
