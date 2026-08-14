export interface TrustRootState {
  installed: boolean
  declined: boolean
}

export interface TrustRootPromptResult extends TrustRootState {
  shouldAskNextRun: boolean
  shouldBlockApp?: boolean
  updateDisabled?: boolean
}

export type TrustRootAction = 'startup' | 'approve' | 'decline'

export function reconcileTrustRootState(state: TrustRootState, rootExists: boolean): TrustRootState {
  return { installed: rootExists, declined: rootExists ? false : state.declined }
}

export function decideTrustRootPrompt(state: TrustRootState, action: TrustRootAction): TrustRootPromptResult {
  if (action === 'decline') return { installed: false, declined: true, shouldAskNextRun: true, shouldBlockApp: false, updateDisabled: true }
  if (action === 'approve') return { installed: true, declined: false, shouldAskNextRun: false, shouldBlockApp: false, updateDisabled: false }
  return {
    installed: state.installed,
    declined: state.declined,
    shouldAskNextRun: !state.installed,
    shouldBlockApp: false,
    updateDisabled: !state.installed,
  }
}
