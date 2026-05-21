import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { platform } from "node:os"
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { homedir } from "node:os"

const exec = promisify(execFile)
const ATTR = "user.slimage"

interface XattrPayload {
  v: 1
  hash: string
  at: string
  inSize: number
  outSize: number
}

let xattrSupported: boolean | null = null

async function checkXattrSupport(): Promise<boolean> {
  if (xattrSupported !== null) return xattrSupported
  try {
    if (platform() === "darwin") {
      await exec("xattr", ["-h"])
    } else if (platform() === "linux") {
      await exec("setfattr", ["--help"])
    } else {
      xattrSupported = false
      return false
    }
    xattrSupported = true
  } catch {
    xattrSupported = false
  }
  return xattrSupported
}

async function readXattr(path: string): Promise<XattrPayload | null> {
  try {
    if (platform() === "darwin") {
      const { stdout } = await exec("xattr", ["-p", ATTR, path])
      return JSON.parse(stdout.trim()) as XattrPayload
    } else {
      const { stdout } = await exec("getfattr", [
        "-n",
        ATTR,
        "--only-values",
        "--absolute-names",
        path,
      ])
      return JSON.parse(stdout.trim()) as XattrPayload
    }
  } catch {
    return null
  }
}

async function writeXattr(path: string, payload: XattrPayload): Promise<boolean> {
  const value = JSON.stringify(payload)
  try {
    if (platform() === "darwin") {
      await exec("xattr", ["-w", ATTR, value, path])
    } else {
      await exec("setfattr", ["-n", ATTR, "-v", value, path])
    }
    return true
  } catch {
    return false
  }
}

function cachePath(rootDir: string): string {
  const safe = resolve(rootDir).replace(/[^A-Za-z0-9]+/g, "_")
  return join(homedir(), ".cache", "slimage", `${safe}.json`)
}

interface CacheFile {
  entries: Record<string, XattrPayload>
}

async function readCache(rootDir: string): Promise<CacheFile> {
  try {
    const raw = await readFile(cachePath(rootDir), "utf8")
    return JSON.parse(raw) as CacheFile
  } catch {
    return { entries: {} }
  }
}

async function writeCache(rootDir: string, cache: CacheFile): Promise<void> {
  const path = cachePath(rootDir)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(cache), "utf8")
  await chmod(path, 0o600)
}

export interface Marker {
  read(filePath: string): Promise<XattrPayload | null>
  write(filePath: string, payload: XattrPayload): Promise<void>
  flush(): Promise<void>
  usingFallback: boolean
}

export async function createMarker(rootDir: string): Promise<Marker> {
  const supported = await checkXattrSupport()

  if (supported) {
    return {
      usingFallback: false,
      async read(filePath) {
        return readXattr(filePath)
      },
      async write(filePath, payload) {
        const ok = await writeXattr(filePath, payload)
        if (!ok) {
          // Filesystem may not support xattrs (e.g. FAT32). Fall back per-file silently.
          const cache = await readCache(rootDir)
          cache.entries[relative(rootDir, filePath)] = payload
          await writeCache(rootDir, cache)
        }
      },
      async flush() {},
    }
  }

  const cache = await readCache(rootDir)
  return {
    usingFallback: true,
    async read(filePath) {
      return cache.entries[relative(rootDir, filePath)] ?? null
    },
    async write(filePath, payload) {
      cache.entries[relative(rootDir, filePath)] = payload
    },
    async flush() {
      await writeCache(rootDir, cache)
    },
  }
}

export type { XattrPayload }
