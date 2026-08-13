import type { ProductOption } from '@samhan/design-system'
import {
  COMPONENT_FEATURE_OPTIONS,
  COMPONENT_SHAPE_OPTIONS,
  componentOptionKindForProduct,
  type ComponentOptionKind,
} from '../utils/bundleOptionDomain'

export const QUANTITY_SYNC_SHAPE_OPTIONS = [...COMPONENT_SHAPE_OPTIONS]

export type QuantitySyncTargetModalDraft = ProductOption & {
  multiplier: string
  roundingMode: 'NONE' | 'FLOOR'
  componentVariant: string
  componentShape: string
}

export function getQuantitySyncFeatureOptions(kind: ComponentOptionKind | null): readonly string[] {
  return kind ? COMPONENT_FEATURE_OPTIONS[kind] : []
}

export function quantitySyncTargetDraft(
  target: { productCode: string; productName?: string | null; multiplier?: number | string | null; roundingMode?: 'NONE' | 'FLOOR' | null; componentVariant?: string | null; componentShape?: string | null },
): QuantitySyncTargetModalDraft {
  return {
    id: target.productCode,
    modelCode: target.productCode,
    modelName: target.productCode,
    productName: target.productName || target.productCode,
    multiplier: String(target.multiplier ?? 1),
    roundingMode: target.roundingMode ?? 'NONE',
    componentVariant: target.componentVariant ?? '',
    componentShape: target.componentShape ?? '',
  }
}

export function addQuantitySyncTarget(
  current: QuantitySyncTargetModalDraft[],
  product: ProductOption,
): QuantitySyncTargetModalDraft[] {
  const code = product.modelCode ?? product.modelName
  if (!code || current.some((target) => (target.modelCode ?? target.modelName) === code)) return current
  return [...current, {
    ...product,
    id: code,
    modelCode: code,
    multiplier: '1',
    roundingMode: 'NONE',
    componentVariant: '',
    componentShape: '',
  }]
}

export function removeQuantitySyncTarget(
  current: QuantitySyncTargetModalDraft[],
  productCode: string,
): QuantitySyncTargetModalDraft[] {
  return current.filter((target) => (target.modelCode ?? target.modelName) !== productCode)
}

export function quantitySyncTargetKind(target: QuantitySyncTargetModalDraft): ComponentOptionKind | null {
  return componentOptionKindForProduct(target.productName ?? '', target.modelCode ?? target.modelName)
}

export function toQuantitySyncTargetRequest(targets: QuantitySyncTargetModalDraft[]) {
  return targets.map((target, index) => ({
    productCode: target.modelCode ?? target.modelName,
    multiplier: Number(target.multiplier),
    roundingMode: target.roundingMode ?? 'NONE',
    componentVariant: target.componentVariant || null,
    componentShape: target.componentShape || null,
    displayOrder: index + 1,
  }))
}
