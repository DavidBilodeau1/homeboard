import type { Translate } from '../../i18n'

/** Object labels arrive in English; translated when there is a word for them. */
export function labelName(t: Translate, label: string): string {
  const key = `label.${label}`
  const translated = t(key)
  return translated === key ? label.replace(/_/g, ' ') : translated
}
