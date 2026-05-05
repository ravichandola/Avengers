import { test, expect } from '../../src/fixtures';
import { CalculatorScreen } from '../pom/desktop/calculator-screen';

test.describe('Calculator - basic and scientific validation', () => {
  test.skip(process.platform !== 'darwin', 'macOS only');

  test('dynamic arithmetic uses LLM judge for +, -, *, / @app=Calculator @platform=macos', async ({ app }, testInfo) => {
    test.skip(testInfo.project.name.includes('windows'), 'Skip Windows project for macOS desktop flow');
    const screen = new CalculatorScreen(app as any);
    test.skip(!screen.isLLMJudgeConfigured(), 'LLM provider/key not configured in .env');

    const title = await app.getTitle();
    expect(title.length).toBeGreaterThan(0);

    const arithmeticCases = screen.getDynamicArithmeticCases();

    for (const testCase of arithmeticCases) {
      await screen.activateCalculatorAndType(testCase.expression);
      const observed = await screen.readResultText();
      if (!observed.length) {
        test.skip(true, 'Calculator AX result text not available in current session');
      }

      const judged = await screen.judgeArithmeticWithLLM({
        expression: testCase.expression,
        observed,
        expected: testCase.expected,
        tolerance: 1e-6,
      });
      if ('unavailable' in judged) {
        test.skip(true, judged.unavailable);
      } else {
        expect(judged.pass).toBeTruthy();
      }
    }
  });

  test('scientific calculation validated by LLM judge @app=Calculator @platform=macos', async ({ app }, testInfo) => {
    test.skip(testInfo.project.name.includes('windows'), 'Skip Windows project for macOS desktop flow');
    const screen = new CalculatorScreen(app as any);
    test.skip(!screen.isLLMJudgeConfigured(), 'LLM provider/key not configured in .env');

    const title = await app.getTitle();
    expect(title.length).toBeGreaterThan(0);

    await screen.openScientificMode();

    const scientificExpression = 'sin(30)';
    await screen.activateCalculatorAndType(scientificExpression);

    const observed = await screen.readResultText();
    if (!observed.length) {
      test.skip(true, 'Calculator AX result text not available in current session');
    }

    const judged = await screen.judgeArithmeticWithLLM({
      expression: scientificExpression,
      observed,
      expected: '0.5',
      tolerance: 1e-3,
    });
    if ('unavailable' in judged) {
      test.skip(true, judged.unavailable);
    } else {
      expect(judged.pass).toBeTruthy();
    }
  });
});
