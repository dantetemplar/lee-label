import type { AnnotationTool } from '../components/AnnotationToolbar'
import { MOUSE_BUTTON_KEYS } from './mouse-button-keys'
import type { SegmentationMode } from '../../../shared/segmentation'

export interface ToolControlHint {
  label: string
  keys: string[]
  sequential?: boolean
}

const VIEW_HINTS: ToolControlHint[] = [
  { label: 'Zoom', keys: [MOUSE_BUTTON_KEYS.scroll] },
  { label: 'Pan', keys: [MOUSE_BUTTON_KEYS.middle] }
]

const CURSOR_INSTANCE_HINTS: ToolControlHint[] = [
  { label: 'Select', keys: [MOUSE_BUTTON_KEYS.left] },
  { label: 'Multiselect', keys: ['Ctrl', MOUSE_BUTTON_KEYS.left] },
  { label: 'Cycle', keys: ['Tab'] },
  { label: 'Deselect', keys: ['Esc'] },
  { label: 'Delete', keys: ['Del'] }
]

const RECTANGLE_HINTS: ToolControlHint[] = [
  { label: 'Select', keys: ['Alt', MOUSE_BUTTON_KEYS.left] },
  {
    label: 'Rectangle',
    keys: [
      MOUSE_BUTTON_KEYS.left,
      MOUSE_BUTTON_KEYS.left,
      'or',
      'Hold',
      MOUSE_BUTTON_KEYS.left,
      'Release'
    ],
    sequential: true
  },
  { label: 'Erase', keys: [MOUSE_BUTTON_KEYS.right] },
  { label: 'Cycle', keys: ['Tab'] },
  { label: 'Cancel', keys: ['Esc'] }
]

const MASK_INSTANCE_HINTS: ToolControlHint[] = [
  { label: 'Select', keys: ['Alt', MOUSE_BUTTON_KEYS.left] },
  { label: 'Paint', keys: [MOUSE_BUTTON_KEYS.left] },
  { label: 'Erase', keys: [MOUSE_BUTTON_KEYS.right] },
  { label: 'Commit', keys: ['Space'] },
  { label: 'Cycle', keys: ['Tab'] },
  { label: 'Cancel', keys: ['Esc'] }
]

const MASK_SEMANTIC_HINTS: ToolControlHint[] = [
  { label: 'Paint', keys: [MOUSE_BUTTON_KEYS.left] },
  { label: 'Erase', keys: [MOUSE_BUTTON_KEYS.right] }
]

const DATASET_HINTS: ToolControlHint[] = [
  { label: 'Mark done', keys: ['Ctrl', 'Enter'] },
  { label: 'Skip', keys: ['Ctrl', 'Shift', 'Enter'] }
]

export function getToolControlHints(
  tool: AnnotationTool,
  segmentationMode: SegmentationMode,
  isImage: boolean
): ToolControlHint[] {
  if (!isImage) return []

  let toolHints: ToolControlHint[]

  if (tool === 'cursor') {
    toolHints =
      segmentationMode === 'instance'
        ? [...VIEW_HINTS, ...CURSOR_INSTANCE_HINTS]
        : VIEW_HINTS
  } else if (tool === 'rectangle' && segmentationMode === 'instance') {
    toolHints = [...VIEW_HINTS, ...RECTANGLE_HINTS]
  } else if (tool === 'mask') {
    toolHints =
      segmentationMode === 'instance'
        ? [...VIEW_HINTS, ...MASK_INSTANCE_HINTS]
        : [...VIEW_HINTS, ...MASK_SEMANTIC_HINTS]
  } else {
    toolHints = VIEW_HINTS
  }

  return [...toolHints, ...DATASET_HINTS]
}
