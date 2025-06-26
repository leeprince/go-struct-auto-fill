# Go Struct Auto Fill

## 简介

Go Struct Auto Fill 是一个 Visual Studio Code 插件，用于自动填充 Go 语言结构体的字段。它可以帮助开发者在初始化结构体时，自动生成并填充所有未初始化的字段，减少手动输入的工作量。

**🎯 特别优化**：**完全不创建任何临时文件**，直接在当前文档中进行智能补全，确保工作区的清洁和安全。

## 功能

- **自动填充结构体字段**：根据结构体定义，自动生成并填充未初始化的字段。
- **智能光标定位** 🚀：支持在结构体大括号内**任何位置**触发自动填充，无需精确定位到特定行。
- **支持嵌套结构体**：能够正确处理嵌套结构体，并填充其字段。
- **多场景支持**：支持数组、map、append函数、函数参数等多种Go结构体初始化场景。
- **智能字段检查**：确保只在当前结构体的范围内检查字段是否已存在，避免跨结构体的错误判断。
- **智能缩进**：根据不同的初始化场景自动调整代码缩进格式。
- **详细的日志输出**：提供详细的日志信息，帮助开发者诊断问题。
- **无临时文件** ✨：**完全不创建任何临时文件**，直接在当前文档中获取补全信息，保持工作区清洁。
- **包名结构体支持** 🆕：完美支持包名形式的结构体（如 `user.User`、`pb.Message` 等）。
- **字段顺序严格按定义排列** 🎯：严格按照结构体定义顺序填充和重排所有字段。

> 结构体的作用：**数据封装构建复杂数据模型**、**方法绑定**、**JSON 序列化/反序列化**、**提高代码复用性和模块化**等

## 支持的场景

### ✅ 已支持的结构体初始化场景

#### 1. 普通变量初始化

```go
// 普通结构体
d := ddd{
    // 光标放在结构体大括号内任意位置，按 Alt+Enter 自动填充
}

// 指针结构体  
d2 := &ddd{
    // 光标放在结构体大括号内任意位置，按 Alt+Enter 自动填充
}

// var 声明
var d3 = ddd{
    // 光标放在结构体大括号内任意位置，按 Alt+Enter 自动填充
}
```

#### 2. 包名结构体初始化 🆕

```go
// 包名结构体（如 protobuf、其他包的结构体）
userInfo := &user.User{
    Name:  "张三",
    Email: "zhangsan@example.com",
    // 光标放在这里，按 Alt+Enter 自动填充剩余字段
}

// 填充后（严格按照结构体定义顺序）
userInfo := &user.User{
    Id:       0,                    // 新增字段
    Name:     "张三",               // 保留原值
    Email:    "zhangsan@example.com", // 保留原值
    IsActive: 0,                    // 新增字段
}
```

#### 3. 嵌套结构体

```go
d1 := ddd1{
    ID:  "",
    Age: 0,
    ddd2: &ddd2{
        // 光标放在结构体大括号内任意位置，按 Alt+Enter 自动填充嵌套结构体
    },
}

// 链表结构体
ln := ListNode{
    Val: 0,
    Next: &ListNode{
        // 光标放在结构体大括号内任意位置，按 Alt+Enter 自动填充
    },
}
```

#### 4. 数组初始化 🆕

```go
// 数组字面量
dList := []ddd{
    ddd{}, // 光标放在结构体大括号内任意位置，按 Alt+Enter 自动填充
}

// 多个数组元素
dList2 := []ddd{
    ddd{
        Name: "first",
    },
    ddd{}, // 光标放在结构体大括号内任意位置，按 Alt+Enter 自动填充
}
```

#### 5. Map初始化 🆕

```go
// 简单map
dMap := map[string]ddd{
    "name": ddd{}, // 光标放在结构体大括号内任意位置，按 Alt+Enter 自动填充
}

// 复杂map
complexMap := map[string][]ddd{
    "items": []ddd{
        ddd{}, // 光标放在结构体大括号内任意位置，按 Alt+Enter 自动填充
    },
}
```

#### 6. append函数 🆕

```go
var dSlice []ddd
dSlice = append(dSlice, ddd{}) // 光标放在结构体大括号内任意位置，按 Alt+Enter 自动填充
```

#### 7. 函数参数 🆕

```go
// 函数调用参数
processStruct(ddd{
    // 光标放在结构体大括号内任意位置，按 Alt+Enter 自动填充
})
```

## 最近更新 🎉

### v1.3.0 - 包名结构体识别优化 🚀

#### 🎯 重大功能增强

- ✅ **包名结构体完美支持**：完全解决了包名形式结构体（如 `user.User`、`pb.Message`）的识别和填充问题
- ✅ **字段顺序严格按定义排列**：删除现有字段，按照结构体定义顺序重新插入完整字段列表
- ✅ **保留已存在字段值**：在重排序过程中完美保留已存在字段的值
- ✅ **智能字段过滤**：自动过滤 protobuf 等生成代码中的不可访问字段

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
参考：<https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publishing-extensions>

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
2. 将光标放在结构体初始化的大括号 `{` 内的**任何位置**。
3. 触发自动填充命令：
   - 使用快捷键（默认：`Alt+Enter`，支持Mac/Windows/Linux）。
   - 或者在命令面板（Ctrl+Shift+P）中搜索并选择 `Go Struct Auto Fill: Fill Struct Fields`。

> 🎉 **新特性**：现在支持在结构体大括号内的任何位置触发自动填充，包括空行、已有字段之间、嵌套结构体内部等位置！

### 使用示例

```go
type User struct {
    Name    string `json:"name,omitempty"`
    Age     int    `json:"age,omitempty"`
    Email   string `json:"email,omitempty"`
    Active  bool   `json:"active,omitempty"`
}

func main() {
    // 1. 普通初始化 - 将光标放在 {} 内任何位置，按 Alt+Enter
    user := User{ // ✅ 这里可以
        // ✅ 这里也可以
    }
    
    // 2. 数组初始化 - 将光标放在 User{} 的 {} 内任何位置，按 Alt+Enter  
    users := []User{
        User{ // ✅ 这里可以
            // ✅ 这里也可以
        },
    }
    
    // 3. Map初始化 - 将光标放在 User{} 的 {} 内任何位置，按 Alt+Enter
    userMap := map[string]User{
        "admin": User{ // ✅ 这里可以
            // ✅ 这里也可以
        },
    }
    
    // 4. 嵌套结构体 - 智能识别当前光标所在的结构体层级
    complexUser := User{ // ✅ 光标在这里填充 User 的字段
        // ✅ 光标在这里也填充 User 的字段
        Profile: Profile{ // ✅ 光标在这里填充 Profile 的字段
            // ✅ 光标在这里也填充 Profile 的字段
        },
        // ✅ 光标在这里继续填充 User 的字段
    }
}
```

自动填充后的结果：

```go
user := User{
    Name:   "",
    Age:    0,
    Email:  "",
    Active: false,
}
```

## 技术方案

### 1. 结构体识别

使用模块化的识别系统，支持多种结构体初始化格式：

#### 普通变量初始化

- `变量名 := 结构体名{`
- `var 变量名 = 结构体名{`
- `变量名 := &结构体名{`
- `var 变量名 = &结构体名{`

#### 数组和切片

- `[]结构体名{结构体名{}`
- `变量名 := []结构体名{结构体名{}`

#### Map

- `map[键类型]结构体名{"key": 结构体名{}`
- `变量名 := map[键类型]结构体名{}`

#### 函数调用

- `append(切片, 结构体名{)`
- `函数名(结构体名{)`

### 2. 字段获取

**🎯 零临时文件方案**：直接在当前文档中使用 VSCode 的 `vscode.executeCompletionItemProvider` API 获取结构体字段信息：

- **智能位置优化**：使用 `findOptimalCompletionPosition()` 在当前文档中寻找最佳补全位置
- **直接文档补全**：不创建任何临时文件，直接从当前工作文档获取补全信息
- **字段类型识别**：通过 `CompletionItemKind.Field` 识别字段
- **精确字段提取**：从补全项中提取字段名称和类型信息
- **嵌套字段过滤**：跳过嵌套字段（包含点的字段名）
- **顺序保持**：保持字段顺序与结构体定义一致
- **性能优化**：避免临时文件I/O操作，提升补全速度

### 3. 默认值生成

根据字段类型生成合适的默认值：

- 指针类型：`nil`
- 字符串：`""`
- 整数类型（int, int32, int64, uint等）：`0`
- 浮点类型（float32, float64）：`0.0`
- 布尔类型：`false`
- 数组/切片类型：`nil`
- 其他类型（结构体等）：`类型名{}`

### 4. 智能代码格式化

- **智能缩进**：根据匹配类型（数组、map、append等）自动调整缩进
- **位置计算**：准确计算代码插入位置
- **格式保持**：保持原有代码格式和风格
- **去重处理**：避免重复填充已存在的字段

### 5. 智能光标定位技术 🚀

- **大括号栈算法**：通过维护大括号匹配栈，精确计算光标所在的结构体层级
- **上下文感知识别**：`analyzeStructContext()` 函数能够理解复杂的嵌套结构体上下文
- **跨行解析能力**：支持变量声明和结构体初始化分布在不同行的情况
- **精确位置定位**：通过 `findStructDeclarationBeforeBrace()` 准确找到对应的结构体声明

### 6. 零临时文件架构 ✨

- **直接文档补全**：完全不创建任何临时文件，直接在当前文档中获取补全信息
- **智能位置查找**：`findOptimalCompletionPosition()` 在当前文档中寻找最佳补全位置
- **工作区清洁**：保持工作区完全清洁，无任何临时文件污染
- **性能优化**：避免文件I/O操作，提升补全响应速度

### 7. 按定义顺序填充架构 🎯

- **结构体定义解析**：使用 `getStructFieldDefinitionOrder()` 直接解析源码中的结构体定义
- **字段顺序保证**：严格按照 Go 结构体定义中的字段声明顺序进行填充
- **智能字段合并**：通过 `parseExistingStructFields()` 解析已有字段，保留原值并重新排序
- **精确缩进计算**：使用 `calculateProperIndent()` 分析现有字段缩进模式，确保完美对齐
- **内容替换策略**：使用 `calculateStructContentRange()` 精确替换结构体内容，而非简单追加

### 8. 智能字段解析架构 🔧

- **状态机解析器**：使用 `parseStructFieldsWithComplexValues()` 状态机算法替代简单正则表达式
- **嵌套结构体支持**：通过 `parseFieldValue()` 精确解析包含嵌套大括号的复杂字段值
- **大括号匹配算法**：智能跟踪嵌套层级，确保在正确位置结束字段解析
- **字符串安全处理**：正确处理字符串字面量，避免字符串内特殊字符被误解析
- **多行字段支持**：智能判断换行符是否为字段分隔符，支持跨行的复杂字段值

### 9. 模块化架构 🆕

- 采用策略模式处理不同场景
- 可扩展的识别系统
- 清晰的代码结构和职责分离

### 10. 错误处理

- 完善的错误检查和提示
- 详细的日志记录
- 用户友好的错误消息

### 11. 通知

- 通过`vscode.window.showInformationMessage('<通知内容>')`实现VSCode的通知

## 未来改进

**欢迎感兴趣的朋友，参与改进。**

1. **更多场景支持**
   - 结构体作为返回值：`return StructName{}`
   - 接口实现：`var i Interface = StructName{}`
   - 类型断言：`value.(StructName{})`

2. **智能字段推荐**
   - 根据上下文推荐字段值
   - 支持从注释中提取默认值
   - 支持字段值的智能补全

3. **代码格式化增强**
   - 更智能的缩进处理
   - 支持自定义代码风格
   - 与gofmt更好的集成

4. **性能优化**
   - 缓存结构体信息
   - 异步处理大型结构体
   - 减少API调用次数

5. **用户体验改进**
   - 可视化的字段选择界面
   - 支持字段排序和过滤
   - 快捷键自定义

## 反馈与贡献

如果你在使用过程中遇到任何问题，或者有改进建议，欢迎在 [GitHub Issues](https://github.com/leeprince/go-struct-auto-fill.git) 中提交问题。

如果你有兴趣贡献代码，请 fork 仓库并提交 Pull Request。

也可以通过关注公众号《皇子谈技术》，联系到我。

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.