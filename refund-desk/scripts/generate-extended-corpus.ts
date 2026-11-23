import fs from "fs";
import path from "path";
import { getEncoding } from "js-tiktoken";
import { buildDecisionRequest } from "../src/lib/bundle";
import { loadLibrary, scenarioById, customerById, assembleBundle } from "../src/lib/load";
import type { SourceDocument } from "../src/lib/types";

const OUTPUT = path.join(process.cwd(), "data", "extended-corpus.json");

type Ticket = {
  n: number;
  customerId: string;
  org: string;
  contact: string;
  agent: string;
  product: string;
  opened: string;
  title: string;
  story: string;
  cause: string;
  fix: string;
};

const TICKETS: Ticket[] = [
  {
    n: 1,
    customerId: "NS-CUST-4101",
    org: "Redcedar Logistics",
    contact: "Helen Cho",
    agent: "Imani Cole",
    product: "Harbor Billing",
    opened: "2026-01-08",
    title: "Webhook signatures failed after a secret rotation",
    story:
      "Redcedar rotates the Harbor Billing signing secret every quarter. On 8 January the new secret was stored in the vault, but the freight portal kept a copy of the previous secret in a sidecar that only reloads on deploy. Deliveries started returning signature mismatches at 14:18 UTC, and the retry queue reached 1,842 events before anyone paged support.",
    cause:
      "The portal's worker reused a process-level cache for six hours. The vault write succeeded, and Northstar signed with the new key, but Redcedar verified with the old key until the worker was restarted.",
    fix:
      "Imani Cole documented a two-step rotation: publish the new secret, accept either secret for one hour, then drop the old secret. Redcedar restarted the worker and replayed the failed events. None of this concerns a Brightline Analytics refund.",
  },
  {
    n: 2,
    customerId: "NS-CUST-4102",
    org: "Halcyon Clinics",
    contact: "Priya Nair",
    agent: "Noah Park",
    product: "Lumen Desk",
    opened: "2026-01-14",
    title: "SCIM group push dropped the night-shift nurses",
    story:
      "Halcyon sends nursing groups from its identity provider every night. After a mapping change, the night-shift group arrived with an empty members array. Lumen Desk treated the empty array as a full replacement and removed 86 users from the shared inbox. Morning triage found unanswered patient-routing tickets.",
    cause:
      "The identity provider emitted an empty group when the source filter excluded inactive badges. The SCIM client did not distinguish an intentional empty group from a failed lookup.",
    fix:
      "Noah Park restored the previous membership from the 13 January audit export and turned on a guard that rejects empty replacements above 20 users unless the request sets an explicit replace flag. The clinic's refund terms are in its own agreement and are not copied elsewhere.",
  },
  {
    n: 3,
    customerId: "NS-CUST-4103",
    org: "Marrow & Co",
    contact: "Eliot Marsh",
    agent: "Maya Ortiz",
    product: "Quill Analytics",
    opened: "2026-01-21",
    title: "Sampling stayed capped after a plan upgrade",
    story:
      "Marrow upgraded from Team to Business so product could see full traffic on the checkout funnel. The invoice showed the new plan, but events remained sampled at one in ten. The weekly board chart undercounted completed orders by roughly the same ratio.",
    cause:
      "The sampler reads a project flag that is copied at ingest and only refreshed when the project token is reissued. The plan change updated billing and did not reissue the token.",
    fix:
      "Maya Ortiz reissued the ingest token, backfilled seven days from the raw archive, and added a billing note that plan changes must refresh sampler config. The note is operational and states no refund window.",
  },
  {
    n: 4,
    customerId: "NS-CUST-4104",
    org: "Fieldnote Education",
    contact: "Rosa Klein",
    agent: "Imani Cole",
    product: "Lumen Desk",
    opened: "2026-02-02",
    title: "SSO loop after a certificate rollover",
    story:
      "Fieldnote's identity certificate expired on a Sunday. Teachers could open the portal and were sent back to the login page. The loop continued until the district uploaded the new certificate on Monday afternoon. Substitute teachers could not see classroom tickets during the outage.",
    cause:
      "The district had staged the new certificate in a test tenant. Production still referenced the expiring certificate because the metadata URL was pinned to a file uploaded in 2025.",
    fix:
      "Imani Cole switched production to the metadata URL, confirmed the new certificate fingerprint, and wrote a 30-day reminder that is a calendar reminder only and not a refund period. Classes resumed the same afternoon.",
  },
  {
    n: 5,
    customerId: "NS-CUST-4105",
    org: "Plover Insurance",
    contact: "Dean Okonkwo",
    agent: "Noah Park",
    product: "Harbor Billing",
    opened: "2026-02-11",
    title: "South Dakota exemption certificate was rejected",
    story:
      "Plover uploaded a resale certificate for a Sioux Falls office. Harbor Billing marked the account taxable and added tax to the February invoice. The controller disputed the line before payment. The certificate was valid, but the scan cut off the state seal.",
    cause:
      "The tax validator requires a visible jurisdiction stamp and a matching taxpayer id. The cropped file failed the stamp check and fell through to the default taxable rate.",
    fix:
      "Noah Park accepted a second upload, reversed the tax line, and left the subscription charge in place. The reversal was a tax correction, not a subscription refund, and it applied only to Plover's invoice INV-4105-2026-02.",
  },
  {
    n: 6,
    customerId: "NS-CUST-4106",
    org: "Kindling Health",
    contact: "Amina Farouk",
    agent: "Maya Ortiz",
    product: "Lumen Desk",
    opened: "2026-02-18",
    title: "Audit export timed out above two million events",
    story:
      "Kindling's compliance team exports mailbox audit events every month for a hospital customer. The February export covered 2.4 million rows and stopped at 18 minutes with a gateway timeout. Smaller weekly exports still succeeded.",
    cause:
      "The export worker held the entire result in memory and serialized it as one JSON array. The gateway closed the connection at 15 minutes even though the worker was still writing.",
    fix:
      "Maya Ortiz reran the export as daily slices and shipped a change that streams newline-delimited JSON to object storage. The compliance request did not ask for a refund and did not change any contract.",
  },
  {
    n: 7,
    customerId: "NS-CUST-4107",
    org: "Ostara Foods",
    contact: "Chris Pell",
    agent: "Noah Park",
    product: "Harbor Billing",
    opened: "2026-02-25",
    title: "Dunning mail went out during an accounts-payable freeze",
    story:
      "Ostara freezes supplier mail for three days each quarter while the plant closes for inventory. Harbor Billing sent past-due notices on the second day because the freeze flag lived on the billing contact and not on the dunning schedule. Vendors called the plant manager.",
    cause:
      "The dunning job checks a tenant-level pause only. Ostara had paused the contact's inbox rule inside its own mail system, which Northstar cannot see, and had not set the tenant pause.",
    fix:
      "Noah Park set the tenant pause through 28 February, suppressed the notices already queued, and showed Chris Pell where the pause sits in Harbor Billing. No refund was requested.",
  },
  {
    n: 8,
    customerId: "NS-CUST-4108",
    org: "Vellum Legal",
    contact: "June Adler",
    agent: "Imani Cole",
    product: "Lumen Desk",
    opened: "2026-03-04",
    title: "Sandbox reset removed a shared demonstration tenant",
    story:
      "Vellum uses a shared sandbox to walk clients through a matter inbox. A new associate ran the reset action, which is documented as destructive, and deleted the scripted tickets the partners use in pitches. The production tenant was untouched.",
    cause:
      "The reset button sits next to the demo-data loader. The associate confirmed the dialog without noticing the tenant name. Sandbox resets are immediate and are not backed by the production archive.",
    fix:
      "Imani Cole reloaded the scripted matter from the demo seed and moved the reset action behind a typed tenant name. The conversation is about a sandbox, not about a production refund.",
  },
  {
    n: 9,
    customerId: "NS-CUST-4109",
    org: "Bramble Transit",
    contact: "Omar Shah",
    agent: "Maya Ortiz",
    product: "Harbor Billing",
    opened: "2026-03-12",
    title: "Professional services milestone was invoiced twice",
    story:
      "Bramble's implementation included three milestones. Milestone 3 was invoiced on 2 March and again on 9 March after a coordinator reopened the task. The second invoice used the same statement of work line and a new invoice number.",
    cause:
      "Reopening a completed services task cleared the invoiced flag. The nightly job treated it as new work. The subscription fee was not part of either invoice.",
    fix:
      "Maya Ortiz voided invoice INV-4109-883, kept INV-4109-874, and tied the invoiced flag to the milestone id rather than the task state. The void was a duplicate-billing correction for Bramble only.",
  },
  {
    n: 10,
    customerId: "NS-CUST-4110",
    org: "Glasshouse Hotels",
    contact: "Lila Berg",
    agent: "Noah Park",
    product: "Lumen Desk",
    opened: "2026-03-19",
    title: "IP allow list blocked the status webhook",
    story:
      "Glasshouse limits outbound calls to a short allow list. After Northstar added a new egress range for status webhooks, the hotel's front-desk alerts stopped. Guests still received email, but the lobby screen did not update during a water shutdown.",
    cause:
      "The new range 203.0.113.0/28 was published in the status page changelog on 18 March. Glasshouse's firewall change window was the following Tuesday. Webhooks failed closed, which is what the hotel asked for.",
    fix:
      "Noah Park provided the published range, and the hotel added it during an emergency change. Alerts resumed at 16:40 local time. The ticket does not mention a subscription refund.",
  },
  {
    n: 11,
    customerId: "NS-CUST-4111",
    org: "Northwind Labs",
    contact: "Kenji Sato",
    agent: "Imani Cole",
    product: "Harbor Billing",
    opened: "2026-03-26",
    title: "Yen invoices rounded to the wrong minor unit",
    story:
      "Northwind bills a Japanese subsidiary in JPY. Harbor Billing stored amounts as two-decimal currency and rounded 1280 yen to 12.80 display units before formatting. The subsidiary's ledger did not match the PDF by a factor of one hundred.",
    cause:
      "The currency table marked JPY as having two decimal places. JPY has zero. The formatter then inserted a decimal that the subsidiary read as a scaled amount.",
    fix:
      "Imani Cole corrected the exponent, regenerated March invoices, and left a note that the correction is a formatting repair. It does not create a refund right for any other customer.",
  },
  {
    n: 12,
    customerId: "NS-CUST-4112",
    org: "Paperkite Design",
    contact: "Ruth Hale",
    agent: "Maya Ortiz",
    product: "Harbor Billing",
    opened: "2026-04-02",
    title: "A credit memo applied tax a second time",
    story:
      "Paperkite received a credit memo for a removed seat. The memo reduced the pre-tax amount and then calculated tax on the original invoice again, so the credit was smaller than the seat price plus tax. Their bookkeeper flagged it before the next draft.",
    cause:
      "The credit-memo tax path used the invoice tax snapshot instead of the credited lines. Seat removals mid-cycle were the only documents that hit that path.",
    fix:
      "Maya Ortiz reissued the memo, refunded the 42 USD tax difference to the card on file, and recorded the reason as a tax calculation error. The 42 USD was not a subscription refund window decision.",
  },
  {
    n: 13,
    customerId: "NS-CUST-4113",
    org: "Harborline Mutual",
    contact: "Paul Adeyemi",
    agent: "Noah Park",
    product: "Quill Analytics",
    opened: "2026-04-09",
    title: "A saved report included a national identifier column",
    story:
      "A Harborline analyst cloned a claims report and added a column that the warehouse still stored from an old import. The report preview showed full national identifiers for 400 test policies. The analyst did not export the file, and the preview was captured in the audit log.",
    cause:
      "The old import mapped a source field into a generic string column that the semantic layer still exposed. Row-level security hid production policies but not the test book.",
    fix:
      "Noah Park removed the column from the semantic layer, rotated the analyst's session, and confirmed the preview was not downloaded. Security review stayed inside Harborline's tenant.",
  },
  {
    n: 14,
    customerId: "NS-CUST-4114",
    org: "Cinder Operations",
    contact: "Greta Holm",
    agent: "Imani Cole",
    product: "Lumen Desk",
    opened: "2026-04-16",
    title: "Secondary on-call was not paged for a severity-one",
    story:
      "Cinder's primary on-call phone was in a tunnel and did not acknowledge a severity-one page. The schedule named a secondary, but the escalation policy waited on a step that had been disabled during a February test and never turned back on.",
    cause:
      "The disabled step remained in the policy with a zero-minute delay, which the editor displayed as skipped. The scheduler treated a skipped step as the end of the policy.",
    fix:
      "Imani Cole restored the secondary step, ran a test page, and added a weekly check that a severity-one policy has two live steps. The incident review did not discuss refunds.",
  },
  {
    n: 15,
    customerId: "NS-CUST-4115",
    org: "Yellowbird Travel",
    contact: "Sofia Marquez",
    agent: "Maya Ortiz",
    product: "Harbor Billing",
    opened: "2026-04-23",
    title: "A renewal posted to the wrong subsidiary",
    story:
      "Yellowbird has a US entity and a Mexican entity. The April renewal for the contact-center seats posted to the Mexican entity because the billing profile on the subscription still pointed at a 2024 address. The US controller asked for the invoice to be moved, not cancelled.",
    cause:
      "Entity is taken from the subscription profile at renewal time. A later change to the customer's default entity does not rewrite existing subscriptions.",
    fix:
      "Maya Ortiz reissued the invoice under the US entity, voided the Mexican copy before tax filing, and showed Sofia where the subscription entity is set. The cash was not refunded. It was reassigned.",
  },
  {
    n: 16,
    customerId: "NS-CUST-4116",
    org: "Keel & Sons",
    contact: "Martin Keel",
    agent: "Noah Park",
    product: "Lumen Desk",
    opened: "2026-05-06",
    title: "Data processing addendum version did not match the vendor review",
    story:
      "Keel's outside counsel compared the signed addendum with the version linked from the trust portal. The portal showed the March 2026 addendum, and the signed PDF was the November 2025 addendum. Counsel would not finish the review until the copies matched.",
    cause:
      "The trust portal publishes the latest public addendum. Signed copies stay at the version in the customer's envelope. Nobody had sent Keel an updated envelope.",
    fix:
      "Noah Park sent the March addendum for signature and left the November copy marked superseded once the new envelope was signed. The thread is about contract versions for Keel, not about another customer's refund.",
  },
  {
    n: 17,
    customerId: "NS-CUST-4117",
    org: "Ione Retail",
    contact: "Farah Qureshi",
    agent: "Imani Cole",
    product: "Harbor Billing",
    opened: "2026-05-13",
    title: "Mid-cycle downgrade proration used the old seat count",
    story:
      "Ione moved from 40 Business seats to 22 Team seats on 13 May. The proration credit used 40 seats at the Team price instead of the Business price they had paid. The credit was too small, and the next invoice still showed 40 seats for one day.",
    cause:
      "The proration job read the target price and the source quantity. It should have read the source price and the source quantity for the unused portion.",
    fix:
      "Imani Cole posted a correcting credit of 310 USD and fixed the job. The credit is a billing adjustment for Ione's 13 May change. It is not a template for other accounts.",
  },
  {
    n: 18,
    customerId: "NS-CUST-4118",
    org: "Sable Archive",
    contact: "Yves Martin",
    agent: "Maya Ortiz",
    product: "Quill Analytics",
    opened: "2026-05-20",
    title: "A legal hold blocked an ordinary retention delete",
    story:
      "Sable placed a legal hold on one workspace and expected the other workspaces to keep deleting data at 18 months. The delete job stopped for the whole tenant. Storage grew by 1.8 terabytes over three weeks before the archive team noticed.",
    cause:
      "The hold flag was stored on the tenant. The job treated any hold as a reason to skip every workspace in that tenant.",
    fix:
      "Maya Ortiz scoped the hold to the named workspace, ran retention on the others, and confirmed the held workspace was unchanged. The ticket is a retention defect, not a refund review.",
  },
  {
    n: 19,
    customerId: "NS-CUST-4119",
    org: "Copperline Museums",
    contact: "Ada Varga",
    agent: "Noah Park",
    product: "Lumen Desk",
    opened: "2026-06-03",
    title: "Shared inbox rules still pointed at a departed curator",
    story:
      "When curator Ellen Voss left Copperline, the offboarding checklist removed her login and left four rules that assigned donor mail to her user id. Those messages sat unassigned. A donor's loan extension was not seen for six days.",
    cause:
      "Deactivating a user does not rewrite rules that store a user id. The inbox shows the rule as assigned to a missing user and does not fall back to the queue.",
    fix:
      "Noah Park reassigned the rules to the registrar queue, delivered the stuck messages, and added an offboarding report that lists rules pointing at inactive users. No contract term was changed.",
  },
  {
    n: 20,
    customerId: "NS-CUST-4120",
    org: "Lowland Energy",
    contact: "Pete Navarro",
    agent: "Imani Cole",
    product: "Harbor Billing",
    opened: "2026-06-17",
    title: "Usage rating double-counted a reprocessed file",
    story:
      "Lowland uploads interval meter files each night. A 16 June file was rejected for a bad trailer row, repaired, and uploaded again. Both copies were rated. The draft invoice included 48,220 intervals twice.",
    cause:
      "The rater treats the file name as the idempotency key. The repaired file had a new name. The interval timestamps were the real identity, and the rater did not look at them.",
    fix:
      "Imani Cole removed the duplicate intervals, regenerated the draft, and changed the key to meter id plus interval start. Lowland had not paid the draft. There was no refund because there was no capture.",
  },
  {
    n: 21,
    customerId: "NS-CUST-4121",
    org: "Orchard Street Books",
    contact: "Naomi Ellis",
    agent: "Maya Ortiz",
    product: "Quill Analytics",
    opened: "2026-07-01",
    title: "A campaign report attributed sales to the wrong store",
    story:
      "Orchard Street runs two shops that share a hostname and differ by a path. Quill attributed every July sale to the downtown store because the mapping kept only the host. The riverside shop looked as if it had no campaign sales.",
    cause:
      "The dimension builder normalized URLs to host only. The shop id was present on the event and was dropped before aggregation.",
    fix:
      "Maya Ortiz rebuilt July with the path preserved and updated the dimension. The correction changed a report. It did not move money and it did not mention another bookseller's contract.",
  },
  {
    n: 22,
    customerId: "NS-CUST-4122",
    org: "Fathom Marine",
    contact: "Lars Nygaard",
    agent: "Noah Park",
    product: "Lumen Desk",
    opened: "2026-07-15",
    title: "Attachment preview failed for a class of survey PDFs",
    story:
      "Fathom's surveyors upload scanner PDFs with an uncommon header. Preview spun until the worker timed out, and agents downloaded the file instead. One survey was a 90-megabyte color scan of a hull report.",
    cause:
      "The previewer rejects files over 25 megabytes and also rejects PDFs whose header is not in the first 1,024 bytes. The scanner wrote 2,048 bytes of metadata first.",
    fix:
      "Noah Park raised the scan window, left the size cap in place, and asked Fathom to compress the hull report. The worker change is a product fix, not a billing decision.",
  },
  {
    n: 23,
    customerId: "NS-CUST-4123",
    org: "Bright Parcel",
    contact: "Hugo Lent",
    agent: "Imani Cole",
    product: "Harbor Billing",
    opened: "2026-08-05",
    title: "Retry of a captured payment created a second authorization",
    story:
      "Bright Parcel's card network returned a timeout after a successful capture. Harbor Billing retried and created a second authorization for 640 USD. The customer's bank showed both. The first capture had already settled.",
    cause:
      "The retry policy treated a timeout as safe to repeat. Captures are not safe to repeat when the processor may have succeeded. The idempotency key was not sent on the retry.",
    fix:
      "Imani Cole voided the second authorization before settlement, kept the original capture, and stopped retries on capture timeouts. The void prevented a double charge. It was not a refund of the original purchase.",
  },
  {
    n: 24,
    customerId: "NS-CUST-4124",
    org: "Larkspur Clinics",
    contact: "Irene Bloch",
    agent: "Maya Ortiz",
    product: "Lumen Desk",
    opened: "2026-08-19",
    title: "Macro inserted the previous patient's instructions",
    story:
      "A Larkspur nurse used a discharge macro that included a snippet from the last ticket the macro editor had opened. The snippet named a different patient. The message was caught in draft and was not sent. The nurse reported it the same hour.",
    cause:
      "The macro editor saved a draft snippet in browser local storage and restored it into the next macro that was created on that browser. The storage was not scoped to the ticket.",
    fix:
      "Maya Ortiz cleared the bad macro, scoped drafts to the editor session, and reviewed the audit log to confirm the draft was never delivered. The clinical review stayed at Larkspur.",
  },
];

const MANUALS: { slug: string; title: string; paragraphs: string[] }[] = [
  {
    slug: "WEBHOOKS",
    title: "Harbor Billing webhook operations",
    paragraphs: [
      "Harbor Billing signs webhook bodies with HMAC-SHA256 over the raw bytes, not over a re-serialized object. The header carries a timestamp and the key id. Receivers should reject timestamps more than five minutes from their clock and should tolerate one overlap key during rotation.",
      "A failed delivery stays in the tenant queue for two days and then moves to a dead-letter list the customer can replay. Replays use the original event id. Receivers that are not idempotent will apply the event twice, which is the receiver's bug.",
      "Egress addresses are published on the status page before they change. Customers with allow lists are expected to read that page. A firewall drop looks the same as an application failure in the delivery log, except the log shows a connection timeout rather than an HTTP status.",
      "Test events use the same signature scheme and a payload type of ping. They are not billing events. A successful ping does not prove that a later invoice event will match the customer's business rules.",
    ],
  },
  {
    slug: "SCIM",
    title: "Lumen Desk identity provisioning",
    paragraphs: [
      "Lumen Desk accepts SCIM users and groups. A group push replaces membership when the replace operation is explicit. An empty member list is rejected when it would remove more than a small threshold, because identity providers sometimes emit an empty page during an upstream failure.",
      "Deactivating a user keeps their historical tickets and removes their ability to sign in. Rules that store the user id keep storing it. Offboarding reports list those rules so an administrator can point them at a queue.",
      "Seat counts in the admin console follow active users with a product seat, not every SCIM record. A deactivated user does not free a seat until the nightly reconcile. Administrators who need the seat the same day can release it from the user page.",
      "Provisioning logs keep the external id, the Northstar id, and the result. They do not keep the identity provider's password or token. Tokens used by the SCIM client are rotated from the admin console and expire on a schedule the customer chooses.",
    ],
  },
  {
    slug: "AUDIT",
    title: "Audit export runbook",
    paragraphs: [
      "Audit exports stream newline-delimited JSON to an object the customer can download for a limited time. Large tenants should slice by day. A single request that tries to hold a month of mailbox events in one response will hit the gateway even if the worker is healthy.",
      "The export includes actor, action, object id, and time. It does not include message bodies. Customers who need bodies export them from the mailbox itself under their own retention rules.",
      "A failed export can be resumed from the last completed hour. Resuming does not duplicate completed hours because the object names include the hour. Deleting an object and rerunning that hour is the way to repair a bad slice.",
      "Compliance teams often compare the export count with the in-product counter. Those counts match when both use the same time zone. The export uses UTC. A local-midnight report will disagree at the edges of the day.",
    ],
  },
  {
    slug: "SANDBOX",
    title: "Sandbox and demonstration tenants",
    paragraphs: [
      "Sandbox tenants are disposable. The reset action deletes tickets, macros, and demo users in that tenant and does not touch production. The confirmation dialog requires the tenant name because the control used to sit too close to the demo-data loader.",
      "Demonstration seeds recreate a scripted matter, a scripted inbox, and a set of sample customers inside the sandbox. They are fiction used for training. They are not account records and they are not contracts.",
      "Sandbox data may be copied from a scrubbed production snapshot when a customer asks for a realistic test. The snapshot drops message bodies and replaces names. It is still not a source of refund authority.",
      "Load tests belong in a sandbox with a separate ingest token. Production tokens that point at a sandbox will drop events. The error is recorded on the token, not on the customer's invoice.",
    ],
  },
  {
    slug: "TAX",
    title: "Tax documents and exemption files",
    paragraphs: [
      "Harbor Billing stores exemption certificates per jurisdiction. A certificate must show the jurisdiction and a taxpayer id that matches the billing profile. A cropped scan that loses the stamp is treated as missing, and the invoice falls back to the default rate.",
      "Tax reversals are invoice corrections. They are not subscription refunds and they do not change the refund handbook. The correcting document references the original invoice id.",
      "Currency exponents live in a table Northstar maintains. A currency with no minor unit must be configured with exponent zero. A wrong exponent misstates amounts on the PDF even when the ledger integer is right.",
      "Credit memos calculate tax from the credited lines. They must not reuse the original invoice tax snapshot when only some lines are credited. Mid-cycle seat changes are the common case.",
    ],
  },
  {
    slug: "SEATS",
    title: "Seat changes and proration",
    paragraphs: [
      "Adding seats mid-cycle bills the new seats for the remaining time at the current plan price. Removing seats credits the unused time at the price the customer actually paid, not at the price of the plan they are moving to.",
      "A downgrade that changes both quantity and plan is two calculations. The unused portion uses the old price and the old quantity. The new portion uses the new price and the new quantity. Mixing those inputs under-credits the customer.",
      "The seat count on an invoice is the count at each change, not a single number for the month. A one-day overlap can appear when a change happens near the invoice boundary. The line dates show the overlap.",
      "Professional services milestones are not seats. They invoice when the milestone is completed. Reopening the task must not clear the invoiced flag. The flag is stored on the milestone id.",
    ],
  },
  {
    slug: "DUNNING",
    title: "Dunning and payment retries",
    paragraphs: [
      "Dunning runs on a tenant schedule. Pausing a mailbox inside the customer's own email system does not pause Northstar. The tenant pause is a setting in Harbor Billing, and it has an end date so a freeze does not run forever.",
      "Capture calls are not retried after a timeout. A timeout can mean the processor captured the payment and lost the response. Retrying can create a second authorization. Voids are used when a second authorization is still open.",
      "Idempotency keys travel with the original attempt and with any retry that is actually safe. A retry without the key is treated as a new attempt. The payment log shows both keys when they differ.",
      "Past-due notices name the invoice and the amount. They do not offer a refund and they do not change a signed window. A customer who wants a commercial exception still needs a signed document.",
    ],
  },
  {
    slug: "RETENTION",
    title: "Retention and legal holds",
    paragraphs: [
      "Retention deletes data that has passed the age on the workspace. A legal hold stops deletion for the workspace named in the hold. A tenant-level interpretation was a defect. Holds do not spill into neighboring workspaces.",
      "The delete job writes a count of removed objects and a count of objects skipped because of a hold. Those counts are the way to see that a hold is scoped correctly. A skipped count of zero on a held workspace means the hold was not applied.",
      "Backups follow a shorter cycle than the customer's retention promise. A backup is not a way for a customer to recover data they asked to delete after the backup has aged out. Support does not restore deleted production data from a backup without a written request from an administrator.",
      "Exports taken before a deletion remain the customer's copy. Northstar does not reach into the customer's object storage to delete those copies. The retention policy describes Northstar's systems only.",
    ],
  },
  {
    slug: "REPORTS",
    title: "Quill report semantics",
    paragraphs: [
      "Quill dimensions keep the fields the event mapping names. A URL dimension that keeps only the host will merge shops that share a host and differ by path. The shop id on the event is the safer dimension when the customer has more than one storefront.",
      "Sampling is a project flag read when the ingest token is issued. A plan upgrade does not reissue the token. Customers who upgrade and still see sampling need a new token before the new rate applies.",
      "Saved reports can expose columns that an old import left in the warehouse. The semantic layer is the control. Removing a column there removes it from previews. Row-level security still applies, including to test books if the test book is in the same dataset.",
      "Report rebuilds for a past month read the archive, not the sampled store, when the archive still has the month. A rebuild changes the report. It does not change an invoice.",
    ],
  },
  {
    slug: "ACCESS",
    title: "Access reviews and offboarding",
    paragraphs: [
      "Offboarding a user is incomplete while rules still name that user. The offboarding report lists inbox rules, escalation steps, and saved reports owned by inactive users. An administrator reassigns them. The report does not reassign them automatically, because the right destination is a local decision.",
      "Escalation policies should show a skipped step as skipped and should not treat the skip as the end of the policy when later steps are still live. A severity-one policy is expected to have two live steps. A weekly check looks for policies that do not.",
      "Session revocation is immediate for the user and does not delete tickets. An analyst who saw a sensitive column in a preview still has whatever they wrote down. The product control is to remove the column and revoke the session. It is not a promise that a person forgot the screen.",
      "Administrator invitations expire. An invitation that is forwarded to a personal mailbox can be accepted by the wrong person if the mailbox is shared. Customers are told to invite a named work account. Northstar does not police the customer's mail routing.",
    ],
  },
];

const AGREEMENTS: {
  n: number;
  customerId: string;
  org: string;
  signer: string;
  product: string;
  days: number;
  fee: number;
  law: string;
  note: string;
}[] = [
  {
    n: 1,
    customerId: "NS-CUST-5101",
    org: "Redcedar Logistics",
    signer: "Helen Cho",
    product: "Harbor Billing",
    days: 14,
    fee: 9600,
    law: "Delaware",
    note: "The freight portal's webhook retention is ninety days of delivery logs and is not a refund period.",
  },
  {
    n: 2,
    customerId: "NS-CUST-5102",
    org: "Marrow & Co",
    signer: "Eliot Marsh",
    product: "Quill Analytics",
    days: 21,
    fee: 7200,
    law: "New York",
    note: "Board reporting packs are a services add-on billed separately from the subscription.",
  },
  {
    n: 3,
    customerId: "NS-CUST-5103",
    org: "Fieldnote Education",
    signer: "Rosa Klein",
    product: "Lumen Desk",
    days: 45,
    fee: 5400,
    law: "Illinois",
    note: "Student records stay in the district's tenant and are not used as demo data.",
  },
  {
    n: 4,
    customerId: "NS-CUST-5104",
    org: "Plover Insurance",
    signer: "Dean Okonkwo",
    product: "Harbor Billing",
    days: 60,
    fee: 11000,
    law: "Connecticut",
    note: "Exemption certificates are the customer's documents. Northstar stores the file the customer uploads.",
  },
  {
    n: 5,
    customerId: "NS-CUST-5105",
    org: "Kindling Health",
    signer: "Amina Farouk",
    product: "Lumen Desk",
    days: 30,
    fee: 8600,
    law: "Massachusetts",
    note: "Audit exports exclude message bodies. The hospital customer of Kindling is not a Northstar customer.",
  },
  {
    n: 6,
    customerId: "NS-CUST-5106",
    org: "Ostara Foods",
    signer: "Chris Pell",
    product: "Harbor Billing",
    days: 30,
    fee: 4300,
    law: "Ohio",
    note: "Seasonal plant shutdowns are handled with the tenant dunning pause, not with a contract amendment.",
  },
  {
    n: 7,
    customerId: "NS-CUST-5107",
    org: "Bramble Transit",
    signer: "Omar Shah",
    product: "Harbor Billing",
    days: 75,
    fee: 15000,
    law: "Texas",
    note: "Implementation milestones are statement-of-work items and are invoiced when completed.",
  },
  {
    n: 8,
    customerId: "NS-CUST-5108",
    org: "Glasshouse Hotels",
    signer: "Lila Berg",
    product: "Lumen Desk",
    days: 30,
    fee: 6100,
    law: "California",
    note: "Lobby display alerts depend on the hotel's firewall allowing Northstar's published egress ranges.",
  },
  {
    n: 9,
    customerId: "NS-CUST-5109",
    org: "Northwind Labs",
    signer: "Kenji Sato",
    product: "Harbor Billing",
    days: 90,
    fee: 13200,
    law: "Washington",
    note: "The Japanese subsidiary is billed in JPY with exponent zero. That currency fact is not a refund window.",
  },
  {
    n: 10,
    customerId: "NS-CUST-5110",
    org: "Ione Retail",
    signer: "Farah Qureshi",
    product: "Harbor Billing",
    days: 120,
    fee: 4800,
    law: "Georgia",
    note: "Mid-cycle seat changes use the price actually paid for the unused portion.",
  },
  {
    n: 11,
    customerId: "NS-CUST-5111",
    org: "Fathom Marine",
    signer: "Lars Nygaard",
    product: "Lumen Desk",
    days: 45,
    fee: 7000,
    law: "Maine",
    note: "Survey attachments above the preview cap are downloaded rather than previewed.",
  },
  {
    n: 12,
    customerId: "NS-CUST-5112",
    org: "Lowland Energy",
    signer: "Pete Navarro",
    product: "Harbor Billing",
    days: 60,
    fee: 18400,
    law: "Colorado",
    note: "Interval files are rated once per meter and interval start. A renamed re-upload is not a second delivery.",
  },
];

function ticketDocument(ticket: Ticket): SourceDocument {
  const id = `DOC-EXT-TCK-${String(ticket.n).padStart(3, "0")}`;
  const thread = [
    `${ticket.opened} 09:14 UTC. ${ticket.contact} at ${ticket.org} wrote to ${ticket.agent}: ${ticket.story}`,
    `${ticket.opened} 11:02 UTC. ${ticket.agent} confirmed the tenant id ${ticket.customerId} and the product ${ticket.product}. The working theory was: ${ticket.cause}`,
    `${ticket.opened} 15:40 UTC. ${ticket.agent} wrote the resolution: ${ticket.fix}`,
    `${ticket.contact} replied that the operators at ${ticket.org} could repeat the steps without Northstar on the call. ${ticket.agent} closed the ticket the next business day and linked the internal change record for ${ticket.product}.`,
    `The thread names ${ticket.org} only. It does not name Brightline Analytics, Avery Chen, or NS-CUST-1042, and it does not grant a refund window to any customer.`,
  ].join("\n\n");
  const postmortem = [
    `Postmortem for ${ticket.org}, tenant ${ticket.customerId}, opened ${ticket.opened}. Author: ${ticket.agent}. Product: ${ticket.product}. Title: ${ticket.title}.`,
    `What the customer experienced: ${ticket.story}`,
    `Why it happened: ${ticket.cause}`,
    `What Northstar changed: ${ticket.fix}`,
    `${ticket.agent} reviewed whether the incident created any signed change for ${ticket.org}. It did not. The support thread, the operator log, and this postmortem are records of an operational event. They are not an amendment, not a replacement for ${ticket.org}'s own agreement, and not a document that can be applied to a different customer id.`,
    `Customer communication stayed with ${ticket.contact}. No other customer's purchase date, elapsed days, or refund window was discussed. A reader who is deciding a refund for a different account should treat this file as unrelated history and should keep checking ownership and effective dates on the documents that actually name that account.`,
    `Residual risk for ${ticket.product}: the same class of mistake could recur if a later change ignores the specific control ${ticket.agent} wrote down for ${ticket.org}. The follow-up is an engineering check on that control, tracked as PM-${ticket.customerId}-${ticket.opened}. It is not a change to the Northstar refund handbook.`,
  ].join("\n\n");

  const timeline = Array.from({ length: 12 }, (_, index) => {
    const hour = 8 + index;
    const facts = [
      `${ticket.product} request id req_${ticket.customerId.toLowerCase()}_${ticket.n}_${index + 1} at ${String(hour).padStart(2, "0")}:1${index} UTC`,
      `actor ${ticket.agent}`,
      `tenant ${ticket.customerId}`,
      index % 4 === 0
        ? `observed: ${ticket.cause}`
        : index % 4 === 1
          ? `customer words from ${ticket.contact}: ${ticket.title}`
          : index % 4 === 2
            ? `change applied for ${ticket.org}: ${ticket.fix}`
            : `status check ${index + 1} for ${ticket.product} returned the post-change error rate for this tenant only`,
    ];
    return facts.join(". ") + ".";
  }).join("\n");

  return {
    id,
    title: `Ticket ${ticket.n}: ${ticket.title}`,
    kind: "conversation",
    customerId: ticket.customerId,
    version: "1",
    effectiveFrom: ticket.opened,
    effectiveTo: ticket.opened,
    status: "active",
    sections: [
      {
        id: `SEC-EXT-TCK-${String(ticket.n).padStart(3, "0")}-THREAD`,
        title: "Conversation",
        text: thread,
      },
      {
        id: `SEC-EXT-TCK-${String(ticket.n).padStart(3, "0")}-LOG`,
        title: "Operator log",
        text: timeline,
      },
      {
        id: `SEC-EXT-TCK-${String(ticket.n).padStart(3, "0")}-PM`,
        title: "Postmortem",
        text: postmortem,
      },
    ],
  };
}

function manualDocument(manual: (typeof MANUALS)[number]): SourceDocument {
  return {
    id: `DOC-EXT-GUIDE-${manual.slug}`,
    title: manual.title,
    kind: "guide",
    customerId: null,
    version: "2026.1",
    effectiveFrom: "2026-01-15",
    effectiveTo: null,
    status: "active",
    sections: manual.paragraphs.map((paragraph, paragraphIndex) => ({
      id: `SEC-EXT-GUIDE-${manual.slug}-${paragraphIndex + 1}`,
      title: `${manual.title}, part ${paragraphIndex + 1}`,
      text: paragraph,
    })),
  };
}

function agreementDocument(agreement: (typeof AGREEMENTS)[number]): SourceDocument {
  const id = `DOC-EXT-AGR-${String(agreement.n).padStart(3, "0")}`;
  const words = [
    "fourteen (14)",
    "twenty-one (21)",
    "thirty (30)",
    "forty-five (45)",
    "sixty (60)",
    "seventy-five (75)",
    "ninety (90)",
    "one hundred twenty (120)",
  ];
  const label =
    words.find((word) => word.includes(`(${agreement.days})`)) ?? `${agreement.days}`;
  return {
    id,
    title: `${agreement.product} agreement, ${agreement.org}`,
    kind: "agreement",
    customerId: agreement.customerId,
    version: "2026-01-15",
    effectiveFrom: "2026-01-15",
    effectiveTo: null,
    status: "active",
    sections: [
      {
        id: `SEC-EXT-AGR-${String(agreement.n).padStart(3, "0")}-PARTIES`,
        title: "Parties",
        text: `This agreement is between Northstar Software, Inc. and ${agreement.signer} for ${agreement.org}, customer ${agreement.customerId}. It covers ${agreement.product}. It is effective on 2026-01-15, governed by the law of ${agreement.law}, and its status is active. It does not name NS-CUST-1042, Avery Chen, or Brightline Analytics. The annual fee on the order is ${agreement.fee} USD.`,
      },
      {
        id: `SEC-EXT-AGR-${String(agreement.n).padStart(3, "0")}-WINDOW`,
        title: "Refund window",
        text: `Customer ${agreement.customerId} may request a refund of its own initial purchase within ${label} days after its own purchase date. This window applies only to ${agreement.customerId}. It does not apply to NS-CUST-1042 or to any other customer. ${agreement.note}`,
      },
      {
        id: `SEC-EXT-AGR-${String(agreement.n).padStart(3, "0")}-SIGN`,
        title: "Signatures",
        text: `Signed for ${agreement.org} by ${agreement.signer} on 2026-01-15. Signed for Northstar Software by Elena Voss, General Counsel, on 2026-01-15. The signature block covers only ${agreement.customerId}.`,
      },
    ],
  };
}

function reviewDocument(ticket: Ticket): SourceDocument {
  const idNumber = String(ticket.n).padStart(3, "0");
  const text = [
    `Operating review of ticket ${ticket.n} for ${ticket.org} (${ticket.customerId}), held the week after ${ticket.opened}. Facilitator: ${ticket.agent}.`,
    `The review restated the customer impact without opening a commercial exception. ${ticket.story}`,
    `The room agreed the cause was local to this tenant and this product. ${ticket.cause}`,
    `The committed repair was the one already written on the ticket. ${ticket.fix}`,
    `${ticket.contact} was the only customer voice in the notes. Nobody suggested copying a term from ${ticket.org} onto another account. The refund handbook was not edited. No amendment was drafted. The review's action item is to confirm the repair is still in place at the next ${ticket.product} operations meeting.`,
    `Archive cross-check: this review should be read next to DOC-EXT-TCK-${idNumber}. If the two disagree, the ticket thread is the contemporaneous record and this review is the later summary. Neither document is a signed agreement.`,
  ].join("\n\n");
  return {
    id: `DOC-EXT-REV-${idNumber}`,
    title: `Operating review ${idNumber}, ${ticket.org}`,
    kind: "historical",
    customerId: ticket.customerId,
    version: "1",
    effectiveFrom: ticket.opened,
    effectiveTo: null,
    status: "active",
    sections: [
      {
        id: `SEC-EXT-REV-${idNumber}`,
        title: `Review of ${ticket.title}`,
        text,
      },
    ],
  };
}

function invoiceDocument(ticket: Ticket): SourceDocument {
  const idNumber = String(ticket.n).padStart(3, "0");
  const base = 1200 + ticket.n * 137;
  const tax = Math.round(base * 0.08);
  const lines = [
    `Invoice INV-${ticket.customerId}-${ticket.opened} for ${ticket.org}.`,
    `Bill to ${ticket.contact}, tenant ${ticket.customerId}. Product family: ${ticket.product}. Invoice date: ${ticket.opened}.`,
    `Line 1. Subscription platform fee, ${base} USD.`,
    `Line 2. Support event related to "${ticket.title}", 0 USD. The event was covered by the subscription and was not billed as a professional-services milestone.`,
    `Line 3. Estimated tax ${tax} USD, pending the certificate on file for ${ticket.org}.`,
    `Amount due ${base + tax} USD. This invoice is an account record for ${ticket.customerId} only. It does not state a refund window, it does not amend any agreement, and it does not mention NS-CUST-1042.`,
    `Collector note: ${ticket.agent} confirmed the operational issue on the ticket was handled without a credit memo, except where the ticket itself records a named correcting entry for this customer. A correcting entry on this invoice, if any, is described in the ticket and stays with ${ticket.org}.`,
  ].join("\n\n");
  return {
    id: `DOC-EXT-INV-${idNumber}`,
    title: `Invoice for ${ticket.org} on ${ticket.opened}`,
    kind: "record",
    customerId: ticket.customerId,
    version: "1",
    effectiveFrom: ticket.opened,
    effectiveTo: null,
    status: "active",
    sections: [
      {
        id: `SEC-EXT-INV-${idNumber}`,
        title: "Invoice lines",
        text: lines,
      },
    ],
  };
}

function buildCorpus(): SourceDocument[] {
  return [
    ...TICKETS.map(ticketDocument),
    ...TICKETS.map(reviewDocument),
    ...TICKETS.map(invoiceDocument),
    ...MANUALS.map(manualDocument),
    ...AGREEMENTS.map(agreementDocument),
  ];
}

function countRequestTokens(): number {
  fs.writeFileSync(OUTPUT, JSON.stringify(buildCorpus(), null, 2));
  const library = loadLibrary();
  const scenario = scenarioById(library, "purchase-45-agreement-exception");
  const customer = customerById(library, scenario.customerId);
  const documents = assembleBundle(library, scenario, "large", "middle");
  const request = buildDecisionRequest(customer, scenario, documents);
  const encoding = getEncoding("o200k_base");
  return encoding.encode(JSON.stringify(request)).length;
}

const tokens = countRequestTokens();
const documents = JSON.parse(fs.readFileSync(OUTPUT, "utf8")) as unknown[];
console.log(
  `Wrote ${documents.length} extended documents to ${OUTPUT}. Estimated full large-bundle request tokens (o200k_base): ${tokens}.`,
);
