export type WindowBounds = { width: number; height: number; x?: number; y?: number }
export type WindowStateMap = Record<string, WindowBounds>

export function getConversationBounds(saved: WindowStateMap, key: string, defaults: WindowBounds): WindowBounds {
  const value = saved[key]
  if (!value) return defaults
  return {
    width: Math.max(360, value.width),
    height: Math.max(520, value.height),
    ...(typeof value.x === 'number' ? { x: value.x } : {}),
    ...(typeof value.y === 'number' ? { y: value.y } : {}),
  }
}

export function saveConversationBounds(saved: WindowStateMap, key: string, bounds: WindowBounds): WindowStateMap {
  return { ...saved, [key]: { ...bounds } }
}
