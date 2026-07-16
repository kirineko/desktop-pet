import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import type {
  ItemFilter,
  ItemRecord,
  JobRecord,
  JobRunStatus,
  SearchMode
} from '../../shared/types'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  const path = join(app.getPath('userData'), 'stock-jobs.db')
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      total_count INTEGER NOT NULL DEFAULT 0,
      completed_count INTEGER NOT NULL DEFAULT 0,
      in_stock_count INTEGER NOT NULL DEFAULT 0,
      out_of_stock_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      input TEXT NOT NULL,
      asin TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      in_stock INTEGER,
      a_in_stock INTEGER,
      b_in_stock INTEGER,
      stock_status TEXT,
      message TEXT,
      search_url TEXT,
      finished_at INTEGER,
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_items_job ON items(job_id, seq);
    CREATE INDEX IF NOT EXISTS idx_items_job_status ON items(job_id, status);
  `)
  return db
}

function rowToJob(row: Record<string, unknown>): JobRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    mode: row.mode as SearchMode,
    status: row.status as JobRunStatus,
    totalCount: Number(row.total_count),
    completedCount: Number(row.completed_count),
    inStockCount: Number(row.in_stock_count),
    outOfStockCount: Number(row.out_of_stock_count),
    failedCount: Number(row.failed_count),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  }
}

function rowToItem(row: Record<string, unknown>): ItemRecord {
  return {
    id: Number(row.id),
    jobId: String(row.job_id),
    seq: Number(row.seq),
    input: String(row.input),
    asin: row.asin == null ? null : String(row.asin),
    status: row.status as ItemRecord['status'],
    inStock: row.in_stock == null ? null : Boolean(row.in_stock),
    aInStock: row.a_in_stock == null ? null : Boolean(row.a_in_stock),
    bInStock: row.b_in_stock == null ? null : Boolean(row.b_in_stock),
    stockStatus: row.stock_status == null ? null : String(row.stock_status),
    message: row.message == null ? null : String(row.message),
    searchUrl: row.search_url == null ? null : String(row.search_url),
    finishedAt: row.finished_at == null ? null : Number(row.finished_at)
  }
}

export function createJob(
  id: string,
  name: string,
  mode: SearchMode,
  inputs: string[]
): JobRecord {
  const database = getDb()
  const now = Date.now()
  const insertJob = database.prepare(`
    INSERT INTO jobs (
      id, name, mode, status, total_count,
      completed_count, in_stock_count, out_of_stock_count, failed_count,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'pending', ?, 0, 0, 0, 0, ?, ?)
  `)
  const insertItem = database.prepare(`
    INSERT INTO items (job_id, seq, input, status)
    VALUES (?, ?, ?, 'pending')
  `)

  const tx = database.transaction(() => {
    insertJob.run(id, name, mode, inputs.length, now, now)
    inputs.forEach((input, index) => {
      insertItem.run(id, index + 1, input)
    })
  })
  tx()
  return getJob(id)!
}

export function getJob(id: string): JobRecord | null {
  const row = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  return row ? rowToJob(row) : null
}

export function deleteJob(id: string): void {
  const database = getDb()
  const tx = database.transaction(() => {
    database.prepare('DELETE FROM items WHERE job_id = ?').run(id)
    database.prepare('DELETE FROM jobs WHERE id = ?').run(id)
  })
  tx()
}

export function listJobs(limit = 20): JobRecord[] {
  const rows = getDb()
    .prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Record<string, unknown>[]
  return rows.map(rowToJob)
}

export function getActiveJob(): JobRecord | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM jobs
       WHERE status IN ('pending', 'running', 'paused')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get() as Record<string, unknown> | undefined
  return row ? rowToJob(row) : null
}

export function updateJobStatus(id: string, status: JobRunStatus): void {
  getDb()
    .prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, Date.now(), id)
}

export function getNextPendingItem(
  jobId: string
): ItemRecord | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM items
       WHERE job_id = ? AND status = 'pending'
       ORDER BY seq ASC LIMIT 1`
    )
    .get(jobId) as Record<string, unknown> | undefined
  return row ? rowToItem(row) : null
}

export function saveItemResult(
  itemId: number,
  jobId: string,
  result: {
    status: 'done' | 'failed'
    asin?: string | null
    inStock?: boolean | null
    aInStock?: boolean | null
    bInStock?: boolean | null
    stockStatus?: string | null
    message?: string | null
    searchUrl?: string | null
  }
): JobRecord {
  const database = getDb()
  const now = Date.now()

  const tx = database.transaction(() => {
    database
      .prepare(
        `UPDATE items SET
          status = ?, asin = ?, in_stock = ?, a_in_stock = ?, b_in_stock = ?,
          stock_status = ?, message = ?, search_url = ?, finished_at = ?
         WHERE id = ?`
      )
      .run(
        result.status,
        result.asin ?? null,
        result.inStock == null ? null : result.inStock ? 1 : 0,
        result.aInStock == null ? null : result.aInStock ? 1 : 0,
        result.bInStock == null ? null : result.bInStock ? 1 : 0,
        result.stockStatus ?? null,
        result.message ?? null,
        result.searchUrl ?? null,
        now,
        itemId
      )

    let inStockInc = 0
    let outInc = 0
    let failInc = 0
    if (result.status === 'failed') {
      failInc = 1
    } else if (result.inStock) {
      inStockInc = 1
    } else {
      outInc = 1
    }

    database
      .prepare(
        `UPDATE jobs SET
          completed_count = completed_count + 1,
          in_stock_count = in_stock_count + ?,
          out_of_stock_count = out_of_stock_count + ?,
          failed_count = failed_count + ?,
          updated_at = ?
         WHERE id = ?`
      )
      .run(inStockInc, outInc, failInc, now, jobId)
  })
  tx()
  return getJob(jobId)!
}

export function getJobItems(
  jobId: string,
  filter: ItemFilter,
  offset = 0,
  limit = 100
): { items: ItemRecord[]; total: number } {
  const database = getDb()
  let where = 'job_id = ?'
  const params: unknown[] = [jobId]

  if (filter === 'failed') {
    where += ` AND status = 'failed'`
  } else if (filter === 'in_stock') {
    where += ` AND status = 'done' AND in_stock = 1`
  } else if (filter === 'out_of_stock') {
    where += ` AND status = 'done' AND in_stock = 0`
  }

  const total = (
    database.prepare(`SELECT COUNT(*) AS c FROM items WHERE ${where}`).get(
      ...params
    ) as { c: number }
  ).c

  const rows = database
    .prepare(
      `SELECT * FROM items WHERE ${where} ORDER BY seq ASC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Record<string, unknown>[]

  return { items: rows.map(rowToItem), total }
}

export function exportFailedInputs(jobId: string): string {
  const rows = getDb()
    .prepare(
      `SELECT input FROM items WHERE job_id = ? AND status = 'failed' ORDER BY seq`
    )
    .all(jobId) as { input: string }[]
  return rows.map((r) => r.input).join('\n')
}

export function exportOutOfStockInputs(jobId: string): string {
  const rows = getDb()
    .prepare(
      `SELECT input FROM items
       WHERE job_id = ? AND status = 'done' AND in_stock = 0
       ORDER BY seq`
    )
    .all(jobId) as { input: string }[]
  return rows.map((r) => r.input).join('\n')
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
