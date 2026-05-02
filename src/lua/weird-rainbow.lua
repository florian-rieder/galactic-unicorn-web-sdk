local FACTOR = 10000
local t = 0
local pause = false
local step = 0.01

function update(dt)
  if pause then return end
  t = t + dt
end

function draw()
  for x = 0, SCREEN_W - 1 do
    for y = 0, SCREEN_H - 1 do
      set_pixel(SCREEN_W - 1 - x, y, hsl(x * y / t * FACTOR , 1, 0.1))
    end
  end
end

function on_press(button)
  if button == "MENU" then pause = not pause
  elseif button == "ESCAPE" then t = 0
  elseif button == "L_LEFT" then t = t - step
  elseif button == "L_RIGHT" then t = t + step
  elseif button == "L_UP" then step = step * 2
  elseif button == "L_DOWN" then step = step / 2
  end
end