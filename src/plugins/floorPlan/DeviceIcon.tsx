import React from 'react'
import {
  BoltIcon, BulbIcon, CameraIcon, CoverIcon, DoorIcon, DotIcon, DropletIcon, FanIcon,
  GaugeIcon, LockIcon, MotionIcon, PlugIcon, ShieldIcon, ThermoIcon,
} from '../../icons'
import type { EntityState } from '../../types'
import { domainOf } from './devices'

const SIZE = 17
const MOTION_CLASSES = ['motion', 'occupancy', 'moving', 'presence']
const OPENING_CLASSES = ['door', 'window', 'opening', 'garage_door']

const deviceClass = (state: EntityState | null | undefined) => String(state?.attributes?.device_class ?? '')

function measurementIcon(state: EntityState | null | undefined) {
  const kind = deviceClass(state)
  if (kind === 'humidity') return <DropletIcon size={SIZE} />
  if (kind === 'temperature') return <ThermoIcon size={SIZE} />
  return <GaugeIcon size={SIZE} />
}

function binarySensorIcon(state: EntityState | null | undefined) {
  const kind = deviceClass(state)
  if (MOTION_CLASSES.includes(kind)) return <MotionIcon size={SIZE} />
  if (OPENING_CLASSES.includes(kind)) return <DoorIcon size={SIZE} />
  return <DotIcon size={SIZE} />
}

const ICONS_BY_DOMAIN: Record<string, (state: EntityState | null | undefined) => React.ReactNode> = {
  light: () => <BulbIcon size={SIZE} />,
  switch: () => <PlugIcon size={SIZE} />,
  input_boolean: () => <PlugIcon size={SIZE} />,
  siren: () => <PlugIcon size={SIZE} />,
  fan: () => <FanIcon size={SIZE} />,
  lock: (state) => <LockIcon size={SIZE} open={state?.state !== 'locked'} />,
  alarm_control_panel: () => <ShieldIcon size={SIZE} />,
  climate: () => <ThermoIcon size={SIZE} />,
  humidifier: () => <ThermoIcon size={SIZE} />,
  cover: () => <CoverIcon size={SIZE} />,
  camera: () => <CameraIcon size={SIZE} />,
  scene: () => <BoltIcon size={SIZE} />,
  script: () => <BoltIcon size={SIZE} />,
  button: () => <BoltIcon size={SIZE} />,
  input_button: () => <BoltIcon size={SIZE} />,
  automation: () => <BoltIcon size={SIZE} />,
  sensor: measurementIcon,
  number: measurementIcon,
  input_number: measurementIcon,
  binary_sensor: binarySensorIcon,
}

/** Icon for an entity, by domain and device class. */
export function DeviceIcon({ entity, state }: { entity: string; state: EntityState | null | undefined }) {
  const icon = ICONS_BY_DOMAIN[domainOf(entity)]
  return <>{icon ? icon(state) : <DotIcon size={SIZE} />}</>
}
