// Which agent wrote a transcript, from its path and first bytes.
export function detectAgent(path, head) {
  if (/"type":"session_meta"|"type":"response_item"/.test(head)) return 'codex';
  if (/^\{"role":"(user|assistant)","message"/m.test(head) || /agent-transcripts/.test(path)) return 'cursor';
  if (/"projectHash"|"\$rewindTo"|"type":"gemini"/.test(head)) return 'gemini';
  return 'claude';
}
