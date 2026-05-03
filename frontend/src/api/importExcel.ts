import api from './client'

export interface ParseResult {
  session_id: string
  columns: string[]
  rows: string[][]
  total: number
}

export type TypeAction = 'auto' | 'existing' | 'skip' | 'create'

export interface TypeMapping {
  action: TypeAction
  type_id?: number
  group_id?: number
}

export interface RunImportParams {
  session_id: string
  col_date: number
  col_name: number
  col_money: number
  col_bank_date?: number
  col_type?: number
  col_notes?: number
  col_shared?: number
  col_shared_between?: number
  col_my_share?: number
  account_id?: number
  type_map: Record<string, TypeMapping>
  dry_run?: boolean
  skip_duplicates?: boolean
}

export interface PreviewRow { name: string; date: string; money: number }

export interface DryRunResult { ok: PreviewRow[]; errors: string[] }
export interface RunResult { imported: number; skipped: number; errors: string[] }

export async function parseExcel(file: File): Promise<ParseResult> {
  const fd = new FormData()
  fd.append('file', file)
  const { data } = await api.post('/import/parse', fd)
  return data
}

export async function runImport(params: RunImportParams): Promise<DryRunResult | RunResult> {
  const { data } = await api.post('/import/run', params)
  return data
}
