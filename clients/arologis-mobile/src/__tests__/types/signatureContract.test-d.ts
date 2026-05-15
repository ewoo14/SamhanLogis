import {
  signAndSendCopy,
  type DispatchVehicleSummary,
  type SignAndSendCopyResult,
} from '../../api/arologis';

const assignedVehicle: DispatchVehicleSummary = {
  dispatchDate: '2026-05-15',
  dispatchType: 'NIGHT',
  vehicleSequence: 1,
  tonnage: 'TONNAGE_1',
  label: '강남+서초',
  status: 'ASSIGNED',
  stops: [
    {
      stopSequence: 1,
      rawText: '서울 강남구 테스트로 1 (테스트상사-1234)',
      parsedAddress: '서울 강남구 테스트로 1',
      parsedPartnerName: '테스트상사',
      parsedKakaoSeq: 1234,
      notes: '문 앞 전달',
      status: 'PENDING',
    },
  ],
};

const stop = assignedVehicle.stops[0];

async function submitSignatureContract(token: string | null): Promise<SignAndSendCopyResult> {
  return signAndSendCopy(
    token,
    assignedVehicle.dispatchType,
    assignedVehicle.vehicleSequence,
    stop.stopSequence,
    {
      driverSignatureBase64: 'driver-png-base64',
      recipientSignatureBase64: 'recipient-png-base64',
      capturedAt: '2026-05-15T12:00:00',
      gpsLat: 37.5665,
      gpsLng: 126.978,
      parsedKakaoSeq: stop.parsedKakaoSeq,
    },
  );
}

async function readSuccessHeaders(token: string | null): Promise<string | null> {
  const result = await submitSignatureContract(token);
  if (result.kind === 'success') {
    return result.copyRecipientPhoneMasked ?? result.signatureId ?? result.pngBase64;
  }
  return result.copyFailureReason ?? result.error ?? null;
}

void readSuccessHeaders(null);
