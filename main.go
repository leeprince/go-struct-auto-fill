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
		Name:    "",
		Age:     0,
		Address: "",
	}

	json, err := json.Marshal(d)
	if err != nil {
		fmt.Println(err)
	}
	fmt.Println(string(json))

	dList := []ddd{}
	dList = append(dList, ddd{})

}
