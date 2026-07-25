import { describe, expect, it, vi } from 'vitest';
import {
  Phase9ProviderGateway,
  buildPhase9CallPlan,
  buildPhase9PageBlocks,
  classifyPhase9Coverage,
  minePhase9DeterministicCandidates,
  reducePhase9Candidates,
  validatePhase9TaskResult,
} from '../../packages/ai/src';

const HASH = 'a'.repeat(64);

function fixture() {
  const blocks = buildPhase9PageBlocks({
    workspaceId: 'workspace-a',
    documentId: 'document-a',
    documentName: 'fixture.pdf',
    sourceHash: HASH,
    pages: [{ pageNumber: 1, text: 'Background regarding insurance and prices.' }],
  });
  const coverage = classifyPhase9Coverage(blocks);
  const candidates = reducePhase9Candidates(
    minePhase9DeterministicCandidates(blocks, coverage),
  ).candidates;
  const plan = buildPhase9CallPlan({
    workspaceId: 'workspace-a',
    sourcePackageHash: HASH,
    parserVersion: 'parser-v1',
    normalizationVersion: 'normalization-v1',
    tableVersion: 'table-v1',
    evaluatorVersion: 'evaluator-v1',
    blocks,
    coverage,
    candidates,
  });
  const task = plan.tasks[0]!;
  return { blocks, candidates, plan, task };
}

function response(output: unknown, overrides: Record<string, unknown> = {}) {
  return {
    id: 'resp_phase9',
    object: 'response',
    created_at: 1,
    model: 'gpt-5.4-mini-2026-03-17',
    status: 'completed',
    output_text: JSON.stringify(output),
    output: [],
    usage: {
      input_tokens: 50,
      output_tokens: 20,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
    ...overrides,
  };
}

describe('Phase 9 provider gateway', () => {
  it('accepts one planned strict result without tools, retries, or repair', async () => {
    const { blocks, candidates, plan, task } = fixture();
    const create = vi.fn().mockResolvedValue(
      response({
        decisions: blocks.map((block) => ({
          blockId: block.id,
          result: 'no_additional_requirement',
        })),
      }),
    );
    const gateway = new Phase9ProviderGateway(plan, {
      apiKey: 'test-only',
      client: { responses: { create } } as never,
    });
    const result = await gateway.execute({ task, blocks, candidates });
    expect(result.firstPassSchemaAdherent).toBe(true);
    expect(result.repairAttempts).toBe(0);
    expect(result.retries).toBe(0);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toMatchObject({
      model: task.modelId,
      store: false,
      reasoning: { effort: 'low' },
    });
    expect(create.mock.calls[0]![0]).not.toHaveProperty('tools');
  });

  it('rejects an unplanned model before provider construction', async () => {
    const { blocks, candidates, plan, task } = fixture();
    const create = vi.fn();
    const gateway = new Phase9ProviderGateway(plan, {
      apiKey: 'test-only',
      client: { responses: { create } } as never,
    });
    await expect(
      gateway.execute({ task: { ...task, modelId: 'unauthorized-model' }, blocks, candidates }),
    ).rejects.toThrow('phase9_provider_call_incompatible_with_plan');
    expect(create).not.toHaveBeenCalled();
  });

  it('fails closed on incomplete provider output', async () => {
    const { blocks, candidates, plan, task } = fixture();
    const create = vi
      .fn()
      .mockResolvedValue(
        response({}, { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }),
      );
    const gateway = new Phase9ProviderGateway(plan, {
      apiKey: 'test-only',
      client: { responses: { create } } as never,
    });
    await expect(gateway.execute({ task, blocks, candidates })).rejects.toThrow(
      'phase9_provider_incomplete:max_output_tokens',
    );
  });

  it('rejects malformed cached results and unknown evidence references', () => {
    const { blocks, candidates, task } = fixture();
    expect(() =>
      validatePhase9TaskResult({ task, blocks, candidates, result: { decisions: [] } }),
    ).toThrow('phase9_provider_coverage_reference_invalid');
    expect(() =>
      validatePhase9TaskResult({
        task,
        blocks,
        candidates,
        result: {
          decisions: [{ blockId: 'f'.repeat(64), result: 'additional_candidate' }],
        },
      }),
    ).toThrow('phase9_provider_coverage_reference_invalid');
  });

  it('rejects provider usage above the exact task allowance', async () => {
    const { blocks, candidates, plan, task } = fixture();
    const create = vi.fn().mockResolvedValue(
      response(
        {
          decisions: blocks.map((block) => ({
            blockId: block.id,
            result: 'no_additional_requirement',
          })),
        },
        {
          usage: {
            input_tokens: task.maximumInputTokens + 1,
            output_tokens: 20,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 },
          },
        },
      ),
    );
    const gateway = new Phase9ProviderGateway(plan, {
      apiKey: 'test-only',
      client: { responses: { create } } as never,
    });
    await expect(gateway.execute({ task, blocks, candidates })).rejects.toThrow(
      'phase9_provider_usage_exceeds_call_plan',
    );
  });
});
