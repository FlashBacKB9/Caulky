import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, Eye, EyeOff } from 'lucide-react'
import { login, register, getMe, claimData } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import { queryClient } from '../App'
import { t, BUILT_IN_LANGS, getLanguage, setLanguage } from '../utils/i18n'

export default function LoginPage() {
  const { setUser } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeLang, setActiveLang] = useState(getLanguage())

  function handleLangChange(id: string) {
    setActiveLang(id)
    setLanguage(id)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password, name || undefined)
        await login(email, password)
      }
      queryClient.clear()
      const u = await getMe()
      await claimData().catch(() => {})
      setUser(u)
      navigate('/', { replace: true })
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (detail === 'LOGIN_BAD_CREDENTIALS') setError(t('auth.errorCredentials'))
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
            {(['login', 'register'] as const).map(m => (
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

        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-4">
          {t('auth.footer')}
        </p>
      </div>
    </div>
  )
}
