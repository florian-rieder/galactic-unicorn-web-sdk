-- Pong, the demo: jagged vs smooth, two players.

local COLOR = hsl(0, 0, 0.5)

local PADDLE_HEIGHT = 3
local PADDLE_SPEED  = 12.0
local BALL_SPEED_0  = 9.0
local BALL_SPEED_MAX = 20.0

local LEFT_PADDLE_FACE_X  = 1.0
local RIGHT_PADDLE_FACE_X = SCREEN_W - 2.0

local ball_x, ball_y, ball_vel_x, ball_vel_y
local left_paddle_y, right_paddle_y
local smooth = false -- use subpixel rendering

local SERVE_ANGLES = { -0.50, -0.30, 0.30, 0.50 }

local function serve(horizontal_direction)
  ball_x  = (SCREEN_W - 1) * 0.5
  ball_y  = (SCREEN_H - 1) * 0.5
  local serve_angle_rad = SERVE_ANGLES[math.random(1, 4)]
  ball_vel_x = math.cos(serve_angle_rad) * BALL_SPEED_0 * horizontal_direction
  ball_vel_y = math.sin(serve_angle_rad) * BALL_SPEED_0
end

function setup()
  left_paddle_y = (SCREEN_H - PADDLE_HEIGHT) * 0.5
  right_paddle_y = (SCREEN_H - PADDLE_HEIGHT) * 0.5
  serve(math.random(0, 1) == 0 and 1 or -1)
end

function on_press(key)
  if key == "MENU" then
    smooth = not smooth
  end
end

function update(dt)
  if is_pressed("L_UP")    then left_paddle_y = math.max(0, left_paddle_y - PADDLE_SPEED * dt) end
  if is_pressed("L_DOWN")  then left_paddle_y = math.min(SCREEN_H - PADDLE_HEIGHT, left_paddle_y + PADDLE_SPEED * dt) end
  if is_pressed("R_UP")   then right_paddle_y = math.max(0, right_paddle_y - PADDLE_SPEED * dt) end
  if is_pressed("R_DOWN") then right_paddle_y = math.min(SCREEN_H - PADDLE_HEIGHT, right_paddle_y + PADDLE_SPEED * dt) end

  ball_x = ball_x + ball_vel_x * dt
  ball_y = ball_y + ball_vel_y * dt

  if ball_y < 0 then
    ball_y  = -ball_y
    ball_vel_y = math.abs(ball_vel_y)
  elseif ball_y > SCREEN_H - 1 then
    ball_y  = 2 * (SCREEN_H - 1) - ball_y
    ball_vel_y = -math.abs(ball_vel_y)
  end

  if ball_vel_x < 0 and ball_x < LEFT_PADDLE_FACE_X then
    if ball_y >= left_paddle_y - 0.5 and ball_y <= left_paddle_y + PADDLE_HEIGHT + 0.5 then
      ball_x  = 2 * LEFT_PADDLE_FACE_X - ball_x
      local bounced_speed = math.min(math.abs(ball_vel_x) * 1.06, BALL_SPEED_MAX)
      -- Hit position controls outgoing angle: center is flat, edges deflect more.
      local relative_hit = (ball_y - (left_paddle_y + PADDLE_HEIGHT * 0.5)) / (PADDLE_HEIGHT * 0.5)
      ball_vel_x =  bounced_speed
      ball_vel_y = relative_hit * bounced_speed * 0.8
    end
  end

  if ball_vel_x > 0 and ball_x > RIGHT_PADDLE_FACE_X then
    if ball_y >= right_paddle_y - 0.5 and ball_y <= right_paddle_y + PADDLE_HEIGHT + 0.5 then
      ball_x  = 2 * RIGHT_PADDLE_FACE_X - ball_x
      local bounced_speed = math.min(math.abs(ball_vel_x) * 1.06, BALL_SPEED_MAX)
      local relative_hit = (ball_y - (right_paddle_y + PADDLE_HEIGHT * 0.5)) / (PADDLE_HEIGHT * 0.5)
      ball_vel_x = -bounced_speed
      ball_vel_y = relative_hit * bounced_speed * 0.8
    end
  end

  -- immediately re-serve when the ball leaves the screen.
  if ball_x < 0 then
    serve(-1)
  elseif ball_x > SCREEN_W - 1 then
    serve(1)
  end
end

function draw()
  clear()

  if smooth then
    rect_f(0, left_paddle_y, 1, PADDLE_HEIGHT, COLOR)
    rect_f(SCREEN_W - 1, right_paddle_y, 1, PADDLE_HEIGHT, COLOR)
    set_pixel_f(ball_x, ball_y, COLOR)
  else
    rect(0, math.floor(left_paddle_y + 0.5), 1, PADDLE_HEIGHT, COLOR)
    rect(SCREEN_W - 1, math.floor(right_paddle_y + 0.5), 1, PADDLE_HEIGHT, COLOR)
    set_pixel(math.floor(ball_x + 0.5), math.floor(ball_y + 0.5), COLOR)
  end
end
