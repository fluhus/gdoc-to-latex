// Handles compiling LaTeX source to PDF.

package main

import (
	"bytes"
	"fmt"
	"io/ioutil"
	"os/exec"
	"path/filepath"
)

const (
	latexExec = "/usr/local/texlive/2016/bin/x86_64-linux/pdflatex"
	outDir    = "tex_files"
)

// TODO(amit): Add HTTP code to function output.

// Compiles the given LaTeX source to PDF.
func pdflatex(src []byte, dir string) ([]byte, error) {
	// Create tex file.
	texFile := filepath.Join(dir, "src.tex")
	err := ioutil.WriteFile(texFile, src, 0600)
	if err != nil {
		return nil, fmt.Errorf("failed to write tex file: %v", err)
	}

	// Compile latex.
	for range make([]struct{}, 2) { // Compile twice to allow citations.
		cmd := exec.Command(latexExec, "src.tex")
		cmd.Dir = dir
		buf := bytes.NewBuffer(nil)
		cmd.Stdout = buf
		err = cmd.Run()
		if err != nil {
			return nil, fmt.Errorf("failed to compile latex:\n\n%s", buf.Bytes())
		}
	}

	// Succeeded to compile.
	pdf, err := ioutil.ReadFile(filepath.Join(dir, "src.pdf"))
	if err != nil {
		return nil, fmt.Errorf("failed to read pdf output: %v", err)
	}

	return pdf, nil
}
