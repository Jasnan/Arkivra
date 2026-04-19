import type { FormEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const DEFAULT_TAG_COLORS = ['#D8FF75', '#7FFF7A', '#7AFFCE', '#7AD7FF', '#7A7FFF', '#CE7AFF', '#FF7AD7', '#FF7A7F', '#FFCE7A', '#FFFFFF'];

export function TagDialog({
  isOpen,
  title,
  submitLabel,
  pendingLabel,
  closeLabel,
  extraFields,
  isPending,
  isSubmitDisabled,
  nameValue,
  colorValue,
  descriptionValue,
  onNameChange,
  onColorChange,
  onDescriptionChange,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  title: string;
  submitLabel: string;
  pendingLabel: string;
  closeLabel: string;
  extraFields?: ReactNode;
  isPending: boolean;
  isSubmitDisabled: boolean;
  nameValue: string;
  colorValue: string;
  descriptionValue: string;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const customColorInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedName = nameValue.trim();

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isPending) {
          onClose();
        }
      }}
    >
      <DialogContent
        hideCloseButton
        className="max-w-3xl"
        onPointerDownOutside={(event) => {
          if (isPending) {
            event.preventDefault();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (isPending) {
            event.preventDefault();
          }
        }}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-8 sm:pt-7">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{title}</DialogDescription>
          </DialogHeader>
          <button
            type="button"
            aria-label={closeLabel}
            className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            onClick={onClose}
            disabled={isPending}
          >
            <X className="size-5" />
          </button>
        </div>

        <form className="space-y-6 px-6 pb-6 pt-5 sm:px-8 sm:pb-8" onSubmit={onSubmit}>
          <div className="space-y-3">
            <label htmlFor="tag-dialog-name" className="text-[1.05rem] font-medium text-foreground">Name</label>
            <input
              id="tag-dialog-name"
              type="text"
              required
              autoFocus
              maxLength={64}
              value={nameValue}
              onChange={event => onNameChange(event.target.value)}
              className="h-14 w-full rounded-2xl border border-foreground/20 bg-background px-4 text-lg text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/35"
              placeholder="Tag name"
            />
          </div>

          {extraFields}

          <div className="space-y-3">
            <label className="text-[1.05rem] font-medium text-foreground">Color</label>
            <div className="flex flex-wrap items-center gap-2.5">
              {DEFAULT_TAG_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Select color ${color}`}
                  aria-pressed={colorValue === color}
                  className={`flex size-10 items-center justify-center rounded-xl border transition ${colorValue === color ? 'border-foreground/35 ring-2 ring-foreground/10' : 'border-border/70 hover:border-foreground/20'}`}
                  style={{ backgroundColor: color }}
                  onClick={() => onColorChange(color)}
                >
                  {colorValue === color ? (
                    <span className={`size-2.5 rounded-full ${color === '#FFFFFF' ? 'bg-foreground' : 'bg-black/65'}`} />
                  ) : null}
                </button>
              ))}
              <button
                type="button"
                aria-label="Choose custom color"
                className="inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background text-foreground transition hover:border-foreground/20"
                onClick={() => customColorInputRef.current?.click()}
              >
                <Plus className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Reset tag color"
                className="inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                onClick={() => onColorChange('#D8FF75')}
              >
                <RefreshCw className="size-5" />
              </button>
              <input
                ref={customColorInputRef}
                type="color"
                value={colorValue}
                className="sr-only"
                onChange={event => onColorChange(event.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className="space-y-3">
            <label htmlFor="tag-dialog-description" className="text-[1.05rem] font-medium text-foreground">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="tag-dialog-description"
              maxLength={256}
              value={descriptionValue}
              onChange={event => onDescriptionChange(event.target.value)}
              className="min-h-32 w-full resize-y rounded-2xl border border-border/70 bg-background px-4 py-3 text-lg text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/20"
              placeholder="Eg. All the contracts signed by the company"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <span className="inline-flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1 text-sm leading-none text-foreground">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ backgroundColor: colorValue }}
              />
              {normalizedName || 'New tag'}
            </span>
            <Button
              type="submit"
              className="h-12 rounded-2xl px-6 text-base"
              disabled={isSubmitDisabled}
            >
              {isPending ? pendingLabel : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
