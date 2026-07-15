import { readFile, stat, writeFile } from 'fs/promises'

export const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024
export const MAX_BINARY_FILE_BYTES = 100 * 1024 * 1024

export async function readTextFile(filePath: string): Promise<string> {
  const fileStat = await stat(filePath)
  if (fileStat.size > MAX_TEXT_FILE_BYTES) {
    throw new Error('File is too large to display')
  }
  return readFile(filePath, 'utf-8')
}

export async function readBinaryFile(filePath: string): Promise<ArrayBuffer> {
  const fileStat = await stat(filePath)
  if (fileStat.size > MAX_BINARY_FILE_BYTES) {
    throw new Error('File is too large to read')
  }
  const buffer = await readFile(filePath)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

export async function writeTextFile(filePath: string, content: string): Promise<number> {
  if (Buffer.byteLength(content, 'utf-8') > MAX_TEXT_FILE_BYTES) {
    throw new Error('File is too large to save')
  }
  await writeFile(filePath, content, 'utf-8')
  const fileStat = await stat(filePath)
  return fileStat.size
}
