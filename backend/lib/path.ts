import { normalize } from './filename-resolver';

const FOLDER_VAR = /\{(episode|content)\}/g;

export function composeFolderPath(opts: {
  template: string;
  episode?: string;
  content?: string;
}): string {
  return opts.template.replace(FOLDER_VAR, (_placeholder, key: 'episode' | 'content') => {
    const value = opts[key];

    if (!value) {
      throw new Error(`composeFolderPath: missing ${key} for template ${opts.template}`);
    }

    return normalize(value);
  });
}

export function composeFullStorageRef(opts: {
  episodePath: string;
  folderPath: string;
  finalFilename: string;
}): string {
  return `${opts.episodePath}/${opts.folderPath}/${opts.finalFilename}`;
}
