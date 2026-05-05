import { Page, Dialog } from 'playwright';
import { logger } from '../../utils/logger';

export type DialogAction = 'accept' | 'dismiss';

export interface DialogRecord {
  type: string;
  message: string;
  action: DialogAction;
  timestamp: number;
}

/**
 * Alert / confirm / prompt / beforeunload handler.
 * PageManager se attach hota hai har naye page par automatically.
 *
 * ```ts
 * pages.dialogs.setDefault('accept');           // sab accept
 * pages.dialogs.acceptNext('my prompt input');   // agla ek accept with text
 * pages.dialogs.dismissNext();                   // agla ek dismiss
 * pages.dialogs.getHistory();                    // kya kya aaya
 * ```
 */
export class DialogHandler {
  private defaultAction: DialogAction = 'dismiss';
  private promptResponse = '';
  private oneTime: { action: DialogAction; response?: string } | null = null;
  private history: DialogRecord[] = [];
  private attached = new WeakSet<Page>();

  attach(page: Page): void {
    if (this.attached.has(page)) return;
    page.on('dialog', (d) => this.handle(d));
    this.attached.add(page);
  }

  setDefault(action: DialogAction, promptResponse?: string): void {
    this.defaultAction = action;
    if (promptResponse !== undefined) this.promptResponse = promptResponse;
  }

  acceptNext(promptResponse?: string): void {
    this.oneTime = { action: 'accept', response: promptResponse };
  }

  dismissNext(): void {
    this.oneTime = { action: 'dismiss' };
  }

  getHistory(): readonly DialogRecord[] {
    return this.history;
  }

  last(): DialogRecord | undefined {
    return this.history[this.history.length - 1];
  }

  clearHistory(): void {
    this.history = [];
  }

  private async handle(dialog: Dialog): Promise<void> {
    const action = this.oneTime?.action ?? this.defaultAction;
    const response = this.oneTime?.response ?? this.promptResponse;
    this.oneTime = null;

    this.history.push({
      type: dialog.type(),
      message: dialog.message(),
      action,
      timestamp: Date.now(),
    });

    logger.info('Dialog', `${dialog.type()} "${dialog.message()}" → ${action}`);

    if (action === 'accept') {
      await dialog.accept(response);
    } else {
      await dialog.dismiss();
    }
  }
}
