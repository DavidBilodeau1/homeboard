import React from 'react'
import { PhotoSlideshow } from '../components/PhotoCard'
import { useStore } from '../store'

export function PhotosPage() {
  const { photos, t } = useStore()
  return (
    <div className="photos-page">
      <PhotoSlideshow className="photos-full" />
      {photos.length === 0 && (
        <div className="photos-hint">{t('photos.hint')}</div>
      )}
    </div>
  )
}
