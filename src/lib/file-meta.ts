import type { AssetType } from '../../shared/types';

export interface FileDialogFilter {
  name: string;
  extensions: string[];
}

export function fileDialogFiltersFor(assetType: AssetType): FileDialogFilter[] {
  return [
    {
      name: assetType.name_cn,
      extensions: assetType.file_exts.map((ext) => ext.replace(/^\./, '')),
    },
  ];
}

export function formatBytes(value: number | null | undefined): string {
  if (!value) {
    return '0 B';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  const kb = value / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}
