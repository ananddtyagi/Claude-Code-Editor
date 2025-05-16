Building a VS Code extension that acts as a Claude Code interface panel. 

# Development Plan for Claude Code VS Code Extension

## Phase 1: Project Setup and Scaffolding (1 point)

**Goal:** Initialize a VS Code extension project with the necessary configuration.

* **Step 1.1 – Scaffold the Extension:** Use the Yeoman VS Code Extension Generator (`yo code`) or manual setup to create a new extension project (Node.js/TypeScript). This generates the base files (`package.json`, `extension.ts`, etc.) and structure.
* **Step 1.2 – Define Activation and Commands:** In `package.json`, add an activation event (e.g. on command or on VS Code start) and a command (e.g. `extension.openClaudeChat`) that will open the Claude chat panel. Ensure the extension is configured to run in the VS Code sidebar or panel as needed.
* **Step 1.3 – Install Dependencies:** Initialize npm and add any needed packages (e.g. for diff parsing or UI). For example, prepare to install a git diff parser library (such as **`parse-diff`** or **`parse-git-diff`**) and possibly other utilities (ANSI to text converters, etc.).

## Phase 2: Chat Panel Webview Implementation (3 points)

**Goal:** Create a custom Webview Panel in VS Code that will serve as the chat interface.

* **Step 2.1 – Create Webview Panel:** Use the VS Code Webview API to open a webview panel when the user activates the command. For example, in `activate()`, register a command that calls `vscode.window.createWebviewPanel(...)` with a specific view type and title (e.g. "Claude Chat") to show the panel.
* **Step 2.2 – Basic UI Layout:** Design a simple HTML/CSS layout for the chat interface. Include a scrollable **messages area** (to display conversation) and an **input box** with a send button for user queries. Initially, implement a placeholder UI (e.g. a static welcome message) to verify the webview loads. Keep the HTML/CSS/JS simple and clear (you can use plain JavaScript or a lightweight framework if comfortable, but it’s not required).
* **Step 2.3 – Webview Messaging Setup:** Enable script support in the webview and set up message passing. In the extension code, set `webview.options = { enableScripts: true, enableCommandUris: true }` to allow the webview to run scripts and use command URIs. In the webview’s JS (loaded via a `<script>` tag), call `acquireVsCodeApi()` to get the VS Code API bridge, and set up an event listener for `message` events to receive data from the extension. Conversely, prepare to use `panel.webview.postMessage()` in the extension to send Claude’s responses to the webview.
* **Step 2.4 – Send Input from Webview to Extension:** Implement a form submission or button click handler in the webview that takes the user’s query from the input box and sends it to the extension host via `vscode.postMessage({ command: 'userQuery', text: <user_input> })`. In the extension code (`extension.ts`), use `panel.webview.onDidReceiveMessage` to listen for these messages. When a `'userQuery'` message arrives, the extension will handle it (Phase 3).

## Phase 3: Terminal Process Integration (5 points)

**Goal:** Launch and manage the Claude Code CLI in an integrated or headless terminal, and send user input to it.

* **Step 3.1 – Launch Claude Code Process:** When the first user query is received (or on extension activation), start the Claude Code CLI in interactive mode. Use Node’s `child_process.spawn` to run the `claude` command (which starts the REPL). For example: `const proc = spawn('claude', [], { cwd: workspaceFolder, shell: true });`. Use `stdio: 'pipe'` so that we can programmatically write to stdin and read from stdout. (Ensure the Claude CLI is installed globally or specify the correct path.)

  * *Rationale:* Using a child process allows capturing output directly. (The VS Code `Terminal.sendText()` API can send input to a visible terminal, but it does not provide a straightforward way to read the output programmatically. By managing the process ourselves or via a **Pseudoterminal**, we can capture Claude’s responses in the extension for parsing.)
* **Step 3.2 – Handle Process Output:** Set up event listeners on `proc.stdout` (and possibly `proc.stderr`) to receive data. Buffer and accumulate this output. Claude Code’s responses may arrive in chunks; use a buffer to assemble full lines and messages. Monitor for the end of a response – for example, the Claude REPL might print a new prompt (`> `) or ask a confirmation question. Use that as a signal that the response is complete.
* **Step 3.3 – Send User Queries:** On each user query message from the webview, write the query to Claude’s stdin followed by a newline (e.g. `proc.stdin.write(query + '\n')`). This simulates the user typing into the Claude terminal. Claude Code will then process it and produce output.
* **Step 3.4 – Manage Interactive Prompts:** Claude Code may ask for confirmation when it suggests file edits (as seen in the screenshots where it asks “Do you want to make this edit to …? (Yes/No)” before applying changes). To streamline the user experience, implement logic to detect these prompts in the output. For an MVP, consider auto-confirming by sending “Yes\n” back to stdin whenever Claude asks for edit approval. (This can be toggled later with a setting or user prompt in the UI.) For example, if the output contains a line like `Do you want to make this edit` or options including “Yes/No”, automatically send `Y` or the full “Yes” command. This ensures Claude proceeds to apply changes and output diffs without requiring the user to switch to the terminal.

  * *Note:* Claude Code has an option “Yes, and don’t ask again this session” (as shown in the screenshot), which we could use or emulate. We might send that option on first query to prevent repeated prompts. Alternatively, use Claude’s config to disable confirmations if such a setting exists. This will make the extension more seamless.

## Phase 4: Handling and Parsing Claude’s Responses (4 points)

**Goal:** Capture Claude’s output for each query, separate the conversational text from file change information, and prepare it for display.

* **Step 4.1 – Identify Response Completion:** As Claude outputs its answer and possibly a list of file changes, accumulate the text until the response is finished. The end of a response might be identified by a new prompt (`>`) or the absence of output for a short interval. Implement a simple state machine or delimiter detection: for example, if Claude prints a line that starts with `> ` (which likely indicates it’s echoing the next user prompt or awaiting input), treat that as the end of the previous answer. Remove or ignore any leading `> user query` echo from the captured output (since we already have the user’s question separately).
* **Step 4.2 – Parse Conversational Text:** Claude’s response may include explanatory text or steps. Extract the **chat message content** (anything that isn’t part of the structured diff output). This might be plain English explanation or reasoning. We will display this in the chat panel as the assistant’s answer text.
* **Step 4.3 – Extract File Modification Blocks:** Scan the output for any indications of file changes. In Claude Code’s format, look for lines that signal actions and diff outputs, for example:

  * Lines that begin with a bullet or call symbol like `● Call(...)/⏺ Call(...)` or `⎿ Updated <file> with X additions and Y removals`. These denote file operations. For each `Updated ...` line, capture the file name and the summary of changes (additions/deletions).
  * Collect the subsequent lines that show the diff for that file. In the Claude Code CLI, after an “Updated *file* …” line, the diff is presented with line numbers and content, plus markers for added/removed lines (e.g., added lines may appear with green highlight and removed with red in the CLI output). These lines might include ANSI color codes. **Strip out or interpret ANSI codes** so we have plain text. Each diff block likely continues until the next `⎿` action line or until the response ends. Use the structure: whenever a new `Updated <file>` line is encountered, start a new diff block and continue collecting lines until another `Updated <file>` or end-of-response is reached.
* **Step 4.4 – Consider Using a Diff Parser Library:** To avoid writing a custom parser from scratch, consider leveraging an existing diff parser if the output is close to unified diff format. For example, **`parse-diff`** (JavaScript library) can parse unified diff strings into file change objects. However, Claude’s output is slightly custom (it doesn’t include the typical `---/+++` headers). If needed, transform the captured diff text into a unified diff format (e.g., add fake `--- old/file\n+++ new/file` lines) and then feed it to a parser. Alternatively, parse it with simple regex rules since the format is known (e.g., identify `+` or line numbers for additions, etc.).
* **Step 4.5 – Data Structure for Changes:** Create a data model in the extension to store the parsed response: e.g.,

  ```typescript
  interface ClaudeResponse {
      answerText: string; 
      fileChanges: FileChange[];
  }
  interface FileChange {
      filePath: string;
      additions: number;
      deletions: number;
      diffLines: string[];  // or a structured diff hunks representation
  }
  ```

  Populate this structure for each response. This will be used to render the UI in the next phase.

## Phase 5: Displaying Claude’s Response in the Webview (3 points)

**Goal:** Show Claude’s answer and the list of modified files in the chat panel to the user in a friendly format.

* **Step 5.1 – Post Message to Webview:** Once the response is processed and we have a `ClaudeResponse` object, send it to the webview. Use `panel.webview.postMessage({ command: 'claudeResponse', data: responseObj })`. The webview’s script (already listening for messages) will receive this and handle the UI update.
* **Step 5.2 – Render Chat Message:** In the webview script, on receiving a `'claudeResponse'` message, append the assistant’s answer to the messages area. Preserve formatting if needed (Claude might return markdown or code snippets in answers – ensure the webview can display those, perhaps by setting `innerHTML` or using `<pre>` tags for code). This shows the conversational part of the answer.
* **Step 5.3 – List Modified Files:** Still within the webview, if `responseObj.fileChanges` is non-empty, display an **interactive list of file changes** below the answer text. For each `FileChange` item:

  * Show the **file name** (just the base name or relative path) as a clickable element (e.g., a hyperlink or button). For clarity, also show a summary of additions/deletions (e.g., “(+X, -Y)” in green/red text). Example: “**helper.txt** (+1, -0)” for a new file with one line added.
  * Optionally, display a short snippet of the diff (e.g., first few changed lines) indented under the file name for context. This helps users see what’s changed at a glance. For longer diffs, you might collapse them by default and allow expansion. (This can be iterative; initially, even just listing file names is fine.)
* **Step 5.4 – Styling:** Use simple CSS to distinguish the file list from the chat text. Perhaps use a bordered box or different background for the diff sections, similar to how the screenshots show an “Edit file” box. Make sure the interface remains clean and readable (short paragraphs, clear grouping as per user formatting guidelines).

## Phase 6: Open Files with Inline Diff View (4 points)

**Goal:** Allow users to click a file from the list and view that file with the suggested changes highlighted in the editor.

* **Step 6.1 – Handle Click Events:** In the webview, attach click handlers to each file name entry. When clicked, the webview should either use VS Code’s command URIs or message passing to trigger file open. A straightforward approach is to post a message to the extension host: e.g., `vscode.postMessage({ command: 'openFile', file: filePath })`. The extension, in its `onDidReceiveMessage`, will catch the `'openFile'` command with the given path.
* **Step 6.2 – Open the File in VS Code Editor:** In response to the open request, use VS Code’s editor APIs to open the file in an editor tab. For example:

  ```typescript
  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  ```

  This will open the file (if it exists in the workspace). If the file was just created by Claude (and saved to disk), it should exist now. If it’s modified, the changes have been applied (because we auto-confirmed earlier), so the file content on disk is updated.
* **Step 6.3 – Highlight Changes Inline:** After opening the file, highlight the changes (additions/deletions) inline, similar to Cursor IDE’s behavior. Use the VS Code Decoration API to achieve this. For example, create a `TextEditorDecorationType` for added lines (with a light green background or outline) and another for removed lines (perhaps red strike-through or a gutter indicator).

  * To do this, compute the exact line numbers that were added or removed from the diff data collected in Phase 4.

    * For added lines: you can highlight those lines in the editor. For removed lines: since they no longer exist in the file, one approach is to show a ghost text or a gutter marker. (An alternative is to open a *diff view* using `vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri)` to show side-by-side, but here we want inline highlights in the actual file view.)
  * Implement the simpler case first: highlight added lines. For each added line number from the diff, apply a decoration. For example:

    ```typescript
    const editor = vscode.window.activeTextEditor;
    const addedLineDecoration = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(155, 233, 168, 0.5)' }); // light green  
    const ranges = addedLineNumbers.map(num => new vscode.Range(num-1, 0, num-1, 0));  
    editor?.setDecorations(addedLineDecoration, ranges);
    ```

    This will mark the entire line as highlighted. Adjust styling as needed (you could also use gutter icons or underline).
  * For deletions, one approach is to show a small hover or a code lens at the nearest line where deletions occurred indicating “X lines removed here”. This is an advanced feature; for an initial version, it can be skipped or kept simple (maybe log the deletion info to output or console for now).
* **Step 6.4 – Verify File Opening and Highlighting:** Test that clicking a file in the webview opens it and highlights the changes. The user should be able to scroll in the editor and see exactly what Claude changed or added, **inline** in the code (much like a live diff). This replicates the Cursor IDE experience within VS Code. If the file is large or the diff spans multiple sections, consider scrolling the editor to the first changed line upon opening for convenience (using `revealRange` on the TextEditor).

## Phase 7: Testing and Debugging (2 points)

**Goal:** Ensure the extension works reliably, and fix issues via iterative testing.

* **Step 7.1 – Unit Testing Diff Parsing:** Write unit tests for the parsing logic in Phase 4 (if feasible, using a test runner like Mocha with the VS Code Extension Test framework). Provide sample Claude output strings (like those in the screenshots and docs) and verify that the parser correctly identifies file names, additions, deletions, and diff lines. This will catch edge cases in formatting.
* **Step 7.2 – Manual Integration Testing:** Run the extension in a VS Code Extension Development Host. Simulate the full flow: enter a prompt that will cause Claude to modify or create files (e.g., “Create a new file X with content Y”). Observe in the chat panel that the assistant’s response and file list appear. Click the file names and verify the file opens and highlights. Test multiple files changed in one query (e.g., ask Claude to modify two files in one request) to ensure the list shows all and clicking each works.
* **Step 7.3 – Debug Logging:** Add logging statements throughout the extension (using `console.log` or VS Code’s `OutputChannel`) to trace the flow: when messages are sent/received, when process output arrives, etc. This is especially useful to debug the asynchronous communication with the Claude process. For example, log whenever a chunk of stdout is received or when a response is considered “complete.” Monitor the extension’s output to troubleshoot any timing issues or missed data.
* **Step 7.4 – Edge Case Handling:** Test scenarios such as: Claude CLI not installed or not in PATH (the spawn might fail – handle this by showing an error message in the chat UI or a popup telling the user to install Claude Code). Also test what happens if Claude outputs a very large diff or a non-diff answer (the extension should still handle it gracefully, perhaps just showing the text if no file changes).

## Phase 8: Refinement and Documentation (1 point)

**Goal:** Polish the extension for usability and maintainability.

* **Step 8.1 – UI/UX Polish:** Review the webview UI for clarity. Make sure long outputs are scrollable, add loading indicators if Claude’s response is slow (e.g., show “Claude is thinking…” while waiting for the CLI to respond). Possibly add an option to clear the conversation or stop Claude if it’s running long.
* **Step 8.2 – Performance Considerations:** Ensure that the Claude process persists for the session (to maintain context and efficiency). If the user closes the chat panel, decide whether to keep the process alive or restart it next time (persist session if possible). Clean up event listeners and child process on extension deactivation to avoid orphan processes.
* **Step 8.3 – Documentation and Help:** Document how to use the extension (in a README.md for the extension). Explain that users need Claude Code installed (`npm install -g @anthropic-ai/claude-code`) and logged in, etc. Provide usage examples.
* **Step 8.4 – Future Enhancements:** Note down ideas like handling the “Yes/No” confirmation in the UI (e.g., showing a prompt in the chat panel instead of auto-confirming), supporting multi-step conversations with memory (the CLI does this inherently), or even using Claude’s non-interactive JSON mode for more structured outputs in future. Testing with larger projects and getting user feedback will guide further improvements.

Throughout development, **focus on simplicity and clarity**. Each step delivers a small piece of functionality (suitable for a junior engineer to implement and verify), and you can verify each part (UI, process I/O, parsing, etc.) incrementally before moving on. By following this plan, you will build a robust VS Code extension that provides a smooth chat-style interface to Claude Code, allowing users to see and apply code suggestions with ease.

**Sources:** Claude Code is an Anthropic CLI tool that “lives in your terminal” and supports natural language code edits. The development utilizes the VS Code Extension API for webviews and terminals and can leverage existing libraries for diff parsing to interpret Claude’s output.
