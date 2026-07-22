#!/usr/bin/env node
import { rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const artifact of ['dist', 'pkg', 'assets/wasm']) {
	rmSync(resolve(root, artifact), { recursive: true, force: true })
}
