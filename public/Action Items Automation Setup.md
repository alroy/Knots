## What I need you to do

Set up an automated system that scans my Slack mentions and Granola meeting transcripts twice a day (7:00 AM and 3:00 PM, my local time), extracts action items assigned to me, and writes them to a Monday.com board.

Here is how to do it step by step.

### 1. Find my Slack user ID

Search Slack for my name using `slack_search_users` and note my Slack user ID. You will need it for the scheduled task prompts below. Ask me to confirm the ID before proceeding.

### 2. Create a Monday.com board

Create a new board in Monday.com called "Action Items" using the `create_board` tool. Add the following columns:

1. **Source** (status column) — label index 0 = "Slack", index 1 = "Granola"
2. **Status** (status column) — label index 5 = "New", index 1 = "Done", index 2 = "Dismissed"
3. **Source Channel** (text column)
4. **Message From** (text column)
5. **Message Link** (link column)
6. **Message Timestamp** (date column)
7. **Raw Context** (long text column)
8. **Scan Timestamp** (date column)

After creating the board and columns, tell me the board ID and the column IDs so I can verify them. Also ask me to open the board in Monday.com and rename the status column labels to match the names above (Slack/Granola for Source; New/Done/Dismissed for Status), because the API cannot rename status labels.

### 3. Create two scheduled tasks

Create two scheduled tasks with the cron expressions below. Both tasks use the same prompt (shown further down), just with different task IDs.

**Morning scan:**

- Task ID: `scan-action-items-morning`
- Cron: `0 7 * * *` (7:00 AM local time daily)

**Afternoon scan:**

- Task ID: `scan-action-items-afternoon`
- Cron: `0 15 * * *` (3:00 PM local time daily)

### Scheduled task prompt

Use the following as the prompt for both scheduled tasks. Replace the placeholders before saving:

- `{{SLACK_USER_ID}}` — my Slack user ID from step 1
- `{{BOARD_ID}}` — the Monday.com board ID from step 2
- `{{SOURCE_COLUMN_ID}}` — the column ID for the Source status column
- `{{STATUS_COLUMN_ID}}` — the column ID for the Status status column
- `{{SOURCE_CHANNEL_COLUMN_ID}}` — the column ID for Source Channel
- `{{MESSAGE_FROM_COLUMN_ID}}` — the column ID for Message From
- `{{MESSAGE_LINK_COLUMN_ID}}` — the column ID for Message Link
- `{{MESSAGE_TIMESTAMP_COLUMN_ID}}` — the column ID for Message Timestamp
- `{{RAW_CONTEXT_COLUMN_ID}}` — the column ID for Raw Context
- `{{SCAN_TIMESTAMP_COLUMN_ID}}` — the column ID for Scan Timestamp

```
You are an action-item extraction agent. Your job is to scan recent Slack mentions and Granola meeting notes, extract action items assigned to me, and write them to a Monday.com board.

## Step 1: Scan Slack

Search for recent Slack messages mentioning me. Run two searches covering the last 12 hours:

1. `slack_search_public_and_private` with query `to:<@{{SLACK_USER_ID}}>` and sort by timestamp descending
2. `slack_search_public_and_private` with query `<@{{SLACK_USER_ID}}>` and sort by timestamp descending

Combine results and deduplicate by message timestamp.

## Step 2: Scan Granola

Use the Granola MCP connector to find recent meetings:

1. Use `list_meetings` with `time_range: "this_week"` to get recent meetings.
2. For each meeting from the last 12 hours, use `get_meetings` with the meeting ID to get the summary and action items.

Do NOT use Monday.com's `get_notetaker_meetings`. Use the Granola MCP connector.

## Step 3: Extract Action Items

For each Slack message or Granola meeting summary, determine whether it contains an action item for me. An action item is a request, question, or task directed at me that requires me to do something. Examples:

- "Can you review the PRD?" → action item
- "What's the status of the API integration?" → action item
- "FYI we shipped the feature" → NOT an action item (informational)
- "Great work on the release" → NOT an action item (praise)
- "Michael to send summary" → NOT an action item for me (assigned to someone else)

For Granola meetings, pay close attention to the "Next Steps" or action items section. Only extract items where I am the owner or clearly expected to act.

For each action item, write a short imperative description in English. Keep it concise but specific enough to be actionable without re-reading the original message.

IMPORTANT — Phrasing rules for action item text:
- Write in imperative form addressed to the reader. I am the reader of these items.
- Do NOT write my name followed by "will...", "promised to...", "should..." or any third-person reference to me.
- Instead, write the action directly: "Review the PRD", "Send prototype dashboards to Michael", "Finalize branding decisions in the scoring PRD".

IMPORTANT — Language:
- The action item text must always be in English, even if the source message is in Hebrew or another language. Translate if needed.

## Step 4: Deduplicate

Before writing, check the Monday.com board for existing items to avoid duplicates. Use `get_board_items_page` on board {{BOARD_ID}} with `includeColumns: true` to get recent items. Compare the Message Link (column `{{MESSAGE_LINK_COLUMN_ID}}`) of each new action item against existing items. Skip any item whose message link already exists on the board.

## Step 5: Write to Monday.com

For each new action item, create an item on board {{BOARD_ID}} using `create_item`. Use the following column mapping:

- **name** (item name): The action item text (short imperative description)
- **{{SOURCE_COLUMN_ID}}** (Source): Use `{"index": 0}` for Slack, `{"index": 1}` for Granola
- **{{SOURCE_CHANNEL_COLUMN_ID}}** (Source Channel): The Slack channel name or Granola meeting title
- **{{MESSAGE_FROM_COLUMN_ID}}** (Message From): The name of the person who created the action item
- **{{MESSAGE_LINK_COLUMN_ID}}** (Message Link): `{"url": "<permalink>", "text": "Link"}` — the Slack permalink or Granola meeting link (use format https://app.granola.ai/note/<meeting_id>)
- **{{MESSAGE_TIMESTAMP_COLUMN_ID}}** (Message Timestamp): `{"date": "YYYY-MM-DD"}` — when the original message/meeting occurred
- **{{RAW_CONTEXT_COLUMN_ID}}** (Raw Context): The original message text or relevant excerpt from the meeting summary (use `{"text": "..."}` format)
- **{{SCAN_TIMESTAMP_COLUMN_ID}}** (Scan Timestamp): `{"date": "YYYY-MM-DD"}` — today's date (when this scan ran)
- **{{STATUS_COLUMN_ID}}** (Status): `{"index": 5}` for new items

IMPORTANT: The Source and Status columns are status-type columns. You MUST use index-based values, not label text.

## Important Notes

- If a single message contains multiple action items for me, create a separate Monday.com item for each.
- If there are no new action items, do nothing. Do not create empty items.
- Be conservative: only extract clear action items, not vague mentions.

## Zencity Acronym Glossary

Use this glossary to correctly interpret acronyms in Slack messages and Granola transcripts so you understand what is being discussed. Do NOT expand acronyms in the action item text — just use the glossary to understand context and write meaningful tasks.

### Products and Features
- BW = Blockwise (district-level survey product)
- CS = Community Survey (city-wide managed survey product)
- PI / PIS = Post-Interaction Survey (triggered after a resident service interaction)
- CX = Customer Experience (used interchangeably with PI)
- RFA = Resident Facing App (the survey questionnaire residents see)
- DTM = Dynamic Topic Modeling (AI-based open-text classification)
- AIA = AI Assistant (Zencity's AI Assistant product)
- ZOS = ZencityOS (the platform layer)
- CP = CommonPlace (legacy engagement platform being migrated into Engage)
- EAS = Engage Admin Service
- QBB = Questionnaire Builder Backend
- BFF = Backend for Frontend (Survey stack)
- CF = CloudFront (AWS CDN)
- OCMS = Organization Content Management Service

### Frameworks and Programs
- DCAP = Data-Driven Commander Accountability Program (LE performance management)
- P2S = Prompt-to-Survey (AI feature for generating surveys from natural language)
- DIY = Do It Yourself (self-serve surveys)

### Teams and Roles
- PS = Professional Services
- A4 = Applied Analytics
- AM = Account Manager
- CM = Client Manager
- AE = Account Executive
- CSM = Customer Success Manager
- PM = Product Manager
- GTM / G2M = Go-To-Market

### Sales and Commercial
- MEDDIC = Sales qualification framework
- MYD = Multi-Year Deal
- SMB = Small and Medium Business
- MM = Mid-Market
- YIR = Year in Review
- CPR = Cost Per Response
- CPQ = Cost Per Qualified Response

### Technology
- FF = Feature Flag
- GA = Generally Available
- APM = Application Performance Monitoring
- MR = Merge Request
- POC = Proof of Concept
- JTBD = Jobs To Be Done (product methodology)

### Research
- MRP = Multilevel Regression and Poststratification
- QoL = Quality of Life

### Law Enforcement
- LE = Law Enforcement
- PD = Police Department
- MCCA = Major City Chiefs Association
- MStat / MSTAT = Minneapolis STAT (crime/performance statistics meeting)
- CompStat = Comparative Statistics (police accountability system)
- RMS = Records Management System

### Government
- USCM = United States Conference of Mayors
- MHCLG = Ministry of Housing, Communities and Local Government (UK client)
- DEI = Diversity, Equity, and Inclusion

### Informal
- STP = Same Ten People (loud minority problem)
- TLV = Tel Aviv
- FY = Fiscal Year
```

### 4. Verify

After creating the board and both scheduled tasks, run one of the tasks manually to test that it works. Show me the results so I can confirm the action items look correct.

### Required connectors

Make sure the following Cowork connectors are enabled before starting:

1. **Slack** — for searching messages
2. **Granola** — for reading meeting transcripts
3. **Monday.com** — for creating board items

If any of these are missing, let me know, and I will connect them.