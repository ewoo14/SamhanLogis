jest.mock('../../api/client', () => ({
  apiFetch: jest.fn(),
  apiFetchRaw: jest.fn(),
}));

import { apiFetchRaw } from '../../api/client';
import { uploadStopPhoto } from '../../api/arologis';

describe('uploadStopPhoto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiFetchRaw as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: {
          photoType: 'INSPECTION',
          fileName: 'inspection-1.jpg',
          fileSize: 2048,
          contentType: 'image/jpeg',
          uploadedAt: '2026-05-15T13:20:00',
          downloadUrl: null,
        },
      }),
    } as unknown as Response);
  });

  it('today dispatch stop photo multipart path uses Accept only and no manual Content-Type', async () => {
    const result = await uploadStopPhoto('jwt-x', 'NIGHT', 7, 3, 'INSPECTION', {
      uri: 'file:///cache/inspection-1.jpg',
      fileName: 'inspection-1.jpg',
      mimeType: 'image/jpeg',
      exifGpsLat: 37.1234567,
      exifGpsLng: 127.7654321,
      capturedAt: '2026-05-15T13:00:00',
      parsedKakaoSeq: 4567,
    });

    expect(result.fileName).toBe('inspection-1.jpg');
    expect(apiFetchRaw).toHaveBeenCalledTimes(1);
    const [path, init] = (apiFetchRaw as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/driver-app/arologis/dispatches/today/NIGHT/vehicles/7/stops/3/photos/INSPECTION');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Accept: 'application/json' });
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
  });
});
