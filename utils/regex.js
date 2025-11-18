// Utility to escape user input for use in RegExp patterns
// Escapes: . * + ? ^ $ { } ( ) | [ ] \
function escapeRegex(str = "") {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { escapeRegex };
