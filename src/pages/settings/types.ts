import type { EntityOption } from '../../components/editor/useEntityOptions'
import type { AppConfig } from '../../types'

/** Applies a change to a copy of the draft config. */
export type UpdateDraft = (change: (draft: AppConfig) => void) => void

export interface TabProps {
  draft: AppConfig
  update: UpdateDraft
  entities: EntityOption[]
}
