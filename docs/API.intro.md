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
  if x > SCREEN_W then
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

- `on_press(button)`: runs once when the button goes down.
- `on_release(button)`: runs once when the button goes up.
- `on_repeat(button)`: runs while held, after a short delay, then at a fixed interval. Does **not** fire on the initial press; use `on_press` for that.
- `is_pressed(button)`: true every frame while the button is held.

**Smooth movement** (slide while held): poll `is_pressed` in `update`:

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

**Stepped movement** (one tile per repeat, e.g. grid cursor): `on_press` for the first step, `on_repeat` for held repeats:

```lua
function on_press(button)
  move_cursor(button)
end

function on_repeat(button)
  move_cursor(button)
end
```

## Coordinates and screen model

- Coordinates are `0`-based.
- Top-left is `(0, 0)`.
- Valid `x`: `0 .. 19`
- Valid `y`: `0 .. 9`

## Input key map

These are the default keyboard keys and button names used by `is_pressed`,
`on_press`, `on_repeat`, and `on_release`.

| Logical button | Keyboard key |
| -------------- | ------------ |
| `L_UP`         | `w`          |
| `L_LEFT`       | `a`          |
| `L_DOWN`       | `s`          |
| `L_RIGHT`      | `d`          |
| `R_UP`         | Arrow Up     |
| `R_LEFT`       | Arrow Left   |
| `R_DOWN`       | Arrow Down   |
| `R_RIGHT`      | Arrow Right  |
| `L_BUMP`       | `q`          |
| `R_BUMP`       | `e`          |
| `MENU`         | `1`          |
| `ESC`          | `2`          |

## Project files

In the browser SDK, your project lives in a **virtual file system** stored locally in the browser.

- Use the **file explorer** on the right to create, upload, rename, and delete files.
- **Save** the file you are editing with Ctrl+S (Windows/Linux) or Cmd+S (macOS).
- Press **Run** to execute whatever is currently open in the editor.

## Loading other Lua files

You can split a game or library across multiple `.lua` files and load them with `require`.

### How to call `require`

Pass the **full path** to the file in the project, replacing `/` with `.` and omitting the `.lua` extension:

```lua
local mylib = require("mygame.lib.mylib") -- Will load /mygame/lib/mylib.lua
```

### What `require` does

- Loads the file, runs it once, and caches the result (standard Lua `package.loaded` behavior).
- If the file ends with `return something`, that value is what `require` gives you (tables are common for shared libraries).
- If the file does not return a value, `require` still succeeds; you mainly get side effects (e.g. defining globals; prefer `return` for libraries).

### Example: main + library

`/mygame/lib/colors.lua`:

```lua
local M = {}

function M.player()
  return rgb(255, 100, 40)
end

return M
```

`/mygame/main.lua`:

```lua
local colors = require("mygame.lib.colors")

function draw()
  clear()
  set_pixel(10, 4, colors.player())
end
```

Create both files in the explorer, open `/main.lua` and press Run.

### What is _not_ available

For sandboxing, only **`require`** can load other Lua files. The following are **not** available in scripts:

- `dofile`
- `loadfile`
- `load`
- `loadstring`

Use the editor + Run for your entry script, and `require("path.to.luafile")` for any other lua script file you might need. To read other kinds of data files, use `read_file()`.

## Common libraries

Common libraries are available in the built-in files, under the `lib` folder. This directory contains many useful shared libraries, such as:

- Vector2 / Vector3
- Set
- Enum
- Tween
- Text
- Math utils
- Music sequencer
- Line / Anti-aliased line

These libraries are currently not documented; explore the Lua scripts and examples to understand how they work !

# API reference
