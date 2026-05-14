function setup()
  set_tempo(120)
  set_ticks_per_beat(4)

  load_music("E5:2 B4:1 C5:1 D5:2 C5:1 B4:1 A4:2 A4:1 C5:1 E5:2 D5:1 C5:1 B4:3 C5:1 D5:2 E5:2 C5:2 A4:2 A4:4 D5:2 F5:1 A5:2 G5:1 F5:1 E5:3 C5:1 E5:2 D5:1 C5:1 B4:2 B4:1 C5:1 D5:2 E5:2 C5:2 A4:2 A4:4")
  play_music(true)
end

function on_press(button_name)
  if button_name == "MENU" then 
    if is_music_playing() then
      pause_music()
    else
      resume_music()
    end
  end
end
