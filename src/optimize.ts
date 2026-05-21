import { readFile, stat, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { relative } from "node:path"
import pLimit from "p-limit"
import tinify from "tinify"
import { walk } from "./walk.js"
import { createMarker, type XattrPayload } from "./xattr.js"

async function sha256(path: string): Promise<string> {
  const buf = await readFile(path)
  return createHash("sha256").update(buf).digest("hex")
}

function fmtBytes(n: number): string {
  const units = ["B", "KB", "MB", "GB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)}${units[i]}`
}

export interface OptimizeOptions {
  dir: string
  apiKey: string
  concurrency: number
  dryRun: boolean
  force: boolean
}

export async function optimize(opts: OptimizeOptions): Promise<void> {
  tinify.key = opts.apiKey

  const marker = await createMarker(opts.dir)
  if (marker.usingFallback) {
    console.log("note: xattrs unavailable, using local cache file in ~/.cache/slimage")
  }

  const limit = pLimit(opts.concurrency)
  const tasks: Promise<void>[] = []

  let totalIn = 0
  let totalOut = 0
  let processed = 0
  let skipped = 0
  let failed = 0

  for await (const file of walk(opts.dir)) {
    tasks.push(
      limit(async () => {
        const rel = relative(opts.dir, file)
        try {
          const hash = await sha256(file)

          if (!opts.force) {
            const existing = await marker.read(file)
            if (existing && existing.hash === hash) {
              skipped++
              return
            }
          }

          const inStat = await stat(file)
          const inSize = inStat.size

          if (opts.dryRun) {
            console.log(`would optimize ${rel} (${fmtBytes(inSize)})`)
            return
          }

          const source = tinify.fromFile(file)
          const optimized = await source.toBuffer()
          const outBuf = Buffer.from(optimized)

          if (outBuf.length >= inSize) {
            // No improvement — still mark so we don't retry.
            const payload: XattrPayload = {
              v: 1,
              hash,
              at: new Date().toISOString(),
              inSize,
              outSize: inSize,
            }
            await marker.write(file, payload)
            skipped++
            return
          }

          await writeFile(file, outBuf)
          const newHash = createHash("sha256").update(outBuf).digest("hex")

          const payload: XattrPayload = {
            v: 1,
            hash: newHash,
            at: new Date().toISOString(),
            inSize,
            outSize: outBuf.length,
          }
          await marker.write(file, payload)

          totalIn += inSize
          totalOut += outBuf.length
          processed++

          const pct = ((1 - outBuf.length / inSize) * 100).toFixed(1)
          console.log(`${rel}  ${fmtBytes(inSize)} -> ${fmtBytes(outBuf.length)}  (-${pct}%)`)
        } catch (err) {
          failed++
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`✗ ${rel}: ${msg}`)
        }
      }),
    )
  }

  await Promise.all(tasks)
  await marker.flush()

  console.log("")
  if (opts.dryRun) {
    console.log("dry run complete.")
  } else {
    const savedPct = totalIn > 0 ? ((1 - totalOut / totalIn) * 100).toFixed(1) : "0"
    console.log(`optimized ${processed} · skipped ${skipped} · failed ${failed}`)
    if (processed > 0) {
      console.log(`saved ${fmtBytes(totalIn - totalOut)} (${savedPct}% smaller)`)
    }
    console.log(`tinify quota used this month: ${tinify.compressionCount ?? "?"}/500`)
  }
}
