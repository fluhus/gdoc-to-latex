package main

/*
TODO:
- Extract compilation code to its own function.
- Report HTTP error codes.
- Resolve GET/POST interface.
- Make more customizable - port, pdflatex, etc.
- Print address and port?
*/

import (
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	shutdownDeadline = 24 * time.Hour
	pdfDeadline      = 5 * time.Minute
)

var (
	idToSrc = struct {
		m map[string][]byte
		*sync.Mutex
	}{map[string][]byte{}, &sync.Mutex{}}
)

func main() {
	log.Println("Started!")

	rand.Seed(time.Now().UnixNano())

	// Shut down automatically.
	go func() {
		log.Printf("Shutting down in %v.", shutdownDeadline)
		time.Sleep(shutdownDeadline)
		log.Fatal("Timed out; exiting.")
	}()

	http.HandleFunc("/pdf", handlePDF)
	http.HandleFunc("/compile", handleCompile)
	log.Fatal(http.ListenAndServe(":"+port(), nil))
}

// ----- HTTP HANDLERS ----------------------------------------------------------------------------

func handlePDF(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	id := r.FormValue("id")
	log.Println("pdf: got id:", id)
	idToSrc.Lock()
	pdf, ok := idToSrc.m[id]
	idToSrc.Unlock()
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte("ERROR: bad document ID: " + id + ". Please reserve an ID first, using /compile."))
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Write(pdf)
}

func handleCompile(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	// Create document ID.
	src := []byte(r.FormValue("src"))
	// TODO(amitl): There might be collisions. I should prevent that.
	id := fmt.Sprint(rand.Int63())
	log.Println("compile: giving id:", id)

	// Create temp working directory.
	dir := filepath.Join(outDir, id)
	os.Mkdir(dir, 0700)
	defer os.RemoveAll(dir)

	// Extract images.
	err := writeImages(r, dir)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprintf(w, "ERROR: %v", err)
		return
	}

	// Compile.
	pdf, err := pdflatex(src, dir)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprintf(w, "ERROR: %v", err)
		return
	}

	// Register with ID.
	idToSrc.Lock()
	idToSrc.m[id] = pdf
	idToSrc.Unlock()
	w.Header().Set("Content-Type", "text/plain")
	w.Write([]byte(id))

	// Clean up document.
	go func() {
		time.Sleep(pdfDeadline)
		log.Println("compile: cleaning id:", id)
		idToSrc.Lock()
		delete(idToSrc.m, id)
		idToSrc.Unlock()
	}()
}

// ----- HELPERS ----------------------------------------------------------------------------------

func port() string {
	return os.Getenv("C9_PORT")
}
