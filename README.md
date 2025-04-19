# Go Struct Auto Fill

## 简介

Go Struct Auto Fill 是一个 Visual Studio Code 插件，用于自动填充 Go 语言结构体的字段。它可以帮助开发者在初始化结构体时，快速生成并填充所有未初始化的字段，减少手动输入的工作量。

## 功能

- **自动填充结构体字段**：根据结构体定义，自动生成并填充未初始化的字段。
- **支持嵌套结构体**：能够正确处理嵌套结构体，并填充其字段。
- **智能字段检查**：确保只在当前结构体的范围内检查字段是否已存在，避免跨结构体的错误判断。
- **详细的日志输出**：提供详细的日志信息，帮助开发者诊断问题。

## 最近更新

- **优化结构体名称提取逻辑**：优先匹配光标所在行及其周围的代码，以正确识别结构体类型。
- **改进字段存在性检查逻辑**：确保只在当前结构体的范围内进行检查，避免跨结构体的错误判断。
- **增强日志输出**：在字段检查和处理过程中，提供更详细的日志信息。

## 安装

### 从源码安装

1. **克隆仓库**：
```bash
git clone https://github.com/leeprince/go-struct-auto-fill.git
cd go-struct-auto-fill
```

2. **安装依赖**：
```bash
npm install
```

3. **编译插件**：
```bash
npm run compile
```

4. **打包插件**：
```bash
vsce package
```

4.1 发布到 vscode 的 Marketplace.
参考：https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publishing-extensions

认证需要<publisher id>
```bash
vsce login <publisher id>
```

命令发布
```bash
vsce publish
```

> 如果命令发布失败，还可以通过**手动上传**，详情参考官方文档。

5. **安装插件**：
   - 打开 Visual Studio Code。
   - 进入扩展面板（Ctrl+Shift+X）。
   - 点击右上角的 `...` 按钮，选择 `从 VSIX 安装...`。
   - 选择生成的 `.vsix` 文件进行安装。

### 从 Marketplace 安装

1. 打开 Visual Studio Code。
2. 进入扩展面板（Ctrl+Shift+X）。
3. 搜索 `Go Struct Auto Fill` 并点击安装。

## 使用

1. 打开一个 Go 文件。
2. 将光标放在结构体初始化的大括号 `{` 内。
3. 触发自动填充命令：
   - 使用快捷键（默认未设置，可在命令面板中设置）。
   - 右键点击并选择 `Fill Struct Fields`。
   - 在命令面板（Ctrl+Shift+P）中搜索并选择 `Go Struct Auto Fill: Fill Struct Fields`。

## 技术方案

### 1. 结构体识别

使用正则表达式匹配结构体初始化语句，支持以下格式：
- `变量名 := 结构体名{`
- `var 变量名 = 结构体名{`
- `变量名 := &结构体名{`
- `var 变量名 = &结构体名{`

### 2. 字段获取

使用 VSCode 的 `vscode.executeCompletionItemProvider` API 获取结构体字段信息：
- 通过 `CompletionItemKind.Field` 识别字段
- 从补全项中提取字段名称和类型
- 跳过嵌套字段（包含点的字段名）
- 保持字段顺序与结构体定义一致

### 3. 默认值生成

根据字段类型生成合适的默认值：
- 指针类型：`nil`
- 字符串：`""`
- 整数类型：`0`
- 浮点类型：`0.0`
- 布尔类型：`false`
- 数组类型：`nil`
- 其他类型（结构体等）：`类型名{}`

### 4. 代码格式化

- 智能处理换行符，保持代码格式整洁
- 保持原有缩进格式
- 只在字段列表前后各添加一个换行符
- 支持部分字段已存在的情况，不会重复填充

## 开发历程

### 遇到的问题及解决方案

1. **gopls 状态检查问题**
   - 问题：最初尝试检查 gopls 是否运行，但发现这种方式不可靠
   - 解决：改用 VSCode 的标准 API `vscode.executeCompletionItemProvider` 获取结构体信息

2. **结构体字段获取问题**
   - 问题：最初尝试使用 `gopls.struct_fields` 命令，但返回的数据格式不稳定
   - 解决：使用 VSCode 的补全 API 获取字段信息，更稳定可靠

3. **嵌套字段处理问题**
   - 问题：补全 API 会返回所有可能的字段，包括嵌套字段
   - 解决：通过检查字段名是否包含点（`.`）来识别和跳过嵌套字段

4. **日志输出问题**
   - 问题：日志信息没有正确显示在 VSCode 的输出面板中
   - 解决：使用 `vscode.window.createOutputChannel` 创建专门的输出通道，并确保在关键步骤添加日志

5. **字段顺序和格式问题**
   - 问题：字段顺序与结构体定义不一致，且存在多余的换行符
   - 解决：实现字段排序算法，并优化换行符处理逻辑

### 技术要点

1. **VSCode 插件开发**
   - 使用 TypeScript 开发
   - 利用 VSCode 的 API 进行编辑器交互
   - 实现命令注册和快捷键绑定

2. **Go 语言特性支持**
   - 支持指针类型
   - 支持基本类型和复合类型
   - 支持结构体嵌套
   - 保持字段定义顺序

3. **错误处理**
   - 完善的错误检查和提示
   - 详细的日志记录
   - 用户友好的错误消息

4. **代码格式化**
   - 智能处理缩进和换行
   - 保持代码风格一致性
   - 优化部分字段已存在的情况


## 反馈与贡献

如果你在使用过程中遇到任何问题，或者有改进建议，欢迎在 [GitHub Issues](https://github.com/leeprince/go-struct-auto-fill.git) 中提交问题。

如果你有兴趣贡献代码，请 fork 仓库并提交 Pull Request。

也可以通过关注公众号《皇子谈技术》，联系到我。

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
