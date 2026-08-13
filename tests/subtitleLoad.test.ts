import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanHearingImpaired,
  convertSubtitlesToEntries,
  getLineByTime,
  Line,
  SubtitleContainer,
} from '../renderer/components/Subtitle/DataStructures.ts';

const SRT_ENTRIES = {
  type: 'srt',
  content: {
    entries: [
      {id: '1', from: 1000, to: 2000, text: 'Hello world'},
      {id: '2', from: 3000, to: 4000, text: 'Second line'},
    ],
  },
};

const mockParseSubtitle = (impl: (filename: string) => Promise<unknown>) => {
  (globalThis as Record<string, unknown>).window = {
    electronAPI: {parseSubtitle: impl},
  };
};

test('SubtitleContainer.create returns undefined for empty filename', async () => {
  mockParseSubtitle(async () => SRT_ENTRIES);
  const result = await SubtitleContainer.create('', 'ja', true);
  assert.equal(result, undefined);
});

test('SubtitleContainer.create loads SRT-type subtitles successfully', async () => {
  mockParseSubtitle(async (filename) => {
    assert.equal(filename, '/tmp/show.srt');
    return SRT_ENTRIES;
  });
  const container = await SubtitleContainer.create('/tmp/show.srt', 'ja', true);
  assert.equal(container.path, '/tmp/show.srt');
  assert.equal(container.language, 'ja');
  assert.equal(container.lines.length, 2);
  // timeEnd is extended by subtitleFramerate * subtitleEndPlusMultiplier (30 * 8)
  assert.equal(container.lines[0].timeStart, 1000);
  assert.equal(container.lines[0].timeEnd, 2240);
  assert.equal(container.lines[0].content, 'Hello world');
});

test('SubtitleContainer.create loads ASS subtitles and expands \\N newlines', async () => {
  mockParseSubtitle(async () => ({
    type: 'ass',
    content: [
      '[Script Info]',
      'Title: t',
      'ScriptType: v4.00+',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      'Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1',
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello\\NWorld',
    ].join('\n'),
  }));
  const container = await SubtitleContainer.create('/tmp/show.ass', 'ja', true);
  assert.equal(container.lines.length, 1);
  assert.equal(container.lines[0].content, 'Hello\nWorld');
  assert.equal(container.lines[0].timeStart, 1000);
  assert.equal(container.lines[0].timeEnd, 4240);
});

test('SubtitleContainer.create loads LRC subtitles successfully', async () => {
  mockParseSubtitle(async () => ({
    type: 'lrc',
    content: '[ti:Song]\n[00:01.00]first lyric\n[00:05.50]second lyric',
  }));
  const container = await SubtitleContainer.create('/tmp/song.lrc', 'ja', true);
  assert.equal(container.lines.length, 2);
  assert.equal(container.lines[0].content, 'first lyric');
  assert.equal(container.lines[1].content, 'second lyric');
});

test('SubtitleContainer.create loads HUF subtitles with syncMs offset', async () => {
  mockParseSubtitle(async () => ({
    type: 'huf',
    content: JSON.stringify({
      format: 'holokara-unified-format',
      version: '0.1.0',
      syncMs: 500,
      sentences: [
        {id: 'sentence-001', startMs: 1000, endMs: 2000, words: [{content: 'こん'}, {content: 'にちは'}]},
      ],
    }),
  }));
  const container = await SubtitleContainer.create('/tmp/song.huf', 'ja', true);
  assert.equal(container.lines.length, 1);
  assert.equal(container.lines[0].content, 'こんにちは');
  assert.equal(container.lines[0].timeStart, 1500);
});

test('SubtitleContainer.create rejects invalid HUF JSON', async () => {
  mockParseSubtitle(async () => ({type: 'huf', content: '{not json'}));
  await assert.rejects(
    () => SubtitleContainer.create('/tmp/bad.huf', 'ja', true),
    /Invalid HUF JSON content/,
  );
});

test('SubtitleContainer.create rejects HUF with wrong format marker', async () => {
  mockParseSubtitle(async () => ({
    type: 'huf',
    content: JSON.stringify({format: 'something-else', sentences: []}),
  }));
  await assert.rejects(
    () => SubtitleContainer.create('/tmp/bad.huf', 'ja', true),
    /Invalid HUF format/,
  );
});

test('SubtitleContainer.create propagates parser failure (e.g. missing file)', async () => {
  mockParseSubtitle(async () => {
    throw new Error('ENOENT: no such file or directory');
  });
  await assert.rejects(
    () => SubtitleContainer.create('/tmp/missing.srt', 'ja', true),
    /ENOENT/,
  );
});

test('SubtitleContainer.create skips entries whose adjusted start passes the end', async () => {
  mockParseSubtitle(async () => ({
    type: 'srt',
    content: {
      entries: [
        {id: '1', from: 1000, to: 5000, text: 'long line'},
        // starts before previous line's clamped position but ends way later: dropped
        {id: '2', from: 1000, to: 1000, text: 'stale line'},
      ],
    },
  }));
  const container = await SubtitleContainer.create('/tmp/show.srt', 'ja', true);
  assert.equal(container.lines.length, 1);
  assert.equal(container.lines[0].content, 'long line');
});

test('SubtitleContainer.create converts to simplified Chinese for mandarin', async () => {
  mockParseSubtitle(async () => ({
    type: 'srt',
    content: {entries: [{id: '1', from: 0, to: 1000, text: '臺灣語言'}]},
  }));
  const container = await SubtitleContainer.create('/tmp/show.srt', 'zh-CN', true);
  assert.equal(container.lines[0].content, '台湾语言');
});

test('SubtitleContainer.create converts to traditional Chinese when requested', async () => {
  mockParseSubtitle(async () => ({
    type: 'srt',
    content: {entries: [{id: '1', from: 0, to: 1000, text: '台湾语言'}]},
  }));
  const container = await SubtitleContainer.create('/tmp/show.srt', 'zh-CN', false);
  assert.equal(container.lines[0].content, '臺灣語言');
});

test('createFromArrayEntries clamps overlapping lines monotonically', () => {
  const container = new SubtitleContainer();
  SubtitleContainer.createFromArrayEntries(
    container,
    [
      {id: '1', from: 1000, to: 3000, text: 'a'},
      {id: '2', from: 1500, to: 4000, text: 'b'},
    ] as never,
    'ja',
    true,
  );
  assert.equal(container.lines.length, 2);
  assert.equal(container.lines[0].timeStart, 1000);
  // second line cannot start before the first line's reserved slot ends
  assert.equal(container.lines[1].timeStart, 3000 + 240 + 31);
  assert.ok(container.lines[0].timeStart < container.lines[1].timeStart);
});

test('getLineByTime returns the active line or empty content in gaps', () => {
  const container = new SubtitleContainer();
  SubtitleContainer.createFromArrayEntries(
    container,
    [
      {id: '1', from: 1000, to: 2000, text: 'first'},
      {id: '2', from: 10000, to: 11000, text: 'second'},
    ] as never,
    'ja',
    true,
  );
  assert.equal(getLineByTime(container, 1500).content, 'first');
  assert.equal(getLineByTime(container, 10100).content, 'second');
  assert.equal(getLineByTime(container, 5000).content, '');
  assert.equal(getLineByTime(new SubtitleContainer(), 0).content, '');
});

test('convertSubtitlesToEntries converts float seconds to milliseconds', () => {
  const entries = convertSubtitlesToEntries([{start: '1.5', dur: '2.25', text: 'hi'}]);
  assert.deepEqual(entries, [{id: 'subtitle-0', from: 1500, to: 3750, text: 'hi'}]);
});

test('cleanHearingImpaired strips brackets, speaker names and extra spaces', () => {
  assert.equal(cleanHearingImpaired('[Music] JOHN:  Hello   there （笑）'), 'Hello there');
  assert.equal(cleanHearingImpaired('(applause) nice one'), 'nice one');
  assert.equal(cleanHearingImpaired('plain text'), 'plain text');
});

test('Line honors the removeHearingImpairedFlag', () => {
  Line.removeHearingImpairedFlag = true;
  try {
    const line = new Line(0, 1000, '[SFX] Hello');
    assert.equal(line.content, 'Hello');
  } finally {
    Line.removeHearingImpairedFlag = false;
  }
});
