# Contributing

Thanks for helping improve the Galactic Unicorn Web SDK.

## Getting started

See [README.md](README.md) for setup, local development, and build commands.

## Issues

Open a [GitHub issue](https://github.com/florian-rieder/galactic-unicorn-web-sdk/issues) for bugs, ideas, or questions. Include steps to reproduce when reporting bugs.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Keep changes focused; match existing code style in the files you touch.
3. Test locally (`npm run dev` and/or `npm run build`) when your change affects runtime or build output.
4. Open a PR against `main` with a short summary and test notes.

## Generated files

Some artifacts are committed but produced by scripts. If you change their inputs, regenerate and include the updated output in your PR:

- **Lua stdlib completions:** `bash scripts/build-stdlib.sh` → `src/js/monaco/data/lua-stdlib.json`

See [scripts/lua-stdlib/README.md](scripts/lua-stdlib/README.md) for stdlib generator details.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
