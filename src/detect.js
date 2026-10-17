// Which agent wrote a transcript, from its path and first bytes.
export function detectAgent(path, head) {
  if (/"type":"session_meta"|"type":"response_item"/.test(head)) return 'codex';
  if (/^\{"role":"(user|assistant)","message"/m.test(head) || /agent-transcripts/.test(path)) return 'cursor';
  // Claude Code SDK and GitHub Action runs: a JSON array of messages with session_id.
  if (/^\s*\[/.test(head) && /"session_id"\s*:/.test(head)) return 'claude-sdk';
  // OpenCode exports are one JSON document that opens with its session info or
  // message list. (Claude Code lines also carry msg_ ids, so the ids alone are no sign.)
  if (/^\s*\{\s*"(info|session|messages)"\s*:/.test(head) || (/^\s*\[/.test(head) && /"id"\s*:\s*"msg_/.test(head))) return 'opencode';
  if (/"projectHash"|"\$rewindTo"|"type":"gemini"/.test(head)) return 'gemini';
  return 'claude';
}
