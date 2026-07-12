import { createContext, useContext } from 'solid-js'
import type { Label } from '../../../shared/annotations'
import type { ProjectSettings } from '../../../shared/segmentation'
import type { AnnotationTool } from '../components/AnnotationToolbar'
import type { AnnotationStore } from './annotation-store'
import type { SemanticMapStore } from './semantic-map-store'

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
}

export const ProjectContext = createContext<ProjectContextValue>()

export function useProjectContext(): ProjectContextValue {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error('useProjectContext must be used within ProjectContext.Provider')
  }
  return context
}
