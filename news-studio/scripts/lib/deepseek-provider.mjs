import { DEEPSEEK_ENV } from './news-publish-config.mjs'

const stripCodeFence = (value) =>
  String(value || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

const parseStructuredJson = (value) => {
  const trimmed = stripCodeFence(value)
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  const jsonText = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed
  return JSON.parse(jsonText)
}

export const callDeepSeekJson = async ({
  systemPrompt,
  userPrompt,
  temperature = 0.1,
  maxTokens = 500,
  timeoutMs = DEEPSEEK_ENV.timeoutMs,
}) => {
  if (!DEEPSEEK_ENV.apiKey) {
    return { ok: false, error: 'missing_api_key', data: null }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(DEEPSEEK_ENV.apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_ENV.apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_ENV.model,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!response.ok) {
      return { ok: false, error: `http_${response.status}`, data: null }
    }

    const payload = await response.json()
    const content = payload?.choices?.[0]?.message?.content
    if (!content) {
      return { ok: false, error: 'empty_content', data: null }
    }

    try {
      return { ok: true, error: null, data: parseStructuredJson(content) }
    } catch {
      return { ok: false, error: 'malformed_json', data: null }
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, error: 'timeout', data: null }
    }
    return { ok: false, error: 'request_failed', data: null }
  } finally {
    clearTimeout(timer)
  }
}

