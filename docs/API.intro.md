# Lua API (host bindings)

This page is the API available to your Lua script when it runs in the web SDK.
You can use it to draw pixels, read button input, and make interactive mini-games.

If you are new to coding, start with the short example below, run it, then use the
reference sections further down this page when you need details.

## How your script runs

Your script can define these optional functions:

- `setup()`: runs once when you press Run.
- `update(dt)`: runs many times per second. `dt` is elapsed time in seconds.
- `draw()`: runs many times per second to render the current frame.

Think of it like this:

- `setup` = initialize your variables.
- `update` = change your game state.
- `draw` = show that state on the screen.

## Your first tiny script

Paste this and press Run:

```lua
local x = 0
local y = 4

function update(dt)
  x = x + 6 * dt
  if x > SCREEN_W - 1 then
    x = 0
  end
end

function draw()
  clear()
  set_pixel(math.floor(x), y, 255, 100, 40)
end
```

What you should see: one bright pixel moving left-to-right, then restarting.

Why this is useful:

- it shows the loop (`update` and `draw`)
- it uses constants (`SCREEN_W`)
- it introduces time-based motion (`dt`)

## Input basics

Use `is_pressed(button)` for actions that should happen while a key is held.
Use `on_press(button)` for one-time actions when a key is first pressed.

Minimal pattern:

```lua
local x = 10

function update(dt)
  if is_pressed("LEFT_LEFT") then
    x = x - 10 * dt
  end
  if is_pressed("LEFT_RIGHT") then
    x = x + 10 * dt
  end
end
```

## Coordinates and screen model

- Coordinates are `0`-based.
- Top-left is `(0, 0)`.
- Valid `x`: `0 .. SCREEN_W - 1`
- Valid `y`: `0 .. SCREEN_H - 1`
- Screen size is tiny (`20x10`), so many objects are just a few pixels.

## Input key map

These are the default keyboard keys and button names used by `is_pressed`,
`on_press`, and `on_release`.

| Logical button | Keyboard key |
| --- | --- |
| `LEFT_UP` | `w` |
| `LEFT_LEFT` | `a` |
| `LEFT_DOWN` | `s` |
| `LEFT_RIGHT` | `d` |
| `RIGHT_UP` | Arrow Up |
| `RIGHT_LEFT` | Arrow Left |
| `RIGHT_DOWN` | Arrow Down |
| `RIGHT_RIGHT` | Arrow Right |
| `LEFT_TRIGGER` | `q` |
| `RIGHT_TRIGGER` | `e` |
| `MENU` | Enter |
| `ESCAPE` | Escape |

## Common mistakes (quick fixes)

- Nothing changes on screen: make sure you pressed Run after editing.
- You draw but do not see it: check `x`/`y` are inside screen bounds.
- Motion is too fast or too slow: multiply movement by `dt`.
- A key does nothing: use names from the key map exactly (`LEFT_LEFT`, not `LEFT`).
- Script stops with timeout: avoid heavy loops in one frame; spread work over updates.

## Next step

Below this intro is the full API reference (functions, constants, and callbacks).
Use it as lookup while you build.
