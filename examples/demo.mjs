// Builds the site's replay pages: docs/demo/ plays a made-up but realistic
// Claude Code session in a fictional shop codebase, docs/v/ is the share viewer.
//
//   npm run site

import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { loadSession, renderHtml, renderViewer } from '../src/index.js';

const CWD = '/home/dev/tinyshop';
const start = Date.parse('2026-03-03T14:02:00Z');
let clock = 0;
let n = 0;
const rows = [{ type: 'custom-title', customTitle: 'Webhook retries fulfilled orders twice' }];
const at = (sec) => new Date(start + (clock += sec) * 1000).toISOString();
const base = () => ({ cwd: CWD, gitBranch: 'fix/webhook-idempotency', version: '2.1.300', sessionId: 'demo' });

function you(sec, text) {
  rows.push({ ...base(), type: 'user', timestamp: at(sec), message: { role: 'user', content: text } });
}
let context = 18000;
const usage = (out) => { context += 900 + out * 2; return { input_tokens: 4, cache_read_input_tokens: context, cache_creation_input_tokens: 600, output_tokens: out }; };
function say(sec, text) {
  rows.push({ ...base(), type: 'assistant', timestamp: at(sec), message: { id: `msg_${++n}`, model: 'claude-opus-5-5', role: 'assistant', content: [{ type: 'text', text }], usage: usage(Math.round(text.length / 3.5)) } });
}
function tool(sec, name, input, output, { took = 2, error = false } = {}) {
  const id = `toolu_${++n}`;
  rows.push({ ...base(), type: 'assistant', timestamp: at(sec), message: { id: `msg_${id}`, model: 'claude-opus-5-5', role: 'assistant', content: [{ type: 'tool_use', id, name, input }], usage: usage(Math.round(JSON.stringify(input).length / 3.5) + 40) } });
  rows.push({ ...base(), type: 'user', timestamp: at(took), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: output, is_error: error }] } });
}
const plan = (sec, statuses) => tool(sec, 'TodoWrite', {
  todos: ['Find where payment webhooks are handled', 'Reproduce the double fulfillment in a test', 'Make the handler safe to run twice', 'Run typecheck and the full suite']
    .map((content, i) => ({ content, status: statuses[i] })),
}, 'Todos updated', { took: 1 });
const numbered = (code) => code.split('\n').map((l, i) => `${String(i + 1).padStart(6)}\t${l}`).join('\n');

// ---------------------------------------------------------------------------

you(0, 'Customers are getting two order confirmation emails, and stock drops by 2 for a single purchase. It started after we moved webhooks to the new payments provider. Can you find out why and fix it?');
say(5, "I'll start with the webhook handler and follow it into fulfillment.");
plan(3, ['in_progress', 'pending', 'pending', 'pending']);

tool(4, 'Grep', { pattern: 'payment.succeeded', output_mode: 'content' }, [
  'src/webhooks/payments.ts:11:  if (event.type === "payment.succeeded") {',
  'src/webhooks/payments.test.ts:24:      type: "payment.succeeded",',
  'docs/webhooks.md:31:`payment.succeeded` is delivered at least once. The provider retries any delivery that is not answered within 10 seconds.',
].join('\n'));

const handler = `import { Router } from "express";
import { verifySignature } from "../payments/signature";
import { fulfillOrder } from "../orders/fulfill";

export const payments = Router();

payments.post("/webhooks/payments", async (req, res) => {
  const event = verifySignature(req);
  if (!event) return res.status(400).send("bad signature");

  if (event.type === "payment.succeeded") {
    await fulfillOrder(event.data.orderId);
  }

  res.sendStatus(200);
});`;
tool(6, 'Read', { file_path: `${CWD}/src/webhooks/payments.ts` }, numbered(handler), { took: 1 });

tool(5, 'Read', { file_path: `${CWD}/src/orders/fulfill.ts` }, numbered(`import { db } from "../db";
import { email } from "../email";

export async function fulfillOrder(orderId: string) {
  const order = await db.orders.find(orderId);
  await db.inventory.decrement(order.items);
  await email.send("order-confirmed", order.customer, { order });
  await db.orders.update(orderId, { status: "paid" });
}`), { took: 1 });

say(22, `Found it. The provider delivers \`payment.succeeded\` **at least once** and retries when we don't answer within 10 seconds. The handler only answers after \`fulfillOrder\` is done, and that sends an email and calls the inventory service, which can take longer than 10 seconds.

So the retry arrives while the first call is still running, and nothing stops it from fulfilling the same order again. That's the second email and the second stock decrement.

I'll reproduce it in a test before changing anything.`);
plan(2, ['completed', 'in_progress', 'pending', 'pending']);

tool(14, 'Edit', {
  file_path: `${CWD}/src/webhooks/payments.test.ts`,
  old_string: 'describe("payment webhooks", () => {',
  new_string: `describe("payment webhooks", () => {
  it("fulfills an order once when the same event is delivered twice", async () => {
    const event = paymentSucceeded({ id: "evt_123", orderId: "ord_42" });
    await Promise.all([post("/webhooks/payments", event), post("/webhooks/payments", event)]);
    expect(fulfillOrder).toHaveBeenCalledTimes(1);
  });
`,
}, 'The file src/webhooks/payments.test.ts has been updated successfully.', { took: 1 });

tool(4, 'Bash', { command: 'npm test -- webhooks', description: 'Run the webhook tests' }, ` FAIL  src/webhooks/payments.test.ts
  payment webhooks
    ✓ rejects a bad signature (4 ms)
    ✓ fulfills an order on payment.succeeded (11 ms)
    ✕ fulfills an order once when the same event is delivered twice (9 ms)

  ● payment webhooks › fulfills an order once when the same event is delivered twice

    expect(jest.fn()).toHaveBeenCalledTimes(expected)

    Expected number of calls: 1
    Received number of calls: 2

Tests:       1 failed, 2 passed, 3 total`, { took: 7, error: true });

say(9, "Reproduced. The handler has to remember which events it already handled, and the check has to be atomic, or two deliveries arriving together both pass it. A primary key on the event id gives us that for free: only one insert can win.");
plan(2, ['completed', 'completed', 'in_progress', 'pending']);

tool(18, 'Write', {
  file_path: `${CWD}/migrations/0042_processed_events.sql`,
  content: `-- Payment events we have already handled. The primary key makes a
-- second delivery of the same event fail to insert.
CREATE TABLE processed_events (
  event_id     text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);
`,
}, 'File created successfully at: migrations/0042_processed_events.sql', { took: 1 });

tool(12, 'Edit', {
  file_path: `${CWD}/src/webhooks/payments.ts`,
  old_string: `  if (event.type === "payment.succeeded") {
    await fulfillOrder(event.data.orderId);
  }`,
  new_string: `  if (event.type === "payment.succeeded") {
    // Deliveries are at-least-once. Claim the event id first so a retry
    // that arrives mid-fulfillment does nothing.
    const claimed = await db.processedEvents.insertIfAbsent(event.id);
    if (claimed) await fulfillOrder(event.data.orderId);
  }`,
}, 'The file src/webhooks/payments.ts has been updated successfully.', { took: 1 });

tool(5, 'Edit', {
  file_path: `${CWD}/src/webhooks/payments.ts`,
  old_string: 'import { fulfillOrder } from "../orders/fulfill";',
  new_string: 'import { fulfillOrder } from "../orders/fulfill";\nimport { db } from "../db";',
}, 'The file src/webhooks/payments.ts has been updated successfully.', { took: 1 });

tool(4, 'Bash', { command: 'npm test -- webhooks' }, ` PASS  src/webhooks/payments.test.ts
  payment webhooks
    ✓ rejects a bad signature (4 ms)
    ✓ fulfills an order on payment.succeeded (10 ms)
    ✓ fulfills an order once when the same event is delivered twice (8 ms)

Tests:       3 passed, 3 total`, { took: 6 });

tool(3, 'Bash', { command: 'npm run typecheck' }, `> tinyshop@1.8.0 typecheck
> tsc --noEmit

src/webhooks/payments.ts(15,40): error TS2339: Property 'processedEvents' does not exist on type 'Database'.`, { took: 9, error: true });

say(6, "The test passes because it mocks the database, but the typed client doesn't know about the new table yet. Adding it there.");

tool(14, 'Edit', {
  file_path: `${CWD}/src/db/index.ts`,
  old_string: `  orders: table<Order>("orders"),
  inventory: inventoryClient,`,
  new_string: `  orders: table<Order>("orders"),
  inventory: inventoryClient,
  processedEvents: {
    // true if this call inserted the id, false if it was already there
    insertIfAbsent: async (eventId: string) =>
      (await sql\`INSERT INTO processed_events (event_id) VALUES (\${eventId})
                 ON CONFLICT DO NOTHING RETURNING event_id\`).length > 0,
  },`,
}, 'The file src/db/index.ts has been updated successfully.', { took: 1 });

plan(2, ['completed', 'completed', 'completed', 'in_progress']);
tool(3, 'Bash', { command: 'npm run typecheck && npm test' }, `> tinyshop@1.8.0 typecheck
> tsc --noEmit

 PASS  src/webhooks/payments.test.ts
 PASS  src/orders/fulfill.test.ts
 PASS  src/cart/pricing.test.ts
 PASS  src/cart/abandoned.test.ts
 PASS  src/jobs/worker.test.ts

Test Suites: 14 passed, 14 total
Tests:       148 passed, 148 total
Time:        6.214 s`, { took: 16 });
plan(2, ['completed', 'completed', 'completed', 'completed']);

say(8, `Fixed. Each payment event is now handled once, even when two deliveries arrive at the same moment.

| File | Change |
|---|---|
| \`src/webhooks/payments.ts\` | claims the event id before fulfilling |
| \`src/db/index.ts\` | \`processedEvents.insertIfAbsent\` |
| \`migrations/0042_processed_events.sql\` | new table, event id as primary key |
| \`src/webhooks/payments.test.ts\` | regression test for a repeated delivery |

One thing is left: the handler still answers only after fulfillment finishes, so slow emails keep triggering retries. They are harmless now, but they add load and noise in the provider's dashboard.`);

you(95, 'yes, make it answer right away');
say(4, "I'll acknowledge the webhook first and hand fulfillment to the existing job queue.");

tool(3, 'Grep', { pattern: 'enqueue\\(', output_mode: 'content' }, [
  'src/jobs/queue.ts:8:export async function enqueue<T>(name: string, payload: T) {',
  'src/cart/abandoned.ts:21:  await enqueue("cart-reminder", { cartId });',
].join('\n'));

tool(10, 'Edit', {
  file_path: `${CWD}/src/webhooks/payments.ts`,
  old_string: `    if (claimed) await fulfillOrder(event.data.orderId);
  }

  res.sendStatus(200);`,
  new_string: `    if (claimed) await enqueue("fulfill-order", { orderId: event.data.orderId });
  }

  // Answer inside the provider's 10 s window; the worker does the slow part.
  res.sendStatus(200);`,
}, 'The file src/webhooks/payments.ts has been updated successfully.', { took: 1 });

tool(4, 'Edit', {
  file_path: `${CWD}/src/webhooks/payments.ts`,
  old_string: 'import { fulfillOrder } from "../orders/fulfill";',
  new_string: 'import { enqueue } from "../jobs/queue";',
}, 'The file src/webhooks/payments.ts has been updated successfully.', { took: 1 });

tool(6, 'Edit', {
  file_path: `${CWD}/src/jobs/worker.ts`,
  old_string: `const handlers = {
  "cart-reminder": ({ cartId }) => sendCartReminder(cartId),`,
  new_string: `const handlers = {
  "cart-reminder": ({ cartId }) => sendCartReminder(cartId),
  "fulfill-order": ({ orderId }) => fulfillOrder(orderId),`,
}, 'The file src/jobs/worker.ts has been updated successfully.', { took: 1 });

tool(5, 'Edit', {
  file_path: `${CWD}/src/webhooks/payments.test.ts`,
  old_string: '    expect(fulfillOrder).toHaveBeenCalledTimes(1);',
  new_string: '    expect(enqueue).toHaveBeenCalledTimes(1);\n    expect(enqueue).toHaveBeenCalledWith("fulfill-order", { orderId: "ord_42" });',
}, 'The file src/webhooks/payments.test.ts has been updated successfully.', { took: 1 });

tool(3, 'Bash', { command: 'npm run typecheck && npm test' }, `> tinyshop@1.8.0 typecheck
> tsc --noEmit

Test Suites: 14 passed, 14 total
Tests:       148 passed, 148 total
Time:        5.987 s`, { took: 15 });

tool(4, 'Bash', { command: 'git add -A && git commit -m "Handle each payment event once and fulfill orders in the worker"' }, `[fix/webhook-idempotency 3e1a9c2] Handle each payment event once and fulfill orders in the worker
 5 files changed, 34 insertions(+), 4 deletions(-)
 create mode 100644 migrations/0042_processed_events.sql`, { took: 1 });

say(6, `Committed on \`fix/webhook-idempotency\`. The webhook now answers in a few milliseconds, each event is fulfilled once, and the slow work runs in the worker.

Before you deploy, run migration \`0042\`. The handler expects the \`processed_events\` table to exist.`);

// ---------------------------------------------------------------------------

const jsonlPath = new URL('./demo-session.jsonl', import.meta.url);
writeFileSync(jsonlPath, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

const { session } = loadSession(jsonlPath);
const site = 'https://tojacob03.github.io/agentvcr/';
const social = (html, url) => html.replace('<meta name="description"', [
  `<meta property="og:image" content="${site}social.png">`,
  `<meta property="og:url" content="${url}">`,
  '<meta name="twitter:card" content="summary_large_image">',
  `<meta name="twitter:image" content="${site}social.png">`,
  '<meta name="description"',
].join('\n'));

const write = (rel, html) => {
  const url = new URL(`../docs/${rel}`, import.meta.url);
  mkdirSync(new URL('.', url), { recursive: true });
  writeFileSync(url, html);
};
write('demo/index.html', social(renderHtml(session), `${site}demo/`));
write('v/index.html', social(renderViewer(), `${site}v/`));

// The parsers are plain modules with no Node APIs, so the landing page can
// play a dropped transcript without uploading it.
for (const f of ['session', 'claude', 'codex', 'cursor', 'gemini', 'redact', 'detect', 'parse']) {
  const to = new URL(`../docs/lib/${f}.js`, import.meta.url);
  mkdirSync(new URL('.', to), { recursive: true });
  copyFileSync(new URL(`../src/${f}.js`, import.meta.url), to);
}
console.log(`docs/demo: ${session.events.length} events, ${session.stats.tools} tool calls, ${session.stats.files} files changed; docs/v: share viewer`);
