export function toLocalImageUrl(filePath: string): string {
  return `local-image://image?path=${encodeURIComponent(filePath)}`
}
