#!/usr/bin/env bash
# PostToolUse hook — cache-bust + JS validation
# Fires on Edit/Write/MultiEdit. Reads PostToolUse JSON payload on stdin.
# - dashboard.css edited  -> bump ?v=N for the CSS tag in index.html
# - dashboard.js edited   -> bump ?v=N for the JS tag in index.html, then `node -c dashboard.js`
#                            (syntax error -> exit 2, blocks the agent turn)
# - any other file        -> exit 0 silently

set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
INDEX="$PROJECT_DIR/index.html"

payload="$(cat || true)"
[ -z "$payload" ] && exit 0

file_path="$(printf '%s' "$payload" | node -e '
let s = "";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  try { const j = JSON.parse(s); process.stdout.write(j.tool_input && j.tool_input.file_path ? j.tool_input.file_path : ""); }
  catch { process.stdout.write(""); }
});
' 2>/dev/null)"

[ -z "$file_path" ] && exit 0

base="$(basename "$file_path")"

bump_tag() {
  # $1 = filename to match (dashboard.css | dashboard.js)
  local target="$1"
  [ -f "$INDEX" ] || return 0
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const target = process.argv[2];
    let html = fs.readFileSync(file, "utf8");
    const re = new RegExp("(" + target.replace(/\./g, "\\.") + "\\?v=)(\\d+)", "g");
    let bumped = false;
    html = html.replace(re, (_, p, n) => { bumped = true; return p + (parseInt(n, 10) + 1); });
    if (bumped) fs.writeFileSync(file, html);
  ' "$INDEX" "$target" 2>/dev/null || true
}

case "$base" in
  dashboard.css)
    bump_tag "dashboard.css"
    exit 0
    ;;
  dashboard.js)
    bump_tag "dashboard.js"
    err="$(cd "$PROJECT_DIR" && node -c dashboard.js 2>&1)"
    rc=$?
    if [ $rc -ne 0 ]; then
      printf 'dashboard.js syntax error:\n%s\n' "$err" >&2
      exit 2
    fi
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
