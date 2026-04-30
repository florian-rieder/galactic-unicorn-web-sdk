local SNAKE_INITIAL_LENGTH = 4
local SNAKE_MOVE_DELAY_S = 0.25
local SNAKE_COLOR = rgb(200, 200, 200)
local FOOD_COLOR = rgb(255, 0, 0)

local snake = {}
local snake_direction = {x=1, y=0} -- goes to the right initially
local time_since_last_move = 0
local food_position = {x=0, y=0}

local game_over = false

function setup()
  snake = {}
  snake_direction = {x=1, y=0}

  -- Initialize the snake
  for i = 1, SNAKE_INITIAL_LENGTH do
    local x = SCREEN_W/2 + SNAKE_INITIAL_LENGTH - i
    local y = SCREEN_H/2

    snake[i] = {
      x = x,
      y = y
    }
  end

  -- Initialize food
  spawn_food()
end

function spawn_food()
  repeat
    food_position.x = math.random(0, SCREEN_W-1)
    food_position.y = math.random(0, SCREEN_H-1)
  until not is_collision(food_position.x, food_position.y)
end

function update(dt)

  time_since_last_move = time_since_last_move + dt

  if time_since_last_move < SNAKE_MOVE_DELAY_S then
    return
  end

  -- move
  new_x = snake[1].x + snake_direction.x
  new_y = snake[1].y + snake_direction.y

  if new_x < 0 then new_x = SCREEN_W - 1 end
  if new_x > SCREEN_W - 1 then new_x = 0 end
  if new_y < 0 then new_y = SCREEN_H - 1 end
  if new_y > SCREEN_H - 1 then new_y = 0 end

  if is_collision(new_x, new_y) then
    setup()
    return
  end

  -- insert a new head at the next position
  table.insert(snake, 1, {x = new_x, y = new_y})

  -- remove the tail
  if food_position.x == new_x and food_position.y == new_y then
    spawn_food()
  else
    table.remove(snake)
  end

  time_since_last_move = 0
end

function is_collision(x, y)
  for _, pos in ipairs(snake) do
    if pos.x == x and pos.y == y then
      return true
    end
  end
  return false
end

function on_press(btn)
  local new_dir = {}

  if btn == "L_LEFT" or btn == "R_LEFT" then new_dir = {x=-1, y=0}
  elseif btn == "L_RIGHT" or btn == "R_RIGHT" then new_dir = {x=1, y=0}
  elseif btn == "L_UP" or btn == "R_UP" then new_dir = {x=0, y=-1}
  elseif btn == "L_DOWN" or btn == "R_DOWN" then new_dir = {x=0, y=1}
  else return end -- Ignore other inputs

  -- Check if the new direction is the opposite of the current direction
  if new_dir.x + snake_direction.x == 0 then return end
  if new_dir.y + snake_direction.y == 0 then return end

  snake_direction = new_dir
end

function draw()
  clear()

  -- Draw food
  set_pixel(food_position.x, food_position.y, FOOD_COLOR)

  -- Draw snake
  for _, coords in ipairs(snake) do
    set_pixel(coords.x, coords.y, SNAKE_COLOR)
  end
end