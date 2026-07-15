import type { ModelInfo } from './types'
import {
  WEBSAM_MODEL_REGISTRY,
  WEBSAM_MODEL_FAMILIES,
  getWebsamModelById,
  getWebsamModelDownloadUrl,
  formatModelBytes
} from '../../../../shared/websam-models'

export const MODEL_REGISTRY = WEBSAM_MODEL_REGISTRY as ModelInfo[]
export const MODEL_FAMILIES = WEBSAM_MODEL_FAMILIES

export function getModelById(id: string): ModelInfo | undefined {
  return getWebsamModelById(id) as ModelInfo | undefined
}

export function getModelDownloadUrl(model: ModelInfo): string {
  return getWebsamModelDownloadUrl(model)
}

export const formatBytes = formatModelBytes
