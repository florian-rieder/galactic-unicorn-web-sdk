local M = {
  value = 50,
  max = 100,
}

function M.draw()
  local percentage = M.value / M.max
  local cell_health = M.max / SCREEN_H

  local full_cells = math.floor(M.value / cell_health)
  local remainder = (M.value - full_cells * cell_health)/cell_health

  for i = 0, SCREEN_H - 1 do
    if i < full_cells then
      set_pixel(19, SCREEN_H - i - 1, rgb(255, 0, 0))
    elseif i == full_cells then
      set_pixel_blend(19, SCREEN_H - i - 1, rgb(math.floor(255), 0, 0), remainder)
    end
  end
end

function M.set_value(value)
  if value > M.max then
    error("value over max " .. value .. " (max " .. M.max .. ")")
  end

  M.value = value
end

function M.set_max(max)
  M.max = max

  if M.max < M.value then
    M.value = M.max
  end
end


if (...) == nil then
  function setup()
    clear()
    M.draw()
  end

  function on_press(btn) 
    if btn == "R_UP" then M.value = M.value + 1
    elseif btn == "R_DOWN" then M.value = M.value - 1 end
    
    if M.value < 0 then M.value = 0
    elseif M.value > M.max then M.value = M.max end

    clear()
    M.draw()
  end
end

return M
