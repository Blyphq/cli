import { intro, log, note, outro } from "@clack/prompts";

export function showIntro(): void {
  intro("blyp");
}

export function showOutro(message: string): void {
  outro(message);
}

export function showInfo(message: string): void {
  log.info(message);
}

export function showSuccess(message: string): void {
  log.success(message);
}

export function showWarning(message: string): void {
  log.warn(message);
}

export function showError(message: string): void {
  log.error(message);
}

export function showNote(title: string, message: string): void {
  note(message, title);
}
