export type BaseSuggestionIconId =
  | "weather"
  | "code"
  | "write"
  | "analyze"
  | "brainstorm"
  | "search"
  | "document"
  | "help";

export type ResolvedBaseConfig = {
  assistant: {
    appName: string;
    welcome: {
      headline: string;
      body: string;
    };
    labels: {
      composerPlaceholder: string;
      newThread: string;
      newChat: string;
    };
    suggestionGroups: Array<{
      id: string;
      label: string;
      icon: BaseSuggestionIconId;
      options: Array<{
        label: string;
        prompt: string;
      }>;
    }>;
    slashCommands: Array<{
      id: "summarize" | "compare";
      description: string;
      icon: "FileText" | "Columns2";
    }>;
  };
};

export const defaultBaseConfig = {
  assistant: {
    appName: "Arkivra Chat",
    welcome: {
      headline: "Ask about your documents",
      body: "",
    },
    labels: {
      composerPlaceholder: "Ask about documents, vaults, or search...",
      newThread: "New Thread",
      newChat: "New Chat",
    },
    suggestionGroups: [
      {
        id: "search",
        label: "Search",
        icon: "search",
        options: [
          {
            label: "find a document",
            prompt: "Find documents related to a contract renewal.",
          },
          {
            label: "search a vault",
            prompt: "Search my vaults for recent invoices.",
          },
          {
            label: "locate a policy",
            prompt: "Help me locate the latest policy document.",
          },
        ],
      },
      {
        id: "summarize",
        label: "Summarize",
        icon: "document",
        options: [
          {
            label: "a document",
            prompt: "Summarize the selected document.",
          },
          {
            label: "a folder",
            prompt: "Summarize the documents in this folder.",
          },
          {
            label: "key points",
            prompt: "Extract the key points from this document.",
          },
        ],
      },
    ],
    slashCommands: [
      {
        id: "summarize",
        description: "Summarize selected documents",
        icon: "FileText",
      },
      {
        id: "compare",
        description: "Compare selected documents",
        icon: "Columns2",
      },
    ],
  },
} satisfies ResolvedBaseConfig;
