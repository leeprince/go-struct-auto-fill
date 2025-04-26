package main

import (
	"encoding/json"
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
	// 普通结构体
	d := ddd{
		Name:    "",
		Age:     0,
		Address: "",
	}

	dByte, err := json.Marshal(d)
	if err != nil {
		fmt.Println(err)
	}
	fmt.Println(string(dByte))

	// 指针结构体
	d2 := &ddd{
		Name:    "",
		Age:     0,
		Address: "",
	}

	d2Byte, err := json.Marshal(d2)
	if err != nil {
		fmt.Println(err)
	}
	fmt.Println(string(d2Byte))

	// 数组
	dList := []ddd{}
	dList = append(dList, ddd{})

	// 简单嵌套
	d1 := ddd1{
		Age: 0,
		ID:  "",
		ddd2: &ddd2{
			Name:    "",
			Age:     0,
			Address: "",
		},
	}
	d1Byte, err := json.Marshal(d1)
	if err != nil {
		fmt.Println(err)
	}
	fmt.Println(string(d1Byte))

	// 嵌套结构体
	ln := ListNode{
		Val: 0,
		Next: &ListNode{
			Val: 0,
		},
	}
	lnByte, err := json.Marshal(ln)
	if err != nil {
		fmt.Println(err)
	}
	fmt.Println(string(lnByte))

}
