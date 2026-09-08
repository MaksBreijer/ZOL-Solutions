export const APOLLO_SENIORITIES = ["owner", "founder", "partner", "head", "director", "manager"]

export function apolloPersonId(person = {}) {
  return String(person.id || person.person_id || "").trim().slice(0, 80)
}

export function buildPeopleSearch({ domain = "", organizationId = "", titles = [], includeTitles = true, includeSeniorities = true } = {}) {
  const params = new URLSearchParams({ include_similar_titles: "true", page: "1", per_page: "10" })
  if (organizationId) params.append("organization_ids[]", organizationId)
  else if (domain) params.append("q_organization_domains_list[]", domain)
  if (includeSeniorities) {
    for (const seniority of APOLLO_SENIORITIES) params.append("person_seniorities[]", seniority)
  }
  if (includeTitles) {
    for (const title of titles) params.append("person_titles[]", title)
  }
  return params
}
