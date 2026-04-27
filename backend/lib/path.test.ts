import { describe, expect, it } from 'vitest';
import { composeFolderPath, composeFullStorageRef } from './path';

describe('composeFolderPath', () => {
  it('substitutes {episode} from asset_types.folder_path', () => {
    expect(
      composeFolderPath({
        template: '02_Data/Shot/{episode}/Images',
        episode: '童话剧_NA_侏儒怪',
      }),
    ).toBe('02_Data/Shot/童话剧_NA_侏儒怪/Images');
  });

  it('returns template as-is when no placeholders', () => {
    expect(
      composeFolderPath({
        template: '02_Data/Script',
      }),
    ).toBe('02_Data/Script');
  });
});

describe('composeFullStorageRef', () => {
  it('joins episode_path + folder_path + filename', () => {
    expect(
      composeFullStorageRef({
        episodePath: '童话剧_NA_侏儒怪',
        folderPath: '02_Data/Script',
        finalFilename: '童话剧_侏儒怪_SCRIPT.md',
      }),
    ).toBe('童话剧_NA_侏儒怪/02_Data/Script/童话剧_侏儒怪_SCRIPT.md');
  });
});
