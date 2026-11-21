// Upstream stores a branch's transliteration under the empty key alongside its
// children. Keeping the value separate lets TypeScript distinguish them.
export interface MappingTree {
  value?: string;
  children: Record<string, MappingTree>;
}

interface MappingTable {
  [key: string]: string | MappingTable;
}

export function transform(table: MappingTable): MappingTree {
  const root: MappingTree = {children: {}};
  for (const [key, subtree] of Object.entries(table)) {
    root.children[key] = typeof subtree === "string"
      ? {value: subtree, children: {}}
      : transform(subtree);
  }
  return root;
}

export function getSubTreeOf(tree: MappingTree, sequence: string): MappingTree {
  for (const char of sequence) {
    tree = tree.children[char] ??= {children: {}};
  }
  return tree;
}

/** Make a copy with each transliteration changed, for the two sokuon tables. */
export function mapValues(tree: MappingTree, convert: (value: string) => string): MappingTree {
  const copy: MappingTree = {children: {}};
  if (tree.value !== undefined) copy.value = convert(tree.value);
  for (const [key, subtree] of Object.entries(tree.children)) {
    copy.children[key] = mapValues(subtree, convert);
  }
  return copy;
}

/** Follow the current branch for as long as it matches. A branch without a
 * value appends the input character to its parent's transliteration. */
export function applyMapping(input: string, root: MappingTree): string {
  function newChunk(cursor: number): string {
    const first = input.charAt(cursor);
    const branch = root.children[first];
    return parse(branch, cursor + 1, branch?.value ?? first);
  }

  function parse(branch: MappingTree | undefined, cursor: number, value: string): string {
    if (cursor >= input.length) return value;
    const char = input.charAt(cursor);
    const subtree = branch?.children[char];
    if (!subtree) return value + newChunk(cursor);
    return parse(subtree, cursor + 1, subtree.value ?? value + char);
  }

  return newChunk(0);
}
