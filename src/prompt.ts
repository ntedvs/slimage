import { createInterface, type Interface } from "node:readline"
import { Writable } from "node:stream"

export async function promptSecret(message: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(
      "No TTY available; cannot prompt for a key. Pass it via stdin redirect is unsupported - use TINIFY_KEY env var instead.",
    )
  }

  let muted = false
  const mutedOut = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk)
      cb()
    },
  })

  const rl = createInterface({
    input: process.stdin,
    output: mutedOut,
    terminal: true,
  }) as Interface & { _writeToOutput?: (s: string) => void }

  rl._writeToOutput = (str: string) => {
    if (muted) mutedOut.write("")
    else mutedOut.write(str)
  }

  return new Promise<string>((resolve, reject) => {
    rl.question(message, (answer) => {
      rl.close()
      process.stdout.write("\n")
      resolve(answer.trim())
    })
    muted = true
    rl.on("close", () => {})
    rl.on("SIGINT", () => {
      rl.close()
      reject(new Error("aborted"))
    })
  })
}
