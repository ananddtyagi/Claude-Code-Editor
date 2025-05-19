// Interface for the Claude Code response
export interface ClaudeResponse {
    answerText: string;
    fileChanges: FileChange[];
}

// Interface for file changes
export interface FileChange {
    filePath: string;
    additions: number;
    deletions: number;
    diffLines: string[];
}

// Interface for line number changes
export interface LineChanges {
    addedLines: number[];
    removedLines: number[];
}

// Interface for message types sent to the webview
export interface WebviewMessage {
    command: string;
    [key: string]: any;
}