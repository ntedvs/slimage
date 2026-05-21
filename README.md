<p align="center">
  <img src="./slimage.png" alt="slimage" width="500" />
</p>

Slim image - recursively optimize images in a directory using [Tinify](https://tinify.com) (TinyPNG / TinyJPG). Tracks already-optimized files via extended file attributes, so re-running is cheap and idempotent - no sidecar lockfile.

## Install

Run on demand:

```sh
npx slimage
```

Or install globally:

```sh
npm i -g slimage
```

## Authenticate

Get a free API key at [tinify.com/developers](https://tinify.com/developers) (500 images/month on the free tier). Then:

```sh
slimage auth
```

You'll be prompted to paste your key - input is hidden, so it doesn't end up in shell history. The key is validated against Tinify, then saved to `~/.config/slimage/config.json` (mode `0600`).

Alternatives:

- `TINIFY_KEY=...` environment variable
- `slimage --key <key>` per-invocation

Resolution order: `--key` → `TINIFY_KEY` → config file.

## Usage

```sh
# optimize current directory
slimage

# specific directory
slimage ./public

# preview without uploading
slimage --dry-run

# re-optimize files that have already been processed
slimage --force

# tune concurrency (default 5)
slimage -c 10
```

Supported formats: **JPEG, PNG, WebP**. `node_modules`, `.git`, `dist`, `build`, `.next`, `.cache`, and dotfiles are skipped.

## How dedupe works

After each successful optimization, slimage writes an extended attribute named `user.slimage` onto the file containing a content hash and metadata. On the next run, any file whose current hash matches its stored marker is skipped - no API call, no quota burned. Edit the file (which changes its hash) and it'll be picked up again.

If extended attributes aren't supported on your filesystem (rare - FAT32, some network mounts), slimage transparently falls back to a per-root cache file at `~/.cache/slimage/<encoded-path>.json`.

### Inspecting the marker

```sh
# macOS
xattr -p user.slimage path/to/image.png

# Linux
getfattr -n user.slimage path/to/image.png
```

### Clearing the marker

```sh
# macOS
xattr -d user.slimage path/to/image.png

# Linux
setfattr -x user.slimage path/to/image.png
```

Or use `--force` to ignore markers globally for one run.

## License

MIT © Nathaniel Davis
