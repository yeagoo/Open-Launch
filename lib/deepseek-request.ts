export type DeepSeekThinkingOptions = {
  thinking?: {
    type: "disabled"
  }
}

/**
 * DeepSeek v4 enables thinking by default and counts reasoning tokens against
 * `max_tokens`. These application calls request bounded JSON, translations,
 * or short prose, so hidden reasoning can exhaust the response budget before
 * any `message.content` is emitted. Disable thinking for v4 while leaving
 * legacy/custom models untouched.
 */
export function getDeepSeekThinkingOptions(model: string): DeepSeekThinkingOptions {
  if (/^deepseek-v4(?:-|$)/i.test(model)) {
    return { thinking: { type: "disabled" } }
  }
  return {}
}
