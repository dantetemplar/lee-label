import type { SegmentationMode } from '../../../shared/segmentation'
import type { AnnotationStore } from './annotation-store'
import type { SemanticMapStore } from './semantic-map-store'

export type AnnotationStoreKind = AnnotationStore | SemanticMapStore

export function supportsRectangles(mode: SegmentationMode): boolean {
  return mode === 'instance'
}

export function supportsPolygonCommit(mode: SegmentationMode): boolean {
  return mode === 'instance'
}

export function getActiveStore(
  mode: SegmentationMode,
  annotationStore: AnnotationStore,
  semanticStore: SemanticMapStore
): AnnotationStoreKind {
  return mode === 'semantic' ? semanticStore : annotationStore
}
