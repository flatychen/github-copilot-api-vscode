import * as vscode from 'vscode';
import { McpTool } from '../McpService';

export class VSCodeToolProvider {
    constructor() { }

    public getTools(): McpTool[] {
        return [
            {
                serverName: 'vscode',
                name: 'vscode_read_file',
                description: 'Read the contents of a file in the workspace',
                inputSchema: {
                    type: 'object',
                    properties: {
                        uri: { type: 'string', description: 'The absolute path or URI of the file to read' }
                    },
                    required: ['uri']
                }
            },
            {
                serverName: 'vscode',
                name: 'vscode_list_files',
                description: 'List files in a directory or search for files matching a pattern',
                inputSchema: {
                    type: 'object',
                    properties: {
                        folder: { type: 'string', description: 'The absolute path of the folder to list (optional)' },
                        pattern: { type: 'string', description: 'Glob pattern to search for specific files (e.g. "**/*.ts")' }
                    }
                }
            },
            {
                serverName: 'vscode',
                name: 'vscode_open_file',
                description: 'Open a file in the editor',
                inputSchema: {
                    type: 'object',
                    properties: {
                        uri: { type: 'string', description: 'The absolute path or URI of the file to open' },
                        range: {
                            type: 'array',
                            items: { type: 'number' },
                            minItems: 2,
                            maxItems: 2,
                            description: 'Line range to select [startLine, endLine] (0-indexed)'
                        }
                    },
                    required: ['uri']
                }
            },
            {
                serverName: 'vscode',
                name: 'vscode_get_diagnostics',
                description: 'Get validation errors, warnings, and information for files',
                inputSchema: {
                    type: 'object',
                    properties: {
                        max: { type: 'number', description: 'Maximum number of diagnostics to return (default: 50)' }
                    }
                }
            },
            {
                serverName: 'vscode',
                name: 'vscode_get_active_editor',
                description: 'Get information about the currently active text editor',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            },
            {
                serverName: 'vscode',
                name: 'vscode_write_file',
                description: 'Write content to a file, creating it if it does not exist',
                inputSchema: {
                    type: 'object',
                    properties: {
                        uri: { type: 'string', description: 'The absolute path of the file to write to' },
                        content: { type: 'string', description: 'The content to write to the file' }
                    },
                    required: ['uri', 'content']
                }
            }
        ];
    }

    public async callTool(name: string, args: any): Promise<any> {
        switch (name) {
            case 'vscode_read_file':
                return this.readFile(args.uri);
            case 'vscode_list_files':
                return this.listFiles(args.folder, args.pattern);
            case 'vscode_open_file':
                return this.openFile(args.uri, args.range);
            case 'vscode_get_diagnostics':
                return this.getDiagnostics(args.max);
            case 'vscode_get_active_editor':
                return this.getActiveEditor();
            case 'vscode_write_file':
                return this.writeFile(args.uri, args.content);
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    private async readFile(uriString: string): Promise<any> {
        const uri = vscode.Uri.file(uriString); // Assume file path for now, handle schemes later if needed
        const document = await vscode.workspace.openTextDocument(uri);
        return {
            content: document.getText(),
            languageId: document.languageId,
            lineCount: document.lineCount
        };
    }

    private async listFiles(folderPath?: string, pattern?: string): Promise<any> {
        if (pattern) {
            // Find files using search
            const uris = await vscode.workspace.findFiles(pattern, null, 50); // Limit to 50 results
            return {
                files: uris.map(u => u.fsPath)
            };
        } else if (folderPath) {
            // List directory contents
            const uri = vscode.Uri.file(folderPath);
            const entries = await vscode.workspace.fs.readDirectory(uri);
            return {
                folder: folderPath,
                entries: entries.map(([name, type]) => ({
                    name,
                    type: type === vscode.FileType.Directory ? 'directory' : 'file'
                }))
            };
        } else {
            // Default to listing root folders
            if (!vscode.workspace.workspaceFolders) {
                return { error: 'No workspace folders open' };
            }
            return {
                workspaceFolders: vscode.workspace.workspaceFolders.map(f => f.uri.fsPath)
            };
        }
    }

    private async openFile(uriString: string, range?: [number, number]): Promise<any> {
        const uri = vscode.Uri.file(uriString);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);

        if (range && range.length === 2) {
            const selection = new vscode.Range(range[0], 0, range[1], 1000);
            editor.selection = new vscode.Selection(selection.start, selection.end);
            editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
        }

        return { success: true, opened: uriString };
    }

    private async getDiagnostics(max: number = 50): Promise<any> {
        const allDiagnostics = vscode.languages.getDiagnostics();
        let results = [];
        let count = 0;

        for (const [uri, diagnostics] of allDiagnostics) {
            if (diagnostics.length === 0) { continue; }

            const fileDiagnostics = diagnostics.map(d => ({
                severity: vscode.DiagnosticSeverity[d.severity],
                message: d.message,
                range: {
                    startLine: d.range.start.line,
                    endLine: d.range.end.line
                },
                source: d.source,
                code: d.code
            }));

            results.push({
                file: uri.fsPath,
                diagnostics: fileDiagnostics
            });

            count += fileDiagnostics.length;
            if (count >= max) { break; }
        }

        return { diagnostics: results };
    }

    private async writeFile(uriString: string, content: string): Promise<any> {
        const uri = vscode.Uri.file(uriString);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content || '', 'utf8'));
        return { success: true, path: uriString, size: (content || '').length };
    }

    private async getActiveEditor(): Promise<any> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return { active: false, reason: 'No editor active' };
        }

        return {
            active: true,
            file: editor.document.uri.fsPath,
            languageId: editor.document.languageId,
            cursor: {
                line: editor.selection.active.line,
                character: editor.selection.active.character
            },
            selection: editor.document.getText(editor.selection) || null,
            // Don't return full content to avoid huge payloads, rely on read_file for that
            preview: editor.document.getText(new vscode.Range(0, 0, Math.min(20, editor.document.lineCount), 0)) + '\n...'
        };
    }
}
