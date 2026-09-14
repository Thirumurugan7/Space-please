import type { CleanupCategoryId, FileType } from '../../shared/types'

export type IconName =
  | 'drive'
  | 'home'
  | 'folder'
  | 'overview'
  | 'search'
  | 'sparkle'
  | 'report'
  | 'trash'
  | 'download'
  | 'layers'
  | 'code'
  | 'bolt'
  | 'file'
  | 'copy'
  | 'video'
  | 'image'
  | 'audio'
  | 'archive'
  | 'app'
  | 'link'
  | 'shield'

const PATHS: Record<IconName, string> = {
  drive: 'M3 14h18M5.5 5h13l2.5 9v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4zM17 17h.01',
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  overview: 'M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  report: 'M5 20V11M11 20V4M17 20v-6M3 20h18',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  code: 'M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  video: 'M4 6h12v12H4zM16 10l5-3v10l-5-3',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  audio: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  archive: 'M4 4h16v5H4zM5 9v11h14V9M10 13h4',
  app: 'M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  shield: 'M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z',
}

export const TYPE_ICONS: Record<FileType | 'link', IconName> = {
  folder: 'folder',
  app: 'app',
  video: 'video',
  image: 'image',
  audio: 'audio',
  archive: 'archive',
  document: 'file',
  code: 'code',
  other: 'file',
  link: 'link',
}

export const CATEGORY_ICONS: Record<CleanupCategoryId | 'duplicates', IconName> = {
  large: 'bolt',
  downloads: 'download',
  caches: 'layers',
  developer: 'code',
  trash: 'trash',
  duplicates: 'copy',
}

interface Props {
  name: IconName
  size?: number
  className?: string
}

export function Icon({ name, size = 16, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Gradient squircle holding a category icon, used on cleanup and report cards. */
export function CategoryTile({ id }: { id: CleanupCategoryId | 'duplicates' }) {
  return (
    <span className={`cat-tile c-${id}`}>
      <Icon name={CATEGORY_ICONS[id]} size={18} />
    </span>
  )
}
