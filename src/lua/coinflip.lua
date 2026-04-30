local flip = 0
local fps_current = 0
local fps_snapshot
local animating = false

local WHITE = rgb(255, 255, 255)

-- comfort
function line(_x)
  for _y = 2, 7 do
    set_pixel(_x, _y, WHITE)
    set_pixel(_x + 1, _y, WHITE)
  end
end

function head()
  line(10)
end

function tail()
  line(8)
  line(11)
end

function on_press(btn)

  flip = math.random()
  
  fps_snapshot = fps_current
  animating = true

end

function draw()
  fps_current = fps_current + 1
  
  clear()

  if animating then

    if fps_current % 2 == 0 then

      set_pixel(10, 4, WHITE)
      set_pixel(11, 5, WHITE)

    else

      set_pixel(11, 4, WHITE)
      set_pixel(10, 5, WHITE)

    end

    if fps_current > fps_snapshot + 45 then

      animating = false

    end

  else

    if flip < 0.5 then
      head()
    else
      tail()
    end

  end
end