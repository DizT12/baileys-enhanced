#!/usr/bin/env node
// Prebuilt fetcher for whatsapp-rust-bridge (run from the monorepo ROOT postinstall).
//
// Goal: a fresh clone of the Baileys monorepo should "just work" with `pnpm install`,
// even on machines without the Rust/wasm toolchain. We download the prebuilt artifacts
// from the registry and copy dist/ + pkg/ into the workspace package. If the bridge has
// already been built (or fetched) locally, we leave it alone.
//
// This is intentionally NOT the published package's postinstall: registry consumers receive
// the runtime entry points and WASM assets in the npm tarball, and `scripts/` is not included
// in the published `files`. This script only ever runs inside the monorepo.
//
// The version fetched comes from dist.sha256 (the last *published*, checksummed release),
// NOT package.json — so bumping the in-repo version before cutting its release can't make
// every install try to pull an unpublished tarball.
//
// Skip the download if:
//   - all prebuilt artifacts already exist, or
//   - WHATSAPP_RUST_BRIDGE_SKIP_PREBUILT=1.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
	copyFileSync,
	createReadStream,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const root = resolve(dirname(__filename), '..')

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const { name } = pkg

const distDir = join(root, 'dist')
const pkgDir = join(root, 'pkg')
const checksumFile = join(root, 'dist.sha256')

// The pinned 0.5.5 prebuilt predates the dedicated CommonJS entry point and external WASM
// assets. Keep its expected artifacts separate so checksummed installs remain usable until
// the next bridge release updates dist.sha256.
const BASE_ARTIFACTS = ['dist/index.js', 'dist/index.d.ts', 'pkg/whatsapp_rust_bridge.d.ts']
const CJS_ARTIFACT = 'dist/index.cjs'
const WASM_ARTIFACTS = ['dist/wasm/simd.wasm', 'dist/wasm/nosimd.wasm']
const LEGACY_LOCAL_ARTIFACTS = [...BASE_ARTIFACTS, CJS_ARTIFACT]
const EXTERNAL_LOCAL_ARTIFACTS = [...LEGACY_LOCAL_ARTIFACTS, ...WASM_ARTIFACTS]

if (process.env.WHATSAPP_RUST_BRIDGE_SKIP_PREBUILT === '1') {
	console.log('[whatsapp-rust-bridge] WHATSAPP_RUST_BRIDGE_SKIP_PREBUILT=1, skipping prebuilt fetch.')
	process.exit(0)
}

// Reject partial external builds while still accepting the checksummed legacy inline bundle.
if (hasCompleteLocalArtifacts()) {
	console.log('[whatsapp-rust-bridge] dist artifacts already present, skipping prebuilt fetch.')
	process.exit(0)
}

// Resolve which published version to fetch from dist.sha256 (its tarball name), NOT from
// package.json. bridge-release.yml only writes dist.sha256 AFTER a version is published, so
// the version named here is always available on npm and always matches the pinned hash.
let version = pkg.version
let expectedSha = ''
if (existsSync(checksumFile)) {
	const [sha, file = ''] = readFileSync(checksumFile, 'utf8').trim().split(/\s+/)
	expectedSha = sha
	const m = file.match(/whatsapp-rust-bridge-(.+)\.tgz$/)
	if (m) {
		version = m[1]
	} else {
		console.warn(
			`[whatsapp-rust-bridge] could not parse a version from dist.sha256 ("${file}"); ` +
				`falling back to package.json version ${version}.`
		)
	}
} else {
	console.warn('[whatsapp-rust-bridge] No dist.sha256 found; using package.json version and skipping integrity check.')
}

console.log(`[whatsapp-rust-bridge] Fetching prebuilt ${name}@${version} from npm...`)

let tmpDir
try {
	tmpDir = await mkdtemp(join(tmpdir(), 'whatsapp-rust-bridge-'))

	const packResult = spawnSync(
		'npm',
		['pack', `${name}@${version}`, '--silent', '--pack-destination', tmpDir],
		{ stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', timeout: 120_000 }
	)
	if (packResult.error) {
		// ENOENT => npm not on PATH; ETIMEDOUT => the 120s registry timeout fired.
		throw new Error(`could not run \`npm pack\` (${packResult.error.code ?? packResult.error.message})`)
	}
	if (packResult.status !== 0) {
		throw new Error(`npm pack exited with status ${packResult.status}`)
	}

	const tarballName = packResult.stdout.trim().split('\n').pop()
	if (!tarballName) {
		throw new Error('npm pack did not print a tarball name')
	}
	const tarballPath = join(tmpDir, tarballName)

	if (expectedSha) {
		const actual = await sha256File(tarballPath)
		if (expectedSha !== actual) {
			throw new Error(
				`prebuilt tarball SHA-256 mismatch:\n  expected ${expectedSha}\n  got      ${actual}\n` +
					'If this is intentional, regenerate dist.sha256 ' +
					'(or set WHATSAPP_RUST_BRIDGE_SKIP_PREBUILT=1).'
			)
		}
	}

	mkdirSync(distDir, { recursive: true })
	mkdirSync(pkgDir, { recursive: true })

	const tarResult = spawnSync('tar', ['-xzf', tarballPath, '-C', tmpDir], {
		stdio: 'inherit',
		timeout: 120_000
	})
	if (tarResult.error) {
		throw new Error(`could not run \`tar\` (${tarResult.error.code ?? tarResult.error.message})`)
	}
	if (tarResult.status !== 0) {
		throw new Error(`tar -xzf exited with status ${tarResult.status}`)
	}

	const pkgRoot = join(tmpDir, 'package')

	// Validate against the SOURCE (the freshly-extracted tarball), not the destination: a
	// stale artifact left in dist/ or pkg/ from an earlier build must not mask a truncated
	// tarball and let a partial fetch report success.
	const missing = BASE_ARTIFACTS.filter(file => !existsSync(join(pkgRoot, file)))
	if (missing.length) {
		throw new Error(`tarball did not contain expected artifact(s): ${missing.join(', ')}`)
	}

	const packedWasmArtifacts = WASM_ARTIFACTS.filter(file => existsSync(join(pkgRoot, file)))
	if (packedWasmArtifacts.length > 0 && packedWasmArtifacts.length !== WASM_ARTIFACTS.length) {
		throw new Error('tarball contained only one of the required SIMD/non-SIMD WASM assets')
	}
	const usesExternalWasm = packedWasmArtifacts.length === WASM_ARTIFACTS.length
	const packedCjs = join(pkgRoot, CJS_ARTIFACT)
	if (usesExternalWasm && !existsSync(packedCjs)) {
		throw new Error('tarball with external WASM assets did not contain dist/index.cjs')
	}
	if (!usesExternalWasm && !isLegacySelfContainedBundle(join(pkgRoot, 'dist/index.js'))) {
		throw new Error('tarball contained neither external WASM assets nor a legacy inline bundle')
	}

	const artifactsToCopy = usesExternalWasm
		? [...BASE_ARTIFACTS, ...WASM_ARTIFACTS]
		: BASE_ARTIFACTS
	for (const file of artifactsToCopy) {
		const dst = join(root, file)
		mkdirSync(dirname(dst), { recursive: true })
		copyFileSync(join(pkgRoot, file), dst)
	}

	const localCjs = join(root, CJS_ARTIFACT)
	if (existsSync(packedCjs)) {
		copyFileSync(packedCjs, localCjs)
	} else {
		const esm = readFileSync(join(pkgRoot, 'dist/index.js'), 'utf8')
		writeFileSync(localCjs, convertSelfContainedEsmBundleToCommonJs(esm))
		console.log('[whatsapp-rust-bridge] generated CommonJS entry point from legacy prebuilt.')
	}

	const expectedLocalArtifacts = usesExternalWasm ? EXTERNAL_LOCAL_ARTIFACTS : LEGACY_LOCAL_ARTIFACTS
	const missingLocal = expectedLocalArtifacts.filter(file => !existsSync(join(root, file)))
	if (missingLocal.length) {
		throw new Error(`failed to install expected artifact(s): ${missingLocal.join(', ')}`)
	}

	console.log('[whatsapp-rust-bridge] prebuilt artifacts installed.')
} catch (err) {
	console.error('[whatsapp-rust-bridge] failed to fetch prebuilt artifacts:')
	console.error(`  ${err.message}`)
	console.error(
		'\nIf you are working on the Rust crate, build locally with:\n' +
			'  pnpm --filter whatsapp-rust-bridge build\n' +
			'and re-run install with WHATSAPP_RUST_BRIDGE_SKIP_PREBUILT=1 to suppress this hook.\n'
	)
	process.exit(1)
} finally {
	if (tmpDir) {
		try {
			rmSync(tmpDir, { recursive: true, force: true })
		} catch {
			// best-effort cleanup
		}
	}
}

async function sha256File(path) {
	const hash = createHash('sha256')
	for await (const chunk of createReadStream(path)) {
		hash.update(chunk)
	}
	return hash.digest('hex')
}

function hasCompleteLocalArtifacts() {
	if (!LEGACY_LOCAL_ARTIFACTS.every(file => existsSync(join(root, file)))) {
		return false
	}
	if (WASM_ARTIFACTS.every(file => existsSync(join(root, file)))) {
		return true
	}
	return isLegacySelfContainedBundle(join(root, 'dist/index.js'))
}

function isLegacySelfContainedBundle(path) {
	try {
		return readFileSync(path, 'utf8').includes('AGFzbQE')
	} catch {
		return false
	}
}

function convertSelfContainedEsmBundleToCommonJs(source) {
	const exportBlock = /\nexport \{\n([\s\S]*?)\n\};\s*$/.exec(source)
	if (!exportBlock?.[1] || exportBlock.index === undefined) {
		throw new Error('legacy ESM bundle did not end with the expected named-export block')
	}

	const entries = exportBlock[1]
		.split(',')
		.map(entry => entry.trim())
		.filter(Boolean)
		.map(entry => {
			const parts = entry.split(/\s+as\s+/)
			if (parts.length === 1) {
				return `  ${entry}`
			}
			if (parts.length === 2) {
				return `  ${JSON.stringify(parts[1])}: ${parts[0]}`
			}
			throw new Error(`could not convert ESM export: ${entry}`)
		})

	const commonJs = `${source.slice(0, exportBlock.index)}\nmodule.exports = {\n${entries.join(',\n')}\n};\n`
	if (/^\s*(?:import|export)\s/m.test(commonJs) || commonJs.includes('import.meta')) {
		throw new Error('legacy ESM bundle contains unsupported module syntax')
	}

	return commonJs
}
