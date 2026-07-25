import { createHash } from 'node:crypto';
import { FAC115_DOCUMENT_IDS, FAC115_WORKSPACE_ID } from './phase9-fac115-production.mts';

export const FAC115_BID_OPS_BRIDGE_VERSION = 'phase9-fac115-bid-ops-bridge-v1';
export const FAC115_PHASE4_FINGERPRINT =
  'c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b';

export const FAC115_ANALYSIS_RUN_ID = '80000000-0000-4000-8000-000000000020';
export const FAC115_VERIFICATION_RUN_ID = '80000000-0000-4000-8000-000000000021';
export const FAC115_CHECKLIST_RUN_ID = '80000000-0000-4000-8000-000000000022';
export const FAC115_READINESS_ID = '80000000-0000-4000-8000-000000000023';
export const FAC115_PROPOSAL_DOCUMENT_ID = '80000000-0000-4000-8000-000000000024';
export const FAC115_PROPOSAL_PARSE_RUN_ID = '80000000-0000-4000-8000-000000000025';
export const FAC115_PROPOSAL_DRAFT_ID = '80000000-0000-4000-8000-000000000026';
export const FAC115_PROPOSAL_AUDIT_RUN_ID = '80000000-0000-4000-8000-000000000027';
export const FAC115_REPORT_RUN_ID = '80000000-0000-4000-8000-000000000028';
export const FAC115_REPORT_SNAPSHOT_ID = '80000000-0000-4000-8000-000000000029';
export const FAC115_EXPORT_MANIFEST_ID = '80000000-0000-4000-8000-00000000002a';
export const FAC115_EXPORT_ARTIFACT_ID = '80000000-0000-4000-8000-00000000002b';
export const FAC115_PROPOSAL_PAGE_ID = '80000000-0000-4000-8000-00000000002c';
export const FAC115_PRIMARY_DOCUMENT_ID =
  FAC115_DOCUMENT_IDS['FAC115_Request_for_Response_03.29.2022.pdf']!;

export { FAC115_WORKSPACE_ID, FAC115_DOCUMENT_IDS };

export const sha256Text = (value: string) => createHash('sha256').update(value).digest('hex');

/** Deterministic UUIDs from Phase 9 hashes (kind nibble keeps families distinct). */
export function fac115BridgeUuid(
  kind: 'cand' | 'find' | 'evid' | 'item' | 'blk' | 'src' | 'art' | 'claim' | 'pfind' | 'psec',
  hex64: string,
): string {
  const nibble: Record<typeof kind, string> = {
    cand: 'a',
    find: 'b',
    evid: 'c',
    item: 'd',
    blk: 'e',
    src: 'f',
    art: '1',
    claim: '2',
    pfind: '3',
    psec: '4',
  };
  const h = hex64.toLowerCase().replace(/[^0-9a-f]/g, '').padEnd(64, '0');
  return `80000000-0000-4000-${nibble[kind]}${h.slice(0, 3)}-${h.slice(3, 15)}`;
}

export function titleFromAnswerId(answerId: string): string {
  return answerId
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function categoryFromProof(proof: string, answerId: string): string {
  if (/form|attachment|sdp|prompt-pay|price-sheet|price-workbook/i.test(answerId))
    return 'mandatory_form';
  if (/license|insurance|experience|reference/i.test(answerId)) return 'license';
  if (/deadline|conference|duration|due/i.test(answerId)) return 'submission_deadline';
  if (proof === 'requires_company_artifact') return 'attachment';
  return 'other_material_requirement';
}

export type Fac115EvalRow = {
  answerId: string;
  expectedDocument: string;
  expectedPage: number | null;
  expectedSheet: string | null;
  expectedCell: string | null;
  candidateIds: string[];
  findingIds: string[];
  actualSourceStatus: string;
  actualPrecedenceStatus: string;
  actualProofRequirement: string;
  evidenceBlockIds: string[];
};

export function isFormLike(row: Fac115EvalRow): boolean {
  return (
    row.actualProofRequirement === 'requires_company_artifact' ||
    /form|attachment|sdp|prompt-pay|price-sheet|price-workbook|license/i.test(row.answerId)
  );
}
