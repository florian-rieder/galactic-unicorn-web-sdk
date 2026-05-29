local Vector2 = require "/rogue/vector2.lua"

local NEIGHBOR_POS = {
  Vector2.LEFT,
  Vector2.UP,
  Vector2.RIGHT,
  Vector2.DOWN,
}

-- from: https://stackoverflow.com/a/72784448
local function reverse(tab)
  for i = 1, #tab//2, 1 do
      tab[i], tab[#tab-i+1] = tab[#tab-i+1], tab[i]
  end
  return tab
end

local function reconstruct_path(came_from, current)
  local total_path = {current}

  while came_from[tostring(current)] do
    current = came_from[tostring(current)]
    table.insert(total_path, current)
  end

  return reverse(total_path)
end

local function a_star(start, goal, can_move, heuristic)
  if heuristic == nil then heuristic = Vector2.manhattan_distance end
  if can_move == nil then can_move = function(a,b) return true end end

  -- open_set: tostring(v) -> v
  local open_set = { [tostring(start)] = start }
  -- closed_set: tostring(v) -> true
  local closed_set = {}
  local came_from = {}  -- tostring(v) -> Vector2

  local g_score = {}
  g_score[tostring(start)] = 0

  local f_score = {}
  f_score[tostring(start)] = 0

  while next(open_set) ~= nil do
    -- Get the node in open_set with the lowest f_score
    local cheapest_node = nil
    local cheapest_cost = math.huge
    for ks, v in pairs(open_set) do
      local f = f_score[ks]
      if f ~= nil and f < cheapest_cost then
        cheapest_node = v
        cheapest_cost = f
      end
    end

    local current = cheapest_node

    if current == goal then
      return reconstruct_path(came_from, current)
    end

    open_set[tostring(current)] = nil
    closed_set[tostring(current)] = true

    for _, neighbor_offset in ipairs(NEIGHBOR_POS) do
      local neighbor = current + neighbor_offset
      local neighbor_key = tostring(neighbor)

      if closed_set[neighbor_key] then
        goto continue
      end

      local tentative_g_score = g_score[tostring(current)] + 1
      local neighbor_score = g_score[neighbor_key]

      if can_move(neighbor) and (neighbor_score == nil or tentative_g_score < neighbor_score) then
        came_from[neighbor_key] = current
        g_score[neighbor_key] = tentative_g_score
        f_score[neighbor_key] = tentative_g_score + heuristic(current, goal)

        if open_set[neighbor_key] == nil then
          open_set[neighbor_key] = neighbor
        end
      end

      ::continue::
    end
  end

  return false
end

return a_star
