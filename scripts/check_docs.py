"""Check local Markdown destinations in current product docs (archives are historical)."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
files = [root / 'README.md', root / 'kit/README.md', *root.joinpath('docs').rglob('*.md')]
errors = []
for path in files:
    if 'archive' in path.relative_to(root).parts:
        continue
    content = re.sub(r'```.*?```', '', path.read_text(), flags=re.S)
    for match in re.finditer(r'!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)', content):
        href = match.group(1).strip('<>').split('#', 1)[0]
        if not href or re.match(r'[a-zA-Z][a-zA-Z0-9+.-]*:', href):
            continue
        if not (path.parent / href).exists():
            errors.append(f'{path.relative_to(root)}: missing {href}')
if errors:
    raise SystemExit('\n'.join(errors))
print('✓ current documentation links OK')
