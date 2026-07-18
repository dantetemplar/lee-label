/// <reference types="vite/client" />
/// <reference types="@webgpu/types" />

declare module '@logo' {
  const src: string
  export default src
}

interface KeyboardLayoutMap {
  get(key: string): string | undefined
}

interface Keyboard {
  getLayoutMap(): Promise<KeyboardLayoutMap>
  addEventListener?(type: 'layoutchange', listener: () => void): void
  removeEventListener?(type: 'layoutchange', listener: () => void): void
}

interface Navigator {
  readonly keyboard?: Keyboard
  readonly gpu?: GPU
}
