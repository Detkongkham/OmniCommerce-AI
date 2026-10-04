#!/usr/bin/env bash
# SessionStart hook: inject the using-superpowers skill into context,
# mirroring the superpowers plugin's session-start hook.
set -euo pipefail

skill="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}/.claude/skills/using-superpowers/SKILL.md"
[ -f "$skill" ] || exit 0

printf '<EXTREMELY_IMPORTANT>\nYou have superpowers.\n\n'
printf "**Below is the full content of your 'using-superpowers' skill - your introduction to using skills. For all other skills, use the Skill tool. In this project the skills are named without the 'superpowers:' prefix (e.g. 'brainstorming'):**\n\n"
cat "$skill"
printf '\n</EXTREMELY_IMPORTANT>\n'
