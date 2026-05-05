import { DesktopPage } from '../../../src/drivers/desktop/pom/desktop-page';
import { DesktopDriver } from '../../../src/drivers/desktop/desktop-driver';
import { UIElement } from '../../../src/core/types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type JudgePayload = {
  expression: string;
  observed: string;
  expected: string;
  tolerance?: number;
};

export type JudgeOutcome = { pass: boolean } | { unavailable: string };

export type ArithmeticCase = {
  expression: string;
  expected: string;
};

/** Auto-generated desktop POM — scanned from live Accessibility tree */
export class CalculatorScreen extends DesktopPage {
  readonly group = this.element("group"); // AXGroup
  readonly splitGroup = this.element("split group"); // AXSplitGroup
  readonly group2 = this.element("group"); // AXGroup
  readonly group3 = this.element("group"); // AXGroup
  readonly lastExpression = this.element("Last Expression"); // AXScrollArea
  readonly el2664159 = this.element("‎266.4‎+‎15‎+‎9"); // AXStaticText
  readonly editField = this.element("Edit field"); // AXScrollArea
  readonly el2904 = this.element("‎290.4"); // AXStaticText
  readonly button = this.element("button"); // AXButton
  readonly button2 = this.element("button"); // AXButton
  readonly button3 = this.element("button"); // AXButton
  readonly button4 = this.element("button"); // AXButton
  readonly button5 = this.element("button"); // AXButton
  readonly button6 = this.element("button"); // AXButton
  readonly button7 = this.element("button"); // AXButton
  readonly button8 = this.element("button"); // AXButton
  readonly button9 = this.element("button"); // AXButton
  readonly button10 = this.element("button"); // AXButton
  readonly button11 = this.element("button"); // AXButton
  readonly button12 = this.element("button"); // AXButton
  readonly button13 = this.element("button"); // AXButton
  readonly button14 = this.element("button"); // AXButton
  readonly button15 = this.element("button"); // AXButton
  readonly button16 = this.element("button"); // AXButton
  readonly button17 = this.element("button"); // AXButton
  readonly button18 = this.element("button"); // AXButton
  readonly button19 = this.element("button"); // AXButton

  constructor(driver: DesktopDriver) {
    super(driver);
  }

  getDynamicArithmeticCases(): ArithmeticCase[] {
    const seed = Date.now();
    const cases = [
      `${17 + seed % 7}+${9 + seed % 5}`,
      `${95 + seed % 11}-${37 + seed % 6}`,
      `${6 + seed % 4}*${7 + seed % 3}`,
      `${84 + seed % 10}/${3 + seed % 5}`,
    ];

    return cases.map((expression) => ({
      expression,
      expected: String(Function(`"use strict"; return (${expression});`)()),
    }));
  }

  isLLMJudgeConfigured(): boolean {
    return super.isLLMJudgeConfigured();
  }

  async activateCalculatorAndType(expression: string): Promise<void> {
    await this.runAppleScript(`
      tell application "Calculator" to activate
      tell application "System Events"
        key code 53
        delay 0.15
        keystroke "${expression}"
        key code 36
        delay 0.25
      end tell
    `);
  }

  async openScientificMode(): Promise<void> {
    await this.runAppleScript(`
      tell application "Calculator" to activate
      tell application "System Events"
        keystroke "2" using command down
        delay 0.25
      end tell
    `);
  }

  async readResultText(): Promise<string> {
    const timeoutMs = 2500;
    const pollEveryMs = 200;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const elements = await this.driver.getElements();
      const value = this.extractLikelyCalculatorResult(elements);
      if (value.length > 0) return value;
      await new Promise((resolve) => setTimeout(resolve, pollEveryMs));
    }

    return '';
  }

  async judgeArithmeticWithLLM(payload: JudgePayload): Promise<JudgeOutcome> {
    const tolerance = payload.tolerance ?? 1e-9;
    const verdict = await super.judgeJson<{ pass?: boolean; reason?: string }>({
      prompt: JSON.stringify({
        expression: payload.expression,
        observedResult: payload.observed,
        expectedResult: payload.expected,
        numericTolerance: tolerance,
        instruction:
          'Compare observedResult and expectedResult numerically. Treat formatting differences as equivalent (commas, trailing zeros, unicode minus). Return JSON exactly as {"pass": true|false, "reason": "..."}',
      }),
      temperature: 0,
      maxTokens: 140,
    });

    if ('unavailable' in verdict) return verdict;
    if ('parseError' in verdict) {
      return { pass: false };
    }

    return { pass: verdict.data.pass === true };
  }

  private async runAppleScript(script: string): Promise<void> {
    const escaped = script.replace(/'/g, "'\\''");
    await execAsync(`osascript -e '${escaped}'`);
  }

  private extractLikelyCalculatorResult(elements: UIElement[]): string {
    const candidates = elements
      .flatMap((el) => [el.value, el.name, el.label, ...Object.values(el.attributes ?? {})])
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .filter((text) => /[-\d]/.test(text))
      .map((text) => text.trim());

    if (!candidates.length) return '';

    return candidates.reduce((best, current) => {
      const bestNum = this.toComparableNumber(best);
      const currentNum = this.toComparableNumber(current);
      if (currentNum !== null && bestNum === null) return current;
      if (currentNum !== null && bestNum !== null) {
        return current.length >= best.length ? current : best;
      }
      return best;
    });
  }

  private toComparableNumber(raw: string): number | null {
    const normalized = raw
      .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
      .replace(/,/g, '')
      .replace(/[−–—]/g, '-')
      .trim();
    const match = normalized.match(/-?\d+(\.\d+)?([eE][+-]?\d+)?/);
    if (!match) return null;
    const num = Number(match[0]);
    return Number.isFinite(num) ? num : null;
  }

}
