export type TextCleanerInput = {
  text: string;
  markdown: string;
};

export type TextCleanerOutput = TextCleanerInput;

export interface TextCleaner {
  readonly name: string;
  clean: (input: TextCleanerInput) => Promise<TextCleanerOutput>;
}

export function createNoopTextCleaner(): TextCleaner {
  return {
    name: 'noop',
    clean: async (input) => ({ text: input.text, markdown: input.markdown }),
  };
}
