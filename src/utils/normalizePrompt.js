function normalizePrompt(prompt) {
  if (typeof prompt !== "string") return "";
  // Normalize whitespace to improve cache hits and reduce prompt variability.
  return prompt.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

module.exports = { normalizePrompt };

