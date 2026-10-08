// ໃຊ້ໃນ dev ເທົ່ານັ້ນ. ຕົວຢ່າງ:
//   pnpm --filter @oca/channels simulate graph 4010          # Graph API ປອມ (ຕັ້ງ FACEBOOK_GRAPH_BASE_URL=http://127.0.0.1:4010)
//   pnpm --filter @oca/channels simulate say U123 "ສະບາຍດີ"   # ລູກຄ້າ U123 ສົ່ງຂໍ້ຄວາມເຂົ້າ API
//   pnpm --filter @oca/channels simulate echo U123 "ຕອບແລ້ວ" # ຮ້ານຕອບຈາກແອັບ Facebook
//   pnpm --filter @oca/channels simulate comment POST_1 U123 "ນາງ ກ" "CF A1 2"  # ລູກຄ້າຄອມເມັ້ນໃນໂພສ/Live POST_1
import { commentPayload, echoPayload, messagePayload } from "./payloads";
import { startFakeGraph } from "./fake-graph";
import { postSignedWebhook } from "./post-webhook";

const [command, ...args] = process.argv.slice(2);
const apiUrl = process.env.SIM_API_URL ?? "http://127.0.0.1:3001";
const pageId = process.env.SIM_PAGE_ID ?? "PAGE_SIM";

function requireSecret(): string {
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!secret) throw new Error("FACEBOOK_APP_SECRET is not set");
  return secret;
}

async function post(payload: object): Promise<void> {
  const response = await postSignedWebhook({ url: `${apiUrl}/webhooks/facebook`, appSecret: requireSecret(), payload });
  console.log(`webhook → ${response.status} ${await response.text()}`);
  if (!response.ok) process.exitCode = 1;
}

async function main(): Promise<void> {
  if (command === "graph") {
    const port = Number(args[0] ?? 4010);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error(`invalid port: ${args[0]} (expected an integer 1-65535)`);
      process.exitCode = 1;
      return;
    }
    const graph = await startFakeGraph({
      port,
      token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || undefined,
      autoProfiles: true,
      onSend: (message) => console.log(`send → ${message.recipientId}: ${message.text}`),
      onCommentReply: (kind, reply) => console.log(`${kind} reply → ${reply.commentId}: ${reply.text}`),
    });
    console.log(`fake Graph API on ${graph.url} (set FACEBOOK_GRAPH_BASE_URL=${graph.url})`);
    return;
  }
  if (command === "comment") {
    const [postId, fromId, fromName, ...commentWords] = args;
    const message = commentWords.join(" ");
    if (postId && fromId && fromName && message) {
      const commentId = `${postId}_sim_${Date.now()}`;
      await post(commentPayload({ pageId, postId, commentId, fromId, fromName, message }));
      return;
    }
  }
  const [psid, ...words] = args;
  const text = words.join(" ");
  if ((command === "say" || command === "echo") && psid && text) {
    const mid = `m_sim_${command}_${Date.now()}`;
    await post(command === "say" ? messagePayload({ pageId, psid, mid, text }) : echoPayload({ pageId, psid, mid, text }));
    return;
  }
  console.log("usage: simulate graph [port] | simulate say <psid> <text> | simulate echo <psid> <text> | simulate comment <postId> <fromId> <name> <text>");
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
