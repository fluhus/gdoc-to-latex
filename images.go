// Handles extracting images from HTTP requests and writing them to the disk.

package main

import (
	"encoding/base64"
	"fmt"
	"io/ioutil"
	"net/http"
	"path/filepath"
)

// Extracts image data from the request and writes the images to the given directory.
func writeImages(r *http.Request, dir string) error {
	for i := 1; imageType(r, i) != ""; i++ {
		t := imageType(r, i)
		d, err := imageData(r, i)
		if err != nil {
			return fmt.Errorf("failed to get image data: %v", err)
		}
		f := filepath.Join(dir, fmt.Sprintf("image-%v.%v", i, t))
		err = ioutil.WriteFile(f, d, 0600)
		if err != nil {
			return fmt.Errorf("failed write image: %v", err)
		}
	}

	return nil
}

// Returns the type of the i'th image (1-based). Empty if none.
func imageType(r *http.Request, i int) string {
	return r.FormValue(fmt.Sprintf("image%dtype", i))
}

// Returns the data of the i'th image (1-based). Nil if none.
func imageData(r *http.Request, i int) ([]byte, error) {
	data := r.FormValue(fmt.Sprintf("image%ddata", i))
	if data == "" {
		return nil, fmt.Errorf("no data for image #%v", i)
	}

	return base64.URLEncoding.DecodeString(data)
}
