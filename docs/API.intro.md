# Lua API documentation

## How your script runs

Your script can define these optional functions:

- `setup()`: runs once when you press Run.
- `update(delta_time)`: runs many times per second, once per frame. `delta_time` is elapsed time since last frame in seconds.
- `draw()`: runs many times per second, once per frame, after `update` to render the current frame.

Think of it like this:

- `setup` = initialize your variables.
- `update` = change your game state.
- `draw` = show that state on the screen.

## Your first tiny script

Paste this and press Run:

```lua
local x = 0
local y = 4

function update(delta_time)
  x = x + 6 * delta_time
  if x > SCREEN_W - 1 then
    x = 0
  end
end

function draw()
  clear()
  set_pixel(math.floor(x), y, rgb(255, 100, 40))
end
```

What you should see: one bright pixel moving left-to-right, then restarting.

## Input basics

Use `is_pressed(button)` for actions that should happen while a key is held.
Use `on_press(button)` for one-time actions when a key is first pressed.

Minimal pattern:

```lua
local x = 10

function update(dt)
  if is_pressed("L_LEFT") then
    x = x - 10 * dt
  end
  if is_pressed("L_RIGHT") then
    x = x + 10 * dt
  end
end
```

## Coordinates and screen model

- Coordinates are `0`-based.
- Top-left is `(0, 0)`.
- Valid `x`: `0 .. 19`
- Valid `y`: `0 .. 9`

## Input key map

These are the default keyboard keys and button names used by `is_pressed`,
`on_press`, and `on_release`.

| Logical button | Keyboard key |
| --- | --- |
| `L_UP` | `w` |
| `L_LEFT` | `a` |
| `L_DOWN` | `s` |
| `L_RIGHT` | `d` |
| `R_UP` | Arrow Up |
| `R_LEFT` | Arrow Left |
| `R_DOWN` | Arrow Down |
| `R_RIGHT` | Arrow Right |
| `L_BUMP` | `q` |
| `R_BUMP` | `e` |
| `MENU` | `1` |
| `ESC` | `2` |

## Project files

In the browser SDK, your project lives in a **virtual file system** stored locally in the browser.

- Use the **file explorer** on the right to create, upload, rename, and delete files.
- Paths always start with `/`, for example `/main.lua` or `/lib/mylib.lua`.
- **Save** the file you are editing with Ctrl+S (Windows/Linux) or Cmd+S (macOS).
- Press **Run** to execute whatever is currently open in the editor.

## Loading other Lua files

You can split a game or library across multiple `.lua` files and load them with **`require`**.

### How to call `require`

Pass the **full path** to the file in the project, including the leading `/` and the `.lua` extension:

```lua
local mylib = require("/lib/mylib.lua")
```

Do not rely on module-style names yet:

```lua
-- Not supported yet (TODO on SDK and firmware):
-- local mylib = require("lib.mylib")
```

### What `require` does

- Loads the file, runs it once, and caches the result (standard Lua `package.loaded` behavior).
- If the file ends with `return something`, that value is what `require` gives you (tables are common for shared libraries).
- If the file does not return a value, `require` still succeeds; you mainly get side effects (e.g. defining globals; prefer `return` for libraries).

### Example: main + library

`/lib/colors.lua`:

```lua
local M = {}

function M.player()
  return rgb(255, 100, 40)
end

return M
```

`/main.lua`:

```lua
local colors = require("/lib/colors.lua")

function draw()
  clear()
  set_pixel(10, 4, colors.player())
end
```

Create both files in the explorer, open `/main.lua` and press Run.

### What is *not* available

For sandboxing, only **`require`** can load other Lua files. These are **not** available in scripts:

- `dofile`
- `loadfile`
- `load` / `loadstring`

Use the editor + Run for your entry script, and `require("/path/to/file.lua")` for everything else.
