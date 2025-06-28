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
		Id:        0,
		Name:      "",
		Email:     "",
		IsActive:  0,
		Phone:     "",
		CreatedAt: 0,
		UpdatedAt: 0,
		AvatarUrl: "",
		Gender:    0,
		City:      "",
		Province:  "",
		Country:   "",
		IsVip:     false,
		LastLogin: 0,
		Roles:     nil,
		Nickname:  "",
		Age:       0,
		Bio:       "",
		JobTitle:  "",
		Company:   "",
	}

	fmt.Println("userInfo:", userInfo)

	var userVar = user.User{
		Id:       0,
		Name:     "",
		Email:    "",
		IsActive: 0,
	}
	fmt.Println("userVar:", userVar)
}
