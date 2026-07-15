export type WebsamModelFamily = 'sam2.1' | 'sam2' | 'sam1' | 'sam-hq' | 'edgesam'

export interface WebsamModelInfo {
  id: string
  name: string
  family: WebsamModelFamily
  variant: string
  encoderSize: number
  decoderSize: number
  totalSize: number
  description: string
  encoderKey: string
  decoderKey: string
  quantization: 'fp32' | 'fp16' | 'int8'
  requiresWebGPU: boolean
  archiveName: string
  /** SAM-HQ only: ONNX interm_embeddings shape */
  intermDims?: number[]
}

const MB = 1024 * 1024
export const WEBSAM_RELEASE_TAG = 'v0.1.0'
export const WEBSAM_RELEASE_BASE = `https://github.com/dantetemplar/lee-label/releases/download/${WEBSAM_RELEASE_TAG}`

function archiveName(id: string): string {
  return `model-${id}-v1.zip`
}

export const WEBSAM_MODEL_REGISTRY: WebsamModelInfo[] = [
  {
    id: 'sam-hq-tiny',
    name: 'Light HQ-SAM',
    family: 'sam-hq',
    variant: 'tiny',
    encoderSize: 27 * MB,
    decoderSize: 18 * MB,
    totalSize: 45 * MB,
    description: 'Fastest HQ-SAM (TinyViT), good edges for interactive labeling',
    encoderKey: 'models/sam-hq-tiny/v1/encoder.ort',
    decoderKey: 'models/sam-hq-tiny/v1/decoder.onnx',
    quantization: 'fp32',
    requiresWebGPU: true,
    archiveName: archiveName('sam-hq-tiny'),
    intermDims: [1, 1, 64, 64, 160]
  },
  {
    id: 'sam-hq-base',
    name: 'HQ-SAM ViT-B',
    family: 'sam-hq',
    variant: 'base',
    encoderSize: 351 * MB,
    decoderSize: 20 * MB,
    totalSize: 371 * MB,
    description: 'Balanced HQ-SAM, sharper boundaries than Light',
    encoderKey: 'models/sam-hq-base/v1/encoder.ort',
    decoderKey: 'models/sam-hq-base/v1/decoder.onnx',
    quantization: 'fp32',
    requiresWebGPU: true,
    archiveName: archiveName('sam-hq-base'),
    intermDims: [4, 1, 64, 64, 768]
  },
  {
    id: 'sam-hq-large',
    name: 'HQ-SAM ViT-L',
    family: 'sam-hq',
    variant: 'large',
    encoderSize: 1187 * MB,
    decoderSize: 21 * MB,
    totalSize: 1208 * MB,
    description: 'Higher-accuracy HQ-SAM, large download',
    encoderKey: 'models/sam-hq-large/v1/encoder.ort',
    decoderKey: 'models/sam-hq-large/v1/decoder.onnx',
    quantization: 'fp32',
    requiresWebGPU: true,
    archiveName: archiveName('sam-hq-large'),
    intermDims: [4, 1, 64, 64, 1024]
  },
  {
    id: 'sam2.1-tiny',
    name: 'SAM 2.1 Tiny',
    family: 'sam2.1',
    variant: 'tiny',
    encoderSize: 129 * MB,
    decoderSize: 16 * MB,
    totalSize: 145 * MB,
    description: 'Fastest SAM 2.1, pre-optimized encoder',
    encoderKey: 'models/sam2.1-tiny/v1/encoder.ort',
    decoderKey: 'models/sam2.1-tiny/v1/decoder.onnx',
    quantization: 'fp32',
    requiresWebGPU: true,
    archiveName: archiveName('sam2.1-tiny')
  },
  {
    id: 'sam2.1-small',
    name: 'SAM 2.1 Small',
    family: 'sam2.1',
    variant: 'small',
    encoderSize: 156 * MB,
    decoderSize: 16 * MB,
    totalSize: 172 * MB,
    description: 'Balanced speed and accuracy for SAM 2.1',
    encoderKey: 'models/sam2.1-small/v1/encoder.ort',
    decoderKey: 'models/sam2.1-small/v1/decoder.onnx',
    quantization: 'fp32',
    requiresWebGPU: true,
    archiveName: archiveName('sam2.1-small')
  },
  {
    id: 'sam2.1-baseplus',
    name: 'SAM 2.1 Base+',
    family: 'sam2.1',
    variant: 'base+',
    encoderSize: 324 * MB,
    decoderSize: 16 * MB,
    totalSize: 340 * MB,
    description: 'Higher accuracy SAM 2.1 model',
    encoderKey: 'models/sam2.1-baseplus/v1/encoder.ort',
    decoderKey: 'models/sam2.1-baseplus/v1/decoder.onnx',
    quantization: 'fp32',
    requiresWebGPU: true,
    archiveName: archiveName('sam2.1-baseplus')
  },
  {
    id: 'sam2.1-large',
    name: 'SAM 2.1 Large',
    family: 'sam2.1',
    variant: 'large',
    encoderSize: 862 * MB,
    decoderSize: 16 * MB,
    totalSize: 878 * MB,
    description: 'Highest accuracy SAM 2.1, large download',
    encoderKey: 'models/sam2.1-large/v1/encoder.ort',
    decoderKey: 'models/sam2.1-large/v1/decoder.onnx',
    quantization: 'fp32',
    requiresWebGPU: true,
    archiveName: archiveName('sam2.1-large')
  },
  {
    id: 'sam2-tiny',
    name: 'SAM 2 Tiny',
    family: 'sam2',
    variant: 'tiny',
    encoderSize: 128 * MB,
    decoderSize: 20 * MB,
    totalSize: 148 * MB,
    description: 'Fastest SAM 2 model (prefer SAM 2.1 for better accuracy)',
    encoderKey: 'models/sam2-tiny/v1/encoder.ort',
    decoderKey: 'models/sam2-tiny/v1/decoder.onnx',
    quantization: 'fp32',
    requiresWebGPU: true,
    archiveName: archiveName('sam2-tiny')
  },
  {
    id: 'sam2-small',
    name: 'SAM 2 Small',
    family: 'sam2',
    variant: 'small',
    encoderSize: 155 * MB,
    decoderSize: 20 * MB,
    totalSize: 175 * MB,
    description: 'Balanced SAM 2 model',
    encoderKey: 'models/sam2-small/v1/encoder.ort',
    decoderKey: 'models/sam2-small/v1/decoder.onnx',
    quantization: 'fp32',
    requiresWebGPU: true,
    archiveName: archiveName('sam2-small')
  },
  {
    id: 'sam2-baseplus',
    name: 'SAM 2 Base+',
    family: 'sam2',
    variant: 'base+',
    encoderSize: 324 * MB,
    decoderSize: 20 * MB,
    totalSize: 344 * MB,
    description: 'Higher accuracy SAM 2 model',
    encoderKey: 'models/sam2-baseplus/v1/encoder.ort',
    decoderKey: 'models/sam2-baseplus/v1/decoder.onnx',
    quantization: 'fp32',
    requiresWebGPU: true,
    archiveName: archiveName('sam2-baseplus')
  },
  {
    id: 'sam2-large',
    name: 'SAM 2 Large',
    family: 'sam2',
    variant: 'large',
    encoderSize: 849 * MB,
    decoderSize: 20 * MB,
    totalSize: 869 * MB,
    description: 'Highest accuracy SAM 2, large download',
    encoderKey: 'models/sam2-large/v1/encoder.ort',
    decoderKey: 'models/sam2-large/v1/decoder.onnx',
    quantization: 'fp32',
    requiresWebGPU: true,
    archiveName: archiveName('sam2-large')
  },
  {
    id: 'edgesam',
    name: 'EdgeSAM',
    family: 'edgesam',
    variant: '3x',
    encoderSize: 21 * MB,
    decoderSize: 15 * MB,
    totalSize: 36 * MB,
    description: 'Fast CNN SAM (EdgeSAM-3x), runs on WASM',
    encoderKey: 'models/edgesam/v1/encoder.onnx',
    decoderKey: 'models/edgesam/v1/decoder.onnx',
    quantization: 'fp32',
    requiresWebGPU: false,
    archiveName: archiveName('edgesam')
  },
  {
    id: 'slimsam-77',
    name: 'SlimSAM-77',
    family: 'sam1',
    variant: 'slimsam-77',
    encoderSize: 9 * MB,
    decoderSize: 5 * MB,
    totalSize: 14 * MB,
    description: 'Recommended CPU-only model, 77% pruned SAM (~14 MB INT8)',
    encoderKey: 'models/slimsam-77/v1/encoder.onnx',
    decoderKey: 'models/slimsam-77/v1/decoder.onnx',
    quantization: 'int8',
    requiresWebGPU: false,
    archiveName: archiveName('slimsam-77')
  }
]

export const WEBSAM_MODEL_FAMILIES = [
  { id: 'sam-hq' as const, label: 'SAM-HQ', families: ['sam-hq'] as const },
  { id: 'sam2.1' as const, label: 'SAM 2.1', families: ['sam2.1'] as const },
  { id: 'sam2' as const, label: 'SAM 2', families: ['sam2'] as const },
  {
    id: 'lightweight' as const,
    label: 'Lightweight',
    families: ['edgesam', 'sam1'] as const
  }
]

export function getWebsamModelById(id: string): WebsamModelInfo | undefined {
  return WEBSAM_MODEL_REGISTRY.find((m) => m.id === id)
}

export function getWebsamModelDownloadUrl(model: WebsamModelInfo): string {
  return `${WEBSAM_RELEASE_BASE}/${model.archiveName}`
}

export function formatModelBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / MB).toFixed(0)} MB`
}


export interface WebsamModelStatus {
  id: string
  cached: boolean
  totalSize: number
}

export interface WebsamModelFileUrls {
  encoderUrl: string
  decoderUrl: string
}

export interface WebsamDownloadProgress {
  id: string
  stage: 'downloading' | 'extracting' | 'done' | 'error'
  received: number
  total: number
  error?: string
}
