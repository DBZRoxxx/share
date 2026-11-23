import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-bold">Link inválido</h1>
      <p className="text-muted">Confira se o convite foi copiado inteiro.</p>
      <Link href="/" className="text-accent mt-2 hover:underline">
        Ir para a página inicial
      </Link>
    </main>
  )
}
