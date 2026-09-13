import { Kind } from '../shared/protocol'
import type { FileType } from '../shared/types'

/** Index = type code stored per entry in Tree.typeCode. */
export const TYPE_CODES: FileType[] = ['other', 'folder', 'app', 'video', 'image', 'audio', 'archive', 'document', 'code']

const OTHER = 0
const FOLDER = 1
const APP = 2

const EXTENSIONS: Partial<Record<FileType, string[]>> = {
  video: ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'wmv', 'flv', 'webm', 'mpg', 'mpeg', '3gp', 'mts'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'heic', 'heif', 'webp', 'tiff', 'tif', 'bmp', 'raw', 'cr2', 'nef', 'arw', 'dng', 'psd', 'svg', 'ico'],
  audio: ['mp3', 'm4a', 'aac', 'wav', 'flac', 'aiff', 'aif', 'ogg', 'opus', 'wma', 'caf'],
  archive: ['zip', 'dmg', 'pkg', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'iso', 'xip', 'ipa', 'apk', 'zst'],
  document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pages', 'numbers', 'key', 'txt', 'rtf', 'md', 'csv', 'epub', 'odt'],
  code: ['js', 'ts', 'tsx', 'jsx', 'json', 'py', 'swift', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'm', 'rs', 'go', 'rb', 'php', 'html', 'css', 'scss', 'sh', 'yml', 'yaml', 'toml', 'xml', 'sql', 'ipynb'],
}

const MAX_EXT = 6

/** Packs up to 6 extension bytes into one number (bytes are never 0, so keys are unique). */
function extKey(bytes: ArrayLike<number>, start: number, end: number): number {
  let key = 0
  let mul = 1
  for (let i = start; i < end; i++) {
    key += bytes[i] * mul
    mul *= 256
  }
  return key
}

const EXT_TO_CODE = new Map<number, number>()
for (const [type, exts] of Object.entries(EXTENSIONS)) {
  const code = TYPE_CODES.indexOf(type as FileType)
  for (const ext of exts ?? []) EXT_TO_CODE.set(extKey(Buffer.from(ext), 0, ext.length), code)
}

const APP_KEY = extKey(Buffer.from('app'), 0, 3)

/** Classifies a lowercase UTF-8 name occupying `lower[start, end)`. Returns a TYPE_CODES index. */
export function classify(lower: Uint8Array, start: number, end: number, kind: number): number {
  let dot = -1
  for (let i = end - 1; i > start && i >= end - MAX_EXT - 1; i--) {
    if (lower[i] === 46) {
      dot = i
      break
    }
  }
  if (kind === Kind.Dir) {
    return dot > 0 && end - dot - 1 === 3 && extKey(lower, dot + 1, end) === APP_KEY ? APP : FOLDER
  }
  if (kind !== Kind.File || dot < 0) return OTHER
  return EXT_TO_CODE.get(extKey(lower, dot + 1, end)) ?? OTHER
}

export function classifyName(name: string, kind: number): FileType {
  const bytes = Buffer.from(name.toLowerCase())
  return TYPE_CODES[classify(bytes, 0, bytes.length, kind)]
}
