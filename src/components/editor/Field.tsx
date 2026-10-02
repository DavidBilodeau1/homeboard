import React from 'react'

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="ed-field"><span>{label}</span>{children}</label>
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="settings-note ed-note">{children}</p>
}

/** Number input that stores `undefined` when cleared, so the default applies again. */
export function NumberField({ label, value, fallback, onChange, ...limits }: {
  label: string
  value: number | undefined
  fallback?: number
  onChange: (value: number | undefined) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <Field label={label}>
      <input className="ed-input" type="number" {...limits} value={value ?? fallback ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
    </Field>
  )
}
