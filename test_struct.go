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
	fmt.Println("=== 测试按结构体定义顺序自动填充 ===")

	// 测试场景1：空结构体（应该按顺序填充所有字段：Name -> Age -> Address）
	d1 := ddd{
		Name:    "",
		Age:     0,
		Address: "",
	}

	// 测试场景2：部分字段已填写，顺序错乱（应该保留已有值，按顺序重新排列）
	d2 := ddd{
		Name:    "",
		Age:     0,
		Address: "beijing",
	}

	// 测试场景3：只有中间字段（应该保留已有值，填充缺失字段，按顺序排列）
	d3 := ddd{
		Name:    "",
		Age:     25,
		Address: "",
	}

	// 测试场景4：字段顺序完全错乱（应该重新排序为：Name -> Age -> Address）
	d4 := ddd{
		Name:    "",
		Age:     30,
		Address: "",
	}

	// 测试场景5：嵌套结构体中的有序填充
	d5 := ddd1{
		ID:  "",
		Age: 30,
		ddd2: &ddd2{
			Name:    "",
			Age:     0,
			Address: "ddd2 Address",
		},
	}

	// 测试场景6：数组中的有序填充
	dList := []ddd{
		ddd{
			Name:    "",
			Age:     0,
			Address: "array_item",
		},
		ddd{
			Name:    "",
			Age:     0,
			Address: "",
		},
	}

	// 测试场景7：map中的有序填充
	dMap := map[string]ddd{
		"key1": ddd{

			Name:    "map_value",
			Age:     0,
			Address: "",
		},
	}

	// 测试场景8：append函数中的有序填充
	var dSlice []ddd
	dSlice = append(dSlice, ddd{

		Name:    "",
		Age:     0,
		Address: "",
	})

	// 测试场景9：函数参数中的有序填充
	processStruct(ddd{
		// todo
		Age: 0,
	})

	// 测试场景10：完全空的结构体（边界情况）
	d_empty := ddd{
		Name:    "",
		Age:     0,
		Address: "",
	}

	// 自引用链表测试
	head := &ListNode{
		Val:  0,
		Next: nil,
	}

	// 打印结果
	fmt.Println("结果:", d1, d2, d3, d4, d5, dList, dMap, dSlice, d_empty, head)
}

func processStruct(d ddd) {
	fmt.Println("Processing:", d)
}
