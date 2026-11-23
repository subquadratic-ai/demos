/**
 * Hand-written clause text for every leaf of the outline (outline.ts).
 *
 * Each clause states the leaf's `rule` in policy language. The first sentence
 * is written to stand alone as a one-line criterion (it becomes the node
 * summary used while descending the tree); the remaining sentences give scope,
 * a definition or an exception. This text is shown beside every verdict.
 *
 * Sublinear Financial and its products (Sublinear Save, Sublinear Invest, Sublinear Card,
 * Sublinear FX) are invented. Nothing here is real policy or regulation.
 */

export const CLAUSES: Record<string, string> = {
  // Chapter 1 — Scope, Definitions and Governance
  "1.1":
    "This policy applies to every communication that Sublinear Financial, or anyone acting on its behalf, publishes to customers, prospects or the public, in any channel. It covers advertisements, websites, app screens, emails, text messages, social media posts, press material, sales scripts and sponsored content, whether created in-house or by an agency. A communication is in scope from the moment it is drafted for an external audience, not only once it is published. Where this policy and a product-specific procedure overlap, this policy sets the minimum standard.",
  "1.2":
    "The terms 'marketing communication', 'financial promotion', 'approver' and 'material change' have the meanings given in this section and are used in that sense throughout the policy. A marketing communication is any message intended to promote the Company, a product or a service to an external audience. A financial promotion is a marketing communication that invites or induces a recipient to open, fund, use or retain a financial product. An approver is a member of Compliance authorised to sign off a financial promotion, and a material change is any alteration of the kind listed in section 2.5.",
  "1.3":
    "The Marketing Compliance Officer approves every financial promotion before it is published and may withdraw any approval at any time. The Officer is appointed by the Head of Compliance, reports independently of the marketing function and may delegate day-to-day review to named deputies. Withdrawal of an approval takes effect when it is communicated to the content owner in writing. No commercial sponsor, campaign deadline or revenue target overrides the Officer's decision.",
  "1.4":
    "This policy is owned by the Head of Compliance and is reviewed in full at least once every twelve months. The review considers regulatory developments, complaints, monitoring findings and breaches logged since the previous edition. Interim amendments may be issued between full reviews and are numbered and dated. Each edition supersedes the previous one from its stated effective date.",
  "1.5":
    "Any departure from this policy requires a written waiver from the Marketing Compliance Officer, is limited to ninety days and is recorded in the waiver log. A waiver names the clause waived, the communication it applies to, the compensating controls and the expiry date. Waivers are never granted retrospectively and cannot be renewed more than once without the approval of the Head of Compliance. Verbal or email assurances that fall short of a logged waiver do not count as an exception.",
  "1.6":
    "The approved final copy of every communication and its approval record are retained for seven years from the date the communication was last used. The record includes the approval reference, the approver's name, the review comments, the substantiation file and the live dates by channel. Records are kept in the marketing compliance repository, not in personal drives or agency systems. Deletion before the retention period ends requires written agreement from Legal.",
  "1.7":
    "Nobody may publish or approve a marketing communication until they have completed the annual marketing-compliance training. The requirement applies to employees, contractors and agency staff with publishing or approval rights in any Company system. Access is suspended automatically when a certificate lapses and restored when the course is completed. Managers confirm completion for their teams during the annual attestation.",
  "1.8":
    "A suspected breach of this policy is reported to Compliance within two business days of discovery. The report identifies the communication, the channel, the dates it was live and the clause believed to have been breached. Compliance decides whether the content is withdrawn, corrected or allowed to continue while the matter is assessed. Nobody is penalised for reporting a suspected breach in good faith, including one they caused.",
  "1.9":
    "Where a local rule is stricter than this policy, the stricter rule applies. Country marketing leads maintain a register of local requirements that go beyond the Company standard and share it with Compliance each quarter. Where a local rule appears to conflict with this policy in a way that cannot be resolved by applying the stricter standard, the matter is escalated to Legal before publication. This policy is never read as permitting what local law prohibits.",
  "1.10":
    "Communications intended only for employees are outside the scope of this policy unless they are, or are likely to be, forwarded outside the Company. Internal product briefings, sales enablement decks and incentive announcements are therefore reviewed by their business owners rather than by Compliance. Material that staff are expected to read aloud to customers or paste into customer channels is treated as external. If an internal document is published externally in error, the breach reporting rule in section 1.8 applies.",

  // Chapter 2 — Approval and Review Workflow
  "2.1":
    "Every financial promotion, in any channel, is approved by Compliance before it is published. This includes paid advertisements, organic social posts, website and app copy, emails, text messages, scripts, press releases and content produced by agencies or influencers on the Company's behalf. 'Published' means visible to any person outside the Company, including a test audience or a closed beta group. Content that is not a financial promotion, such as a job advertisement, follows the lighter brand review process instead.",
  "2.2":
    "A review request includes the final copy, the channel, the intended audience and the planned live dates. Requests are submitted through the review system, never by direct message, and attach the substantiation for each factual claim. Draft or placeholder copy is returned unreviewed. The requester names a single content owner who is accountable for implementing review comments.",
  "2.3":
    "Standard reviews are returned within three business days and urgent reviews within one business day, and the requester must justify why a review is urgent. Urgency means a regulatory deadline, a correction to live content or a market event, not a missed internal deadline. Compliance may decline the urgent lane and process the request as standard. Turnaround is measured from the time a complete request is received.",
  "2.4":
    "An approval expires twelve months after the date it is granted, and the communication must be re-approved before any further use. The expiry date is recorded against the approval reference and surfaced in the review system thirty days in advance. Re-approval is a full review, not a formality, because rates, products and disclaimer wording change. Content that is still live when its approval expires is withdrawn until re-approved.",
  "2.5":
    "Changing any number, rate, fee, claim, disclaimer or audience in an approved communication is a material change and requires fresh approval. Corrections of spelling, layout adjustments that do not alter prominence, and swapping one pre-approved image for another are not material. Where the requester is unsure, the change is treated as material. A material change made without re-approval is a breach even when the new content would have been approved.",
  "2.6":
    "Pre-approved copy blocks may be reused without a new approval only when they are reproduced word for word. The library of pre-approved blocks is maintained by Compliance and each block carries its own approval reference and expiry date. Combining blocks into a new communication still requires approval of the combination. Any edit to a block, however small, removes its pre-approved status.",
  "2.7":
    "Live content may be withdrawn immediately without approval, and Compliance is notified the same day. Anyone with publishing rights may take content down when they believe it is inaccurate, out of date or non-compliant. Replacing withdrawn content with corrected content does require approval, although Compliance will prioritise it. The notification records what was removed, from where and why.",
  "2.8":
    "Every published asset carries its approval reference, in the format MC-YYYY-NNNN, in its metadata or footer. For printed material the reference appears in small type in the footer; for digital assets it may be in the file metadata, the page source or the content management system record. The reference lets anyone trace an asset back to its approval record within minutes. Assets found live without a reference are treated as unapproved.",
  "2.9":
    "A translated or localised version of a communication is a new communication and needs its own approval. Translation can change meaning, prominence and the legal effect of a disclaimer, so the approved source text does not carry its approval across languages. The local reviewer confirms that mandatory disclosures remain complete and prominent in the target language. Machine-translated copy is never published without human review.",
  "2.10":
    "Compliance spot-checks at least ten percent of live communications every month. The sample is drawn across channels and business units and weighted toward high-risk content such as rate claims and credit promotions. Findings are logged, rated and fed back to the content owner within five business days. Repeated findings against the same team trigger a review of that team's publishing rights.",
  "2.11":
    "When Compliance withdraws an approval, the communication is removed from every channel within one business day. The content owner confirms removal in writing, listing each placement, including agency-controlled and partner placements. Cached or syndicated copies are pursued with the hosting platform. A withdrawal notice explains the reason so that the content can be corrected rather than simply abandoned.",

  // Chapter 3 — Claims, Performance and Comparative Advertising
  "3.1":
    "Every communication is fair, clear and not misleading, judged by the overall impression it gives a typical recipient rather than by any single sentence read in isolation. A statement that is literally true can still mislead if the context, imagery or omission of a relevant fact would leave a reasonable reader with a false impression. Benefits are never given more prominence than the conditions and risks that qualify them. Where a communication is aimed at a less experienced audience, the standard is applied with that audience in mind.",
  "3.2":
    "Every factual claim is supported by evidence held on file before the communication is published. The evidence is specific to the claim, current and sufficient to persuade an informed sceptic; a claim about the Sublinear Save rate is supported by the rate sheet in force, not by a product manager's email. The substantiation file is attached to the review request and retained with the approval record. A claim that cannot be substantiated is removed, not softened.",
  "3.3":
    "Words such as 'guaranteed', 'risk-free', 'can't lose' or 'certain' are prohibited for any product whose return, rate or value can vary. This covers Sublinear Invest, the variable rate on Sublinear Save and any currency transfer through Sublinear FX, where the rate moves until the transfer is executed. The prohibition extends to imagery and metaphors that convey certainty, such as a padlock placed over a return figure. 'Guaranteed' may describe a contractual feature of a fixed-term product only when the guarantee is unconditional and the guarantor is named.",
  "3.4":
    "Any quoted rate states whether it is fixed or variable, the date from which it applies and the conditions attached, and a variable rate is never presented as fixed. For Sublinear Save the rate is always described as variable and the communication says that it can go down as well as up. Promotional rates that depend on a balance tier, a minimum deposit or a time limit state those conditions in the same view as the rate. The rate quoted is the rate in force on the planned live date, not a rate expected to be introduced.",
  "3.5":
    "Any reference to past returns carries the approved past-performance disclaimer and covers at least five complete years, or the whole life of the product if shorter. Returns are shown for discrete periods, net of fees, and are never cherry-picked to a start date that flatters the result. Past performance is never the most prominent element of a Sublinear Invest communication. Simulated past performance, including back-tested model portfolios, is clearly labelled as simulated.",
  "3.6":
    "A projected or hypothetical figure is labelled 'illustrative', states the assumptions behind it and is never the headline of the communication. Assumptions include the growth rate, the period, the contribution pattern and the fees deducted. The illustration shows a range, or a less favourable scenario alongside the favourable one. A projection is never phrased as a promise of what a customer will receive.",
  "3.7":
    "A comparison with a competitor names the basis and date of the comparison, compares like with like and does not disparage the competitor. Rates are compared for the same product type, balance and term; fees are compared across the same usage pattern. The comparison is refreshed, or withdrawn, when the competitor's terms change. Competitor names are used factually, without logos or imagery that could suggest endorsement.",
  "3.8":
    "Superlatives such as 'best', 'number one', 'lowest' and 'leading' require independent third-party substantiation that is less than twelve months old. The source and date of the substantiation are stated in the communication or in a footnote in the same view. A superlative that was true at approval is withdrawn as soon as the ranking changes. Internal surveys and self-awarded titles do not qualify as independent substantiation.",
  "3.9":
    "Absolute safety claims such as 'bank-level security', '100% secure' and 'unhackable' are prohibited, although specific controls may be described factually. A communication may say that Sublinear Card transactions are protected by two-factor authentication or that client assets are held with a named custodian. It may not imply that no loss is possible or that the Company's controls make a customer's own precautions unnecessary. Security descriptions are reviewed by Information Security before approval.",
  "3.10":
    "A communication never implies that a product is government-insured, regulated or endorsed when it is not, and any use of 'insured' or 'protected' states the exact scope of the protection. The scope includes who provides the protection, which balances or products it covers and the limit per customer. Sublinear Invest holdings are not covered by deposit protection and the communication says so wherever protection is mentioned. Registration numbers are quoted exactly and never paraphrased as 'approved by' or 'endorsed by'.",
  "3.11":
    "'Tax-free' is used only where it is true for every eligible customer; otherwise the communication says 'may be tax-advantaged' and carries the approved tax disclaimer. The disclaimer states that tax treatment depends on individual circumstances and may change. Communications never estimate a customer's tax saving unless the calculation is shown. The Company does not give tax advice and the communication does not suggest otherwise.",
  "3.12":
    "Deadlines, countdowns and 'limited availability' claims are used only when they are true and the evidence is on file. A deadline that is extended converts the original claim into a misleading one, so extensions require fresh approval and a visible explanation. 'Limited places' or 'while stocks last' is used only where a genuine numerical limit exists and is recorded. Countdown timers that reset for each visitor are prohibited.",
  "3.13":
    "A statistic names its source, the sample size and the date the data was collected. Where the statistic comes from Company data, the method is described in enough detail for Compliance to reproduce the figure. Percentages derived from fewer than one hundred respondents are shown with the absolute number. Statistics older than twenty-four months are withdrawn or refreshed.",
  "3.14":
    "An award or rating names the awarding body and the year it was given, and discloses when participation or entry was paid for. Awards are quoted exactly, including any category qualifier, and are not promoted beyond twenty-four months after they were given. Star ratings from review platforms state the platform, the number of reviews and the date the rating was captured. An award for one product is never presented as an award for the Company as a whole.",

  // Chapter 4 — Fees, Pricing and Promotional Offers
  "4.1":
    "Wherever a price or rate is shown, every mandatory fee is disclosed in the same view. A fee is mandatory when a typical customer using the product as marketed cannot avoid it. For Sublinear FX this includes the transfer fee and any exchange-rate margin; for Sublinear Card it includes the annual fee and foreign transaction charges. Linking to a fee schedule does not satisfy this clause on its own.",
  "4.2":
    "'Free' or 'no fees' is used only where no fee of any kind can ever apply, and 'no fees ever' is prohibited for any product that carries a conditional fee. A product with a fee that is waived on condition is described as 'no monthly fee when' followed by the condition, in the same view. 'Free' is never used for a product that is funded through an exchange-rate margin or a charge the customer pays indirectly. A feature within a product may be described as free only if that feature truly carries no charge.",
  "4.3":
    "An introductory or promotional rate states its duration, the rate that applies afterwards and the eligibility conditions in the same view as the promotional rate. The reverting rate is shown with no less prominence than the introductory rate. Where the reverting rate is variable, the communication says so and names the reference rate it tracks. Promotional rates on Sublinear Save are never shown without the standard variable rate alongside.",
  "4.4":
    "A credit promotion that states any rate, monthly amount or cost of borrowing shows the representative APR with equal prominence. Equal prominence means the same type size, weight and colour as the trigger figure, positioned so that both are read together. The representative example includes the amount of credit, the duration and the total amount payable. Sublinear Card promotions that mention only non-financial features may omit the APR.",
  "4.5":
    "A cashback or rewards offer states the cap, the eligibility conditions and when the reward is paid. Caps include per-transaction, monthly and annual limits and any categories excluded from earning. Where rewards are paid in points, the communication states the cash value of a point. Rewards that can be withdrawn or changed by the Company say so.",
  "4.6":
    "A referral offer states the reward, the conditions and the limit per person, and never rewards referring someone for whom the product is unsuitable. Referral rewards are paid only after the referred customer meets a genuine usage condition, not merely on account opening. Referral messaging gives the referrer no script that makes product claims on the Company's behalf. The programme terms allow the Company to withhold rewards for abuse.",
  "4.7":
    "A sign-up bonus shows its minimum deposit or activity condition adjacent to the bonus amount. 'Adjacent' means in the same sentence or the same visual block, not in a footnote or on a linked page. The time allowed to meet the condition and the date the bonus is credited are stated. A bonus that is taxable for the customer says so.",
  "4.8":
    "A 'was' price, reference price or saving claim must relate to a price actually charged for at least thirty days in the previous ninety. The dates of the earlier price are recorded in the substantiation file. Savings are expressed against the Company's own prior price, not against a price that was never charged. Where the earlier price applied only to some customers, the claim says so.",
  "4.9":
    "A 'zero FX fee' or similar claim discloses any spread or markup applied to the exchange rate. Sublinear FX communications state the rate used, how it is derived from the reference rate and the typical margin. A transfer is never described as 'free' or 'at the real rate' when a margin is built into the rate. The disclosure appears in the same view as the claim.",
  "4.10":
    "Customers receive at least thirty days' notice of a fee change, and marketing stops quoting the old fee as soon as notice is sent. From the date notice is given, every live communication is reviewed for references to the superseded fee. Where the new fee is lower, marketing may quote it only from its effective date. Notice is given through a durable medium, not only through marketing channels.",
  "4.11":
    "Every promotion links to or prints its full terms, including eligibility, dates, how to claim and what happens if the offer is withdrawn. The terms are approved alongside the creative and share its approval reference. A promotion's headline never contradicts its terms. Terms remain available for the life of the promotion and for the claim period afterwards.",
  "4.12":
    "A pricing error is corrected in every channel within one business day of discovery, and Legal decides whether the erroneous price is honoured for customers who relied on it. Discovery is reported to Compliance and Legal immediately through the breach process. Customers who ask about the error receive a consistent, approved explanation. The root cause is recorded and the approval record for the affected asset is annotated.",

  // Chapter 5 — Disclosures, Disclaimers and Risk Language
  "5.1":
    "Any communication about an investment product carries the warning 'Capital at risk', or an approved equivalent, in the same view as any benefit claim. The warning is in text, not only spoken or implied through imagery. It accompanies every Sublinear Invest communication, including those that mention only features such as low fees or an easy-to-use app. Equivalent wording is drawn from the approved disclaimer library described in section 5.4.",
  "5.2":
    "A disclaimer is set in type no more than two sizes smaller than the body copy and is never hidden behind a click, hover, expandable panel or a scroll beyond the claim. Prominence also depends on contrast, position and competing visual elements, so a legible disclaimer buried under imagery still fails this clause. Disclaimers are never set in a colour that blends with the background. On mobile layouts the disclaimer remains visible without horizontal scrolling.",
  "5.3":
    "A disclaimer appears on the same screen, page or creative as the claim it qualifies. In a carousel or multi-page asset each panel making a claim carries the qualifying disclaimer. In video the disclaimer appears while the claim is on screen or spoken. A link to a disclaimer elsewhere is permitted only in addition to, never instead of, the disclaimer in place.",
  "5.4":
    "Only disclaimer wording from the approved disclaimer library, referenced by its library id, is used in Company communications. The library is maintained by Compliance and each entry records the products and channels it suits. Content owners may propose new wording, which is added to the library before first use. Paraphrasing or shortening a library disclaimer without a new library entry is a material change.",
  "5.5":
    "A credit promotion carries the approved affordability warning. The warning states, in plain language, that borrowing costs money and that missing repayments can affect the customer's credit record and ability to borrow. It is positioned with the representative APR so that both are read together. Sublinear Card communications that invite an application always carry the warning, even when no rate is quoted.",
  "5.6":
    "A communication about crypto-assets states that they are not protected by any compensation scheme and that their value may fall to zero. The statement appears in the same view as any reference to a crypto-asset, including a mention of a partner that provides exposure to one. The Company does not promote crypto-assets to customers who have not completed the appropriateness check. Imagery that suggests crypto-assets are a form of saving is prohibited.",
  "5.7":
    "An SMS or social post that makes a benefit claim includes at least the short risk flag and a link to the full disclosure in the same message. The short risk flag for investments is 'Capital at risk'; for credit it is 'Borrowing costs money, check you can repay'. Character limits do not excuse the omission of the flag; the claim is shortened instead. A thread or reply is a separate message and needs its own flag.",
  "5.8":
    "A spoken or on-screen disclaimer is held for at least three seconds and for a duration proportionate to the length and prominence of the claim. On-screen text is legible at the smallest display size the asset is produced for. Spoken disclaimers are delivered at the same pace and volume as the rest of the script. A disclaimer is never placed only after the end card or over the final frame.",
  "5.9":
    "Any hypothetical, modelled or projected figure carries the illustration-only label beside it, in the approved wording. The approved wording is 'For illustration only, not a forecast' and it sits beside the figure, not in a general footer. The label is used in addition to the assumptions required by section 3.6. Interactive calculators show the label on the results screen every time a result is displayed.",
  "5.10":
    "A testimonial carries 'Individual results vary' and discloses any compensation, gift or incentive the author received. Compensation includes fee waivers, account credits, early access and payment for time. The disclosure is in the same view as the testimonial. A testimonial that quotes a return or saving also carries the risk warning that would apply to the Company's own claim.",
  "5.11":
    "Republished third-party content, such as a press article, analyst note or guest post, states that the views expressed are the author's own and not those of the Company. Republishing does not relieve the Company of responsibility for claims the content makes about its products, so the content is reviewed as a financial promotion. Edits to third-party content are marked. The original date and source are shown.",
  "5.12":
    "Every disclosure is written in plain language and is available in text form. Plain language means short sentences, everyday words and no undefined abbreviations. Disclosures delivered in audio or video also exist as text in the same asset or on the linked page. Disclosures are tested for readability at a level a typical customer can follow without specialist knowledge.",

  // Chapter 6 — Email, SMS and Outbound Communications
  "6.1":
    "Marketing email or SMS is sent only to recipients with recorded opt-in consent, or to existing customers under a soft opt-in for products similar to those they already hold. The consent record shows the date, the source and the wording the recipient agreed to. A soft opt-in does not extend to products the customer has shown no interest in, such as marketing Sublinear Invest to a customer who holds only Sublinear Card. Purchased or rented lists are never used.",
  "6.2":
    "Every marketing email contains a working one-click unsubscribe link, and an unsubscribe request is honoured within five business days. The link does not require the recipient to log in, confirm a password or state a reason. Unsubscribing from one campaign removes the recipient from all marketing email unless they choose otherwise through a preference centre. The link is tested before each send.",
  "6.3":
    "Every message shows the true sender name, a postal address for the Company and a reply-to address that is monitored. 'Monitored' means that replies are read and actioned within two business days. The sender name is the Company or a product name the recipient would recognise, never an individual's name used as a pretext. Spoofed or look-alike sending domains are prohibited.",
  "6.4":
    "A subject line is not misleading about the content of the message and never uses a fake 'Re:' or 'Fwd:' prefix or false urgency. Subject lines that imply a personal message from an individual, a reply to the recipient or an unresolved problem are prohibited. Preview text follows the same standard. Subject lines are included in the review request and approved with the body.",
  "6.5":
    "A transactional message, such as a statement, security alert, payment confirmation or regulatory notice, carries no promotional content beyond a single footer line. The footer line may name a product and link to it but makes no claim about rates, returns or offers. Transactional messages are sent regardless of marketing consent, which is why they are kept free of marketing. Whether a message is transactional is decided by its primary purpose, not by its template.",
  "6.6":
    "A recipient receives no more than three marketing emails and one marketing SMS in any seven-day period, counted across all campaigns, products and business units. The cap is enforced centrally in the messaging platform, not by individual campaign owners. Transactional messages do not count toward the cap. Exceptions for time-limited regulatory campaigns are approved by the Marketing Compliance Officer.",
  "6.7":
    "No marketing SMS is sent between 21:00 and 08:00 in the recipient's local time. Where the recipient's time zone is unknown, the most conservative assumption across the Company's markets is used. Scheduled sends that would cross into quiet hours are held until the window opens. Transactional alerts such as fraud warnings are exempt.",
  "6.8":
    "Targeting uses only data the recipient consented to for marketing and never uses sensitive attributes such as health, financial distress, protected characteristics or inferred vulnerability. Behavioural signals that proxy for distress, such as missed payments or persistent overdraft use, are excluded from marketing segmentation. Personalised content is reviewed as a financial promotion in the same way as broadcast content. The data used for each campaign is recorded in the campaign brief.",
  "6.9":
    "A recipient who opts out is added to the global suppression list and is not marketed to for twenty-four months, after which fresh consent is required. The suppression list applies across every channel, product and agency acting on the Company's behalf. A new account opened by a suppressed recipient does not reset the suppression. Agencies receive hashed suppression data, never plain contact details.",
  "6.10":
    "A marketing message never states or implies that the recipient's account is at risk, suspended, limited or in need of action in order to drive engagement. Prompts such as 'your account needs attention' or 'action required' are reserved for genuine servicing messages. Marketing may mention a deadline that is genuine and relates to the offer, not to the account. This clause applies to subject lines, push notifications and in-app banners as well as the message body.",
  "6.11":
    "Marketing emails use a pre-approved template with the standard footer and legal block. Templates are approved by Compliance, versioned and locked in the messaging platform so that campaign owners cannot edit the footer. The legal block names the Company, its registered address and the regulatory status statement. Content inserted into a template still requires approval.",
  "6.12":
    "Business-to-business outreach identifies the sender and the Company, offers a clear opt-out and never implies a prior relationship that does not exist. Phrases such as 'following up on our conversation' or 'as discussed' are prohibited unless true. Outreach to business contacts respects the frequency cap and suppression list in sections 6.6 and 6.9. Contact data is sourced lawfully and its origin is recorded.",
  "6.13":
    "Links in marketing messages resolve to Company-controlled domains, and any tracking applied to links or message opens is disclosed in the privacy notice. Shortened links are permitted only through the Company's own shortener. Links to partner or agency domains are used only for approved landing pages registered with Marketing. Links are checked for correctness and security before sending.",

  // Chapter 7 — Social Media, Influencers and Endorsements
  "7.1":
    "Company content is published on social media only from accounts registered with Marketing. The register records the platform, the handle, the business owner and the individuals holding publishing credentials. Accounts are created with Company email addresses and protected by multi-factor authentication. Unregistered accounts that present as official are reported to the platform and taken down.",
  "7.2":
    "An employee may share approved Company content from a personal account but never makes product claims of their own and always identifies their affiliation with the Company. Sharing means reposting unchanged; adding commentary about rates, returns or suitability turns the post into an unapproved financial promotion. Employees do not answer customer questions about products from personal accounts and instead direct the person to official channels. The social media guidelines for employees form part of annual training.",
  "7.3":
    "Every paid, gifted or incentivised post carries '#ad' or the platform's paid-partnership label at the start of the post, in every post of a series. The label is not buried among other hashtags or placed below the fold. A relationship is disclosed even when the creator received only free access to a product. Stories, short videos and live streams carry the label on screen for their duration.",
  "7.4":
    "An influencer works under a written agreement, submits scripts and drafts for pre-approval and makes no claim about performance, returns or what a customer will earn. The agreement incorporates this policy, gives the Company the right to require removal of a post and sets out the disclosure requirements of section 7.3. Influencers are briefed on the risk warnings that apply to the product they promote. Content that departs from the approved script is removed.",
  "7.5":
    "A testimonial is genuine, current, representative of typical outcomes and used with the author's written consent. The consent names the channels and period of use and can be withdrawn. Testimonials are not edited in a way that changes their meaning, and a testimonial about one product is not used for another. Compensation is disclosed as required by section 5.10.",
  "7.6":
    "Purchased followers, engagement bots, fake reviews and undisclosed incentivised reviews are prohibited. Agencies and influencers working for the Company are bound by the same prohibition. Incentives for reviews, where a platform permits them, are disclosed in the review and offered regardless of the review's sentiment. Suspected manipulation of Company accounts is reported to Compliance.",
  "7.7":
    "A public complaint is acknowledged promptly and moved to a private channel, and no account detail is discussed in public. The acknowledgement uses approved wording and does not dispute the facts of the complaint publicly. Complaints handlers, not marketing staff, resolve the matter. Complaints received through social channels are logged in the complaints system.",
  "7.8":
    "Customer-generated content is reposted only with the author's written permission and after screening for claims that the Company could not itself make. Screening applies the same standards as a Company communication, including risk warnings where a benefit is described. Permission records the channels and period of use. Content from minors is never reposted.",
  "7.9":
    "Only trained spokespeople go live on Company channels, and the applicable risk warning is spoken within the first sixty seconds. Live sessions follow an approved outline and a moderator is present to remove or respond to questions that seek personal advice. Recordings of live sessions are reviewed before they are made available on demand. A live session is ended if the risk warning cannot be given.",
  "7.10":
    "A giveaway or contest publishes its rules, eligibility and closing date, requires no purchase or account opening where the law so requires, and documents how winners are selected. Prizes are described accurately and awarded within the stated time. Winners' names are published only with consent. Entry mechanics do not require participants to make claims about the Company's products.",
  "7.11":
    "Content never recommends a specific action to an identified individual, such as 'you should buy', 'move your savings now' or 'this fund is right for you'. Content may describe product features and who a product is designed for in general terms. Replies to individual questions on social media point to general information and to the Company's guidance service. The boundary applies to staff, agencies and influencers alike.",
  "7.12":
    "Scheduled promotional posts are paused during a declared incident or significant market event. Incidents include service outages, data incidents and public controversies involving the Company; market events are declared by the Chief Investment Officer or Compliance. Marketing checks the schedule queue within one hour of a declaration. Posts resume only when the incident lead confirms.",

  // Chapter 8 — Vendors, Agencies and Third-Party Content
  "8.1":
    "A marketing vendor or agency is engaged only after onboarding through Procurement, including due diligence proportionate to the services provided. Onboarding confirms the vendor's financial standing, data-protection arrangements, conflicts of interest and compliance history. No work starts, and no data is shared, before onboarding is complete. Vendors are re-screened at least every two years.",
  "8.2":
    "Every agency or vendor contract includes compliance with this policy, Company approval rights over all content, audit rights, data-protection terms and the right to terminate for a compliance breach. The clauses are taken from the Legal template and are not negotiated away without Legal and Compliance approval. Statements of work reference the master agreement and cannot dilute its terms. Contracts are stored in the contract repository with their signature dates.",
  "8.3":
    "A vendor receives customer data only under a signed data-processing agreement and never sells it, shares it or uses it for its own purposes. The agreement limits processing to the documented instructions, requires security measures and provides for breach notification within seventy-two hours. The minimum data needed for the engagement is shared, and identifiers are pseudonymised where possible. Transfers out of the Company's operating jurisdictions require Legal approval.",
  "8.4":
    "A vendor deletes all Company and customer data within thirty days of the contract ending and certifies the deletion in writing. Deletion includes backups, test environments and copies held by subcontractors. Where a legal hold prevents deletion, the vendor isolates the data and notifies the Company. The certificate is filed with the contract record.",
  "8.5":
    "All deliverables are assigned to the Company on payment, and the vendor may not reuse them for other clients. Deliverables include creative, copy, code, data models and research. Pre-existing vendor materials incorporated into deliverables are licensed to the Company perpetually. Vendors may reference the engagement in their credentials only as permitted by section 8.6.",
  "8.6":
    "A vendor uses the Company's name or logo in its own marketing only with written consent for each specific use. Consent is given by Marketing, specifies the format, the channel and the duration, and can be withdrawn. Vendors never imply that the Company endorses their services. Logo files are supplied by Marketing and used in accordance with the brand guidelines.",
  "8.7":
    "No contract grants a vendor exclusivity over a channel, category or market for longer than twelve months. Exclusivity of any length requires approval from the Chief Marketing Officer and a documented commercial rationale. Automatic renewal of exclusivity is prohibited. The Company retains the right to run its own activity in the exclusive channel.",
  "8.8":
    "A vendor subcontracts any part of its services only with the Company's prior written consent and flows down every applicable term of this policy to the subcontractor. The vendor remains fully responsible for the subcontractor's performance. The Company may refuse or withdraw consent to any subcontractor. Subcontractors with access to customer data sign the same data-processing terms.",
  "8.9":
    "No vendor or agency is paid per funded account or per sale of a retail investment product, and compensation is never contingent on account openings unless suitability safeguards are in place. Permitted structures include fixed fees, time-based fees, fees per approved deliverable and fees per qualified lead where the lead is defined without reference to product sales. Bonuses linked to campaign reach or engagement are permitted. Any proposed performance-based structure is reviewed by Compliance before the contract is signed.",
  "8.10":
    "Confidentiality obligations in vendor contracts survive for at least three years after the contract ends. Confidential information includes customer data, unpublished product plans, pricing, campaign performance and the terms of the contract itself. Obligations relating to personal data and trade secrets survive indefinitely. Vendors return or destroy confidential materials at the end of the engagement.",
  "8.11":
    "The vendor indemnifies the Company for regulatory fines and remediation costs arising from non-compliant content the vendor created, and the vendor's liability is capped no lower than twelve months' fees under the contract. The indemnity is not reduced by the Company's approval of the content where the vendor withheld relevant facts. Caps do not apply to breaches of data-protection or confidentiality terms. Legal reviews any proposed departure from these limits.",
  "8.12":
    "The Company may audit a vendor's compliance with the contract and this policy on ten business days' notice. Audits may be carried out by Company staff or an appointed third party and cover records, systems and personnel relevant to the engagement. Audit costs are borne by the Company unless material non-compliance is found. Findings are tracked to closure.",
  "8.13":
    "The Company may terminate a vendor contract immediately for a compliance breach, and other breaches carry a thirty-day cure period. Compliance breaches include publishing unapproved content, misusing customer data and failing to disclose a paid relationship. On termination the vendor stops all activity on the Company's behalf and the data deletion requirements of section 8.4 apply. Termination for breach does not entitle the vendor to fees for undelivered work.",

  // Chapter 9 — Payments, Transactions and Promotional Spend Controls
  "9.1":
    "A marketing payment above $25,000 requires Vice President approval, and a payment above $100,000 requires Chief Financial Officer approval. Thresholds apply to the total committed value of a contract or campaign, not to individual invoices. Approval is recorded in the finance system before the commitment is made. Delegations of authority are in writing and are never delegated below Director level.",
  "9.2":
    "Vendor spend above $5,000 requires an approved purchase order before the invoice is accepted. The purchase order specifies the deliverables, the price and the payment schedule. Invoices that do not reference a purchase order are returned to the vendor. Retrospective purchase orders are a breach and are reported to Finance.",
  "9.3":
    "Gifts or hospitality offered to a customer or prospect are capped at $150 per person per year, and nothing of value is ever given to a public official. The cap covers meals, tickets, merchandise and travel combined. All gifts and hospitality above $25 are recorded in the gifts register within five business days. Cash and cash equivalents are never given.",
  "9.4":
    "An individual, including an influencer, freelancer or research participant, is paid only through Accounts Payable under a signed contract, and never in cash, gift cards or crypto-assets. Payment requires a tax form and bank details verified by Finance. Product credits are permitted as remuneration only where the contract says so and the value is recorded. Payments to individuals are reported for tax purposes as required.",
  "9.5":
    "Customer rewards, cashback and bonuses are paid only through the product's reward system, and manual payouts are prohibited. The reward system applies the approved terms, caps and eligibility rules consistently. Where a system error prevents a reward from being paid, the fix is applied in the system rather than by a manual transfer. Exceptions require approval from the product owner and Finance and are logged.",
  "9.6":
    "A sponsorship above $10,000 requires Compliance review before commitment, and the Company never sponsors gambling, tobacco or political organisations or events. Sponsorship agreements include the content approval and brand use terms of chapter 8. Benefits received under a sponsorship, such as tickets, are recorded in the gifts register when given to customers. Each sponsorship is reviewed annually for reputational risk.",
  "9.7":
    "No political contribution is made in the Company's name or with Company funds, and charitable giving goes through the Foundation process. Political contributions include donations, event sponsorship, paid advertising for a candidate or cause and in-kind support. Employees who make personal political contributions do not associate them with the Company. Charitable donations are screened under section 9.11.",
  "9.8":
    "Expenses are submitted within sixty days of being incurred, with itemised receipts for any amount above $25. Expenses are coded to the campaign or cost centre they relate to and approved by the claimant's manager. Entertainment expenses name every attendee. Late or unreceipted claims are rejected unless the Head of Marketing Finance approves an exception.",
  "9.9":
    "Paid media is bought only through approved platforms using the corporate card or an approved purchase order, and personal cards are never used. Approved platforms are listed by Marketing Operations and reviewed annually. Media spend is reconciled monthly against platform reports. Card limits are set per user and are not raised to accommodate a single campaign without Finance approval.",
  "9.10":
    "A frontline goodwill credit to a customer is capped at $50, and larger credits require manager approval and are recorded as goodwill. Goodwill credits are not used to settle complaints that should go through the complaints process. Credits above $500 require approval from the Head of Customer Operations. The goodwill ledger is reviewed monthly for patterns.",
  "9.11":
    "Every vendor and payee is screened against sanctions and prohibited-counterparty lists before the first payment and at least annually thereafter. Screening is performed by Finance using the Company's screening tool and the result is recorded against the payee. A potential match blocks payment until it is resolved by Compliance. Beneficial owners of agencies are included in screening.",
  "9.12":
    "Splitting a payment, contract or purchase order into smaller amounts to stay under an approval threshold is prohibited. Related purchases from the same vendor for the same campaign are aggregated for approval purposes. Finance monitors for repeated payments just below thresholds. Splitting is treated as a serious breach regardless of whether each part was individually approved.",
};
