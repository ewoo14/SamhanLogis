export type DetailWindowDocumentType = 'OUTBOUND_SLIP' | 'INBOUND_SLIP' | 'TAX_INVOICE' | 'ESTIMATE' | 'PARTNER_ORDER' | 'TRANSFER' | 'INVENTORY_AUDIT'

export interface DetailWindowRequest {
  documentType: DetailWindowDocumentType
  documentId: string
  route: string
}

export interface DetailWindowLike {
  focus: () => void
  isDestroyed: () => boolean
  once?: (event: 'closed', listener: () => void) => void
}

export class DetailWindowRegistry<T extends DetailWindowLike = DetailWindowLike> {
  private readonly windows = new Map<string, T>()

  constructor(private readonly createWindow: (request: DetailWindowRequest) => T) {}

  open(request: DetailWindowRequest): T {
    const key = `${request.documentType}:${request.documentId}`
    const existing = this.windows.get(key)
    if (existing && !existing.isDestroyed()) {
      existing.focus()
      return existing
    }

    const window = this.createWindow(request)
    this.windows.set(key, window)
    window.once?.('closed', () => {
      if (this.windows.get(key) === window) this.windows.delete(key)
    })
    return window
  }
}
