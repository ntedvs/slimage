#!/usr/bin/env node
import { Command } from "commander"
import { resolve } from "node:path"
import tinify from "tinify"
import { loadConfig, resolveApiKey, saveConfig } from "./config.js"
import { promptSecret } from "./prompt.js"
import { optimize } from "./optimize.js"

const program = new Command()

program
  .name("slimage")
  .description("Recursively optimize images with Tinify (TinyPNG)")
  .version("0.1.0")

program
  .command("auth")
  .description("Prompt for and save your Tinify API key")
  .action(async () => {
    const key = await promptSecret("Tinify API key (input hidden): ")
    if (!key) {
      console.error("no key entered, aborting.")
      process.exit(1)
    }
    tinify.key = key
    try {
      await new Promise<void>((res, rej) => tinify.validate((err) => (err ? rej(err) : res())))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`key validation failed: ${msg}`)
      process.exit(1)
    }
    const cfg = await loadConfig()
    cfg.apiKey = key
    const path = await saveConfig(cfg)
    console.log(`✓ key saved to ${path}`)
  })

program
  .command("optimize", { isDefault: true })
  .description("Recursively optimize images in a directory")
  .argument("[dir]", "directory to optimize", ".")
  .option("-k, --key <key>", "Tinify API key (overrides env and config)")
  .option("-c, --concurrency <n>", "parallel requests", (v) => parseInt(v, 10), 5)
  .option("--dry-run", "list files that would be optimized", false)
  .option("--force", "re-optimize even if previously marked", false)
  .action(
    async (
      dir: string,
      opts: { key?: string; concurrency: number; dryRun: boolean; force: boolean },
    ) => {
      const apiKey = await resolveApiKey(opts.key)
      if (!apiKey) {
        console.error("no API key found. run `slimage auth`, set TINIFY_KEY, or pass --key.")
        process.exit(1)
      }
      await optimize({
        dir: resolve(dir),
        apiKey,
        concurrency: opts.concurrency,
        dryRun: opts.dryRun,
        force: opts.force,
      })
    },
  )

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
