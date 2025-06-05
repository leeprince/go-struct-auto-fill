package main

import (
	"fmt"
)

type ddd struct {
	Name    string `json:"name,omitempty"`
	Age     int    `json:"age,omitempty"`
	Address string `json:"address,omitempty"`
}

type ddd1 struct {
	ID   string `json:"id,omitempty"`
	Age  int    `json:"age,omitempty"`
	ddd2 *ddd2  `json:"ddd2,omitempty"`
}

type ddd2 struct {
	Name    string `json:"name,omitempty"`
	Age     int    `json:"age,omitempty"`
	Address string `json:"address,omitempty"`
}

type ListNode struct {
	Val  int       `json:"val,omitempty"`
	Next *ListNode `json:"next,omitempty"`
}

func main() {
	// 已支持的场景

	// 普通结构体
	d := ddd{
		Name:    "",
		Age:     0,
		Address: "",
	}

	// 指针结构体
	d2 := &ddd{
		Name:    "",
		Age:     0,
		Address: "",
	}

	// 简单嵌套
	d1 := ddd1{
		Age: 0,
		ID:  "",
		ddd2: &ddd2{
			Address: "",
			Name:    "",
			Age:     0,
		},
	}

	// 嵌套结构体
	ln := ListNode{
		Val: 0,
		Next: &ListNode{
			Val: 0,
		},
	}

	// 新增支持的场景

	// 数组初始化
	dList := []ddd{
		ddd{
			Age: 0,

			Name:    "",
			Address: "",
		}, // 光标放在大括号里面，按快捷键应该能自动填充
	}

	// map初始化
	dMap := map[string]ddd{
		"name": ddd{
			Age:     0,
			Name:    "",
			Address: "",
		}, // 光标放在大括号里面，按快捷键应该能自动填充
	}

	// append函数
	var dSlice []ddd
	dSlice = append(dSlice, ddd{
		Address: "",
		Name:    "",
		Age:     0,
	}) // 光标放在大括号里面，按快捷键应该能自动填充

	// 函数参数（示例）
	processStruct(ddd{
		Name:    "",
		Age:     0,
		Address: "",
	}) // 光标放在大括号里面，按快捷键应该能自动填充

	// 多个数组元素
	dList2 := []ddd{
		ddd{
			Name:    "",
			Age:     0,
			Address: "",
		},
		ddd{}, // 光标放在大括号里面，按快捷键应该能自动填充
	}

	// 复杂map
	complexMap := map[string][]ddd{
		"items": []ddd{
			ddd{
				Age:     0,
				Name:    "",
				Address: "",
			}, // 光标放在大括号里面，按快捷键应该能自动填充
		},
	}

	// 打印结果以避免未使用变量错误
	fmt.Println(d, d2, d1, ln, dList, dMap, dSlice, dList2, complexMap)
}

func processStruct(d ddd) {
	fmt.Println("Processing:", d)
}
