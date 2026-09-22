import os
repo_dir = r'd:\Programminig\ARSA V2\Convx'
for root, dirs, files in os.walk(repo_dir):
    if '.git' in root or '.gradle' in root or 'build' in root:
        continue
    for file in files:
        if file.endswith('.kt') or file.endswith('.java'):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
            except UnicodeDecodeError:
                continue
            if 'A.R.S.A' in content:
                content = content.replace('A.R.S.A', 'Arsa')
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
