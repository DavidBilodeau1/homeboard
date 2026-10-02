export const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

export const isOptionalString = (v) => v === undefined || typeof v === 'string'

export const isPositiveNumber = (v) => Number.isFinite(v) && v > 0

export const isOptionalPositive = (v) => v === undefined || isPositiveNumber(v)

/** Rows of `{ name, entity }` where an unassigned row has a null entity. */
export const isNamedRows = (v) =>
  v === undefined ||
  (Array.isArray(v) && v.every((row) => isObject(row) && typeof row.name === 'string' &&
    (row.entity == null || typeof row.entity === 'string')))

/** First failing check's message, or null. Each check is `[passes, message]`. */
export const firstError = (checks) => checks.find(([passes]) => !passes)?.[1] ?? null
