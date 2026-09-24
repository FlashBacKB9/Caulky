import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plus, Trash2, Copy, Check } from 'lucide-react'
import { getApiKeys, createApiKey, revokeApiKey, type ApiKeyCreated } from '../../api/apiKeys'
import { Section } from './shared'

const API_BASE = `${window.location.origin}/api`

function fmtTs(iso: string) {
  return iso.replace('T', ' ').slice(0, 16)
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }
  return (
    <button onClick={copy} title="Copiar"
      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function KeysSection() {
  const queryClient = useQueryClient()
  const { data: keys = [], isLoading } = useQuery({ queryKey: ['api-keys'], queryFn: getApiKeys })
  const [name, setName] = useState('')
  const [created, setCreated] = useState<ApiKeyCreated | null>(null)

  const createMut = useMutation({
    mutationFn: createApiKey,
    onSuccess: k => {
      setCreated(k)
      setName('')
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })
  const revokeMut = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) createMut.mutate(name.trim())
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nombre de la clave (p. ej. Script de importación)"
          maxLength={100}
          className="flex-1 min-w-0 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-gray-300 dark:placeholder:text-gray-600"
        />
        <button type="submit" disabled={!name.trim() || createMut.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm disabled:opacity-40 transition-colors shrink-0">
          <Plus className="w-3.5 h-3.5" />
          Generar clave
        </button>
      </form>

      {created && (
        <div className="rounded-xl border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-900/20 px-3 py-2.5 space-y-2">
          <p className="text-xs text-green-700 dark:text-green-400">
            Copia la clave <span className="font-semibold">«{created.name}»</span> ahora: no se volverá a mostrar.
          </p>
          <div className="flex items-center gap-2 bg-white dark:bg-gray-900 rounded-lg border border-green-200 dark:border-green-900/40 px-2 py-1">
            <code className="flex-1 min-w-0 font-mono text-xs text-gray-700 dark:text-gray-200 break-all">{created.key}</code>
            <CopyButton text={created.key} />
          </div>
          <button onClick={() => setCreated(null)} className="text-xs text-green-700 dark:text-green-400 hover:underline">
            Ya la he guardado
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
        {isLoading ? (
          <p className="px-4 py-3 text-xs text-gray-400">…</p>
        ) : keys.length === 0 ? (
          <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">No hay claves API.</p>
        ) : keys.map(k => (
          <div key={k.id} className="flex items-center gap-3 px-4 py-3">
            <KeyRound className="w-4 h-4 text-gray-400 shrink-0" strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700 dark:text-gray-200 truncate">{k.name}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                <span className="font-mono">{k.prefix}…</span>
                {' · '}creada {fmtTs(k.created_at)}
                {' · '}{k.last_used_at ? `último uso ${fmtTs(k.last_used_at)}` : 'sin usar'}
              </p>
            </div>
            <button
              onClick={() => { if (confirm(`¿Revocar la clave «${k.name}»? Lo que la use dejará de funcionar.`)) revokeMut.mutate(k.id) }}
              title="Revocar"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function UsageSection() {
  const example = `curl -H "Authorization: Bearer ck_..." ${API_BASE}/movements`
  return (
    <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
      <p>
        Envía la clave en la cabecera <code className="font-mono text-gray-700 dark:text-gray-200">Authorization: Bearer &lt;clave&gt;</code>.
        Da el mismo acceso que tu sesión para consultar y modificar datos (GET, POST, PUT, PATCH, DELETE),
        salvo gestionar claves, cambiar la cuenta de usuario o reiniciar el sistema.
      </p>
      <div className="flex items-center gap-2 font-mono bg-gray-950 text-gray-300 rounded-xl px-3 py-2">
        <code className="flex-1 min-w-0 break-all">{example}</code>
        <CopyButton text={example} />
      </div>
      <p>
        La lista completa de endpoints, con un botón Authorize para probarlos con tu clave, está en{' '}
        <a href={`${API_BASE}/docs`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">/api/docs</a>.
      </p>
    </div>
  )
}

export default function ApiTab() {
  return (
    <>
      <Section title="Claves API">
        <KeysSection />
      </Section>
      <Section title="Uso">
        <UsageSection />
      </Section>
    </>
  )
}
