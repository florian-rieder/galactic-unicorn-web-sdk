enable_flashes = false
FLASH_CHANCE = 1 -- 1% chance of flashing

function draw()
  local time_interval = ((get_time() * 1000) % 1000) / 1000.0;

  -- C++ NeoPixelBus HslColor uses hue in 0..1; Lua hsl() expects degrees 0..360.
  for i = 0, SCREEN_W - 1 do
    local hue01 = (i / SCREEN_W - time_interval) % 1
    local color = hsl(hue01 * 360, 1, 0.3)

    for j = 0, SCREEN_H - 1 do
      if enable_flashes and math.random(0, 100) < FLASH_CHANCE then
        -- Randomly set color to white for flashes with full brightness
        set_pixel(i, j, rgb(255, 255, 255))
        set_unsafe_pixel_brightness(i, j, 9)
      else
        set_pixel(i, j, color)
      end
    end
  end
end

function on_press(button)
  -- Toggle flashing
  if button == "MENU" then
    enable_flashes = not enable_flashes
  end
end