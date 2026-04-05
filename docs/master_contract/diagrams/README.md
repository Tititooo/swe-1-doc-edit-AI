# Diagram Build Instructions

These diagrams are the editable Mermaid sources used by `docs/master_contract/report.md`.

## Prerequisites

- Node.js 20+
- `npx` available on your shell path

## Render all diagrams

```bash
cd docs/master_contract/diagrams
chmod +x render.sh
./render.sh
```

This generates:

- `c4-context.png`
- `c4-container.png`
- `c4-component-backend.png`
- `erd.png`

## Render a single diagram manually

```bash
npx -y @mermaid-js/mermaid-cli \
  -i docs/master_contract/diagrams/c4-context.mmd \
  -o docs/master_contract/diagrams/c4-context.png \
  -b white \
  -t default
```

## Notes

- The report embeds the generated PNGs using relative paths such as `diagrams/c4-context.png`.
- Re-run `./render.sh` whenever you update any `.mmd` file so the report and exported images stay in sync.
