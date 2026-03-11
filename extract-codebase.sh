#!/bin/bash
OUTPUT="all-codebase.txt"

files-to-prompt . --include-hidden > "$OUTPUT"

# Sanitize common secret patterns
sed -i '' \
  -e 's/AIza[0-9A-Za-z_-]\{35\}/[REDACTED_GOOGLE_API_KEY]/g' \
  -e 's/sk-[0-9A-Za-z]\{48\}/[REDACTED_OPENAI_KEY]/g' \
  -e 's/ghp_[0-9A-Za-z]\{36\}/[REDACTED_GITHUB_TOKEN]/g' \
  -e 's/[0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{12\}/[REDACTED_UUID]/g' \
  "$OUTPUT"

echo "✅ Codebase extracted and sanitized → $OUTPUT"