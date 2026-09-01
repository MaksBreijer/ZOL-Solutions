const validOptions = {
  pain_moment: new Set(['during-sport', 'after-sport', 'rest']),
  pain_duration: new Set(['less-2-weeks', '2-6-weeks', 'more-6-weeks']),
  pain_side: new Set(['left', 'right', 'both']),
  discovery_source: new Set(['google', 'social', 'professional', 'friends-family', 'other']),
}

export function checkoutIntake(source = {}) {
  return {
    pain_moment: String(source.pain_moment || ''),
    pain_duration: String(source.pain_duration || ''),
    pain_side: String(source.pain_side || ''),
    discovery_source: String(source.discovery_source || ''),
    discovery_details: String(source.discovery_details || '').trim().replace(/\s+/g, ' ').slice(0, 120),
  }
}

export function completedIntakeAnswers(source = {}) {
  const intake = checkoutIntake(source)
  return Number(validOptions.pain_moment.has(intake.pain_moment))
    + Number(validOptions.pain_duration.has(intake.pain_duration))
    + Number(validOptions.pain_side.has(intake.pain_side))
    + Number(validOptions.discovery_source.has(intake.discovery_source))
}

export function isCheckoutIntakeComplete(source = {}) {
  return completedIntakeAnswers(source) === 4
}
