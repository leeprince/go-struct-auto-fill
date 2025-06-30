# Changelog

## 最近更新 🎉

### v1.3.5 - 包名结构体识别优化 🚀

#### 🎯 重大功能增强

- ✅ **包名结构体完美支持**：完全解决了包名形式结构体（如 `user.User`、`pb.Message`）的识别和填充问题
- ✅ **字段顺序严格按定义排列**：删除现有字段，按照结构体定义顺序重新插入完整字段列表
- ✅ **保留已存在字段值**：在重排序过程中完美保留已存在字段的值
- ✅ **智能字段过滤**：自动过滤 protobuf 等生成代码中的不可访问字段
- ✅ **日志开关**：新增日志开关配置，默认关闭，避免日志输出过多影响性能
- ✅ **架构图**：新增架构图，方便开发者了解插件的内部工作原理

#### 🚨 解决的关键问题

**问题1：包名结构体识别错误**

```go
// 修复前 - 错误识别
userInfo := &user.User{
    Name:  "",
    Email: "",
}
// 插件错误识别为 "Address" 结构体 ❌
```

**问题2：已存在字段被忽略**

```go
// 修复前 - 忽略已存在字段
userInfo := &user.User{
    Name:  "",
    Email: "",
}
// 使用插件后只生成新字段，忽略已存在字段 ❌
userInfo := &user.User{
    Id:       0,
    IsActive: 0,
}
```

#### ✅ 修复后的完美效果

```go
// 使用前
userInfo := &user.User{
    Name:  "",
    Email: "",
}

// 使用后 - 完美的字段顺序和值保留 ✅
userInfo := &user.User{
    Id:       0,                    // 新增字段，按定义顺序
    Name:     "",                   // 保留原值
    Email:    "",                   // 保留原值  
    IsActive: 0,                    // 新增字段，按定义顺序
}
```

#### 🔧 技术实现亮点

1. **简化结构体识别逻辑**

   ```typescript
   // 新增 findStructDeclarationSimple() 函数
   // 使用直接的正则表达式匹配常见模式：
   // - xxx := &pkg.StructName{
   // - var xxx = pkg.StructName{
   // - pkg.StructName{
   ```

2. **精确字段解析**

   ```typescript
   // 重写 parseExistingStructFields() 函数
   // 只匹配真正的字段行：/^([A-Z][a-zA-Z0-9]*)\s*:\s*(.+?)(?:,\s*)?$/
   // 过滤掉变量声明和无关内容
   ```

3. **完整字段合并**

   ```typescript
   // 增强 generateOrderedFieldsCode() 函数
   // 合并已存在字段和新字段
   // 按照结构体定义顺序重新排列
   ```

4. **包名结构体定义查找**

   ```typescript
   // 优化 getStructFieldDefinitionOrder() 函数
   // 支持在包目录中搜索结构体定义
   // 使用 **/${pkgName}/**/*.go 模式匹配
   ```

#### 💡 支持的包名结构体场景

```go
// ✅ protobuf 生成的结构体
userInfo := &user.User{
    // 自动过滤 state、unknownFields、sizeCache 等不可访问字段
    // 只填充 Id、Name、Email、IsActive 等公开字段
}

// ✅ 其他包的结构体
config := &config.Settings{
    // 按照 Settings 结构体定义顺序填充
}

// ✅ 嵌套包名结构体
response := &api.Response{
    Data: &api.UserData{
        // 支持嵌套的包名结构体
    },
}
```

#### 🎯 核心改进点

1. **删除-重插策略**：完全删除现有字段，按定义顺序重新插入完整字段列表
2. **值保留机制**：在删除重插过程中完美保留已存在字段的值
3. **包名识别**：支持 `pkg.StructName` 格式的结构体识别
4. **字段过滤**：智能过滤不可访问字段（私有字段、protobuf内部字段）
5. **顺序严格性**：严格按照结构体定义文件中的字段顺序排列

### v1.2.6 - 字段顺序填充测试场景

#### 🎯 测试场景完善

添加了完整的字段顺序填充测试场景，验证以下功能：

1. **空结构体填充**：按结构体定义顺序填充所有字段
2. **部分字段重排**：保留已有字段值，填充缺失字段，重新排序
3. **本地结构体测试**：支持当前文件中定义的结构体
4. **包名结构体测试**：支持其他包中定义的结构体

### v1.2.5 - 嵌套结构体解析修复 🔧

#### 🚨 重要修复

- ✅ **嵌套结构体值完整保留**：修复了嵌套结构体字段值在重排时被截断或丢失的严重问题
- ✅ **智能状态机解析器**：重写字段解析逻辑，采用状态机算法精确处理复杂值
- ✅ **大括号匹配算法**：正确处理嵌套大括号，确保复杂结构体值的完整性
- ✅ **字符串安全处理**：智能处理字符串字面量，避免字符串内特殊字符的误解析

#### 🔧 技术实现

- **状态机解析器**：`parseStructFieldsWithComplexValues()` - 使用状态机算法替代简单正则表达式
- **智能值解析**：`parseFieldValue()` - 支持大括号匹配、字符串处理、多行字段值
- **大括号计数**：精确跟踪嵌套层级，确保在正确位置结束字段解析
- **字符串状态跟踪**：防止字符串内的特殊字符被误解析为语法元素

#### 💡 支持的复杂场景

```go
// ✅ 现在完美支持所有这些复杂场景：

// 1. 嵌套结构体
field: &Type{
    SubField: value,
}

// 2. 包含大括号的字符串
field: "string with {braces} and {more}"

// 3. 多行复杂值
field: ComplexType{
    Line1: value1,
    Line2: value2,
}

// 4. 混合场景
struct {
    SimpleField: "value",
    ComplexField: &Type{
        Nested: AnotherType{
            DeepNested: "value",
        },
    },
    AnotherSimple: 123,
}
```

### v1.2.4 - 按结构体定义顺序填充 🎯

#### 🎯 重大功能增强

- ✅ **按定义顺序填充**：严格按照结构体定义中的字段顺序自动填充和重排字段
- ✅ **智能字段合并**：保留已有字段值，只填充缺失字段，并按定义顺序重新排列
- ✅ **精确缩进对齐**：分析现有字段的缩进模式，确保新字段完美对齐
- ✅ **结构体定义解析**：直接解析源码中的结构体定义，获取准确的字段顺序

#### 💡 功能说明

**场景1：空结构体填充**

```go
// 填充前
d := ddd{
}

// 填充后（按Name -> Age -> Address顺序）
d := ddd{
    Name:    "",
    Age:     0,
    Address: "",
}
```

**场景2：部分字段重排**

```go
// 填充前（字段顺序错乱）
d := ddd{
    Address: "beijing",
    Name:    "test",
}

// 填充后（保留值，按定义顺序重排）
d := ddd{
    Name:    "test",     // 保留原值
    Age:     0,          // 新增字段
    Address: "beijing",  // 保留原值
}
```

**场景3：缺失字段补充**

```go
// 填充前（只有中间字段）
d := ddd{
    Age: 25,
}

// 填充后（按顺序补充缺失字段）
d := ddd{
    Name:    "",   // 新增
    Age:     25,   // 保留
    Address: "",   // 新增
}
```

### v1.2.3 - 移除临时文件优化 ✨

#### 🎯 重大优化

- ✅ **完全移除临时文件**：不再创建任何 `xxx_temp.go` 临时文件，确保工作区清洁
- ✅ **直接补全优化**：直接在当前文档中获取结构体字段补全信息，提升性能
- ✅ **保持所有功能**：删除临时文件机制的同时，完全保留所有自动填充功能
- ✅ **智能位置计算**：新增 `findOptimalCompletionPosition()` 函数，在当前文档中智能寻找最佳补全位置

### v1.2.2 - 跨行场景修复 🎯

#### 🚨 关键修复

- ✅ **跨行数组初始化修复**：完全解决了跨行场景下的结构体识别问题
- ✅ **临时文档补全上下文修复**：修复了gopls无法正确识别字段补全的核心问题
- ✅ **补全项类型识别修复**：确保获取到正确的字段补全项（kind=5）而不是通用补全（kind=0）
- ✅ **同步机制优化**：添加延迟和文档同步机制，确保gopls正确解析临时文档

### v1.2.1 - 新增场景修复 🔧

#### 🚨 重要修复

- ✅ **新增场景功能恢复**：修复了v1.1.0中数组、map、append、函数参数等场景无法正常工作的严重问题
- ✅ **结构体名称识别修复**：解决了结构体名称被错误截断的问题（如"ddd"被识别为"d"）
- ✅ **补全项获取优化**：改进临时文档创建逻辑，确保gopls能正确识别结构体字段
- ✅ **上下文分析增强**：新增专门的上下文分析函数，智能识别复杂场景

### v1.2.0 - 智能光标定位 🚀

#### 🎯 重大改进

- ✅ **智能光标定位**：现在支持在结构体大括号内**任何位置**触发自动填充！
- ✅ **智能大括号匹配**：通过大括号栈算法精确定位光标当前所在的结构体层级
- ✅ **增强嵌套支持**：完美支持多层嵌套结构体的正确识别和填充
- ✅ **跨行声明支持**：能够处理变量声明和结构体初始化在不同行的情况

#### 💡 使用体验提升

现在你可以在结构体大括号内的**任何位置**使用 `Alt+Enter`：

```go
d1 := ddd1{ // ✅ 光标在这里可以生成 ddd1 的字段
    // ✅ 光标在这里可以生成 ddd1 的字段  
    ddd2: &ddd2{ // ✅ 光标在这里可以生成 ddd2 的字段
        // ✅ 光标在这里可以生成 ddd2 的字段
        Name: "",
        Age: 0,
        // ✅ 光标在这里可以生成 ddd2 剩余的字段
    },
    // ✅ 光标在这里可以生成 ddd1 剩余的字段
}
```

### v1.1.0 - 功能大幅扩展

#### 🎯 新增支持的场景

- ✅ **数组初始化**：支持 `[]StructName{StructName{}}` 格式
- ✅ **Map初始化**：支持 `map[KeyType]StructName{"key": StructName{}}` 格式  
- ✅ **append函数**：支持 `append(slice, StructName{})` 格式
- ✅ **函数参数**：支持 `funcName(StructName{})` 格式
- ✅ **复杂嵌套**：支持多层嵌套的复杂场景

#### 🔧 技术改进

- **模块化识别系统**：重构了结构体识别逻辑，采用模块化设计
- **智能缩进系统**：根据不同场景自动调整缩进策略
- **改进的插入位置计算**：更准确地定位代码插入位置
- **增强的错误处理**：提供更详细的错误信息和日志

### v1.0.x - 基础功能

- **优化结构体名称提取逻辑**：优先匹配光标所在行及其周围的代码，以正确识别结构体类型。
- **改进字段存在性检查逻辑**：确保只在当前结构体的范围内进行检查，避免跨结构体的错误判断。
- **增强日志输出**：在字段检查和处理过程中，提供更详细的日志信息。

## 测试场景 🧪

### v1.3.0 版本测试场景

#### 测试场景1：包名结构体识别和字段顺序填充

**测试目标**：验证包名结构体（如 `user.User`）的正确识别和字段按定义顺序填充

**测试用例1.1：空包名结构体填充**

```go
// 测试前
userInfo := &user.User{
}

// 使用插件后（按结构体定义顺序：Id, Name, Email, IsActive）
userInfo := &user.User{
    Id:       0,
    Name:     "",
    Email:    "",
    IsActive: 0,
}
```

**测试用例1.2：部分字段重排和补充**

```go
// 测试前（字段顺序错乱，缺少字段）
userInfo := &user.User{
    Name:  "",
    Email: "",
}

// 使用插件后（保留原值，按定义顺序重排，补充缺失字段）
userInfo := &user.User{
    Id:       0,      // 新增字段
    Name:     "",     // 保留原值
    Email:    "",     // 保留原值
    IsActive: 0,      // 新增字段
}
```

**测试用例1.3：完整字段重排**

```go
// 测试前（字段顺序完全错乱）
userInfo := &user.User{
    IsActive: 1,
    Email:    "test@example.com",
    Id:       123,
    Name:     "张三",
}

// 使用插件后（严格按定义顺序重排，保留所有原值）
userInfo := &user.User{
    Id:       123,                // 保留原值，移动到正确位置
    Name:     "张三",             // 保留原值，移动到正确位置
    Email:    "test@example.com", // 保留原值，移动到正确位置
    IsActive: 1,                  // 保留原值，移动到正确位置
}
```

#### 测试场景2：protobuf字段过滤测试

**测试目标**：验证自动过滤protobuf生成代码中的不可访问字段

**测试用例2.1：protobuf字段过滤**

```go
// user.User 结构体定义（protobuf生成）
type User struct {
    Id       int64  `protobuf:"varint,1,opt,name=id,proto3" json:"id,omitempty"`
    Name     string `protobuf:"bytes,2,opt,name=name,proto3" json:"name,omitempty"`
    Email    string `protobuf:"bytes,3,opt,name=email,proto3" json:"email,omitempty"`
    IsActive int32  `protobuf:"varint,4,opt,name=is_active,json=isActive,proto3" json:"is_active,omitempty"`
    
    // 以下字段应该被过滤掉
    state         protoimpl.MessageState
    sizeCache     protoimpl.SizeCache
    unknownFields protoimpl.UnknownFields
}

// 测试前
userInfo := &user.User{
}

// 使用插件后（只填充可访问字段，过滤protobuf内部字段）
userInfo := &user.User{
    Id:       0,    // ✅ 公开字段
    Name:     "",   // ✅ 公开字段
    Email:    "",   // ✅ 公开字段
    IsActive: 0,    // ✅ 公开字段
    // state、sizeCache、unknownFields 被自动过滤 ✅
}
```

#### 测试场景3：嵌套包名结构体测试

**测试目标**：验证嵌套包名结构体的正确处理

**测试用例3.1：嵌套包名结构体**

```go
// 测试前
response := &api.Response{
    Data: &api.UserData{
        Name: "test",
    },
}

// 使用插件后（光标在 UserData 结构体内）
response := &api.Response{
    Data: &api.UserData{
        Id:       0,      // 新增字段
        Name:     "test", // 保留原值
        Email:    "",     // 新增字段
        IsActive: 0,      // 新增字段
    },
}
```

#### 测试场景4：复杂场景测试

**测试目标**：验证复杂场景下的包名结构体处理

**测试用例4.1：数组中的包名结构体**

```go
// 测试前
users := []user.User{
    user.User{
        Name: "张三",
    },
}

// 使用插件后
users := []user.User{
    user.User{
        Id:       0,       // 新增字段
        Name:     "张三",  // 保留原值
        Email:    "",      // 新增字段
        IsActive: 0,       // 新增字段
    },
}
```

**测试用例4.2：Map中的包名结构体**

```go
// 测试前
userMap := map[string]user.User{
    "admin": user.User{
        Email: "admin@example.com",
    },
}

// 使用插件后
userMap := map[string]user.User{
    "admin": user.User{
        Id:       0,                    // 新增字段
        Name:     "",                   // 新增字段
        Email:    "admin@example.com",  // 保留原值
        IsActive: 0,                    // 新增字段
    },
}
```

#### 测试场景5：日志验证测试

**测试目标**：验证修复后的日志输出正确性

**期望日志输出**：

```
[Go Struct Auto Fill] 开始处理结构体自动填充...
[Go Struct Auto Fill] 识别的结构体名称: user.User
[Go Struct Auto Fill] 解析的包名: user, 结构体名: User
[Go Struct Auto Fill] 找到已存在字段: ["Name", "Email"]
[Go Struct Auto Fill] 已存在字段值: {"Name": "\"\"", "Email": "\"\""}
[Go Struct Auto Fill] 获取到的字段: ["Id", "Name", "Email", "IsActive"]
[Go Struct Auto Fill] 过滤后的字段: ["Id", "Name", "Email", "IsActive"]
[Go Struct Auto Fill] 生成的字段代码: Id: 0, Name: "", Email: "", IsActive: 0
[Go Struct Auto Fill] 结构体字段填充完成
```

#### 测试场景6：错误修复验证

**测试目标**：验证之前版本的错误已完全修复

**修复前的错误行为**：

1. ❌ 结构体识别错误：`user.User` 被识别为 `Address`
2. ❌ 字段解析错误：解析出 `userInfo` 等错误字段
3. ❌ 已存在字段被忽略：只生成新字段，忽略已有字段
4. ❌ 字段顺序错乱：不按结构体定义顺序排列

**修复后的正确行为**：

1. ✅ 结构体识别正确：准确识别 `user.User`
2. ✅ 字段解析正确：只解析真正的结构体字段
3. ✅ 保留已存在字段：完美保留字段值并重新排序
4. ✅ 字段顺序正确：严格按结构体定义顺序排列

### 历史版本测试场景

#### v1.2.6 版本测试场景

**测试目标**：验证字段顺序填充功能的完整性

**测试用例**：

1. **空结构体填充**：按结构体定义顺序填充所有字段
2. **部分字段重排**：保留已有字段值，填充缺失字段，重新排序
3. **本地结构体测试**：支持当前文件中定义的结构体
4. **包名结构体测试**：支持其他包中定义的结构体

#### v1.2.5 版本测试场景

**测试目标**：验证嵌套结构体值的完整保留

**测试用例**：

```go
// 测试前
d5 := ddd1{
    ID: "123",
    ddd2: &ddd2{
        Name:    "",
        Age:     0,
        Address: "nested",
    },
}

// 使用插件后（完美保留嵌套结构体）
d5 := ddd1{
    ID:  "123",      // 保留原值
    Age: 0,          // 新增字段
    ddd2: &ddd2{     // ✅ 完整保留嵌套结构体
        Name:    "",
        Age:     0,
        Address: "nested",
    },
}
```
