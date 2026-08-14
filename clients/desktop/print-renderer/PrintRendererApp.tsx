/**
 * Phase F (D-DF-06) — 출고전표 사본 양식.
 *
 * 헤드리스 사본도 interactive DispatchView 와 같은 DispatchDocument 를 사용한다.
 * 입력 SlipData 계약은 기존 PlaywrightCopyRenderer 쿼리 파라미터와 호환되도록 유지한다.
 */
import React, { type JSX } from 'react'
import { DispatchDocument } from '../src/renderer/print/DispatchDocument'
import type { SlipDetail } from '../src/renderer/api/slip'
import '../src/renderer/styles/global.css'

export interface SlipLine {
  itemName: string
  spec: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface SlipData {
  slipNo: string
  slipDate: string
  partnerName: string
  recipientAddress: string
  contactPhone?: string
  driverName?: string
  driverPhone?: string
  lines: SlipLine[]
  totalQuantity: number
  totalSupply: number
  vat: number
  total: number
  sourceWarehouseName: string
  dispatcherName?: string
  recipientName?: string
  memo?: string
  /** 발행 회사 (기존 계약 유지, 출고전표 양식에서는 직접 표시하지 않음). */
  companyLegalName?: string
  /** 회사 대표 전화 (기존 계약 유지, 출고전표 양식에서는 직접 표시하지 않음). */
  companyTel?: string
}

export interface Props {
  slipData: SlipData
  /** PNG base64 (data URI body 부분만). 빈 문자열 가능. */
  driverSignatureBase64: string
  recipientSignatureBase64: string
}

export function PrintRendererApp({
  slipData,
  driverSignatureBase64,
  recipientSignatureBase64,
}: Props): JSX.Element {
  const slip = toSlipDetail(slipData)

  return (
    <div data-testid="outbound-print-area" data-slip-no={slipData.slipNo}>
      <DispatchDocument
        slip={slip}
        roles={null}
        sourceWarehouseName={slipData.sourceWarehouseName}
        signatures={{
          driverSignaturePng: driverSignatureBase64,
          recipientSignaturePng: recipientSignatureBase64,
        }}
      />
    </div>
  )
}

function toSlipDetail(slipData: SlipData): SlipDetail {
  return {
    id: 'print-renderer-slip',
    slipType: 'OUTBOUND',
    slipNo: slipData.slipNo,
    slipDate: slipData.slipDate,
    seqNo: 0,
    status: 'SAVED',
    partnerId: null,
    partnerName: slipData.partnerName,
    sourceWarehouseId: null,
    destinationWarehouseId: null,
    deliveryTag: null,
    requesterId: null,
    acceptedBy: null,
    acceptedAt: null,
    completedAt: null,
    confirmedAt: null,
    updatedAt: slipData.slipDate,
    version: 1,
    memo: slipData.memo ?? null,
    lines: slipData.lines.map((line, index) => ({
      id: `print-line-${index}`,
      productId: `print-product-${index}`,
      productName: line.itemName,
      modelName: line.itemName,
      specification: line.spec,
      quantity: line.quantity,
      unitPrice: String(line.unitPrice),
      lineTotal: String(line.lineTotal),
      note: null,
    })),
    ownerDepartment: null,
    ownerFullName: null,
    dispatcherFullName: slipData.dispatcherName ?? null,
    inspectorFullName: null,
    acceptedByFullName: null,
    shippingAddress: slipData.recipientAddress,
    contactPhone: slipData.contactPhone ?? null,
    dispatcher: null,
    inspector: null,
    driverName: slipData.driverName ?? null,
    driverPhone: slipData.driverPhone ?? null,
    signerName: slipData.recipientName ?? null,
    driverSignaturePng: null,
    signaturePng: null,
  }
}
