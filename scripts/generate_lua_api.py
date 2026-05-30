#!/usr/bin/env python3
"""Generate Lua API artifacts from `src/js/lua.js` JSDoc + registries."""

import json
import re
from html import unescape
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    import markdown  # type: ignore
except ImportError as exc:  # pragma: no cover
    raise RuntimeError(
        "Python package `markdown` is required. Install with: pip install -r requirements.txt"
    ) from exc


ROOT = Path(__file__).resolve().parent.parent
LUA_JS_PATH = ROOT / "src/js/lua.js"
INTRO_MD_PATH = ROOT / "docs/API.intro.md"
TEMPLATE_PATH = ROOT / "docs/templates/api.template.html"

# All generated artifacts live under public/docs/ (gitignored, served by Vite).
OUTPUT_DIR = ROOT / "public/docs"
API_MD_PATH = OUTPUT_DIR / "API.md"
API_HTML_PATH = OUTPUT_DIR / "api.html"
API_JSON_PATH = OUTPUT_DIR / "lua-api.json"


@dataclass
class LuaParam:
    """A documented Lua function parameter."""

    name: str
    type: str
    description: str


@dataclass
class LuaFunctionDoc:
    """Documentation extracted for a Lua-exposed function."""

    js_name: str
    lua_name: str
    kind: str
    category: str
    summary: str
    details: list[str]
    lua_params: list[LuaParam]
    lua_returns: str
    lua_example: str


def parse_function_registry(lua_js_content: str) -> list[dict[str, str]]:
    """Parse `luaApiFunctions` entries in declaration order."""
    match = re.search(
        r"const\s+luaApiFunctions\s*=\s*\[(?P<body>.*?)\];",
        lua_js_content,
        re.DOTALL,
    )
    if not match:
        raise ValueError("Could not locate `luaApiFunctions` registry.")
    body = match.group("body")
    body = re.sub(r"^\s*//.*$", "", body, flags=re.MULTILINE)

    entries = re.findall(
        r'\{\s*luaName:\s*"([^"]+)"\s*,\s*(?:luaFunction):\s*([A-Za-z_]\w*)\s*(?:,\s*)?\}',
        body,
    )
    return [{"lua_name": lua_name, "js_name": js_name} for lua_name, js_name in entries]


def parse_callback_registry(lua_js_content: str) -> list[dict[str, str]]:
    """Parse `luaApiCallbacks` entries in declaration order."""
    match = re.search(
        r"const\s+luaApiCallbacks\s*=\s*\[(?P<body>.*?)\];",
        lua_js_content,
        re.DOTALL,
    )
    if not match:
        return []

    body = match.group("body")
    body = re.sub(r"^\s*//.*$", "", body, flags=re.MULTILINE)

    entries = re.findall(
        r'\{\s*luaName:\s*"([^"]+)"\s*,\s*(?:luaFunction|function):\s*([A-Za-z_]\w*)\s*(?:,\s*)?\}',
        body,
    )
    return [{"lua_name": lua_name, "js_name": js_name} for lua_name, js_name in entries]


def parse_constant_registry(lua_js_content: str) -> list[dict[str, str]]:
    """Parse `luaApiConstants` entries in declaration order."""
    match = re.search(
        r"const\s+luaApiConstants\s*=\s*\[(?P<body>.*?)\];",
        lua_js_content,
        re.DOTALL,
    )
    if not match:
        raise ValueError("Could not locate `luaApiConstants` registry.")
    body = match.group("body")
    body = re.sub(r"^\s*//.*$", "", body, flags=re.MULTILINE)

    object_matches = re.findall(r"\{(.*?)\}", body, re.DOTALL)
    constants: list[dict[str, str]] = []
    for object_body in object_matches:
        name_match = re.search(r'name:\s*"([^"]+)"', object_body)
        type_match = re.search(r'type:\s*"([^"]+)"', object_body)
        value_match = re.search(r"value:\s*([^,\n]+)", object_body)
        description_match = re.search(r'description:\s*"([^"]+)"', object_body)
        if not (name_match and type_match and value_match and description_match):
            continue
        constants.append(
            {
                "name": name_match.group(1).strip(),
                "type": type_match.group(1).strip(),
                "value_expression": value_match.group(1).strip(),
                "description": description_match.group(1).strip(),
            }
        )
    return constants


def parse_jsdoc_blocks(lua_js_content: str) -> dict[str, LuaFunctionDoc]:
    """Parse JSDoc blocks directly above `function lua_*` declarations."""
    pattern = re.compile(
        r"/\*\*(?P<doc>(?:(?!\*/)[\s\S])*)\*/\s*(?:export)?\s*function\s+(?P<name>lua_[A-Za-z0-9_]+)\s*\("
    )
    docs_by_js_name: dict[str, LuaFunctionDoc] = {}
    for match in pattern.finditer(lua_js_content):
        js_name = match.group("name")
        doc = normalize_docblock(match.group("doc"))
        parsed = parse_lua_doc_tags(js_name, doc)
        docs_by_js_name[js_name] = parsed
    return docs_by_js_name


def normalize_docblock(raw_doc: str) -> list[str]:
    """Normalize docblock lines by removing leading comment markers."""
    normalized: list[str] = []
    for line in raw_doc.splitlines():
        cleaned = re.sub(r"^\s*\*\s?", "", line.rstrip())
        normalized.append(cleaned)
    return normalized


def parse_lua_doc_tags(js_name: str, doc_lines: list[str]) -> LuaFunctionDoc:
    """Parse custom `@lua*` tags plus summary/details from doc text."""
    lua_name = ""
    kind = "function"
    category = "misc"
    summary = ""
    details: list[str] = []
    lua_params: list[LuaParam] = []
    lua_returns = ""
    lua_example = ""

    description_lines: list[str] = []
    seen_tag = False
    collecting_example = False
    for raw_line in doc_lines:
        raw = raw_line.rstrip()
        stripped = raw.strip()
        if not stripped:
            if collecting_example:
                # Preserve blank lines inside the example, but avoid creating a trailing
                # blank line at the end (we trim later).
                lua_example = f"{lua_example}\n" if lua_example else ""
            elif not seen_tag and description_lines and description_lines[-1] != "":
                description_lines.append("")
            continue

        if stripped.startswith("@"):
            seen_tag = True
            collecting_example = False
            if stripped.startswith("@luaName "):
                lua_name = stripped.removeprefix("@luaName ").strip()
            elif stripped.startswith("@luaKind "):
                kind = stripped.removeprefix("@luaKind ").strip()
            elif stripped.startswith("@luaCategory "):
                category = stripped.removeprefix("@luaCategory ").strip()
            elif stripped.startswith("@luaParams "):
                payload = stripped.removeprefix("@luaParams ").strip()
                param_match = re.match(r"([A-Za-z_]\w*):([^\s]+)\s*(.*)", payload)
                if param_match:
                    lua_params.append(
                        LuaParam(
                            name=param_match.group(1),
                            type=param_match.group(2),
                            description=param_match.group(3).strip(),
                        )
                    )
            elif stripped.startswith("@luaReturns "):
                lua_returns = stripped.removeprefix("@luaReturns ").strip()
            elif stripped.startswith("@luaExample "):
                lua_example = stripped.removeprefix("@luaExample ").strip()
                collecting_example = True
            continue

        if collecting_example:
            # Preserve indentation inside @luaExample blocks.
            lua_example = f"{lua_example}\n{raw}" if lua_example else raw
            continue

        if not seen_tag:
            if stripped.startswith("Lua API:"):
                continue
            description_lines.append(stripped)

    lua_example = lua_example.rstrip()
    compact_description = [line for line in description_lines if line != ""]
    if compact_description:
        summary = compact_description[0]
        details = compact_description[1:]

    return LuaFunctionDoc(
        js_name=js_name,
        lua_name=lua_name,
        kind=kind,
        category=category,
        summary=summary,
        details=details,
        lua_params=lua_params,
        lua_returns=lua_returns,
        lua_example=lua_example,
    )


def normalize_model(lua_js_content: str) -> dict[str, Any]:
    """Build normalized API model from registries and JSDoc docs."""
    function_registry = parse_function_registry(lua_js_content)
    callback_registry = parse_callback_registry(lua_js_content)
    constant_registry = parse_constant_registry(lua_js_content)
    docs_by_js_name = parse_jsdoc_blocks(lua_js_content)

    functions: list[dict[str, Any]] = []
    for entry in function_registry:
        js_name = entry["js_name"]
        lua_name = entry["lua_name"]
        if js_name not in docs_by_js_name:
            raise ValueError(f"Missing JSDoc block for function `{js_name}`.")
        doc = docs_by_js_name[js_name]
        if doc.lua_name and doc.lua_name != lua_name:
            raise ValueError(
                f"Mismatched @luaName for `{js_name}`: `{doc.lua_name}` != `{lua_name}`"
            )
        functions.append(
            {
                "lua_name": lua_name,
                "js_name": js_name,
                "kind": doc.kind,
                "category": doc.category,
                "summary": doc.summary,
                "details": doc.details,
                "params": [
                    {
                        "name": param.name,
                        "type": param.type,
                        "description": param.description,
                    }
                    for param in doc.lua_params
                ],
                "returns": doc.lua_returns,
                "example": doc.lua_example,
            }
        )

    callbacks: list[dict[str, Any]] = []
    for entry in callback_registry:
        js_name = entry["js_name"]
        lua_name = entry["lua_name"]
        if js_name not in docs_by_js_name:
            raise ValueError(f"Missing JSDoc block for callback function `{js_name}`.")
        doc = docs_by_js_name[js_name]
        if doc.lua_name and doc.lua_name != lua_name:
            raise ValueError(
                f"Mismatched @luaName for callback `{js_name}`: `{doc.lua_name}` != `{lua_name}`"
            )
        callbacks.append(
            {
                "lua_name": lua_name,
                "js_name": js_name,
                "kind": doc.kind,
                "category": doc.category,
                "summary": doc.summary,
                "details": doc.details,
                "params": [
                    {
                        "name": param.name,
                        "type": param.type,
                        "description": param.description,
                    }
                    for param in doc.lua_params
                ],
                "returns": doc.lua_returns,
                "example": doc.lua_example,
            }
        )

    return {
        "constants": constant_registry,
        "functions": functions,
        "callbacks": callbacks,
    }


def build_markdown(model: dict[str, Any], intro_markdown: str) -> str:
    """Create human-readable API markdown documentation from model."""
    lines: list[str] = [intro_markdown.rstrip(), "", "## Constants", ""]
    lines.append("| Name | Type | Value | Description |")
    lines.append("| --- | --- | --- | --- |")
    for constant in model["constants"]:
        lines.append(
            f"| `{constant['name']}` | {constant['type']} | `{constant['value_expression']}` | {constant['description']} |"
        )

    grouped: dict[str, list[dict[str, Any]]] = {}
    for function in model["functions"]:
        grouped.setdefault(function["category"], []).append(function)

    ordered_categories = sorted(grouped.keys())
    for category in ordered_categories:
        lines.extend(["", f"## {category.capitalize()}", ""])
        for function in grouped[category]:
            signature = build_lua_signature(function)
            lines.append(f"### `{signature}`")
            lines.append("")
            if function["summary"]:
                lines.append(function["summary"])
                lines.append("")
            append_markdown_details(lines, function["details"])
            if function["details"]:
                lines.append("")
            if function["params"]:
                lines.append("Parameters:")
                lines.append("")
                for param in function["params"]:
                    lines.append(
                        f"- `{param['name']}` ({param['type']}): {param['description']}"
                    )
                lines.append("")
            if function["returns"]:
                returns_text = str(function["returns"])
                # Avoid nested backticks: if the returns text already contains
                # inline code markers, don't wrap the whole thing again.
                if "`" in returns_text:
                    lines.append(f"Returns: {returns_text}")
                else:
                    lines.append(f"Returns: `{returns_text}`")
                lines.append("")
            if function["example"]:
                lines.append("Example:")
                lines.append("```lua")
                lines.append(function["example"])
                lines.append("```")
                lines.append("")

    if model.get("callbacks"):
        lines.extend(["", "## Lifecycle callbacks", ""])
        lines.append(
            "The host calls these globals by name if they exist as Lua functions."
        )
        lines.append("")
        for callback in model["callbacks"]:
            signature = build_lua_signature(callback)
            lines.append(f"### `{signature}`")
            lines.append("")
            if callback["summary"]:
                lines.append(callback["summary"])
                lines.append("")
            append_markdown_details(lines, callback["details"])
            if callback["details"]:
                lines.append("")
            if callback["params"]:
                lines.append("Parameters:")
                lines.append("")
                for param in callback["params"]:
                    lines.append(
                        f"- `{param['name']}` ({param['type']}): {param['description']}"
                    )
                lines.append("")
            if callback["returns"]:
                returns_text = str(callback["returns"])
                # Avoid nested backticks: if the returns text already contains
                # inline code markers, don't wrap the whole thing again.
                if "`" in returns_text:
                    lines.append(f"Returns: {returns_text}")
                else:
                    lines.append(f"Returns: `{returns_text}`")
                lines.append("")
            if callback["example"]:
                lines.append("Example:")
                lines.append("```lua")
                lines.append(callback["example"])
                lines.append("```")
                lines.append("")

    return "\n".join(lines).strip() + "\n"


def append_markdown_details(lines: list[str], details: list[str]) -> None:
    """Append detail lines while preserving Markdown list formatting."""
    previous_was_bullet = False
    previous_had_content = False

    for detail in details:
        stripped = detail.strip()
        is_bullet = stripped.startswith("- ") or stripped.startswith("* ")

        # Markdown needs a blank line before starting a list after paragraph text.
        if is_bullet and not previous_was_bullet and previous_had_content:
            lines.append("")

        lines.append(detail)
        previous_was_bullet = is_bullet
        previous_had_content = bool(stripped)


def build_lua_signature(function: dict[str, Any]) -> str:
    """Build a display signature like `set_pixel(x, y, r, g, b)`."""
    param_names = [param["name"] for param in function["params"]]
    return f"{function['lua_name']}({', '.join(param_names)})"


def markdown_to_html(markdown_content: str) -> str:
    """Render markdown to HTML using the `markdown` package."""

    html_body = markdown.markdown(
        markdown_content,
        extensions=["tables", "fenced_code"],
    )
    html_body_with_ids, toc_html = add_heading_ids_and_build_toc(html_body)

    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    rendered = template.replace("{{TOC_HTML}}", toc_html)
    return rendered.replace("{{HTML_BODY}}", html_body_with_ids)


def strip_html_tags(text: str) -> str:
    """Remove HTML tags from a heading fragment."""
    return re.sub(r"<[^>]+>", "", text)


def slugify_heading(text: str) -> str:
    """Convert heading text to a stable URL-friendly id."""
    normalized = unescape(text).strip().lower()
    # Replace punctuation with spaces so tokens don't get merged together.
    normalized = re.sub(r"[^\w\s-]", " ", normalized)
    normalized = re.sub(r"[\s_]+", "-", normalized)
    normalized = normalized.strip("-")
    return normalized or "section"


def add_heading_ids_and_build_toc(html_body: str) -> tuple[str, str]:
    """Add heading ids and build a static TOC from h2/h3 headings."""
    heading_pattern = re.compile(r"<h([23])>(.*?)</h\1>", re.DOTALL)
    slug_counts: dict[str, int] = {}
    toc_entries: list[tuple[int, str, str]] = []

    def replace_heading(match: re.Match[str]) -> str:
        level = int(match.group(1))
        inner_html = match.group(2)
        title = strip_html_tags(inner_html).strip()
        slug_base = slugify_heading(title)
        count = slug_counts.get(slug_base, 0)
        slug_counts[slug_base] = count + 1
        heading_id = slug_base if count == 0 else f"{slug_base}-{count + 1}"
        toc_entries.append((level, title, heading_id))
        return f'<h{level} id="{heading_id}">{inner_html}</h{level}>'

    html_with_ids = heading_pattern.sub(replace_heading, html_body)

    toc_lines = ['<ul class="toc-list">']
    for level, title, heading_id in toc_entries:
        css_class = "toc-level-2" if level == 2 else "toc-level-3"
        toc_lines.append(
            f'  <li class="{css_class}"><a href="#{heading_id}">{title}</a></li>'
        )
    toc_lines.append("</ul>")

    return html_with_ids, "\n".join(toc_lines)


def main() -> None:
    """Generate markdown, HTML, and JSON API artifacts."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    lua_js_content = LUA_JS_PATH.read_text(encoding="utf-8")
    intro_markdown = INTRO_MD_PATH.read_text(encoding="utf-8")
    model = normalize_model(lua_js_content)
    api_markdown = build_markdown(model, intro_markdown)

    API_MD_PATH.write_text(api_markdown, encoding="utf-8")
    API_JSON_PATH.write_text(json.dumps(model, indent=2) + "\n", encoding="utf-8")
    API_HTML_PATH.write_text(markdown_to_html(api_markdown), encoding="utf-8")

    print(f"Wrote {API_MD_PATH.relative_to(ROOT)}")
    print(f"Wrote {API_JSON_PATH.relative_to(ROOT)}")
    print(f"Wrote {API_HTML_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
