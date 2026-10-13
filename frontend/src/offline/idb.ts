/** Almacén mínimo sobre IndexedDB: caché de respuestas y cola de cambios pendientes. */

const DB_NAME = 'caulky-offline'
const VERSION = 2
export const CACHE = 'cache'
export const OUTBOX = 'outbox'
/** Adjuntos (PDF, fotos de tickets...) descargados para verlos sin conexión */
export const FILES = 'files'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE)
        if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX)
        if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES)
      }
      req.onsuccess = () => {
        // Si otra ventana (la flotante) actualiza la base de datos, esta suelta la suya
        req.result.onversionchange = () => { req.result.close(); dbPromise = null }
        resolve(req.result)
      }
      req.onerror = () => { dbPromise = null; reject(req.error) }
    })
  }
  return dbPromise
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const req = fn(tx.objectStore(store))
    tx.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T))
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }))
}

export const idbGet = <T>(store: string, key: string) => run<T | undefined>(store, 'readonly', s => s.get(key))
export const idbSet = (store: string, key: string, value: unknown) => run<void>(store, 'readwrite', s => { s.put(value, key) })
export const idbDel = (store: string, key: string) => run<void>(store, 'readwrite', s => { s.delete(key) })
export const idbClear = (store: string) => run<void>(store, 'readwrite', s => { s.clear() })
export const idbAll = <T>(store: string) => run<T[]>(store, 'readonly', s => s.getAll())
export const idbKeys = (store: string) => run<string[]>(store, 'readonly', s => s.getAllKeys() as IDBRequest)
