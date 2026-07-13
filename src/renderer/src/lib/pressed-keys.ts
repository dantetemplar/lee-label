import { createSignal } from 'solid-js'

const [pressedKeys, setPressedKeys] = createSignal<ReadonlySet<string>>(new Set())

let keySet = new Set<string>()

function publishKeys(): void {
  setPressedKeys(new Set(keySet))
}

export function getPressedKeys(): ReadonlySet<string> {
  return keySet
}

export function pressKey(code: string): void {
  keySet.add(code)
  publishKeys()
}

export function releaseKey(code: string): void {
  keySet.delete(code)
  publishKeys()
}

export function clearPressedKeys(): void {
  keySet = new Set()
  publishKeys()
}

export function usePressedKeys(): () => ReadonlySet<string> {
  return pressedKeys
}

export function hasModifierKey(keys: ReadonlySet<string>): boolean {
  return (
    keys.has('ControlLeft') ||
    keys.has('ControlRight') ||
    keys.has('MetaLeft') ||
    keys.has('MetaRight')
  )
}

export function hasShiftKey(keys: ReadonlySet<string>): boolean {
  return keys.has('ShiftLeft') || keys.has('ShiftRight')
}

export function hasAltKey(keys: ReadonlySet<string>): boolean {
  return keys.has('AltLeft') || keys.has('AltRight')
}
