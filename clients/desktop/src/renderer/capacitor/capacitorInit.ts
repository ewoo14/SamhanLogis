const STATUS_BAR_BACKGROUND = '#2D77A8'

let started = false

/**
 * Capacitor 네이티브 WebView 의 기본 UX 플러그인을 초기화한다.
 *
 * 모든 플러그인은 동적 import 로만 로드해 Electron/PWA 런타임 경로를 건드리지 않는다.
 */
export async function initCapacitor(): Promise<void> {
  if (started) return
  started = true

  await Promise.all([
    initStatusBar(),
    initKeyboard(),
    initAppBackButton(),
  ])
}

async function initStatusBar(): Promise<void> {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')

    await StatusBar.setOverlaysWebView({ overlay: false })
    await StatusBar.setBackgroundColor({ color: STATUS_BAR_BACKGROUND })
    await StatusBar.setStyle({ style: Style.Dark })
  } catch (error) {
    console.warn('[capacitor] status bar 초기화 실패', error)
  }
}

async function initKeyboard(): Promise<void> {
  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard')

    await Promise.allSettled([
      Keyboard.setResizeMode({ mode: KeyboardResize.Native }),
      Keyboard.setScroll({ isDisabled: false }),
    ])

    await Keyboard.addListener('keyboardDidShow', () => {
      const active = document.activeElement
      if (!isScrollableInput(active)) return

      window.requestAnimationFrame(() => {
        active.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
      })
    })
  } catch (error) {
    console.warn('[capacitor] keyboard 초기화 실패', error)
  }
}

async function initAppBackButton(): Promise<void> {
  try {
    const { App } = await import('@capacitor/app')

    await App.addListener('backButton', async ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back()
        return
      }

      await App.exitApp()
    })
  } catch (error) {
    console.warn('[capacitor] app back 버튼 초기화 실패', error)
  }
}

function isScrollableInput(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false
  const tagName = element.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || element.isContentEditable
}
