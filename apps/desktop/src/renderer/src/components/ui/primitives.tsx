import { Check, ChevronDown, X } from 'lucide-react'
import {
  Dialog as DialogPrimitive,
  DropdownMenu as MenuPrimitive,
  Popover as PopoverPrimitive,
  Select as SelectPrimitive,
  Slider as SliderPrimitive,
  Switch as SwitchPrimitive,
  Tabs as TabsPrimitive,
  Tooltip as TooltipPrimitive,
} from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* -------------------------------- Tooltip -------------------------------- */

export const TooltipProvider = TooltipPrimitive.Provider

export function Tooltip({
  content,
  shortcut,
  side = 'top',
  children,
}: {
  content: ReactNode
  shortcut?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactNode
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          className="animate-fade-in border-border bg-surface-2 text-fg z-50 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl"
        >
          {content}
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="border-border bg-surface text-muted rounded border px-1.5 py-0.5 font-mono text-[10px]">
      {children}
    </kbd>
  )
}

/* --------------------------------- Dialog -------------------------------- */

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  title,
  description,
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { title: string; description?: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="animate-fade-in fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          'animate-scale-in border-border bg-surface fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-4rem)] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border shadow-2xl outline-none',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
          <div>
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-muted mt-1 text-sm">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="text-muted hover:bg-surface-2 hover:text-fg -mr-2 rounded-lg p-1.5 transition-colors"
            aria-label="Fechar"
          >
            <X className="size-5" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

/* --------------------------------- Select -------------------------------- */

export interface SelectOption {
  value: string
  label: string
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  disabled,
  'aria-label': ariaLabel,
}: {
  value: string | undefined
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
  'aria-label'?: string
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          'border-border bg-surface-2 hover:bg-surface-3 focus-visible:ring-accent data-[placeholder]:text-muted flex h-10 w-full items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm outline-none focus-visible:ring-2 disabled:opacity-50',
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown className="text-muted size-4" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="animate-fade-in border-border bg-surface-2 z-50 max-h-72 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border p-1 shadow-xl"
        >
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="data-[highlighted]:bg-surface-3 relative flex cursor-default items-center rounded-lg py-2 pr-8 pl-3 text-sm outline-none select-none"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2.5">
                  <Check className="text-accent size-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

/* --------------------------------- Switch -------------------------------- */

export function Switch(props: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      {...props}
      className={cn(
        'bg-surface-3 data-[state=checked]:bg-accent relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        props.className,
      )}
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  )
}

/* --------------------------------- Slider -------------------------------- */

export function Slider({ className, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn('relative flex h-5 w-full touch-none items-center select-none', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-white/20">
        <SliderPrimitive.Range className="absolute h-full bg-white" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="focus-visible:ring-accent block size-3.5 rounded-full bg-white shadow outline-none focus-visible:ring-2"
        aria-label="Volume"
      />
    </SliderPrimitive.Root>
  )
}

/* -------------------------------- Popover -------------------------------- */

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverClose = PopoverPrimitive.Close

export function PopoverContent({
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          'animate-scale-in border-border bg-surface z-50 rounded-2xl border shadow-2xl shadow-black/50 outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

/* ---------------------------------- Tabs --------------------------------- */

export const Tabs = TabsPrimitive.Root
export const TabsContent = TabsPrimitive.Content

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('bg-surface-2 inline-flex rounded-xl p-1', className)}
      {...props}
    />
  )
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'text-muted hover:text-fg data-[state=active]:bg-surface-3 data-[state=active]:text-fg rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
        className,
      )}
      {...props}
    />
  )
}

/* ------------------------------ Dropdown menu ----------------------------- */

export const Menu = MenuPrimitive.Root
export const MenuTrigger = MenuPrimitive.Trigger

export function MenuContent({ className, ...props }: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        sideOffset={8}
        className={cn(
          'animate-fade-in border-border bg-surface-2 z-50 min-w-56 rounded-xl border p-1 shadow-xl',
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  )
}

export function MenuItem({ className, ...props }: ComponentProps<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      className={cn(
        'data-[highlighted]:bg-surface-3 [&_svg]:text-muted flex cursor-default items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none select-none data-[disabled]:opacity-50 [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  )
}

export function MenuRadioGroup(props: ComponentProps<typeof MenuPrimitive.RadioGroup>) {
  return <MenuPrimitive.RadioGroup {...props} />
}

export function MenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem
      className={cn(
        'data-[highlighted]:bg-surface-3 relative flex cursor-default items-center rounded-lg py-2 pr-3 pl-8 text-sm outline-none select-none',
        className,
      )}
      {...props}
    >
      <MenuPrimitive.ItemIndicator className="absolute left-2.5">
        <Check className="text-accent size-4" />
      </MenuPrimitive.ItemIndicator>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof MenuPrimitive.Label>) {
  return (
    <MenuPrimitive.Label
      className={cn('text-muted px-3 pt-2 pb-1 text-xs font-medium', className)}
      {...props}
    />
  )
}

export function MenuSeparator() {
  return <MenuPrimitive.Separator className="bg-border my-1 h-px" />
}

/* ---------------------------------- Field --------------------------------- */

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-muted text-xs">{hint}</span>}
    </label>
  )
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'border-border bg-surface-2 text-fg placeholder:text-muted hover:border-surface-3 focus:border-accent focus:ring-accent/30 h-10 w-full rounded-xl border px-3 text-sm outline-none focus:ring-2',
        className,
      )}
      {...props}
    />
  )
}
