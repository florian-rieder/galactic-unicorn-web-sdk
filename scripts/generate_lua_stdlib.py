#!/usr/bin/env python3
"""Generate `lua-stdlib.json` from LuaLS meta definition stubs.

Run via `bash scripts/build-stdlib.sh`, or directly:
    python3 scripts/generate_lua_stdlib.py [--lua-version 5.3] [--meta-dir ...] [--output ...]
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent

# Configuration
LUA_VERSION = "5.3"
LUA_LOCALE = "en-us"
LUA_ENCODING = "utf8"

DEFAULT_META_DIR = (
    ROOT
    / "scripts/lua-stdlib/.tools/meta"
    / f"Lua {LUA_VERSION} {LUA_LOCALE} {LUA_ENCODING}"
)
OUTPUT_PATH = ROOT / "src/js/monaco/data/lua-stdlib.json"

# Namespaces exposed by the Fengari sandbox (src/js/lua-environment.js).
# Maps stub filename to the Lua namespace name, or None for top-level globals.
ALLOWED_NAMESPACE_FILES: dict[str, str | None] = {
    "basic.lua": None,
    "math.lua": "math",
    "string.lua": "string",
    "table.lua": "table",
    "coroutine.lua": "coroutine",
    "utf8.lua": "utf8",
}

# Globals stripped at runtime in lua-environment.js; omit from IntelliSense.
EXCLUDED_GLOBALS = frozenset(
    {"load", "loadfile", "dofile", "loadstring", "collectgarbage", "print"}
)

# Regex patterns for parsing LuaCATS annotations.
VIEW_DOC_LINK_RE = re.compile(r"\[View documents\]\([^)]+\)")
VERSION_RE = re.compile(r"^---@version\s+(.+)$")
PARAM_RE = re.compile(r"^---@param\s+(\.\.\.|\w+)\??\s+(.+)$")
RETURN_RE = re.compile(r"^---@return\s+(.+)$")
FIELD_RE = re.compile(r"^---@field\s+(\w+)\s+(.+)$")
FUNCTION_RE = re.compile(r"^function\s+([\w.]+)\s*\(([^)]*)\)")
OVERLOAD_RE = re.compile(r"^---@overload\s+fun\(([^)]*)\)")


@dataclass
class LuaParam:
    """A documented Lua function parameter."""

    name: str
    type: str
    description: str = ""


@dataclass
class LuaFunctionDoc:
    """Normalized Lua function documentation."""

    lua_name: str
    name: str
    summary: str = ""
    details: list[str] = field(default_factory=list)
    params: list[LuaParam] = field(default_factory=list)
    returns: str = ""
    example: str = ""


@dataclass
class LuaConstantDoc:
    """Normalized Lua namespace constant documentation."""

    name: str
    type: str
    description: str = ""


def parse_version_tuple(version: str) -> tuple[int, int] | None:
    """Parse `5.3` into `(5, 3)`. Returns None for unrecognized strings."""
    version = version.strip()
    if not re.fullmatch(r"\d+\.\d+", version):
        return None
    major, minor = version.split(".", maxsplit=1)
    return int(major), int(minor)


def version_constraint_matches(constraint: str, target: tuple[int, int]) -> bool:
    """Return whether a single LuaCATS @version clause matches the target version.

    Clauses look like `5.1` (exact), `>5.3`, `<5.2`, `JIT` (never matches Fengari).
    """
    constraint = constraint.strip()
    if not constraint:
        return True
    if constraint.upper() == "JIT":
        return False
    if constraint[0] not in "<>=!":
        # Bare `5.1` means the definition applies only to that exact version.
        bound = parse_version_tuple(constraint)
        return bound is not None and target == bound

    operator = constraint[0]
    bound = parse_version_tuple(constraint[1:].strip())
    if bound is None:
        return False
    if operator == "<":
        return target < bound
    if operator == ">":
        return target > bound
    if operator == "=":
        return target == bound
    return True


def block_applies_to(version_line: str | None, target: tuple[int, int]) -> bool:
    """Return True if a @version annotation is absent or matches the target.

    Comma-separated clauses are OR'd: the block applies if any clause matches.
    """
    if not version_line:
        return True
    clauses = [c.strip() for c in version_line.split(",") if c.strip()]
    return any(version_constraint_matches(c, target) for c in clauses)


def clean_summary_line(line: str) -> str:
    """Strip leading `---` and discard annotation/view-docs lines."""
    text = line.removeprefix("---").strip()
    if not text or text.startswith("@"):
        return ""
    if VIEW_DOC_LINK_RE.fullmatch(text):
        return ""
    return text


def parse_params(annotation_lines: list[str]) -> list[LuaParam]:
    """Extract @param annotations from a block."""
    params = []
    for line in annotation_lines:
        match = PARAM_RE.match(line)
        if match:
            name, type_name = match.groups()
            params.append(LuaParam(name=name, type=type_name.strip()))
    return params


def parse_returns(annotation_lines: list[str]) -> str:
    """Extract a display return type string from @return annotations."""
    return_types = []
    for line in annotation_lines:
        match = RETURN_RE.match(line)
        if not match:
            continue
        value = match.group(1).strip()
        if value in {"type", "self"} or value.startswith("fun("):
            continue
        return_types.append(value)
    return ", ".join(return_types)


def parse_overloads(annotation_lines: list[str]) -> list[str]:
    """Extract overload signatures as human-readable strings."""
    return [
        f"({m.group(1)})" for line in annotation_lines if (m := OVERLOAD_RE.match(line))
    ]


def split_blocks(content: str) -> list[list[str]]:
    """Split a meta stub file into per-function documentation blocks."""
    blocks: list[list[str]] = []
    current: list[str] = []

    for line in content.splitlines():
        if line.startswith("---") or line.startswith("function "):
            current.append(line)
            if line.startswith("function "):
                if current:
                    blocks.append(current)
                current = []
        elif not line.startswith("@") and line.strip():
            if current:
                blocks.append(current)
            current = []

    if current:
        blocks.append(current)
    return blocks


def parse_function_block(
    block: list[str],
    namespace: str | None,
    target: tuple[int, int],
) -> LuaFunctionDoc | None:
    """Parse one function documentation block. Returns None when filtered out."""
    version_line: str | None = None
    summary_lines: list[str] = []
    annotation_lines: list[str] = []
    signature_line = ""

    for line in block:
        if line.startswith("function "):
            signature_line = line
        elif m := VERSION_RE.match(line):
            version_line = m.group(1).strip()
        elif line.startswith("---@"):
            annotation_lines.append(line)
        else:
            summary = clean_summary_line(line)
            if summary:
                summary_lines.append(summary)

    if not signature_line or not block_applies_to(version_line, target):
        return None

    match = FUNCTION_RE.match(signature_line)
    if not match:
        return None

    qualified_name, _ = match.groups()
    short_name = qualified_name.split(".")[-1]

    if namespace is None:
        if short_name in EXCLUDED_GLOBALS:
            return None
        lua_name = short_name
    else:
        if not qualified_name.startswith(f"{namespace}."):
            return None
        lua_name = qualified_name

    overloads = parse_overloads(annotation_lines)
    return LuaFunctionDoc(
        lua_name=lua_name,
        name=short_name,
        summary=" ".join(summary_lines).strip(),
        details=[f"- Overload: `{lua_name}{sig}`" for sig in overloads],
        params=parse_params(annotation_lines),
        returns=parse_returns(annotation_lines),
        example="",
    )


def parse_field_blocks(content: str, target: tuple[int, int]) -> list[LuaConstantDoc]:
    """Parse @field constants from the class header of a namespace stub."""
    constants: list[LuaConstantDoc] = []
    summary_lines: list[str] = []
    version_line: str | None = None

    for line in content.splitlines():
        if line.startswith("function "):
            break
        if m := VERSION_RE.match(line):
            version_line = m.group(1).strip()
        elif m := FIELD_RE.match(line):
            if block_applies_to(version_line, target):
                description = " ".join(summary_lines).strip()
                if description.startswith("Miss locale"):
                    description = ""
                constants.append(
                    LuaConstantDoc(
                        name=m.group(1),
                        type=m.group(2).strip(),
                        description=description,
                    )
                )
            summary_lines = []
            version_line = None
        elif not line.startswith("---@"):
            summary = clean_summary_line(line)
            if summary:
                summary_lines.append(summary)

    return constants


def parse_meta_file(
    path: Path, namespace: str | None, target: tuple[int, int]
) -> tuple[list[LuaFunctionDoc], list[LuaConstantDoc]]:
    """Parse one LuaLS meta stub file into functions and constants."""
    content = path.read_text(encoding="utf-8")
    functions = [
        fn
        for block in split_blocks(content)
        if (fn := parse_function_block(block, namespace, target)) is not None
    ]
    constants = parse_field_blocks(content, target) if namespace is not None else []
    return functions, constants


def build_model(meta_dir: Path, target: tuple[int, int]) -> dict[str, Any]:
    """Build the normalized stdlib JSON model from a LuaLS meta directory."""
    globals_by_name: dict[str, LuaFunctionDoc] = {}
    namespaces: dict[str, dict[str, Any]] = {}

    for file_name, namespace in ALLOWED_NAMESPACE_FILES.items():
        path = meta_dir / file_name
        if not path.is_file():
            raise FileNotFoundError(f"Missing LuaLS meta stub: {path}")

        functions, constants = parse_meta_file(path, namespace, target)

        if namespace is None:
            for fn in functions:
                globals_by_name[fn.lua_name] = fn
        else:
            # Dedupe namespace functions by short name.
            by_name = {fn.name: fn for fn in functions}
            namespaces[namespace] = {
                "functions": sorted(
                    [asdict(fn) for fn in by_name.values()],
                    key=lambda f: f["name"],
                ),
                "constants": sorted(
                    [asdict(c) for c in constants], key=lambda c: c["name"]
                ),
            }

    # require is a global LuaLS function documented in package.lua.
    package_path = meta_dir / "package.lua"
    if not package_path.is_file():
        raise FileNotFoundError(f"Missing LuaLS meta stub: {package_path}")
    package_functions, _ = parse_meta_file(package_path, None, target)
    for fn in package_functions:
        if fn.lua_name == "require":
            globals_by_name[fn.lua_name] = fn
            break

    globals_list = sorted(globals_by_name.values(), key=lambda fn: fn.lua_name)
    return {
        "globals": [asdict(fn) for fn in globals_list],
        "namespaces": namespaces,
    }


def main() -> None:
    """Generate lua-stdlib.json from LuaLS Lua meta stubs."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--lua-version", default=LUA_VERSION, help="Lua version for @version filtering."
    )
    parser.add_argument(
        "--meta-dir",
        type=Path,
        default=DEFAULT_META_DIR,
        help="LuaLS versioned meta directory.",
    )
    parser.add_argument(
        "--output", type=Path, default=OUTPUT_PATH, help="Output JSON path."
    )
    args = parser.parse_args()

    target = parse_version_tuple(args.lua_version)
    if target is None:
        raise SystemExit(f"Invalid --lua-version: {args.lua_version!r}")

    if not args.meta_dir.is_dir():
        raise SystemExit(
            f"Meta directory not found: {args.meta_dir}\nRun: bash scripts/build-stdlib.sh"
        )

    model = build_model(args.meta_dir, target)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(model, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {args.output.relative_to(ROOT)}")
    print(f"  globals: {len(model['globals'])}")
    for name, data in sorted(model["namespaces"].items()):
        print(f"  {name}: {len(data['functions']) + len(data['constants'])}")


if __name__ == "__main__":
    main()
