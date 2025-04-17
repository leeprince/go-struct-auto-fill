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

func main() {
	d := ddd{
		Name:    "John",
		Age:     20,
		Address: "123 Main St",
	}

	json, err := json.Marshal(d)
	if err != nil {
		fmt.Println(err)
	}
	fmt.Println(string(json))
}