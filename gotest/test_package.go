package main

import (
	"fmt"
	"gotest/pb/user"
	"testing"
)

// 测试结构体定义
type User struct {
	Name    string `json:"name,omitempty"`
	Age     int    `json:"age,omitempty"`
	Address string `json:"address,omitempty"`
}

func TestPackage(t *testing.T) {
	fmt.Println("=== 测试引入pb协议的go包 ===")

	userLocal := &User{
		Name:    "",
		Age:     0,
		Address: "1",
	}
	fmt.Println("userLocal:", userLocal)

	userInfo := &user.User{
		Name:  "",
		Email: "",
	}

	fmt.Println("userInfo:", userInfo)

	var userVar = user.User{
		Name: "",
	}

	fmt.Println("userVar:", userVar)
}
