local Prim = require("/lib/prim.lua")
local Vector2 = require("/lib/vector2.lua")

MAP_WIDTH = 25
MAP_HEIGHT = 25

local N_SPACE_PARTITIONS = 3
local MINIMUM_ROOM_SIZE = 4

local BLOCK_SIZE = Vector2.new(
  math.floor(MAP_WIDTH / N_SPACE_PARTITIONS),
  math.floor(MAP_HEIGHT / N_SPACE_PARTITIONS)
)

local NEIGHBOR_POS = {
  Vector2.LEFT,
  Vector2.UP,
  Vector2.RIGHT,
  Vector2.DOWN,
}

TileType = {
  VOID = 0,
  WALL = 1,
  FLOOR = 2,
  CORRIDOR = 3,
  STAIRCASE = 4,
  SPECIAL = 5,
}

local M = {
  map = nil,
  rooms = nil
}

local function make_room_id(i,j)
  return i + (j * N_SPACE_PARTITIONS) + 1
end

local function make_tile(type)
  return {
    type = type,
    discovered = false
  }
end

function M.generate()
  M.map = {}

  -- Seed map with empty tiles
  for x = 1, MAP_WIDTH + 1 do
    M.map[x] = {}
    for y = 1, MAP_HEIGHT + 1 do
      M.map[x][y] = make_tile(TileType.VOID)
    end
  end

  M.rooms = {}
  local edges = {}

  -- Choose which room_id will contain the staircase
  local staircase_room_id = math.random(N_SPACE_PARTITIONS * N_SPACE_PARTITIONS)

  -- Generate subdivide map into NxN blocks and make a room in each block
  for i = 0, N_SPACE_PARTITIONS -1 do
    for j = 0, N_SPACE_PARTITIONS -1 do
      local base_x = i * BLOCK_SIZE.x
      local base_y = j * BLOCK_SIZE.y
      local x = math.random(1, BLOCK_SIZE.x - MINIMUM_ROOM_SIZE - 1)
      local y = math.random(1, BLOCK_SIZE.y - MINIMUM_ROOM_SIZE - 1)
      local width = math.random(MINIMUM_ROOM_SIZE, BLOCK_SIZE.x - x - 1)
      local height = math.random(MINIMUM_ROOM_SIZE, BLOCK_SIZE.y - y - 1)

      -- Set the tiles
      for k = 0, width do
        for l = 0, height do
          if k == 0 or k == width or l == 0 or l == height then
            M.set_tile(base_x + x + k, base_y + y + l, make_tile(TileType.WALL))
          else
            M.set_tile(base_x + x + k, base_y + y + l, make_tile(TileType.FLOOR))
          end
        end
      end

      local room_id = make_room_id(i, j)

      local room = {
        x = base_x + x,
        y = base_y + y,
        width = width,
        height = height,
        discovered = false,
        staircase = nil,
      }

      if room_id == staircase_room_id then
        -- Generate staircase
        -- -2 to account for the walls
        local staircase_x = room.x + math.random(room.width - 2) + 1
        local staircase_y = room.y + math.random(room.height - 2) + 1

        M.set_tile(staircase_x, staircase_y, make_tile(TileType.STAIRCASE))

        room.staircase = {
          x = staircase_x,
          y = staircase_y
        }
      end

      M.rooms[room_id] = room


      -- Get adjacent rooms in order to build edges list
      -- Key insight: generate edges as we build; and just do the adjacency with
      -- the room below and the room to the right
      -- In order to get a random arrangement of corridors, we give each edge a random weight
      -- See https://en.wikipedia.org/wiki/Random_minimum_spanning_tree
      local below_i = i
      local below_j = j + 1
      if below_j < N_SPACE_PARTITIONS then
        local adjacent_below_room_id = make_room_id(below_i, below_j)
        table.insert(edges, {
          a = room_id,
          b = adjacent_below_room_id,
          weight = math.random()
        })
      end

      local right_i = i + 1
      local right_j = j
      if right_i < N_SPACE_PARTITIONS then
        local adjacent_right_room_id = make_room_id(right_i, right_j)
        table.insert(edges, {
          a = room_id,
          b = adjacent_right_room_id,
          weight = math.random()
        })
      end
    end
  end

  -- Build vertices list
  local vertices = {}
  for room_id, value in pairs(M.rooms) do
      table.insert(vertices, room_id) -- add room_id to list of vertices (nodes)
  end

  -- Use Prim's algorithm to compute the Minimum Spanning Tree (MST) of our graph
  -- to ensure all rooms are reachable by at least 1 other room
  -- See https://en.wikipedia.org/wiki/Minimum_spanning_tree
  local corridor_edges = Prim(vertices, edges)

  -- Actually make the corridors on the map
  for _, edge in ipairs(corridor_edges) do
    local start_room = M.rooms[edge.a]
    local end_room = M.rooms[edge.b]

    local start_x = start_room.x + math.floor(start_room.width/2)
    local start_y = start_room.y + math.floor(start_room.height/2)
    local end_x = end_room.x + math.floor(end_room.width/2)
    local end_y = end_room.y + math.floor(end_room.height/2)

    local diff_x = start_x - end_x
    local diff_y = start_y - end_y

    -- Connect the two rooms with an L
    local step_x = start_x < end_x and 1 or -1
    for x = start_x, end_x, step_x do
      local tile_type = M.get_tile(x, start_y).type
      if tile_type ~= TileType.FLOOR and tile_type ~= TileType.STAIRCASE then
        M.set_tile(x, start_y, make_tile(TileType.CORRIDOR))
      end
    end

    local step_y = start_y < end_y and 1 or -1
    for y = start_y, end_y, step_y do
      local tile_type = M.get_tile(end_x, y).type
      if tile_type ~= TileType.FLOOR and tile_type ~= TileType.STAIRCASE then
        M.set_tile(end_x, y, make_tile(TileType.CORRIDOR))
      end
    end

  end
end

function M.get_tile(x, y)
  if M.map == nil then return false end
  if x < 0 or x > MAP_WIDTH then return make_tile(TileType.VOID) end
  if y < 0 or y > MAP_HEIGHT then return make_tile(TileType.VOID) end

  return M.map[x + 1][y + 1]
end

function M.set_tile(x, y, tile)
  if M.map == nil then return false end
  if x < 0 or x > MAP_WIDTH then return false end
  if y < 0 or y > MAP_HEIGHT then return false end

  M.map[x + 1][y + 1] = tile
end

function M.get_random_room()
  return M.rooms[math.random(#M.rooms)]
end

function M.get_room_at_pos(x, y)
  -- Cast the position into map block grid coordinates
  local i = math.floor(x / BLOCK_SIZE.x)
  local j = math.floor(y / BLOCK_SIZE.y)
  local room_id = make_room_id(i, j)
  local room = M.rooms[room_id]
  local retval = nil

  -- Only return the room if the position is within the room's boundaries,
  -- otherwise return nil
  if (x >= room.x and x <= room.x + room.width) and
     (y >= room.y and y <= room.y + room.height) then
    retval = room
  end

  return retval
end

function M.discover(x, y)
  local room = M.get_room_at_pos(x, y)

  if room ~= nil and not room.discovered then
    -- Discover the whole room
    for i = room.x, room.x + room.width do
      for j = room.y, room.y + room.height do
        local tile = M.get_tile(i, j)
        tile.discovered = true
      end
    end
  room.discovered = true
  end

  -- Discover neighbors
  for _, pos in pairs(NEIGHBOR_POS) do
    neighbor_x = x + pos.x
    neighbor_y = y + pos.y

    local tile = M.get_tile(neighbor_x, neighbor_y)
    tile.discovered = true
  end
end

function M.can_move(new_pos)
  local tile_on_new_pos = map.get_tile(new_pos.x, new_pos.y)

  -- Movement rules
  if tile_on_new_pos.type == TileType.VOID then return false end
  if tile_on_new_pos.type == TileType.WALL then return false end

  return true
end

return M
