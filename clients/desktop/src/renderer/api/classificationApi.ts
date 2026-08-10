/**
 * F1-b 분류 마스터 API façade.
 *
 * 실제 함수/타입은 기존 productCatalogApi 의 BE 계약 타입을 재사용한다.
 */
export {
  createClassification,
  deleteClassification,
  listClassifications,
  updateClassification,
  updateClassificationFixedDiscount,
} from './productCatalogApi'

export type {
  Classification,
  ClassificationLevel,
  CreateClassificationRequest,
  UpdateClassificationRequest,
  UpdateClassificationFixedDiscountRequest,
} from './productCatalogApi'
