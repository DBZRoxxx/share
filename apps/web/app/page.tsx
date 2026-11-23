import { AppWindow, Camera, LayoutGrid, Link2, MonitorUp, Volume2 } from 'lucide-react'
import { DownloadButton } from '@/components/download-button'
import { Logo } from '@/components/logo'
import { getLatestRelease } from '@/lib/releases'

export const revalidate = 600

const FEATURES = [
  {
    icon: MonitorUp,
    title: 'Tela em Full HD',
    text: 'Até 1080p a 60 fps, com modo para jogos e modo para texto nítido.',
  },
  {
    icon: Volume2,
    title: 'Com áudio do PC',
    text: 'O som do que você está compartilhando vai junto com a imagem.',
  },
  {
    icon: Camera,
    title: 'Câmera em 1080p',
    text: 'Todo mundo na sala pode abrir a câmera ao mesmo tempo.',
  },
  {
    icon: LayoutGrid,
    title: 'Várias telas juntas',
    text: 'Veja várias telas lado a lado, destaque uma ou abra em outra janela.',
  },
  {
    icon: Link2,
    title: 'Só mandar o link',
    text: 'Crie a sala, copie o convite e mande no grupo. Sem conta, sem cadastro.',
  },
  {
    icon: AppWindow,
    title: 'App leve para Windows',
    text: 'Instala em segundos, sem pedir administrador, e se atualiza sozinho.',
  },
]

export default async function HomePage() {
  const release = await getLatestRelease()

  return (
    <main className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(ellipse_at_center,rgba(124,108,255,0.28),transparent_65%)]"
      />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-lg font-semibold tracking-tight">Share</span>
        </div>
        <div className="hidden sm:block">
          <DownloadButton release={release} size="md" showMeta={false} />
        </div>
      </header>

      <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pt-12 pb-20 md:grid-cols-[1.1fr_1fr] md:pt-20">
        <div className="text-center sm:text-left">
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Compartilhe sua tela com os amigos.{' '}
            <span className="text-accent">Em Full HD, com áudio.</span>
          </h1>
          <p className="text-muted mt-5 max-w-xl text-lg text-pretty">
            Crie uma sala, mande o link no grupo e pronto: todo mundo pode compartilhar a tela e
            abrir a câmera ao mesmo tempo.
          </p>
          <div className="mt-8 flex justify-center sm:justify-start">
            <DownloadButton release={release} />
          </div>
        </div>

        <StagePreview />
      </section>

      <section className="relative mx-auto max-w-6xl px-6 pb-20">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="border-border bg-surface rounded-2xl border p-5">
              <Icon className="text-accent size-5" aria-hidden="true" />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="text-muted mt-1 text-sm">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="relative mx-auto max-w-3xl px-6 pb-24">
        <h2 className="text-2xl font-bold tracking-tight">Como instalar</h2>
        <ol className="mt-6 space-y-4">
          <Step n={1} title="Baixe o instalador">
            Clique em <strong>Baixar para Windows</strong> e abra o arquivo baixado (
            <code className="text-fg">Share-Setup-x.y.z.exe</code>).
          </Step>
          <Step n={2} title="Se aparecer o aviso azul do Windows">
            O app ainda não tem assinatura digital paga, então o SmartScreen pode avisar. Clique em{' '}
            <strong>Mais informações</strong> e depois em <strong>Executar assim mesmo</strong>.
            Isso só acontece na instalação.
          </Step>
          <Step n={3} title="Crie uma sala e mande o link">
            Escolha um apelido, clique em <strong>Criar sala</strong> e copie o convite. Quem clicar
            no link abre direto na sala.
          </Step>
        </ol>
      </section>

      <footer className="border-border text-muted border-t py-8 text-center text-xs">
        Feito para jogar e assistir junto com os amigos.
      </footer>
    </main>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="border-border bg-surface flex gap-4 rounded-2xl border p-5">
      <span className="bg-accent/15 text-accent flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
        {n}
      </span>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-muted mt-1 text-sm">{children}</p>
      </div>
    </li>
  )
}

/** Static illustration of the room stage: two shared screens + a camera strip. */
function StagePreview() {
  const screens = [
    { label: 'Lucas · tela', bg: 'from-indigo-500/40 to-fuchsia-500/30' },
    { label: 'Bia · tela', bg: 'from-emerald-500/30 to-sky-500/30' },
  ]
  return (
    <div
      aria-hidden="true"
      className="border-border bg-surface rounded-2xl border p-3 shadow-2xl shadow-black/40"
    >
      <div className="grid grid-cols-2 gap-2">
        {screens.map(({ label, bg }) => (
          <div
            key={label}
            className={`relative aspect-video overflow-hidden rounded-lg bg-gradient-to-br ${bg}`}
          >
            <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium">
              {label}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {['Você', 'Lucas', 'Bia', 'Davi'].map((name) => (
          <div
            key={name}
            className="bg-surface-2 relative flex aspect-video items-center justify-center rounded-lg"
          >
            <span className="bg-accent/25 flex size-7 items-center justify-center rounded-full text-xs font-semibold">
              {name[0]}
            </span>
            <span className="text-muted absolute bottom-1 left-1 text-[9px]">{name}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-8 w-8 rounded-full ${i === 3 ? 'bg-red-500/80' : 'bg-surface-2'}`}
          />
        ))}
      </div>
    </div>
  )
}
