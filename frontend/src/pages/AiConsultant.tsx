import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { RefreshCw } from 'lucide-react'
import api from '../api/client'

export default function AiConsultant() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  const connectWs = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    termRef.current?.writeln('\x1b[90mConectando con el consultor IA…\x1b[0m')

    try {
      const { data } = await api.post<{ ticket: string }>('/ai/terminal/ticket')
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const url = `${proto}://${window.location.host}/api/ai/terminal/ws?ticket=${data.ticket}`

      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onmessage = (evt) => {
        if (!termRef.current) return
        if (evt.data instanceof ArrayBuffer) {
          termRef.current.write(new Uint8Array(evt.data))
        } else {
          termRef.current.write(evt.data as string)
        }
      }

      ws.onclose = () => {
        termRef.current?.writeln(
          '\r\n\x1b[33m[Sesión cerrada — pulsa "Nueva sesión" para reconectar]\x1b[0m'
        )
      }

      ws.onerror = () => {
        termRef.current?.writeln('\r\n\x1b[31m[Error de conexión WebSocket]\x1b[0m')
      }
    } catch {
      termRef.current?.writeln('\r\n\x1b[31m[No se pudo obtener el ticket de sesión]\x1b[0m')
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#94a3b8',
        selectionBackground: '#334155',
        black: '#1e293b',
        brightBlack: '#475569',
        red: '#f87171',
        brightRed: '#fca5a5',
        green: '#4ade80',
        brightGreen: '#86efac',
        yellow: '#facc15',
        brightYellow: '#fde047',
        blue: '#60a5fa',
        brightBlue: '#93c5fd',
        magenta: '#c084fc',
        brightMagenta: '#d8b4fe',
        cyan: '#22d3ee',
        brightCyan: '#67e8f9',
        white: '#cbd5e1',
        brightWhite: '#f1f5f9',
      },
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
      allowTransparency: false,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitRef.current = fitAddon

    term.onData((data) => {
      wsRef.current?.send(data)
    })

    term.onResize(({ cols, rows }) => {
      wsRef.current?.send(`resize:${cols}:${rows}`)
    })

    const ro = new ResizeObserver(() => {
      fitRef.current?.fit()
    })
    ro.observe(containerRef.current)

    connectWs()

    return () => {
      ro.disconnect()
      wsRef.current?.close()
      term.dispose()
    }
  }, [connectWs])

  const handleNewSession = useCallback(() => {
    termRef.current?.clear()
    connectWs()
  }, [connectWs])

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Consultor IA</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Claude con acceso directo a tu base de datos
          </p>
        </div>
        <button
          onClick={handleNewSession}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Nueva sesión
        </button>
      </div>
      <div
        ref={containerRef}
        className="flex-1 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800"
        style={{ minHeight: 0 }}
      />
    </div>
  )
}
