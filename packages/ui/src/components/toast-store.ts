export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration: number;
}

export interface ToastInput {
  variant?: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

/** DESIGN.md §9.11: ສູງສຸດ 5 ອັນ, ຄ້າງ 8 ວິນາທີ, ອັນໃໝ່ຢູ່ເທິງ. */
export const MAX_TOASTS = 5;
export const TOAST_DURATION_MS = 8000;

let toasts: ToastItem[] = [];
let sequence = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): ToastItem[] {
  return toasts;
}

function create(input: ToastInput): string {
  sequence += 1;
  const id = `toast-${sequence}`;
  const item: ToastItem = {
    id,
    variant: input.variant ?? "info",
    title: input.title,
    description: input.description,
    duration: input.duration ?? TOAST_DURATION_MS,
  };
  toasts = [item, ...toasts].slice(0, MAX_TOASTS);
  emit();
  return id;
}

export const toast = Object.assign(create, {
  info: (title: string, description?: string) => create({ variant: "info", title, description }),
  success: (title: string, description?: string) => create({ variant: "success", title, description }),
  warning: (title: string, description?: string) => create({ variant: "warning", title, description }),
  error: (title: string, description?: string) => create({ variant: "error", title, description }),
});

export function dismissToast(id: string): void {
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

export function clearToasts(): void {
  toasts = [];
  emit();
}
