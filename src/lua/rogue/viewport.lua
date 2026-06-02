local Vector2 = require("/lib/vector2.lua")

local Viewport = {
  pos = Vector2.ZERO,
  deadzone_margin = Vector2.new(8, 3)
}

function Viewport.to_world(screen_pos)
  local world_coords = screen_pos + Viewport.pos
  return world_coords
end

function Viewport.to_screen(world_pos)
  local screen_coords = world_pos - Viewport.pos
  return screen_coords
end

function Viewport.pan(direction)
  local dir = direction:normalize()
  Viewport.pos = Viewport.pos + dir
end

return Viewport
