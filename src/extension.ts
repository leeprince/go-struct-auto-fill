import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

/**
 * 结构体字段接口
 */
interface GoField {
    name: string;       // 字段名称
    type: string;       // 字段类型
    isPointer: boolean; // 是否为指针类型
    isOptional: boolean; // 是否为可选字段（用于 JSON 标签）
}

interface GoModule {
    path: string;
    version: string;
}

interface StructInfo {
    fields: Array<{
        name: string;
        type: string;
    }>;
}

interface CompletionItem {
    label: string;
    detail?: string;
    kind?: vscode.CompletionItemKind;
}

/**
 * VSCode 符号信息接口
 */
interface SymbolInformation {
    name: string;           // 符号名称
    kind: vscode.SymbolKind; // 符号类型
    location: vscode.Location; // 符号位置
    containerName?: string;   // 容器名称（用于字段类型）
}

/**
 * 插件激活函数
 */
export function activate(context: vscode.ExtensionContext) {
    // 创建输出通道
    const outputChannel = vscode.window.createOutputChannel('Go Struct Auto Fill');
    context.subscriptions.push(outputChannel);

    // 检查是否安装了 Go 插件
    const goExtension = vscode.extensions.getExtension('golang.go');
    if (!goExtension) {
        vscode.window.showErrorMessage('请先安装 Go 插件 (golang.Go)');
        return;
    }

    // 注册命令
    let disposable = vscode.commands.registerCommand('go-struct-auto-fill.fillStruct', async () => {
        outputChannel.clear();
        outputChannel.show();
        outputChannel.appendLine('开始执行结构体自动填充...');

        // 检查 Go 插件是否激活
        if (!goExtension.isActive) {
            try {
                await goExtension.activate();
                outputChannel.appendLine('Go 插件已激活');
            } catch (error) {
                outputChannel.appendLine(`Go 插件激活失败: ${error}`);
                vscode.window.showErrorMessage('Go 插件激活失败');
                return;
            }
        }

        // 获取当前编辑器
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            outputChannel.appendLine('未找到活动编辑器');
            return;
        }

        const document = editor.document;
        const position = editor.selection.active;

        // 获取当前行的文本
        const line = document.lineAt(position.line);
        const text = line.text;

        // 获取当前行之前的所有文本
        const textBeforeCursor = document.getText(
            new vscode.Range(
                new vscode.Position(0, 0),
                position
            )
        );

        outputChannel.appendLine(`当前行文本: ${text}`);
        outputChannel.appendLine(`光标位置: ${position.line}:${position.character}`);

        // 提取结构体名称
        // 匹配格式：
        // 1. 变量名 := 结构体名{
        // 2. var 变量名 = 结构体名{
        // 3. 变量名 := &结构体名{
        // 4. var 变量名 = &结构体名{
        const structMatch = textBeforeCursor.match(/(?:var\s+)?(\w+)\s*(?:=|\:=)\s*(?:&)?([\w\.]+)\s*{/);
        if (!structMatch) {
            outputChannel.appendLine('无法识别结构体初始化语句');
            vscode.window.showErrorMessage('无法识别结构体初始化语句，请确保光标位于结构体初始化的大括号内');
            return;
        }
        const structName = structMatch[2];
        outputChannel.appendLine(`找到结构体名称: ${structName}`);

        try {
            outputChannel.appendLine('正在获取结构体信息...');

            // 使用 gopls 的 API 获取结构体信息
            const completionItems = await vscode.commands.executeCommand<vscode.CompletionList>(
                'vscode.executeCompletionItemProvider',
                document.uri,
                position
            );

            outputChannel.appendLine(`补全项类型: ${typeof completionItems}`);
            outputChannel.appendLine(`补全项: ${JSON.stringify(completionItems, null, 2)}`);

            if (!completionItems || !completionItems.items || !Array.isArray(completionItems.items)) {
                outputChannel.appendLine('未获取到有效的补全项');
                vscode.window.showErrorMessage('无法获取结构体信息，请确保 Go 插件已正确安装并运行');
                return;
            }

            // 从补全项中提取结构体字段
            const fields: GoField[] = [];
            for (const item of completionItems.items) {
                outputChannel.appendLine(`处理补全项: ${JSON.stringify(item, null, 2)}`);
                if (item.kind === vscode.CompletionItemKind.Field) {
                    const fieldName = typeof item.label === 'string' ? item.label : item.label.label;
                    // 跳过嵌套字段（包含点的字段名）
                    if (fieldName.includes('.')) {
                        outputChannel.appendLine(`跳过嵌套字段: ${fieldName}`);
                        continue;
                    }
                    const fieldType = item.detail || '';
                    outputChannel.appendLine(`找到字段: ${JSON.stringify({ name: fieldName, type: fieldType }, null, 2)}`);
                    fields.push({
                        name: fieldName,
                        type: fieldType.replace('*', ''),
                        isPointer: fieldType.startsWith('*'),
                        isOptional: false
                    });
                }
            }

            if (fields.length === 0) {
                outputChannel.appendLine('结构体没有字段');
                vscode.window.showErrorMessage(`结构体 ${structName} 没有字段`);
                return;
            }

            outputChannel.appendLine(`找到字段: ${JSON.stringify(fields, null, 2)}`);

            // 生成字段填充代码
            const fillCode = generateFillCode(fields, outputChannel);
            outputChannel.appendLine(`最终生成的代码: ${fillCode}`);

            // 插入代码
            if (fillCode) {
                await editor.edit(editBuilder => {
                    const insertPosition = new vscode.Position(position.line, text.indexOf('{') + 1);
                    editBuilder.insert(insertPosition, fillCode);
                });
                outputChannel.appendLine('结构体字段填充完成');
            } else {
                outputChannel.appendLine('没有需要填充的字段');
            }
        } catch (error) {
            outputChannel.appendLine(`错误类型: ${typeof error}`);
            outputChannel.appendLine(`错误: ${error}`);
            if (error instanceof Error) {
                outputChannel.appendLine(`错误详情: ${error.message}`);
                outputChannel.appendLine(`错误堆栈: ${error.stack}`);
            }
            vscode.window.showErrorMessage(`获取结构体信息时出错: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    });

    context.subscriptions.push(disposable);
}

async function findStructDefinition(structName: string, currentFileUri: vscode.Uri): Promise<string | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return null;
    }

    // 首先在当前文件中查找
    const currentFileContent = await vscode.workspace.fs.readFile(currentFileUri);
    const currentFileText = currentFileContent.toString();

    // 改进正则表达式以匹配嵌套的结构体定义
    const structRegex = new RegExp(`type\\s+${structName}\\s+struct\\s*{([^{}]|{[^{}]*})*}`);
    const match = currentFileText.match(structRegex);
    if (match) {
        return match[0];
    }

    // 在工作区中查找
    const files = await vscode.workspace.findFiles('**/*.go');
    for (const file of files) {
        const content = await vscode.workspace.fs.readFile(file);
        const text = content.toString();
        const match = text.match(structRegex);
        if (match) {
            return match[0];
        }
    }

    // 如果结构体名称包含点（包名），尝试在第三方库中查找
    if (structName.includes('.')) {
        try {
            // 获取当前工作目录
            const workspaceRoot = workspaceFolders[0].uri.fsPath;

            // 获取 go.mod 文件路径
            const goModPath = path.join(workspaceRoot, 'go.mod');
            if (!fs.existsSync(goModPath)) {
                return null;
            }

            // 解析结构体名称，获取包名和结构体名
            const parts = structName.split('.');
            if (parts.length !== 2) {
                return null;
            }

            const [packageName, structType] = parts;

            // 使用 go list 命令获取模块信息
            const { stdout: moduleInfo } = await execAsync('go list -m all', { cwd: workspaceRoot });
            const modules = parseGoModules(moduleInfo);

            // 在模块中查找结构体
            for (const module of modules) {
                const modulePath = path.join(process.env.GOPATH || path.join(os.homedir(), 'go'), 'pkg', 'mod', module.path + '@' + module.version);
                if (fs.existsSync(modulePath)) {
                    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(modulePath, '**/*.go'));
                    for (const file of files) {
                        const content = await vscode.workspace.fs.readFile(file);
                        const text = content.toString();
                        const match = text.match(structRegex);
                        if (match) {
                            return match[0];
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error searching in third-party libraries:', error);
        }
    }

    return null;
}

function parseGoModules(moduleInfo: string): GoModule[] {
    return moduleInfo
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
            const [path, version] = line.split(' ');
            return { path, version };
        });
}

function parseStructFields(structDefinition: string): GoField[] {
    const fields: GoField[] = [];

    // 提取结构体字段部分
    const fieldsMatch = structDefinition.match(/{([^{}]*)}/);
    if (!fieldsMatch) {
        return fields;
    }

    const fieldsText = fieldsMatch[1];

    // 改进正则表达式以匹配更复杂的字段定义
    const fieldRegex = /(\w+)\s+([*]?[a-zA-Z0-9_\.\[\]<>]+)(?:\s*`[^`]*`)?(?:\s*\/\/[^\n]*)?/g;
    let match;

    while ((match = fieldRegex.exec(fieldsText)) !== null) {
        const [, name, type] = match;
        fields.push({
            name,
            type: type.replace('*', ''),
            isPointer: type.startsWith('*'),
            isOptional: false // 这里可以添加对 omitempty 标签的检查
        });
    }

    return fields;
}

/**
 * 生成结构体字段填充代码
 * @param fields 结构体字段列表
 * @param outputChannel 输出通道
 * @returns 生成的代码字符串
 */
function generateFillCode(fields: GoField[], outputChannel: vscode.OutputChannel): string {
    // 获取当前行的缩进
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        outputChannel.appendLine('未找到活动编辑器');
        return '';
    }

    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line);
    const indent = line.text.match(/^\s*/)?.[0] || '';

    // 获取当前行的文本
    const currentLineText = line.text;
    outputChannel.appendLine(`当前行文本: ${currentLineText}`);

    // 查找左大括号的位置
    let braceIndex = currentLineText.indexOf('{');
    if (braceIndex === -1) {
        // 如果当前行没有左大括号，尝试在上一行查找
        if (position.line > 0) {
            const prevLine = editor.document.lineAt(position.line - 1);
            const prevLineText = prevLine.text;
            outputChannel.appendLine(`上一行文本: ${prevLineText}`);
            braceIndex = prevLineText.indexOf('{');
            if (braceIndex !== -1) {
                // 如果上一行有左大括号，使用上一行的缩进
                const prevIndent = prevLineText.match(/^\s*/)?.[0] || '';
                return generateFieldsCode(fields, prevIndent, outputChannel);
            }
        }
        outputChannel.appendLine('未找到左大括号');
        return '';
    }

    return generateFieldsCode(fields, indent, outputChannel);
}

/**
 * 生成字段代码
 * @param fields 字段列表
 * @param indent 缩进
 * @param outputChannel 输出通道
 * @returns 生成的代码字符串
 */
function generateFieldsCode(fields: GoField[], indent: string, outputChannel: vscode.OutputChannel): string {
    // 生成字段代码，保持原有缩进
    const fieldLines = fields.map(field => {
        const defaultValue = getDefaultValue(field);
        return `${indent}    ${field.name}: ${defaultValue},`;
    });

    const generatedCode = `\n${fieldLines.join('\n')}\n`;
    outputChannel.appendLine(`生成的代码:\n${generatedCode}`);
    return generatedCode;
}

/**
 * 获取字段的默认值
 * @param field 结构体字段
 * @returns 默认值字符串
 */
function getDefaultValue(field: GoField): string {
    // 如果是指针类型，返回 nil
    if (field.isPointer) {
        return 'nil';
    }

    // 处理基本类型
    const type = field.type.replace('*', '').toLowerCase();
    switch (type) {
        case 'string':
            return '""';
        case 'int':
        case 'int32':
        case 'int64':
        case 'uint':
        case 'uint32':
        case 'uint64':
            return '0';
        case 'float32':
        case 'float64':
            return '0.0';
        case 'bool':
            return 'false';
        default:
            // 处理数组类型
            if (type.includes('[') && type.includes(']')) {
                return 'nil';
            }
            // 处理其他类型（结构体等）
            return `${field.type}{}`;
    }
}

/**
 * 插件停用函数
 */
export function deactivate() { } 