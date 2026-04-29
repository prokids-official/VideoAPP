import mammoth from 'mammoth'

type MammothMarkdownInput = { arrayBuffer: ArrayBuffer } | { buffer: Buffer }

interface MammothMarkdown {
  convertToMarkdown(input: MammothMarkdownInput): Promise<{ value: string }>
}

const mammothMarkdown = mammoth as unknown as MammothMarkdown

export async function docxToMarkdown(input: File | ArrayBuffer): Promise<string> {
  const arrayBuffer = input instanceof File ? await input.arrayBuffer() : input
  const result =
    typeof Buffer === 'undefined'
      ? await mammothMarkdown.convertToMarkdown({ arrayBuffer })
      : await mammothMarkdown.convertToMarkdown({ buffer: Buffer.from(arrayBuffer) })

  return result.value.trim()
}
