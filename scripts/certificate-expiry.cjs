'use strict'

const DAY_MS = 24 * 60 * 60 * 1000

function classifyCertificateExpiry({ status, notAfter, now = new Date(), warningDays = 30 }) {
  const issued = status === 'issued'
  const expiry = new Date(String(notAfter || ''))
  if (!issued || Number.isNaN(expiry.getTime())) {
    return { kind: 'unknown', alert: issued, operationalIssue: issued }
  }
  const remainingDays = Math.ceil((expiry.getTime() - new Date(now).getTime()) / DAY_MS)
  if (remainingDays <= 0) return { kind: 'expired', alert: true, operationalIssue: true }
  if (remainingDays <= warningDays) return { kind: 'expiring-soon', alert: true, operationalIssue: false, remainingDays }
  return { kind: 'none', alert: false, operationalIssue: false, remainingDays }
}

module.exports = { classifyCertificateExpiry }
