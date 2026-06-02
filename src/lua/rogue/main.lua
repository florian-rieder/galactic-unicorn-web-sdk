-- Main
local Vector2 = require("/lib/vector2.lua")

map = require("/rogue/map.lua") -- Make map a global
local healthbar = require("/rogue/healthbar.lua")
local viewport = require("/rogue/viewport.lua")
local Enemy = require("/rogue/enemy.lua")

local PLAYER_COLOR = rgb(255, 255, 2)
local WALL_COLOR = rgb(191, 191, 191)
local FLOOR_COLOR = rgb(49, 49, 49)
local CORRIDOR_COLOR = rgb(97, 97, 97)
local STAIRCASE_COLOR = rgb(86, 194, 224)
local VOID_COLOR = rgb(0, 0, 0)
local SPECIAL_COLOR = rgb(221, 0, 255)
local ENEMY_COLOR = rgb(178, 28, 28)

local MAX_FLOOR_LEVEL = 8 -- How many floor levels to climb to win
local HEAL_PERCENTAGE = 0.01 -- Heal by this proportion of max health each turn
local HEALTH_MAX = 100


local GameState = {
  PLAYING = 0,
  WON = 1,
  LOST = 2
}

player_pos = Vector2.ZERO -- Make player position a global
-- TODO: Make player an object ?


player_health = HEALTH_MAX

local game_state = GameState.PLAYING


local enemies

local floor_level = 1

function setup()
  game_state = GameState.PLAYING
  player_health = HEALTH_MAX

  generate_floor()

  healthbar.set_max(HEALTH_MAX)
  healthbar.set_value(player_health)
  render()
end

function render()
  if game_state == GameState.LOST then
    fill(rgb(86, 24, 32))
    return
  end

  fill(VOID_COLOR)

  -- Draw map
  for x = 0, SCREEN_W do
    for y = 0, SCREEN_H do
      local screen_pos = Vector2.new(x, y)
      local world_pos = viewport.to_world(screen_pos)
      local tile = map.get_tile(world_pos.x, world_pos.y)

      if tile.discovered then
        if tile.type == TileType.WALL then
          set_pixel(x, y, WALL_COLOR)
        elseif tile.type == TileType.FLOOR then
          set_pixel(x, y, FLOOR_COLOR)
        elseif tile.type == TileType.CORRIDOR then
          set_pixel(x, y, CORRIDOR_COLOR)
        elseif tile.type == TileType.STAIRCASE then
          set_pixel(x, y, STAIRCASE_COLOR)
        elseif tile.type == TileType.SPECIAL then
          set_pixel(x, y, SPECIAL_COLOR)
        end
      end
    end
  end

  -- Draw enemies
  for _, enemy in ipairs(enemies) do
    local tile = map.get_tile(enemy.pos.x, enemy.pos.y)
    local screen_pos = viewport.to_screen(enemy.pos)

    if tile.discovered then
      set_pixel(screen_pos.x, screen_pos.y, ENEMY_COLOR)
    end
  end

  -- Draw player
  screen_player_pos = viewport.to_screen(player_pos)
  set_pixel(screen_player_pos.x, screen_player_pos.y, PLAYER_COLOR)

  -- Draw health bar
  healthbar.draw()
end

function on_press(btn)
  if game_state == GameState.LOST or game_state == GameState.WON then
    -- Reset the game if any key is pressed while the game is over
    setup()
  end


  local direction
  if btn == "L_LEFT" then direction = Vector2.LEFT
  elseif btn == "L_RIGHT" then direction = Vector2.RIGHT
  elseif btn == "L_UP" then direction = Vector2.UP
  elseif btn == "L_DOWN" then direction = Vector2.DOWN
  elseif btn == "R_UP" then player_health = player_health + 1
  elseif btn == "R_DOWN" then player_health = player_health - 1
  elseif btn == "ESC" then take_stairs()
  else return end -- Skip all other input

  if direction then
    move(direction)
  end

  -- garbage collect dead enemies
  local alive = {}
  for _, e in ipairs(enemies) do
    if not e.dead then table.insert(alive, e) end
  end
  enemies = alive

  for _, e in ipairs(enemies) do
    e:decide()
    e:act()
  end

  if player_health <= 0 then 
    player_health = 0
    loose()
    render()
    return
  elseif player_health > HEALTH_MAX then player_health = HEALTH_MAX
  end

  -- Heal each turn
  player_health = math.min(player_health + HEAL_PERCENTAGE * HEALTH_MAX, HEALTH_MAX)

  healthbar.set_value(player_health)

  render()
end

function move(direction)
  local new_player_pos = player_pos + direction

  if not map.can_move(new_player_pos) then return end

  for _, enemy in ipairs(enemies) do
    if enemy.pos == new_player_pos then
      -- If we bump into an enemy, don't move, but instead attack the enemy
      enemy:take_damage(10)
      return
    end
  end

  player_pos = new_player_pos
  map.discover(new_player_pos.x, new_player_pos.y)

  ps = viewport.to_screen(player_pos)
  -- Deadzone
  if ps.x < viewport.deadzone_margin.x or ps.x >= SCREEN_W - viewport.deadzone_margin.x or ps.y < viewport.deadzone_margin.y or ps.y >= SCREEN_H - viewport.deadzone_margin.y then
    viewport.pan(direction)
  end
end

function generate_floor()
  map.generate()

  -- Select starting room
  local start_room = map.get_random_room()
  local start_x = start_room.x + math.random(start_room.width - 1)
  local start_y = start_room.y + math.random(start_room.height - 1)

  enemies = {}
  for id, room in pairs(map.rooms) do
    if room.x ~= start_room.x or room.y ~= start_room.y then 
      local x = room.x + math.random(room.width - 2)
      local y = room.y + math.random(room.height - 2)
      local pos = Vector2.new(x, y)

      local enemy = Enemy.new(pos)
      table.insert(enemies, enemy)
    end
  end

  player_pos.x = start_x
  player_pos.y = start_y
  map.discover(start_x, start_y)

  viewport.pos.x = start_x - math.floor(SCREEN_W / 2)
  viewport.pos.y = start_y - math.floor(SCREEN_H / 2)
end

function take_stairs()
  local tile = map.get_tile(player_pos.x, player_pos.y)

  if tile.type ~= TileType.STAIRCASE then return end

  -- For now just reset the game
  -- TODO: Go to next level, make enemies stronger
  floor_level = floor_level + 1

  if floor_level >= MAX_FLOOR_LEVEL then
    win()
    return
  end

  -- TODO proper next level
  generate_floor()
end

function win()
  game_state = GameState.WIN
end

function loose()
  game_state = GameState.LOST
end

function can_move(destination_pos)
  if not map.can_move(destination_pos) then return false end

  for _, e in ipairs(enemies) do
    if e.pos == destination_pos then return false end
  end

  return true
end
