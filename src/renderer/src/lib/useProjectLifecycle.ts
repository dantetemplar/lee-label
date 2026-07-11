import type { FileEntry, RecentProject } from '../../../shared/types'
import type { ImageStatus, Label } from '../../../shared/annotations'
import type { ProjectSettings } from '../../../shared/segmentation'
import type { AnnotationStore } from './annotation-store'
import type { SemanticMapStore } from './semantic-map-store'
import { findFirstImageFile } from './tree-nav'

export function useProjectLifecycle(options: {
  folderPath: () => string | null
  setFolderPath: (path: string | null) => void
  setFolderName: (name: string) => void
  setEntries: (entries: FileEntry[]) => void
  setRecentProjects: (projects: RecentProject[]) => void
  setProjectSettings: (settings: ProjectSettings) => void
  setLabels: (labels: Label[]) => void
  setImageStatuses: (statuses: Record<string, ImageStatus>) => void
  setActiveLabelId: (id: string | null) => void
  setLabelError: (error: string | null) => void
  resetViewerState: () => void
  selectFile: (node: FileEntry) => Promise<void>
  annotationStore: AnnotationStore
  semanticStore: SemanticMapStore
  saveOpenTextIfDirty: () => void
}): {
  flushAnnotations: () => Promise<void>
  prepareNavigation: () => Promise<void>
  openAnnotationProject: (path: string) => Promise<void>
  closeAnnotationProject: () => Promise<void>
  loadFolderAtPath: (path: string) => Promise<void>
  openFolder: () => Promise<void>
  goToWelcomeScreen: () => Promise<void>
  openRecentProject: (path: string, onMissing: (recent: RecentProject[]) => void) => Promise<void>
} {
  const flushAnnotations = async (): Promise<void> => {
    await options.annotationStore.flush()
    await options.semanticStore.flush()
  }

  const prepareNavigation = async (): Promise<void> => {
    options.saveOpenTextIfDirty()
    await flushAnnotations()
  }

  const openAnnotationProject = async (path: string): Promise<void> => {
    const project = await window.api.project.open(path)
    const [nextLabels, statuses] = await Promise.all([
      window.api.labels.list(),
      window.api.images.listStatuses()
    ])
    options.setProjectSettings({
      name: project.name,
      segmentationMode: project.segmentationMode
    })
    options.setFolderName(project.name)
    options.annotationStore.setSegmentationMode(project.segmentationMode)
    options.setLabels(nextLabels)
    options.setImageStatuses(statuses)
    options.setActiveLabelId(nextLabels[0]?.id ?? null)
    options.setLabelError(null)
  }

  const closeAnnotationProject = async (): Promise<void> => {
    await flushAnnotations()
    await window.api.project.close()
    options.setLabels([])
    options.setImageStatuses({})
    options.setActiveLabelId(null)
    options.setLabelError(null)
  }

  const loadFolderAtPath = async (path: string): Promise<void> => {
    await closeAnnotationProject()
    await openAnnotationProject(path)
    const tree = await window.api.files.readDirectoryTree(path)
    const recent = await window.api.recent.add(path)
    options.setFolderPath(path)
    options.setEntries(tree)
    options.setRecentProjects(recent)
    options.resetViewerState()
    const firstImage = findFirstImageFile(tree)
    if (firstImage) await options.selectFile(firstImage)
  }

  const openFolder = async (): Promise<void> => {
    await prepareNavigation()
    const path = await window.api.files.openFolder()
    if (!path) return
    await loadFolderAtPath(path)
  }

  const goToWelcomeScreen = async (): Promise<void> => {
    if (!options.folderPath()) return
    await prepareNavigation()
    await closeAnnotationProject()
    options.setFolderPath(null)
    options.setEntries([])
    options.resetViewerState()
  }

  const openRecentProject = async (
    path: string,
    onMissing: (recent: RecentProject[]) => void
  ): Promise<void> => {
    await prepareNavigation()
    const exists = await window.api.recent.exists(path)
    if (!exists) {
      onMissing(await window.api.recent.get())
      return
    }
    await loadFolderAtPath(path)
  }

  return {
    flushAnnotations,
    prepareNavigation,
    openAnnotationProject,
    closeAnnotationProject,
    loadFolderAtPath,
    openFolder,
    goToWelcomeScreen,
    openRecentProject
  }
}
