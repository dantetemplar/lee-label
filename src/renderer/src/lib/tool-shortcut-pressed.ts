import type { AnnotationTool } from '../components/AnnotationToolbar'

export function isToolShortcutPressed(
  toolId: AnnotationTool,
  keys: ReadonlySet<string>,
  instanceMode: boolean
): boolean {
  const modifier = keys.has('Backquote')
  if (!modifier) return false

  if (toolId === 'cursor') {
    return !keys.has('Digit1') && !keys.has('Digit2')
  }

  if (toolId === 'rectangle') {
    return instanceMode && keys.has('Digit1')
  }

  if (toolId === 'mask') {
    return keys.has('Digit2')
  }

  return false
}

export function isToolShortcutEmphasized(
  toolId: AnnotationTool,
  keys: ReadonlySet<string>
): boolean {
  if (!keys.has('Backquote')) return false
  if (toolId === 'rectangle') return !keys.has('Digit1')
  if (toolId === 'mask') return !keys.has('Digit2')
  return false
}
