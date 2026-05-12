import { randomUUID } from 'node:crypto';
import { loadProfileSchema, type LoadProfile } from '../domain/load-profile.js';
import type { ScenarioModel, StepDefinition } from '../ast/scenario-model.js';
import type { SlaRule } from '../domain/sla.js';
import type { RequestBuilder } from './request-builders.js';

/** Narrow scope for nested `transaction()` blocks — avoids exposing full scenario APIs. */
export class TransactionScope {
  private readonly steps: StepDefinition[] = [];

  request(builder: RequestBuilder): this {
    this.steps.push({ type: 'request', request: builder.build() });
    return this;
  }

  parallel(...builders: RequestBuilder[]): this {
    this.steps.push({
      type: 'parallel',
      steps: builders.map((b) => ({ type: 'request', request: b.build() })),
    });
    return this;
  }

  /** @internal */
  takeSteps(): StepDefinition[] {
    return [...this.steps];
  }
}

export class ScenarioBuilder {
  private profile: LoadProfile = { kind: 'constant', users: 1 };
  private readonly steps: StepDefinition[] = [];
  private readonly tags: string[] = [];
  private readonly sla: SlaRule[] = [];

  constructor(private readonly name: string) {}

  load(profile: Partial<LoadProfile> & Pick<LoadProfile, 'users'>): this {
    this.profile = loadProfileSchema.parse({ kind: 'constant', ...profile });
    return this;
  }

  tag(...t: string[]): this {
    this.tags.push(...t);
    return this;
  }

  slaRule(rule: SlaRule): this {
    this.sla.push(rule);
    return this;
  }

  request(builder: RequestBuilder): this {
    this.steps.push({ type: 'request', request: builder.build() });
    return this;
  }

  parallel(...builders: RequestBuilder[]): this {
    this.steps.push({
      type: 'parallel',
      steps: builders.map((b) => ({ type: 'request', request: b.build() })),
    });
    return this;
  }

  transaction(name: string, fn: (tx: TransactionScope) => void): this {
    const inner = new TransactionScope();
    fn(inner);
    this.steps.push({ type: 'transaction', name, steps: inner.takeSteps() });
    return this;
  }

  build(): ScenarioModel {
    return {
      id: randomUUID(),
      name: this.name,
      load: this.profile,
      variables: [],
      steps: [...this.steps],
      hooks: [],
      sla: [...this.sla],
      tags: [...this.tags],
    };
  }
}

export function scenario(name: string): ScenarioBuilder {
  return new ScenarioBuilder(name);
}
