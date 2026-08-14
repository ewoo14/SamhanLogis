import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '../Button'
import { AppUpdateNotice } from './AppUpdateNotice'

const meta: Meta<typeof AppUpdateNotice> = {
  title: 'Components/AppUpdateNotice',
  component: AppUpdateNotice,
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj<typeof AppUpdateNotice>

export const Network: Story = {
  args: {
    severity: 'network',
    title: '업데이트 서버에 연결하지 못했습니다',
    description: '인터넷 연결을 확인한 뒤 잠시 후 다시 확인해 주세요.',
    actions: <Button size="sm" variant="secondary">다시 확인</Button>,
  },
}

export const Integrity: Story = {
  args: {
    severity: 'integrity',
    title: '업데이트 파일을 확인하지 못했습니다',
    description: '파일이 손상되었거나 검증에 실패했습니다. 다시 확인해 주세요.',
  },
}

export const Trust: Story = {
  args: {
    severity: 'trust',
    title: '업데이트 파일의 인증서를 신뢰할 수 없습니다',
    description: '사내 IT 지원팀에 인증서 배포를 요청해 주세요. 그동안 앱은 그대로 사용할 수 있습니다.',
  },
}

export const Disabled: Story = {
  args: {
    severity: 'disabled',
    title: '자동 업데이트가 꺼져 있습니다',
    description: '신뢰 루트 설치가 필요합니다. 설치가 끝날 때까지 앱은 그대로 사용할 수 있습니다.',
    actions: <Button size="sm" variant="secondary">신뢰 루트 설치</Button>,
  },
}
