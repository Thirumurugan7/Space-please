// Mirrors scanner/Sources/ScannerCore/Frames.swift. Keep both in sync.

export const FrameType = { Entry: 1, Error: 2, Progress: 3, Done: 4 } as const

export const Kind = { File: 0, Dir: 1, Symlink: 2, Other: 3 } as const

export const FLAG_HARDLINK_DUPLICATE = 1

export const ROOT_PARENT = 0xffffffff
