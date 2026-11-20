class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request(path, { method = 'GET', body, signal, pdf = false } = {}) {
  const options = { method, signal }
  if (pdf) options.cache = 'no-store'
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' }
    options.body = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(`/api${path}`, options)
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new ApiError('Il server non è raggiungibile. Controlla che Flask e Vite siano avviati.')
  }

  if (response.status === 204) return null
  if (pdf && response.ok && response.headers.get('Content-Type')?.startsWith('application/pdf')) {
    return { blob: await response.blob(), version: Number(response.headers.get('X-CV-Version')) || null }
  }
  const data = await response.json().catch(() => null)
  if (!response.ok || data === null) {
    throw new ApiError(
      data?.error?.message ?? 'Il server non ha restituito una risposta utilizzabile.',
      response.status,
      data?.error?.code,
    )
  }
  return data
}

export const api = {
  config: signal => request('/config', { signal }),
  cvs: signal => request('/cvs', { signal }),
  cv: (id, signal) => request('/cvs/' + id, { signal }),
  create: body => request('/cvs', { method: 'POST', body }),
  rename: (id, title) => request('/cvs/' + id, { method: 'PATCH', body: { title } }),
  remove: id => request('/cvs/' + id, { method: 'DELETE' }),
  save: (id, content, version) => request('/cvs/' + id + '/content', {
    method: 'PUT', body: { content, expected_version: version },
  }),
  versions: (id, signal) => request('/cvs/' + id + '/versions', { signal }),
  version: (id, number, signal) => request('/cvs/' + id + '/versions/' + number, { signal }),
  restore: (id, number, version) => request('/cvs/' + id + '/versions/' + number + '/restore', {
    method: 'POST', body: { expected_version: version },
  }),
  chat: (id, signal) => request('/cvs/' + id + '/chat', { signal }),
  sendReview: (id, body) => request('/cvs/' + id + '/chat', { method: 'POST', body }),
}
