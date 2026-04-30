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
| `L_TRIGGER` | `q` |
| `R_TRIGGER` | `e` |
| `MENU` | Enter |
| `ESC` | Escape |

