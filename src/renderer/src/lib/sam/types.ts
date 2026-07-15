export interface ModelInfo {
  id: string
  name: string
  family: 'sam2.1' | 'sam1' | 'sam-hq' | 'edgesam' | 'sam3'
  variant: string
  encoderSize: number
  decoderSize: number
  totalSize: number
  description: string
  /** Relative path under the models cache root, e.g. models/sam2.1-tiny/v1/encoder.ort */
  encoderKey: string
  decoderKey: string
  quantization: 'fp32' | 'fp16' | 'int8'
  requiresWebGPU: boolean
  /** GitHub release asset filename */
  archiveName: string
  /** SAM-HQ only: ONNX interm_embeddings shape */
  intermDims?: number[]
}

/**
 * Point prompt in image-pixel coordinates.
 * Labels: 1=foreground, 0=background, 2=box top-left, 3=box bottom-right.
 */
export interface Point {
  x: number
  y: number
  label: 0 | 1 | 2 | 3
}

export interface Box {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface PromptInput {
  points?: Point[]
  box?: Box
}

export interface Sam1Embedding {
  type: 'sam1'
  imageEmbeddings: Float32Array
  imagePositionalEmbeddings: Float32Array
}

export interface EdgeSamEmbedding {
  type: 'edgesam'
  imageEmbeddings: Float32Array
}

export interface Sam2Embedding {
  type: 'sam2'
  imageEmbed: Float32Array
  highResFeats0: Float32Array
  highResFeats1: Float32Array
}

export interface SamHqEmbedding {
  type: 'sam-hq'
  imageEmbeddings: Float32Array
  /** Early ViT features; shape depends on backbone (see model.intermDims) */
  intermEmbeddings: Float32Array
  intermDims: number[]
}

export interface Sam3Embedding {
  type: 'sam3'
  embedding0: Float32Array
  embedding1: Float32Array
  embedding2: Float32Array
  dims0: number[]
  dims1: number[]
  dims2: number[]
}

export type ImageEmbedding =
  | Sam1Embedding
  | EdgeSamEmbedding
  | Sam2Embedding
  | SamHqEmbedding
  | Sam3Embedding

export interface MaskResult {
  masks: ImageData[]
  rawLogits: Float32Array
  lowResMasks: Float32Array
  scores: number[]
  selectedIndex: number
}

/** Lean decode payload for the UI (no multi-megabyte logit buffers). */
export interface DecodeUiResult {
  bitmap: Uint8Array
  width: number
  height: number
  scores: number[]
  selectedIndex: number
}

export interface RawImageData {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface EmbeddingInfo {
  type: 'sam1' | 'edgesam' | 'sam2' | 'sam-hq' | 'sam3'
  ready: boolean
}
