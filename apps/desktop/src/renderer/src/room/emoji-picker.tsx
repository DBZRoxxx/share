import { EmojiPicker as Picker } from 'frimousse'
import { Loader2, Search } from 'lucide-react'

/** Emoji grid with Portuguese search (data from Emojibase, cached by frimousse). */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <Picker.Root
      locale="pt"
      columns={9}
      onEmojiSelect={({ emoji }) => onPick(emoji)}
      className="isolate flex h-[380px] w-[340px] flex-col"
    >
      <div className="p-3 pb-2">
        <label className="border-border bg-surface-2 focus-within:border-accent flex h-9 items-center gap-2 rounded-xl border px-3">
          <Search className="text-muted size-4 shrink-0" aria-hidden="true" />
          <Picker.Search
            autoFocus
            placeholder="Buscar emoji"
            aria-label="Buscar emoji"
            className="placeholder:text-muted w-full bg-transparent text-sm outline-none"
          />
        </label>
      </div>
      <Picker.Viewport className="relative min-h-0 flex-1 outline-none">
        <Picker.Loading className="text-muted absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-5 animate-spin" aria-label="Carregando" />
        </Picker.Loading>
        <Picker.Empty className="text-muted absolute inset-0 flex items-center justify-center text-sm">
          Nenhum emoji encontrado.
        </Picker.Empty>
        <Picker.List
          className="pb-2 select-none"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div className="bg-surface text-muted px-3 pt-2 pb-1 text-xs font-medium" {...props}>
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div className="scroll-my-1 px-2" {...props}>
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button
                className="data-[active]:bg-surface-3 flex size-9 items-center justify-center rounded-lg text-xl"
                {...props}
              >
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </Picker.Viewport>
    </Picker.Root>
  )
}
