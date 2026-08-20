#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const clientPath = process.argv[2] ?? fileURLToPath(
  new URL('../node_modules/@deepseek-ai/dsh-client-connection/lib/client.js', import.meta.url),
)
const original = 'isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname),'
const replacement = 'isLoopback: true,'
const source = await readFile(clientPath, 'utf8')
const originalOccurrences = source.split(original).length - 1
const replacementOccurrences = source.split(replacement).length - 1

if (originalOccurrences === 0 && replacementOccurrences === 1) {
  console.log(`DSH authenticated-proxy client patch already applied: ${clientPath}`)
  process.exit(0)
}

if (originalOccurrences !== 1 || replacementOccurrences !== 0) {
  throw new Error(
    `DSH authenticated-proxy client patch expected one original and no replacement assignments in ${clientPath}, found ${originalOccurrences} original and ${replacementOccurrences} replacement assignments`,
  )
}

await writeFile(clientPath, source.replace(original, replacement))
console.log(`Applied DSH authenticated-proxy client patch: ${clientPath}`)
