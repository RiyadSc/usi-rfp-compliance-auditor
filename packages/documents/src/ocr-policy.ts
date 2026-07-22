import { z } from 'zod';

export const OCR_POLICY_VERSION = 'selective-ocr-v1';

export const ocrSignalsSchema = z.object({
  characterCount: z.number().int().nonnegative(),
  printableCharacterRatio: z.number().min(0).max(1),
  replacementCharacterRatio: z.number().min(0).max(1),
  plausibleWordRatio: z.number().min(0).max(1),
  readingOrderScore: z.number().min(0).max(1),
  imageCoverageRatio: z.number().min(0).max(1),
  parserWarningCount: z.number().int().nonnegative(),
  parserFailed: z.boolean(),
});
export type OcrSignals = z.infer<typeof ocrSignalsSchema>;
export type OcrSelection =
  'native_text_sufficient' | 'hybrid' | 'ocr_recommended' | 'ocr_required' | 'parser_failed';

export type OcrBlock = {
  text: string;
  boundingBox: { x: number; y: number; width: number; height: number; unit: 'px' };
  confidence: number;
};
export type OcrResult = {
  engineId: string;
  engineVersion: string;
  inputHash: string;
  blocks: OcrBlock[];
  meanConfidence: number;
};
export interface OcrAdapter {
  readonly engineId: string;
  readonly engineVersion: string;
  recognize(input: { bytes: Uint8Array; inputHash: string }): Promise<OcrResult>;
}

/** Deterministic fixture-only OCR. Production remains fail-closed until an approved engine is configured. */
export class MockOcrAdapter implements OcrAdapter {
  readonly engineId = 'mock-ocr';
  readonly engineVersion = 'mock-ocr-v1';
  constructor(
    private readonly fixtures: Readonly<Record<string, { text: string; confidence: number }>>,
  ) {}
  async recognize(input: { bytes: Uint8Array; inputHash: string }): Promise<OcrResult> {
    const fixture = this.fixtures[input.inputHash];
    if (!fixture) throw new Error('mock_ocr_fixture_missing');
    return {
      engineId: this.engineId,
      engineVersion: this.engineVersion,
      inputHash: input.inputHash,
      blocks: [
        {
          text: fixture.text,
          boundingBox: { x: 0, y: 0, width: 1000, height: 1000, unit: 'px' },
          confidence: fixture.confidence,
        },
      ],
      meanConfidence: fixture.confidence,
    };
  }
}

export function selectOcr(signals: OcrSignals): {
  classification: OcrSelection;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (signals.parserFailed)
    return { classification: 'parser_failed', reasons: ['native_parser_failed'] };
  if (signals.characterCount < 20 && signals.imageCoverageRatio >= 0.5)
    return { classification: 'ocr_required', reasons: ['image_dominant_without_text'] };
  if (signals.replacementCharacterRatio > 0.08 || signals.printableCharacterRatio < 0.75)
    reasons.push('poor_character_quality');
  if (signals.readingOrderScore < 0.45 || signals.plausibleWordRatio < 0.45)
    reasons.push('poor_text_structure');
  if (reasons.length && signals.imageCoverageRatio >= 0.2)
    return { classification: 'ocr_recommended', reasons };
  if (signals.imageCoverageRatio >= 0.25 && signals.characterCount >= 20)
    return { classification: 'hybrid', reasons: ['native_text_with_material_images'] };
  return { classification: 'native_text_sufficient', reasons: ['native_text_quality_sufficient'] };
}
