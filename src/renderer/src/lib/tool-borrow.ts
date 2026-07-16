import type { AnnotationTool } from '../components/AnnotationToolbar'

export type ToolReturnTarget = 'cursor' | 'magic-stick'

export function shouldPreserveBrushSession(
  previous: AnnotationTool | undefined,
  next: AnnotationTool
): boolean {
  if (!previous) return false
  const brushTools = previous === 'mask' || previous === 'magic-stick'
  const nextBrush = next === 'mask' || next === 'magic-stick'
  return brushTools && nextBrush && previous !== next
}

export function editToolForShapeType(
  type: 'rectangle' | 'mask' | 'polygon'
): AnnotationTool | null {
  if (type === 'rectangle') return 'rectangle'
  if (type === 'mask' || type === 'polygon') return 'mask'
  return null
}
