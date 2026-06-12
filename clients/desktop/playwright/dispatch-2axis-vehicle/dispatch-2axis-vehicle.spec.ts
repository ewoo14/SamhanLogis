/**
 * @file 배차 2축 차량 모델 FE 정적 계약.
 *
 * Local-only execution: clients/desktop Playwright suite 에서 API/컴포넌트 계약을 잠근다.
 */
import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const repoRoot = path.resolve(dirname, '../../../..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

test.describe('배차 2축 차량 모델 FE 계약', () => {
  test('dispatchTask API 는 차종 12 + 톤수 10 + matrix 를 고정한다', () => {
    const source = read('clients/desktop/src/renderer/api/dispatchTask.ts')

    for (const bodyType of [
      'MOTORCYCLE',
      'SEDAN',
      'DAMAS',
      'LABO',
      'CARGO',
      'WINGBODY',
      'TOPCAR',
      'LIFT',
      'REEFER',
      'VIBRATION_FREE',
      'AXLE',
      'TRAILER',
    ]) {
      expect(source).toContain(bodyType)
    }
    for (const tonnage of ['T_1', 'T_1_2', 'T_1_4', 'T_2_5', 'T_3_5', 'T_5', 'T_11', 'T_14', 'T_18', 'T_25']) {
      expect(source).toContain(tonnage)
    }
    expect(source).toContain('MOTORCYCLE: []')
    expect(source).toContain('SEDAN: []')
    expect(source).toContain('CARGO: TONNAGE_OPTIONS')
    expect(source).toContain('TRAILER: TONNAGE_OPTIONS')
  })

  test('AddVehicleModal 은 차종 선택 후 유효 톤수만 노출하고 소형은 tonnage null 로 보낸다', () => {
    const source = read('clients/desktop/src/renderer/routes/dispatch-board/components/AddVehicleModal.tsx')

    expect(source).toContain("useState<DispatchVehicleBodyType>('CARGO')")
    expect(source).toContain("useState<DispatchTonnage>('T_1')")
    expect(source).toContain('DISPATCH_VEHICLE_TYPE_MATRIX[selectedBodyType]')
    expect(source).toContain("data-testid=\"dispatch-board-add-vehicle-tonnage-options\"")
    expect(source).toContain('tonnage: requiresTonnage ? selectedTonnage : null')
  })

  test('VehicleGroupCard 는 legacy vehicleType 대신 차종+톤수 표시 라벨을 사용한다', () => {
    const source = read('clients/desktop/src/renderer/routes/dispatch-board/components/VehicleGroupCard.tsx')

    expect(source).toContain('formatDispatchVehicleGroupLabel(group)')
    expect(source).not.toContain('DISPATCH_VEHICLE_TYPE_LABEL[group.vehicleType]')
  })
})
