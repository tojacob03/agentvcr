// Which agent wrote a transcript, from its path and first bytes.
export function detectAgent(path, head) {
  if (/"type":"session_meta"|"type":"response_item"/.test(head)) return 'codex';
  if (/\.aider\.chat\.history\.md$/.test(path) || /^# aider chat started at /m.test(head)) return 'aider';
  // Cline: ui_messages.json (a list of {ts, type: say|ask}) or an SDK <id>.messages.json.
  if (/ui_messages\.json$|\.messages\.json$/.test(path) || /^\s*\[\s*\{\s*"ts"\s*:\s*\d+\s*,\s*"type"\s*:\s*"(say|ask)"/.test(head) || /^\s*\{\s*"version"\s*:\s*1\s*,\s*"updated_at"\s*:/.test(head)) return 'cline';
  if (/^\{"role":"(user|assistant)","message"/m.test(head) || /agent-transcripts/.test(path)) return 'cursor';
  // Claude Code SDK and GitHub Action runs: a JSON array of messages with session_id.
  if (/^\s*\[/.test(head) && /"session_id"\s*:/.test(head)) return 'claude-sdk';
  // OpenCode exports are one JSON document that opens with its session info or
  // message list. (Claude Code lines also carry msg_ ids, so the ids alone are no sign.)
  if (/^\s*\{\s*"(info|session|messages)"\s*:/.test(head) || (/^\s*\[/.test(head) && /"id"\s*:\s*"msg_/.test(head))) return 'opencode';
  if (/"projectHash"|"\$rewindTo"|"type":"gemini"/.test(head)) return 'gemini';
  // Qwen Code records look like Claude Code's, but their messages carry Gemini parts.
  if (/"message":\{"role":"(user|model)","parts":\[/.test(head) || /[\\/]\.qwen[\\/]projects[\\/]/.test(path)) return 'qwen';
  return 'claude';
}
