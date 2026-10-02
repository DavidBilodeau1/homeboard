import en from './en.json'
import fr from './fr.json'

export type Messages = Record<string, string>
/** Messages per language code. */
export type MessageBundle = Record<string, Messages>
export type Translate = (key: string, vars?: Record<string, string | number>) => string

const CORE_MESSAGES: MessageBundle = { en, fr }
const FALLBACK_LANGUAGE = 'en'

export const availableLanguages = Object.keys(CORE_MESSAGES)

/** Core messages with every extra bundle merged in, per language. */
export const withMessages = (bundles: MessageBundle[]): MessageBundle =>
  Object.fromEntries(availableLanguages.map((lang) => [
    lang,
    Object.assign({}, CORE_MESSAGES[lang], ...bundles.map((bundle) => bundle[lang])),
  ]))

/** Key lookup with `{var}` interpolation and English fallback; a numeric `count` picks `key_one` / `key_other`. */
export const makeT = (lang: string, messages: MessageBundle = CORE_MESSAGES): Translate => {
  const dict = messages[lang] ?? messages[FALLBACK_LANGUAGE]
  const lookup = (key: string) => dict[key] ?? messages[FALLBACK_LANGUAGE][key]
  return (key, vars) => {
    const plural = vars && typeof vars.count === 'number' ? lookup(`${key}_${vars.count === 1 ? 'one' : 'other'}`) : undefined
    let text = plural ?? lookup(key) ?? key
    for (const [name, value] of Object.entries(vars ?? {})) text = text.replaceAll(`{${name}}`, String(value))
    return text
  }
}

/** config.language, else the config.locale prefix, else the browser language. */
export const resolveLanguage = (language?: string, locale?: string): string => {
  const candidate = (language || locale || navigator.language || FALLBACK_LANGUAGE).slice(0, 2).toLowerCase()
  return CORE_MESSAGES[candidate] ? candidate : FALLBACK_LANGUAGE
}
