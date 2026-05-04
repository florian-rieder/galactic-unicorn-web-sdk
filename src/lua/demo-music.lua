function setup()
  set_tempo(100)
  set_ticks_per_beat(4)
  load_music("E4:2 G4:2 A4:4 0:2 A4:2 G4:2 E4:4 0:2 E4:2 G4:2 A4:2 B4:2 A4:2 G4:2 E4:4 0:4 C5:2 B4:2 A4:2 G4:2 A4:4 0:4")
  play_music(true)
end

function on_press(button_name)
  if button_name == "MENU" then pause_music() end
  if button_name == "ESC" then resume_music() end
end

