# Sweet Automation — Build Specification

Build **Sweet Automation**, a production-ready sales target and performance management application for **Alma Lasers Israel**. It replaces recurring Excel analysis with a shared system for sales performance, customer follow-up, recommended targets, and management oversight.

The instructions are in English. **The application's user interface must be in Hebrew, with complete right-to-left (RTL) support.**

## 1. Scope

Deliver a functioning full-stack application with persistent data, authentication, authorization, imports, calculations, editing, and exports. Do not stop at a visual mockup.

Do not add unrelated CRM, inventory, billing, messaging, or AI chatbot features. Recommendations in this application are deterministic business rules, not generated sales facts.

Engineering safeguards specified below, such as atomic import activation and explicit backup validation, are build requirements.

## 2. Users and authorization

Support these roles:

- **System administrator**: full access, user and role administration, imports, target management, activity history, and backup export.
- **Sales management and executive management**: visibility across agents, imports, target approval and adjustment, and management oversight.
- **Sales agent**: access only to their own sales, targets, customers, and work items; permitted editing of follow-up fields.

The organization includes Asael as administrator, Hila as sales manager, Benny as executive, and agents Emily, Tamir, Zali, Marvin, and Dor. Treat these as organizational labels. Never invent email addresses, passwords, or user identities. Actual accounts must be securely provisioned and explicitly mapped to roles and agent names.

Use email/password authentication. Enforce authorization on the server and in database row-level security, including direct API access and exports. Hiding controls in the UI is insufficient. Store roles separately from editable profile data and prevent users from granting themselves elevated access.

Protect manager-only fields from agent edits. Unassigned sales are visible to management only.

## 3. Data model and persistence

Keep imported facts separate from operational follow-up data.

Core entities:

- **Import batches**: filename, uploader, upload time, status, coverage period, row counts, validation results, and active-batch designation.
- **Sales facts**: import ID, agent, customer Entity ID, customer name, product, channel, month in `YYYY-MM` format, and quantity.
- **Work items**: agent, customer Entity ID, product, status, agent note, manager note, task, owner, handled date, next follow-up date, last editor, timestamps, and a missing-in-latest flag.
- **Targets**: agent, product, year, recommended value, approved value, approval state, and adjustment reason.
- **Target history** and **work-item history**: actor, timestamp, changed fields, and previous/new values.
- **Profiles** and **user roles**.

The stable work-item key is **agent + Entity ID + product**. The fact key within a batch additionally includes the month.

A new import must never overwrite notes, tasks, owners, statuses, follow-up dates, approved targets, or audit history. Retain work items absent from the latest import and mark them as missing. If an unassigned customer later receives an agent, create the new agent-specific work item while retaining the old one as missing; do not silently transfer its history.

Use database constraints and transactions where appropriate. Do not use browser storage as the primary business database.

## 4. Flexible Excel import wizard

The source workbook, uploaded approximately every two weeks, is the source of truth for sales quantities.

Implement three stages: **workbook scan**, **validation/preview**, and **explicit activation**.

Scan every worksheet and show its name, detected purpose, detected product, row count, inclusion decision, and reason. Classify sales sheets separately from grouped views, summaries, legends, and control sheets. Never silently ignore a worksheet.

Use the consolidated sheet, `כל המוצרים מאוחד`, as the primary source. Cross-check product sheets. A product present only in a separate sheet must still be imported, with a visible notice. **LMNT must be supported even when absent from the consolidated sheet.**

Initially support Hallura, Profhilo, Profhilo Stractura, Aliaxin, SkinkoE, Hdrobooster, and LMNT. Derive product choices from imported data rather than a fixed product list.

Support:

- Header rows below introductory text.
- Header aliases and whitespace/invisible-character normalization.
- Customer ID headers such as `Entity Id`, `מזהה`, and `לקוח`, with preview-based confirmation of ambiguous mappings.
- Month columns using `YYYY-MM`, `MM/YYYY`, Excel dates, or repeated 1–12 blocks associated with year headers.
- Product inference from a product worksheet name.
- Numeric quantities stored as text.
- Exclusion of annual totals and summary rows from monthly facts.
- Manual mapping when detection is uncertain, with reusable mappings.

Deduplicate overlapping consolidated/product-sheet facts by agent + Entity ID + product + month. Conflicting quantities must be reported and resolved explicitly; never silently sum duplicate representations or choose arbitrarily.

When an agent is blank but customer ID and product are valid, use **`ללא סוכן`** ("no agent"). Show the affected row count and provide an export for review. Do not reject an otherwise valid row solely because its agent is blank.

Preview products, agents, periods, accepted/rejected rows, reasons, unassigned records, new entities, changes from the active import, and work-item preservation counts. Provide a rejected-row export.

Stage uploads separately. Keep the previous batch active until validation and explicit confirmation succeed. Activate atomically so an interrupted upload cannot expose partial data. Re-uploading the same data must not double-count quantities.

Do not invent rules for ambiguous negative quantities or returns. Preserve source evidence, flag the ambiguity, and obtain the necessary business rule before using it to redefine purchase activity.

## 5. Calculation engine

Measure performance in **units**, not currency.

Use the latest month represented in the active workbook as the sales-data cutoff, not today's date. Years must come from the data rather than being hardcoded.

Allow selection of analysis year, comparison year, full year, quarter, or custom month range. Separate period-based performance from full-year targets.

Baseline rules:

- **Previous-period quantity**: units in the selected months of the comparison year.
- **Current-period quantity**: units in the selected months of the analysis year.
- **Previous monthly average**: previous-period quantity divided by the selected comparison-window month count.
- **Current monthly average**: current-period quantity divided by the months elapsed within the selected window, based on the source cutoff.
- **Pace change**: current monthly average / previous monthly average − 1. If the previous average is zero, display *unavailable* rather than an invented percentage.
- **Recommended annual target**: full comparison-year units × 1.15, rounded to two decimals.
- **Remaining units**: max(0, recommended annual target − full analysis-year units), rounded to two decimals.
- **Required monthly pace**: remaining units / months left in the analysis year, rounded to one decimal. When no months remain, do not divide by zero; show that the year has ended.
- Full-year target calculations must not change when only the displayed month range changes.

Apply customer groups in this order:

1. **`נעלם`** (disappeared): previous-period quantity > 0 and current-period quantity = 0.
2. **`חדש/חוזר`** (new/returning): previous-period quantity = 0 and current-period quantity > 0.
3. **`ירד`** (declined): previous-period quantity > 0 and current average < 80% of previous average.
4. **`עלה`** (grew): previous-period quantity > 0 and current average > 105% of previous average.
5. **`יציב`** (stable): otherwise.

Priority score:

- Size component = min(1, previous-period quantity / 300).
- Decline component = min(1, max(0, −pace change)); use 0 if pace change is unavailable.
- Recency component = min(1, months since last purchase / 6); use 1 when purchase history is unavailable.
- Score = round(100 × (0.50 × size + 0.30 × decline + 0.20 × recency)).
- High priority: 60–100; medium: 30–59; low: below 30.

Show the calculation definitions in a Hebrew field guide. Edge cases concerning last purchase and non-positive quantities must be decided explicitly and documented; do not leave them implicit.

Generate task suggestions in this order: contact disappeared customers; retention meeting for declining customers; stock/reorder check after a gap of at least three months; onboarding and cross-sell for new/returning customers; target-completion follow-up where applicable; otherwise routine follow-up. A manually entered task takes precedence.

Distinguish recommended targets from manager-approved targets. Label which target drives each KPI. Do not mix filtered-period quantities with annual target attainment without explicit labeling.

## 6. Screens

### Management dashboard

Display total units, sales against applicable targets, attainment, remaining units, required pace, year comparison, monthly trends, and product breakdowns. Provide an agent table with target attainment, trend, and declining/disappeared customer counts. Open an agent detail view when an agent is selected.

Include unassigned sales in total business sales. Show them separately and exclude them from agent rankings, automatic agent targets, and agent-attainment calculations.

Make LMNT and newly imported products available in dashboard breakdowns and filters.

### Agent dashboard

Show personal targets, actual units, remaining units, required pace, product breakdown, monthly comparison, and a prioritized customer follow-up list. Enforce access to the logged-in agent's records only.

### Work list

Show customer, Entity ID, agent, product, group, period quantities, monthly averages, pace change, purchase recency, recommended target, remaining units, required pace, priority, task, status, notes, owner, and follow-up dates.

Statuses: `טרם טופל`, `בטיפול`, `נוצר קשר`, `הושלם`, `לא רלוונטי`.

Allow permitted inline edits with saved/error feedback. Flag overdue follow-ups only when the follow-up date has passed and the status is neither completed nor irrelevant.

Provide search, sorting, filtered export, and filters for agent, product, analysis/comparison year, month range, status, priority, multiple groups, and multiple activity years.

Multiple activity years filter rows with positive activity in any selected year. They must not merge years or redefine the analysis/comparison calculations. An empty selection means no additional activity-year restriction.

Follow-up filters:

- All.
- Next 7 days, starting today.
- From today through the end of this month.
- From today through the end of this quarter.

Exclude undated follow-ups when a date window is selected. Keep overdue items accessible through their separate filter. Reset clears all filters, and the visible row count reflects the complete filter combination.

### Targets

Show recommended targets by agent/product/year. Let managers approve or adjust targets, require a reason for manual changes, and keep immutable change history.

### Activity history

Show authorized target and work-item changes with actor, time, and previous/new values.

### Import history and user administration

Show batch statuses and validation outcomes. Provide administrator-only account-role and agent mapping management.

### Backup

Provide administrator-only JSON and Excel exports of imports, sales facts, work items, targets, target history, work-item history, profiles, and roles. Fetch all pages of data, not just a default query limit. Include schema/version metadata, export timestamp, and table row counts.

Clearly distinguish an application-data export from a complete system backup. Do not claim it includes authentication credentials, uploaded source files, database functions, or platform-managed backups unless verified.

Provide accurate restoration instructions. Do not display a working restore button unless restoration is implemented and tested. Any future restoration must validate compatibility and references, preview changes, and require explicit confirmation before replacing data.

## 7. Interface and technical quality

Use a restrained, professional enterprise interface, Hebrew navigation and labels, complete RTL, readable typography, clear KPI cards, accessible status indicators, sticky table headers, responsive layouts, and deliberate loading/empty/error states.

Use a TypeScript React front end with Tailwind CSS, and PostgreSQL (Supabase) for persistence and authentication.

Keep database secrets server-side. Check permissions for every server operation. Validate uploaded data on the server. Use pagination for large datasets and prevent exports from bypassing permissions.

Display real imported data. If demonstration data is needed during development, keep it clearly labeled and isolated from production. Do not fabricate customer records, results, import success, or integrations.

## 8. Acceptance criteria

Verify with concrete tests:

1. Import a workbook with consolidated and overlapping product sheets without double-counting.
2. Import LMNT from its separate sheet when missing from the consolidated sheet.
3. Import valid blank-agent rows as `ללא סוכן`.
4. Re-import without losing notes, tasks, statuses, dates, approved targets, or history.
5. Retain and flag work items absent from a later import.
6. Confirm that interrupted or invalid imports leave the previous active dataset available.
7. Reconcile dashboard totals and product breakdowns to accepted source facts.
8. Test target formulas, classification boundaries, zero denominators, and year-end behavior.
9. Confirm year/group/follow-up filters combine correctly without redefining comparison metrics.
10. Verify that an agent cannot read or edit another agent's records through direct API requests or exports.
11. Verify persistence after refresh and re-login.
12. Verify backup row counts and completeness beyond a single query page.
13. Inspect Hebrew RTL on desktop and mobile and resolve build/type errors.

## 9. Execution and handover

Start with a concise implementation plan, then implement in stages: data/authentication, import pipeline, calculations, dashboards/work lists, targets/history, administration/backup, and verification.

Resolve routine implementation choices independently. Ask only when a missing source file, identity mapping, or business rule materially prevents a correct implementation. Keep any blocked requirement explicit and continue independent work.

Conclude with what was implemented, tests actually run and their results, remaining limitations, and exact setup requirements. Never report untested functionality as verified. Leave the application ready for review before public deployment.
