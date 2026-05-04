SNAKE_INITIAL_LENGTH = 4
SNAKE_MOVE_DELAY_S = 0.20
SNAKE_INITIAL_DIRECTION = {x=1, y=0} -- Goes to the right
SNAKE_COLOR = rgb(200, 200, 200)
FOOD_COLOR = rgb(255, 0, 0)

snake = {}
snake_direction = SNAKE_INITIAL_DIRECTION
food_position = {x=0, y=0}
time_since_last_move = 0
game_over = false

function setup()
  -- Reset snake
  snake = {}
  snake_direction = SNAKE_INITIAL_DIRECTION

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

function update(dt)
  time_since_last_move = time_since_last_move + dt

  if time_since_last_move < SNAKE_MOVE_DELAY_S then
    return
  end

  -- Move
  new_x = snake[1].x + snake_direction.x
  new_y = snake[1].y + snake_direction.y

  -- Loop around the screen edges
  if new_x < 0 then new_x = SCREEN_W - 1 end
  if new_x > SCREEN_W - 1 then new_x = 0 end
  if new_y < 0 then new_y = SCREEN_H - 1 end
  if new_y > SCREEN_H - 1 then new_y = 0 end

  if is_collision(new_x, new_y) then
    -- Die
    setup()
    return
  end

  -- Insert a new head at the next position
  table.insert(snake, 1, {x = new_x, y = new_y})

  -- Eat food or remove the tail
  if food_position.x == new_x and food_position.y == new_y then
    -- If we ate food, we leave the tail, making the snake longer by 1
    spawn_food()
  else
    -- Remove the tail
    table.remove(snake)
  end

  time_since_last_move = 0
end

function on_press(btn)
  local new_dir = {}

  if btn == "L_LEFT" or btn == "R_LEFT" then new_dir = {x=-1, y=0}
  elseif btn == "L_RIGHT" or btn == "R_RIGHT" then new_dir = {x=1, y=0}
  elseif btn == "L_UP" or btn == "R_UP" then new_dir = {x=0, y=-1}
  elseif btn == "L_DOWN" or btn == "R_DOWN" then new_dir = {x=0, y=1}
  else return end -- Ignore other inputs

  -- Ignore new direction if it is the opposite of the current direction
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

function spawn_food()
  repeat
    food_position.x = math.random(0, SCREEN_W-1)
    food_position.y = math.random(0, SCREEN_H-1)
  until not is_collision(food_position.x, food_position.y)
end

function is_collision(x, y)
  for _, pos in ipairs(snake) do
    if pos.x == x and pos.y == y then
      return true
    end
  end
  return false
end