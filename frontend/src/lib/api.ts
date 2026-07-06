import axios, { AxiosError } from 'axios'

// Access token lives only in memory (never in localStorage) to reduce XSS impact.
// A httpOnly refresh cookie keeps the session across page reloads.
let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

// Same-origin '/api' by default (Vite dev proxy, or nginx reverse proxy in docker-compose).
// Baked in at build time via VITE_API_BASE_URL when the frontend and backend are deployed
// as separate origins (e.g. Railway) and the browser must call the backend directly.
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

export const api = axios.create({ baseURL: API_BASE, withCredentials: true })

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

let refreshPromise: Promise<string | null> | null = null

async function tryRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE}/auth/refresh`, null, { withCredentials: true })
      .then((res) => {
        const token = res.data.access_token as string
        setAccessToken(token)
        return token
      })
      .catch(() => {
        setAccessToken(null)
        return null
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as typeof error.config & { _retried?: boolean }
    if (error.response?.status === 401 && original && !original._retried &&
        !original.url?.includes('/auth/login') && !original.url?.includes('/auth/refresh')) {
      original._retried = true
      const token = await tryRefresh()
      if (token) {
        original.headers = original.headers ?? {}
        original.headers.Authorization = `Bearer ${token}`
        return api.request(original)
      }
      window.dispatchEvent(new CustomEvent('auth:expired'))
    }
    return Promise.reject(error)
  },
)

export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: unknown })?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail.map((d: { msg?: string }) => d.msg ?? 'Validation error').join('; ')
    }
    return error.message
  }
  return 'Unexpected error'
}

export { tryRefresh }
