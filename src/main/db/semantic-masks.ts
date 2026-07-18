import type { SemanticMaskBlob } from '../../shared/annotations'
import { decodeClassMap, encodeClassMap } from '../semantic-mask-codec'
import type { DbContext } from './types'
import type { ImagesRepository } from './images'

export class SemanticMasksRepository {
  constructor(
    private readonly ctx: DbContext,
    private readonly images: ImagesRepository
  ) {}

  getSemanticMask(relativePath: string): SemanticMaskBlob | null {
    const imageId = this.images.getImageId(relativePath)
    const row = this.ctx
      .requireDb()
      .prepare('SELECT width, height, format, data FROM semantic_masks WHERE image_id = ?')
      .get(imageId) as { width: number; height: number; format: 'png16'; data: Buffer } | undefined
    if (!row) return null

    const buffer = row.data
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer

    return {
      width: row.width,
      height: row.height,
      format: row.format,
      data: arrayBuffer
    }
  }

  saveSemanticMask(
    relativePath: string,
    width: number,
    height: number,
    classMap: Uint16Array
  ): SemanticMaskBlob {
    const imageId = this.images.getImageId(relativePath)
    const pngBuffer = encodeClassMap(classMap, width, height)

    this.ctx
      .requireDb()
      .prepare(
        `INSERT INTO semantic_masks (image_id, width, height, format, data)
         VALUES (?, ?, ?, 'png16', ?)
         ON CONFLICT(image_id) DO UPDATE SET
           width = excluded.width,
           height = excluded.height,
           format = excluded.format,
           data = excluded.data`
      )
      .run(imageId, width, height, pngBuffer)

    this.ctx.touchProject()

    const arrayBuffer = pngBuffer.buffer.slice(
      pngBuffer.byteOffset,
      pngBuffer.byteOffset + pngBuffer.byteLength
    ) as ArrayBuffer

    return {
      width,
      height,
      format: 'png16',
      data: arrayBuffer
    }
  }

  decodeSemanticMask(blob: SemanticMaskBlob): Uint16Array {
    const buffer = Buffer.from(blob.data)
    return decodeClassMap(buffer).data
  }
}
