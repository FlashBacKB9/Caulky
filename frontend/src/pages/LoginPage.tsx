import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getPublicSettings } from '../api/admin'
import { useNavigate } from 'react-router-dom'
import { Wallet, Eye, EyeOff, FlaskConical, Server } from 'lucide-react'
import { login, register, getMe, claimData, setupDemo } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import { queryClient } from '../App'
import { t, BUILT_IN_LANGS, getLanguage, setLanguage } from '../utils/i18n'
import api from '../api/client'
import { apiBase, getServerUrl, isNative, setServerUrl } from '../offline/platform'
import { onLoggedIn } from '../offline/session'
import { probe } from '../offline/connectivity'

export default function LoginPage() {
  const { setUser } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  // APK: dirección del servidor de Caulky (en la web es el propio origen)
  const [server, setServer] = useState(getServerUrl())
  const [serverApplied, setServerApplied] = useState(getServerUrl())
  async function applyServer() {
    setServerUrl(server)
    api.defaults.baseURL = apiBase()
    setServer(getServerUrl())
    setServerApplied(getServerUrl())
    await probe()
  }
  // Con el registro cerrado solo queda la pestaña de entrar (el modo test sigue disponible)
  const { data: publicSettings } = useQuery({
    queryKey: ['public-settings', serverApplied], queryFn: getPublicSettings, retry: false,
    enabled: !isNative || !!serverApplied,
  })
  const registrationOpen = publicSettings?.registration_open ?? true
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [activeLang, setActiveLang] = useState(getLanguage())

  function handleLangChange(id: string) {
    setActiveLang(id)
    setLanguage(id)
  }

  async function handleDemo() {
    setError('')
    setDemoLoading(true)
    try {
      if (isNative) await applyServer()
      const creds = await setupDemo()
      await login(creds.email, creds.password)
      queryClient.clear()
      const u = await getMe()
      await onLoggedIn(u.id)
      setUser(u)
      navigate('/', { replace: true })
    } catch {
      setError('No se pudo cargar el modo demo. Inténtalo de nuevo.')
    } finally {
      setDemoLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isNative) await applyServer()
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password, name || undefined)
        await login(email, password)
      }
      queryClient.clear()
      const u = await getMe()
      await onLoggedIn(u.id)
      await claimData().catch(() => {})
      setUser(u)
      navigate('/', { replace: true })
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      const status = err?.response?.status
      if (isNative && !err?.response) setError('No se pudo conectar con el servidor. Revisa la dirección y que estés en la misma red.')
      else if (status === 429) setError(t('auth.errorTooMany'))
      else if (mode === 'register' && status === 403) setError(t('auth.registrationClosed'))
      else if (detail === 'LOGIN_BAD_CREDENTIALS') setError(t('auth.errorCredentials'))
      else if (detail === 'REGISTER_USER_ALREADY_EXISTS') setError(t('auth.errorExists'))
      else if (mode === 'register') setError(t('auth.errorRegister'))
      else setError(t('auth.errorLogin'))
    } finally {
      setLoading(false)
    }
  }

  const IN = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <Wallet className="w-7 h-7 text-gray-800 dark:text-white" strokeWidth={1.5} />
          <span className="font-bold text-2xl text-gray-800 dark:text-white">Caulky</span>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-6">
            {(registrationOpen ? ['login', 'register'] as const : ['login'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError('') }}
                className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  mode === m
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {m === 'login' ? t('auth.login') : t('auth.register')}
              </button>
            ))}
          </div>

          {mode === 'register' && (
            <div className="mb-5">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('auth.chooseLanguage')}</p>
              <div className="flex flex-wrap gap-1.5">
                {BUILT_IN_LANGS.map(lang => (
                  <button
                    key={lang.id}
                    onClick={() => handleLangChange(lang.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      activeLang === lang.id
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 bg-white dark:bg-gray-800'
                    }`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {isNative && (
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  <Server className="w-3.5 h-3.5" /> Servidor de Caulky
                </label>
                <input
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="http://192.168.1.10:8081"
                  required
                  value={server}
                  onChange={e => setServer(e.target.value)}
                  onBlur={() => { void applyServer() }}
                  className={IN}
                />
              </div>
            )}
            {mode === 'register' && (
              <input
                type="text"
                placeholder={t('auth.name')}
                value={name}
                onChange={e => setName(e.target.value)}
                className={IN}
              />
            )}
            <input
              type="email"
              placeholder={t('auth.email')}
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={IN}
            />
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                placeholder={t('auth.password')}
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={IN + ' pr-10'}
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && <p className="text-red-500 dark:text-red-400 text-xs">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-xl hover:bg-gray-700 dark:hover:bg-gray-100 transition disabled:opacity-50"
            >
              {loading ? t('auth.loading') : mode === 'login' ? t('auth.submitLogin') : t('auth.submitRegister')}
            </button>
          </form>
        </div>

        <div className="mt-3">
          <button
            onClick={handleDemo}
            disabled={demoLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
          >
            <FlaskConical className="w-4 h-4" strokeWidth={1.5} />
            {demoLoading ? 'Cargando demo…' : 'Modo test — explorar con datos de ejemplo'}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-4">
          {t('auth.footer')}
        </p>
      </div>
    </div>
  )
}
