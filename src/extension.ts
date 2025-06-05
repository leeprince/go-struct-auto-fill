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
 * 结构体匹配结果接口
 */
interface StructMatchResult {
    structName: string;
    isNestedStruct: boolean;
    matchType: 'variable' | 'nested' | 'array' | 'map' | 'append' | 'function_param';
    context?: string;
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

        // 使用新的结构体识别逻辑
        const matchResult = identifyStructInitialization(document, position, outputChannel);

        if (!matchResult) {
            outputChannel.appendLine('无法识别结构体初始化语句');
            vscode.window.showErrorMessage('无法识别结构体初始化语句，请确保光标位于结构体初始化的大括号内');
            return;
        }

        const { structName, isNestedStruct, matchType } = matchResult;
        outputChannel.appendLine(`找到结构体: ${structName}, 类型: ${matchType}, 是否嵌套: ${isNestedStruct}`);

        try {
            outputChannel.appendLine('正在获取结构体信息...');

            // 不创建临时文档，直接在当前文档中获取补全项
            outputChannel.appendLine('尝试在当前文档中直接获取结构体字段补全项，不创建任何临时文件');

            // 优化补全位置的计算，适应不同的结构体初始化场景
            let completionPosition = position;

            // 对于复杂场景，尝试找到更合适的补全位置
            if (matchType !== 'variable' || isNestedStruct) {
                const optimizedPosition = findOptimalCompletionPosition(document, position, structName, matchType, outputChannel);
                if (optimizedPosition) {
                    completionPosition = optimizedPosition;
                }
            }

            // 使用 gopls 的 API 获取结构体信息（原有逻辑，用于普通变量初始化）
            let completionItems;
            try {
                outputChannel.appendLine(`尝试在当前文档 ${document.uri.toString()} 的位置 ${completionPosition.line}:${completionPosition.character} 获取补全项`);
                completionItems = await vscode.commands.executeCommand<vscode.CompletionList>(
                    'vscode.executeCompletionItemProvider',
                    document.uri,
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
            const fillCode = generateFillCode(fields, outputChannel, matchType);
            outputChannel.appendLine(`最终生成的代码: ${fillCode}`);

            // 如果生成了代码，则插入
            if (fillCode) {
                await editor.edit(editBuilder => {
                    // 计算插入位置
                    const insertPosition = calculateInsertPosition(document, position, matchType, outputChannel);

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
 * 识别结构体初始化语句
 * 支持多种Go结构体初始化场景
 */
function identifyStructInitialization(
    document: vscode.TextDocument,
    position: vscode.Position,
    outputChannel: vscode.OutputChannel
): StructMatchResult | null {

    const currentLine = document.lineAt(position.line);
    const currentLineText = currentLine.text;

    outputChannel.appendLine(`开始识别结构体初始化，当前行: ${currentLineText}`);

    // 获取光标前的文本内容，用于更准确的匹配
    const textBeforeCursor = document.getText(new vscode.Range(
        new vscode.Position(Math.max(0, position.line - 20), 0),
        position
    ));

    outputChannel.appendLine(`光标前文本: ${textBeforeCursor}`);

    // 新的通用结构体上下文分析
    const contextResult = analyzeStructContext(document, position, outputChannel);
    if (contextResult) {
        return contextResult;
    }

    return null;
}

/**
 * 分析光标当前所在的结构体上下文
 * 这是一个更智能的函数，能够处理光标在结构体大括号内任何位置的情况
 */
function analyzeStructContext(
    document: vscode.TextDocument,
    position: vscode.Position,
    outputChannel: vscode.OutputChannel
): StructMatchResult | null {

    outputChannel.appendLine(`开始分析结构体上下文，光标位置: ${position.line}:${position.character}`);

    // 从当前位置向上查找，分析大括号匹配和结构体声明
    let braceStack: Array<{ line: number, char: number, type: 'open' | 'close' }> = [];
    let currentLine = position.line;
    let currentChar = position.character;

    // 首先分析当前行光标位置之前的字符
    const currentLineText = document.lineAt(currentLine).text;
    for (let i = currentChar - 1; i >= 0; i--) {
        const char = currentLineText[i];
        if (char === '}') {
            braceStack.push({ line: currentLine, char: i, type: 'close' });
        } else if (char === '{') {
            if (braceStack.length > 0 && braceStack[braceStack.length - 1].type === 'close') {
                braceStack.pop(); // 匹配的大括号对
            } else {
                // 找到了当前光标所在的开括号
                const structMatch = findStructDeclarationBeforeBrace(document, currentLine, i, outputChannel);
                if (structMatch) {
                    return structMatch;
                }
            }
        }
    }

    // 继续向上查找
    for (let lineNum = currentLine - 1; lineNum >= Math.max(0, currentLine - 50); lineNum--) {
        const lineText = document.lineAt(lineNum).text;

        // 从行尾向行首分析
        for (let charPos = lineText.length - 1; charPos >= 0; charPos--) {
            const char = lineText[charPos];

            if (char === '}') {
                braceStack.push({ line: lineNum, char: charPos, type: 'close' });
            } else if (char === '{') {
                if (braceStack.length > 0 && braceStack[braceStack.length - 1].type === 'close') {
                    braceStack.pop(); // 匹配的大括号对
                } else {
                    // 找到了一个未匹配的开括号，这可能是我们要找的结构体
                    const structMatch = findStructDeclarationBeforeBrace(document, lineNum, charPos, outputChannel);
                    if (structMatch) {
                        outputChannel.appendLine(`找到匹配的结构体声明在行 ${lineNum}:${charPos}`);
                        return structMatch;
                    }
                }
            }
        }
    }

    outputChannel.appendLine('未找到匹配的结构体上下文');
    return null;
}

/**
 * 在指定的大括号位置之前查找结构体声明
 */
function findStructDeclarationBeforeBrace(
    document: vscode.TextDocument,
    braceLineNum: number,
    braceCharPos: number,
    outputChannel: vscode.OutputChannel
): StructMatchResult | null {

    // 获取大括号所在行的文本
    const braceLineText = document.lineAt(braceLineNum).text;
    const textBeforeBrace = braceLineText.substring(0, braceCharPos).trim();

    outputChannel.appendLine(`分析大括号前的文本: "${textBeforeBrace}"`);

    // 检查是否是嵌套结构体字段赋值
    const nestedFieldMatch = textBeforeBrace.match(/(\w+):\s*&?(\w+)$/);
    if (nestedFieldMatch) {
        const structName = nestedFieldMatch[2];
        outputChannel.appendLine(`找到嵌套结构体字段: ${nestedFieldMatch[1]}: ${structName}`);
        return {
            structName,
            isNestedStruct: true,
            matchType: 'nested'
        };
    }

    // 检查各种结构体初始化模式

    // 1. 数组初始化（同一行）
    if (textBeforeBrace.match(/\[\]\s*(\w+)$/) || textBeforeBrace.match(/\w+\s*:=\s*\[\]\s*(\w+)$/)) {
        const arrayMatch = textBeforeBrace.match(/\[\]\s*(\w+)$/) || textBeforeBrace.match(/\w+\s*:=\s*\[\]\s*(\w+)$/);
        if (arrayMatch) {
            const structName = arrayMatch[1];
            outputChannel.appendLine(`找到数组结构体初始化: ${structName}`);
            return {
                structName,
                isNestedStruct: false,
                matchType: 'array'
            };
        }
    }

    // 2. Map初始化（同一行）
    const mapMatch = textBeforeBrace.match(/map\[[^\]]+\]\s*(\w+)$/) ||
        textBeforeBrace.match(/\w+\s*:=\s*map\[[^\]]+\]\s*(\w+)$/) ||
        textBeforeBrace.match(/"[^"]*":\s*(\w+)$/);
    if (mapMatch) {
        const structName = mapMatch[1];
        outputChannel.appendLine(`找到map结构体初始化: ${structName}`);
        return {
            structName,
            isNestedStruct: false,
            matchType: 'map'
        };
    }

    // 3. append函数（同一行）
    const appendMatch = textBeforeBrace.match(/append\([^,]+,\s*(\w+)$/) ||
        textBeforeBrace.match(/append\([^,]+,\s*[^,]*,\s*(\w+)$/);
    if (appendMatch) {
        const structName = appendMatch[1];
        outputChannel.appendLine(`找到append结构体初始化: ${structName}`);
        return {
            structName,
            isNestedStruct: false,
            matchType: 'append'
        };
    }

    // 4. 函数参数（同一行）
    const funcParamMatch = textBeforeBrace.match(/\w+\([^)]*(\w+)$/) ||
        textBeforeBrace.match(/\w+\([^)]*,\s*(\w+)$/);
    if (funcParamMatch) {
        const structName = funcParamMatch[1];
        outputChannel.appendLine(`找到函数参数结构体初始化: ${structName}`);
        return {
            structName,
            isNestedStruct: false,
            matchType: 'function_param'
        };
    }

    // 5. 普通变量初始化（同一行）
    const variableMatch = textBeforeBrace.match(/(?:var\s+)?(\w+)\s*(?:=|:=)\s*&?(\w+)$/);
    if (variableMatch) {
        const structName = variableMatch[2];
        outputChannel.appendLine(`找到普通变量结构体初始化: ${structName}`);
        return {
            structName,
            isNestedStruct: false,
            matchType: 'variable'
        };
    }

    // 6. 特殊情况：只有结构体名称（可能是数组元素、map值等）
    const structNameMatch = textBeforeBrace.match(/^(\w+)$/);
    if (structNameMatch) {
        const structName = structNameMatch[1];
        outputChannel.appendLine(`检测到单独的结构体名称: ${structName}，开始上下文分析`);

        // 向上查找上下文来确定这是什么类型的初始化
        const contextResult = analyzeStructContextByLookingUp(document, braceLineNum, structName, outputChannel);
        if (contextResult) {
            return contextResult;
        }
    }

    // 7. 如果当前行没有完整的声明，向上查找
    const variableDeclaration = findVariableDeclarationBeforeBrace(document, braceLineNum, braceCharPos, outputChannel);
    if (variableDeclaration) {
        const structName = variableDeclaration[2];
        outputChannel.appendLine(`找到跨行变量结构体初始化: ${structName}`);
        return {
            structName,
            isNestedStruct: false,
            matchType: 'variable'
        };
    }

    // 8. 处理跨行的结构体声明
    const multiLineMatch = findMultiLineStructDeclaration(document, braceLineNum, braceCharPos, outputChannel);
    if (multiLineMatch) {
        return multiLineMatch;
    }

    return null;
}

/**
 * 通过向上查找来分析结构体上下文
 * 用于处理只有结构体名称的情况，如数组元素、map值等
 */
function analyzeStructContextByLookingUp(
    document: vscode.TextDocument,
    braceLineNum: number,
    structName: string,
    outputChannel: vscode.OutputChannel
): StructMatchResult | null {

    outputChannel.appendLine(`开始向上查找 "${structName}" 的上下文`);

    // 向上查找最多10行来确定上下文
    for (let lineNum = braceLineNum - 1; lineNum >= Math.max(0, braceLineNum - 10); lineNum--) {
        const lineText = document.lineAt(lineNum).text;
        outputChannel.appendLine(`检查行 ${lineNum}: "${lineText}"`);

        // 检查是否是数组声明 - 更灵活的模式匹配
        const arrayPatterns = [
            // 基本数组模式：[]StructName{
            new RegExp(`\\[\\]\\s*${structName}\\s*{\\s*$`),
            // 变量赋值数组模式：varName := []StructName{
            new RegExp(`(\\w+)\\s*:=\\s*\\[\\]\\s*${structName}\\s*{\\s*$`),
            // var声明数组模式：var varName = []StructName{
            new RegExp(`var\\s+(\\w+)\\s*=\\s*\\[\\]\\s*${structName}\\s*{\\s*$`),
            // 更宽松的数组模式，不要求大括号在行末
            new RegExp(`\\[\\]\\s*${structName}\\s*{`),
            new RegExp(`(\\w+)\\s*:=\\s*\\[\\]\\s*${structName}\\s*{`),
            new RegExp(`var\\s+(\\w+)\\s*=\\s*\\[\\]\\s*${structName}\\s*{`)
        ];

        for (const pattern of arrayPatterns) {
            if (pattern.test(lineText)) {
                outputChannel.appendLine(`找到数组上下文: ${structName} (模式: ${pattern})`);
                return {
                    structName,
                    isNestedStruct: false,
                    matchType: 'array'
                };
            }
        }

        // 检查是否是Map声明 - 更灵活的模式匹配
        const mapPatterns = [
            // 基本map模式：map[KeyType]StructName{
            new RegExp(`map\\[[^\\]]+\\]\\s*${structName}\\s*{\\s*$`),
            // 变量赋值map模式：varName := map[KeyType]StructName{
            new RegExp(`(\\w+)\\s*:=\\s*map\\[[^\\]]+\\]\\s*${structName}\\s*{\\s*$`),
            // map值模式："key": StructName{
            new RegExp(`"[^"]*":\\s*${structName}\\s*{\\s*$`),
            // 更宽松的map模式
            new RegExp(`map\\[[^\\]]+\\]\\s*${structName}\\s*{`),
            new RegExp(`(\\w+)\\s*:=\\s*map\\[[^\\]]+\\]\\s*${structName}\\s*{`),
            new RegExp(`"[^"]*":\\s*${structName}\\s*{`)
        ];

        for (const pattern of mapPatterns) {
            if (pattern.test(lineText)) {
                outputChannel.appendLine(`找到map上下文: ${structName} (模式: ${pattern})`);
                return {
                    structName,
                    isNestedStruct: false,
                    matchType: 'map'
                };
            }
        }

        // 检查是否是append函数 - 更灵活的模式匹配
        const appendPatterns = [
            // append模式：append(slice, StructName{
            new RegExp(`append\\([^,]+,\\s*${structName}\\s*{\\s*$`),
            // append多参数模式：append(slice, other, StructName{
            new RegExp(`append\\([^,]+,\\s*[^,]*,\\s*${structName}\\s*{\\s*$`),
            // 更宽松的append模式
            new RegExp(`append\\([^,]+,\\s*${structName}\\s*{`),
            new RegExp(`append\\([^,]+,\\s*[^,]*,\\s*${structName}\\s*{`)
        ];

        for (const pattern of appendPatterns) {
            if (pattern.test(lineText)) {
                outputChannel.appendLine(`找到append上下文: ${structName} (模式: ${pattern})`);
                return {
                    structName,
                    isNestedStruct: false,
                    matchType: 'append'
                };
            }
        }

        // 检查是否是函数参数 - 更灵活的模式匹配
        const funcParamPatterns = [
            // 函数参数模式：funcName(StructName{
            new RegExp(`\\w+\\([^)]*${structName}\\s*{\\s*$`),
            // 函数多参数模式：funcName(param, StructName{
            new RegExp(`\\w+\\([^)]*,\\s*${structName}\\s*{\\s*$`),
            // 更宽松的函数参数模式
            new RegExp(`\\w+\\([^)]*${structName}\\s*{`),
            new RegExp(`\\w+\\([^)]*,\\s*${structName}\\s*{`)
        ];

        for (const pattern of funcParamPatterns) {
            if (pattern.test(lineText)) {
                outputChannel.appendLine(`找到函数参数上下文: ${structName} (模式: ${pattern})`);
                return {
                    structName,
                    isNestedStruct: false,
                    matchType: 'function_param'
                };
            }
        }

        // 新增：检查是否包含数组、map等关键字，即使格式不完全匹配
        if (lineText.includes('[]') && lineText.includes(structName)) {
            outputChannel.appendLine(`通过关键字匹配找到数组上下文: ${structName}`);
            return {
                structName,
                isNestedStruct: false,
                matchType: 'array'
            };
        }

        if (lineText.includes('map[') && lineText.includes(structName)) {
            outputChannel.appendLine(`通过关键字匹配找到map上下文: ${structName}`);
            return {
                structName,
                isNestedStruct: false,
                matchType: 'map'
            };
        }

        if (lineText.includes('append(') && lineText.includes(structName)) {
            outputChannel.appendLine(`通过关键字匹配找到append上下文: ${structName}`);
            return {
                structName,
                isNestedStruct: false,
                matchType: 'append'
            };
        }

        // 如果遇到其他赋值语句或函数声明，停止查找
        if (lineText.includes('func ') || (lineText.includes(':=') && !lineText.includes(structName))) {
            outputChannel.appendLine(`遇到函数或其他赋值，停止查找`);
            break;
        }
    }

    outputChannel.appendLine(`未找到明确的上下文，默认为普通变量初始化`);
    return {
        structName,
        isNestedStruct: false,
        matchType: 'variable'
    };
}

/**
 * 查找跨行的变量声明
 */
function findVariableDeclarationBeforeBrace(
    document: vscode.TextDocument,
    braceLineNum: number,
    braceCharPos: number,
    outputChannel: vscode.OutputChannel
): RegExpMatchArray | null {

    // 向上查找变量声明
    for (let lineNum = braceLineNum - 1; lineNum >= Math.max(0, braceLineNum - 3); lineNum--) {
        const lineText = document.lineAt(lineNum).text.trim();
        outputChannel.appendLine(`向上查找变量声明，检查行 ${lineNum}: "${lineText}"`);

        // 匹配变量声明模式
        const variableMatch = lineText.match(/(?:var\s+)?(\w+)\s*(?:=|:=)\s*&?(\w+)$/);
        if (variableMatch) {
            outputChannel.appendLine(`找到跨行变量声明: ${variableMatch[1]} := ${variableMatch[2]}`);
            return variableMatch;
        }

        // 如果遇到其他赋值语句或函数声明，停止查找
        if (lineText.includes('func ') || (lineText.includes(':=') && !lineText.includes('{'))) {
            break;
        }
    }

    return null;
}

/**
 * 查找跨行的结构体声明
 */
function findMultiLineStructDeclaration(
    document: vscode.TextDocument,
    braceLineNum: number,
    braceCharPos: number,
    outputChannel: vscode.OutputChannel
): StructMatchResult | null {

    // 合并当前行和前面几行的文本来查找完整的声明
    let combinedText = '';
    let startLine = Math.max(0, braceLineNum - 5); // 增加查找范围

    for (let lineNum = startLine; lineNum <= braceLineNum; lineNum++) {
        const lineText = document.lineAt(lineNum).text;
        if (lineNum === braceLineNum) {
            // 只取大括号之前的部分
            combinedText += ' ' + lineText.substring(0, braceCharPos);
        } else {
            combinedText += ' ' + lineText;
        }
    }

    combinedText = combinedText.trim().replace(/\s+/g, ' '); // 清理多余空格
    outputChannel.appendLine(`分析合并后的文本: "${combinedText}"`);

    // 尝试匹配各种模式
    const patterns = [
        // 普通变量声明
        { regex: /(?:var\s+)?(\w+)\s*(?:=|:=)\s*&?(\w+)$/, type: 'variable' },

        // 数组初始化 - 基本格式
        { regex: /(?:var\s+)?(\w+)\s*(?:=|:=)\s*\[\]\s*(\w+)$/, type: 'array' },

        // 数组初始化 - 带元素
        { regex: /(?:var\s+)?(\w+)\s*(?:=|:=)\s*\[\]\s*(\w+)\s*{\s*(\w+)$/, type: 'array' },

        // 数组元素
        { regex: /\[\]\s*(\w+)\s*{\s*.*?(\w+)$/, type: 'array' },

        // Map初始化 - 基本格式
        { regex: /(?:var\s+)?(\w+)\s*(?:=|:=)\s*map\[[^\]]+\]\s*(\w+)$/, type: 'map' },

        // Map初始化 - 带值
        { regex: /(?:var\s+)?(\w+)\s*(?:=|:=)\s*map\[[^\]]+\]\s*(\w+)\s*{\s*.*?(\w+)$/, type: 'map' },

        // Map值
        { regex: /"[^"]*":\s*(\w+)$/, type: 'map' },

        // append函数
        { regex: /append\([^,]+,\s*(\w+)$/, type: 'append' },
        { regex: /append\([^,]+,\s*[^,]*,\s*(\w+)$/, type: 'append' },

        // 函数参数
        { regex: /\w+\([^)]*(\w+)$/, type: 'function_param' },
        { regex: /\w+\([^)]*,\s*(\w+)$/, type: 'function_param' },

        // 复杂的数组元素场景
        { regex: /(\w+)\s*:=\s*\[\]\s*(\w+)\s*{\s*(\w+)$/, type: 'array' },
        { regex: /(\w+)\s*:=\s*map\[[^\]]+\]\s*(\w+)\s*{\s*"[^"]*":\s*(\w+)$/, type: 'map' }
    ];

    for (const pattern of patterns) {
        const match = combinedText.match(pattern.regex);
        if (match) {
            // 确定结构体名称（通常是最后一个捕获组）
            let structName = '';
            for (let i = match.length - 1; i >= 1; i--) {
                if (match[i] && /^[A-Z][a-zA-Z0-9]*$/.test(match[i])) { // Go结构体命名约定
                    structName = match[i];
                    break;
                }
            }

            // 如果没有找到符合命名约定的，使用最后一个捕获组
            if (!structName) {
                structName = match[match.length - 1] || match[1];
            }

            let matchType: 'variable' | 'nested' | 'array' | 'map' | 'append' | 'function_param' = 'variable';

            // 根据模式类型和文本内容确定匹配类型
            if (pattern.type === 'array' || combinedText.includes('[]')) {
                matchType = 'array';
            } else if (pattern.type === 'map' || combinedText.includes('map[')) {
                matchType = 'map';
            } else if (pattern.type === 'append' || combinedText.includes('append(')) {
                matchType = 'append';
            } else if (pattern.type === 'function_param' || (combinedText.includes('(') && !combinedText.includes(':='))) {
                matchType = 'function_param';
            } else {
                matchType = 'variable';
            }

            outputChannel.appendLine(`在跨行文本中找到结构体声明: ${structName}, 类型: ${matchType}, 匹配模式: ${pattern.regex}`);
            return {
                structName,
                isNestedStruct: false,
                matchType
            };
        }
    }

    // 如果所有标准模式都不匹配，尝试提取可能的结构体名称
    const words = combinedText.split(/\s+/);
    for (let i = words.length - 1; i >= 0; i--) {
        const word = words[i];
        // 检查是否是有效的Go结构体名称（首字母大写）
        if (/^[A-Z][a-zA-Z0-9]*$/.test(word)) {
            outputChannel.appendLine(`尝试使用提取的结构体名称: ${word}`);

            // 根据上下文推断类型
            let matchType: 'variable' | 'nested' | 'array' | 'map' | 'append' | 'function_param' = 'variable';
            if (combinedText.includes('[]')) {
                matchType = 'array';
            } else if (combinedText.includes('map[')) {
                matchType = 'map';
            } else if (combinedText.includes('append(')) {
                matchType = 'append';
            } else if (combinedText.includes('(') && !combinedText.includes(':=')) {
                matchType = 'function_param';
            }

            return {
                structName: word,
                isNestedStruct: false,
                matchType
            };
        }
    }

    outputChannel.appendLine('在跨行文本中未找到匹配的结构体声明');
    return null;
}

/**
 * 计算插入位置
 */
function calculateInsertPosition(
    document: vscode.TextDocument,
    position: vscode.Position,
    matchType: string,
    outputChannel: vscode.OutputChannel
): vscode.Position {

    outputChannel.appendLine(`计算插入位置，匹配类型: ${matchType}, 当前位置: ${position.line}:${position.character}`);

    // 首先查找当前行中的左大括号位置
    const currentLine = document.lineAt(position.line);
    const currentLineText = currentLine.text;
    let braceIndex = currentLineText.indexOf('{');

    if (braceIndex !== -1) {
        // 如果当前行有左大括号，在其后插入
        const insertPosition = new vscode.Position(position.line, braceIndex + 1);
        outputChannel.appendLine(`当前行找到左大括号，插入位置: ${position.line}:${braceIndex + 1}`);
        return insertPosition;
    }

    // 向上查找最近的带有左大括号的行
    let lineWithBrace = position.line - 1;
    while (lineWithBrace >= 0) {
        const checkLine = document.lineAt(lineWithBrace);
        const checkText = checkLine.text;
        const checkBraceIndex = checkText.indexOf('{');

        if (checkBraceIndex !== -1) {
            // 如果之前的行有左大括号，判断是否应该在其后插入
            const textAfterBrace = checkText.substring(checkBraceIndex + 1).trim();
            if (textAfterBrace === '' || position.line > lineWithBrace) {
                // 如果左大括号后面没有其他内容，或者当前行在左大括号之后的行
                const insertPosition = new vscode.Position(lineWithBrace, checkBraceIndex + 1);
                outputChannel.appendLine(`在行 ${lineWithBrace} 找到左大括号，插入位置: ${lineWithBrace}:${checkBraceIndex + 1}`);
                return insertPosition;
            }
        }
        lineWithBrace--;
    }

    // 如果未找到合适的插入位置，使用当前光标位置
    outputChannel.appendLine(`未找到合适的大括号，使用当前光标位置: ${position.line}:${position.character}`);
    return position;
}

/**
 * 生成结构体字段填充代码
 * @param fields 结构体字段列表
 * @param outputChannel 输出通道
 * @param matchType 匹配类型
 * @returns 生成的代码字符串
 */
function generateFillCode(fields: GoField[], outputChannel: vscode.OutputChannel, matchType: string): string {
    // 获取当前编辑器
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        outputChannel.appendLine('未找到活动编辑器');
        return '';
    }

    const position = editor.selection.active;
    const document = editor.document;

    outputChannel.appendLine(`开始生成代码，匹配类型: ${matchType}, 当前位置: ${position.line}:${position.character}`);

    // 根据匹配类型确定缩进策略
    let baseIndent = '';
    let innerIndent = '';

    // 获取当前行或相关行的缩进
    const currentLine = document.lineAt(position.line);
    const currentLineText = currentLine.text;

    // 查找包含左大括号的行来确定基础缩进
    let braceLineText = currentLineText;
    let braceLineIndex = position.line;

    // 如果当前行没有左大括号，向上查找
    if (!currentLineText.includes('{')) {
        for (let i = position.line - 1; i >= Math.max(0, position.line - 5); i--) {
            const lineText = document.lineAt(i).text;
            if (lineText.includes('{')) {
                braceLineText = lineText;
                braceLineIndex = i;
                break;
            }
        }
    }

    // 提取基础缩进
    const braceIndentMatch = braceLineText.match(/^(\s*)/);
    baseIndent = braceIndentMatch ? braceIndentMatch[1] : '';

    outputChannel.appendLine(`基础缩进行 ${braceLineIndex}: '${braceLineText}'`);
    outputChannel.appendLine(`提取的基础缩进: '${baseIndent}' (长度: ${baseIndent.length})`);

    // 根据匹配类型调整缩进策略
    switch (matchType) {
        case 'array':
            // 数组中的结构体，通常需要额外的缩进
            innerIndent = baseIndent + '    ';
            outputChannel.appendLine(`数组模式，内部缩进: '${innerIndent}'`);
            break;

        case 'map':
            // map中的结构体，通常需要额外的缩进
            innerIndent = baseIndent + '    ';
            outputChannel.appendLine(`map模式，内部缩进: '${innerIndent}'`);
            break;

        case 'append':
            // append函数中的结构体，通常需要额外的缩进
            innerIndent = baseIndent + '    ';
            outputChannel.appendLine(`append模式，内部缩进: '${innerIndent}'`);
            break;

        case 'function_param':
            // 函数参数中的结构体，通常需要额外的缩进
            innerIndent = baseIndent + '    ';
            outputChannel.appendLine(`函数参数模式，内部缩进: '${innerIndent}'`);
            break;

        case 'nested':
            // 嵌套结构体，需要更深的缩进
            innerIndent = baseIndent + '    ';
            outputChannel.appendLine(`嵌套结构体模式，内部缩进: '${innerIndent}'`);
            break;

        case 'variable':
        default:
            // 普通变量初始化，标准缩进
            innerIndent = baseIndent + '    ';
            outputChannel.appendLine(`变量初始化模式，内部缩进: '${innerIndent}'`);
            break;
    }

    // 生成字段代码
    const fieldLines = fields.map(field => {
        const defaultValue = getDefaultValue(field);
        return `${innerIndent}${field.name}: ${defaultValue},`;
    });

    // 如果没有字段，不生成代码
    if (fieldLines.length === 0) {
        outputChannel.appendLine('没有字段需要填充');
        return '';
    }

    // 根据匹配类型生成不同格式的代码
    let generatedCode;

    switch (matchType) {
        case 'array':
        case 'map':
        case 'append':
        case 'function_param':
            // 这些场景通常在一行内，需要紧凑的格式
            generatedCode = `\n${fieldLines.join('\n')}\n${baseIndent}`;
            break;

        case 'nested':
            // 嵌套结构体，使用标准格式
            generatedCode = `\n${fieldLines.join('\n')}\n${baseIndent}`;
            break;

        case 'variable':
        default:
            // 普通变量初始化，使用标准格式
            generatedCode = `\n${fieldLines.join('\n')}\n${baseIndent}`;
            break;
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



/**
 * 在当前文档中寻找最佳的补全位置
 * 避免创建临时文档，直接在现有代码中找到合适的位置获取结构体字段补全
 */
function findOptimalCompletionPosition(
    document: vscode.TextDocument,
    position: vscode.Position,
    structName: string,
    matchType: string,
    outputChannel: vscode.OutputChannel
): vscode.Position | null {
    outputChannel.appendLine(`为 ${structName} (类型: ${matchType}) 寻找最佳补全位置`);

    // 在当前位置附近寻找结构体初始化语句
    const currentLine = document.lineAt(position.line);
    const currentLineText = currentLine.text;

    // 如果当前行包含结构体名称和大括号，尝试在大括号内获取补全
    const structInitRegex = new RegExp(`${structName}\\s*{`);
    if (structInitRegex.test(currentLineText)) {
        const braceIndex = currentLineText.indexOf('{');
        if (braceIndex !== -1) {
            const testPosition = new vscode.Position(position.line, braceIndex + 1);
            outputChannel.appendLine(`在当前行找到结构体初始化，使用位置 ${position.line}:${braceIndex + 1}`);
            return testPosition;
        }
    }

    // 向上查找最近的结构体声明
    for (let lineOffset = 0; lineOffset <= 5; lineOffset++) {
        const targetLine = position.line - lineOffset;
        if (targetLine < 0) break;

        const lineText = document.lineAt(targetLine).text;

        // 检查是否包含目标结构体的初始化
        if (lineText.includes(structName) && lineText.includes('{')) {
            const braceIndex = lineText.indexOf('{');
            if (braceIndex !== -1) {
                // 尝试在大括号后面的位置
                let testPosition: vscode.Position;

                // 如果大括号在行末，检查下一行
                if (braceIndex === lineText.trim().length - 1) {
                    if (targetLine + 1 < document.lineCount) {
                        const nextLineText = document.lineAt(targetLine + 1).text;
                        const indentMatch = nextLineText.match(/^(\s*)/);
                        const indent = indentMatch ? indentMatch[1].length : 0;
                        testPosition = new vscode.Position(targetLine + 1, Math.max(indent, 2));
                    } else {
                        testPosition = new vscode.Position(targetLine, braceIndex + 1);
                    }
                } else {
                    testPosition = new vscode.Position(targetLine, braceIndex + 1);
                }

                outputChannel.appendLine(`在行 ${targetLine} 找到结构体初始化，使用位置 ${testPosition.line}:${testPosition.character}`);
                return testPosition;
            }
        }
    }

    // 如果没有找到特殊位置，返回当前位置
    outputChannel.appendLine('未找到特殊的补全位置，使用当前光标位置');
    return null;
}

