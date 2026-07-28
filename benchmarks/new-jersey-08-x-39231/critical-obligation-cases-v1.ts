export const NEW_JERSEY_CRITICAL_BENCHMARK_VERSION =
  'new-jersey-08-x-39231-critical-obligations-draft-v1' as const;

export type NewJerseyCriticalBenchmarkCase = {
  id: string;
  category:
    | 'deadline'
    | 'form'
    | 'signature'
    | 'licensing'
    | 'insurance'
    | 'bond'
    | 'pricing'
    | 'staffing'
    | 'submission_instruction'
    | 'addendum'
    | 'disqualifying_condition';
  title: string;
  pageNumber: number;
  exactQuote: string;
  expectedPrecedence: 'active';
  reviewNote: string;
};

/**
 * Authored only from source-pages-v1.json. No Phase 9 finding, candidate, model output, or
 * application result is imported into this benchmark package.
 */
export const NEW_JERSEY_CRITICAL_BENCHMARK_CASES: NewJerseyCriticalBenchmarkCase[] = [
  {
    id: 'nj-critical-question-deadline',
    category: 'deadline',
    title: 'Electronic questions are due February 15, 2008 at 5:00 PM',
    pageNumber: 1,
    exactQuote:
      'Bidder’s Electronic Question Due Date (Refer to RFP Section 1.3.1 for more information.) February 15, 2008 5:00 PM',
    expectedPrecedence: 'active',
    reviewNote: 'Cover-sheet operational deadline.',
  },
  {
    id: 'nj-critical-submission-deadline',
    category: 'deadline',
    title: 'Bid submission is due March 7, 2008 at 2:00 PM',
    pageNumber: 1,
    exactQuote:
      'Bid Submission Due Date (Refer to RFP Section 1.3.2 for more information.) March 7, 2008 2:00 PM',
    expectedPrecedence: 'active',
    reviewNote: 'Cover-sheet operational deadline.',
  },
  {
    id: 'nj-critical-late-bid-rejection',
    category: 'disqualifying_condition',
    title: 'Late bids at the stated location are rejected',
    pageNumber: 5,
    exactQuote:
      'ANY BID PROPOSAL NOT RECEIVED ON TIME AT THE LOCATION INDICATED BELOW WILL BE REJECTED.',
    expectedPrecedence: 'active',
    reviewNote: 'Explicit submission-disqualification language.',
  },
  {
    id: 'nj-critical-delivery-location',
    category: 'submission_instruction',
    title: 'Deliver the proposal to the Purchase Bureau bid receiving room',
    pageNumber: 6,
    exactQuote:
      'BID RECEIVING ROOM - 9TH FLOOR PURCHASE BUREAU DIVISION OF PURCHASE AND PROPERTY DEPARTMENT OF THE TREASURY 33 WEST STATE STREET, P.O. BOX 230 TRENTON, NJ 08625-0230',
    expectedPrecedence: 'active',
    reviewNote: 'Physical delivery location following Section 1.3.2.',
  },
  {
    id: 'nj-critical-addendum-monitoring',
    category: 'addendum',
    title: 'Bidders are responsible for monitoring issued addenda',
    pageNumber: 6,
    exactQuote:
      'It is the sole responsibility of the bidder to be knowledgeable of all addenda related to this procurement.',
    expectedPrecedence: 'active',
    reviewNote: 'Addenda are part of the solicitation and must be monitored.',
  },
  {
    id: 'nj-critical-package-label',
    category: 'submission_instruction',
    title: 'Label the exterior package with the bid ID and final opening date',
    pageNumber: 17,
    exactQuote:
      'THE EXTERIOR OF ALL BID PROPOSAL PACKAGES ARE TO BE LABELED WITH THE BID IDENTIFICATION NUMBER AND THE FINAL BID OPENING DATE OR RISK NOT BEING RECEIVED IN TIME.',
    expectedPrecedence: 'active',
    reviewNote: 'Packaging and identification instruction.',
  },
  {
    id: 'nj-critical-copy-count',
    category: 'submission_instruction',
    title: 'Submit one original, four full copies, and one unbound copy',
    pageNumber: 17,
    exactQuote:
      'The bidder must submit one (1) complete ORIGINAL bid proposal , clearly marked as the “ORIGINAL” bid proposal. The bidder should submit four (4) full, complete and exact copies and one (1) unbound, complete and exact copy of the original.',
    expectedPrecedence: 'active',
    reviewNote: 'Required and requested copy-count instructions remain separately visible.',
  },
  {
    id: 'nj-critical-signatory-page',
    category: 'signature',
    title: 'Submit a signatory page signed by an authorized representative',
    pageNumber: 18,
    exactQuote: 'The Signatory page shall be signed by an authorized representative of the bidder.',
    expectedPrecedence: 'active',
    reviewNote: 'Explicit signature requirement.',
  },
  {
    id: 'nj-critical-signature-rejection',
    category: 'disqualifying_condition',
    title: 'Failure to comply with signatory instructions causes rejection',
    pageNumber: 18,
    exactQuote: 'Failure to comply will result in rejection of the bid proposal.',
    expectedPrecedence: 'active',
    reviewNote: 'Explicit consequence immediately following signatory rules.',
  },
  {
    id: 'nj-critical-ownership-disclosure',
    category: 'form',
    title: 'Complete the Ownership Disclosure Form',
    pageNumber: 18,
    exactQuote: 'the bidder must complete the attached Ownership Disclosure Form.',
    expectedPrecedence: 'active',
    reviewNote: 'Named proposal form.',
  },
  {
    id: 'nj-critical-investigations-form',
    category: 'form',
    title: 'Use the Disclosure of Investigations and Actions form',
    pageNumber: 18,
    exactQuote:
      'The bidder shall use the Disclosure of Investigations and Actions Involving Bidder form',
    expectedPrecedence: 'active',
    reviewNote: 'Named proposal form.',
  },
  {
    id: 'nj-critical-subcontract-intent',
    category: 'form',
    title: 'Every bidder completes the Notice of Intent to Subcontract Form',
    pageNumber: 18,
    exactQuote: 'All bidders shall complete the attached Notice of Intent to Subcontract Form',
    expectedPrecedence: 'active',
    reviewNote: 'Required regardless of intended subcontractor use.',
  },
  {
    id: 'nj-critical-subcontract-utilization',
    category: 'form',
    title: 'Submit the Subcontractor Utilization Form when using a subcontractor',
    pageNumber: 18,
    exactQuote:
      'If the bidder intends to utilize a subcontractor, the Subcontractor Utilization Form http://www.state.nj.us/treasury/purchase/bid/summary/08-x-39231.shtml must be completed and submitted with the bid proposal.',
    expectedPrecedence: 'active',
    reviewNote: 'Conditional named form; condition must remain attached.',
  },
  {
    id: 'nj-critical-business-registration',
    category: 'form',
    title: 'Include the Business Registration Certificate or interim registration',
    pageNumber: 18,
    exactQuote:
      'FAILURE TO SUBMIT A COPY OF THE BIDDER’S BUSINESS REGISTRATION CERTIFICATE (OR INTERIM REGISTRATION) FROM THE DIVISION OF REVENUE WITH THE BID PROPOSAL MAY BE CAUSE FOR REJECTION OF THE BID PROPOSAL.',
    expectedPrecedence: 'active',
    reviewNote: 'Named proof with an explicit rejection risk.',
  },
  {
    id: 'nj-critical-macbride-certification',
    category: 'form',
    title: 'Complete the MacBride Principles Certification',
    pageNumber: 19,
    exactQuote:
      'The bidder is required to complete the attached MacBride Principles Certification evidencing compliance with the MacBride Principles.',
    expectedPrecedence: 'active',
    reviewNote: 'Pre-award form that should accompany the proposal.',
  },
  {
    id: 'nj-critical-affirmative-action-evidence',
    category: 'form',
    title: 'Submit affirmative-action evidence or complete Form AA-302',
    pageNumber: 19,
    exactQuote:
      'If the bidder has neither document of Affirmative Action evidence, then the bidder must complete the attached Affirmative Action Employee Information Report (AA-302).',
    expectedPrecedence: 'active',
    reviewNote: 'Conditional named form.',
  },
  {
    id: 'nj-critical-source-disclosure',
    category: 'form',
    title: 'Submit the completed Services Source Disclosure Form',
    pageNumber: 19,
    exactQuote:
      'the bidder is required to submit with its bid proposal a completed source disclosure form.',
    expectedPrecedence: 'active',
    reviewNote: 'Named proposal form.',
  },
  {
    id: 'nj-critical-technical-response',
    category: 'submission_instruction',
    title: 'Describe the approach and plans for the scope of work',
    pageNumber: 19,
    exactQuote:
      'the bidder shall describe its approach and plans for accomplishing the work outlined in the Scope of Work Section, i.e., Section 3.0.',
    expectedPrecedence: 'active',
    reviewNote: 'Core technical-response instruction.',
  },
  {
    id: 'nj-critical-staffing-data',
    category: 'staffing',
    title: 'Provide employee information for personnel used under the contract',
    pageNumber: 41,
    exactQuote:
      'The bidder shall provide below the information for its employees to be used under this contract.',
    expectedPrecedence: 'active',
    reviewNote: 'Mandatory contractor employee data sheet.',
  },
  {
    id: 'nj-critical-detective-agency-permit',
    category: 'licensing',
    title: 'Provide proof of a valid New Jersey Detective Agency Permit',
    pageNumber: 37,
    exactQuote:
      'New Jersey Detective Agency Permit Number (Proof of a valid permit must be provide with the bid proposal)',
    expectedPrecedence: 'active',
    reviewNote: 'Bid-stage company permit proof.',
  },
  {
    id: 'nj-critical-insurance-certificate',
    category: 'insurance',
    title: 'Submit the certificate of insurance with the bid',
    pageNumber: 16,
    exactQuote: 'The certificate of insurance shall be submitted with the bid proposal',
    expectedPrecedence: 'active',
    reviewNote: 'Bid-stage insurance artifact.',
  },
  {
    id: 'nj-critical-professional-liability',
    category: 'insurance',
    title: 'Carry at least $5 million in professional liability insurance',
    pageNumber: 30,
    exactQuote:
      'The insurance shall be in the amount of not less than $5,000,000 and in such policy forms as shall be approved by the State.',
    expectedPrecedence: 'active',
    reviewNote: 'Material insurance threshold; company proof remains a separate axis.',
  },
  {
    id: 'nj-critical-price-sheet',
    category: 'pricing',
    title: 'Use the State-supplied price sheets and provide all requested pricing',
    pageNumber: 22,
    exactQuote:
      'The bidder must submit its pricing using the format set forth in the State supplied price sheet(s) attached to this RFP. Failure to submit all information required will result in the bid being considered non-responsive.',
    expectedPrecedence: 'active',
    reviewNote: 'Pricing format and explicit nonresponsiveness consequence.',
  },
  {
    id: 'nj-critical-performance-bond',
    category: 'bond',
    title: 'Provide the required performance bond after award',
    pageNumber: 35,
    exactQuote: 'A performance bond is required.',
    expectedPrecedence: 'active',
    reviewNote:
      'Bond amount is referenced to the signatory page; the source package needs reviewer confirmation of that amount.',
  },
  {
    id: 'nj-critical-addendum-incorporation',
    category: 'addendum',
    title: 'Incorporate Addendum 1 changes into the original RFP',
    pageNumber: 43,
    exactQuote:
      'It is the bidder’s responsibility to ensure that all changes are incorporated into the original RFP.',
    expectedPrecedence: 'active',
    reviewNote: 'Explicit Addendum 1 incorporation instruction.',
  },
];
