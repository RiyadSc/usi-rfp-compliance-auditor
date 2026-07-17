import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
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
  const { data: relationships } = finding
    ? await supabase
        .from('requirement_relationships')
        .select('id, target_candidate_id, relationship_type, rationale, human_status')
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

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <Link href={`/w/${workspaceId}/requirements`} className="text-blue-700 hover:underline">
          ← Requirement register
        </Link>
      </nav>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">{candidate.title}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {candidate.category} · {candidate.mandatory_class} · extraction candidate remains{' '}
          {candidate.status}
        </p>
      </div>
      <p className="mb-6 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
        Machine assessment only. Human review: <strong>{latestReview.replaceAll('_', ' ')}</strong>.
        This view does not determine compliance.
      </p>
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5">
          <Panel title="Structured requirement">
            <p>{candidate.obligation}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Field name="Source support" value={finding?.source_support_status ?? 'pending'} />
              <Field name="Precedence" value={finding?.precedence_status ?? 'undetermined'} />
              <Field
                name="Proof requirement"
                value={finding?.proof_requirement ?? 'undetermined'}
              />
              <Field
                name="Finding version"
                value={finding ? String(finding.finding_version) : 'none'}
              />
            </dl>
            {finding ? (
              <p className="mt-4 text-sm text-slate-700">{finding.rationale}</p>
            ) : (
              <p className="mt-4 text-sm text-slate-600">No verification finding yet.</p>
            )}
          </Panel>
          <Panel title="Evidence and conflicts">
            {(evidence ?? []).length ? (
              <ul className="space-y-3">
                {(evidence ?? []).map((item) => (
                  <li key={item.id} className="rounded border border-slate-200 p-3">
                    <div className="flex flex-wrap justify-between gap-2 text-xs">
                      <strong>{item.evidence_role}</strong>
                      <span>
                        {item.match_type} · page {item.page_number} ·{' '}
                        {item.validated ? 'validated quote' : 'not validated'}
                      </span>
                    </div>
                    <blockquote className="mt-2 border-l-2 border-slate-300 pl-3 text-sm">
                      {item.quote_exact}
                    </blockquote>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">No evidence references persisted.</p>
            )}
          </Panel>
          <Panel title="Addendum and duplicate relationships">
            {(relationships ?? []).length ? (
              <ul className="space-y-2 text-sm">
                {relationships!.map((item) => (
                  <li key={item.id} className="rounded border border-slate-200 p-3">
                    <strong>{item.relationship_type}</strong> →{' '}
                    <Link
                      className="text-blue-700 hover:underline"
                      href={`/w/${workspaceId}/requirements/${item.target_candidate_id}`}
                    >
                      related requirement
                    </Link>
                    <p className="text-slate-600">{item.rationale}</p>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-blue-700">
                        Review this relationship
                      </summary>
                      <div className="mt-3">
                        <ReviewControls
                          workspaceId={workspaceId}
                          findingId={finding!.id}
                          relationshipId={item.id}
                        />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">No machine-proposed relationships.</p>
            )}
          </Panel>
          {finding ? (
            <Panel title="Human review controls">
              <ReviewControls workspaceId={workspaceId} findingId={finding.id} />
            </Panel>
          ) : null}
          <Panel title="Review audit">
            {(decisions ?? []).length ? (
              <ol className="space-y-2 text-sm">
                {decisions!.map((decision) => (
                  <li key={decision.id} className="rounded border border-slate-200 p-2">
                    <strong>{decision.decision.replaceAll('_', ' ')}</strong> ·{' '}
                    {new Date(decision.created_at).toLocaleString()}
                    {decision.relationship_id ? (
                      <p className="text-xs text-slate-500">
                        Relationship review: {decision.relationship_id}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap text-slate-700">
                      {decision.note || 'No note'}
                    </p>
                    {Object.keys(decision.corrected_values ?? {}).length ? (
                      <pre className="mt-1 overflow-auto rounded bg-slate-50 p-2 text-xs">
                        {JSON.stringify(decision.corrected_values, null, 2)}
                      </pre>
                    ) : null}
                    {decision.prior_decision_id ? (
                      <p className="text-xs text-slate-500">
                        Revision of decision {decision.prior_decision_id}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-600">Review pending.</p>
            )}
          </Panel>
        </div>
        <div className="space-y-5">
          <Panel
            title={`Original PDF — ${document?.normalized_filename ?? 'source'} page ${pageNumber}`}
          >
            {signedPdfUrl ? (
              <iframe
                title={`Original PDF page ${pageNumber}`}
                src={`${signedPdfUrl}#page=${pageNumber}`}
                className="h-[62vh] w-full rounded border border-slate-200"
              />
            ) : (
              <p className="text-sm text-slate-600">Original preview unavailable.</p>
            )}
            <Link
              href={`/w/${workspaceId}/documents/${documentId}?page=${pageNumber}`}
              className="mt-3 inline-block text-sm text-blue-700 hover:underline"
            >
              Open source page →
            </Link>
          </Panel>
          <Panel title="Extracted text anchor">
            {primaryPage ? (
              <>
                <p className="mb-2 text-xs text-slate-600">
                  Text-level anchor; no pixel-level PDF highlight is claimed. Parser state:{' '}
                  {primaryPage.extraction_status}
                </p>
                <EvidenceHighlight
                  text={primaryPage.text}
                  quote={primaryEvidence?.quote_exact ?? ''}
                />
              </>
            ) : (
              <p className="text-sm text-slate-600">No extracted evidence page available.</p>
            )}
          </Panel>
          <Panel title="Machine provenance">
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
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Provider request IDs, hidden prompts, full context, secrets, and reasoning are
              intentionally not shown.
            </p>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Field({ name, value }: { name: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{name}</dt>
      <dd className="mt-1 break-words font-medium">{value.replaceAll('_', ' ')}</dd>
    </div>
  );
}
