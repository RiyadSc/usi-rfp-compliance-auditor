import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { StatusAxis, StatusBadge } from '@/components/status-badge';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { IconAlert, IconArrowLeft } from '@/components/icons';
import { businessLabel } from '@/lib/presentation';
import { EvidenceHighlight } from '../evidence-highlight';
import { ReviewControls } from '../review-controls';

const uuid = z.string().uuid();

export default async function RequirementDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; requirementId: string }>;
}) {
  const { workspaceId, requirementId } = await params;
  if (!uuid.safeParse(workspaceId).success || !uuid.safeParse(requirementId).success) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) notFound();
  const { data: candidate } = await supabase
    .from('requirement_candidates')
    .select(
      'id, analysis_run_id, document_id, category, title, obligation, mandatory_class, preliminary_page, evidence_quote, confidence, ambiguity_notes, status, prompt_version, schema_version, model_id, created_at',
    )
    .eq('id', requirementId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!candidate) notFound();
  const { data: finding } = await supabase
    .from('verification_findings')
    .select('*')
    .eq('candidate_id', candidate.id)
    .eq('workspace_id', workspaceId)
    .order('finding_version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: evidence } = finding
    ? await supabase
        .from('verification_evidence')
        .select('*')
        .eq('finding_id', finding.id)
        .eq('workspace_id', workspaceId)
        .order('evidence_role')
    : { data: [] };
  const { data: passResults } = await supabase
    .from('verification_pass_results')
    .select(
      'id, verification_run_id, pass_type, status, prompt_version, schema_version, model_id, result, error_category, error_detail, created_at',
    )
    .eq('candidate_id', candidate.id)
    .eq('workspace_id', workspaceId)
    .is('target_candidate_id', null)
    .order('created_at', { ascending: false });
  const { data: relationships } = finding
    ? await supabase
        .from('requirement_relationships')
        .select(
          'id, target_candidate_id, relationship_type, rationale, human_status, original_document_id, original_page_number, addendum_document_id, addendum_page_number, precedence_quote, deterministic_metadata, relationship_version, machine_assessment',
        )
        .eq('finding_id', finding.id)
        .eq('workspace_id', workspaceId)
    : { data: [] };
  const { data: decisions } = finding
    ? await supabase
        .from('human_review_decisions')
        .select(
          'id, relationship_id, reviewer_id, decision, note, corrected_values, prior_decision_id, created_at',
        )
        .eq('finding_id', finding.id)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
    : { data: [] };
  const evidencePages = new Map<
    string,
    { id: string; text: string; extraction_status: string; warnings: unknown }
  >();
  for (const item of evidence ?? []) {
    const { data: page } = await supabase
      .from('document_pages')
      .select('id, text, extraction_status, warnings')
      .eq('id', item.document_page_id)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (page) evidencePages.set(item.id, page);
  }
  const primaryEvidence =
    (evidence ?? []).find((item) => item.evidence_role === 'supporting' && item.validated) ??
    evidence?.[0];
  const documentId = primaryEvidence?.document_id ?? candidate.document_id;
  const pageNumber = primaryEvidence?.page_number ?? candidate.preliminary_page;
  const { data: document } = await supabase
    .from('documents')
    .select('id, normalized_filename, object_key, document_type')
    .eq('id', documentId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  let signedPdfUrl: string | null = null;
  if (document) {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.storage
      .from('workspace-documents')
      .createSignedUrl(document.object_key, 120);
    signedPdfUrl = data?.signedUrl ?? null;
  }
  const primaryPage = primaryEvidence ? evidencePages.get(primaryEvidence.id) : null;
  const findingDecisions = (decisions ?? []).filter((decision) => !decision.relationship_id);
  const latestReview = findingDecisions[0]?.decision ?? 'pending';
  const latestPasses = new Map<string, NonNullable<typeof passResults>[number]>();
  for (const pass of passResults ?? [])
    if (!latestPasses.has(pass.pass_type)) latestPasses.set(pass.pass_type, pass);
  const entailmentPass = latestPasses.get('entailment');
  const challengePass = latestPasses.get('challenge');

  return (
    <main className="page-shell">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="requirements"
        compact
      />
      <div className="mb-6">
        <Link
          href={`/w/${workspaceId}/requirements`}
          className="action-link inline-flex items-center gap-1.5 text-sm"
        >
          <IconArrowLeft size={14} />
          Requirement list
        </Link>
        <p className="page-eyebrow mt-5">RFP requirement</p>
        <h1 className="page-title mt-2 max-w-4xl">{candidate.title}</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusBadge value={candidate.mandatory_class} />
          <StatusBadge
            value={candidate.category}
            label={businessLabel(candidate.category)}
            tone="neutral"
          />
          <StatusBadge value={latestReview} />
        </div>
      </div>
      <p className="notice notice-warning mb-6">
        <strong className="notice-title">
          <IconAlert size={15} />
          Team review status: {businessLabel(latestReview)}.
        </strong>
        <span className="mt-2 block text-sm text-ink-soft">
          Source evidence, company proof, workflow completion, and human review remain separate. A
          team decision here does not authorize submission.
        </span>
      </p>
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5">
          <Panel title="What the RFP requires">
            <p className="text-base leading-relaxed text-ink">{candidate.obligation}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <StatusAxis
                label="Backed by the RFP?"
                value={finding?.source_support_status ?? 'pending'}
                help="Whether source evidence supports the complete material requirement."
              />
              <StatusAxis
                label="Is this still current?"
                value={finding?.precedence_status ?? 'undetermined'}
                help="Whether addenda leave this requirement active, superseded, conflicting, or unclear."
              />
              <StatusAxis
                label="What evidence must we provide?"
                value={finding?.proof_requirement ?? 'undetermined'}
                help="Company or external proof needed later; this is separate from source support."
              />
              <StatusAxis
                label="Has our team reviewed it?"
                value={latestReview}
                help="The latest authorized human decision on the machine assessment."
              />
            </div>
            {finding ? (
              <div className="surface-inset mt-5 p-4 text-sm text-ink-soft">
                <strong className="font-semibold text-ink">Why:</strong> {finding.rationale}
              </div>
            ) : (
              <p className="mt-5 text-sm text-ink-muted">No verification finding yet.</p>
            )}
          </Panel>
          <Panel title="Exact RFP evidence">
            {(evidence ?? []).length ? (
              <ul className="space-y-4">
                {(evidence ?? []).map((item) => (
                  <li key={item.id} className="evidence-card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-micro text-teal-300">
                        {businessLabel(item.evidence_role)}
                      </strong>
                      <span className="locator">
                        {item.match_type} · page {item.page_number} ·{' '}
                        {item.validated ? 'validated quote' : 'not validated'}
                      </span>
                    </div>
                    <blockquote className="evidence-quote mt-3">{item.quote_exact}</blockquote>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">No evidence references persisted.</p>
            )}
          </Panel>
          <Panel title="Technical verification details" className="analyst-only">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field
                name="Pass A — entailment"
                value={
                  entailmentPass
                    ? `${entailmentPass.status}: ${String(entailmentPass.result?.classification ?? 'no result')}`
                    : 'pending'
                }
              />
              <Field
                name="Pass B — challenge"
                value={
                  challengePass
                    ? `${challengePass.status}: ${String(challengePass.result?.assessment ?? 'no result')}`
                    : entailmentPass?.result?.classification === 'entails'
                      ? 'pending'
                      : 'not required'
                }
              />
              <Field name="Decision engine" value={finding?.decision_engine_version ?? 'pending'} />
              <Field name="Challenge state" value={finding?.challenge_status ?? 'pending'} />
            </dl>
            {finding?.deterministic_model_disagreement?.length ? (
              <div className="notice notice-warning mt-4">
                <strong className="notice-title">
                  <IconAlert size={15} />
                  Deterministic/model disagreement
                </strong>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {finding.deterministic_model_disagreement.map((item: string) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {challengePass?.status === 'failed' ? (
              <p className="mt-4 text-sm text-critical-400">
                Challenge failed; this candidate cannot be source-supported.
              </p>
            ) : null}
          </Panel>
          <Panel title="Addendum and relationship timeline">
            {(relationships ?? []).length ? (
              <ol className="space-y-3 text-sm">
                {relationships!.map((item, index) => (
                  <li key={item.id} className="surface-panel rail-steel p-4">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-micro">CHANGE {index + 1}</span>
                      <strong className="font-semibold text-ink">
                        {businessLabel(item.relationship_type)}
                      </strong>
                      <span aria-hidden="true" className="text-ink-faint">
                        →
                      </span>
                      <Link
                        className="action-link"
                        href={`/w/${workspaceId}/requirements/${item.target_candidate_id}`}
                      >
                        related requirement
                      </Link>
                    </div>
                    <p className="mt-2 text-ink-soft">{item.rationale}</p>
                    {item.precedence_quote ? (
                      <blockquote className="evidence-quote mt-3 text-xs">
                        {item.precedence_quote}
                      </blockquote>
                    ) : null}
                    <details className="disclosure mt-4">
                      <summary>Review this relationship</summary>
                      <div className="disclosure-body">
                        <ReviewControls
                          workspaceId={workspaceId}
                          findingId={finding!.id}
                          relationshipId={item.id}
                        />
                      </div>
                    </details>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-muted">No machine-proposed relationships.</p>
            )}
          </Panel>
          {finding ? (
            <Panel title="Record a team decision">
              <ReviewControls workspaceId={workspaceId} findingId={finding.id} />
            </Panel>
          ) : null}
          <Panel title="Decision history">
            {(decisions ?? []).length ? (
              <ol className="space-y-3 text-sm">
                {decisions!.map((decision) => (
                  <li key={decision.id} className="surface-panel p-4">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <strong className="font-semibold text-ink">
                        {decision.decision.replaceAll('_', ' ')}
                      </strong>
                      <span aria-hidden="true" className="text-ink-faint">
                        ·
                      </span>
                      <span className="text-metadata tabular">
                        {new Date(decision.created_at).toLocaleString()}
                      </span>
                    </div>
                    {decision.relationship_id ? (
                      <p className="text-metadata mono mt-1">
                        Relationship review: {decision.relationship_id}
                      </p>
                    ) : null}
                    <p className="mt-2 whitespace-pre-wrap text-ink-soft">
                      {decision.note || 'No note'}
                    </p>
                    {Object.keys(decision.corrected_values ?? {}).length ? (
                      <pre className="surface-inset mono mt-3 overflow-auto p-3 text-xs text-ink-soft">
                        {JSON.stringify(decision.corrected_values, null, 2)}
                      </pre>
                    ) : null}
                    {decision.prior_decision_id ? (
                      <p className="text-metadata mono mt-2">
                        Revision of decision {decision.prior_decision_id}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-muted">Review pending.</p>
            )}
          </Panel>
        </div>
        <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Panel
            title={`Original PDF — ${document?.normalized_filename ?? 'source'} page ${pageNumber}`}
          >
            {signedPdfUrl ? (
              <div className="surface-inset overflow-hidden p-2">
                <iframe
                  title={`Original PDF page ${pageNumber}`}
                  src={`${signedPdfUrl}#page=${pageNumber}`}
                  className="paper-surface h-[62vh] w-full border-0"
                />
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Original preview unavailable.</p>
            )}
            <Link
              href={`/w/${workspaceId}/documents/${documentId}?page=${pageNumber}`}
              className="action-link mt-4 inline-flex items-center gap-1.5 text-sm"
            >
              Open source page →
            </Link>
          </Panel>
          <Panel title="Extracted text anchor">
            {primaryPage ? (
              <>
                <p className="text-metadata mb-3">
                  Text-level anchor; no pixel-level PDF highlight is claimed. Parser state:{' '}
                  {primaryPage.extraction_status}
                </p>
                <EvidenceHighlight
                  text={primaryPage.text}
                  quote={primaryEvidence?.quote_exact ?? ''}
                />
              </>
            ) : (
              <p className="text-sm text-ink-muted">No extracted evidence page available.</p>
            )}
          </Panel>
          <Panel title="Technical provenance" className="analyst-only">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field name="Extraction model" value={candidate.model_id} />
              <Field name="Verification model" value={finding?.model_id ?? 'none'} />
              <Field
                name="Extraction prompt/schema"
                value={`${candidate.prompt_version} / ${candidate.schema_version}`}
              />
              <Field
                name="Verification prompt/schema"
                value={finding ? `${finding.prompt_version} / ${finding.schema_version}` : 'none'}
              />
              <Field
                name="Pass A prompt/schema"
                value={
                  entailmentPass
                    ? `${entailmentPass.prompt_version} / ${entailmentPass.schema_version}`
                    : 'none'
                }
              />
              <Field
                name="Pass B prompt/schema"
                value={
                  challengePass
                    ? `${challengePass.prompt_version} / ${challengePass.schema_version}`
                    : 'none'
                }
              />
            </dl>
            <p className="text-metadata mt-4">
              Provider request IDs, hidden prompts, full context, secrets, and reasoning are
              intentionally not shown.
            </p>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Panel({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface-card p-5 ${className}`}>
      <h2 className="section-title mb-4">{title}</h2>
      {children}
    </section>
  );
}
function Field({ name, value }: { name: string; value: string }) {
  return (
    <div>
      <dt className="text-micro">{name}</dt>
      <dd className="mono mt-1.5 break-words text-[0.8125rem] text-ink">{businessLabel(value)}</dd>
    </div>
  );
}
