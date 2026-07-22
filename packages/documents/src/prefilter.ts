import { normalizeText, type NormalizedBlock } from './normalized';

export const PREFILTER_VERSION = 'requirement-prefilter-v1';

export const REQUIREMENT_TERMS = [
  'shall',
  'must',
  'required',
  'submit',
  'include',
  'provide',
  'complete',
  'sign',
  'acknowledge',
  'deadline',
  'insurance',
  'bond',
  'form',
  'attachment',
  'certification',
  'license',
  'meeting',
  'proposal',
  'pricing',
  'staffing',
  'experience',
  'evaluation',
  'addendum',
] as const;

export type PrefilterClass =
  | 'likely_requirement'
  | 'likely_contextual'
  | 'likely_irrelevant'
  | 'table_requiring_structured_review'
  | 'parser_uncertain'
  | 'addendum_precedence_relevant'
  | 'human_review_recommended';

export function classifyBlock(
  block: Pick<NormalizedBlock, 'type' | 'text' | 'confidence' | 'metadata'>,
): { classification: PrefilterClass; score: number; signals: string[] } {
  if (block.confidence < 0.55)
    return { classification: 'parser_uncertain', score: 1, signals: ['low_parser_confidence'] };
  if (block.type === 'table')
    return {
      classification: 'table_requiring_structured_review',
      score: 1,
      signals: ['structured_table'],
    };
  const text = normalizeText(block.text).toLowerCase();
  const signals = REQUIREMENT_TERMS.filter((term) => text.includes(term));
  const hasDate = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|20\d{2}-\d{2}-\d{2})\b/.test(text);
  const hasNumber = /(?:\$\s?\d|\b\d+(?:\.\d+)?\s?%|\bform\s+[a-z0-9-]+)/i.test(text);
  if (/\b(addendum|amend|replace|supersed|revis)/i.test(text))
    return {
      classification: 'addendum_precedence_relevant',
      score: 1,
      signals: [...signals, 'amendment_language'],
    };
  if (signals.length || hasDate || hasNumber)
    return {
      classification: 'likely_requirement',
      score: Math.min(1, (signals.length + Number(hasDate) + Number(hasNumber)) / 4),
      signals: [
        ...signals,
        ...(hasDate ? ['date_pattern'] : []),
        ...(hasNumber ? ['numeric_pattern'] : []),
      ],
    };
  if (block.type === 'heading' || block.type === 'list_item')
    return { classification: 'likely_contextual', score: 0.5, signals: [block.type] };
  return { classification: 'likely_irrelevant', score: 0, signals: [] };
}
