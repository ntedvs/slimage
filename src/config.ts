import { homedir } from "node:os"
import { join } from "node:path"
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises"

function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg) return join(xdg, "slimage")
  return join(homedir(), ".config", "slimage")
}

const configPath = () => join(configDir(), "config.json")

export interface Config {
  apiKey?: string
}

export async function loadConfig(): Promise<Config> {
  try {
    const raw = await readFile(configPath(), "utf8")
    return JSON.parse(raw) as Config
  } catch {
    return {}
  }
}

export async function saveConfig(cfg: Config): Promise<string> {
  const dir = configDir()
  await mkdir(dir, { recursive: true })
  const path = configPath()
  await writeFile(path, JSON.stringify(cfg, null, 2), "utf8")
  await chmod(path, 0o600)
  return path
}

export async function resolveApiKey(cliKey?: string): Promise<string | undefined> {
  if (cliKey) return cliKey
  if (process.env.TINIFY_KEY) return process.env.TINIFY_KEY
  const cfg = await loadConfig()
  return cfg.apiKey
}
