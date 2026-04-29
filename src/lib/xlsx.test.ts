import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { xlsxToMarkdown } from './xlsx'

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

describe('xlsxToMarkdown', () => {
  it('converts a real xlsx fixture into a markdown table', async () => {
    const file = await readFile('src/test/fixtures/shot-list.xlsx')
    const markdown = await xlsxToMarkdown(bufferToArrayBuffer(file))

    expect(markdown).toContain('| 镜号 | 画面 | 提示词 |')
    expect(markdown).toContain('| 001 | 磨坊外景 | moonlit mill, storybook style |')
    expect(markdown).toContain('| 002 | 室内纺线 | girl spinning straw into gold |')
  })
})
