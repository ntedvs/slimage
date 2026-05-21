import { readdir } from "node:fs/promises"
import { join, extname } from "node:path"

const SUPPORTED = new Set([".jpg", ".jpeg", ".png", ".webp"])
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache"])

export function isSupported(path: string): boolean {
  return SUPPORTED.has(extname(path).toLowerCase())
}

export async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      yield* walk(full)
    } else if (entry.isFile() && isSupported(entry.name)) {
      yield full
    }
  }
}
