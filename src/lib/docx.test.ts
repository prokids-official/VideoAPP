import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { docxToMarkdown } from './docx'

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

describe('docxToMarkdown', () => {
  it('converts a real docx script fixture into markdown text', async () => {
    const file = await readFile('src/test/fixtures/script.docx')
    const markdown = await docxToMarkdown(bufferToArrayBuffer(file))

    expect(markdown).toContain('# 侏儒怪 第一集')
    expect(markdown).toContain('旁白：很久很久以前，有一座磨坊。')
    expect(markdown).toContain('角色：磨坊主的女儿。')
  })
})
