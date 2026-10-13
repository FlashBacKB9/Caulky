import axios, { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { applyOverlay, deriveFromCache, parseJson, enrichMovement, findCachedItem, pendingCreate, readCache, writeCache } from './cache'
import { isOnline, probe, setOnline, wasChecked } from './connectivity'
import { enqueue, getOps, nextTempId, removeOp, splitPath, uuid, type Op } from './outbox'

/**
 * Adaptador de axios para la APK: con conexión pide al servidor y guarda copia de cada
 * lectura; sin ella contesta con la copia y deja los cambios en cola para sincronizarlos.
 */

export const network: AxiosAdapter = axios.getAdapter(axios.defaults.adapter)

/** Cambios que se pueden hacer sin conexión. El resto (tickets, importar, ficheros...) la necesita. */
const OFFLINE_WRITES: { re: RegExp; methods: string[] }[] = [
  { re: /^\/movements(\/-?\d+)?$/, methods: ['POST', 'PUT', 'DELETE'] },
  { re: /^\/preferences\/[^/]+$/, methods: ['PUT'] },
  { re: /^\/movement-types(\/-?\d+)?$/, methods: ['POST', 'PUT', 'DELETE'] },
  { re: /^\/groups(\/-?\d*)?$/, methods: ['POST', 'PUT', 'DELETE'] },
  { re: /^\/templates(\/-?\d+)?$/, methods: ['POST', 'PUT', 'DELETE'] },
  { re: /^\/real-accounts(\/-?\d+)?$/, methods: ['POST', 'PUT', 'DELETE'] },
  { re: /^\/accounts\/\d+$/, methods: ['PUT'] },
]

export const OFFLINE_CODE = 'ERR_OFFLINE'

function offlineError(config: InternalAxiosRequestConfig, message: string) {
  return new AxiosError(message, OFFLINE_CODE, config)
}

/**
 * Sin respuesta del servidor: no hay red o el servidor no está al alcance. Un 502/503/504
 * es el proxy (nginx) diciendo que el backend no contesta: tampoco ha llegado.
 */
export function isNetworkError(e: unknown): boolean {
  if (!(e instanceof AxiosError) || e.code === AxiosError.ERR_CANCELED) return false
  return !e.response || [502, 503, 504].includes(e.response.status)
}

function pathAndParams(config: InternalAxiosRequestConfig) {
  const url = new URL(config.url ?? '', 'http://x')
  const params: Record<string, unknown> = {}
  url.searchParams.forEach((v, k) => { params[k] = v })
  Object.assign(params, config.params ?? {})
  const raw = decodeURI(url.pathname)
  return { raw, path: raw.replace(/\/+$/, '') || '/', params }
}

function respond(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return {
    data, status, statusText: 'OK (sin conexión)',
    headers: { 'x-caulky-offline': '1' }, config, request: {},
  }
}

function parseBody(data: unknown): Record<string, unknown> | null {
  if (data == null || data === '') return null
  if (typeof data === 'string') {
    try { return JSON.parse(data) } catch { return null }
  }
  return typeof data === 'object' ? data as Record<string, unknown> : null
}

async function readOffline(config: InternalAxiosRequestConfig, path: string, params: Record<string, unknown>) {
  const created = pendingCreate(path)
  if (created) return respond(config, created)
  const cached = (await readCache(path, params)) ?? (await deriveFromCache(path, params))
  if (!cached) throw offlineError(config, 'Sin conexión y sin datos guardados de esta pantalla')
  const data = await applyOverlay(path, params, cached.data)
  if (data === null) {
    throw new AxiosError('No encontrado', AxiosError.ERR_BAD_REQUEST, config, {},
      { data: { detail: 'Not found' }, status: 404, statusText: 'Not Found', headers: {}, config })
  }
  return respond(config, data)
}

async function writeOffline(config: InternalAxiosRequestConfig, method: Op['method'], path: string,
                            raw: string, uncertain = false) {
  const body = parseBody(config.data)
  const { coll, id } = splitPath(path)
  const isMovement = coll === '/movements'

  // La app reescribe ajustes al arrancar con el mismo valor: eso no es un cambio
  if (path.startsWith('/preferences/')) {
    const prefs = (await readCache('/preferences'))?.data as Record<string, unknown> | undefined
    const key = decodeURIComponent(path.slice('/preferences/'.length))
    if (prefs && prefs[key] === body?.value) {
      await Promise.all(getOps().filter(o => o.path === path).map(o => removeOp(o.id)))
      return respond(config, '', 204)
    }
  }

  if (method === 'POST') {
    const tempId = nextTempId()
    let result: Record<string, unknown> = { ...(body ?? {}), id: tempId }
    if (isMovement) {
      result = await enrichMovement({
        paid: true, no_count: false, is_transfer: false, is_shared: false,
        files: [], splits: [], ...result,
      })
    }
    await enqueue({ id: uuid(), createdAt: new Date().toISOString(), method, path: coll, url: raw, body, tempId, result, uncertain })
    return respond(config, result, 201)
  }

  const before = id !== null ? (pendingCreate(path) ?? await findCachedItem(coll, id)) : null
  await enqueue({ id: uuid(), createdAt: new Date().toISOString(), method, path, url: raw, body, base: before, uncertain })
  if (method === 'DELETE') return respond(config, '', 204)
  let result: Record<string, unknown> = { ...(before ?? {}), ...(body ?? {}) }
  if (isMovement) result = await enrichMovement(result)
  return respond(config, result)
}

export const offlineAdapter: AxiosAdapter = async (config) => {
  const method = (config.method ?? 'get').toUpperCase()
  const { raw, path, params } = pathAndParams(config)
  const binary = config.responseType && config.responseType !== 'json'

  if (method === 'GET') {
    if (binary) {
      if (!isOnline() && wasChecked()) throw offlineError(config, 'Necesitas conexión para abrir este fichero')
      return network(config)
    }
    if (isOnline() || !wasChecked()) {
      try {
        const res = await network({ ...config, timeout: config.timeout || 15_000 })
        setOnline(true)
        res.data = parseJson(res.data)
        await writeCache(path, params, res.data).catch(() => { /* sin espacio: se sigue sin copia */ })
        res.data = await applyOverlay(path, params, res.data)
        return res
      } catch (e) {
        if (!isNetworkError(e)) throw e
        setOnline(false)
      }
    }
    return readOffline(config, path, params)
  }

  const allowed = OFFLINE_WRITES.some(w => w.re.test(path) && w.methods.includes(method))
    && !(config.data instanceof FormData)
  const { id } = splitPath(path)
  // Lo creado sin conexión aún no existe en el servidor: sus cambios se juntan en la cola
  if (allowed && id !== null && id < 0) return writeOffline(config, method as Op['method'], path, raw)

  // Lo que necesita conexión: antes de rendirse, comprobar si ya ha vuelto
  if (!allowed && !isOnline() && wasChecked()) await probe()

  if (isOnline() || !wasChecked()) {
    try {
      const res = await network(config)
      setOnline(true)
      return res
    } catch (e) {
      if (!isNetworkError(e)) throw e
      setOnline(false)
      // Sin respuesta no se sabe si llegó: se encola y al sincronizar se comprueba si ya existe
      if (!allowed) throw offlineError(config, 'Esta acción necesita conexión con el servidor')
      return writeOffline(config, method as Op['method'], path, raw, true)
    }
  }
  if (!allowed) throw offlineError(config, 'Esta acción necesita conexión con el servidor')
  return writeOffline(config, method as Op['method'], path, raw)
}
