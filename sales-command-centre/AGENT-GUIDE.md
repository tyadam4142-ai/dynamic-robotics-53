# Working with the AI agent

The agent is not a chatbot bolted on the side — it operates the same backend the buttons use, through 35 registered tools with input validation, permission tiers and an audit log.

## What to expect

- **It says what it did.** Every reply that changed something includes a trace: which tools ran and what they returned. If a tool failed, the trace says so.
- **It asks before consequential actions.** Sending a real message, starting an AI voice call, deleting a customer, starting a big campaign — these park on the **Approvals** page until you approve or reject them (when "require approval" is on, which is the default).
- **It never invents.** Prices and product facts come only from the Products page. If something is not in the catalogue, the agent says the team must confirm it.
- **It is honest about calling.** It knows a Mac cannot put AI audio on a cellular call. It will offer the native dialer + live voice console, or a provider AI call if configured — and say plainly when neither is available.

## Good instructions

| You type | What happens |
|---|---|
| "Prioritise my leads" | Scores and lists leads with reasons |
| "Queue a follow-up task for every Interested lead" | Creates real follow-up tasks |
| "Draft a WhatsApp follow-up for the Tap Tag Card" | Drafts from the catalogue; does not send |
| "Check the calling setup" | Reports exactly which credentials are missing |
| "Create a re-engagement campaign for cold leads" | Builds a draft campaign (approval if >10 contacts) |
| "What did we do for Asha Patel?" | Reads the customer timeline |

## Limits, on purpose

- No shell, no filesystem, no raw database access for the AI.
- The agent can turn the **kill switch on** (if told something is wrong) but can never turn it off.
- If no model is reachable, the agent uses built-in catalogue-aware rules and labels its replies as such — it does not silently pretend a big model answered.

## Privacy switch

Settings → AI model → "Allow customer data to leave this Mac". Off by default: cloud providers (if you add any) receive generic prompts with no customer details. Local Ollama always receives full context because it never leaves your machine.


## Daya local voice agent (v0.9.0)

- One short answer per customer turn; no repeat greetings, sales filler, or unsolicited product pitch after a simple acknowledgement.
- Product prices and supported details come from the active local catalogue. Website Development is explicitly a starting price. Technical E-Adapter specifications are not confirmed yet.
- When you fill a new contact name and phone in Calls & Voice, leaving the field saves it to the local CRM automatically. Quick-save never launches a call or sends a message. Duplicate phone/email entries reuse the existing record.
- The agent attempts barge-in interruption with microphone voice-activity sensing plus browser recognition. Use **Stop speech** as a fallback; type the words when speech recognition is unavailable.
- Contact saving is not consent. Explicitly confirm only when appropriate; opt-outs remain blocked. The agent is not connected directly to live phone or WhatsApp call audio in local mode.
