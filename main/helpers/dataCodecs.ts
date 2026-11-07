/**
 * Codecs for the values of a data table (docs/DATA_FORMAT.md): the build encodes each source file
 * into a value, the app decodes a value into the file's exact text. A codec is named by the table
 * header's `codec` field; a change that old values would not survive gets a new id.
 */

export interface Codec {
  /** The id written into table headers. */
  id: string;
  /** The value to store for a source file's text. */
  encode: (text: string) => Buffer;
  /** The text a stored value stands for. */
  decode: (value: Buffer) => string;
}

/** The value is the file's UTF-8 text. */
export const textCodec: Codec = {
  id: "text",
  encode: (text) => Buffer.from(text, "utf8"),
  decode: (value) => value.toString("utf8")
};

/**
 * Make Me a Hanzi stroke SVGs. The files are one generator's output: a fixed grid, then per stroke
 * a CSS animation (with a few numbers), the stroke's outline twice (a fill and a clip path), and its
 * median line. A value keeps only what differs between characters and decode rebuilds the text from
 * the template below, byte for byte:
 *
 *   byte 0      0x01: structured; 0x00: the rest is the original file's text (a file the template
 *               does not reproduce exactly, stored as it is)
 *   structured  one line per stroke, in stroke order, tab-separated; trailing empty fields are left out:
 *                 outline, median, dasharray, dashoffset, percentage, duration, delay
 *               Every field is the text the file writes (the number only: "74", "0.97265625", not "74%"
 *               or "0.97265625s"), never a rounded or recomputed number. The generator computes most
 *               numbers from the median's length, so a field that equals what that rule gives is
 *               left empty (see `derived`), and an exception is stored as the file writes it:
 *                 dasharray   "760" stands for "760 1520" (the length, then twice it); anything else
 *                             is the whole attribute, which has a space in it
 *                 dashoffset  the length + 128
 *                 percentage  round(100 * dashoffset / (dashoffset + 307.2))
 *                 duration    (5 * dashoffset + 1536) / 6144
 *                 delay       the previous stroke's delay + duration (0 for the first)
 *               Over all 9,574 characters the rules hold for every dashoffset, delay, dasharray and
 *               percentage, and for all but 18 of 112,617 durations (float rounding), which are stored.
 */
const STRUCTURED = 0x01;
const RAW = 0x00;

const HEAD = `<svg version="1.1" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <g stroke="lightgray" stroke-dasharray="1,1" stroke-width="1" transform="scale(4, 4)">
    <line x1="0" y1="0" x2="256" y2="256"></line>
    <line x1="256" y1="0" x2="0" y2="256"></line>
    <line x1="128" y1="0" x2="128" y2="256"></line>
    <line x1="0" y1="128" x2="256" y2="128"></line>
  </g>
  <g transform="scale(1, -1) translate(0, -900)">
    <style type="text/css">
`;

const animation = (i: number, dashoffset: string, percentage: string, duration: string, delay: string) => `      
        @keyframes keyframes${i} {
          from {
            stroke: blue;
            stroke-dashoffset: ${dashoffset};
            stroke-width: 128;
          }
          ${percentage}% {
            animation-timing-function: step-end;
            stroke: blue;
            stroke-dashoffset: 0;
            stroke-width: 128;
          }
          to {
            stroke: black;
            stroke-width: 1024;
          }
        }
        #make-me-a-hanzi-animation-${i} {
          animation: keyframes${i} ${duration}s both;
          animation-delay: ${delay}s;
          animation-timing-function: linear;
        }
`;

const BETWEEN_STYLE_AND_OUTLINES = `      
    </style>
`;

const outlineFill = (outline: string) => `    
      <path d="${outline}" fill="lightgray"></path>
`;

const BETWEEN_OUTLINES_AND_CLIPS = `    
`;

const clip = (i: number, outline: string, median: string, dasharray: string) => `    
      <clipPath id="make-me-a-hanzi-clip-${i}">
        <path d="${outline}"></path>
      </clipPath>
      <path clip-path="url(#make-me-a-hanzi-clip-${i})" d="${median}" fill="none" id="make-me-a-hanzi-animation-${i}" stroke-dasharray="${dasharray}" stroke-linecap="round"></path>
`;

const TAIL = `    
  </g>
</svg>`;

type Stroke = [outline: string, median: string, dashoffset: string, percentage: string, duration: string, delay: string, dasharray: string];

const render = (strokes: Stroke[]): string => {
  let text = HEAD;
  strokes.forEach(([, , dashoffset, percentage, duration, delay], i) => {
    text += animation(i, dashoffset, percentage, duration, delay);
  });
  text += BETWEEN_STYLE_AND_OUTLINES;
  for (const [outline] of strokes) text += outlineFill(outline);
  text += BETWEEN_OUTLINES_AND_CLIPS;
  strokes.forEach(([outline, median, , , , , dasharray], i) => {
    text += clip(i, outline, median, dasharray);
  });
  return text + TAIL;
};

const ANIMATION_PATTERN = /@keyframes keyframes(\d+) \{\s+from \{\s+stroke: blue;\s+stroke-dashoffset: ([^;]*);[^}]*\}\s+([^%\s]*)% \{[^}]*\}\s+to \{[^}]*\}\s+\}\s+#make-me-a-hanzi-animation-\d+ \{\s+animation: keyframes\d+ ([^\s]*?)s both;\s+animation-delay: ([^\s]*?)s;/g;
const OUTLINE_PATTERN = /<path d="([^"]*)" fill="lightgray"><\/path>/g;
const MEDIAN_PATTERN = /<path clip-path="url\(#make-me-a-hanzi-clip-\d+\)" d="([^"]*)" fill="none" id="make-me-a-hanzi-animation-\d+" stroke-dasharray="([^"]*)" stroke-linecap="round"><\/path>/g;

const SEPARATORS = /[\t\n]/;

/** The strokes of an SVG, or null when it does not have the shape the template draws. */
const parse = (text: string): Stroke[] | null => {
  const animations = [...text.matchAll(ANIMATION_PATTERN)];
  const outlines = [...text.matchAll(OUTLINE_PATTERN)];
  const medians = [...text.matchAll(MEDIAN_PATTERN)];
  if (animations.length === 0 || animations.length !== outlines.length || animations.length !== medians.length) return null;
  const strokes = animations.map((a, i): Stroke => [outlines[i][1], medians[i][1], a[2], a[3], a[4], a[5], medians[i][2]]);
  return strokes.some((stroke) => stroke.some((field) => SEPARATORS.test(field))) ? null : strokes;
};

const raw = (text: string) => Buffer.concat([Buffer.from([RAW]), Buffer.from(text, "utf8")]);

/**
 * What the generator's rules give for a stroke's dashoffset, percentage, duration and delay (the
 * number texts), from its dasharray text and the previous stroke's delay and duration texts.
 */
const derived = (dasharray: string, previous: Stroke | null) => {
  const length = Number(dasharray.split(" ")[0]);
  const dashoffset = length + 128;
  return {
    dashoffset: String(dashoffset),
    percentage: String(Math.round((100 * dashoffset) / (dashoffset + 307.2))),
    duration: String((5 * dashoffset + 1536) / 6144),
    delay: previous ? String(Number(previous[5]) + Number(previous[4])) : "0"
  };
};

/** The dasharray field: "760" for "760 1520", otherwise the attribute as it is. */
const shortDasharray = (dasharray: string) => {
  const [first, second, ...rest] = dasharray.split(" ");
  return rest.length === 0 && String(Number(first)) === first && String(2 * Number(first)) === second ? first : dasharray;
};
const fullDasharray = (field: string) => (field.includes(" ") ? field : `${field} ${2 * Number(field)}`);

const pack = (strokes: Stroke[]): string => strokes.map((stroke, i) => {
  const [outline, median, dashoffset, percentage, duration, delay, dasharray] = stroke;
  const rule = derived(dasharray, i > 0 ? strokes[i - 1] : null);
  const fields = [
    outline, median, shortDasharray(dasharray),
    dashoffset === rule.dashoffset ? "" : dashoffset,
    percentage === rule.percentage ? "" : percentage,
    duration === rule.duration ? "" : duration,
    delay === rule.delay ? "" : delay
  ];
  while (fields[fields.length - 1] === "") fields.pop();
  return fields.join("\t");
}).join("\n");

const unpack = (body: string): Stroke[] => {
  const strokes: Stroke[] = [];
  for (const line of body.split("\n")) {
    const fields = line.split("\t");
    if (fields.length < 3 || fields.length > 7) throw new Error("mmah-svg-1: a stroke does not have 3 to 7 fields");
    const dasharray = fullDasharray(fields[2]);
    const rule = derived(dasharray, strokes.at(-1) ?? null);
    strokes.push([fields[0], fields[1], fields[3] || rule.dashoffset, fields[4] || rule.percentage, fields[5] || rule.duration, fields[6] || rule.delay, dasharray]);
  }
  return strokes;
};

const decodeMmah = (value: Buffer): string => {
  const body = value.subarray(1).toString("utf8");
  if (value[0] === RAW) return body;
  if (value[0] !== STRUCTURED) throw new Error(`mmah-svg-1: unknown value kind ${value[0]}`);
  return render(unpack(body));
};

export const mmahSvgCodec: Codec & { isStructured: (value: Buffer) => boolean } = {
  id: "mmah-svg-1",
  encode: (text) => {
    const strokes = parse(text);
    if (!strokes) return raw(text);
    const value = Buffer.concat([Buffer.from([STRUCTURED]), Buffer.from(pack(strokes), "utf8")]);
    // The check that makes the rules safe: whatever they do not reproduce is stored as plain text.
    try {
      if (decodeMmah(value) === text) return value;
    } catch {
      // fall through to the plain text
    }
    return raw(text);
  },
  decode: decodeMmah,
  isStructured: (value) => value[0] === STRUCTURED
};

const CODECS: Record<string, Codec> = {
  [textCodec.id]: textCodec,
  [mmahSvgCodec.id]: mmahSvgCodec
};

/** The codec a table header names; unknown ids are an error, not a guess. */
export const codecFor = (id: string): Codec => {
  const codec = CODECS[id];
  if (!codec) throw new Error(`Unknown data codec "${id}"`);
  return codec;
};
