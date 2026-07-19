import { createContext, useContext } from 'solid-js'
import type { Label } from '../../../shared/annotations'
import type { Point2D } from '../../../shared/geometry'
import type { ProjectSettings } from '../../../shared/segmentation'
import type { AnnotationTool } from '../components/AnnotationToolbar'
import type { ImageBounds } from './annotation-coords'
import type { AnnotationStore } from './annotation-store'
import type { SemanticMapStore } from './semantic-map-store'
import type { ToolReturnTarget } from './tool-borrow'
import type { WorkingShape } from './annotation-store'

export type CursorSidebarTab = 'objects' | 'labels' | 'files'

export interface ProjectContextValue {
  annotationStore: AnnotationStore
  semanticStore: SemanticMapStore
  labels: () => Label[]
  activeLabelId: () => string | null
  setActiveLabelId: (id: string | null) => void
  projectSettings: () => ProjectSettings
  activeTool: () => AnnotationTool
  setActiveTool: (tool: AnnotationTool) => void
  toolModifierHeld: () => boolean
  pressedKeys: () => ReadonlySet<string>
  brushSize: () => number
  setBrushSize: (size: number) => void
  shrinkBrushAtMaxZoom: () => boolean
  setShrinkBrushAtMaxZoom: (value: boolean) => void
  cursorSidebarTab: () => CursorSidebarTab
  setCursorSidebarTab: (tab: CursorSidebarTab) => void
  pointerPixel: () => Point2D | null
  setPointerPixel: (point: Point2D | null) => void
  focusShapeBounds: (bounds: ImageBounds) => void
  registerFocusShapeBounds: (handler: ((bounds: ImageBounds) => void) | null) => void
  requestDeleteShapes: (ids?: string[]) => void
  settleBorrowedTool: () => boolean
  beginEditShape: (shape: WorkingShape) => void
  toolReturnTarget: () => ToolReturnTarget | null
}

export const ProjectContext = createContext<ProjectContextValue>()

export function useProjectContext(): ProjectContextValue {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error('useProjectContext must be used within ProjectContext.Provider')
  }
  return context
}
