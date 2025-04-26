import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';

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

        outputChannel.appendLine(`当前行文本: ${text}`);
        outputChannel.appendLine(`光标位置: ${position.line}:${position.character}`);

        // 提取结构体名称
        // 匹配格式：
        // 1. 变量名 := 结构体名{
        // 2. var 变量名 = 结构体名{
        // 3. 变量名 := &结构体名{
        // 4. var 变量名 = &结构体名{
        // 5. 字段名: 结构体名{  (嵌套结构体情况)
        let structName = '';
        let isNestedStruct = false;

        // 首先，尝试从当前行和周围行判断我们是否在嵌套结构体内部
        // 这个逻辑需要查找像 "Next: ListNode{" 这样的模式
        const currentLineText = text.trim();

        // 检查当前行是否包含某个字段的赋值（如 Name: ""）
        const fieldAssignmentRegex = /^\s*(\w+):\s*(.+),?\s*$/;
        const fieldAssignmentMatch = currentLineText.match(fieldAssignmentRegex);

        if (fieldAssignmentMatch) {
            outputChannel.appendLine(`检测到字段赋值: ${fieldAssignmentMatch[1]}: ${fieldAssignmentMatch[2]}`);
            // 向上查找找到包含结构体类型的行，如 "Next: ListNode{"
            let searchLine = position.line - 1;
            while (searchLine >= 0) {
                const lineText = document.lineAt(searchLine).text;
                outputChannel.appendLine(`向上查找结构体声明，检查行 ${searchLine}: ${lineText}`);
                // 匹配嵌套结构体声明
                const nestedStructRegex = /(\w+):\s*([\w\.]+)\s*{/;
                const nestedMatch = lineText.match(nestedStructRegex);
                if (nestedMatch) {
                    structName = nestedMatch[2]; // 捕获结构体名称，如 "ListNode"
                    isNestedStruct = true;
                    outputChannel.appendLine(`找到嵌套结构体声明: ${nestedMatch[1]}: ${structName}{`);
                    break;
                }
                // 如果遇到更高一级的结构体声明或其他关键代码，停止查找
                if (lineText.includes(":=") || lineText.includes("func ")) {
                    break;
                }
                searchLine--;
            }
        }

        // 如果没有找到嵌套结构体，尝试匹配当前行是否是嵌套结构体声明
        if (!structName) {
            const nestedStructMatch = text.match(/(\w+):\s*([\w\.]+)\s*{/);
            if (nestedStructMatch) {
                structName = nestedStructMatch[2];
                isNestedStruct = true;
                outputChannel.appendLine(`当前行是嵌套结构体声明: ${structName}`);
            } else {
                // 尝试匹配普通结构体初始化，优先匹配光标所在行及其周围的代码
                let structMatch;
                const surroundingLines = 10; // 向上和向下查找的行数
                const startLine = Math.max(0, position.line - surroundingLines);
                const endLine = Math.min(document.lineCount - 1, position.line + surroundingLines);

                for (let i = startLine; i <= endLine; i++) {
                    const lineText = document.lineAt(i).text;
                    const lineMatch = lineText.match(/(?:var\s+)?(\w+)\s*(?:=|\:=)\s*(?:&)?([\w\.]+)\s*{/);

                    if (lineMatch) {
                        // 如果有多个匹配项，选择最接近光标位置的那个
                        if (!structMatch || Math.abs(i - position.line) < Math.abs(structMatch.line - position.line)) {
                            structMatch = {
                                line: i,
                                name: lineMatch[2]
                            };
                        }
                    }
                }

                if (!structMatch) {
                    outputChannel.appendLine('无法识别结构体初始化语句');
                    vscode.window.showErrorMessage('无法识别结构体初始化语句，请确保光标位于结构体初始化的大括号内');
                    return;
                }

                structName = structMatch.name;
                outputChannel.appendLine(`找到普通结构体初始化: ${structName}`);
            }
        }

        outputChannel.appendLine(`找到结构体名称: ${structName}`);

        try {
            outputChannel.appendLine('正在获取结构体信息...');

            // 确定正确的位置获取补全项
            // 如果是嵌套结构体，我们需要在"{" 后面获取补全项
            let completionPosition = position;

            // 为嵌套结构体创建一个临时文档，以获取正确的补全项
            let tmpDocument = document;
            if (isNestedStruct) {
                try {
                    // 创建一个临时文本，包含简单的结构体初始化，便于获取补全项
                    const tmpText = `package main\n\nfunc main() {\n\ta := ${structName}{}\n}\n`;
                    const tmpUri = vscode.Uri.parse(`untitled:${structName}_temp.go`);

                    // 创建临时文档并设置内容
                    await vscode.workspace.openTextDocument(tmpUri).then(async (doc) => {
                        const edit = new vscode.WorkspaceEdit();
                        edit.insert(tmpUri, new vscode.Position(0, 0), tmpText);
                        await vscode.workspace.applyEdit(edit);

                        tmpDocument = doc;
                        // 设置补全位置在临时文档的结构体初始化处
                        completionPosition = new vscode.Position(3, tmpText.indexOf('{') + 1);
                        outputChannel.appendLine(`创建临时文档获取 ${structName} 的补全项，位置: ${completionPosition.line}:${completionPosition.character}`);
                    });
                } catch (err) {
                    outputChannel.appendLine(`创建临时文档出错: ${err}`);
                }
            }

            // 使用 gopls 的 API 获取结构体信息
            let completionItems;
            try {
                outputChannel.appendLine(`尝试在 ${tmpDocument.uri.toString()} 的位置 ${completionPosition.line}:${completionPosition.character} 获取补全项`);
                completionItems = await vscode.commands.executeCommand<vscode.CompletionList>(
                    'vscode.executeCompletionItemProvider',
                    tmpDocument.uri,
                    completionPosition
                );
            } catch (err) {
                outputChannel.appendLine(`获取补全项时出错: ${err}`);
            }

            outputChannel.appendLine(`补全项类型: ${typeof completionItems}`);
            outputChannel.appendLine(`补全项: ${JSON.stringify(completionItems, null, 2)}`);

            if (!completionItems || !completionItems.items || !Array.isArray(completionItems.items) || completionItems.items.length === 0) {
                outputChannel.appendLine('未获取到有效的补全项');
                vscode.window.showErrorMessage('无法获取结构体信息，请确保 Go 插件已正确安装并运行');
                return;
            }

            // 直接使用 gopls 的 API 获取的 completionItems
            const fields: GoField[] = [];
            for (const item of completionItems.items) {
                outputChannel.appendLine(`处理补全项: ${JSON.stringify(item, null, 2)}`);
                if (item.kind != vscode.CompletionItemKind.Field) {
                    continue;
                }
                const fieldName = typeof item.label === 'string' ? item.label : item.label.label;
                if (fieldName.includes('.')) {
                    continue;
                }

                if (checkFieldExistsInCurrentStruct(document, position, fieldName)) {
                    outputChannel.appendLine(`字段已存在于当前结构体中，跳过: ${fieldName}`);
                    continue;
                }

                const fieldType = item.detail || '';
                const isPointer = fieldType.startsWith('*');
                const isOptional = fieldType.endsWith('?');

                // 添加字段
                fields.push({
                    name: fieldName,
                    type: fieldType,
                    isPointer: isPointer,
                    isOptional: isOptional
                });
            }

            if (fields.length === 0) {
                outputChannel.appendLine('没有需要填充的字段');
                vscode.window.showInformationMessage('结构体字段已全部填充');
                return;
            }

            outputChannel.appendLine(`需要填充的字段: ${JSON.stringify(fields, null, 2)}`);

            // 生成字段填充代码
            const fillCode = generateFillCode(fields, outputChannel);
            outputChannel.appendLine(`最终生成的代码: ${fillCode}`);

            // 如果生成了代码，则插入
            if (fillCode) {
                await editor.edit(editBuilder => {
                    // 计算插入位置
                    outputChannel.appendLine(`计算插入位置，当前位置: ${position.line}:${position.character}`);

                    // 首先查找当前行中的左大括号位置
                    const currentLine = document.lineAt(position.line);
                    const currentLineText = currentLine.text;
                    let braceIndex = currentLineText.indexOf('{');
                    let insertPosition;

                    if (braceIndex !== -1) {
                        // 如果当前行有左大括号，在其后插入
                        insertPosition = new vscode.Position(position.line, braceIndex + 1);
                        outputChannel.appendLine(`当前行找到左大括号，插入位置: ${position.line}:${braceIndex + 1}`);
                    } else {
                        // 向上查找最近的带有左大括号的行
                        let lineWithBrace = position.line;
                        while (lineWithBrace >= 0) {
                            const checkLine = document.lineAt(lineWithBrace);
                            const checkText = checkLine.text;
                            const checkBraceIndex = checkText.indexOf('{');

                            if (checkBraceIndex !== -1) {
                                // 如果之前的行有左大括号，判断是否应该在其后插入
                                // 如果当前行是空行或只有右大括号，则可能是正确的插入位置
                                const textAfterBrace = checkText.substring(checkBraceIndex + 1).trim();
                                if (textAfterBrace === '' || position.line > lineWithBrace) {
                                    // 如果左大括号后面没有其他内容，或者当前行在左大括号之后的行
                                    // 在左大括号后插入
                                    insertPosition = new vscode.Position(lineWithBrace, checkBraceIndex + 1);
                                    outputChannel.appendLine(`在行 ${lineWithBrace} 找到左大括号，插入位置: ${lineWithBrace}:${checkBraceIndex + 1}`);
                                    break;
                                }
                            }

                            // 继续向上检查
                            lineWithBrace--;
                        }

                        // 如果未找到合适的插入位置，使用当前光标位置
                        if (!insertPosition) {
                            insertPosition = position;
                            outputChannel.appendLine(`未找到合适的大括号，使用当前光标位置: ${position.line}:${position.character}`);
                        }
                    }

                    // 插入生成的代码
                    editBuilder.insert(insertPosition, fillCode);
                    outputChannel.appendLine(`已在 ${insertPosition.line}:${insertPosition.character} 插入代码`);
                });
                outputChannel.appendLine('结构体字段填充完成');
                vscode.window.showInformationMessage('结构体字段填充完成');
            } else {
                outputChannel.appendLine('没有需要填充的字段');
                vscode.window.showInformationMessage('没有需要填充的字段');
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

/**
 * 生成结构体字段填充代码
 * @param fields 结构体字段列表
 * @param outputChannel 输出通道
 * @returns 生成的代码字符串
 */
function generateFillCode(fields: GoField[], outputChannel: vscode.OutputChannel): string {
    // 获取当前编辑器
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        outputChannel.appendLine('未找到活动编辑器');
        return '';
    }

    const position = editor.selection.active;
    const document = editor.document;

    outputChannel.appendLine(`开始查找大括号，当前位置: ${position.line}:${position.character}`);

    // 从当前位置向左和向上查找括号
    let braceText = '';
    let bracePosition = -1;
    const lineAtCursor = document.lineAt(position.line);
    const textAtCursorLine = lineAtCursor.text;

    outputChannel.appendLine(`当前行完整文本: '${textAtCursorLine}'`);

    // 首先在当前行查找左大括号
    bracePosition = textAtCursorLine.indexOf('{');
    if (bracePosition !== -1) {
        braceText = textAtCursorLine.substring(0, bracePosition + 1);
        outputChannel.appendLine(`在当前行找到左大括号，位置: ${bracePosition}, 文本: '${braceText}'`);
    } else {
        // 从当前位置向上查找包含左大括号的行
        let currentLine = position.line - 1; // 从上一行开始向上查找
        let foundBrace = false;

        while (currentLine >= 0 && !foundBrace) {
            const line = document.lineAt(currentLine);
            const lineText = line.text;
            outputChannel.appendLine(`检查行 ${currentLine}: '${lineText}'`);

            // 在当前行查找左大括号
            bracePosition = lineText.indexOf('{');
            if (bracePosition !== -1) {
                foundBrace = true;
                braceText = lineText.substring(0, bracePosition + 1);
                outputChannel.appendLine(`在行 ${currentLine} 找到左大括号，位置: ${bracePosition}, 文本: '${braceText}'`);
                break;
            }

            currentLine--;
        }

        if (!foundBrace) {
            outputChannel.appendLine('未找到左大括号，尝试直接从文本匹配结构体初始化...');

            // 获取当前文档的所有文本
            const fullText = document.getText();
            outputChannel.appendLine(`获取完整文本长度: ${fullText.length}`);

            // 尝试匹配变量初始化的结构体
            const structRegex = /(\w+)\s*:=\s*(\w+)\s*{/g;
            let match;

            while ((match = structRegex.exec(fullText)) !== null) {
                outputChannel.appendLine(`找到匹配: ${match[0]}`);
                // 检查此匹配位置是否在光标之前
                const matchPos = document.positionAt(match.index);
                const matchEndPos = document.positionAt(match.index + match[0].length);

                outputChannel.appendLine(`匹配位置: ${matchPos.line}:${matchPos.character} - ${matchEndPos.line}:${matchEndPos.character}`);

                // 如果匹配在当前行或之前的几行，且与当前光标位置相近
                if (matchPos.line <= position.line &&
                    position.line - matchPos.line <= 5) { // 仅考虑最近的5行内

                    foundBrace = true;
                    braceText = match[0];
                    outputChannel.appendLine(`找到相关结构体初始化: '${braceText}'`);
                    break;
                }
            }
        }
    }

    if (!braceText) {
        outputChannel.appendLine('最终未找到左大括号，尝试使用固定缩进...');
        // 退而求其次，使用当前行的缩进
        const currentIndent = textAtCursorLine.match(/^\s*/)?.[0] || '';
        const innerIndent = currentIndent + '    ';

        // 生成字段代码
        const fieldLines = fields.map(field => {
            const defaultValue = getDefaultValue(field);
            return `${innerIndent}${field.name}: ${defaultValue},`;
        });

        if (fieldLines.length === 0) {
            outputChannel.appendLine('没有字段需要填充');
            return '';
        }

        // 在结构体初始化中插入字段
        const generatedCode = `\n${fieldLines.join('\n')}\n${currentIndent}`;
        outputChannel.appendLine(`使用默认缩进生成的代码:\n${generatedCode}`);
        return generatedCode;
    }

    // 提取缩进信息
    const baseIndent = braceText.match(/^\s*/)?.[0] || '';
    // 内部缩进应该更深一级
    const innerIndent = baseIndent + '    ';
    outputChannel.appendLine(`基础缩进: '${baseIndent}', 内部缩进: '${innerIndent}'`);

    // 检查我们是否在嵌套结构体内部
    let isNestedStruct = false;
    const nestedStructRegex = /(\w+):\s*(\w+)\s*{/;
    if (nestedStructRegex.test(textAtCursorLine) ||
        (position.line > 0 && nestedStructRegex.test(document.lineAt(position.line - 1).text))) {
        isNestedStruct = true;
        outputChannel.appendLine('检测到嵌套结构体环境');
    }

    // 生成字段代码，根据是否在嵌套结构体中调整缩进
    const fieldLines = fields.map(field => {
        const defaultValue = getDefaultValue(field);
        // 在嵌套结构体中，使用更深的缩进
        const fieldIndent = innerIndent;
        return `${fieldIndent}${field.name}: ${defaultValue},`;
    });

    // 如果没有字段，不生成代码
    if (fieldLines.length === 0) {
        outputChannel.appendLine('没有字段需要填充');
        return '';
    }

    // 结束缩进应该与起始缩进相同
    const endIndent = isNestedStruct ? innerIndent.slice(0, -4) : baseIndent;

    // 根据上下文生成代码
    let generatedCode;
    if (isNestedStruct) {
        // 在嵌套结构体中，直接生成字段列表
        generatedCode = `\n${fieldLines.join('\n')}\n${endIndent}`;
    } else {
        // 在顶层结构体中，前后加空行
        generatedCode = `\n${fieldLines.join('\n')}\n${endIndent}`;
    }

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

// 解析完整结构体名称
function parseFullStructName(structName: string): { pkgName: string, structName: string } {
    const parts = structName.split('.');
    if (parts.length === 1) {
        return { pkgName: '', structName: parts[0] };
    }
    return { pkgName: parts[0], structName: parts[1] };
}

async function getStructInfo(structName: string, document: vscode.TextDocument): Promise<vscode.CompletionList | null> {
    const { pkgName, structName: structNameOnly } = parseFullStructName(structName);

    // 如果是当前包的结构体
    if (!pkgName) {
        // 在当前包的所有.go文件中查找
        const goFiles = await vscode.workspace.findFiles('**/*.go');
        for (const file of goFiles) {
            const fileDoc = await vscode.workspace.openTextDocument(file);
            const fileText = fileDoc.getText();
            const structRegex = new RegExp(`type\\s+${structNameOnly}\\s+struct\\s*{([^}]*)}`, 'g');
            const match = structRegex.exec(fileText);
            if (match) {
                // 返回结构体信息
                return {
                    items: parseStructFields(match[1])
                };
            }
        }
    } else {
        // 如果是其他包的结构体
        // 查找导入的包路径
        const importRegex = new RegExp(`import\\s+"([^"]+)"`, 'g');
        const imports = [];
        let match;
        while ((match = importRegex.exec(document.getText())) !== null) {
            imports.push(match[1]);
        }

        // 查找匹配的包
        const pkgPath = imports.find(path => path.endsWith(pkgName));
        if (pkgPath) {
            // 在包路径中查找结构体
            const pkgFiles = await vscode.workspace.findFiles(`${pkgPath}/**/*.go`);
            for (const file of pkgFiles) {
                const fileDoc = await vscode.workspace.openTextDocument(file);
                const fileText = fileDoc.getText();
                const structRegex = new RegExp(`type\\s+${structNameOnly}\\s+struct\\s*{([^}]*)}`, 'g');
                const match = structRegex.exec(fileText);
                if (match) {
                    // 返回结构体信息
                    return {
                        items: parseStructFields(match[1])
                    };
                }
            }
        }
    }

    return null;
}

function parseStructFields(fieldsContent: string): vscode.CompletionItem[] {
    const fieldRegex = /(\w+)\s+([^\n;]+)/g;
    const fields: vscode.CompletionItem[] = [];
    let match;
    while ((match = fieldRegex.exec(fieldsContent)) !== null) {
        const name = match[1];
        const type = match[2].split('//')[0].trim();
        fields.push({
            label: name,
            kind: vscode.CompletionItemKind.Field,
            detail: type
        });
    }
    return fields;
}

function checkFieldExistsInCurrentStruct(
    document: vscode.TextDocument,
    position: vscode.Position,
    fieldName: string
): boolean {
    // 获取当前结构体的范围
    const structRange = getCurrentStructRange(document, position);
    if (!structRange) return false;

    // 获取当前结构体的文本
    const structText = document.getText(structRange);

    // 检查字段是否存在
    const fieldRegex = new RegExp(`\\b${fieldName}\\s*:`, 'i');
    return fieldRegex.test(structText);
}

function getCurrentStructRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range | null {
    let startLine = position.line;
    let endLine = position.line;

    // 向上查找结构体开始位置
    while (startLine >= 0) {
        const lineText = document.lineAt(startLine).text;
        if (lineText.includes('{')) {
            break;
        }
        startLine--;
    }

    // 向下查找结构体结束位置
    let braceCount = 0;
    while (endLine < document.lineCount) {
        const lineText = document.lineAt(endLine).text;
        for (const char of lineText) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
        }
        if (braceCount === 0) break;
        endLine++;
    }

    if (startLine < 0 || endLine >= document.lineCount) return null;

    return new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, document.lineAt(endLine).text.length)
    );
} 