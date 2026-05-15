import { fetchStopSlipDetail, type DispatchVehicleSummary, type StopSlipDetailResponse } from '../api/arologis';

const dispatchType: DispatchVehicleSummary['dispatchType'] = 'NIGHT';

async function readSlipDetailPublicContract(token: string | null): Promise<string> {
  const detail = await fetchStopSlipDetail(token, dispatchType, 7, 3, { parsedKakaoSeq: 4567 });
  return formatPublicSlipDetail(detail);
}

function formatPublicSlipDetail(detail: StopSlipDetailResponse): string {
  // @ts-expect-error 내부 UUID 필드는 기사 앱 공개 응답 타입에 포함되면 안 된다.
  const forbiddenId = detail.id;
  // @ts-expect-error 내부 dispatchId 는 기사 앱 공개 응답 타입에 포함되면 안 된다.
  const forbiddenDispatchId = detail.dispatchId;
  // @ts-expect-error 내부 vehicleId 는 기사 앱 공개 응답 타입에 포함되면 안 된다.
  const forbiddenVehicleId = detail.vehicleId;
  // @ts-expect-error 내부 stopId 는 기사 앱 공개 응답 타입에 포함되면 안 된다.
  const forbiddenStopId = detail.stopId;
  // @ts-expect-error 내부 slipId 는 기사 앱 공개 응답 타입에 포함되면 안 된다.
  const forbiddenSlipId = detail.slipId;
  // @ts-expect-error presigned/download URL 은 기사 앱 공개 응답 타입에 포함되면 안 된다.
  const forbiddenDownloadUrl = detail.downloadUrl;

  return [
    detail.slipNo,
    detail.partnerName,
    detail.deliveryAddress,
    detail.sourceWarehouseName,
    String(detail.totalSupply),
    String(detail.vat),
    String(detail.total),
    detail.lines.map((line) => `${line.productName}:${line.quantity}:${line.lineTotal}`).join(','),
    forbiddenId,
    forbiddenDispatchId,
    forbiddenVehicleId,
    forbiddenStopId,
    forbiddenSlipId,
    forbiddenDownloadUrl,
  ].join('|');
}

void readSlipDetailPublicContract(null);
