import { describe, expect, it } from 'vitest'
import { classifyName } from '../../src/engine/fileTypes'
import { Kind } from '../../src/shared/protocol'

describe('classifyName', () => {
  it.each([
    ['Holiday.MOV', 'video'],
    ['photo.heic', 'image'],
    ['song.flac', 'audio'],
    ['Xcode_26.xip', 'archive'],
    ['report.pdf', 'document'],
    ['main.swift', 'code'],
    ['archive.tar.gz', 'archive'],
    ['README', 'other'],
    ['.zshrc', 'other'],
    ['weird.extensionlong', 'other'],
  ])('%s is %s', (name, type) => {
    expect(classifyName(name, Kind.File)).toBe(type)
  })

  it('treats .app directories as apps and other directories as folders', () => {
    expect(classifyName('Safari.app', Kind.Dir)).toBe('app')
    expect(classifyName('Documents', Kind.Dir)).toBe('folder')
    expect(classifyName('my.apps', Kind.Dir)).toBe('folder')
  })

  it('classifies symlinks and other kinds as other', () => {
    expect(classifyName('movie.mov', Kind.Symlink)).toBe('other')
    expect(classifyName('socket.mov', Kind.Other)).toBe('other')
  })
})
