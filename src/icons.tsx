import React from 'react'

const I = ({ children, size = 22 }: { children: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

export const MenuIcon = () => (
  <I><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></I>
)

export const DashboardIcon = () => (
  <I>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="3.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </I>
)

export const CalendarIcon = () => (
  <I>
    <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
    <line x1="4" y1="10" x2="20" y2="10" />
    <line x1="8.5" y1="3.5" x2="8.5" y2="7" />
    <line x1="15.5" y1="3.5" x2="15.5" y2="7" />
  </I>
)

export const TasksIcon = () => (
  <I>
    <path d="M5 7.5l1.7 1.7L10 5.9" />
    <line x1="13" y1="7.5" x2="19.5" y2="7.5" />
    <path d="M5 15.5l1.7 1.7 3.3-3.3" />
    <line x1="13" y1="15.5" x2="19.5" y2="15.5" />
  </I>
)

export const StarIcon = ({ filled = false, size = 22 }: { filled?: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
    fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6z" />
  </svg>
)

export const ListsIcon = () => (
  <I>
    <rect x="4.5" y="4" width="15" height="16" rx="2.5" />
    <line x1="8" y1="8.5" x2="16" y2="8.5" />
    <line x1="8" y1="12" x2="16" y2="12" />
    <line x1="8" y1="15.5" x2="13" y2="15.5" />
  </I>
)

export const MealsIcon = () => (
  <I>
    <path d="M7 3.5v6M4.5 3.5v4a2.5 2.5 0 0 0 5 0v-4" />
    <line x1="7" y1="12" x2="7" y2="20.5" />
    <path d="M16.5 3.5c-1.7 0-3 2-3 4.5s1.3 4.5 3 4.5v8" />
  </I>
)

export const PhotosIcon = () => (
  <I>
    <rect x="4" y="5" width="16" height="14" rx="2.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4.5 17l4.5-4.5 3.5 3.5 3-3 4 4" />
  </I>
)

export const SettingsIcon = () => (
  <I>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 4v2.2M12 17.8V20M4 12h2.2M17.8 12H20M6.3 6.3l1.6 1.6M16.1 16.1l1.6 1.6M6.3 17.7l1.6-1.6M16.1 7.9l1.6-1.6" />
  </I>
)

export const WifiIcon = () => (
  <I>
    <path d="M4 9.5a12 12 0 0 1 16 0" />
    <path d="M7 13a8 8 0 0 1 10 0" />
    <path d="M9.8 16.2a4 4 0 0 1 4.4 0" />
    <circle cx="12" cy="19" r="0.8" fill="currentColor" stroke="none" />
  </I>
)

export const BinIcon = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <path d="M4 7h16" />
    <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    <path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
    <path d="M10 11v6M14 11v6" />
  </I>
)

export const EditIcon = ({ size = 22 }: { size?: number }) => (
  <I size={size}>
    <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
    <path d="M13.5 6.5l3 3" />
  </I>
)

export const HomeIcon = () => (
  <I>
    <path d="M4 11l8-6.5L20 11" />
    <path d="M6 9.8V19a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V9.8" />
    <path d="M10 20.5v-5h4v5" />
  </I>
)

export const FloorPlanIcon = () => (
  <I>
    <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
    <path d="M3.5 12h7M10.5 12V20.5M10.5 8h10M14.5 3.5V8" />
  </I>
)

export const BulbIcon = ({ size = 22 }: { size?: number }) => (
  <I size={size}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.8.6 1.5 1.2 1.5 2.1v.5h4V16c0-.9.7-1.5 1.5-2.1A6 6 0 0 0 12 3z" />
  </I>
)

export const LockIcon = ({ size = 20, open = false }: { size?: number; open?: boolean }) => (
  <I size={size}>
    <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
    {open
      ? <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 6.9-.9" />
      : <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />}
    <circle cx="12" cy="15.2" r="1.2" fill="currentColor" stroke="none" />
  </I>
)

export const ShieldIcon = ({ size = 20 }: { size?: number }) => (
  <I size={size}><path d="M12 3.5l7 2.5v5.2c0 4.4-2.9 7.6-7 9.3-4.1-1.7-7-4.9-7-9.3V6z" /></I>
)

export const CameraIcon = ({ size = 20 }: { size?: number }) => (
  <I size={size}>
    <rect x="3.5" y="7" width="13" height="10" rx="2" />
    <path d="M16.5 10.5l4-2.2v7.4l-4-2.2" />
  </I>
)

export const ThermoIcon = ({ size = 20 }: { size?: number }) => (
  <I size={size}>
    <path d="M10.5 4.5a1.5 1.5 0 0 1 3 0v8.6a4 4 0 1 1-3 0z" />
    <line x1="12" y1="9" x2="12" y2="15" />
  </I>
)

export const PoolIcon = ({ size = 20 }: { size?: number }) => (
  <I size={size}>
    <path d="M3 16c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0" />
    <path d="M8 13V6a2 2 0 0 1 4 0M16 13V6a2 2 0 0 0-4 0" />
  </I>
)

export const AirIcon = ({ size = 20 }: { size?: number }) => (
  <I size={size}><path d="M4 9h9a2.5 2.5 0 1 0-2.4-3.2M4 13h13a2.5 2.5 0 1 1-2.4 3.2M4 17h6" /></I>
)

export const MoonIcon = ({ size = 20 }: { size?: number }) => (
  <I size={size}><path d="M19 14.5A8 8 0 0 1 9.5 5 7 7 0 1 0 19 14.5z" /></I>
)

export const SunIcon = ({ size = 20 }: { size?: number }) => (
  <I size={size}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
  </I>
)

export const PlugIcon = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <path d="M9 3v5M15 3v5" />
    <path d="M6 8h12v3a6 6 0 0 1-12 0z" />
    <path d="M12 17v4" />
  </I>
)

export const FanIcon = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <path d="M12 10.4c0-4 .6-6.4 2.4-6.4 1.6 0 2.2 2 1 4.2-1 1.8-2.4 2.2-3.4 2.2" />
    <path d="M13.6 12c4 0 6.4.6 6.4 2.4 0 1.6-2 2.2-4.2 1-1.8-1-2.2-2.4-2.2-3.4" />
    <path d="M12 13.6c0 4-.6 6.4-2.4 6.4-1.6 0-2.2-2-1-4.2 1-1.8 2.4-2.2 3.4-2.2" />
    <path d="M10.4 12c-4 0-6.4-.6-6.4-2.4 0-1.6 2-2.2 4.2-1 1.8 1 2.2 2.4 2.2 3.4" />
  </I>
)

export const GaugeIcon = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <path d="M4 15a8 8 0 0 1 16 0" />
    <path d="M12 15l4-3" />
    <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" />
  </I>
)

export const DropletIcon = ({ size = 18 }: { size?: number }) => (
  <I size={size}><path d="M12 3.5s5 5.6 5 9.2a5 5 0 0 1-10 0c0-3.6 5-9.2 5-9.2z" /></I>
)

export const MotionIcon = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <circle cx="13" cy="5.5" r="1.6" />
    <path d="M6 21l3-5 2-3 1 3 3 2M11 13l-1-4 4 1 2 3" />
  </I>
)

export const BoltIcon = ({ size = 18 }: { size?: number }) => (
  <I size={size}><path d="M13 3L5 13h6l-1 8 8-11h-6l1-7z" /></I>
)

export const CoverIcon = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <rect x="4.5" y="4" width="15" height="4" rx="1" />
    <path d="M6 8v9M10 8v9M14 8v9M18 8v9" />
    <path d="M4.5 17h15" />
  </I>
)

export const DoorIcon = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <path d="M6 20V4h9a1 1 0 0 1 1 1v15" />
    <path d="M4.5 20h15" />
    <circle cx="13" cy="12" r="0.9" fill="currentColor" stroke="none" />
  </I>
)

export const DotIcon = ({ size = 18 }: { size?: number }) => (
  <I size={size}><circle cx="12" cy="12" r="5" /></I>
)

export const ChevronDown = ({ size = 14 }: { size?: number }) => (
  <I size={size}><path d="M6 9l6 6 6-6" /></I>
)

export const ChevronLeft = ({ size = 18 }: { size?: number }) => (
  <I size={size}><path d="M14 6l-6 6 6 6" /></I>
)

export const ChevronRight = ({ size = 18 }: { size?: number }) => (
  <I size={size}><path d="M10 6l6 6-6 6" /></I>
)

export const PlusIcon = ({ size = 16 }: { size?: number }) => (
  <I size={size}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></I>
)

export const TrashIcon = ({ size = 15 }: { size?: number }) => (
  <I size={size}>
    <path d="M5 7h14M10 7V5h4v2M8 7l.7 12h6.6L16 7" />
  </I>
)

/** Weather condition icon (HA condition strings). */
export const WeatherIcon = ({ condition, size = 22 }: { condition: string; size?: number }) => {
  const sun = <circle cx="12" cy="12" r="4.2" fill="#F6C445" stroke="#F6C445" />
  const rays = (
    <g stroke="#F6C445">
      <path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7" />
    </g>
  )
  const cloud = (fill: string) => (
    <path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17.1 9.6 3.8 3.8 0 0 1 16.8 17.2z"
      fill={fill} stroke={fill} transform="translate(0,1)" />
  )
  const base = (children: React.ReactNode) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  )
  switch (condition) {
    case 'sunny':
    case 'clear':
      return base(<>{sun}{rays}</>)
    case 'clear-night':
      return base(<path d="M19 14.5A8 8 0 0 1 9.5 5 7 7 0 1 0 19 14.5z" fill="#98A6C9" stroke="#98A6C9" />)
    case 'partlycloudy':
      return base(<><g transform="translate(3,-2) scale(.7)">{sun}{rays}</g>{cloud('#C9CDD6')}</>)
    case 'rainy':
    case 'pouring':
      return base(<>{cloud('#AEB6C4')}<g stroke="#6FA8DC"><path d="M9 20l-.8 2M13 20l-.8 2M17 20l-.8 2" /></g></>)
    case 'snowy':
    case 'snowy-rainy':
      return base(<>{cloud('#AEB6C4')}<g fill="#9DC3E6" stroke="none"><circle cx="9" cy="21" r="1" /><circle cx="13" cy="21.5" r="1" /><circle cx="17" cy="21" r="1" /></g></>)
    case 'lightning':
    case 'lightning-rainy':
      return base(<>{cloud('#AEB6C4')}<path d="M12 17l-2 4h3l-1.5 3" stroke="#F6C445" /></>)
    case 'fog':
      return base(<g stroke="#B9BDC7"><path d="M4 10h16M6 14h13M4 18h15" /></g>)
    case 'windy':
      return base(<g stroke="#B9BDC7"><path d="M4 9h9a2.5 2.5 0 1 0-2.4-3.2M4 14h13a2.5 2.5 0 1 1-2.4 3.2" /></g>)
    default:
      return base(cloud('#C9CDD6'))
  }
}
