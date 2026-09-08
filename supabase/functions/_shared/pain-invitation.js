export function painInvitationDelayDays(value) {
  const days = Number(value)
  return Number.isFinite(days) ? Math.min(30, Math.max(1, Math.round(days))) : 7
}

export function painInvitationEligible(order, config, now = new Date()) {
  if (order?.fulfillment_status !== 'delivered' || !order?.delivered_at) return false
  const deliveredAt = new Date(order.delivered_at).getTime()
  if (!Number.isFinite(deliveredAt)) return false
  const delay = painInvitationDelayDays(config?.invitation_delay_days_after_delivery)
  return deliveredAt <= now.getTime() - delay * 86_400_000
}
