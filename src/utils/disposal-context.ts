/**
 * LIFO stacks of teardown callbacks. Use for HTTP servers, temp files, etc.
 *
 * **Test scope:** push with {@link addTestDisposable} or {@link add}. The bundled
 * `test` export from `src/fixtures` runs {@link disposeTestStack} in `afterEach`.
 *
 * **Describe / worker scope:** use {@link addDescribeDisposable} and call
 * `await disposalContext.disposeDescribeStack()` from your own `test.afterAll`
 * (once per suite that registered describe-scoped work).
 */
export class DisposalContext {
  testStack: Disposable[] = [];
  describeStack: Disposable[] = [];

  async disposeTestStack(): Promise<void> {
    while (this.testStack.length > 0) {
      await Promise.resolve(this.testStack.pop()!());
    }
  }

  async disposeDescribeStack(): Promise<void> {
    while (this.describeStack.length > 0) {
      await Promise.resolve(this.describeStack.pop()!());
    }
  }

  addTestDisposable(disposable: Disposable): void {
    this.testStack.push(disposable);
  }

  addDescribeDisposable(disposable: Disposable): void {
    this.describeStack.push(disposable);
  }

  /** Alias for {@link addTestDisposable} — registers cleanup after each test. */
  add(disposable: Disposable): void {
    this.addTestDisposable(disposable);
  }
}

type Disposable = () => void | Promise<void>;

export const disposalContext = new DisposalContext();
