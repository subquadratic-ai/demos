/**
 * Outline of the marketing use case's rulebook: the "Marketing &
 * Communications Policy" of Sublinear Financial, an invented retail-finance
 * company. Nine chapters, 109 leaf sections. Every clause in the generated
 * rulebook is written to state the `rule` below in policy language.
 *
 * Nothing here is real policy text, a real company, or a real regulation.
 */

export interface OutlineLeaf {
  /** "<chapter>.<n>", e.g. "3.4" */
  id: string;
  title: string;
  /** The one requirement the clause must state. Items violate or comply with this. */
  rule: string;
}

export interface OutlineChapter {
  id: string;
  title: string;
  summary: string;
  leaves: OutlineLeaf[];
}

/** A leaf joined with its clause text (see clauses-a.ts); what the generator expands. */
export interface ClausedLeaf extends OutlineLeaf {
  /** 3–5 sentences of policy prose stating the rule. The first sentence doubles as the node summary. */
  clause: string;
}

export interface ClausedChapter extends Omit<OutlineChapter, "leaves"> {
  leaves: ClausedLeaf[];
}

export const RULEBOOK = {
  id: "marketing-policy",
  title: "Marketing & Communications Policy",
  organisation: "Sublinear Financial",
  edition: "Edition 7, effective 1 March 2026",
  targetPages: 380,
} as const;

export const OUTLINE: OutlineChapter[] = [
  {
    id: "1",
    title: "Scope, Definitions and Governance",
    summary: "Who and what the policy covers, key terms, roles, exceptions, record keeping and training.",
    leaves: [
      { id: "1.1", title: "Purpose and scope", rule: "The policy applies to every communication the Company or its agents publish to customers, prospects or the public, in any channel." },
      { id: "1.2", title: "Definitions", rule: "'Marketing communication', 'financial promotion', 'approver' and 'material change' have the meanings set out here and are used consistently throughout." },
      { id: "1.3", title: "The Marketing Compliance Officer", rule: "The Marketing Compliance Officer approves every financial promotion before publication and may withdraw any approval." },
      { id: "1.4", title: "Policy ownership and annual review", rule: "The policy is owned by the Head of Compliance and reviewed in full at least once every twelve months." },
      { id: "1.5", title: "Exceptions and waivers", rule: "Any departure from this policy requires a written waiver from the Marketing Compliance Officer, limited to ninety days and recorded in the waiver log." },
      { id: "1.6", title: "Record retention", rule: "The approved final copy and its approval record are retained for seven years from the date the communication was last used." },
      { id: "1.7", title: "Training requirements", rule: "Nobody may publish or approve a marketing communication until they have completed the annual marketing-compliance training." },
      { id: "1.8", title: "Reporting a breach", rule: "A suspected breach of this policy is reported to Compliance within two business days of discovery." },
      { id: "1.9", title: "Conflicts with local requirements", rule: "Where a local rule is stricter than this policy, the stricter rule applies." },
      { id: "1.10", title: "Internal communications", rule: "Communications intended only for employees are out of scope unless they are, or are likely to be, forwarded outside the Company." },
    ],
  },
  {
    id: "2",
    title: "Approval and Review Workflow",
    summary: "What needs pre-approval, how to submit, turnaround, expiry, material changes, templates and withdrawal.",
    leaves: [
      { id: "2.1", title: "What requires pre-approval", rule: "Every financial promotion, in any channel, is approved by Compliance before it is published." },
      { id: "2.2", title: "Submitting for review", rule: "A review request includes the final copy, the channel, the intended audience and the planned live dates." },
      { id: "2.3", title: "Review turnaround", rule: "Standard reviews are returned within three business days; urgent reviews within one, and urgency must be justified." },
      { id: "2.4", title: "Approval expiry", rule: "An approval expires twelve months after it is granted; the communication must be re-approved before further use." },
      { id: "2.5", title: "Material changes", rule: "Changing any number, rate, fee, claim, disclaimer or audience is a material change and requires fresh approval." },
      { id: "2.6", title: "Templates and pre-approved copy blocks", rule: "Pre-approved copy blocks may be reused without new approval only when reproduced word for word." },
      { id: "2.7", title: "Emergency corrections", rule: "Live content may be withdrawn immediately without approval; Compliance is notified the same day." },
      { id: "2.8", title: "Approval evidence on live assets", rule: "Every published asset carries its approval reference (format MC-YYYY-NNNN) in its metadata or footer." },
      { id: "2.9", title: "Localisation and translation", rule: "A translated or localised version is a new communication and needs its own approval." },
      { id: "2.10", title: "Post-publication monitoring", rule: "Compliance spot-checks at least ten percent of live communications every month." },
      { id: "2.11", title: "Withdrawal of approval", rule: "When Compliance withdraws an approval, the communication is removed from every channel within one business day." },
    ],
  },
  {
    id: "3",
    title: "Claims, Performance and Comparative Advertising",
    summary: "Standards for factual claims: substantiation, guarantees, rates, past performance, projections, comparisons, superlatives, safety, regulatory status, tax and urgency.",
    leaves: [
      { id: "3.1", title: "Fair, clear and not misleading", rule: "Every communication is fair, clear and not misleading, judged by the overall impression it gives a typical recipient." },
      { id: "3.2", title: "Substantiation of claims", rule: "Every factual claim is supported by evidence held on file before the communication is published." },
      { id: "3.3", title: "Guarantees and certainty language", rule: "Words such as 'guaranteed', 'risk-free', 'can't lose' or 'certain' are prohibited for any product whose return, rate or value can vary." },
      { id: "3.4", title: "Yield and interest-rate claims", rule: "Any quoted rate states whether it is fixed or variable, the date it applies from and the conditions attached; a variable rate is never presented as fixed." },
      { id: "3.5", title: "Past performance", rule: "Any reference to past returns carries the approved past-performance disclaimer and covers at least five complete years or the life of the product." },
      { id: "3.6", title: "Projections and forecasts", rule: "A projected or hypothetical figure is labelled 'illustrative', states its assumptions and is never the headline of the communication." },
      { id: "3.7", title: "Comparative claims", rule: "A comparison with a competitor names the basis and date of the comparison, compares like with like and does not disparage." },
      { id: "3.8", title: "Superlatives", rule: "'Best', 'number one', 'lowest' and similar superlatives require independent third-party substantiation less than twelve months old." },
      { id: "3.9", title: "Safety and security claims", rule: "'Bank-level security', '100% secure', 'unhackable' and similar absolute safety claims are prohibited; specific controls may be described factually." },
      { id: "3.10", title: "Regulatory status and protection claims", rule: "A communication never implies that a product is government-insured, regulated or endorsed when it is not; any use of 'insured' or 'protected' states the exact scope." },
      { id: "3.11", title: "Tax claims", rule: "'Tax-free' is used only where it is true for every eligible customer; otherwise 'may be tax-advantaged' with the approved disclaimer." },
      { id: "3.12", title: "Urgency and scarcity", rule: "Deadlines, countdowns and 'limited availability' claims are used only when they are true and the evidence is on file." },
      { id: "3.13", title: "Statistics and survey data", rule: "A statistic names its source, sample size and date." },
      { id: "3.14", title: "Awards and ratings", rule: "An award or rating names the awarding body and the year, and discloses when participation was paid." },
    ],
  },
  {
    id: "4",
    title: "Fees, Pricing and Promotional Offers",
    summary: "How fees, prices, introductory rates, APR, cashback, referrals, bonuses, price comparisons and promotional terms are presented.",
    leaves: [
      { id: "4.1", title: "Fee transparency", rule: "Wherever a price or rate is shown, every mandatory fee is disclosed in the same view." },
      { id: "4.2", title: "'Free' and 'no fees' claims", rule: "'Free' or 'no fees' is used only where no fee of any kind can ever apply; 'no fees ever' is prohibited for any product with a conditional fee." },
      { id: "4.3", title: "Introductory and promotional rates", rule: "An introductory rate states its duration, the rate that applies afterwards and the eligibility conditions in the same view." },
      { id: "4.4", title: "APR and cost of credit", rule: "A credit promotion that states any rate or monthly amount shows the representative APR with equal prominence." },
      { id: "4.5", title: "Cashback and rewards", rule: "A cashback or rewards offer states the cap, the eligibility conditions and when the reward is paid." },
      { id: "4.6", title: "Referral programmes", rule: "A referral offer states the reward, the conditions and the limit per person, and never rewards referring someone for whom the product is unsuitable." },
      { id: "4.7", title: "Sign-up bonuses", rule: "A sign-up bonus shows its minimum deposit or activity condition adjacent to the bonus amount." },
      { id: "4.8", title: "Comparisons with the Company's own prior prices", rule: "A 'was' price must have been charged for at least thirty days in the previous ninety." },
      { id: "4.9", title: "Foreign-exchange and conversion fees", rule: "A 'zero FX fee' or similar claim discloses any spread or markup applied to the exchange rate." },
      { id: "4.10", title: "Fee changes", rule: "Customers receive thirty days' notice of a fee change, and marketing stops quoting the old fee once notice is sent." },
      { id: "4.11", title: "Promotional terms and conditions", rule: "Every promotion links to or prints its full terms, including eligibility, dates and how to claim." },
      { id: "4.12", title: "Pricing errors", rule: "A pricing error is corrected in every channel within one business day of discovery and Legal decides whether it is honoured." },
    ],
  },
  {
    id: "5",
    title: "Disclosures, Disclaimers and Risk Language",
    summary: "Required risk warnings and disclaimers, their wording, prominence, placement and channel-specific minimums.",
    leaves: [
      { id: "5.1", title: "Standard risk warning", rule: "Any communication about an investment product carries 'Capital at risk' (or an approved equivalent) in the same view as any benefit claim." },
      { id: "5.2", title: "Prominence", rule: "A disclaimer is no more than two type sizes smaller than the body copy and is never hidden behind a click, hover or scroll." },
      { id: "5.3", title: "Placement", rule: "A disclaimer appears on the same screen or within the same creative as the claim it qualifies." },
      { id: "5.4", title: "Approved disclaimer library", rule: "Only disclaimer wording from the approved library (referenced by its library id) is used." },
      { id: "5.5", title: "Credit product warnings", rule: "A credit promotion carries the approved affordability warning." },
      { id: "5.6", title: "Crypto-asset disclaimers", rule: "A communication about crypto-assets states that they are not protected by any compensation scheme and may lose all their value." },
      { id: "5.7", title: "Short-form and character-limited channels", rule: "An SMS or social post that makes a benefit claim includes at least the short risk flag and a link to the full disclosure in the same message." },
      { id: "5.8", title: "Audio and video", rule: "A spoken or on-screen disclaimer is held for at least three seconds and for a duration proportionate to the claim." },
      { id: "5.9", title: "Illustrative and hypothetical labels", rule: "Any hypothetical figure carries 'For illustration only. Not a forecast.'" },
      { id: "5.10", title: "Testimonial disclaimers", rule: "A testimonial carries 'Individual results vary' and discloses any compensation the author received." },
      { id: "5.11", title: "Third-party content", rule: "Republished third-party content states that the views are the author's own." },
      { id: "5.12", title: "Accessibility of disclosures", rule: "Every disclosure is in plain language and available in text form." },
    ],
  },
  {
    id: "6",
    title: "Email, SMS and Outbound Communications",
    summary: "Consent, unsubscribe, sender identity, subject lines, transactional messages, frequency, quiet hours, data use, suppression and account-status language.",
    leaves: [
      { id: "6.1", title: "Consent basis", rule: "Marketing email or SMS is sent only to recipients with recorded opt-in consent or an existing-customer soft opt-in for similar products." },
      { id: "6.2", title: "Unsubscribe mechanism", rule: "Every marketing email contains a working one-click unsubscribe link, honoured within five business days." },
      { id: "6.3", title: "Sender identification", rule: "Every message shows the true sender name, a postal address and a monitored reply-to address." },
      { id: "6.4", title: "Subject lines", rule: "A subject line is not misleading about the content and never uses fake 'Re:' or 'Fwd:' prefixes or false urgency." },
      { id: "6.5", title: "Transactional versus marketing messages", rule: "A transactional message (statements, security alerts, confirmations) carries no promotional content beyond a single footer line." },
      { id: "6.6", title: "Frequency caps", rule: "A recipient receives no more than three marketing emails and one marketing SMS per week across all campaigns." },
      { id: "6.7", title: "Quiet hours for SMS", rule: "No marketing SMS is sent between 21:00 and 08:00 in the recipient's local time." },
      { id: "6.8", title: "Personalisation and data use", rule: "Targeting uses only data the recipient consented to and never uses sensitive attributes such as health or financial distress." },
      { id: "6.9", title: "Suppression lists", rule: "Opted-out recipients are added to the global suppression list and not marketed to for twenty-four months." },
      { id: "6.10", title: "Account-status language", rule: "A marketing message never states or implies that the recipient's account is at risk, suspended or requires action in order to drive engagement." },
      { id: "6.11", title: "Pre-approved email templates", rule: "Marketing emails use a pre-approved template with the standard footer and legal block." },
      { id: "6.12", title: "Cold outreach to businesses", rule: "Business-to-business outreach identifies the sender and the Company, offers an opt-out and never implies a prior relationship." },
      { id: "6.13", title: "Links and tracking", rule: "Links resolve to Company-controlled domains and tracking is disclosed in the privacy notice." },
    ],
  },
  {
    id: "7",
    title: "Social Media, Influencers and Endorsements",
    summary: "Official accounts, employee accounts, paid-partnership disclosure, influencer contracts, testimonials, engagement practices, UGC, live content, giveaways and the advice boundary.",
    leaves: [
      { id: "7.1", title: "Official accounts", rule: "Company content is published only from accounts registered with Marketing." },
      { id: "7.2", title: "Employee personal accounts", rule: "An employee may share approved content from a personal account but never makes product claims and always identifies their affiliation." },
      { id: "7.3", title: "Paid-partnership disclosure", rule: "Every paid or gifted post carries '#ad' or the platform's paid-partnership label at the start, in every post of a series." },
      { id: "7.4", title: "Influencer agreements", rule: "An influencer works under a written agreement, submits scripts for pre-approval and makes no performance or return claims." },
      { id: "7.5", title: "Testimonials", rule: "A testimonial is genuine, current, representative of typical outcomes and used with the author's written consent." },
      { id: "7.6", title: "Engagement practices", rule: "Purchased followers, bots, fake reviews and undisclosed incentivised reviews are prohibited." },
      { id: "7.7", title: "Responding to complaints in public", rule: "A public complaint is acknowledged and moved to a private channel; no account detail is discussed publicly." },
      { id: "7.8", title: "User-generated content", rule: "Customer content is reposted only with written permission and after screening for claims." },
      { id: "7.9", title: "Live and unscripted content", rule: "Only trained spokespeople go live, and the risk warning is spoken within the first sixty seconds." },
      { id: "7.10", title: "Giveaways and contests", rule: "A giveaway publishes its rules, eligibility and closing date, requires no purchase where the law so requires, and documents how winners are chosen." },
      { id: "7.11", title: "The advice boundary", rule: "Content never recommends a specific action to an individual ('you should buy', 'move your savings now')." },
      { id: "7.12", title: "Crisis and market events", rule: "Scheduled promotional posts are paused during a declared incident or market event." },
    ],
  },
  {
    id: "8",
    title: "Vendors, Agencies and Third-Party Content",
    summary: "Mandatory contract terms with agencies and vendors: data, retention, IP, use of the Company's name, exclusivity, subcontracting, compensation, confidentiality, liability, audit and termination.",
    leaves: [
      { id: "8.1", title: "Approved vendors", rule: "A marketing vendor or agency is engaged only after onboarding through Procurement." },
      { id: "8.2", title: "Mandatory contract clauses", rule: "Every agency or vendor contract includes compliance with this policy, Company approval rights over content, audit rights, data-protection terms and termination for breach." },
      { id: "8.3", title: "Sharing customer data with vendors", rule: "A vendor receives customer data only under a data-processing agreement and never sells it or uses it for its own purposes." },
      { id: "8.4", title: "Data retention by vendors", rule: "A vendor deletes all Company and customer data within thirty days of the contract ending and certifies the deletion." },
      { id: "8.5", title: "Intellectual property", rule: "All deliverables are assigned to the Company on payment, and the vendor may not reuse them for other clients." },
      { id: "8.6", title: "Vendor use of the Company's name and logo", rule: "A vendor uses the Company's name or logo in its own marketing only with written consent for each use." },
      { id: "8.7", title: "Exclusivity", rule: "No contract grants a vendor exclusivity over a channel or category for longer than twelve months." },
      { id: "8.8", title: "Subcontracting", rule: "A vendor subcontracts only with prior written consent and flows down every term of this policy." },
      { id: "8.9", title: "Compensation structures", rule: "No vendor or agency is paid per funded account or per sale of a retail investment product; compensation is never contingent on account openings without suitability safeguards." },
      { id: "8.10", title: "Confidentiality", rule: "Confidentiality obligations survive for three years after the contract ends." },
      { id: "8.11", title: "Liability and indemnity", rule: "The vendor indemnifies the Company for regulatory fines arising from vendor-created non-compliant content, and liability is capped no lower than twelve months' fees." },
      { id: "8.12", title: "Audit rights", rule: "The Company may audit a vendor's compliance on ten business days' notice." },
      { id: "8.13", title: "Termination", rule: "The Company may terminate immediately for a compliance breach; other breaches carry a thirty-day cure period." },
    ],
  },
  {
    id: "9",
    title: "Payments, Transactions and Promotional Spend Controls",
    summary: "Spending authority, purchase orders, gifts and hospitality, paying individuals, customer incentives, sponsorships, contributions, expenses, card use, goodwill credits, sanctions screening and split transactions.",
    leaves: [
      { id: "9.1", title: "Budget authority", rule: "A marketing payment above $25,000 requires Vice President approval and above $100,000 requires Chief Financial Officer approval." },
      { id: "9.2", title: "Purchase orders", rule: "Vendor spend above $5,000 requires an approved purchase order before the invoice is accepted." },
      { id: "9.3", title: "Gifts and hospitality", rule: "Gifts or hospitality to a customer or prospect are capped at $150 per person per year and are never given to public officials." },
      { id: "9.4", title: "Payments to influencers and individuals", rule: "An individual is paid only through Accounts Payable under a contract; never in cash, gift cards or crypto-assets." },
      { id: "9.5", title: "Customer incentives and reward payouts", rule: "Customer rewards are paid only through the product's reward system; manual payouts are prohibited." },
      { id: "9.6", title: "Sponsorships", rule: "A sponsorship above $10,000 requires Compliance review, and the Company never sponsors gambling, tobacco or political organisations." },
      { id: "9.7", title: "Political and charitable contributions", rule: "No political contribution is made in the Company's name; charitable giving goes through the Foundation process." },
      { id: "9.8", title: "Expense reimbursement", rule: "Expenses are submitted within sixty days with itemised receipts for any amount above $25." },
      { id: "9.9", title: "Media buying and card use", rule: "Paid media is bought only through approved platforms on the corporate card; personal cards are never used." },
      { id: "9.10", title: "Goodwill credits to customers", rule: "A frontline goodwill credit is capped at $50; larger credits require manager approval and are recorded as goodwill." },
      { id: "9.11", title: "Sanctions and prohibited counterparties", rule: "Every vendor and payee is screened against sanctions lists before the first payment." },
      { id: "9.12", title: "Split transactions", rule: "Splitting a payment into smaller amounts to stay under an approval threshold is prohibited." },
    ],
  },
];

export const OUTLINE_LEAF_COUNT = OUTLINE.reduce((n, c) => n + c.leaves.length, 0);
