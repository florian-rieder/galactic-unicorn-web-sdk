local Vector2 = require "/rogue/vector2.lua"
local a_star = require "/rogue/astar.lua"

local DEFAULT_HEALTH = 20
local DEFAULT_DAMAGE = 15
local POSSIBLE_MOVE_DIRECTIONS = {Vector2.UP,Vector2.RIGHT,Vector2.DOWN,Vector2.LEFT}
local DETECTION_DISTANCE = 3

local Action = {
  NONE = 0,
  ATTACK = 1,
  MOVE_RANDOM = 2,
  FOLLOW = 3,
}

local Enemy = {}
Enemy.mt = {}
Enemy.mt.__index = Enemy.mt

function Enemy.new(position, health, damage)
  if position == nil then position = Vector2.ZERO end
  if health == nil then health = DEFAULT_HEALTH end
  if damage == nil then damage = DEFAULT_DAMAGE end

  local enemy = {
    pos = position,
    health = health,
    damage = damage,
    dead = false,
    target = player_pos,
    path = nil,
    action_this_turn = Action.NONE,
  }
  setmetatable(enemy, Enemy.mt)
  return enemy
end

-- Make a decision as to what to do this turn
function Enemy.mt:decide()
  local random = math.random()

  local distance_to_player = Vector2.manhattan_distance(player_pos, self.pos)

  if distance_to_player == 1 then
    self.action_this_turn = Action.ATTACK
  elseif distance_to_player <= DETECTION_DISTANCE then
    self.action_this_turn = Action.FOLLOW

    -- Recompute path to player each turn while following, in case the player has moved
    self.path = a_star(self.pos, player_pos, can_move)
    if self.path then
      table.remove(self.path, 1)  -- discard start node (which is the current position)
    end
  -- elseif random < 0.5 then
  --   self.action_this_turn = Action.MOVE_RANDOM
  else
    self.action_this_turn = Action.NONE
  end
end

function Enemy.mt:act()
  if self.action_this_turn == Action.MOVE_RANDOM then
    local direction_index = math.random(4)
    local direction = POSSIBLE_MOVE_DIRECTIONS[direction_index]
    if map.can_move(self.pos + direction) then
      self:move(direction)
    end
  elseif self.action_this_turn == Action.ATTACK then
    player_health = player_health - self.damage
  elseif self.action_this_turn == Action.FOLLOW then
    if self.path == nil then return end
    local next_pos = table.remove(self.path, 1)
    if not map.can_move(next_pos) then return end
    local direction = next_pos - self.pos
    self:move(direction)
  end
end

function Enemy.mt:move(direction)
  self.pos = self.pos + direction
end

function Enemy.mt:attack()
  return math.floor(math.random(self.damage))
end

function Enemy.mt:take_damage(damage)
  self.health = self.health - damage

  if self.health <= 0 then
    self:die()
  end
end

function Enemy.mt:die()
  self.dead = true
end


return Enemy
