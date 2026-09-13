import type { FileType, Row } from '../../shared/types'

export const TYPE_LABELS: Record<FileType, string> = {
  folder: 'Folders',
  app: 'Apps',
  video: 'Videos',
  image: 'Images',
  audio: 'Audio',
  archive: 'Archives',
  document: 'Documents',
  code: 'Code',
  other: 'Other',
}

export function NameCell({ row }: { row: Row }) {
  return (
    <span className="name-cell" title={row.path}>
      <span className={`type-icon t-${row.kind === 'symlink' ? 'link' : row.type}`} aria-hidden />
      <span className="name-text">{row.name}</span>
    </span>
  )
}

export function parentPath(path: string): string {
  const i = path.lastIndexOf('/')
  return i <= 0 ? '/' : path.slice(0, i)
}
