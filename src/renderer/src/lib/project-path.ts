export function toRelativePath(projectRoot: string, absolutePath: string): string {
  const normalizedRoot = projectRoot.replace(/\\/g, '/').replace(/\/$/, '')
  const normalizedPath = absolutePath.replace(/\\/g, '/')
  if (normalizedPath === normalizedRoot) return ''
  if (normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1)
  }
  return normalizedPath
}
