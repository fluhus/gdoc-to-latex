// Google Doc script code.

/*
TODO:
- Handle bold, italics, etc.
- Add more functions to equations.
- Handle new lines in list items.
*/

// ----- MAIN ENTRY POINTS --------------------------------------------------

function onOpen() {
  // Add menu item for the encoder.
  DocumentApp.getUi().createMenu("LaTeX").addItem("Convert to LaTeX", "encodeDocument").addToUi();
}

// Called by the menu item.
function encodeDocument() {
  var body = DocumentApp.getActiveDocument().getBody();
  var tex = encodeElement(body);

  // Exception is thrown if server returns an error.
  var msg = "<img src=\"https://mir-s3-cdn-cf.behance.net/project_modules/disp/585d0331234507.564a1d239ac5e.gif\">"
  DocumentApp.getUi().showSidebar(HtmlService.createHtmlOutput(msg).setTitle("LaTeX"));
  try {
    // Display link to PDF.
    var url = TEX_SERVER + "/pdf?id=" + getId(tex);
    var msg = "Open <a href=\""+url+"\">this</a> in a new tab.<h2>Generated LaTeX</h2>" +
//      escapeHtml(tex.replace(/(\\includegraphics.*?)\{.*?\}/g, "$1{frog}"));
      escapeHtml(tex);
    DocumentApp.getUi().showSidebar(HtmlService.createHtmlOutput(msg).setTitle("LaTeX"));
  } catch (e) {
    // Display error.
    // TODO: Figure out how to show the full message (not trimmed).
    var msg = "<h2>Error</h2>" + escapeHtml(e.message) + "<h2>Generated LaTeX</h2>" + escapeHtml(tex);
    DocumentApp.getUi().showSidebar(HtmlService.createHtmlOutput(msg).setTitle("Error"));
  }
}

// General debugging function.
function debug() {
  var body = DocumentApp.getActiveDocument().getBody();
  //  var tex = encodeElement(body.getChild(2));
  Logger.log(body.getChild(0).getNumChildren());
  Logger.log(body.getChild(1).getNumChildren());
  Logger.log(body.getChild(2).getNumChildren());
  Logger.log(body.getChild(3).getNumChildren());
  Logger.log(body.getChild(4).getNumChildren());
}

// ----- SPECIFIC ENCODERS -------------------------------------------------

// Encodes a general element. Calls the appropriate type-specific encoder.
function encodeElement(e) {
  switch (e.getType()) {
    case DocumentApp.ElementType.BODY_SECTION:
      return encodeBody(e);
    case DocumentApp.ElementType.PARAGRAPH:
      return encodeParagraph(e);
    case DocumentApp.ElementType.TEXT:
      return encodeText(e);
    case DocumentApp.ElementType.EQUATION:
      return encodeEquation(e);
    case DocumentApp.ElementType.EQUATION_SYMBOL:
      return encodeEquationSymbol(e);
    case DocumentApp.ElementType.EQUATION_FUNCTION:
      return encodeEquationFunction(e);
    case DocumentApp.ElementType.EQUATION_FUNCTION_ARGUMENT_SEPARATOR:
      return encodeEquationSeparator(e);
    case DocumentApp.ElementType.LIST_ITEM:
      return encodeListItem(e);
    case DocumentApp.ElementType.FOOTNOTE:
      return encodeFootnote(e);
    case DocumentApp.ElementType.INLINE_IMAGE:
      return encodeImage(e);
    default:
      Logger.log("Unknown type: " + e.getType());
      return "{[}" + e.getType().toString().replace(/_/g, "\\_") + "{]}";
  }
}

// Encodes a BODY element.
function encodeBody(e) {
  state.pageHeight = e.getPageHeight();
  state.pageWidth = e.getPageWidth();
  return DOCUMENT_HEADER + encodeChildren(e) + encodeReferences() + DOCUMENT_FOOTER;
}

// Encodes a PARAGRAPH element.
function encodeParagraph(e) {
  switch (e.getHeading()) {
    case DocumentApp.ParagraphHeading.TITLE:
      return "\\title{" + encodeChildren(e) + "}\n\\date{}\n\\maketitle\n\n";
    case DocumentApp.ParagraphHeading.HEADING1:
      if (e.getText() == "Abstract") {
        state.abstract = true;
        return "\\begin{abstract}\n";
      }
      var result = "\\section{" + encodeChildren(e) + "}\n";
      if (state.abstract) {
        state.abstract = false;
        result = "\\end{abstract}\n" + result;
      }
      return result;
    case DocumentApp.ParagraphHeading.HEADING2:
      return "\\subsection{" + encodeChildren(e) + "}\n";
    case DocumentApp.ParagraphHeading.HEADING3:
      return "\\subsubsection{" + encodeChildren(e) + "}\n";
    case DocumentApp.ParagraphHeading.NORMAL:
      // Check if directive.
      var rawText = e.getText();
      if (rawText.length > 0 && rawText[0] == "#") {
        var words = rawText.substr(1).split(" ");
        return directives[words[0]].apply(this, words.slice(1));
      }

      var text = encodeChildren(e);
      if (text == "") {
        // Empty paragraphs are essentially new lines, so prevent LaTeX from collapsing those.
        text = "{}";
      }
      return "\\noindent " + text + "\n\n";
    default:
      Logger.log("Unknown heading: " + e.getHeading());
      return "{[}" + e.getHeading() + "{]}";
  }
}

// Encodes a TEXT element.
function encodeText(e) {
  var text = e.getText();
  var result = "";

  // Encode each character with its style.
  for (var i = 0; i < text.length; i++) {
    result += styleTransition(e, i);
    result += escapeChar(text.charAt(i));
  }
  if (text.length > 0) {
    result += endStyle(e, text.length-1);
  }

  // Escape various stuff.
  for (var i = 0; i < ESCAPE_SEQUENCES.length; i++) {
    var char = ESCAPE_SEQUENCES[i][0];
    var rep = ESCAPE_SEQUENCES[i][1];
    result = result.replace(char, rep);
  }
  if (!state.inMath) {
    for (var i = 0; i < ESCAPE_CHARS_NO_MATH.length; i++) {
      var char = ESCAPE_CHARS_NO_MATH[i][0];
      var rep = ESCAPE_CHARS_NO_MATH[i][1];
      result = result.replace(char, rep);
    }
  }

  // In equations, LaTeX removes spaces so force it to keep them.
  if (e.getParent().getType() == DocumentApp.ElementType.EQUATION ||
      e.getParent().getType() == DocumentApp.ElementType.EQUATION_FUNCTION) {
    result = result.replace(/ /g, "\\ \\ ")
  }
  return result;
}

// Encodes an EQUATION element.
function encodeEquation(e) {
  var oldInMath = state.inMath;
  state.inMath = true;
  var sep = "$";
  if (!e.getPreviousSibling() && !e.getNextSibling()) {
    // Equation is in its own line -> make it big.
    sep = "$$";
  }
  var result = sep + encodeChildren(e) + sep;
  state.inMath = oldInMath;
  return result;
}

// Encodes an EQUATION_SYMBOL element.
function encodeEquationSymbol(e) {
  return e.getCode() + "{}";
}

// Encodes an EQUATION_FUNCTION element.
function encodeEquationFunction(e) {
  var prefix = "";
  var suffix = "";
  var code = e.getCode();
  switch (code) {
    case "\\superscript":
    case "\\subscript":
      prefix = "";
      break;
    case "\\sumab":
    case "\\prodab":
    case "\\intab":
      prefix = code.substr(0, code.length-2) + "_";
      break;
    case "\\bracelr":
      prefix = "\\left\\{";
      suffix = "\\right\\}";
      break;
    case "\\sbracelr":
      prefix = "\\left[";
      suffix = "\\right]";
      break;
    case "\\rbracelr":
      prefix = "\\left(";
      suffix = "\\right)";
      break;
    default:
      prefix = code;
      break;
  }
  return prefix + "{" + encodeChildren(e) + "}" + suffix;
}

// Encodes an EQUATION_FUNCTION_SEPARATOR element.
function encodeEquationSeparator(e) {
  switch (e.getParent().getCode()) {
    case "\\superscript":
      return "}^{";
    case "\\subscript":
      return "}_{";
    case "\\sumab":
    case "\\prodab":
    case "\\intab":
      return "}^{";
    default:
      return "}{";
  }
}

// Encodes a LIST_ITEM element.
function encodeListItem(e) {
  var listType = GLYPH_TYPE_TO_LIST_TYPE[e.getGlyphType()];
  var prev = e.getPreviousSibling();
  var next = e.getNextSibling();
  var result = "";

  // If first item in the list.
  if (!isOnSameList(e, prev) || prev.getNestingLevel() < e.getNestingLevel()) {
    result += "\\begin{" + listType + "}\n";
    state.listStack.push(listType);
  }

  result += "\\item " + encodeChildren(e) + "\n";

  // If last item in the list.
  if (!isOnSameList(e, next) || next.getNestingLevel() < e.getNestingLevel()) {
    // How many lists should we end.
    var nextNesting = (next && next.getType() == DocumentApp.ElementType.LIST_ITEM) ?
      next.getNestingLevel() : -1;
    for (var i = 0; i < e.getNestingLevel() - nextNesting; i++) {
      result += "\\end{" + state.listStack.pop() + "}\n";
    }
  }

  //  result += "\n";
  return result;
}

// Encodes an INLINE_IMAGE element.
function encodeImage(e) {
  // Extract type.
  var b = e.getBlob();
  var t = b.getContentType();
  if (t.length <= 6 || t.substr(0, 6) != "image/") {
    throw "Bad blob type: " + t;
  }
  t = t.substr(6);

  var d = Utilities.base64EncodeWebSafe(b.getBytes());
  var name = (state.imageNames.length == 0 ? "image-" + (state.images.length+1) : state.imageNames.shift());

  state.images.push({
    name: name,
    type: t,
    data: d,
  });

  // 0.75 converts pixel to point.
  return "\\includegraphics[height=" + e.getHeight()*0.75 + "pt,width=" + e.getWidth()*0.75 + "pt]{" + name + "}";
}

// Encodes a FOOTNOTE element.
function encodeFootnote(e) {
  state.references.push(e.getFootnoteContents());
  return "\\cite{a" + state.references.length + "}";
}

// Encodes a FOOTNOTE_SECTION element.
function encodeFootnoteSection(e, id) {
  return "\\bibitem{" + id + "} " + encodeChildren(e);
}

// Encodes the bibliography, after encodeFootnote() was called on all the foornotes.
function encodeReferences() {
  if (state.references.length == 0) {
    return "";
  }
  var result = "\n\\begin{thebibliography}{9}\n";
  for (var i = 0; i < state.references.length; i++) {
    result += encodeFootnoteSection(state.references[i], "a" + (i+1));
  }
  result += "\\end{thebibliography}\n";
  return result;
}

// Encodes the children of the element, concatenated by their order of appearance.
function encodeChildren(e) {
  var result = "";
  for (var i = 0; i < e.getNumChildren(); i++) {
    result += encodeElement(e.getChild(i));
  }
  return result;
}

// ----- HELPERS ------------------------------------------------------------

// Holds the current state of the parser. Functions can save information in
// the state's fields.
var state = {
  // Collects FootnoteSection elements from the document, for later generating
  // bibliography.
  references: [],
  // A stack of nested list types, for placing the appropriate \end labels.
  listStack: [],
  // Indicates whether the parser is in math ($$) environment now. For different
  // escaping rules.
  inMath: false,
  // Contains image objects with fields-
  // name: name prefix of the file that hold the image.
  // type: string representing the image type - "png", "jpeg", etc.
  // data: base64 encoded image data.
  images: [],
  // File name prefixes of the next images.
  imageNames: [],
};

// Checks whether other is on the same list as current. Current is assumed
// to be a list item.
function isOnSameList(current, other) {
  return other &&
    other.getType() == DocumentApp.ElementType.LIST_ITEM &&
      other.getListId() == current.getListId();
}

// Queries pdflatex server for a document ID. Returns the ID as a string.
function getId(s) {
  var payload = "src=" + encodeURIComponent(s);
  Logger.log(state.images.length + " images.")
  for (var i = 0; i < state.images.length; i++) {
    var img = state.images[i];
    payload += "&image" + (i+1) + "name=" + img.name;
    payload += "&image" + (i+1) + "type=" + img.type;
    payload += "&image" + (i+1) + "data=" + img.data;
  }

  var res = UrlFetchApp.fetch(TEX_SERVER + "/compile",
                              {method:"post", payload:payload, muteHttpExceptions:false});
  if (res.getResponseCode() != 200) {
    throw res.getContentText();
  }
  return res.getContentText();
}

// Makes a string displayable in HTML.
function escapeHtml(s) {
  return s
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;")
  .replace(/\n/g, "<br>");
}

// Returns a LaTeX escaped equivalent of the given character.
function escapeChar(c) {
  var e = ESCAPE_CHARS[c];
  if (e) {
    return e;
  }
  return c;
}

// Returns the LaTeX style directives that transist from style at i-1 to
// the style at i. Returns an empty string if no style change. Effective
// on i=0 as well.
function styleTransition(e, i) {
  if (!isStyleChange(e, i)) {
    return "";
  }
  var result = "";
  if (i > 0) {
    result += endStyle(e, i-1);
  }
  result += beginStyle(e, i);
  return result;
}

// Returns true if the styles of e at i is different from i-1. For i=0
// always true.
function isStyleChange(e, i) {
  if (i == 0) {
    return true;
  }
  return e.isBold(i) != e.isBold(i-1) ||
    e.isItalic(i) != e.isItalic(i-1) ||
      e.isUnderline(i) != e.isUnderline(i-1);
}

// Returns a string that begins the style of element e at position i.
function beginStyle(e, i) {
  var result = "";
  if (e.isBold(i)) {
    result += "\\textbf{";
  }
  if (e.isItalic(i)) {
    result += "\\textit{";
  }
  if (e.isUnderline(i)) {
    result += "\\underline{";
  }
  return result;
}

// Returns a string that ends the style of element e at position i.
function endStyle(e, i) {
  var result = "";
  if (e.isUnderline(i)) {
    result += "}";
  }
  if (e.isItalic(i)) {
    result += "}";
  }
  if (e.isBold(i)) {
    result += "}";
  }
  return result
}

// ----- DIRECTIVES --------------------------------------------------------

directives = {
  "image-name": function() {
    state.imageNames.push.apply(state.imageNames, arguments);
    return "";
  },
};

// ----- CONSTANTS ---------------------------------------------------------

// Server to send LaTeX for compiling.
var TEX_SERVER = "";

var DOCUMENT_HEADER = "\\documentclass[a4paper]{article}\n\n\\usepackage{xcolor}\n\\usepackage[margin=1in]{geometry}\n" +
  "\\usepackage{graphicx}\n\\setlength{\\parindent}{10ex}\n\n\\begin{document}\n\n";

var DOCUMENT_FOOTER = "\\end{document}\n";

// Glyph types in Docs and their LaTeX counterparts.
var GLYPH_TYPE_TO_LIST_TYPE = {
  "BULLET": "itemize",
  "HOLLOW_BULLET": "itemize",
  "SQUARE_BULLET": "itemize",
  "NUMBER": "enumerate",
  "LATIN_UPPER": "enumerate",
  "LATIN_LOWER": "enumerate",
  "ROMAN_UPPER": "enumerate",
  "ROMAN_LOWER": "enumerate",
};

// Characters that should be escaped before posting in LaTeX code.
var ESCAPE_CHARS = {
  "\\": "\\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "[": "{[}",
  "]": "{]}",
  "&": "\\&",
  "#": "\\#",
};

// Characters that should be escaped only outside of math environment.
var ESCAPE_CHARS_NO_MATH = [
  [/_/g, "\\_"],
];

var ESCAPE_SEQUENCES = [
  [/(\W)[’'‘](\w)/g, "$1`$2"],
  [/^[’'‘](\w)/g, "`$1"],
  [/([\.\w])[’'‘]/g, "$1'"],
  [/(\W)["“”](\w)/g, "$1``$2"],
  [/^["“”](\w)/g, "``$1"],
  [/([\.\w])["“”]/g, "$1''"],
  [/TODO/g, "\\colorbox{yellow}{TODO}"],
];
