package main

import (
	"fmt"
	"testing"
)

// 测试结构体定义
type User1 struct {
	Name    string `json:"name,omitempty"`
	Age     int    `json:"age,omitempty"`
	Address string `json:"address,omitempty"`
}

type Profile struct {
	ID       string `json:"id,omitempty"`
	Username string `json:"username,omitempty"`
	Email    string `json:"email,omitempty"`
	Active   bool   `json:"active,omitempty"`
}

func TestFieldOrder(t *testing.T) {
	fmt.Println("=== 测试按结构体定义顺序自动填充功能 ===")

	// 🎯 测试场景1：空结构体 - 应该按顺序填充：Name -> Age -> Address
	user1 := User1{
		// 光标放在这里，按 Alt+Enter，应该按定义顺序生成所有字段
	}

	// 🎯 测试场景2：部分字段乱序 - 应该保留值并重新排序
	user2 := User1{
		Address: "beijing",
		Name:    "test_user",
		// 光标放在这里，按 Alt+Enter，应该填充 Age 并重新排序为：Name -> Age -> Address
	}

	// 🎯 测试场景3：只有中间字段 - 应该补充缺失字段并保持顺序
	user3 := User1{
		Name:    "",
		Age:     25, // 10,
		Address: "",
	}

	// 🎯 测试场景4：字段顺序完全错乱 - 应该完全重新排序
	user4 := User1{
		Name:    "reorder_test",
		Age:     0,
		Address: "",
	}

	// 🎯 测试场景5：数组中的有序填充
	users := []User1{
		User1{
			Name:    "array_user",
			Age:     0,
			Address: "",
		},
	}

	// 🎯 测试场景6：Map中的有序填充
	userMap := map[string]User1{
		"admin": User1{
			Name:    "",
			Age:     0,
			Address: "1",
		},
	}

	// 🎯 测试场景7：不同结构体类型的测试
	profile := Profile{
		Email:    "test@example.com",
		Username: "testuser",
		// 光标放在这里，按 Alt+Enter，应该按 Profile 定义顺序：ID -> Username -> Email -> Active
	}

	// 🎯 测试场景8：嵌套结构体解析测试（v1.2.5修复重点）
	nestedTest := User1{
		Name:    "parent",
		Address: "parent_address",
		// 光标放在这里，应该补充 Age 字段，保持顺序
	}

	// 🎯 测试场景9：复杂嵌套结构体值保留测试
	complexNested := Profile{
		ID:       "complex",
		Username: "complex_user",
		// 注意：这里故意不按顺序，测试重排功能
	}

	// 打印结果用于验证
	fmt.Printf("user1: %+v\n", user1)
	fmt.Printf("user2: %+v\n", user2)
	fmt.Printf("user3: %+v\n", user3)
	fmt.Printf("user4: %+v\n", user4)
	fmt.Printf("users: %+v\n", users)
	fmt.Printf("userMap: %+v\n", userMap)
	fmt.Printf("profile: %+v\n", profile)
	fmt.Printf("nestedTest: %+v\n", nestedTest)
	fmt.Printf("complexNested: %+v\n", complexNested)
}
