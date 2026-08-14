import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDirectChatRoomByEmployeeCode,
  createGroupChatRoom,
  fetchGroupChatRooms,
  fetchMessengerDirectory,
  fetchMessengerMe,
  joinMessengerPresence,
} from './chatApi'

describe('채팅 API gateway 계약 RED', () => {
  afterEach(() => vi.restoreAllMocks())

  it('user directory/me/presence 요청은 gateway /api prefix를 사용한다', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))

    await fetchMessengerDirectory()
    await fetchMessengerMe()
    await joinMessengerPresence('desktop-test')

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://localhost:8080/api/users/messenger/directory',
      'http://localhost:8080/api/users/messenger/me',
      'http://localhost:8080/api/users/messenger/presence/sessions/desktop-test',
    ])
  })

  it('그룹 목록과 생성은 방 기반 server mapping을 사용한다', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))

    await fetchGroupChatRooms()
    await createGroupChatRoom(['EMP-1'])

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://localhost:8080/admin/groupware/chat/rooms/groups',
      'http://localhost:8080/admin/groupware/chat/rooms/groups',
    ])
  })

  it('1:1 employeeCode 생성은 명시적 v1 관리자 게이트웨이 경로를 사용한다', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: { roomCode: 'ROOM-1' } }), { status: 201 }))

    await createDirectChatRoomByEmployeeCode('EMP-1')

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:8080/api/v1/admin/groupware/chat/rooms/direct/by-employee-code')
  })
})
